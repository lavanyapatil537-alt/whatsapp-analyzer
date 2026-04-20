from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
import re
from collections import defaultdict
from pymongo import MongoClient
from bson.objectid import ObjectId

app = Flask(__name__)
CORS(app)

client = MongoClient("mongodb://localhost:27017/")
db = client["whatsapp_analyzer"]
history_collection = db["chat_history"]


# ── Regex patterns ─────────────────────────────────────────────────────────────

# Matches regular user messages — all WhatsApp export variants:
#   Android US:   "1/6/21, 9:00 AM - Name: text"
#   Android intl: "01/06/2021, 09:00 - Name: text"
#   Unicode space: "9:00\u202fAM"  (narrow no-break space before AM/PM)
#   iOS:          "[01/06/2021, 09:00:00 AM] Name: text"
#   En-dash:      "9:00 AM – Name: text"
MSG_RE = re.compile(
    r'[\u200e\u200f\u202a\u202c]*'
    r'\[?'
    r'(\d{1,2}/\d{1,2}/\d{2,4})'
    r'[,\s]\s*'
    r'(\d{1,2}:\d{2})(?::\d{2})?'
    r'[\s\u00a0\u202f]*(?:[AaPp][Mm])?[\s\u00a0\u202f]*'
    r'\]?'
    r'\s*[-\u2013\u2014\u2212]\s*'
    r'([^:]+?):\s'
    r'(.+)',
    re.UNICODE,
)

# Matches join/add system messages — no "sender: text" structure
#   "1/6/21, 9:00 AM - John was added"
#   "1/6/21, 9:00 AM - You added Mary"
#   "1/6/21, 9:00 AM - Mary joined using this group's invite link"
JOIN_RE = re.compile(
    r'[\u200e\u200f\u202a\u202c]*'
    r'\[?'
    r'(\d{1,2}/\d{1,2}/\d{2,4})'
    r'[,\s]\s*\d{1,2}:\d{2}(?::\d{2})?'
    r'[\s\u00a0\u202f]*(?:[AaPp][Mm])?[\s\u00a0\u202f]*'
    r'\]?'
    r'\s*[-\u2013\u2014\u2212]\s*'
    r'.+\b(?:added|joined)\b',
    re.UNICODE | re.IGNORECASE,
)

# Used to extract just the date from any timestamped line
DATE_RE = re.compile(r'[\u200e\u200f\u202a\u202c]*\[?(\d{1,2}/\d{1,2}/\d{2,4})')


def parse_chat(content):
    """
    Parse WhatsApp .txt export.
    Returns:
        messages — list of {date, time, user, text}
        joins    — list of {date}  (one entry per new member event)
    """
    content = content.lstrip('\ufeff')   # strip UTF-8 BOM
    messages, joins = [], []
    unmatched = 0

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue

        m = MSG_RE.match(line)
        if m:
            messages.append({
                "date": m.group(1).strip(),
                "time": m.group(2).strip(),
                "user": m.group(3).strip(),
                "text": m.group(4).strip(),
            })
            continue

        j = JOIN_RE.match(line)
        if j:
            d = DATE_RE.match(line)
            if d:
                joins.append({"date": d.group(1).strip()})
            continue

        unmatched += 1

    print(f"[PARSE] Lines={len(content.splitlines())}  Messages={len(messages)}  "
          f"Joins={len(joins)}  Unmatched={unmatched}")
    if messages:
        print(f"[PARSE] First → {messages[0]['date']}  {messages[0]['time']}  {messages[0]['user']}")
        print(f"[PARSE]  Last → {messages[-1]['date']}  {messages[-1]['time']}  {messages[-1]['user']}")
    else:
        print("[PARSE] *** ZERO messages matched. First 5 lines (repr):")
        for ln in content.splitlines()[:5]:
            print(f"  {repr(ln)}")

    return messages, joins


# ── Date helpers ───────────────────────────────────────────────────────────────

def parse_date(s):
    """Parse a date string, return datetime.date or None."""
    for fmt in ("%d/%m/%y", "%d/%m/%Y", "%m/%d/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def parse_datetime(date_str, time_str):
    """Parse date + time together for accurate first/last message detection."""
    for fmt in ("%d/%m/%y %H:%M", "%d/%m/%Y %H:%M", "%m/%d/%y %H:%M", "%m/%d/%Y %H:%M"):
        try:
            return datetime.strptime(date_str + " " + time_str, fmt)
        except ValueError:
            pass
    # Fall back to date-only
    d = parse_date(date_str)
    return datetime(d.year, d.month, d.day) if d else None


def day_label(d):
    """Short display label — works for both date and datetime objects."""
    return f"{d.day}/{d.month}/{str(d.year)[2:]}"


# ── Analysis ───────────────────────────────────────────────────────────────────

def analyze(messages, joins):
    EMPTY = {
        "labels": [], "active_users": [], "new_joiners": [],
        "total_messages": 0, "unique_participants": 0,
        "top_users": [], "user_stats": {}, "user_messages": {},
        "date_range": {"from": "", "to": ""},
    }

    if not messages:
        return EMPTY

    # ── Step 1: attach date objects to every message ──────────────────────────
    # Use date-only objects for DAY-level grouping (avoids time-component mismatch)
    # Use full datetime only for finding the exact first/last message
    for m in messages:
        m["_date"] = parse_date(m["date"])        # date object for grouping
        m["_dt"]   = parse_datetime(m["date"], m["time"])  # datetime for min/max

    valid = [m for m in messages if m["_date"]]
    if not valid:
        return EMPTY

    # ── Step 2: first and last message (exact datetime) ───────────────────────
    # Prefer messages where full datetime parsed; fall back to date-only ordering.
    dt_valid  = [m for m in valid if m["_dt"]]
    pool      = dt_valid if dt_valid else valid
    first_msg = min(pool, key=lambda m: m["_dt"] if m["_dt"] else datetime(m["_date"].year, m["_date"].month, m["_date"].day))
    last_msg  = max(pool, key=lambda m: m["_dt"] if m["_dt"] else datetime(m["_date"].year, m["_date"].month, m["_date"].day))

    # ── Step 3: exactly 7 consecutive days descending from last activity ─────────
    # e.g. last_date = Feb 12 → [2/12, 2/11, 2/10, 2/9, 2/8, 2/7, 2/6]
    # e.g. last_date = Dec  2 → [12/2, 12/1, 11/30, 11/29, 11/28, 11/27, 11/26]
    last_date    = last_msg["_date"]
    window_dates = [last_date - timedelta(days=i) for i in range(6, -1, -1)]

    labels     = [day_label(d) for d in window_dates]
    window_set = set(window_dates)

    print(f"[ANALYZE] Last date : {last_date}  →  Window : {labels[0]} to {labels[-1]}")

    # ── Step 4: filter messages to the window ─────────────────────────────────
    window_msgs = [m for m in valid if m["_date"] in window_set]
    print(f"[ANALYZE] Messages in window : {len(window_msgs)} / {len(messages)}")

    # ── Step 5: active users per day (unique senders) ─────────────────────────
    active_per_day = {
        d: len(set(m["user"] for m in window_msgs if m["_date"] == d))
        for d in window_dates
    }

    # ── Step 6: new joiners per day ───────────────────────────────────────────
    joiners_per_day = defaultdict(int)
    for j in joins:
        jd = parse_date(j["date"])
        if jd and jd in window_set:
            joiners_per_day[jd] += 1

    # ── Step 7: top 5 users (whole chat) ─────────────────────────────────────
    counts = defaultdict(int)
    for m in messages:
        counts[m["user"]] += 1
    top5 = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:5]

    user_stats    = {}
    user_msgs_map = {}
    for user, total in top5:
        user_ms    = [m for m in valid if m["user"] == user]
        udates     = [m["_date"] for m in user_ms]
        active_days = len(set(udates))
        user_stats[user] = {
            "total_messages": total,
            "active_days":    active_days,
            "avg_per_day":    round(total / active_days, 1) if active_days else 0,
            "first_date":     min(udates).strftime("%d/%m/%y"),
            "last_date":      max(udates).strftime("%d/%m/%y"),
        }
        recent = sorted(user_ms, key=lambda m: m["_dt"] or datetime.min, reverse=True)[:10]
        user_msgs_map[user] = [
            {"date": day_label(m["_date"]) + ", " + m["time"], "text": m["text"]}
            for m in recent
        ]

    result = {
        "labels":              labels,
        "active_users":        [active_per_day[d]    for d in window_dates],
        "new_joiners":         [joiners_per_day[d]   for d in window_dates],
        "total_messages":      len(messages),
        "unique_participants": len(set(m["user"] for m in messages)),
        "top_users":           [{"user": u, "count": c} for u, c in top5],
        "user_stats":          user_stats,
        "user_messages":       user_msgs_map,
        "date_range": {
            "from": day_label(first_msg["_date"]) + ", " + first_msg["time"],
            "to":   day_label(last_msg["_date"])  + ", " + last_msg["time"],
        },
    }

    print(f"[ANALYZE] active_users/day  : {result['active_users']}")
    print(f"[ANALYZE] new_joiners/day   : {result['new_joiners']}")
    print(f"[ANALYZE] Top 5             : {result['top_users']}")
    return result


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route('/ping')
def ping():
    return jsonify({"message": "Flask is working!"})


@app.route('/analyze', methods=['POST'])
def analyze_chat():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "Empty filename"}), 400

    print(f"\n{'='*60}")
    print(f"[REQUEST] {file.filename}")

    try:
        raw = file.read()
        print(f"[REQUEST] {len(raw)} bytes")

        try:
            content = raw.decode('utf-8')
        except UnicodeDecodeError:
            content = raw.decode('latin-1')
            print("[REQUEST] Decoded as latin-1")

        messages, joins = parse_chat(content)

        if not messages:
            return jsonify({
                "error": (
                    "No messages parsed. Check the Flask terminal for repr() "
                    "of the first 5 lines to see the exact file format."
                )
            }), 400

        result = analyze(messages, joins)

        record = {
            "filename":            file.filename,
            "uploaded_at":         datetime.now().strftime("%d/%m/%Y %H:%M"),
            "total_messages":      result["total_messages"],
            "unique_participants": result["unique_participants"],
            "top_users":           result["top_users"],
            "labels":              result["labels"],
            "date_range":          result["date_range"],
        }
        inserted = history_collection.insert_one(record)
        result["_id"] = str(inserted.inserted_id)

        print(f"[REQUEST] OK  _id={result['_id']}")
        print('='*60 + '\n')

        resp = jsonify(result)
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
        return resp

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/history', methods=['GET'])
def get_history():
    try:
        records = list(history_collection.find().sort("_id", -1).limit(20))
        for r in records:
            r["_id"] = str(r["_id"])
        return jsonify(records)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/delete/<id>', methods=['DELETE'])
def delete_record(id):
    try:
        history_collection.delete_one({"_id": ObjectId(id)})
        return jsonify({"message": "Deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)

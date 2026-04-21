from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
import re
import os
from collections import defaultdict
from pymongo import MongoClient
from bson.objectid import ObjectId

app = Flask(__name__)
CORS(app)

MONGO_URI = os.environ.get(
    "MONGO_URI",
    "mongodb+srv://Amanverma:AMAN9118359330@cluster0.dfctv22.mongodb.net/?retryWrites=true&w=majority&appName=Cluster"
)
client = MongoClient(MONGO_URI)
db = client["whatsapp_analyzer"]
history_collection = db["chat_history"]

# Parser helpers for Android and iOS WhatsApp exports.


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
    r'(\d{1,2}/\d{1,2}/\d{2,4})'                  # group 1: date
    r'[,\s]\s*'
    r'(\d{1,2}:\d{2})(?::\d{2})?'                 # group 2: time HH:MM
    r'[\s\u00a0\u202f]*((?:[AaPp][Mm])?)[\s\u00a0\u202f]*'  # group 3: AM/PM or ""
    r'\]?'
    r'\s*[-\u2013\u2014\u2212]\s*'
    r'([^:]+?):\s'                                 # group 4: user
    r'(.+)',                                        # group 5: text
    re.UNICODE,
)

# Matches join/add system messages — no "sender: text" structure.
# Group 1 = date string.  Group 2 = full body text after the dash.
#   "1/6/21, 9:00 AM - John was added"
#   "1/6/21, 9:00 AM - You added Mary"
#   "1/6/21, 9:00 AM - Mary joined using this group's invite link"
JOIN_RE = re.compile(
    r'[\u200e\u200f\u202a\u202c]*'
    r'\[?'
    r'(\d{1,2}/\d{1,2}/\d{2,4})'              # group 1: date
    r'[,\s]\s*\d{1,2}:\d{2}(?::\d{2})?'
    r'[\s\u00a0\u202f]*(?:[AaPp][Mm])?[\s\u00a0\u202f]*'
    r'\]?'
    r'\s*[-\u2013\u2014\u2212]\s*'
    r'(.+\b(?:added|joined)\b.*)',             # group 2: full body
    re.UNICODE | re.IGNORECASE,
)

GROUP_SYSTEM_RE = re.compile(
    r'[\u200e\u200f\u202a\u202c]*'
    r'\[?'
    r'(\d{1,2}/\d{1,2}/\d{2,4})'
    r'[,\s]\s*\d{1,2}:\d{2}(?::\d{2})?'
    r'[\s\u00a0\u202f]*(?:[AaPp][Mm])?[\s\u00a0\u202f]*'
    r'\]?'
    r'\s*[-\u2013\u2014\u2212]\s*'
    r'(.+\b(?:created|this group|group(?:\'s)?|description|icon|subject)\b.*)',
    re.UNICODE | re.IGNORECASE,
)


def extract_joiner(body):
    """
    Return the name of the person who joined from a system message body.

    Handles all WhatsApp join/add variants:
      "Mary joined using this group's invite link"  → "Mary"
      "John was added"                               → "John"
      "Admin added John"  /  "You added Mary"        → "John" / "Mary"
    Returns None if no joiner can be extracted.
    """
    body = body.strip()
    # "X joined [...]"
    m = re.match(r'^(.+?)\s+joined\b', body, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # "X was added"
    m = re.match(r'^(.+?)\s+was\s+added\b', body, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # "X added Y"  →  Y is the new member
    m = re.match(r'^.+?\s+added\s+(.+?)$', body, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None

# Used to extract just the date from any timestamped line
DATE_RE = re.compile(r'[\u200e\u200f\u202a\u202c]*\[?(\d{1,2}/\d{1,2}/\d{2,4})')

CONTROL_CHARS_RE = re.compile(r'[\u200e\u200f\u202a\u202c\u2066-\u2069\ufeff]')
TIMESTAMP_START_RE = re.compile(
    r'^[\u200e\u200f\u202a\u202c\u2066-\u2069\ufeff]*\[?\d{1,2}/\d{1,2}/\d{2,4}',
    re.UNICODE,
)

IOS_MESSAGE_RE = re.compile(
    r'^'
    r'\['
    r'(\d{1,2}/\d{1,2}/\d{2,4})'
    r',\s*'
    r'(\d{1,2}:\d{2})(?::(\d{2}))?'
    r'[\s\u00a0\u202f]*([AaPp][Mm])?'
    r'\]'
    r'\s+'
    r'([^:]+?):\s'
    r'(.*)$',
    re.UNICODE,
)

ANDROID_MESSAGE_RE = re.compile(
    r'^'
    r'(\d{1,2}/\d{1,2}/\d{2,4})'
    r',\s*'
    r'(\d{1,2}:\d{2})(?::(\d{2}))?'
    r'[\s\u00a0\u202f]*([AaPp][Mm])?'
    r'\s*[-\u2013\u2014\u2212]\s*'
    r'([^:]+?):\s'
    r'(.*)$',
    re.UNICODE,
)

IOS_SYSTEM_RE = re.compile(
    r'^'
    r'\['
    r'(\d{1,2}/\d{1,2}/\d{2,4})'
    r',\s*'
    r'(\d{1,2}:\d{2})(?::(\d{2}))?'
    r'[\s\u00a0\u202f]*([AaPp][Mm])?'
    r'\]'
    r'\s+'
    r'(.*)$',
    re.UNICODE,
)

ANDROID_SYSTEM_RE = re.compile(
    r'^'
    r'(\d{1,2}/\d{1,2}/\d{2,4})'
    r',\s*'
    r'(\d{1,2}:\d{2})(?::(\d{2}))?'
    r'[\s\u00a0\u202f]*([AaPp][Mm])?'
    r'\s*[-\u2013\u2014\u2212]\s*'
    r'(.*)$',
    re.UNICODE,
)

JOIN_BODY_RE = re.compile(r'\b(?:added|joined)\b', re.IGNORECASE)
GROUP_SYSTEM_BODY_RE = re.compile(
    r"\b(?:created|this group|group(?:'s)?|description|icon|subject)\b",
    re.IGNORECASE,
)


def normalize_chat_line(line):
    """Remove invisible directional marks that commonly appear in iOS exports."""
    cleaned = CONTROL_CHARS_RE.sub("", line)

    # Some exports arrive with mojibake instead of the original WhatsApp
    # directional markers / narrow no-break spaces.
    cleaned = (
        cleaned
        .replace("\u00e2\u20ac\u017d", "")   # "â€Ž" -> remove LRM mojibake
        .replace("\u00e2\u20ac\u00af", " ")  # "â€¯" -> regular space
    )

    return cleaned.strip()


def parse_message_line(line):
    """
    Parse a single timestamped WhatsApp line.

    We try iOS first because its format is stricter: bracketed timestamp,
    optional seconds, then "Name: text" without the Android dash separator.
    """
    normalized = normalize_chat_line(line)

    for source, message_re, system_re in (
        ("ios", IOS_MESSAGE_RE, IOS_SYSTEM_RE),
        ("android", ANDROID_MESSAGE_RE, ANDROID_SYSTEM_RE),
    ):
        msg_match = message_re.match(normalized)
        if msg_match:
            date_str, time_str, seconds, ampm, user, text = msg_match.groups()
            return "message", {
                "source": source,
                "date": date_str.strip(),
                "time": time_str.strip(),
                "seconds": (seconds or "").strip(),
                "ampm": (ampm or "").strip().upper(),
                "user": user.strip(),
                "text": text.strip(),
            }

        sys_match = system_re.match(normalized)
        if not sys_match:
            continue

        date_str = sys_match.group(1).strip()
        body = sys_match.group(5).strip()

        if JOIN_BODY_RE.search(body):
            joiner = extract_joiner(body)
            if joiner:
                return "join", {
                    "source": source,
                    "date": date_str,
                    "user": joiner,
                    "text": body,
                }

        if GROUP_SYSTEM_BODY_RE.search(body):
            return "group_system", {
                "source": source,
                "date": date_str,
                "text": body,
            }

        return None, None

    return None, None


def parse_chat(content):
    """
    Parse WhatsApp .txt export.
    Returns:
        messages — list of {date, time, user, text}
        joins    — list of {date}  (one entry per new member event)
    """
    content = content.lstrip('\ufeff')   # strip UTF-8 BOM
    raw_lines = content.splitlines()
    messages, joins, group_system_messages = [], [], []
    unmatched_lines = []
    message_count_by_source = defaultdict(int)
    multiline_continuations = 0
    current_message = None

    print("[PARSE] First 5 raw lines (repr):")
    for ln in raw_lines[:5]:
        print(f"  {repr(ln)}")

    for raw_line in raw_lines:
        if not raw_line.strip():
            if current_message:
                current_message["text"] += "\n"
            continue

        kind, payload = parse_message_line(raw_line)
        if kind == "message":
            messages.append(payload)
            current_message = messages[-1]
            message_count_by_source[payload["source"]] += 1
            continue

        if kind == "join":
            joins.append({"date": payload["date"], "user": payload["user"]})
            current_message = None
            continue

        if kind == "group_system":
            group_system_messages.append({
                "date": payload["date"],
                "text": payload["text"],
            })
            current_message = None
            continue

        normalized = normalize_chat_line(raw_line)
        if current_message and normalized and not TIMESTAMP_START_RE.match(normalized):
            current_message["text"] += "\n" + normalized
            multiline_continuations += 1
            continue

        if normalized:
            unmatched_lines.append(normalized)
        current_message = None

    print(
        f"[PARSE] Lines={len(raw_lines)}  Messages={len(messages)}  "
        f"Joins={len(joins)}  GroupSystem={len(group_system_messages)}  "
        f"MultilineContinuations={multiline_continuations}  Unmatched={len(unmatched_lines)}"
    )
    print(
        f"[PARSE] Message sources: Android={message_count_by_source.get('android', 0)}  "
        f"iOS={message_count_by_source.get('ios', 0)}"
    )
    if messages:
        print(f"[PARSE] First → {messages[0]['date']}  {messages[0]['time']}  {messages[0]['user']}")
        print(f"[PARSE]  Last → {messages[-1]['date']}  {messages[-1]['time']}  {messages[-1]['user']}")
    else:
        print("[PARSE] *** ZERO messages matched. First 5 lines (repr):")
        for ln in raw_lines[:5]:
            print(f"  {repr(ln)}")
    if unmatched_lines:
        print("[PARSE] First 5 unmatched normalized lines:")
        for ln in unmatched_lines[:5]:
            print(f"  {repr(ln)}")

    return messages, joins, group_system_messages


# ── Date helpers ───────────────────────────────────────────────────────────────

def is_group_chat(messages, joins, group_system_messages):
    """
    Return True when the export looks like a WhatsApp group chat.

    We treat it as a group if at least 3 distinct senders appear in the
    messages, if group join/add events were detected, or if WhatsApp emitted
    group-only system lines such as group creation or subject changes.
    """
    participants = {m["user"].strip() for m in messages if m.get("user", "").strip()}
    return len(participants) >= 3 or bool(joins) or bool(group_system_messages)


def detect_date_format(date_strings):
    """
    Return 'MM/DD' or 'DD/MM' based on the format used in this chat export.

    Strategy:
    1. If any date has its first component > 12, it must be the day  → DD/MM.
    2. If any date has its second component > 12, it must be the day → MM/DD.
    3. When all components are ≤ 12 (ambiguous), parse the full sample under
       both formats and pick whichever produces the smaller date range — a
       tighter range means the dates cluster naturally, indicating the right
       interpretation (e.g. Apr 1-7 is a 6-day span under MM/DD vs a 181-day
       span under DD/MM).
    """
    sample = [s for s in date_strings if s][:200]

    for s in sample:
        parts = s.split('/')
        if len(parts) < 2:
            continue
        try:
            a, b = int(parts[0]), int(parts[1])
            if a > 12:
                return "DD/MM"
            if b > 12:
                return "MM/DD"
        except (ValueError, IndexError):
            continue

    def parse_all(fmts):
        dates = []
        for s in sample:
            for fmt in fmts:
                try:
                    dates.append(datetime.strptime(s, fmt).date())
                    break
                except ValueError:
                    pass
        return dates

    dd_dates = parse_all(["%d/%m/%y", "%d/%m/%Y"])
    mm_dates = parse_all(["%m/%d/%y", "%m/%d/%Y"])

    if not dd_dates and not mm_dates:
        return "DD/MM"
    if not mm_dates:
        return "DD/MM"
    if not dd_dates:
        return "MM/DD"

    dd_range = (max(dd_dates) - min(dd_dates)).days
    mm_range = (max(mm_dates) - min(mm_dates)).days

    return "MM/DD" if mm_range < dd_range else "DD/MM"


def parse_date(s, date_fmt="DD/MM"):
    """Parse a date string, return datetime.date or None."""
    if date_fmt == "MM/DD":
        fmts = ("%m/%d/%y", "%m/%d/%Y", "%d/%m/%y", "%d/%m/%Y")
    else:
        fmts = ("%d/%m/%y", "%d/%m/%Y", "%m/%d/%y", "%m/%d/%Y")
    for fmt in fmts:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def parse_datetime(date_str, time_str, ampm="", date_fmt="DD/MM"):
    """Parse date + time together for accurate first/last message detection."""
    # Convert 12h → 24h when AM/PM is present so hourly stats are correct
    t = time_str
    if ampm.upper() in ("AM", "PM"):
        try:
            h, mi = map(int, time_str.split(":"))
            if ampm.upper() == "PM" and h != 12:
                h += 12
            elif ampm.upper() == "AM" and h == 12:
                h = 0
            t = f"{h:02d}:{mi:02d}"
        except (ValueError, IndexError):
            pass
    if date_fmt == "MM/DD":
        fmts = ("%m/%d/%y %H:%M", "%m/%d/%Y %H:%M", "%d/%m/%y %H:%M", "%d/%m/%Y %H:%M")
    else:
        fmts = ("%d/%m/%y %H:%M", "%d/%m/%Y %H:%M", "%m/%d/%y %H:%M", "%m/%d/%Y %H:%M")
    for fmt in fmts:
        try:
            return datetime.strptime(date_str + " " + t, fmt)
        except ValueError:
            pass
    d = parse_date(date_str, date_fmt)
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
        "hourly_activity": [0] * 24,
        "msg_types": {"text": 0, "media": 0, "link": 0, "deleted": 0},
    }

    if not messages:
        return EMPTY

    # ── Step 0: detect whether this export uses MM/DD or DD/MM ───────────────
    date_fmt = detect_date_format([m["date"] for m in messages])
    print(f"[ANALYZE] Detected date format: {date_fmt}")

    # ── Step 1: attach date objects to every message ──────────────────────────
    # Use date-only objects for DAY-level grouping (avoids time-component mismatch)
    # Use full datetime only for finding the exact first/last message
    for m in messages:
        m["_date"] = parse_date(m["date"], date_fmt)
        m["_dt"]   = parse_datetime(m["date"], m["time"], m.get("ampm", ""), date_fmt)

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
    # ── Step 6: new joiners per day (pure system-message events) ─────────────
    # Source: JOIN_RE lines only ("X joined", "Y added Z", etc.)
    # Each unique user is counted on the date of their system join event.
    # Silent joiners (never sent a message) ARE included — the system message
    # is the authoritative record of joining, not chat activity.
    # Same user cannot be counted twice (seen_joiners dedup set).
    #
    # Example parse:
    #   "4/1/21, 4:54 AM - +91 68 42122 joined using this group's invite link"
    #   → JOIN_RE matches → extract_joiner("...joined...") → "+91 68 42122"
    #   → date "4/1/21" → counted under April 1
    seen_joiners = set()
    joiners_per_day = defaultdict(int)
    for j in joins:
        user = j.get("user", "").strip()
        if not user:
            continue
        jd = parse_date(j["date"], date_fmt)
        if jd and jd in window_set and user not in seen_joiners:
            seen_joiners.add(user)
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

    # ── Step 8: hourly activity (whole chat, 24 buckets) ─────────────────────
    hourly = defaultdict(int)
    for m in valid:
        if m["_dt"]:
            hourly[m["_dt"].hour] += 1
    hourly_activity = [hourly.get(h, 0) for h in range(24)]

    # ── Step 9: message type breakdown (whole chat) ───────────────────────────
    msg_types = {"text": 0, "media": 0, "link": 0, "deleted": 0}
    for m in messages:
        t = m["text"].strip()
        if re.match(r'<.+omitted>', t, re.IGNORECASE):
            msg_types["media"] += 1
        elif t.lower() in ("this message was deleted", "you deleted this message"):
            msg_types["deleted"] += 1
        elif "http://" in t or "https://" in t:
            msg_types["link"] += 1
        else:
            msg_types["text"] += 1

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
        "hourly_activity": hourly_activity,
        "msg_types":       msg_types,
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

        messages, joins, group_system_messages = parse_chat(content)

        if not messages:
            return jsonify({
                "error": (
                    "No messages parsed. Check the Flask terminal for repr() "
                    "of the first 5 lines to see the exact file format."
                )
            }), 400

        if not is_group_chat(messages, joins, group_system_messages):
            return jsonify({
                "error": (
                    "This analyzer only supports WhatsApp group chat exports. "
                    "Please upload a group chat document, not a one-to-one chat."
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
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)

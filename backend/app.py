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

def parse_chat(content):
    pattern = r'(\d{1,2}/\d{1,2}/\d{2,4}),\s(\d{1,2}:\d{2})\s?(?:AM|PM)?\s?-\s([^:]+?):\s(.+)'
    join_patterns = [
        r'(\d{1,2}/\d{1,2}/\d{2,4}),\s(\d{1,2}:\d{2})\s?(?:AM|PM)?\s?-\s(.+?)\sadded\s(.+)',
        r'(\d{1,2}/\d{1,2}/\d{2,4}),\s(\d{1,2}:\d{2})\s?(?:AM|PM)?\s?-\s(.+?)\sjoined\susing\sthis\sgroup\'s\sinvite\slink',
        r'(\d{1,2}/\d{1,2}/\d{2,4}),\s(\d{1,2}:\d{2})\s?(?:AM|PM)?\s?-\s(.+?)\swas\sadded',
    ]
    messages = []
    joins = []
    for line in content.splitlines():
        joined = False
        for jp in join_patterns:
            join_match = re.match(jp, line)
            if join_match:
                date_str = join_match.group(1)
                try:
                    joined_user = join_match.group(4).strip()
                except:
                    joined_user = join_match.group(3).strip()
                joins.append({"date": date_str, "user": joined_user})
                joined = True
                break
        if not joined:
            msg_match = re.match(pattern, line)
            if msg_match:
                date_str = msg_match.group(1)
                user = msg_match.group(3).strip()
                messages.append({"date": date_str, "user": user})
    return messages, joins


def parse_date(date_str):
    for fmt in ("%m/%d/%y", "%m/%d/%Y", "%d/%m/%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def normalize_date(date_str):
    d = parse_date(date_str)
    if d:
        return str(d.month) + "/" + str(d.day) + "/" + str(d.year)[2:]
    return date_str


def analyze(messages, joins):
    all_dates = []
    for m in messages:
        d = parse_date(m["date"])
        if d:
            all_dates.append(d)
    if not all_dates:
        return {
            "labels": [], "active_users": [], "new_users": [],
            "highly_active_users": [], "total_messages": 0,
            "total_joins": 0, "unique_participants": 0,
            "top_users": [], "user_stats": {}
        }
    last_date = max(all_dates)
    last_7_dates = [(last_date - timedelta(days=i)) for i in range(6, -1, -1)]
    last_7_normalized = [
        str(d.month) + "/" + str(d.day) + "/" + str(d.year)[2:]
        for d in last_7_dates
    ]
    msg_normalized = [
        {"date": normalize_date(m["date"]), "user": m["user"]}
        for m in messages
    ]
    join_normalized = [
        {"date": normalize_date(j["date"]), "user": j["user"]}
        for j in joins
    ]
    active_per_day = {}
    for day in last_7_normalized:
        users_that_day = set(
            m["user"] for m in msg_normalized if m["date"] == day
        )
        active_per_day[day] = len(users_that_day)
    joins_per_day = {}
    for day in last_7_normalized:
        joins_per_day[day] = sum(
            1 for j in join_normalized if j["date"] == day
        )
    user_days = defaultdict(set)
    for m in msg_normalized:
        if m["date"] in last_7_normalized:
            user_days[m["user"]].add(m["date"])
    highly_active = [
        user for user, days in user_days.items() if len(days) >= 4
    ]
    user_msg_count = defaultdict(int)
    for m in messages:
        user_msg_count[m["user"]] += 1
    top_users_list = sorted(
        user_msg_count.items(), key=lambda x: x[1], reverse=True
    )[:5]
    top_users = [{"user": u, "count": c} for u, c in top_users_list]

    user_stats = {}
    for u, _ in top_users_list:
        user_messages = [m for m in messages if m["user"] == u]
        user_dates = []
        for m in user_messages:
            d = parse_date(m["date"])
            if d:
                user_dates.append(d)
        if user_dates:
            active_days = len(
                set(normalize_date(m["date"]) for m in user_messages)
            )
            first_date = min(user_dates).strftime("%d/%m/%y")
            last_date_user = max(user_dates).strftime("%d/%m/%y")
            avg_per_day = round(
                len(user_messages) / active_days, 1
            ) if active_days > 0 else 0
            user_stats[u] = {
                "total_messages": len(user_messages),
                "active_days": active_days,
                "first_date": first_date,
                "last_date": last_date_user,
                "avg_per_day": avg_per_day
            }

    unique_participants = len(set(m["user"] for m in messages))
    return {
        "labels": last_7_normalized,
        "active_users": [active_per_day[d] for d in last_7_normalized],
        "new_users": [joins_per_day[d] for d in last_7_normalized],
        "highly_active_users": highly_active,
        "total_messages": len(messages),
        "total_joins": len(joins),
        "unique_participants": unique_participants,
        "top_users": top_users,
        "user_stats": user_stats
    }


@app.route('/ping')
def ping():
    return jsonify({"message": "Flask is working!"})


@app.route('/analyze', methods=['POST'])
def analyze_chat():
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400
    try:
        content = file.read().decode('utf-8')
        messages, joins = parse_chat(content)
        result = analyze(messages, joins)
        record = {
            "filename": file.filename,
            "uploaded_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
            "total_messages": result["total_messages"],
            "total_joins": result["total_joins"],
            "unique_participants": result["unique_participants"],
            "top_users": result["top_users"],
            "user_stats": result["user_stats"],
            "labels": result["labels"],
            "active_users": result["active_users"],
            "new_users": result["new_users"],
            "highly_active_users": result["highly_active_users"]
        }
        inserted = history_collection.insert_one(record)
        result["_id"] = str(inserted.inserted_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/history', methods=['GET'])
def get_history():
    try:
        records = list(history_collection.find().sort("_id", -1))
        for r in records:
            r["_id"] = str(r["_id"])
        return jsonify(records)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/delete/<id>', methods=['DELETE'])
def delete_record(id):
    try:
        history_collection.delete_one({"_id": ObjectId(id)})
        return jsonify({"message": "Deleted successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
    
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const API = "http://localhost:5000";

// ── UserCard ──────────────────────────────────────────────────────────────────
function UserCard({ user, rank }) {
  const [open, setOpen] = useState(false);

  const COLORS = ["#C07D30", "#7B7BCC", "#7B7BCC", "#7B7BCC", "#7B7BCC"];
  const color  = COLORS[rank] ?? "#7B7BCC";
  // Backend returns newest-first; display as-is (most recent message at top)
  const msgs   = user.recentMsgs ?? [];

  return (
    <div style={{
      background: "#1a1a2e",
      border: `1px solid ${open ? "#534AB7" : "#333"}`,
      borderRadius: 12, padding: 20, minWidth: 180, flex: 1,
    }}>
      {/* Rank badge + name + count */}
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: color,
          color: "#fff", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 20, fontWeight: 700,
          margin: "0 auto 8px",
        }}>
          {rank + 1}
        </div>
        <div style={{ color: "#ccc", fontSize: 12, wordBreak: "break-all", lineHeight: 1.4 }}>
          {user.user}
        </div>
        <div style={{ color, fontSize: 26, fontWeight: 700, marginTop: 4 }}>
          {user.count}
        </div>
        <div style={{ color: "#888", fontSize: 12 }}>messages</div>
      </div>

      {/* Quick stats */}
      {user.stats && (
        <div style={{ fontSize: 12, color: "#888", lineHeight: 2, marginBottom: 4 }}>
          {[
            ["Active days", user.stats.active_days, "#7B7BCC"],
            ["Avg / day",   user.stats.avg_per_day,  "#7B7BCC"],
            ["Last seen",   user.stats.last_date,     null],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{lbl}</span>
              <span style={col ? { color: col } : {}}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", marginTop: 8, padding: "8px 0",
          background: open ? "#534AB7" : "#2a2a4a",
          color: "#fff", border: "none", borderRadius: 6,
          cursor: "pointer", fontSize: 12,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}
      >
        <span style={{ fontSize: 9 }}>{open ? "▲" : "▼"}</span>
        {open ? "Hide History" : "Chat History"}
      </button>

      {/* Message history dropdown */}
      {open && (
        <div style={{
          marginTop: 8, maxHeight: 200, overflowY: "auto",
          background: "#0d0f1a", borderRadius: 6, padding: 8,
          borderTop: "1px solid #2a2d3e",
        }}>
          {msgs.length === 0 ? (
            <p style={{ color: "#555", fontSize: 11, textAlign: "center", margin: "8px 0" }}>
              No messages found.
            </p>
          ) : (
            msgs.map((msg, i) => (
              <div key={i} style={{
                marginBottom: 8, paddingBottom: 8,
                borderBottom: i < msgs.length - 1 ? "1px solid #1a1d2e" : "none",
              }}>
                <div style={{ color: "#555", fontSize: 10 }}>{msg.date}</div>
                <div style={{ color: "#ccc", fontSize: 12, lineHeight: 1.4, wordBreak: "break-word" }}>
                  {msg.text}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}


// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  // Increments on every successful upload → used as key on results div
  // so React fully unmounts + remounts the entire results section, guaranteeing
  // no stale child state (UserCard open/close, chart data, etc.) can carry over.
  const [uploadKey, setUploadKey] = useState(0);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log(`[Upload] ▶ file="${file.name}"  size=${file.size} bytes`);

    // Reset all state before the new request
    setData(null);
    setError(null);
    setLoading(true);

    const form = new FormData();
    form.append("file", file);   // key must match request.files["file"] in Flask

    try {
      const res = await fetch(`${API}/analyze`, {
        method: "POST",
        body: form,
        cache: "no-store",   // prevent browser / proxy returning a cached response
      });

      console.log(`[Upload] HTTP ${res.status}`);
      const json = await res.json();
      console.log("[Upload] Response fields:", {
        _id:                json._id,
        total_messages:     json.total_messages,
        unique_participants:json.unique_participants,
        top_users:          json.top_users,
        error:              json.error,
      });

      if (!res.ok || json.error) {
        setError(json.error || `Server error (${res.status})`);
        e.target.value = "";
        setLoading(false);
        return;
      }

      // Build chart data: one entry per day label
      const chartData = (json.labels ?? []).map((date, i) => ({
        date,
        activeUsers: json.active_users?.[i] ?? 0,
        newJoiners:  json.new_joiners?.[i]  ?? 0,
      }));

      // Merge top_users + user_stats + user_messages into card objects
      const top5 = (json.top_users ?? []).map(u => ({
        user:       u.user,
        count:      u.count,
        stats:      json.user_stats?.[u.user]    ?? null,
        recentMsgs: json.user_messages?.[u.user] ?? [],
      }));

      console.log("[Upload] top5:", top5.map(u => `${u.user}(${u.count})`));

      setUploadKey(k => k + 1);   // force full remount of results section
      setData({
        _id:           json._id,
        totalMessages: json.total_messages,
        totalUsers:    json.unique_participants,
        chatStarted:   json.date_range?.from ?? "",
        lastActivity:  json.date_range?.to   ?? "",
        chartData,
        top5,
      });

    } catch (err) {
      console.error("[Upload] Network error:", err);
      setError("Cannot reach server. Is Flask running on port 5000?");
    }

    setLoading(false);
    e.target.value = "";   // reset so the same file can be re-selected
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#fff", fontFamily: "sans-serif" }}>

      {/* Header */}
      <div style={{
        padding: "16px 32px", borderBottom: "1px solid #222",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <h1 style={{ margin: 0, color: "#7B7BCC", fontSize: 22 }}>WhatsApp Chat Analyzer</h1>
          <p style={{ margin: 0, color: "#666", fontSize: 13 }}>Last 7 days of activity</p>
        </div>
        {data && (
          <div style={{
            background: "#1a1a2e", border: "1px solid #333",
            padding: "6px 16px", borderRadius: 20, fontSize: 13, color: "#ccc",
          }}>
            {data.totalMessages} messages · {data.totalUsers} users
          </div>
        )}
      </div>

      <div style={{ padding: "40px 32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Upload zone */}
        <div style={{
          border: "2px dashed #333", borderRadius: 12,
          padding: "60px 40px", textAlign: "center", marginBottom: 48,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
          <h2 style={{ color: "#7B7BCC", marginBottom: 8 }}>Upload Chat Export</h2>
          <p style={{ color: "#666", marginBottom: 24 }}>
            Export a WhatsApp group chat as .txt and upload it here
          </p>
          <label style={{
            background: "#534AB7", color: "#fff",
            padding: "12px 32px", borderRadius: 8, cursor: "pointer", fontSize: 15,
          }}>
            Choose File
            <input
              type="file"
              accept=".txt"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </label>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", color: "#7B7BCC", padding: 40 }}>
            Parsing chat file…
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: "#2a1010", border: "1px solid #500",
            color: "#f88", borderRadius: 8, padding: 16, marginBottom: 24,
          }}>
            {error}
          </div>
        )}

        {/* Results — key=uploadKey forces React to fully unmount + remount this
            entire section on every new upload, so no stale data can survive. */}
        {data && !loading && (
          <div key={uploadKey}>

            {/* Summary stats */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16, marginBottom: 32,
            }}>
              {[
                { label: "TOTAL MESSAGES",      value: data.totalMessages, color: "#a78bfa", small: false },
                { label: "UNIQUE PARTICIPANTS",  value: data.totalUsers,    color: "#60a5fa", small: false },
                { label: "CHAT STARTED",         value: data.chatStarted  || "—", color: "#34d399", small: true },
                { label: "LAST ACTIVITY",        value: data.lastActivity || "—", color: "#f97316", small: true },
              ].map((s, i) => (
                <div key={i} style={{
                  background: "#1a1a2e", borderRadius: 12,
                  padding: 20, border: "1px solid #2a2d3e",
                }}>
                  <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6b7280", letterSpacing: 1 }}>
                    {s.label}
                  </p>
                  <p style={{ margin: 0, fontSize: s.small ? 16 : 28, fontWeight: 700, color: s.color, lineHeight: 1.4 }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Bar chart — last 7 days */}
            <div style={{
              background: "#1a1a2e", borderRadius: 12,
              padding: 24, marginBottom: 40,
            }}>
              <h3 style={{ marginTop: 0 }}>Activity — Last 7 Days</h3>
              <p style={{ color: "#666", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
                Blue = active users &nbsp;|&nbsp; Green = new members joined (0 if none)
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="date" stroke="#666" tick={{ fill: "#666", fontSize: 11 }} />
                  <YAxis stroke="#666" tick={{ fill: "#666", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ color: "#999", fontSize: 13 }} />
                  <Bar dataKey="activeUsers" name="Active Users"    fill="#5B8AF5" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="newJoiners"  name="New Joiners"     fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top 5 user cards */}
            <h3 style={{ marginBottom: 4 }}>Top 5 Most Active Users</h3>
            <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
              Click "Chat History" to view the user's most recent messages.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              {data.top5.map((user, i) => (
                // key includes uploadKey so each card remounts on every new file
                <UserCard key={`${uploadKey}-${user.user}`} user={user} rank={i} />
              ))}
            </div>

          </div>
        )}
      </div>

      <div style={{ textAlign: "center", color: "#333", padding: 24, fontSize: 12 }}>
        2026 WhatsApp Insights Engine — Developed using React & Flask
      </div>
    </div>
  );
}

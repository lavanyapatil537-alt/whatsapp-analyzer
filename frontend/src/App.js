import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const FADE_IN = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
`;

const anim = (delay = 0) => ({
  animation: `fadeInUp 0.5s ease ${delay}s both`,
});

const API = "https://whatsapp-analyzer-sm9z.onrender.com";

const DARK = {
  bg: "#0f0f1a",
  card: "#17192a",
  cardBorder: "#2a2d3e",
  headerBorder: "#25283a",
  text: "#ffffff",
  subtext: "#d1d5db",
  muted: "#8b93a7",
  mutedAlt: "#a5adbf",
  statLabel: "#8a91a4",
  chartGrid: "#25283a",
  chartAxis: "#8b93a7",
  chartLegend: "#a5adbf",
  tooltipBg: "#111322",
  tooltipBorder: "#34384c",
  uploadBorder: "#434965",
  cardToggleOff: "#242844",
  msgHistoryBg: "#101321",
  msgHistoryBorder: "#2a2d3e",
  msgDivider: "#24283a",
  msgDate: "#94a3b8",
  pillBg: "#17192a",
  pillBorder: "#34384c",
  pillText: "#d1d5db",
  footerText: "#6b7280",
};

const LIGHT = {
  bg: "#f0f4fc",
  card: "#ffffff",
  cardBorder: "#e2e8f0",
  headerBorder: "#dbe3ef",
  text: "#1a1a2e",
  subtext: "#334155",
  muted: "#64748b",
  mutedAlt: "#94a3b8",
  statLabel: "#64748b",
  chartGrid: "#e5e7eb",
  chartAxis: "#94a3b8",
  chartLegend: "#64748b",
  tooltipBg: "#ffffff",
  tooltipBorder: "#dbe3ef",
  uploadBorder: "#cbd5e1",
  cardToggleOff: "#ede9fe",
  msgHistoryBg: "#f8fafc",
  msgHistoryBorder: "#e2e8f0",
  msgDivider: "#edf2f7",
  msgDate: "#64748b",
  pillBg: "#ffffff",
  pillBorder: "#e2e8f0",
  pillText: "#334155",
  footerText: "#94a3b8",
};

const ACCENT = "#6d5ef6";
const ACCENT_SOFT = "#8b7fff";
const INFO = "#38bdf8";
const SUCCESS = "#22c55e";
const WARNING = "#f97316";

function formatDateLabel(value) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getCardShadow(theme) {
  return theme.card === DARK.card
    ? "0 20px 40px rgba(0, 0, 0, 0.24)"
    : "0 18px 36px rgba(15, 23, 42, 0.08)";
}

function UserCard({ user, rank, theme }) {
  const [open, setOpen] = useState(false);

  const colors = ["#c0843d", ACCENT_SOFT, INFO, "#fb7185", SUCCESS];
  const color = colors[rank] ?? ACCENT_SOFT;
  const msgs = user.recentMsgs ?? [];

  return (
    <div style={{
      background: theme.card,
      border: `1px solid ${open ? ACCENT : theme.cardBorder}`,
      borderRadius: 20,
      padding: 20,
      width: 240,
      minWidth: 240,
      flex: "0 0 240px",
      boxShadow: getCardShadow(theme),
      transition: "background 0.3s, border 0.3s, transform 0.2s",
    }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: color,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 700,
          margin: "0 auto 10px",
        }}>
          {rank + 1}
        </div>
        <div style={{ color: theme.subtext, fontSize: 14, wordBreak: "break-word", lineHeight: 1.5 }}>
          {user.user}
        </div>
        <div style={{ color, fontSize: 28, fontWeight: 800, marginTop: 8 }}>
          {user.count}
        </div>
        <div style={{ color: theme.mutedAlt, fontSize: 13 }}>messages</div>
      </div>

      {user.stats && (
        <div style={{ fontSize: 13, color: theme.mutedAlt, lineHeight: 1.9, marginBottom: 10 }}>
          {[
            ["Active days", user.stats.active_days, ACCENT_SOFT],
            ["Avg / day", user.stats.avg_per_day, ACCENT_SOFT],
            ["Last seen", formatDateLabel(user.stats.last_date), null],
          ].map(([label, value, highlight]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{label}</span>
              <span style={highlight ? { color: highlight, fontWeight: 600 } : { color: theme.subtext }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen((current) => !current)}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "10px 0",
          background: open ? ACCENT : theme.cardToggleOff,
          color: open ? "#fff" : theme.text,
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          transition: "background 0.2s",
        }}
      >
        <span style={{ fontSize: 9 }}>{open ? "▲" : "▼"}</span>
        {open ? "Hide Recent Messages" : "Recent Messages"}
      </button>

      {open && (
        <div style={{
          marginTop: 10,
          maxHeight: 220,
          overflowY: "auto",
          background: theme.msgHistoryBg,
          borderRadius: 12,
          padding: 10,
          borderTop: `1px solid ${theme.msgHistoryBorder}`,
        }}>
          {msgs.length === 0 ? (
            <p style={{ color: theme.muted, fontSize: 12, textAlign: "center", margin: "10px 0" }}>
              No messages found.
            </p>
          ) : (
            msgs.map((msg, index) => (
              <div
                key={index}
                style={{
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottom: index < msgs.length - 1 ? `1px solid ${theme.msgDivider}` : "none",
                }}
              >
                <div style={{ color: theme.msgDate, fontSize: 12, marginBottom: 4 }}>
                  {formatDateLabel(msg.date)}
                </div>
                <div style={{ color: theme.subtext, fontSize: 13, lineHeight: 1.5, wordBreak: "break-word" }}>
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

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dark, setDark] = useState(true);
  const [uploadKey, setUploadKey] = useState(0);

  const theme = dark ? DARK : LIGHT;
  const surfaceShadow = getCardShadow(theme);
  const panelBg = dark
    ? "linear-gradient(180deg, rgba(23,25,42,0.98) 0%, rgba(16,19,33,0.98) 100%)"
    : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)";

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log(`[Upload] ▶ file="${file.name}"  size=${file.size} bytes`);

    setData(null);
    setError(null);
    setLoading(true);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API}/analyze`, {
        method: "POST",
        body: form,
        cache: "no-store",
      });

      console.log(`[Upload] HTTP ${res.status}`);
      const json = await res.json();
      console.log("[Upload] Response fields:", {
        _id: json._id,
        total_messages: json.total_messages,
        unique_participants: json.unique_participants,
        top_users: json.top_users,
        error: json.error,
      });

      if (!res.ok || json.error) {
        setError(json.error || `Server error (${res.status})`);
        e.target.value = "";
        setLoading(false);
        return;
      }

      const chartData = (json.labels ?? []).map((date, i) => ({
        date: formatDateLabel(date),
        activeUsers: json.active_users?.[i] ?? 0,
        newJoiners: json.new_joiners?.[i] ?? 0,
      }));

      const hourLabel = (h) =>
        h === 0 ? "12AM" : h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`;
      const hourlyData = (json.hourly_activity ?? []).map((count, h) => ({
        hour: hourLabel(h), messages: count,
      }));

      const typeColors = {
        Text: "#5b8af5",
        Media: ACCENT_SOFT,
        Links: SUCCESS,
        Deleted: WARNING,
      };
      const msgTypeData = json.msg_types
        ? Object.entries({
            Text: json.msg_types.text,
            Media: json.msg_types.media,
            Links: json.msg_types.link,
            Deleted: json.msg_types.deleted,
          })
            .filter(([, value]) => value > 0)
            .map(([name, value]) => ({ name, value, color: typeColors[name] }))
        : [];

      const top5 = (json.top_users ?? []).map((u) => ({
        user: u.user,
        count: u.count,
        stats: json.user_stats?.[u.user] ?? null,
        recentMsgs: json.user_messages?.[u.user] ?? [],
      }));

      console.log("[Upload] top5:", top5.map((u) => `${u.user}(${u.count})`));

      setUploadKey((key) => key + 1);
      setData({
        _id: json._id,
        totalMessages: json.total_messages,
        totalUsers: json.unique_participants,
        chatStarted: formatDateLabel(json.date_range?.from ?? ""),
        lastActivity: formatDateLabel(json.date_range?.to ?? ""),
        chartData,
        hourlyData,
        msgTypeData,
        top5,
      });
    } catch (err) {
      console.error("[Upload] Network error:", err);
      setError("Cannot reach server. Is Flask running on port 5000?");
    }

    setLoading(false);
    e.target.value = "";
  }

  const tooltipStyle = {
    background: theme.tooltipBg,
    border: `1px solid ${theme.tooltipBorder}`,
    borderRadius: 12,
    color: theme.text,
    fontSize: 13,
    boxShadow: surfaceShadow,
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: dark
        ? "radial-gradient(circle at top, rgba(109,94,246,0.22) 0%, rgba(15,15,26,1) 38%)"
        : "radial-gradient(circle at top, rgba(109,94,246,0.10) 0%, rgba(240,244,252,1) 38%)",
      color: theme.text,
      fontFamily: "'Segoe UI', 'Inter', sans-serif",
      transition: "background 0.3s, color 0.3s",
    }}>
      <div style={{
        padding: "20px clamp(20px, 4vw, 40px)",
        borderBottom: `1px solid ${theme.headerBorder}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
        background: dark ? "rgba(22, 24, 38, 0.78)" : "rgba(255, 255, 255, 0.82)",
        backdropFilter: "blur(14px)",
        transition: "background 0.3s",
      }}>
        <div>
          <h1 style={{ margin: 0, color: ACCENT_SOFT, fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 800, letterSpacing: -0.6 }}>
            WhatsApp Group Chat Analyzer
          </h1>
          <p style={{ margin: "6px 0 0", color: theme.subtext, fontSize: 14, lineHeight: 1.5 }}>
            Upload a WhatsApp group chat export to explore participation, activity trends, and recent conversations.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {data && (
            <div style={{
              background: theme.pillBg,
              border: `1px solid ${theme.pillBorder}`,
              padding: "8px 16px",
              borderRadius: 999,
              fontSize: 13,
              color: theme.pillText,
              fontWeight: 600,
            }}>
              {data.totalMessages} messages · {data.totalUsers} participants
            </div>
          )}

          <button
            onClick={() => setDark((current) => !current)}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: dark ? "#232744" : "#e0e7ff",
              border: `1px solid ${dark ? "#444" : "#c7d2fe"}`,
              borderRadius: 999,
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "background 0.2s",
            }}
          >
            {dark ? "☀️" : "🌙"}
            <span style={{ fontSize: 12, color: dark ? "#cbd5e1" : "#4338ca", fontWeight: 700 }}>
              {dark ? "Light" : "Dark"}
            </span>
          </button>
        </div>
      </div>

      <div style={{ padding: "clamp(24px, 5vw, 48px) clamp(20px, 4vw, 32px)", maxWidth: 1240, margin: "0 auto" }}>
        <div style={{
          border: `2px dashed ${theme.uploadBorder}`,
          borderRadius: 24,
          padding: "clamp(32px, 7vw, 64px) clamp(20px, 5vw, 48px)",
          textAlign: "center",
          marginBottom: 40,
          background: panelBg,
          boxShadow: surfaceShadow,
          transition: "background 0.3s",
        }}>
          <div style={{ fontSize: 42, marginBottom: 16 }}>💬</div>
          <h2 style={{ color: ACCENT_SOFT, margin: "0 0 10px", fontSize: "clamp(24px, 4vw, 30px)" }}>
            Upload Chat Export
          </h2>
          <p style={{ color: theme.subtext, margin: "0 auto 10px", maxWidth: 620, fontSize: 15, lineHeight: 1.6 }}>
            Export a WhatsApp group chat as a <code style={{ fontFamily: "inherit" }}>.txt</code> file and upload it here to generate the dashboard.
          </p>
          <p style={{ color: theme.muted, margin: "0 auto 28px", maxWidth: 620, fontSize: 13, lineHeight: 1.6 }}>
            Best results come from plain text exports. Media files are not required.
          </p>
          <label style={{
            background: ACCENT,
            color: "#fff",
            padding: "14px 30px",
            borderRadius: 12,
            cursor: "pointer",
            fontSize: 15,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 12px 24px rgba(109, 94, 246, 0.24)",
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

        {loading && (
          <div style={{ textAlign: "center", color: ACCENT_SOFT, padding: 40, fontSize: 15, fontWeight: 600 }}>
            Parsing chat file...
          </div>
        )}

        {error && (
          <div style={{
            background: dark ? "#2a1010" : "#fff1f2",
            border: `1px solid ${dark ? "#500" : "#fca5a5"}`,
            color: dark ? "#f88" : "#dc2626",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Upload error</div>
            {error}
          </div>
        )}

        {data && !loading && (
          <div key={uploadKey}>
            <style>{FADE_IN}</style>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginBottom: 32,
            }}>
              {[
                { label: "TOTAL MESSAGES", value: data.totalMessages, color: ACCENT_SOFT, small: false },
                { label: "UNIQUE PARTICIPANTS", value: data.totalUsers, color: INFO, small: false },
                { label: "FIRST MESSAGE", value: data.chatStarted || "—", color: SUCCESS, small: true },
                { label: "LATEST ACTIVITY", value: data.lastActivity || "—", color: WARNING, small: true },
              ].map((stat, index) => (
                <div
                  key={index}
                  style={{
                    background: panelBg,
                    borderRadius: 18,
                    padding: 22,
                    border: `1px solid ${theme.cardBorder}`,
                    boxShadow: surfaceShadow,
                    transition: "background 0.3s",
                    ...anim(index * 0.08),
                  }}
                >
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: theme.statLabel, letterSpacing: 1.1, fontWeight: 700 }}>
                    {stat.label}
                  </p>
                  <p style={{ margin: 0, fontSize: stat.small ? 18 : 32, fontWeight: 800, color: stat.color, lineHeight: 1.35 }}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div style={{
              background: panelBg,
              borderRadius: 24,
              padding: 24,
              marginBottom: 32,
              border: `1px solid ${theme.cardBorder}`,
              boxShadow: surfaceShadow,
              transition: "background 0.3s",
              ...anim(0.35),
            }}>
              <h3 style={{ marginTop: 0, marginBottom: 6, color: theme.text, fontSize: 22 }}>
                Activity in the Last 7 Days
              </h3>
              <p style={{ color: theme.subtext, fontSize: 14, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
                Compare daily participation with members who joined during the same period.
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
                  <XAxis dataKey="date" stroke={theme.chartAxis} tick={{ fill: theme.chartAxis, fontSize: 12 }} />
                  <YAxis stroke={theme.chartAxis} tick={{ fill: theme.chartAxis, fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(label) => `Date: ${label}`}
                    formatter={(value, name) => [
                      value.toLocaleString(),
                      name === "Active Participants" ? "Active Participants" : "New Participants",
                    ]}
                  />
                  <Legend wrapperStyle={{ color: theme.chartLegend, fontSize: 13, paddingTop: 8 }} />
                  <Bar dataKey="activeUsers" name="Active Participants" fill="#5b8af5" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="newJoiners" name="New Participants" fill={SUCCESS} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 24,
              marginBottom: 40,
            }}>
              <div style={{
                background: panelBg,
                borderRadius: 24,
                padding: 24,
                border: `1px solid ${theme.cardBorder}`,
                boxShadow: surfaceShadow,
                transition: "background 0.3s",
                ...anim(0.45),
              }}>
                <h3 style={{ marginTop: 0, marginBottom: 4, color: theme.text, fontSize: 20 }}>
                  Messages by Hour
                </h3>
                <p style={{ color: theme.subtext, fontSize: 14, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
                  Spot the busiest hours in the chat across the day.
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.hourlyData} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
                    <XAxis dataKey="hour" stroke={theme.chartAxis} tick={{ fill: theme.chartAxis, fontSize: 12 }} interval={2} />
                    <YAxis stroke={theme.chartAxis} tick={{ fill: theme.chartAxis, fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label) => `Hour: ${label}`}
                      formatter={(value) => [value.toLocaleString(), "Messages"]}
                    />
                    <Bar dataKey="messages" fill={ACCENT_SOFT} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{
                background: panelBg,
                borderRadius: 24,
                padding: 24,
                border: `1px solid ${theme.cardBorder}`,
                display: "flex",
                flexDirection: "column",
                boxShadow: surfaceShadow,
                transition: "background 0.3s",
                ...anim(0.55),
              }}>
                <h3 style={{ marginTop: 0, marginBottom: 4, color: theme.text, fontSize: 20 }}>
                  Message Types
                </h3>
                <p style={{ color: theme.subtext, fontSize: 14, marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
                  Breakdown of text, media, links, and deleted messages.
                </p>
                {data.msgTypeData.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: theme.muted }}>
                    No data
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, flexWrap: "wrap" }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={data.msgTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          dataKey="value"
                          paddingAngle={3}
                        >
                          {data.msgTypeData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value, name) => [value.toLocaleString(), name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      {data.msgTypeData.map((entry) => (
                        <div
                          key={entry.name}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: entry.color,
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: theme.subtext, fontSize: 14 }}>{entry.name}</span>
                          </div>
                          <span style={{ color: entry.color, fontWeight: 700, fontSize: 15 }}>
                            {entry.value.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <h3 style={{ marginBottom: 4, color: theme.text, fontSize: 22, ...anim(0.65) }}>
              Top 5 Most Active Users
            </h3>
            <p style={{ color: theme.subtext, fontSize: 14, marginBottom: 20, lineHeight: 1.5, ...anim(0.7) }}>
              Open a card to view that participant&apos;s most recent messages and quick activity stats.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "nowrap", alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
              {data.top5.map((user, index) => (
                <UserCard key={`${uploadKey}-${user.user}`} user={user} rank={index} theme={theme} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", color: theme.footerText, padding: 24, fontSize: 12 }}>
        2026 WhatsApp Insights Engine - Developed using React and Flask
      </div>
    </div>
  );
}

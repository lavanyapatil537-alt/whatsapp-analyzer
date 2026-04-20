import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer, Legend
} from "recharts";

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [visibleUserStats, setVisibleUserStats] = useState({});

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/history");
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.log("Could not fetch history");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFilename(file.name);
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("http://127.0.0.1:5000/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.error) setError(data.error);
      else {
        setResult(data);
        setVisibleUserStats({});
        fetchHistory();
      }
    } catch (err) {
      setError("Could not connect to server. Make sure Flask is running.");
    }
    setLoading(false);
  };

  const handleHideFromDisplay = (id) => {
    setHiddenIds([...hiddenIds, id]);
  };

  const handleHistoryClick = (record) => {
    setResult(record);
    setFilename(record.filename);
    setShowHistory(false);
    setVisibleUserStats({});
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setFilename("");
    setVisibleUserStats({});
  };

  const toggleUserStats = (username) => {
    setVisibleUserStats(prev => ({
      ...prev,
      [username]: !prev[username]
    }));
  };

  const clearUserStats = (username) => {
    setVisibleUserStats(prev => ({
      ...prev,
      [username]: false
    }));
  };

  const visibleHistory = history.filter(r => !hiddenIds.includes(r._id));

  const chartData = result
    ? result.labels.map((label, i) => ({
        date: label,
        "Active Users": result.active_users[i],
        "New Joins": result.new_users[i],
      }))
    : [];

  const getUserStats = (username) => {
    if (!result || !result.user_stats) return null;
    return result.user_stats[username];
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f1a", color: "#fff", fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#1a1d2e", padding: "16px 32px", borderBottom: "1px solid #2a2d3e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "bold", background: "linear-gradient(90deg, #a78bfa, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            WhatsApp Chat Analyzer
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>Visualizing community growth and user engagement</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {filename && (
            <span style={{ fontSize: "12px", color: "#6b7280", background: "#0d0f1a", padding: "5px 12px", borderRadius: "20px", border: "1px solid #2a2d3e" }}>
              {filename}
            </span>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{ padding: "8px 16px", background: showHistory ? "#7c3aed" : "#1a1d2e", border: "1px solid #7c3aed", borderRadius: "8px", color: "#a78bfa", fontSize: "13px", cursor: "pointer" }}
          >
            Chat History ({visibleHistory.length})
          </button>
          {result && (
            <button
              onClick={handleReset}
              style={{ padding: "8px 16px", background: "#1a1d2e", border: "1px solid #3a3d4e", borderRadius: "8px", color: "#9ca3af", fontSize: "13px", cursor: "pointer" }}
            >
              New Analysis
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "24px" }}>

        {/* History Panel */}
        {showHistory && (
          <div style={{ background: "#1a1d2e", border: "1px solid #2a2d3e", borderRadius: "12px", padding: "20px", marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px", color: "#a78bfa" }}>Chat History</h2>
              <span style={{ fontSize: "12px", color: "#6b7280" }}>Delete removes from display only — data stays in database</span>
            </div>
            {visibleHistory.length === 0 ? (
              <p style={{ color: "#6b7280", fontSize: "13px" }}>No history to show.</p>
            ) : (
              visibleHistory.map((record) => (
                <div key={record._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#0d0f1a", borderRadius: "8px", marginBottom: "8px", border: "1px solid #2a2d3e" }}>
                  <div style={{ cursor: "pointer", flex: 1 }} onClick={() => handleHistoryClick(record)}>
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: "500", color: "#e5e7eb" }}>{record.filename}</p>
                    <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#6b7280" }}>
                      Uploaded: {record.uploaded_at} &nbsp;|&nbsp;
                      Messages: {record.total_messages} &nbsp;|&nbsp;
                      Participants: {record.unique_participants} &nbsp;|&nbsp;
                      Joins: {record.total_joins}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginLeft: "16px" }}>
                    <button
                      onClick={() => handleHistoryClick(record)}
                      style={{ padding: "6px 14px", background: "#1a1d2e", border: "1px solid #7c3aed", borderRadius: "6px", color: "#a78bfa", fontSize: "12px", cursor: "pointer" }}
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleHideFromDisplay(record._id)}
                      style={{ padding: "6px 14px", background: "#1a1d2e", border: "1px solid #ef4444", borderRadius: "6px", color: "#ef4444", fontSize: "12px", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Upload Screen */}
        {!result && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
            <div style={{ background: "#1a1d2e", border: "2px dashed #3a3d4e", borderRadius: "16px", padding: "60px 80px", textAlign: "center", width: "100%", maxWidth: "500px" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>💬</div>
              <h2 style={{ fontSize: "20px", color: "#a78bfa", marginBottom: "8px" }}>Upload Chat Export</h2>
              <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "28px" }}>Export a WhatsApp group chat as .txt and upload it here</p>
              <label style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", padding: "12px 28px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}>
                Choose File
                <input type="file" accept=".txt" onChange={handleFileUpload} style={{ display: "none" }} />
              </label>
              {loading && <p style={{ color: "#a78bfa", marginTop: "20px" }}>Analyzing your chat...</p>}
              {error && <p style={{ color: "#f87171", marginTop: "16px", fontSize: "13px" }}>{error}</p>}
            </div>
          </div>
        )}

        {/* Dashboard */}
        {result && (
          <>
            {/* Stats Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "20px" }}>
              {[
                { label: "TOTAL MESSAGES", value: result.total_messages, color: "#a78bfa", icon: "💬" },
                { label: "UNIQUE PARTICIPANTS", value: result.unique_participants, color: "#60a5fa", icon: "👥" },
                { label: "NEW MEMBERS JOINED", value: result.total_joins, color: "#34d399", icon: "➕" },
                { label: "LAST ACTIVITY", value: result.labels[result.labels.length - 1], color: "#f97316", icon: "📅" },
              ].map((stat, i) => (
                <div key={i} style={{ background: "#1a1d2e", borderRadius: "12px", padding: "20px", border: "1px solid #2a2d3e" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <p style={{ margin: 0, fontSize: "11px", color: "#6b7280", letterSpacing: "1px" }}>{stat.label}</p>
                    <span>{stat.icon}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "30px", fontWeight: "bold", color: stat.color }}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Chart + Power Users */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "16px", marginBottom: "16px" }}>
              <div style={{ background: "#1a1d2e", borderRadius: "12px", padding: "24px", border: "1px solid #2a2d3e" }}>
                <p style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: "bold" }}>Activity for Last 7 Days</p>
                <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#6b7280" }}>Blue = active users &nbsp;|&nbsp; Orange = new joins</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
                    <XAxis dataKey="date" stroke="#4b5563" tick={{ fill: "#6b7280", fontSize: 11 }} />
                    <YAxis stroke="#4b5563" tick={{ fill: "#6b7280", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#1a1d2e", border: "1px solid #3a3d4e", borderRadius: "8px" }} labelStyle={{ color: "#a78bfa" }} />
                    <Legend wrapperStyle={{ color: "#9ca3af", fontSize: "13px" }} />
                    <Bar dataKey="Active Users" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="New Joins" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "#1a1d2e", borderRadius: "12px", padding: "24px", border: "1px solid #2a2d3e" }}>
                <p style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: "bold" }}>Top Power Users</p>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#6b7280" }}>Active 4+ out of last 7 days</p>
                {result.highly_active_users.length === 0 ? (
                  <p style={{ color: "#6b7280", fontSize: "13px" }}>No power users found.</p>
                ) : (
                  result.highly_active_users.map((user, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#0d0f1a", borderRadius: "8px", marginBottom: "8px", border: "1px solid #2a2d3e" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#4c1d95", border: "2px solid #7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "#a78bfa", flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <span style={{ fontSize: "13px", color: "#d1d5db" }}>
                        {user.length > 18 ? user.substring(0, 18) + "..." : user}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top 5 Users with View Stats / Clear View buttons */}
            {result.top_users && result.top_users.length > 0 && (
              <div style={{ background: "#1a1d2e", borderRadius: "12px", padding: "24px", border: "1px solid #2a2d3e" }}>
                <p style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: "bold" }}>Top 5 Most Active Users</p>
                <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#6b7280" }}>Click "View Stats" to see a user's activity. "Clear View" hides it from display only.</p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
                  {result.top_users.map((u, i) => {
                    const isGold = i === 0;
                    const stats = getUserStats(u.user);
                    const isVisible = visibleUserStats[u.user];

                    return (
                      <div key={i} style={{ background: "#0d0f1a", borderRadius: "10px", border: `1px solid ${isGold ? "#f59e0b" : "#2a2d3e"}`, overflow: "hidden" }}>

                        {/* User Card Top */}
                        <div style={{ padding: "16px", textAlign: "center", borderBottom: "1px solid #2a2d3e" }}>
                          <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: isGold ? "#713f12" : "#4c1d95", border: `2px solid ${isGold ? "#f59e0b" : "#7c3aed"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: isGold ? "#f59e0b" : "#a78bfa", margin: "0 auto 10px", fontWeight: "bold" }}>
                            {i + 1}
                          </div>
                          <p style={{ margin: "0 0 4px", fontSize: "12px", color: "#e5e7eb", wordBreak: "break-all", lineHeight: "1.4" }}>
                            {u.user.length > 14 ? u.user.substring(0, 14) + "..." : u.user}
                          </p>
                          <p style={{ margin: "0 0 2px", fontSize: "22px", fontWeight: "bold", color: isGold ? "#f59e0b" : "#a78bfa" }}>{u.count}</p>
                          <p style={{ margin: 0, fontSize: "11px", color: "#6b7280" }}>messages</p>
                        </div>

                        {/* Buttons */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#2a2d3e" }}>
                          <button
                            onClick={() => toggleUserStats(u.user)}
                            style={{ padding: "8px 4px", background: isVisible ? "#4c1d95" : "#0d0f1a", border: "none", color: isVisible ? "#c4b5fd" : "#a78bfa", fontSize: "11px", cursor: "pointer", fontWeight: "500" }}
                          >
                            {isVisible ? "Hide Stats" : "View Stats"}
                          </button>
                          <button
                            onClick={() => clearUserStats(u.user)}
                            style={{ padding: "8px 4px", background: "#0d0f1a", border: "none", color: "#ef4444", fontSize: "11px", cursor: "pointer", fontWeight: "500" }}
                          >
                            Clear View
                          </button>
                        </div>

                        {/* Stats Panel */}
                        {isVisible && stats && (
                          <div style={{ padding: "12px", background: "#0d0f1a", borderTop: "1px solid #2a2d3e" }}>
                            <div style={{ marginBottom: "8px" }}>
                              <p style={{ margin: "0 0 2px", fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>Total Messages</p>
                              <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: isGold ? "#f59e0b" : "#a78bfa" }}>{stats.total_messages}</p>
                            </div>
                            <div style={{ marginBottom: "8px" }}>
                              <p style={{ margin: "0 0 2px", fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>Active Days</p>
                              <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#60a5fa" }}>{stats.active_days}</p>
                            </div>
                            <div style={{ marginBottom: "8px" }}>
                              <p style={{ margin: "0 0 2px", fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>First Message</p>
                              <p style={{ margin: 0, fontSize: "12px", color: "#d1d5db" }}>{stats.first_date}</p>
                            </div>
                            <div style={{ marginBottom: "8px" }}>
                              <p style={{ margin: "0 0 2px", fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>Last Message</p>
                              <p style={{ margin: 0, fontSize: "12px", color: "#d1d5db" }}>{stats.last_date}</p>
                            </div>
                            <div>
                              <p style={{ margin: "0 0 2px", fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>Avg/Day</p>
                              <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#34d399" }}>{stats.avg_per_day}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p style={{ textAlign: "center", padding: "20px", fontSize: "12px", color: "#374151", borderTop: "1px solid #1a1d2e" }}>
        2026 WhatsApp Insights Engine — Developed using React & Flask
      </p>
    </div>
  );
}

export default App;
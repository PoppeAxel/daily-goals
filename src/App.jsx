import { useState, useEffect, useCallback } from "react";

// ─── Theme ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#0F0F13", card: "#17171E", cardAlt: "#1E1E28",
  accent: "#C8F45A", accentDim: "#8FAA2E",
  text: "#F0EFE8", muted: "#6B6B7A", border: "#2A2A36",
  orange: "#FF9A3C", blue: "#5C9EFF", purple: "#C45CFF", red: "#FF5C5C",
};
const CAT_COLOR = { habit: "#C8F45A", task: "#5C9EFF", goal: "#FF9A3C", schedule: "#C45CFF" };
const CAT_LABEL = { habit: "Habit", task: "Task", goal: "Goal", schedule: "Scheduled" };
const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://dufxxgxzhsmqqadnhynj.supabase.co";
const SUPABASE_KEY = "sb_publishable_k96cEJP4b19hjTQ4b10PQA_vFHW64Wx";

const sb = async (path, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const DB = {
  getItems: () => sb("items?select=*"),
  addItem: (item) => sb("items", { method: "POST", body: JSON.stringify(item) }),
  updateItem: (id, item) => sb(`items?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(item) }),
  deleteItem: (id) => sb(`items?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal", headers: { "Prefer": "return=minimal" } }),

  getHistory: () => sb("history?select=*"),
  upsertHistory: (row) => sb("history", { method: "POST", body: JSON.stringify(row), headers: { "Prefer": "resolution=merge-duplicates,return=representation" } }),

  getStreaks: () => sb("streaks?select=*"),
  upsertStreak: (row) => sb("streaks", { method: "POST", body: JSON.stringify(row), headers: { "Prefer": "resolution=merge-duplicates,return=representation" } }),
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
const dateKey = (d = new Date()) => d.toISOString().slice(0, 10);
const todayKey = () => dateKey();
const weekStart = (d = new Date()) => {
  const day = d.getDay(), diff = (day === 0 ? -6 : 1) - day;
  const s = new Date(d); s.setDate(d.getDate() + diff); s.setHours(0,0,0,0); return s;
};
const getDayIdx = (d = new Date()) => { const day = d.getDay(); return day === 0 ? 6 : day - 1; };

// ─── Local cache helpers ──────────────────────────────────────────────────────
const LS = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Notifications ────────────────────────────────────────────────────────────
const scheduleNotifications = (items) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (window._notifTimers) window._notifTimers.forEach(clearTimeout);
  window._notifTimers = [];
  const now = new Date();
  items.forEach(item => {
    const t = item.reminderTime || item.time;
    if (!t) return;
    const [h, m] = t.split(":").map(Number);
    const fire = new Date(); fire.setHours(h, m, 0, 0);
    const ms = fire - now;
    if (ms <= 0) return;
    window._notifTimers.push(setTimeout(() => {
      new Notification("⏰ Daily Goals", { body: `Time for: ${item.title}` });
    }, ms));
  });
};

const requestNotifPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
};

// ─── Icon ─────────────────────────────────────────────────────────────────────
function Icon({ name, size = 20, color = C.text }) {
  const p = {
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>,
    plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>,
    home: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={1.5}/><line x1="16" y1="2" x2="16" y2="6" strokeWidth={2} strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" strokeWidth={2} strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" strokeWidth={1.5}/></>,
    x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>,
    clock: <><circle cx="12" cy="12" r="10" strokeWidth={1.5}/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2"/></>,
    target: <><circle cx="12" cy="12" r="10" strokeWidth={1.5}/><circle cx="12" cy="12" r="6" strokeWidth={1.5}/><circle cx="12" cy="12" r="2" strokeWidth={2}/></>,
    bell: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></>,
    cloud: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>{p[name]}</svg>;
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function ItemModal({ item, onSave, onClose }) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title || "");
  const [category, setCategory] = useState(item?.category || "habit");
  const [time, setTime] = useState(item?.time || "");
  const [target, setTarget] = useState(item?.target || "");
  const [reminderTime, setReminderTime] = useState(item?.reminderTime || "");

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), category, time: time || null, target: target || null, reminderTime: reminderTime || null });
    onClose();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"flex-end", zIndex:100 }}>
      <div style={{ background:C.card, borderRadius:"24px 24px 0 0", padding:"28px 24px 44px", width:"100%", boxSizing:"border-box" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <span style={{ fontFamily:"'DM Serif Display',Georgia,serif", fontSize:22, color:C.text }}>{isEdit ? "Edit Goal" : "New Goal"}</span>
          <button onClick={onClose} style={{ background:C.cardAlt, border:"none", borderRadius:"50%", width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
            <Icon name="x" size={18} color={C.muted}/>
          </button>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What's your goal?"
          style={{ width:"100%", background:C.cardAlt, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", color:C.text, fontSize:16, fontFamily:"inherit", boxSizing:"border-box", outline:"none", marginBottom:14 }} autoFocus/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9, marginBottom:14 }}>
          {Object.entries(CAT_LABEL).map(([key, label]) => (
            <button key={key} onClick={() => setCategory(key)} style={{
              background: category===key ? CAT_COLOR[key]+"22" : C.cardAlt,
              border: `1.5px solid ${category===key ? CAT_COLOR[key] : C.border}`,
              borderRadius:10, padding:"10px 14px", color: category===key ? CAT_COLOR[key] : C.muted,
              fontSize:14, fontFamily:"inherit", cursor:"pointer", fontWeight:500,
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:10, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:5, letterSpacing:0.8, textTransform:"uppercase" }}>Time</div>
            <input value={time} onChange={e => setTime(e.target.value)} type="time"
              style={{ width:"100%", background:C.cardAlt, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 12px", color: time ? C.text : C.muted, fontSize:14, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:5, letterSpacing:0.8, textTransform:"uppercase" }}>Reminder</div>
            <input value={reminderTime} onChange={e => setReminderTime(e.target.value)} type="time"
              style={{ width:"100%", background:C.cardAlt, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 12px", color: reminderTime ? C.text : C.muted, fontSize:14, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }}/>
          </div>
        </div>
        <input value={target} onChange={e => setTarget(e.target.value)} placeholder="Target or deadline (optional)"
          style={{ width:"100%", background:C.cardAlt, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:C.text, fontSize:14, fontFamily:"inherit", boxSizing:"border-box", outline:"none", marginBottom:18 }}/>
        <button onClick={handleSave} style={{ width:"100%", background:C.accent, border:"none", borderRadius:14, padding:"16px", color:"#0F0F13", fontSize:16, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>
          {isEdit ? "Save Changes" : "Add Goal"}
        </button>
      </div>
    </div>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────
function GoalCard({ item, done, streak, weekHist, onToggle, onEdit, onDelete }) {
  const color = CAT_COLOR[item.category];
  const [showActions, setShowActions] = useState(false);
  return (
    <div style={{ background: done ? C.cardAlt : C.card, border:`1px solid ${done ? C.border : color+"33"}`, borderRadius:18, padding:"14px 16px", marginBottom:10, opacity: done ? 0.7 : 1, transition:"all 0.2s" }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
        <button onClick={() => onToggle(item.id)} style={{
          width:28, height:28, borderRadius:"50%", flexShrink:0,
          border:`2px solid ${done ? color : C.border}`, background: done ? color : "transparent",
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", marginTop:3,
        }}>{done && <Icon name="check" size={14} color="#0F0F13"/>}</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
            <span style={{ fontSize:15, fontWeight:500, color: done ? C.muted : C.text, textDecoration: done ? "line-through" : "none", fontFamily:"'DM Serif Display',Georgia,serif", lineHeight:1.3 }}>
              {item.title}
            </span>
            <div style={{ display:"flex", gap:5, alignItems:"center", flexShrink:0 }}>
              <span style={{ fontSize:10, fontWeight:600, color, background:color+"18", borderRadius:20, padding:"3px 8px", letterSpacing:0.5, textTransform:"uppercase" }}>
                {CAT_LABEL[item.category]}
              </span>
              <button onClick={() => setShowActions(!showActions)} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, padding:"0 3px", fontSize:18, lineHeight:1 }}>⋯</button>
            </div>
          </div>
          <div style={{ display:"flex", gap:12, marginTop:6, flexWrap:"wrap" }}>
            {item.time && <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:C.muted }}><Icon name="clock" size={11} color={C.muted}/>{item.time}</span>}
            {streak > 0 && <span style={{ fontSize:12, color:C.orange }}>🔥 {streak}d streak</span>}
            {item.target && <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:C.muted }}><Icon name="target" size={11} color={C.muted}/>{item.target}</span>}
            {item.reminderTime && <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:C.purple }}><Icon name="bell" size={11} color={C.purple}/>{item.reminderTime}</span>}
          </div>
          {weekHist && (
            <div style={{ display:"flex", gap:3, marginTop:10 }}>
              {WEEKDAYS.map((day, i) => {
                const isToday = i === getDayIdx();
                return (
                  <div key={day} style={{ textAlign:"center" }}>
                    <div style={{ width:24, height:24, borderRadius:6, background: isToday ? color : weekHist[i] ? color+"55" : C.border, border: isToday ? `2px solid ${color}` : "none", marginBottom:2 }}/>
                    <span style={{ fontSize:8, color: isToday ? color : C.muted }}>{day}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {showActions && (
        <div style={{ display:"flex", gap:8, marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
          <button onClick={() => { onEdit(item); setShowActions(false); }}
            style={{ flex:1, background:C.cardAlt, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px", color:C.text, fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>✏️ Edit</button>
          <button onClick={() => onDelete(item.id)}
            style={{ flex:1, background:"#FF5C5C11", border:"1px solid #FF5C5C44", borderRadius:10, padding:"9px", color:C.red, fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>🗑 Delete</button>
        </div>
      )}
    </div>
  );
}

// ─── Heatmap cell ─────────────────────────────────────────────────────────────
function HeatCell({ pct, label, isToday }) {
  const alpha = pct === null ? 0 : Math.min(255, Math.round(60 + pct * 195)).toString(16).padStart(2,"0");
  const bg = pct === null ? C.border : pct === 0 ? C.cardAlt : `${C.accent}${alpha}`;
  return <div title={label} style={{ width:14, height:14, borderRadius:3, background:bg, border: isToday ? `1.5px solid ${C.accent}` : "none", flexShrink:0 }}/>;
}

// ─── History View ─────────────────────────────────────────────────────────────
function HistoryView({ items, history, streaks }) {
  const [period, setPeriod] = useState("week");
  const today = new Date();
  const todayK = todayKey();

  const getDays = () => {
    if (period === "week") {
      const ws = weekStart();
      return Array.from({length:7}, (_, i) => { const d = new Date(ws); d.setDate(ws.getDate()+i); return dateKey(d); });
    }
    if (period === "month") {
      const days = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
      return Array.from({length:days}, (_, i) => { const d = new Date(today.getFullYear(), today.getMonth(), i+1); return dateKey(d); });
    }
    return Array.from({length:364}, (_, i) => { const d = new Date(today); d.setDate(today.getDate()-363+i); return dateKey(d); });
  };

  const days = getDays();
  const getCompletion = (dk) => {
    const itemsForDay = Object.entries(history).filter(([key]) => key.startsWith(dk + "_"));
    if (!itemsForDay.length) return null;
    const done = itemsForDay.filter(([,v]) => v).length;
    return done / itemsForDay.length;
  };

  const allEntries = Object.entries(history);
  const allDone = allEntries.filter(([,v]) => v).length;
  const allTotal = allEntries.length;
  const dayKeys = [...new Set(allEntries.map(([k]) => k.split("_")[0]))];
  const perfectDays = dayKeys.filter(dk => {
    const entries = allEntries.filter(([k]) => k.startsWith(dk + "_"));
    return entries.length > 0 && entries.every(([,v]) => v);
  }).length;
  const topStreak = Math.max(0, ...Object.values(streaks));
  const topStreakItem = items.find(i => (streaks[i.id]||0) === topStreak && topStreak > 0);

  return (
    <div style={{ padding:"0 20px" }}>
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[["week","Week"],["month","Month"],["year","Year"]].map(([key,label]) => (
          <button key={key} onClick={() => setPeriod(key)} style={{
            background: period===key ? C.accent : C.card, color: period===key ? "#0F0F13" : C.muted,
            border:"none", borderRadius:20, padding:"7px 18px", fontSize:14, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
          }}>{label}</button>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        {[
          { val:`${allTotal ? Math.round((allDone/allTotal)*100) : 0}%`, label:"All-time rate", color:C.accent },
          { val:`🔥${topStreak}`, label: topStreakItem ? `Best: ${topStreakItem.title.split(" ").slice(0,2).join(" ")}` : "Best streak", color:C.orange },
          { val:`⭐${perfectDays}`, label:"Perfect days", color:C.blue },
          { val:dayKeys.length, label:"Days tracked", color:C.purple },
        ].map(({ val, label, color }) => (
          <div key={label} style={{ background:C.card, borderRadius:16, padding:"18px 16px" }}>
            <div style={{ fontSize:28, fontFamily:"'DM Serif Display',Georgia,serif", color }}>{val}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{label}</div>
          </div>
        ))}
      </div>
      {period !== "year" ? (
        <div style={{ background:C.card, borderRadius:20, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:11, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:14 }}>Completion per day</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap: period==="month" ? 3 : 8, height:90 }}>
            {days.map(dk => {
              const pct = getCompletion(dk) ?? 0;
              const isToday = dk === todayK;
              const h = Math.max(4, pct * 90);
              const d = new Date(dk + "T12:00:00");
              const lbl = period === "week" ? WEEKDAYS[getDayIdx(d)] : d.getDate();
              return (
                <div key={dk} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:0 }}>
                  <div style={{ width:"100%", height:90, display:"flex", alignItems:"flex-end" }}>
                    <div style={{ width:"100%", height:`${h}px`, background: isToday ? C.accent : pct===0 ? C.border : C.accent+"55", borderRadius:"4px 4px 0 0", transition:"height 0.4s" }}/>
                  </div>
                  <span style={{ fontSize: period==="month" ? 8 : 10, color: isToday ? C.accent : C.muted }}>{lbl}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ background:C.card, borderRadius:20, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:11, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:14 }}>Year heatmap</div>
          <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
            {days.map(dk => {
              const pct = getCompletion(dk);
              const d = new Date(dk + "T12:00:00");
              const label = `${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}: ${pct !== null ? Math.round(pct*100)+"%" : "no data"}`;
              return <HeatCell key={dk} pct={pct} label={label} isToday={dk===todayK}/>;
            })}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:12 }}>
            <span style={{ fontSize:11, color:C.muted }}>Less</span>
            {[0,0.25,0.5,0.75,1].map(v => <HeatCell key={v} pct={v} label="" isToday={false}/>)}
            <span style={{ fontSize:11, color:C.muted }}>More</span>
          </div>
        </div>
      )}
      <div style={{ background:C.card, borderRadius:20, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:11, color:C.muted, letterSpacing:1, textTransform:"uppercase", marginBottom:14 }}>Goal streaks</div>
        {items.map(item => {
          const s = streaks[item.id] || 0;
          const color = CAT_COLOR[item.category];
          return (
            <div key={item.id} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              <div style={{ width:34, height:34, borderRadius:"50%", background:color+"22", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:16 }}>🔥</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, color:C.text, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.title}</div>
                <div style={{ background:C.border, borderRadius:4, height:5, marginTop:5 }}>
                  <div style={{ background:color, height:"100%", width:`${Math.min(100,(s/30)*100)}%`, borderRadius:4, transition:"width 0.4s" }}/>
                </div>
              </div>
              <span style={{ fontSize:20, fontFamily:"'DM Serif Display',Georgia,serif", color: s>0 ? C.orange : C.muted, minWidth:30, textAlign:"right" }}>{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState({}); // { "date_itemId": bool }
  const [streaks, setStreaks] = useState({});  // { itemId: number }
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("today");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [notifPermission, setNotifPermission] = useState(() => "Notification" in window ? Notification.permission : "unsupported");
  const [showNotifBanner, setShowNotifBanner] = useState(false);

  const today = todayKey();
  const todayDisplay = new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });

  // ── Load from Supabase on mount ──
  useEffect(() => {
    const load = async () => {
      try {
        const [dbItems, dbHistory, dbStreaks] = await Promise.all([
          DB.getItems(), DB.getHistory(), DB.getStreaks()
        ]);

        setItems(dbItems || []);

        // Convert history rows to flat map: "date_itemId" -> bool
        const histMap = {};
        (dbHistory || []).forEach(row => {
          histMap[`${row.date}_${row.item_id}`] = row.done;
        });
        setHistory(histMap);

        // Convert streaks rows to map: itemId -> streak
        const streakMap = {};
        (dbStreaks || []).forEach(row => {
          streakMap[row.item_id] = row.streak;
        });
        setStreaks(streakMap);

        // Cache locally as fallback
        LS.set("dg_items", dbItems);
        LS.set("dg_history", histMap);
        LS.set("dg_streaks", streakMap);
      } catch (e) {
        console.error("Failed to load from Supabase, using local cache", e);
        setItems(LS.get("dg_items") || []);
        setHistory(LS.get("dg_history") || {});
        setStreaks(LS.get("dg_streaks") || {});
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Notification setup ──
  useEffect(() => {
    if (notifPermission === "default") setShowNotifBanner(true);
  }, []);

  useEffect(() => {
    if (notifPermission === "granted") scheduleNotifications(items);
  }, [items, notifPermission]);

  const handleEnableNotifs = async () => {
    const result = await requestNotifPermission();
    setNotifPermission(result);
    setShowNotifBanner(false);
    if (result === "granted") scheduleNotifications(items);
  };

  // ── Today helpers ──
  const isDone = id => !!history[`${today}_${id}`];
  const doneCount = items.filter(i => isDone(i.id)).length;

  // ── Toggle completion ──
  const toggle = useCallback(async (id) => {
    const newDone = !isDone(id);
    const key = `${today}_${id}`;
    setHistory(prev => ({ ...prev, [key]: newDone }));
    setSyncing(true);
    try {
      await DB.upsertHistory({ item_id: id, date: today, done: newDone });
      // Recalculate streak
      const newStreak = await calcStreak(id, newDone);
      setStreaks(prev => ({ ...prev, [id]: newStreak }));
      await DB.upsertStreak({ item_id: id, streak: newStreak });
    } catch (e) { console.error(e); }
    finally { setSyncing(false); }
  }, [history, today]);

  const calcStreak = async (id, todayDone) => {
    if (!todayDone) return 0;
    let streak = 1;
    let d = new Date(); d.setDate(d.getDate()-1);
    for (let i = 0; i < 365; i++) {
      const k = `${dateKey(d)}_${id}`;
      if (history[k]) { streak++; d.setDate(d.getDate()-1); }
      else break;
    }
    return streak;
  };

  // ── Add item ──
  const addItem = async ({ title, category, time, target, reminderTime }) => {
    const newItem = { id: String(Date.now()), title, category, time, target, reminder_time: reminderTime };
    setItems(prev => [...prev, { ...newItem, reminderTime }]);
    setSyncing(true);
    try { await DB.addItem(newItem); }
    catch (e) { console.error(e); }
    finally { setSyncing(false); }
  };

  // ── Update item ──
  const updateItem = async (updated) => {
    const merged = { ...editItem, ...updated };
    setItems(prev => prev.map(i => i.id === editItem.id ? merged : i));
    setEditItem(null);
    setSyncing(true);
    try { await DB.updateItem(editItem.id, { title: merged.title, category: merged.category, time: merged.time, target: merged.target, reminder_time: merged.reminderTime }); }
    catch (e) { console.error(e); }
    finally { setSyncing(false); }
  };

  // ── Delete item ──
  const deleteItem = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setSyncing(true);
    try { await DB.deleteItem(id); }
    catch (e) { console.error(e); }
    finally { setSyncing(false); }
  };

  const getWeekHist = id => {
    const ws = weekStart();
    return Array.from({length:7}, (_, i) => {
      const d = new Date(ws); d.setDate(ws.getDate()+i);
      return !!history[`${dateKey(d)}_${id}`];
    });
  };

  const filtered = filter === "all" ? items : items.filter(i => i.category === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    if (a.time) return -1; if (b.time) return 1; return 0;
  });

  if (loading) return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      <div style={{ fontSize:32 }}>🎯</div>
      <div style={{ fontFamily:"'DM Serif Display',Georgia,serif", fontSize:24, color:C.text }}>Daily Goals</div>
      <div style={{ fontSize:13, color:C.muted }}>Loading your goals...</div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'DM Sans','Helvetica Neue',sans-serif", color:C.text, maxWidth:430, margin:"0 auto", paddingBottom:90 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing:border-box; -webkit-font-smoothing:antialiased; }
        input::placeholder { color:#6B6B7A; }
        input[type="time"]::-webkit-calendar-picker-indicator { filter:invert(0.5); }
        ::-webkit-scrollbar { display:none; }
        button { transition:transform 0.1s; }
        button:active { transform:scale(0.95); }
      `}</style>

      {/* Notification banner */}
      {showNotifBanner && (
        <div style={{ margin:"52px 20px 0", background:`${C.accent}18`, border:`1px solid ${C.accent}44`, borderRadius:16, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <Icon name="bell" size={20} color={C.accent}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:C.accent }}>Enable Reminders</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Get notified when it's time for your goals</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setShowNotifBanner(false)} style={{ background:"none", border:"none", color:C.muted, fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>Later</button>
            <button onClick={handleEnableNotifs} style={{ background:C.accent, border:"none", borderRadius:20, padding:"6px 14px", color:"#0F0F13", fontSize:13, fontWeight:700, fontFamily:"inherit", cursor:"pointer" }}>Allow</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: showNotifBanner ? "16px 24px 16px" : "52px 24px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ fontSize:11, color:C.muted, letterSpacing:1.2, textTransform:"uppercase", marginBottom:6 }}>{todayDisplay}</div>
          {syncing && <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:C.muted }}><Icon name="cloud" size={14} color={C.muted}/>Saving...</div>}
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <h1 style={{ fontFamily:"'DM Serif Display',Georgia,serif", fontSize:34, margin:0, color:C.text, lineHeight:1 }}>
              {items.length > 0 && doneCount === items.length ? "All done! 🎉" : `${doneCount} / ${items.length}`}
            </h1>
            <div style={{ fontSize:13, color:C.muted, marginTop:5 }}>
              {items.length > 0 && doneCount === items.length ? "You crushed it today" : `${items.length - doneCount} remaining`}
            </div>
          </div>
          <button onClick={() => setShowAdd(true)} style={{ width:50, height:50, background:C.accent, border:"none", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", boxShadow:`0 0 28px ${C.accent}44` }}>
            <Icon name="plus" size={24} color="#0F0F13"/>
          </button>
        </div>
        <div style={{ background:C.border, borderRadius:4, height:4, marginTop:16, overflow:"hidden" }}>
          <div style={{ background:`linear-gradient(90deg,${C.accent},${C.accentDim})`, height:"100%", width:`${items.length ? (doneCount/items.length)*100 : 0}%`, borderRadius:4, transition:"width 0.4s ease" }}/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:8, padding:"12px 20px 16px", overflowX:"auto" }}>
        {[["today","Today"],["history","History"]].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: tab===key ? C.accent : C.card, color: tab===key ? "#0F0F13" : C.muted,
            border:"none", borderRadius:20, padding:"8px 20px", fontSize:14, fontWeight:600, fontFamily:"inherit", cursor:"pointer",
          }}>{label}</button>
        ))}
      </div>

      {tab === "today" && (
        <>
          <div style={{ display:"flex", gap:7, padding:"0 20px 16px", overflowX:"auto" }}>
            {[["all","All",C.text], ...Object.entries(CAT_COLOR).map(([k,c])=>[k,CAT_LABEL[k],c])].map(([key,label,color]) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                background: filter===key ? color+"22" : "transparent",
                border: `1.5px solid ${filter===key ? color : C.border}`,
                color: filter===key ? color : C.muted,
                borderRadius:20, padding:"6px 14px", fontSize:12, fontWeight:500, fontFamily:"inherit", cursor:"pointer", whiteSpace:"nowrap",
              }}>{label}</button>
            ))}
          </div>
          <div style={{ padding:"0 20px" }}>
            {sorted.length === 0
              ? <div style={{ textAlign:"center", color:C.muted, padding:"48px 0", fontSize:15 }}>
                  No goals yet<br/><span style={{fontSize:12, marginTop:6, display:"block"}}>Tap + to add your first goal</span>
                </div>
              : sorted.map(item => (
                  <GoalCard key={item.id} item={item} done={isDone(item.id)}
                    streak={streaks[item.id] || 0} weekHist={getWeekHist(item.id)}
                    onToggle={toggle} onEdit={setEditItem} onDelete={deleteItem}/>
                ))
            }
          </div>
        </>
      )}

      {tab === "history" && <HistoryView items={items} history={history} streaks={streaks}/>}

      {/* Bottom nav */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:C.card, borderTop:`1px solid ${C.border}`, display:"flex", justifyContent:"space-around", padding:"12px 0 22px", zIndex:50 }}>
        {[["today","home","Today"],["history","calendar","History"]].map(([key,icon,label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ background:"none", border:"none", display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer", fontFamily:"inherit", color: tab===key ? C.accent : C.muted }}>
            <Icon name={icon} size={22} color={tab===key ? C.accent : C.muted}/>
            <span style={{ fontSize:11, fontWeight:500 }}>{label}</span>
          </button>
        ))}
      </div>

      {showAdd && <ItemModal onSave={addItem} onClose={() => setShowAdd(false)}/>}
      {editItem && <ItemModal item={editItem} onSave={updateItem} onClose={() => setEditItem(null)}/>}
    </div>
  );
}

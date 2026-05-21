import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  Edit3,
  FileText,
  GripVertical,
  Image as ImageIcon,
  LogOut,
  Maximize2,
  MessageCircle,
  Moon,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Timer,
  Trash2,
  Users,
  Volume2,
  X
} from "lucide-react";
import "./styles.css";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? "https://hustlehub-kztd.onrender.com" : "http://127.0.0.1:8000");

const emptyTask = {
  title: "",
  notes: "",
  due_at: "",
  priority: "Medium",
  category: "Personal"
};

const filters = ["All", "Pending", "Completed", "High", "Today", "This week"];
const categories = ["Study", "Work", "Personal", "Shopping", "Health"];
const AUTH_KEY = "hustlehub-auth";
const THEME_KEY = "hustlehub-theme";
const focusPresets = [
  { label: "25 min focus", minutes: 25 },
  { label: "5 min break", minutes: 5 }
];
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;

function getStoredAuth() {
  try {
    const stored = localStorage.getItem(AUTH_KEY) || localStorage.getItem("taskflow-auth");
    if (stored) localStorage.setItem(AUTH_KEY, stored);
    return JSON.parse(stored || "null");
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isThisWeek(value) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function priorityClass(priority) {
  return priority.toLowerCase();
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function cleanErrorMessage(message) {
  return message === "Invalid session" ? "Ready to begin deep work. Please sign in again." : message;
}

function App() {
  const [auth, setAuth] = useState(getStoredAuth);
  const [tasks, setTasks] = useState([]);
  const [draft, setDraft] = useState(emptyTask);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [mode, setMode] = useState(localStorage.getItem(THEME_KEY) || localStorage.getItem("taskflow-theme") || "light");
  const [authMode, setAuthMode] = useState("login");
  const [credentials, setCredentials] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [customMinutes, setCustomMinutes] = useState(45);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusLabel, setFocusLabel] = useState("25 min focus");
  const [smartFocus, setSmartFocus] = useState(false);
  const [roomMode, setRoomMode] = useState("create");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [chatText, setChatText] = useState("");
  const [chatFile, setChatFile] = useState(null);
  const [ambientSound, setAmbientSound] = useState("Rain");
  const roomChatRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem(THEME_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (!auth?.token) return;
    fetchTasks();
  }, [auth?.token]);

  useEffect(() => {
    if (!focusRunning) return;
    const interval = window.setInterval(() => {
      setFocusSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          setFocusRunning(false);
          setMessage("Focus session complete. Take a mindful break.");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [focusRunning]);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const upcoming = tasks.filter((task) => {
      if (!task.due_at || task.completed) return false;
      const diff = new Date(task.due_at).getTime() - Date.now();
      return diff > 0 && diff <= 30 * 60 * 1000 && !sessionStorage.getItem(`notified-${task.id}`);
    });
    upcoming.forEach((task) => {
      sessionStorage.setItem(`notified-${task.id}`, "1");
      new Notification("Task deadline soon", { body: `${task.title} is due by ${formatDate(task.due_at)}` });
    });
  }, [tasks]);

  useEffect(() => {
    if (!auth?.token || !currentRoom?.code) return;
    const interval = window.setInterval(() => {
      refreshRoom(currentRoom.code, false);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [auth?.token, currentRoom?.code]);

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(cleanErrorMessage(data.detail || "Something went wrong"));
    return data;
  }

  async function fetchTasks() {
    try {
      setTasks(await api("/tasks"));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    try {
      const payload =
        authMode === "register"
          ? credentials
          : { email: credentials.email, password: credentials.password };
      const data = await api(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      localStorage.setItem(AUTH_KEY, JSON.stringify(data));
      setAuth(data);
      setMessage("");
    } catch (error) {
      setMessage(
        authMode === "login" && error.message === "Invalid email or password"
          ? "No saved account found for this login. Create an account or use demo mode."
          : error.message
      );
    }
  }

  async function continueWithDemo() {
    const demo = {
      name: "HustleHub Demo",
      email: "demo@hustlehub.app",
      password: "demo123"
    };
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: demo.email, password: demo.password })
      });
      localStorage.setItem(AUTH_KEY, JSON.stringify(data));
      setAuth(data);
      setMessage("");
    } catch {
      try {
        const data = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(demo)
        });
        localStorage.setItem(AUTH_KEY, JSON.stringify(data));
        setAuth(data);
        setMessage("");
      } catch (error) {
        setMessage(error.message);
      }
    }
  }

  async function saveTask(event) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    try {
      const payload = { ...draft, title: draft.title.trim() };
      if (editingId) {
        const updated = await api(`/tasks/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setTasks((current) => current.map((task) => (task.id === editingId ? updated : task)));
      } else {
        const created = await api("/tasks", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setTasks((current) => [...current, created]);
      }
      setDraft(emptyTask);
      setEditingId(null);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function startEdit(task) {
    setEditingId(task.id);
    setDraft({
      title: task.title,
      notes: task.notes || "",
      due_at: task.due_at || "",
      priority: task.priority,
      category: task.category
    });
  }

  async function toggleTask(task) {
    const updated = await api(`/tasks/${task.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...task, completed: !task.completed })
    });
    setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
  }

  async function deleteTask(id) {
    await api(`/tasks/${id}`, { method: "DELETE" });
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  async function persistOrder(ordered) {
    setTasks(ordered);
    await api("/tasks/reorder", {
      method: "POST",
      body: JSON.stringify({ task_ids: ordered.map((task) => task.id) })
    });
  }

  function onDrop(targetId) {
    if (!draggingId || draggingId === targetId) return;
    const from = tasks.findIndex((task) => task.id === draggingId);
    const to = tasks.findIndex((task) => task.id === targetId);
    const next = [...tasks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraggingId(null);
    persistOrder(next).catch((error) => setMessage(error.message));
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setMessage("This browser does not support notifications.");
      return;
    }
    const result = await Notification.requestPermission();
    setMessage(result === "granted" ? "Reminders enabled." : "Notifications were not enabled.");
  }

  function startFocus(minutes, label) {
    setFocusSeconds(minutes * 60);
    setFocusLabel(label);
    setFocusRunning(true);
    setMessage(smartFocus ? "Smart Focus is active. Keep only essential alerts nearby." : "");
  }

  function resetFocus() {
    setFocusRunning(false);
    setFocusSeconds(25 * 60);
    setFocusLabel("25 min focus");
  }

  function enterRoom(room, status) {
    setCurrentRoom(room);
    setRoomCodeInput(room.code);
    setMessage(status);
    window.setTimeout(() => {
      roomChatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      chatInputRef.current?.focus();
    }, 80);
  }

  async function refreshRoom(code = currentRoom?.code, showErrors = true) {
    if (!code) return;
    try {
      const room = await api(`/rooms/${code}`);
      setCurrentRoom(room);
    } catch (error) {
      if (showErrors) setMessage(error.message);
    }
  }

  async function createStudyRoom() {
    try {
      const room = await api("/rooms", { method: "POST" });
      enterRoom(room, `Entered room ${room.code}. Share this code with friends.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function joinStudyRoom(event) {
    event.preventDefault();
    const code = roomCodeInput.trim();
    if (!/^\d{4}$/.test(code)) {
      setMessage("Enter a 4 digit room code.");
      return;
    }
    try {
      const room = await api("/rooms/join", {
        method: "POST",
        body: JSON.stringify({ code })
      });
      enterRoom(room, `Entered room ${room.code}.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function readAttachment(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", data: reader.result });
      reader.onerror = () => reject(new Error("Could not read this file."));
      reader.readAsDataURL(file);
    });
  }

  async function sendRoomMessage(event) {
    event.preventDefault();
    if (!currentRoom?.code) {
      setMessage("Start a focus room first.");
      return;
    }
    try {
      const attachment = chatFile ? await readAttachment(chatFile) : null;
      const message = await api(`/rooms/${currentRoom.code}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: chatText, attachment })
      });
      setCurrentRoom((room) => ({ ...room, messages: [...(room?.messages || []), message] }));
      setChatText("");
      setChatFile(null);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function selectChatFile(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setMessage("Files up to 2 MB can be shared in room chat.");
      return;
    }
    setChatFile(file);
  }

  function openAttachment(attachment) {
    if (!attachment?.data) return;
    const link = document.createElement("a");
    link.href = attachment.data;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = attachment.name;
    link.click();
  }

  async function copyRoomCode() {
    if (!currentRoom?.code) return;
    await navigator.clipboard.writeText(currentRoom.code);
    setMessage(`Room code ${currentRoom.code} copied.`);
  }

  const visibleTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const text = `${task.title} ${task.notes} ${task.category}`.toLowerCase();
        return text.includes(query.toLowerCase());
      })
      .filter((task) => {
        if (activeFilter === "Pending") return !task.completed;
        if (activeFilter === "Completed") return task.completed;
        if (activeFilter === "High") return task.priority === "High";
        if (activeFilter === "Today") return isToday(task.due_at);
        if (activeFilter === "This week") return isThisWeek(task.due_at);
        return true;
      });
  }, [tasks, query, activeFilter]);

  const stats = useMemo(() => {
    const completed = tasks.filter((task) => task.completed).length;
    const total = tasks.length;
    const pending = total - completed;
    const percentage = total ? Math.round((completed / total) * 100) : 0;
    return { completed, pending, total, percentage };
  }, [tasks]);

  const roomMembers = currentRoom?.members?.length || 0;

  if (!auth) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">HustleHub</p>
            <h1>Plan your day with less friction.</h1>
            <p className="muted">A polished to-do dashboard with accounts, priorities, deadlines, filters, and reminders.</p>
          </div>
          <form className="auth-form" onSubmit={submitAuth}>
            <div className="segmented">
              <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
                Login
              </button>
              <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>
                Register
              </button>
            </div>
            {authMode === "register" && (
              <label>
                Name
                <input value={credentials.name} onChange={(event) => setCredentials({ ...credentials, name: event.target.value })} required />
              </label>
            )}
            <label>
              Email
              <input type="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} required />
            </label>
            <label>
              Password
              <input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} minLength="6" required />
            </label>
            {message && <p className="notice">{message}</p>}
            <button className="primary" type="submit">{authMode === "login" ? "Login" : "Create account"}</button>
            <button className="ghost full-width" type="button" onClick={continueWithDemo}>Try demo workspace</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">HustleHub</p>
          <h1>Today’s work, calmly organized.</h1>
        </div>
        <div className="stat-stack">
          <div className="stat-card">
            <span>Completed</span>
            <strong>{stats.completed} / {stats.total}</strong>
          </div>
          <div className="stat-card">
            <span>Pending</span>
            <strong>{stats.pending}</strong>
          </div>
          <div className="progress-wrap">
            <div className="progress-label">
              <span>Productivity</span>
              <strong>{stats.percentage}%</strong>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${stats.percentage}%` }} />
            </div>
          </div>
        </div>
        <button className="ghost" onClick={requestNotifications}>
          <Bell size={18} /> Enable reminders
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="muted">Signed in as {auth.user.name}</p>
            <h2>Task Dashboard</h2>
          </div>
          <div className="top-actions">
            <button className="icon-button" title="Toggle theme" onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
              {mode === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button"
              title="Logout"
              onClick={() => {
                localStorage.removeItem(AUTH_KEY);
                localStorage.removeItem("taskflow-auth");
                setAuth(null);
              }}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <form className="task-form" onSubmit={saveTask}>
          <div className="form-main">
            <label>
              Task
              <input placeholder="Submit assignment by 8 PM" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              Notes
              <input placeholder="Optional details" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Due date & time
              <input
                type="datetime-local"
                value={draft.due_at}
                onInput={(event) => setDraft((current) => ({ ...current, due_at: event.target.value }))}
                onChange={(event) => setDraft((current) => ({ ...current, due_at: event.target.value }))}
              />
            </label>
            <label>
              Priority
              <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>
            <label>
              Category
              <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <button className="primary" type="submit">
              {editingId ? <Check size={18} /> : <Plus size={18} />}
              {editingId ? "Update" : "Add task"}
            </button>
            {editingId && (
              <button className="ghost" type="button" onClick={() => { setEditingId(null); setDraft(emptyTask); }}>
                <X size={18} /> Cancel
              </button>
            )}
          </div>
        </form>

        <div className="controls">
          <label className="search-box">
            <Search size={18} />
            <input placeholder="Search tasks..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="filter-row">
            {filters.map((filter) => (
              <button key={filter} className={activeFilter === filter ? "active" : ""} onClick={() => setActiveFilter(filter)}>
                {filter}
              </button>
            ))}
          </div>
        </div>

        <section className={`focus-grid ${smartFocus ? "smart-active" : ""}`}>
          <article className="focus-card focus-timer">
            <div className="section-heading">
              <span><Timer size={18} /> Focus Mode</span>
              <strong>{focusLabel}</strong>
            </div>
            <div className="timer-display">{formatTimer(focusSeconds)}</div>
            <div className="preset-row">
              {focusPresets.map((preset) => (
                <button key={preset.label} className="ghost" type="button" onClick={() => startFocus(preset.minutes, preset.label)}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="focus-actions">
              <label className="mini-input">
                Custom
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(Number(event.target.value) || 1)}
                />
              </label>
              <button className="primary" type="button" onClick={() => startFocus(customMinutes, `${customMinutes} min custom`)}>
                Start
              </button>
              <button className="icon-button" type="button" title="Reset timer" onClick={resetFocus}>
                <X size={18} />
              </button>
            </div>
            <div className="focus-status">
              <span className={focusRunning ? "live-dot active" : "live-dot"} />
              {focusRunning ? "Session running" : "Ready for deep work"}
            </div>
          </article>

          <article className="focus-card">
            <div className="section-heading">
              <span><Users size={18} /> Group Study</span>
              <strong>{currentRoom ? `${roomMembers} live` : "No active room"}</strong>
            </div>
            <div className="room-tabs">
              <button type="button" className={roomMode === "create" ? "active" : ""} onClick={() => setRoomMode("create")}>Create room</button>
              <button type="button" className={roomMode === "join" ? "active" : ""} onClick={() => setRoomMode("join")}>Join room</button>
            </div>
            <form className="room-form" onSubmit={joinStudyRoom}>
              {roomMode === "create" ? (
                <button className="primary room-button" type="button" onClick={createStudyRoom}>Generate code and enter</button>
              ) : (
                <>
                  <input
                    inputMode="numeric"
                    maxLength="4"
                    placeholder="Enter code"
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button className="primary" type="submit">Join</button>
                </>
              )}
            </form>
            <div className={currentRoom ? "room-code-card inside" : "room-code-card"}>
              <span>{currentRoom ? "You are inside this room" : "Ready to begin deep work"}</span>
              <strong>{currentRoom?.code || "----"}</strong>
              <button className="icon-button" type="button" title="Copy room code" onClick={copyRoomCode} disabled={!currentRoom}>
                <Copy size={16} />
              </button>
            </div>
          </article>

          <article className="focus-card">
            <div className="section-heading">
              <span><ShieldCheck size={18} /> Smart Focus</span>
              <label className="switch">
                <input type="checkbox" checked={smartFocus} onChange={(event) => setSmartFocus(event.target.checked)} />
                <span />
              </label>
            </div>
            <div className="smart-list">
              <span><Maximize2 size={16} /> Fullscreen prompt <strong>{smartFocus ? "On" : "Ready"}</strong></span>
              <span><Volume2 size={16} /> Ambient sound <strong>{ambientSound}</strong></span>
              <span><Bell size={16} /> Allowlist <strong>Calls + priority</strong></span>
            </div>
            <select value={ambientSound} onChange={(event) => setAmbientSound(event.target.value)}>
              <option>Rain</option>
              <option>Library</option>
              <option>White noise</option>
              <option>None</option>
            </select>
          </article>
        </section>

        {currentRoom && (
          <section className="room-chat" id="room-chat" ref={roomChatRef}>
            <div className="section-heading">
              <span><MessageCircle size={18} /> Room chat</span>
              <strong>{currentRoom.code}</strong>
            </div>
            <div className="chat-messages">
              {currentRoom.messages.length === 0 ? (
                <div className="chat-empty">Start the conversation for this focus room.</div>
              ) : (
                currentRoom.messages.map((item) => (
                  <article className={item.user.id === auth.user.id ? "chat-message mine" : "chat-message"} key={item.id}>
                    <div>
                      <strong>{item.user.name}</strong>
                      <span>{formatTime(item.created_at)}</span>
                    </div>
                    {item.text && <p>{item.text}</p>}
                    {item.attachment && (
                      <button className="attachment-link" type="button" onClick={() => openAttachment(item.attachment)}>
                        {item.attachment.type.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                        {item.attachment.name}
                      </button>
                    )}
                  </article>
                ))
              )}
            </div>
            <form className="chat-form" onSubmit={sendRoomMessage}>
              <input ref={chatInputRef} placeholder="Send a message to everyone in this room" value={chatText} onChange={(event) => setChatText(event.target.value)} />
              <label className="file-button" title="Attach image, PDF, or document">
                <Paperclip size={18} />
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={selectChatFile}
                />
              </label>
              <button className="primary" type="submit">Send</button>
            </form>
            {chatFile && (
              <div className="selected-file">
                <span>{chatFile.name}</span>
                <button className="icon-button" type="button" title="Remove attachment" onClick={() => setChatFile(null)}>
                  <X size={16} />
                </button>
              </div>
            )}
          </section>
        )}

        {message && <p className="notice">{message}</p>}


        <section className="task-list">
          {visibleTasks.length === 0 ? (
            <div className="empty-state">
              <ClipboardList size={42} />
              <h3>No tasks yet.</h3>
              <p>Add one to get started.</p>
            </div>
          ) : (
            visibleTasks.map((task) => (
              <article
                className={`task-card ${task.completed ? "done" : ""}`}
                key={task.id}
                draggable
                onDragStart={() => setDraggingId(task.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onDrop(task.id)}
              >
                <button className="drag-handle" title="Drag to reorder">
                  <GripVertical size={18} />
                </button>
                <button className="check-button" onClick={() => toggleTask(task)} title="Mark complete">
                  {task.completed && <Check size={16} />}
                </button>
                <div className="task-content">
                  <div className="task-title-row">
                    <h3>{task.title}</h3>
                    <span className={`pill ${priorityClass(task.priority)}`}>{task.priority}</span>
                  </div>
                  {task.notes && <p>{task.notes}</p>}
                  <div className="meta-row">
                    <span><CalendarDays size={15} /> {formatDate(task.due_at)}</span>
                    <span>{task.category}</span>
                  </div>
                </div>
                <div className="task-actions">
                  <button className="icon-button" title="Edit task" onClick={() => startEdit(task)}><Edit3 size={17} /></button>
                  <button className="icon-button danger" title="Delete task" onClick={() => deleteTask(task.id)}><Trash2 size={17} /></button>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);

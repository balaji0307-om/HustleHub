import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  Edit3,
  GripVertical,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  X
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const emptyTask = {
  title: "",
  notes: "",
  due_at: "",
  priority: "Medium",
  category: "Personal"
};

const filters = ["All", "Pending", "Completed", "High", "Today", "This week"];
const categories = ["Study", "Work", "Personal", "Shopping", "Health"];

function getStoredAuth() {
  try {
    return JSON.parse(localStorage.getItem("taskflow-auth") || "null");
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

function App() {
  const [auth, setAuth] = useState(getStoredAuth);
  const [tasks, setTasks] = useState([]);
  const [draft, setDraft] = useState(emptyTask);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [mode, setMode] = useState(localStorage.getItem("taskflow-theme") || "light");
  const [authMode, setAuthMode] = useState("login");
  const [credentials, setCredentials] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");
  const [draggingId, setDraggingId] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem("taskflow-theme", mode);
  }, [mode]);

  useEffect(() => {
    if (!auth?.token) return;
    fetchTasks();
  }, [auth?.token]);

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
    if (!response.ok) throw new Error(data.detail || "Something went wrong");
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
      localStorage.setItem("taskflow-auth", JSON.stringify(data));
      setAuth(data);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
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

  if (!auth) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">TaskFlow</p>
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
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">TaskFlow</p>
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

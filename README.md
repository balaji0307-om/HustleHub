# HustleHub

A portfolio-level To-Do app built with React + Vite and FastAPI.

## Features

- Login and registration
- Add, edit, delete, complete, and reorder tasks
- Due date and time
- Priority levels and categories
- Search and filters
- Dark mode
- Dashboard stats and progress bar
- Browser reminder permission for tasks due within 30 minutes
- Responsive layout for mobile, tablet, and desktop

## Run

Start the backend:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
npm run dev
```

Then open `http://127.0.0.1:5173`.

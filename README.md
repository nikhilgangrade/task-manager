# 🧠 Real-Time Collaborative Task Manager

A full-stack real-time task management application built with React, Node.js, WebSockets (`socket.io`), and SQLite. It supports collaborative editing, undo/redo functionality, and real-time task synchronization across users.

## 🚀 Features

- **Projects**: Create, edit, and delete multiple projects.
- **Tasks**: Add, edit, delete tasks within a project.
- **Real-time Sync**: Collaborate in real-time via WebSockets (`socket.io`).
- **Undo/Redo**: Restore past actions with full undo and redo history.
- **Lightweight Backend**: Built with Express.js and SQLite for quick local development.

---

## 🛠️ Tech Stack

| Layer      | Technology                    |
|------------|-------------------------------|
| Frontend   | React, Tailwind CSS           |
| Backend    | Node.js, Express.js           |
| Real-time  | Socket.io                     |
| Database   | SQLite (via `better-sqlite3`) |

---

## Getting Started

### Prerequisites

- Node.js v18+
- npm

### 1. Clone the repo

```bash
git clone https://github.com/nikhilgangrade/task-manager
cd task-manager
```

### 2. Install Dependencies

# For Backend
```bash
cd server
npm install
```
# For Fortend
```bash
cd client
npm install
```

### 3. Start Development Servers

# Start Backend
```bash
cd server
node server.js
```

# Start Frontend
```bash
cd client
npm start  
```

# Project STructure
```bash
.
├── client/         # React frontend
│   └── App.js
│   └── index.js
│   └── package.json
├── server/         # Express backend
│   ├── server.js
│   └── db.js       # SQLite setup
│   └── package.json
└── README.md
```
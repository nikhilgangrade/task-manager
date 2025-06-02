const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Get all projects
app.get('/api/projects', (req, res) => {
  db.all('SELECT * FROM projects', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create new project
app.post('/api/projects', (req, res) => {
  const id = uuidv4();
  const { description } = req.body;
  db.run('INSERT INTO projects (id, description) VALUES (?, ?)', [id, description], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, description });
  });
});

// Update project description
app.put('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const { description } = req.body;
  db.run(`UPDATE projects SET description = ? WHERE id = ?`, [description, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.send({ success: true });
  });
});

// Delete a project
app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM projects WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM tasks WHERE project_id = ?`, [id]);
    res.send({ success: true });
  });
});

// Get tasks for project
app.get('/api/projects/:id/tasks', (req, res) => {
  const { id } = req.params;
  db.all('SELECT * FROM tasks WHERE project_id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const tasks = rows.map(row => ({
      ...row,
      configuration: JSON.parse(row.configuration || '{}'),
    }));
    res.json(tasks);
  });
});

// Create a task
app.post('/api/projects/:id/tasks', (req, res) => {
  const id = req.body.id || uuidv4();
  const { title, configuration } = req.body;
  const configString = JSON.stringify(configuration || {});
  const task = { id, project_id: req.params.id, title, configuration: configuration || {} };

  db.run(
    'INSERT INTO tasks (id, project_id, title, configuration) VALUES (?, ?, ?, ?)',
    [id, req.params.id, title, configString],
    err => {
      if (err) return res.status(500).json({ error: err.message });
      db.run('INSERT INTO events (id, type, task_id, payload) VALUES (?, ?, ?, ?)',
        [uuidv4(), 'create', id, JSON.stringify(task)]
      );
      io.to(req.params.id).emit('task:create', task);
      res.json(task);
    }
  );
});

// Update a task
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { title, configuration } = req.body;

  const query = `
    UPDATE tasks
    SET title = ?, configuration = ?
    WHERE id = ?
  `;

  db.run(query, [title, JSON.stringify(configuration), id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    const updated = { id, title, configuration };
    db.get('SELECT project_id FROM tasks WHERE id = ?', [id], (err2, row) => {
      if (!err2 && row) {
        io.to(row.project_id).emit('task:update', updated);
      }
      res.json(updated);
    });
  });
});

// Delete a task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT project_id FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(500).json({ error: 'Task not found' });
    const project_id = row.project_id;

    db.run('DELETE FROM tasks WHERE id = ?', [id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      io.to(project_id).emit('task:delete', id);
      res.send({ success: true });
    });
  });
});

// Socket.io room join/leave
io.on('connection', socket => {
  socket.on('join', room => socket.join(room));
  socket.on('leave', room => socket.leave(room));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

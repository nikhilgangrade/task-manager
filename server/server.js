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
  db.all('SELECT * FROM projects', (err, rows) => res.json(rows));
});

// Create new project
app.post('/api/projects', (req, res) => {
  const id = uuidv4();
  const { description } = req.body;
  db.run('INSERT INTO projects (id, description) VALUES (?, ?)', [id, description], err => {
    res.json({ id, description });
  });
});

// Update project description
app.put('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const { description } = req.body;
  db.run(`UPDATE projects SET description = ? WHERE id = ?`, [description, id], function (err) {
    if (err) return res.status(500).send(err);
    res.send({ success: true });
  });
});

// Delete a project
app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM projects WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).send(err);
    res.send({ success: true });
  });
});

// Get tasks for project
app.get('/api/projects/:id/tasks', (req, res) => {
  db.all('SELECT * FROM tasks WHERE project_id = ?', [req.params.id], (err, rows) => {
    res.json(rows);
  });
});

// Create a task
app.post('/api/projects/:id/tasks', (req, res) => {
  const id = req.body.id || uuidv4();
  const { title } = req.body;
  const configuration = JSON.stringify({});
  const task = { id, project_id: req.params.id, title, configuration: {} };

  db.run(
    'INSERT INTO tasks (id, project_id, title, configuration) VALUES (?, ?, ?, ?)',
    [id, req.params.id, title, configuration],
    err => {
      db.run('INSERT INTO events (id, type, task_id, payload) VALUES (?, ?, ?, ?)',
        [uuidv4(), 'create', id, JSON.stringify(task)]
      );
      res.json(task);
    }
  );
});

// Update a task
app.put('/api/tasks/:id', (req, res) => {
  const { title, configuration } = req.body;
  const configString = JSON.stringify(configuration || {});

  db.run(
    'UPDATE tasks SET title = ?, configuration = ? WHERE id = ?',
    [title, configString, req.params.id],
    err => {
      db.run('INSERT INTO events (id, type, task_id, payload) VALUES (?, ?, ?, ?)',
        [uuidv4(), 'update', req.params.id, JSON.stringify({ title, configuration })]
      );
      res.sendStatus(200);
    }
  );
});

// Delete a task
app.delete('/api/tasks/:id', (req, res) => {
  db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id], (err, task) => {
    if (!task) return res.sendStatus(404);
    db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], err => {
      db.run('INSERT INTO events (id, type, task_id, payload) VALUES (?, ?, ?, ?)',
        [uuidv4(), 'delete', req.params.id, JSON.stringify(task)]
      );
      res.sendStatus(200);
    });
  });
});

// Socket.IO real-time events
io.on('connection', socket => {
  socket.on('join', projectId => socket.join(projectId));
  socket.on('leave', projectId => socket.leave(projectId));

  socket.on('task:create', task => io.to(task.project_id).emit('task:create', task));
  socket.on('task:update', task => io.to(task.project_id).emit('task:update', task));
  socket.on('task:delete', ({ id, project_id }) => io.to(project_id).emit('task:delete', id));
});

server.listen(4000, () => console.log('Server listening on port 4000'));

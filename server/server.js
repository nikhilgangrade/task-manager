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

// Project APIs 

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
  db.run('UPDATE projects SET description = ? WHERE id = ?', [description, id], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.send({ success: true });
  });
});

// Delete a project
app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM projects WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM tasks WHERE project_id = ?', [id]);
    db.run('DELETE FROM events WHERE project_id = ?', [id]);
    res.send({ success: true });
  });
});

//Task APIs

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

      db.run(
        'INSERT INTO events (id, type, task_id, project_id, payload) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'create', id, req.params.id, JSON.stringify(task)]
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

  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Task not found' });

    const oldTask = {
      id,
      title: row.title,
      configuration: JSON.parse(row.configuration || '{}'),
    };
    const newTask = {
      id,
      title,
      configuration,
    };

    db.run(
      'UPDATE tasks SET title = ?, configuration = ? WHERE id = ?',
      [title, JSON.stringify(configuration), id],
      err2 => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.run(
          'INSERT INTO events (id, type, task_id, project_id, payload) VALUES (?, ?, ?, ?, ?)',
          [uuidv4(), 'update', id, row.project_id, JSON.stringify(oldTask)]
        );

        io.to(row.project_id).emit('task:update', newTask);
        res.json(newTask);
      }
    );
  });
});

// Delete a task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Task not found' });

    db.run('DELETE FROM tasks WHERE id = ?', [id], err2 => {
      if (err2) return res.status(500).json({ error: err2.message });

      const deletedTask = {
        id,
        project_id: row.project_id,
        title: row.title,
        configuration: JSON.parse(row.configuration || '{}'),
      };

      db.run(
        'INSERT INTO events (id, type, task_id, project_id, payload) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), 'delete', id, row.project_id, JSON.stringify(deletedTask)]
      );

      io.to(row.project_id).emit('task:delete', id);
      res.send({ success: true });
    });
  });
});

// Undo/Redo APIs

app.post('/api/projects/:projectId/undo', (req, res) => {
  const { projectId } = req.params;
  db.get(
    'SELECT * FROM events WHERE project_id = ? ORDER BY rowid DESC LIMIT 1',
    [projectId],
    (err, event) => {
      if (err || !event) return res.status(404).json({ error: 'No event to undo' });

      const payload = JSON.parse(event.payload);
      const type = event.type;

      const applyUndo = () => {
        db.run('DELETE FROM events WHERE id = ?', [event.id]);
        if (type === 'create') {
          db.run('DELETE FROM tasks WHERE id = ?', [event.task_id]);
          io.to(projectId).emit('task:delete', event.task_id);
          return res.send({ success: true });
        } else if (type === 'delete') {
          db.run(
            'INSERT INTO tasks (id, project_id, title, configuration) VALUES (?, ?, ?, ?)',
            [payload.id, payload.project_id, payload.title, JSON.stringify(payload.configuration)],
            () => {
              io.to(projectId).emit('task:create', payload);
              return res.send({ success: true });
            }
          );
        } else if (type === 'update') {
          db.run(
            'UPDATE tasks SET title = ?, configuration = ? WHERE id = ?',
            [payload.title, JSON.stringify(payload.configuration), payload.id],
            () => {
              io.to(projectId).emit('task:update', payload);
              return res.send({ success: true });
            }
          );
        }
      };

      applyUndo();
    }
  );
});


io.on('connection', socket => {
  socket.on('join', room => socket.join(room));
  socket.on('leave', room => socket.leave(room));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

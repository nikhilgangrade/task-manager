// App.js
import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import './App.css';

const socket = io('http://localhost:4000');
const PRIORITY_OPTIONS = ['', 'Low', 'Medium', 'High'];

function App() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editedProjectName, setEditedProjectName] = useState('');
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:4000/api/projects').then(res => setProjects(res.data));
  }, []);

  useEffect(() => {
    if (!activeProject) return;

    axios.get(`http://localhost:4000/api/projects/${activeProject}/tasks`).then(res => setTasks(res.data));
    socket.emit('join', activeProject);

    const onUpdate = task => {
      setTasks(prev => prev.map(t => (t.id === task.id ? task : t)));
    };

    const onCreate = task => {
      if (task.project_id === activeProject) {
        setTasks(prev => [...prev, task]);
        setHistory(prev => [...prev, { type: 'create', task }]);
      }
    };

    const onDelete = id => {
      setTasks(prev => prev.filter(t => t.id !== id));
    };

    socket.on('task:update', onUpdate);
    socket.on('task:create', onCreate);
    socket.on('task:delete', onDelete);

    return () => {
      socket.emit('leave', activeProject);
      socket.off('task:update', onUpdate);
      socket.off('task:create', onCreate);
      socket.off('task:delete', onDelete);
    };
  }, [activeProject]);

  const createProject = async () => {
    const newProjectDescription = `New Project ${projects.length + 1}`;
    const res = await axios.post('http://localhost:4000/api/projects', { description: newProjectDescription });
    setProjects(prev => [...prev, res.data]);
  };

  const editProject = (id, description) => {
    setEditingProjectId(id);
    setEditedProjectName(description);
  };

  const saveProject = async (id) => {
    await axios.put(`http://localhost:4000/api/projects/${id}`, { description: editedProjectName });
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, description: editedProjectName } : p)));
    cancelEdit();
  };

  const cancelEdit = () => {
    setEditingProjectId(null);
    setEditedProjectName('');
  };

  const deleteProject = async (id) => {
    await axios.delete(`http://localhost:4000/api/projects/${id}`);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject === id) {
      setActiveProject(null);
      setTasks([]);
    }
  };

  const createTask = async () => {
    if (!activeProject) return;
    const res = await axios.post(`http://localhost:4000/api/projects/${activeProject}/tasks`, {
      title: 'New Task',
      configuration: { priority: '', description: '' },
    });
    const task = res.data;
    socket.emit('task:create', task);
  };

  const deleteTask = async task => {
    try {
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setHistory(prev => [...prev, { type: 'delete', task }]);

      await axios.delete(`http://localhost:4000/api/tasks/${task.id}`);

      socket.emit('task:delete', { id: task.id, project_id: activeProject });
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };


  const startEditing = task => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditPriority(task.configuration?.priority || '');
    setEditDescription(task.configuration?.description || '');
  };

  const saveEdit = async () => {
    const updated = {
      ...editingTask,
      title: editTitle,
      configuration: {
        priority: editPriority,
        description: editDescription,
      },
    };
    await axios.put(`http://localhost:4000/api/tasks/${editingTask.id}`, updated);
    socket.emit('task:update', updated);
    setHistory(prev => [...prev, { type: 'update', before: editingTask, after: updated }]);
    setEditingTask(null);
  };

  const undo = () => {
    const last = history.pop();
    if (!last) return;
    setHistory([...history]);
    setFuture([last, ...future]);

    if (last.type === 'create') {
      axios.delete(`http://localhost:4000/api/tasks/${last.task.id}`);
      socket.emit('task:delete', { id: last.task.id, project_id: activeProject });
    } else if (last.type === 'delete') {
      axios.post(`http://localhost:4000/api/projects/${activeProject}/tasks`, last.task).then(res => {
        socket.emit('task:create', res.data);
      });
    } else if (last.type === 'update') {
      const { before } = last;
      axios.put(`http://localhost:4000/api/tasks/${before.id}`, {
        title: before.title,
        configuration: before.configuration || {},
      });
      socket.emit('task:update', before);
    }
  };

  const redo = () => {
    const next = future.shift();
    if (!next) return;
    setFuture([...future]);
    setHistory([...history, next]);

    if (next.type === 'create') {
      axios.post(`http://localhost:4000/api/projects/${activeProject}/tasks`, { title: next.task.title }).then(res => {
        socket.emit('task:create', res.data);
      });
    } else if (next.type === 'delete') {
      axios.delete(`http://localhost:4000/api/tasks/${next.task.id}`);
      socket.emit('task:delete', { id: next.task.id, project_id: activeProject });
    } else if (next.type === 'update') {
      const { after } = next;
      axios.put(`http://localhost:4000/api/tasks/${after.id}`, {
        title: after.title,
        configuration: after.configuration || {},
      });
      socket.emit('task:update', after);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Projects</h1>
      <button className="action" onClick={createProject}>Add Project</button>
      <ul className="projects-list mb-4">
        {projects.map(p => (
          <li key={p.id} className="project-item">
            {editingProjectId === p.id ? (
              <>
                <input
                  className="project-name-input"
                  value={editedProjectName}
                  onChange={e => setEditedProjectName(e.target.value)}
                />
                <button className="save" style={{ marginLeft: '10px' }} onClick={() => saveProject(p.id)}>Save</button>
                <button className="cancel" style={{ marginLeft: '5px' }} onClick={cancelEdit}>Cancel</button>
              </>
            ) : (
              <>
                <button
                  className={`project-name-button ${activeProject === p.id ? 'active' : ''}`}
                  onClick={() => setActiveProject(p.id)}
                >
                  {p.description}
                </button>
                <button className="edit" style={{ marginLeft: '10px' }} onClick={() => editProject(p.id, p.description)}>Edit</button>
                <button className="delete" style={{ marginLeft: '5px' }} onClick={() => deleteProject(p.id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>

      {activeProject && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Tasks for: {projects.find(p => p.id === activeProject)?.description}</h2>
          <ul>
            {tasks.map(task => (
              <li key={task.id} className="task-item">
                {editingTask?.id === task.id ? (
                  <div className="task-edit-form">
                    <input
                      className="task-title-input"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                    />
                    <select
                      className="task-priority-select"
                      value={editPriority}
                      onChange={e => setEditPriority(e.target.value)}
                    >
                      {PRIORITY_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt || 'Select Priority'}</option>
                      ))}
                    </select>
                    <input
                      className="task-description-input"
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                    />
                    <div className="task-buttons">
                      <button className="save" onClick={saveEdit}>Save</button>
                      <button className="cancel" onClick={() => setEditingTask(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="task-view">
                    <span className="task-title">{task.title}</span>
                    <span className="task-priority-label">{task.configuration?.priority || '-'}</span>
                    <span className="task-description-label">{task.configuration?.description || 'Task description'}</span>
                    <div className="task-buttons">
                      <button className="edit" onClick={() => startEditing(task)}>Edit</button>
                      <button className="delete" onClick={() => deleteTask(task)}>Delete</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button className="action" onClick={createTask}>Add Task</button>
          <div className="mt-4 space-x-2">
            <button className="action" onClick={undo}>Undo</button>
            <button className="action" style={{ marginLeft: '8px' }} onClick={redo}>Redo</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

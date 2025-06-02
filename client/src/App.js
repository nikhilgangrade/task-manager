import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import './App.css';

const socket = io('http://localhost:4000');
const PRIORITY_OPTIONS = ['', 'Low', 'Medium', 'High'];
const PRIORITY_COLORS = {
  Low: '#28a745',
  Medium: '#ffc107',
  High: '#dc3545',
};

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
  const suppressSocket = useRef(false);

  const updateHistory = (newHistory, newFuture = future) => {
    setHistory(newHistory);
    setFuture(newFuture);
    localStorage.setItem('taskHistory', JSON.stringify(newHistory));
    localStorage.setItem('taskFuture', JSON.stringify(newFuture));
  };

  useEffect(() => {
    axios.get('http://localhost:4000/api/projects').then(res => {
      setProjects(res.data);
      if (res.data.length && !activeProject) {
        setActiveProject(res.data[0].id);
      }
    });

    const savedHistory = localStorage.getItem('taskHistory');
    const savedFuture = localStorage.getItem('taskFuture');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    if (savedFuture) setFuture(JSON.parse(savedFuture));
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    axios.get(`http://localhost:4000/api/projects/${activeProject}/tasks`).then(res => setTasks(res.data));
    socket.emit('join', activeProject);

    const onUpdate = task => {
      if (suppressSocket.current) {
        suppressSocket.current = false;
        return;
      }
      setTasks(prev => prev.map(t => (t.id === task.id ? task : t)));
    };

    const onCreate = task => {
      if (suppressSocket.current) {
        suppressSocket.current = false;
        return;
      }
      if (task.project_id === activeProject) {
        setTasks(prev => [...prev, task]);
        updateHistory([...history, { type: 'create', task }]);
      }
    };

    const onDelete = id => {
      if (suppressSocket.current) {
        suppressSocket.current = false;
        return;
      }
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
    suppressSocket.current = true;
    setTasks(prev => [...prev, task]);
    socket.emit('task:create', task);
    updateHistory([...history, { type: 'create', task }]);
  };

  const deleteTask = async task => {
    try {
      const latest = tasks.find(t => t.id === task.id);
      const snapshot = JSON.parse(JSON.stringify(latest));

      setTasks(prev => prev.filter(t => t.id !== task.id));
      updateHistory([...history, { type: 'delete', task: snapshot }]);

      await axios.delete(`http://localhost:4000/api/tasks/${task.id}`);
      suppressSocket.current = true;
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
    const payload = {
      id: editingTask.id,
      project_id: activeProject,
      title: editTitle,
      configuration: {
        priority: editPriority,
        description: editDescription,
      },
    };

    const { data: updated } = await axios.put(`http://localhost:4000/api/tasks/${editingTask.id}`, payload);
    suppressSocket.current = true;
    socket.emit('task:update', updated);
    updateHistory([...history, { type: 'update', before: editingTask, after: updated }]);
    setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)));
    setEditingTask(null);
  };

  const undo = async () => {
    const last = history[history.length - 1];
    if (!last) return;
    const newHistory = history.slice(0, -1);
    const newFuture = [last, ...future];
    updateHistory(newHistory, newFuture);

    suppressSocket.current = true;

    try {
      switch (last.type) {
        case 'create':
          await axios.delete(`http://localhost:4000/api/tasks/${last.task.id}`);
          setTasks(prev => prev.filter(t => t.id !== last.task.id));
          socket.emit('task:delete', { id: last.task.id, project_id: last.task.project_id });
          break;
        case 'delete':
          const restored = last.task;
          await axios.post(`http://localhost:4000/api/projects/${restored.project_id}/tasks`, {
            id: restored.id,
            title: restored.title,
            configuration: restored.configuration,
          });
          setTasks(prev => [...prev, restored]);
          socket.emit('task:create', restored);
          break;
        case 'update':
          await axios.put(`http://localhost:4000/api/tasks/${last.before.id}`, {
            title: last.before.title,
            configuration: last.before.configuration,
          });
          setTasks(prev => prev.map(t => (t.id === last.before.id ? last.before : t)));
          socket.emit('task:update', last.before);
          break;
        default:
          console.warn('Unknown action type:', last.type);
      }
    } catch (err) {
      console.error('Undo failed:', err);
    }
  };

  const redo = async () => {
    const next = future[0];
    if (!next) return;
    const newFuture = future.slice(1);
    const newHistory = [...history, next];
    updateHistory(newHistory, newFuture);

    suppressSocket.current = true;

    try {
      switch (next.type) {
        case 'create':
          const created = next.task;
          await axios.post(`http://localhost:4000/api/projects/${created.project_id}/tasks`, {
            id: created.id,
            title: created.title,
            configuration: created.configuration,
          });
          setTasks(prev => [...prev, created]);
          socket.emit('task:create', created);
          break;
        case 'delete':
          await axios.delete(`http://localhost:4000/api/tasks/${next.task.id}`);
          setTasks(prev => prev.filter(t => t.id !== next.task.id));
          socket.emit('task:delete', { id: next.task.id, project_id: next.task.project_id });
          break;
        case 'update':
          await axios.put(`http://localhost:4000/api/tasks/${next.after.id}`, {
            title: next.after.title,
            configuration: next.after.configuration,
          });
          setTasks(prev => prev.map(t => (t.id === next.after.id ? next.after : t)));
          socket.emit('task:update', next.after);
          break;
        default:
          console.warn('Unknown action type:', next.type);
      }
    } catch (err) {
      console.error('Redo failed:', err);
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
                    <span
                      className="task-priority-label"
                      style={{ backgroundColor: PRIORITY_COLORS[task.configuration?.priority] || '#eee' }}
                    >
                      {task.configuration?.priority || '-'}
                    </span>
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
            <button className="action" onClick={undo} disabled={!history.length}>Undo</button>
            <button className="action" style={{ marginLeft: '8px' }} onClick={redo} disabled={!future.length}>Redo</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

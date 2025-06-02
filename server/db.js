// MySQL database connection setup
// const mysql = require('mysql2');
// const db = mysql.createConnection({
//   host: 'localhost',
//   user: 'root',          // Update with your MySQL user
//   password: 'Aashu@1995',          // Update with your MySQL password
//   database: 'task_manager',
// });

// module.exports = db;

// Since MySQL needed connection to the database using SQlite3
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.resolve(__dirname, 'taskmanager.db'));

const init = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT,
      configuration TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT,
      task_id TEXT,
      project_id TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
};

init();

module.exports = db;

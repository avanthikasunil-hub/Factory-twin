const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./loading_plan.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS loading_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_no TEXT,
      style_no TEXT,
      cone_no TEXT
    )
  `);
});

module.exports = db;

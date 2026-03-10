const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./loading_plan.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS loading_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_no TEXT,
      style_no TEXT,
      cone_no TEXT,
      buyer TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS style_status (
      line_no TEXT,
      style_no TEXT,
      con_no TEXT,
      status TEXT,
      PRIMARY KEY (line_no, style_no, con_no)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS style_ob (
      line_no TEXT,
      style_no TEXT,
      con_no TEXT,
      operations TEXT,
      total_smv REAL,
      ob_file_name TEXT,
      buyer TEXT,
      color TEXT,
      quantity INTEGER,
      PRIMARY KEY (line_no, style_no, con_no)
    )
  `);
});

module.exports = db;

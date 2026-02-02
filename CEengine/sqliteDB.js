const Database = require("better-sqlite3");

const db = Database("jobs.db", {
  verbose: console.log,
});

db.prepare(
  `CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobid TEXT, -- unique job/session identifier
    status TEXT CHECK(status IN ('queued', 'running', 'completed', 'error')) DEFAULT 'queued',
    inputCode TEXT, -- inputGenCode.py content
    outputCode TEXT, -- outputGenCode.py content
    MetaData TEXT, -- JSON string with problem statement, constraints, etc.
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

module.exports = db;

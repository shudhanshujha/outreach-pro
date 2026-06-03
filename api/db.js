const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'outreach.db');
const db = new Database(dbPath);

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    clientId TEXT,
    clientSecret TEXT,
    refreshToken TEXT
  );
`);

// Migration: Ensure columns exist (Render might have an old DB file)
const tableInfo = db.prepare("PRAGMA table_info(accounts)").all();
const columns = tableInfo.map(c => c.name);

let migrated = false;
if (!columns.includes('clientId')) {
  try {
    db.exec("ALTER TABLE accounts ADD COLUMN clientId TEXT");
    console.log("Database Migration: Added clientId column to accounts table.");
    migrated = true;
  } catch(e) {
    console.error("Migration Error adding clientId:", e);
  }
}
if (!columns.includes('clientSecret')) {
  try {
    db.exec("ALTER TABLE accounts ADD COLUMN clientSecret TEXT");
    console.log("Database Migration: Added clientSecret column to accounts table.");
    migrated = true;
  } catch(e) {
    console.error("Migration Error adding clientSecret:", e);
  }
}
if (!columns.includes('refreshToken')) {
  try {
    db.exec("ALTER TABLE accounts ADD COLUMN refreshToken TEXT");
    console.log("Database Migration: Added refreshToken column to accounts table.");
    migrated = true;
  } catch(e) {
    console.error("Migration Error adding refreshToken:", e);
  }
}
if (migrated) {
  console.log("Database migrations completed successfully.");
}


db.exec(`
  CREATE TABLE IF NOT EXISTS recipients (
    id TEXT PRIMARY KEY,
    email TEXT,
    name TEXT,
    business TEXT,
    unsubscribed INTEGER DEFAULT 0,
    UNIQUE(email)
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'idle',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sent_emails (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    recipient_email TEXT,
    account_email TEXT,
    status TEXT,
    opened_at DATETIME,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS follow_ups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT,
    delay_days INTEGER,
    subject TEXT,
    body TEXT,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS scheduled_emails (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    recipient_email TEXT,
    account_email TEXT,
    subject TEXT,
    body TEXT,
    scheduled_at DATETIME,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
  );
`);

module.exports = db;

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'outreach.db'));

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

if (!columns.includes('clientId')) {
  try { db.exec("ALTER TABLE accounts ADD COLUMN clientId TEXT"); } catch(e) {}
}
if (!columns.includes('clientSecret')) {
  try { db.exec("ALTER TABLE accounts ADD COLUMN clientSecret TEXT"); } catch(e) {}
}
if (!columns.includes('refreshToken')) {
  try { db.exec("ALTER TABLE accounts ADD COLUMN refreshToken TEXT"); } catch(e) {}
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

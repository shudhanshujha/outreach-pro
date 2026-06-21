const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'test_outreach.db');
const db = new Database(dbPath);

db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'idle',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

try {
  db.prepare(`INSERT OR REPLACE INTO campaigns (id, subject, body, status) VALUES (?, ?, ?, "running")`)
    .run('test-sqlite-1', 'Test1', 'Test1 Body');
  console.log('SQLite query succeeded!');
  
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get('test-sqlite-1');
  console.log('Campaign:', JSON.stringify(row));
} catch(e) {
  console.error('SQLite error:', e.message);
}

db.close();
require('fs').unlinkSync(dbPath);

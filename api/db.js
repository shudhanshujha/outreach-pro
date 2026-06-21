const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE,
        appPassword TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recipients (
        id TEXT,
        email TEXT,
        name TEXT,
        business TEXT,
        unsubscribed INTEGER DEFAULT 0,
        UNIQUE(email)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        subject TEXT,
        body TEXT,
        status TEXT DEFAULT 'idle',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sent_emails (
        id TEXT PRIMARY KEY,
        campaign_id TEXT,
        recipient_email TEXT,
        account_email TEXT,
        status TEXT,
        opened_at TIMESTAMP,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id SERIAL PRIMARY KEY,
        campaign_id TEXT,
        delay_days INTEGER,
        subject TEXT,
        body TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_emails (
        id TEXT PRIMARY KEY,
        campaign_id TEXT,
        recipient_email TEXT,
        account_email TEXT,
        subject TEXT,
        body TEXT,
        scheduled_at TIMESTAMP,
        status TEXT DEFAULT 'pending'
      );
    `);
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDB();

module.exports = pool;

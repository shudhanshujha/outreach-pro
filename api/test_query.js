const { Pool } = require('pg');

const pool = new Pool({
  host: 'db.usycsxknizcjbuftuzqr.supabase.co',
  port: 6543,
  database: 'postgres',
  user: 'postgres',
  password: '7545006695@Mayank',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await pool.query(
      `INSERT INTO campaigns (id, subject, body, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET subject = $2, body = $3, status = $4`,
      ['test-id-3', 'Test', 'Body', 'running']
    );
    console.log('Insert succeeded!');
    const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', ['test-id-3']);
    console.log('Campaign:', JSON.stringify(rows[0]));
  } catch(e) { console.error('Error:', e.message); }
  await pool.end();
})();

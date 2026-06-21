require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { ImapFlow } = require('imapflow');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createTransporter(account) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: account.email,
      pass: account.appPassword
    }
  });
}

app.get('/', (req, res) => {
  res.send('OutreachPro Backend is running');
});

// ============================================================
// ACCOUNTS
// ============================================================

app.get('/api/accounts', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT email FROM accounts');
    res.json({ accounts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  const { email, appPassword } = req.body;
  if (!email || !appPassword) {
    return res.status(400).json({ error: 'Email and app password are required' });
  }
  try {
    await pool.query(
      'INSERT INTO accounts (email, appPassword) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET appPassword = $2',
      [email, appPassword]
    );
    res.json({ success: true, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:email', async (req, res) => {
  try {
    await pool.query('DELETE FROM accounts WHERE email = $1', [req.params.email]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// TRACKING PIXEL
// ============================================================
app.get('/api/t/:id.png', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sent_emails WHERE id = $1', [req.params.id]);
    const emailData = rows[0];
    if (emailData && !emailData.opened_at) {
      await pool.query('UPDATE sent_emails SET opened_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
      const { rows: followUps } = await pool.query('SELECT * FROM follow_ups WHERE campaign_id = $1', [emailData.campaign_id]);
      for (const fu of followUps) {
        const scheduledTime = new Date();
        scheduledTime.setDate(scheduledTime.getDate() + fu.delay_days);
        await pool.query(
          'INSERT INTO scheduled_emails (id, campaign_id, recipient_email, account_email, subject, body, scheduled_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING',
          [uuidv4(), emailData.campaign_id, emailData.recipient_email, emailData.account_email, fu.subject, fu.body, scheduledTime.toISOString()]
        );
      }
    }
  } catch (err) { console.error('Tracking error:', err); }
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store' });
  res.end(pixel);
});

// ============================================================
// UNSUBSCRIBE
// ============================================================
app.get('/api/unsubscribe/:email', async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO recipients (id, email, unsubscribed) VALUES ($1, $2, 1) ON CONFLICT (email) DO UPDATE SET unsubscribed = 1',
      [uuidv4(), req.params.email]
    );
    await pool.query(
      'UPDATE scheduled_emails SET status = $1 WHERE recipient_email = $2 AND status = $3',
      ['cancelled', req.params.email, 'pending']
    );
    res.send('<h1>Unsubscribed successfully.</h1>');
  } catch (err) { res.status(500).send('Error'); }
});

// ============================================================
// BACKGROUND WORKER
// ============================================================
async function runBackgroundWorker() {
  try {
    const now = new Date().toISOString();
    const { rows: pending } = await pool.query('SELECT * FROM scheduled_emails WHERE status = $1 AND scheduled_at <= $2', ['pending', now]);
    for (const email of pending) {
      const { rows: accountRows } = await pool.query('SELECT * FROM accounts WHERE email = $1', [email.account_email]);
      const account = accountRows[0];
      if (!account || !account.appPassword) continue;
      try {
        const transporter = createTransporter(account);
        const sentId = uuidv4();
        await transporter.sendMail({
          from: email.account_email,
          to: email.recipient_email,
          subject: email.subject,
          html: email.body +
            '<img src="' + BASE_URL + '/api/t/' + sentId + '.png" width="1" height="1" style="display:none" />' +
            '<div style="margin-top:40px;font-size:11px;color:#999"><a href="' + BASE_URL + '/api/unsubscribe/' + email.recipient_email + '">Unsubscribe</a></div>'
        });
        await pool.query('UPDATE scheduled_emails SET status = $1 WHERE id = $2', ['sent', email.id]);
        await pool.query(
          'INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES ($1, $2, $3, $4, $5)',
          [sentId, email.campaign_id, email.recipient_email, email.account_email, 'sent']
        );
      } catch (err) { console.error('Follow-up send failed:', err.message); }
    }
  } catch (err) { console.error('Worker error:', err); }
}
setInterval(runBackgroundWorker, 60 * 1000);

// ============================================================
// CAMPAIGN SEND
// ============================================================
let activeLogs = [];
let activeStatus = 'idle';
let activeStop = false;

app.post('/api/send', async (req, res) => {
  if (activeStatus === 'running') return res.status(400).json({ error: 'A campaign is already running' });

  const { accounts: accountEmails, recipients, subject, body, delayMin, delayMax, followUps = [], campaignId = uuidv4() } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'No recipients provided' });
  }
  if (!accountEmails || !Array.isArray(accountEmails) || accountEmails.length === 0) {
    return res.status(400).json({ error: 'No accounts selected' });
  }

  activeStatus = 'running';
  activeStop = false;
  activeLogs = [];
  activeLogs.push({ text: 'Campaign starting...', type: 'info', timestamp: new Date() });

  res.json({ message: 'Started', campaignId });

  (async () => {
    try {
      await pool.query(
        'INSERT INTO campaigns (id, subject, body, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET subject = $2, body = $3, status = $4',
        [campaignId, subject, body, 'running']
      );

      for (const fu of followUps) {
        await pool.query(
          'INSERT INTO follow_ups (campaign_id, delay_days, subject, body) VALUES ($1, $2, $3, $4)',
          [campaignId, fu.delayDays, fu.subject, fu.body]
        );
      }

      for (let i = 0; i < recipients.length; i++) {
        if (activeStop) {
          activeLogs.push({ text: 'Campaign stopped by user.', type: 'info', timestamp: new Date() });
          break;
        }

        const recipient = recipients[i];
        if (!recipient.email) {
          activeLogs.push({ text: 'Skipping recipient with no email at index ' + i, type: 'info', timestamp: new Date() });
          continue;
        }

        const { rows: unsubRows } = await pool.query('SELECT unsubscribed FROM recipients WHERE email = $1', [recipient.email]);
        const isUnsubbed = unsubRows[0];
        if (isUnsubbed?.unsubscribed) {
          activeLogs.push({ text: 'Skipping ' + recipient.email + ' (unsubscribed)', type: 'info', timestamp: new Date() });
          continue;
        }

        const accEmail = accountEmails[i % accountEmails.length].user;
        const { rows: accountRows } = await pool.query('SELECT * FROM accounts WHERE email = $1', [accEmail]);
        const account = accountRows[0];

        if (!account || !account.appPassword) {
          activeLogs.push({ text: 'Account ' + accEmail + ' has no app password set.', type: 'error', timestamp: new Date() });
          continue;
        }

        activeLogs.push({ text: '[' + (i + 1) + '/' + recipients.length + '] Sending to ' + recipient.email + ' via ' + accEmail + '...', timestamp: new Date() });

        try {
          const transporter = createTransporter(account);
          const sentId = uuidv4();
          const pSubject = subject.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '');
          const pBody = body.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '') +
            '<img src="' + BASE_URL + '/api/t/' + sentId + '.png" width="1" height="1" style="display:none" />' +
            '<div style="margin-top:40px;font-size:11px;color:#999"><a href="' + BASE_URL + '/api/unsubscribe/' + recipient.email + '">Unsubscribe</a></div>';

          await transporter.sendMail({ from: accEmail, to: recipient.email, subject: pSubject, html: pBody });
          await pool.query(
            'INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES ($1, $2, $3, $4, $5)',
            [sentId, campaignId, recipient.email, accEmail, 'sent']
          );
          activeLogs.push({ text: 'Sent to ' + recipient.email, type: 'success', timestamp: new Date() });
        } catch (err) {
          console.error('Email send error:', err);
          activeLogs.push({ text: 'Failed to send to ' + recipient.email + ': ' + err.message, type: 'error', timestamp: new Date() });
        }

        if (!activeStop && i < recipients.length - 1) {
          const delay = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
          await sleep(delay);
        }
      }

      activeStatus = activeStop ? 'stopped' : 'completed';
      await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', [activeStatus, campaignId]);
      activeLogs.push({ text: 'Campaign ' + activeStatus + '.', type: 'info', timestamp: new Date() });
    } catch (err) {
      console.error('Fatal campaign error:', err);
      activeStatus = 'idle';
      activeLogs.push({ text: 'Fatal Error: ' + err.message, type: 'error', timestamp: new Date() });
    }
  })();
});

app.post('/api/stop', (req, res) => {
  activeStop = true;
  res.json({ message: 'Stopped' });
});

app.get('/api/logs', (req, res) => res.json({ logs: activeLogs, status: activeStatus }));

// ============================================================
// INBOX (via IMAP)
// ============================================================
app.post('/api/inbox', async (req, res) => {
  const { account } = req.body;
  if (!account?.user) return res.status(400).json({ error: 'No account specified' });

  try {
    const { rows: dbAccountRows } = await pool.query('SELECT * FROM accounts WHERE email = $1', [account.user]);
    const dbAccount = dbAccountRows[0];
    if (!dbAccount || !dbAccount.appPassword) {
      return res.status(404).json({ error: 'Account not found or no app password set.' });
    }

    const imap = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: account.user,
        pass: dbAccount.appPassword
      },
      logger: false
    });

    await imap.connect();
    await imap.mailboxOpen('INBOX');

    const messages = [];
    for await (const msg of imap.fetch('1:*', { envelope: true, uid: true })) {
      const from = msg.envelope.from?.[0];
      if (!from) continue;
      messages.push({
        subject: msg.envelope.subject || '(No Subject)',
        from: from.address,
        date: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
        uid: msg.uid
      });
      if (messages.length >= 50) break;
    }

    await imap.logout();
    res.json({ messages });
  } catch (err) {
    console.error('Inbox fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENRICH (stub)
// ============================================================
app.post('/api/enrich', (req, res) => {
  res.status(501).json({ error: 'Lead enrichment requires a Hunter.io API key. Set HUNTER_API_KEY in .env to enable.' });
});

// ============================================================
// 404 HANDLER
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found: ' + req.method + ' ' + req.path });
});

// ============================================================
// START
// ============================================================
if (process.env.NODE_ENV !== 'production' || process.env.RENDER) {
  app.listen(PORT, () => console.log('Backend running on port ' + PORT));
}

module.exports = app;

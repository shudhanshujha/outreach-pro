const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { ImapFlow } = require('imapflow');
const { google } = require('googleapis');
const dns = require('dns');
const dnsPromises = dns.promises;

// Force IPv4 globally to prevent ENETUNREACH on Render
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================
// HELPERS
// ============================================================

async function createTransporter(account, userEmail) {
  let smtpIp = 'smtp.gmail.com';
  try {
    const addresses = await dnsPromises.resolve4('smtp.gmail.com');
    if (addresses && addresses.length > 0) {
      smtpIp = addresses[0];
      console.log('Resolved smtp.gmail.com to IPv4: ' + smtpIp);
    }
  } catch (dnsErr) {
    console.warn('DNS Resolution failed, falling back to hostname:', dnsErr.message);
  }

  const oAuth2Client = new google.auth.OAuth2(
    account.clientId,
    account.clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  oAuth2Client.setCredentials({ refresh_token: account.refreshToken });
  
  const accessToken = await new Promise((resolve, reject) => {
    oAuth2Client.getAccessToken((err, token) => {
      if (err) reject(err);
      resolve(token);
    });
  });

  return nodemailer.createTransport({
    host: smtpIp,
    port: 587,
    secure: false, // STARTTLS
    requireTLS: true,
    family: 4,     // Force IPv4
    tls: {
      servername: 'smtp.gmail.com',
      rejectUnauthorized: false
    },
    auth: {
      type: 'OAuth2',
      user: userEmail,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      refreshToken: account.refreshToken,
      accessToken: accessToken
    }
  });
}

function getRedirectUri(req) {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL + '/api/auth/callback';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return protocol + '://' + host + '/api/auth/callback';
}

// ============================================================
// ROUTES
// ============================================================

app.get('/', (req, res) => {
  res.send('OutreachPro Backend is running ✅');
});

app.get('/api/auth/google', (req, res) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(req)
  );
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://mail.google.com/', 
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ]
  });
  res.redirect(url);
});

app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri(req)
    );
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const email = ticket.getPayload().email;

    db.prepare('INSERT OR REPLACE INTO accounts (email, clientId, clientSecret, refreshToken) VALUES (?, ?, ?, ?)')
      .run(email, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, tokens.refresh_token);

    res.send('<h1>Account Connected!</h1><p>Email: ' + email + '</p><script>setTimeout(() => window.close(), 2000)</script>');
  } catch (err) {
    console.error('Auth callback error:', err);
    res.status(500).send('Auth Error: ' + err.message);
  }
});

app.get('/api/accounts', (req, res) => {
  try {
    const accounts = db.prepare('SELECT email FROM accounts').all();
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:email', (req, res) => {
  try {
    db.prepare('DELETE FROM accounts WHERE email = ?').run(req.params.email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/t/:id.png', (req, res) => {
  try {
    const emailData = db.prepare('SELECT * FROM sent_emails WHERE id = ?').get(req.params.id);
    if (emailData && !emailData.opened_at) {
      db.prepare('UPDATE sent_emails SET opened_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
      const followUps = db.prepare('SELECT * FROM follow_ups WHERE campaign_id = ?').all(emailData.campaign_id);
      for (const fu of followUps) {
        const scheduledTime = new Date();
        scheduledTime.setDate(scheduledTime.getDate() + fu.delay_days);
        db.prepare('INSERT OR IGNORE INTO scheduled_emails (id, campaign_id, recipient_email, account_email, subject, body, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), emailData.campaign_id, emailData.recipient_email, emailData.account_email, fu.subject, fu.body, scheduledTime.toISOString());
      }
    }
  } catch (err) { console.error('Tracking error:', err); }
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store' });
  res.end(pixel);
});

app.get('/api/unsubscribe/:email', (req, res) => {
  try {
    db.prepare('INSERT OR REPLACE INTO recipients (id, email, unsubscribed) VALUES (?, ?, 1)').run(uuidv4(), req.params.email);
    db.prepare('UPDATE scheduled_emails SET status = "cancelled" WHERE recipient_email = ? AND status = "pending"').run(req.params.email);
    res.send('<h1>Unsubscribed successfully.</h1>');
  } catch (err) { res.status(500).send('Error'); }
});

async function runBackgroundWorker() {
  try {
    const now = new Date().toISOString();
    const pending = db.prepare('SELECT * FROM scheduled_emails WHERE status = "pending" AND scheduled_at <= ?').all(now);
    for (const email of pending) {
      const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email.account_email);
      if (!account) continue;
      try {
        const transporter = await createTransporter(account, email.account_email);
        const sentId = uuidv4();
        await transporter.sendMail({
          from: email.account_email,
          to: email.recipient_email,
          subject: email.subject,
          html: email.body +
            '<img src="' + BASE_URL + '/api/t/' + sentId + '.png" width="1" height="1" style="display:none" />' +
            '<div style="margin-top:40px;font-size:11px;color:#999"><a href="' + BASE_URL + '/api/unsubscribe/' + email.recipient_email + '">Unsubscribe</a></div>'
        });
        db.prepare('UPDATE scheduled_emails SET status = "sent" WHERE id = ?').run(email.id);
        db.prepare('INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES (?, ?, ?, ?, "sent")')
          .run(sentId, email.campaign_id, email.recipient_email, email.account_email);
      } catch (err) { console.error('Follow-up failed:', err.message); }
    }
  } catch (err) { console.error('Worker error:', err); }
}
setInterval(runBackgroundWorker, 60 * 60 * 1000);

let activeLogs = [];
let activeStatus = 'idle';
let activeStop = false;

app.post('/api/send', async (req, res) => {
  if (activeStatus === 'running') return res.status(400).json({ error: 'Running' });
  const { accounts: accountEmails, recipients, subject, body, delayMin, delayMax, followUps = [], campaignId = uuidv4() } = req.body;
  activeStatus = 'running';
  activeStop = false;
  activeLogs = [];
  res.json({ message: 'Started', campaignId });
  (async () => {
    try {
      db.prepare('INSERT OR REPLACE INTO campaigns (id, subject, body, status) VALUES (?, ?, ?, "running")').run(campaignId, subject, body);
      for (const fu of followUps) {
        db.prepare('INSERT INTO follow_ups (campaign_id, delay_days, subject, body) VALUES (?, ?, ?, ?)').run(campaignId, fu.delayDays, fu.subject, fu.body);
      }
      for (let i = 0; i < recipients.length; i++) {
        if (activeStop) {
          activeLogs.push({ text: '🛑 Campaign stopped.', type: 'info', timestamp: new Date() });
          break;
        }
        const recipient = recipients[i];
        const isUnsubbed = db.prepare('SELECT unsubscribed FROM recipients WHERE email = ?').get(recipient.email);
        if (isUnsubbed?.unsubscribed) continue;
        const accEmail = accountEmails[i % accountEmails.length].user;
        const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(accEmail);
        if (!account) {
          activeLogs.push({ text: '✗ Account ' + accEmail + ' not found', type: 'error', timestamp: new Date() });
          continue;
        }
        activeLogs.push({ text: 'Sending to ' + recipient.email + ' via ' + accEmail + '...', timestamp: new Date() });
        try {
          const transporter = await createTransporter(account, accEmail);
          const sentId = uuidv4();
          const pSubject = subject.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '');
          const pBody = body.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '') +
            '<img src="' + BASE_URL + '/api/t/' + sentId + '.png" width="1" height="1" style="display:none" />' +
            '<div style="margin-top:40px;font-size:11px;color:#999"><a href="' + BASE_URL + '/api/unsubscribe/' + recipient.email + '">Unsubscribe</a></div>';
          await transporter.sendMail({ from: accEmail, to: recipient.email, subject: pSubject, html: pBody });
          db.prepare('INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES (?, ?, ?, ?, "sent")').run(sentId, campaignId, recipient.email, accEmail);
          activeLogs.push({ text: '✓ Sent to ' + recipient.email, type: 'success', timestamp: new Date() });
        } catch (err) {
          activeLogs.push({ text: '✗ Error: ' + err.message, type: 'error', timestamp: new Date() });
        }
        if (!activeStop && i < recipients.length - 1) await sleep(Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000);
      }
      activeStatus = activeStop ? 'stopped' : 'completed';
      db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(activeStatus, campaignId);
    } catch (err) { activeStatus = 'idle'; }
  })();
});

app.post('/api/stop', (req, res) => {
  activeStop = true;
  res.json({ message: 'Stopped' });
});

app.get('/api/logs', (req, res) => res.json({ logs: activeLogs, status: activeStatus }));

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log('Backend running on port ' + PORT));
}

module.exports = app;

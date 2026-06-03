const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { ImapFlow } = require('imapflow');
const { google } = require('googleapis');
const dns = require('dns');

// ✅ Force IPv4 globally — prevents ENETUNREACH on Render (IPv6 not supported)
dns.setDefaultResultOrder('ipv4first');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================
// HELPERS
// ============================================================

/** Build a Google OAuth2 client using stored account credentials */
function buildAccountOAuth2(account) {
  const client = new google.auth.OAuth2(
    account.clientId,
    account.clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  client.setCredentials({ refresh_token: account.refreshToken });
  return client;
}

/** Create a nodemailer transporter forced to IPv4 via port 587 (STARTTLS) */
async function createTransporter(account, userEmail) {
  const oAuth2Client = buildAccountOAuth2(account);
  const accessTokenResult = await oAuth2Client.getAccessToken();

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,          // STARTTLS — works on Render (IPv4), port 465 does NOT
    family: 4,              // Explicit IPv4 fallback
    auth: {
      type: 'OAuth2',
      user: userEmail,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      refreshToken: account.refreshToken,
      accessToken: accessTokenResult.token
    }
  });
}

/** Build redirect URI from request headers (supports Render + localhost) */
function getRedirectUri(req) {
  if (process.env.BACKEND_URL) return `${process.env.BACKEND_URL}/api/auth/callback`;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}/api/auth/callback`;
}

// ============================================================
// ROUTES
// ============================================================

app.get('/', (req, res) => {
  res.send('OutreachPro Backend is running ✅');
});

// --- OAuth ---
app.get('/api/auth/google', (req, res) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(req)
  );
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://mail.google.com/', 'https://www.googleapis.com/auth/userinfo.email']
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

    res.send('<h1 style="font-family:sans-serif;color:#16a34a">✅ Account Connected!</h1><p>You can close this window.</p><script>setTimeout(() => window.close(), 1500)</script>');
  } catch (err) {
    console.error('Auth callback error:', err);
    res.status(500).send(`Auth Error: ${err.message}`);
  }
});

// --- Accounts ---
app.get('/api/accounts', (req, res) => {
  const accounts = db.prepare('SELECT email FROM accounts').all();
  res.json({ accounts });
});

app.delete('/api/accounts/:email', (req, res) => {
  try {
    db.prepare('DELETE FROM accounts WHERE email = ?').run(req.params.email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Tracking Pixel ---
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

// --- Unsubscribe ---
app.get('/api/unsubscribe/:email', (req, res) => {
  try {
    db.prepare('INSERT OR REPLACE INTO recipients (id, email, unsubscribed) VALUES (?, ?, 1)').run(uuidv4(), req.params.email);
    db.prepare('UPDATE scheduled_emails SET status = "cancelled" WHERE recipient_email = ? AND status = "pending"').run(req.params.email);
    res.send('<h1 style="font-family:sans-serif">Unsubscribed successfully.</h1>');
  } catch (err) { res.status(500).send('Error'); }
});

// ============================================================
// BACKGROUND WORKER — follow-up emails (every 1 hour)
// ============================================================
async function runBackgroundWorker() {
  try {
    const now = new Date().toISOString();
    const pending = db.prepare('SELECT * FROM scheduled_emails WHERE status = "pending" AND scheduled_at <= ?').all(now);
    console.log(`Worker: ${pending.length} follow-ups to send`);

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
            `<img src="${BASE_URL}/api/t/${sentId}.png" width="1" height="1" style="display:none" />` +
            `<div style="margin-top:40px;font-size:11px;color:#999"><a href="${BASE_URL}/api/unsubscribe/${email.recipient_email}">Unsubscribe</a></div>`
        });
        db.prepare('UPDATE scheduled_emails SET status = "sent" WHERE id = ?').run(email.id);
        db.prepare('INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES (?, ?, ?, ?, "sent")')
          .run(sentId, email.campaign_id, email.recipient_email, email.account_email);
      } catch (err) { console.error('Follow-up failed:', err.message); }
    }
  } catch (err) { console.error('Worker error:', err); }
}
setInterval(runBackgroundWorker, 60 * 60 * 1000);

// ============================================================
// CAMPAIGN SENDING
// ============================================================
let activeLogs = [];
let activeStatus = 'idle';
let activeStop = false;          // ✅ Stop flag
let activeCampaignId = null;

// Start campaign
app.post('/api/send', async (req, res) => {
  if (activeStatus === 'running') return res.status(400).json({ error: 'A campaign is already running. Stop it first.' });

  const { accounts: accountEmails, recipients, subject, body, delayMin, delayMax, followUps = [], campaignId = uuidv4() } = req.body;

  activeStatus = 'running';
  activeStop = false;
  activeLogs = [];
  activeCampaignId = campaignId;
  res.json({ message: 'Started', campaignId });

  (async () => {
    try {
      db.prepare('INSERT OR REPLACE INTO campaigns (id, subject, body, status) VALUES (?, ?, ?, "running")')
        .run(campaignId, subject, body);
      for (const fu of followUps) {
        db.prepare('INSERT INTO follow_ups (campaign_id, delay_days, subject, body) VALUES (?, ?, ?, ?)')
          .run(campaignId, fu.delayDays, fu.subject, fu.body);
      }

      for (let i = 0; i < recipients.length; i++) {
        // ✅ Check stop flag before each email
        if (activeStop) {
          activeLogs.push({ text: '🛑 Campaign stopped by user.', type: 'info', timestamp: new Date() });
          break;
        }

        const recipient = recipients[i];
        const isUnsubbed = db.prepare('SELECT unsubscribed FROM recipients WHERE email = ?').get(recipient.email);
        if (isUnsubbed?.unsubscribed) continue;

        const accEmail = accountEmails[i % accountEmails.length].user;
        const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(accEmail);

        if (!account) {
          activeLogs.push({ text: `✗ Account ${accEmail} not found in DB`, type: 'error', timestamp: new Date() });
          continue;
        }

        activeLogs.push({ text: `Sending to ${recipient.email} via ${accEmail}...`, timestamp: new Date() });

        try {
          const transporter = await createTransporter(account, accEmail);
          const sentId = uuidv4();
          const pSubject = subject.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '');
          const pBody = body.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '') +
            `<img src="${BASE_URL}/api/t/${sentId}.png" width="1" height="1" style="display:none" />` +
            `<div style="margin-top:40px;font-size:11px;color:#999"><a href="${BASE_URL}/api/unsubscribe/${recipient.email}">Unsubscribe</a></div>`;

          await transporter.sendMail({ from: accEmail, to: recipient.email, subject: pSubject, html: pBody });
          db.prepare('INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES (?, ?, ?, ?, "sent")')
            .run(sentId, campaignId, recipient.email, accEmail);
          activeLogs.push({ text: `✓ Sent to ${recipient.email}`, type: 'success', timestamp: new Date() });
        } catch (err) {
          activeLogs.push({ text: `✗ Error sending to ${recipient.email}: ${err.message}`, type: 'error', timestamp: new Date() });
        }

        if (!activeStop && i < recipients.length - 1) {
          const delay = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
          await sleep(delay);
        }
      }

      const finalStatus = activeStop ? 'stopped' : 'completed';
      activeStatus = finalStatus;
      db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(finalStatus, campaignId);
    } catch (err) {
      console.error('Campaign error:', err);
      activeStatus = 'idle';
    }
  })();
});

// ✅ Stop campaign
app.post('/api/stop', (req, res) => {
  if (activeStatus !== 'running') return res.json({ message: 'No campaign running.' });
  activeStop = true;
  res.json({ message: 'Stop signal sent. Campaign will stop after current email.' });
});

// Logs & status
app.get('/api/logs', (req, res) => res.json({ logs: activeLogs, status: activeStatus }));

app.listen(PORT, () => console.log(`OutreachPro backend running on port ${PORT}`));

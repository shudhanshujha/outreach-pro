const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { ImapFlow } = require('imapflow');
const { google } = require('googleapis');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/', (req, res) => {
  res.send('OutreachPro Backend Pro is running with Streamlined OAuth!');
});

// --- ONE-CLICK OAUTH FLOW ---

const getOAuth2Client = (req) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const redirectUri = process.env.BACKEND_URL 
    ? `${process.env.BACKEND_URL}/api/auth/callback`
    : `${protocol}://${host}/api/auth/callback`;
  
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

app.get('/api/auth/google', (req, res) => {
  const client = getOAuth2Client(req);
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
    const client = getOAuth2Client(req);
    const { tokens } = await client.getToken(code);
    
    // Get user email
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const email = ticket.getPayload().email;

    // Save to DB
    db.prepare('INSERT OR REPLACE INTO accounts (email, clientId, clientSecret, refreshToken) VALUES (?, ?, ?, ?)')
      .run(email, process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, tokens.refresh_token);

    res.send('<h1>Account Connected Successfully!</h1><p>You can close this window now.</p><script>setTimeout(() => window.close(), 2000)</script>');
  } catch (err) {
    res.status(500).send(`Auth Error: ${err.message}`);
  }
});

app.get('/api/accounts', (req, res) => {
  const accounts = db.prepare('SELECT email FROM accounts').all();
  res.json({ accounts });
});

app.delete('/api/accounts/:email', (req, res) => {
  const email = req.params.email;
  try {
    db.prepare('DELETE FROM accounts WHERE email = ?').run(email);
    res.json({ success: true, message: `Account ${email} removed.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. OPEN TRACKING PIXEL
app.get('/api/t/:id.png', (req, res) => {
  const id = req.params.id;
  try {
    const emailData = db.prepare('SELECT * FROM sent_emails WHERE id = ?').get(id);
    if (emailData && !emailData.opened_at) {
      db.prepare('UPDATE sent_emails SET opened_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      
      const campaignId = emailData.campaign_id;
      const recipientEmail = emailData.recipient_email;
      const accountEmail = emailData.account_email;
      const followUps = db.prepare('SELECT * FROM follow_ups WHERE campaign_id = ?').all(campaignId);

      for (const fu of followUps) {
        const scheduledTime = new Date();
        scheduledTime.setDate(scheduledTime.getDate() + fu.delay_days);
        db.prepare(`
          INSERT INTO scheduled_emails (id, campaign_id, recipient_email, account_email, subject, body, scheduled_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), campaignId, recipientEmail, accountEmail, fu.subject, fu.body, scheduledTime.toISOString());
      }
    }
  } catch (err) { console.error('Tracking error:', err); }
  
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
  res.end(pixel);
});

// 2. UNSUBSCRIBE
app.get('/api/unsubscribe/:email', (req, res) => {
  const email = req.params.email;
  try {
    db.prepare('INSERT OR REPLACE INTO recipients (id, email, unsubscribed) VALUES (?, ?, 1)').run(uuidv4(), email);
    db.prepare('UPDATE scheduled_emails SET status = "cancelled" WHERE recipient_email = ? AND status = "pending"').run(email);
    res.send('<h1>Unsubscribed successfully.</h1>');
  } catch (err) { res.status(500).send('Error'); }
});

// --- BACKGROUND WORKER (Runs every 1 hour) ---
async function runBackgroundWorker() {
  console.log('Checking for scheduled follow-ups...');
  try {
    const now = new Date().toISOString();
    const pending = db.prepare('SELECT * FROM scheduled_emails WHERE status = "pending" AND scheduled_at <= ?').all(now);

    for (const email of pending) {
      const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email.account_email);
      if (!account) continue;

      try {
        const oAuth2Client = new google.auth.OAuth2(account.clientId, account.clientSecret, 'https://developers.google.com/oauthplayground');
        oAuth2Client.setCredentials({ refresh_token: account.refreshToken });
        const accessToken = await oAuth2Client.getAccessToken();

        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            type: 'OAuth2',
            user: email.account_email,
            clientId: account.clientId,
            clientSecret: account.clientSecret,
            refreshToken: account.refreshToken,
            accessToken: accessToken.token
          }
        });

        const sentId = uuidv4();
        const trackingPixel = `<img src="${BASE_URL}/api/t/${sentId}.png" width="1" height="1" style="display:none" />`;
        const unsubLink = `<div style="margin-top:50px; font-size:12px; color:#666">Don't want these emails? <a href="${BASE_URL}/api/unsubscribe/${email.recipient_email}">Unsubscribe here</a></div>`;

        await transporter.sendMail({
          from: email.account_email,
          to: email.recipient_email,
          subject: email.subject,
          html: email.body + trackingPixel + unsubLink
        });

        db.prepare('UPDATE scheduled_emails SET status = "sent" WHERE id = ?').run(email.id);
        db.prepare('INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES (?, ?, ?, ?, ?)')
          .run(sentId, email.campaign_id, email.recipient_email, email.account_email, 'sent');
      } catch (err) { console.error(`Follow-up failed:`, err.message); }
    }
  } catch (err) { console.error('Worker error:', err); }
}
setInterval(runBackgroundWorker, 1000 * 60 * 60);

// 3. SEND CAMPAIGN
let activeLogs = [];
let activeStatus = 'idle';

app.post('/api/send', async (req, res) => {
  const { accounts: accountEmails, recipients, subject, body, delayMin, delayMax, followUps = [], campaignId = uuidv4() } = req.body;
  if (activeStatus === 'running') return res.status(400).json({ error: 'Running' });

  activeStatus = 'running';
  activeLogs = [];
  res.json({ message: 'Started', campaignId });

  (async () => {
    try {
      db.prepare('INSERT OR REPLACE INTO campaigns (id, subject, body, status) VALUES (?, ?, ?, ?)')
        .run(campaignId, subject, body, 'running');
      for (const fu of followUps) {
        db.prepare('INSERT INTO follow_ups (campaign_id, delay_days, subject, body) VALUES (?, ?, ?, ?)')
          .run(campaignId, fu.delayDays, fu.subject, fu.body);
      }

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const isUnsubbed = db.prepare('SELECT unsubscribed FROM recipients WHERE email = ?').get(recipient.email);
        if (isUnsubbed?.unsubscribed) continue;

        const accEmail = accountEmails[i % accountEmails.length].user;
        const account = db.prepare('SELECT * FROM accounts WHERE email = ?').get(accEmail);
        
        if (!account) {
          activeLogs.push({ text: `✗ Error: Account ${accEmail} not found in DB`, type: 'error', timestamp: new Date() });
          continue;
        }

        const sentId = uuidv4();
        activeLogs.push({ text: `Sending to ${recipient.email} using ${accEmail}...`, timestamp: new Date() });

        try {
          const oAuth2Client = new google.auth.OAuth2(account.clientId, account.clientSecret, 'https://developers.google.com/oauthplayground');
          oAuth2Client.setCredentials({ refresh_token: account.refreshToken });
          const accessToken = await oAuth2Client.getAccessToken();

          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              type: 'OAuth2',
              user: accEmail,
              clientId: account.clientId,
              clientSecret: account.clientSecret,
              refreshToken: account.refreshToken,
              accessToken: accessToken.token
            }
          });

          const pSubject = subject.replace(/{{(\w+)}}/g, (_, k) => recipient[k] || '');
          const pBody = body.replace(/{{(\w+)}}/g, (_, k) => recipient[k] || '') + 
                        `<img src="${BASE_URL}/api/t/${sentId}.png" width="1" height="1" style="display:none" />` +
                        `<div style="margin-top:50px; font-size:12px; color:#666"><a href="${BASE_URL}/api/unsubscribe/${recipient.email}">Unsubscribe</a></div>`;

          await transporter.sendMail({ from: account.user, to: recipient.email, subject: pSubject, html: pBody });
          db.prepare('INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES (?, ?, ?, ?, ?)')
            .run(sentId, campaignId, recipient.email, account.user, 'sent');
          activeLogs.push({ text: `✓ Sent to ${recipient.email}`, type: 'success', timestamp: new Date() });
        } catch (err) { activeLogs.push({ text: `✗ Error: ${err.message}`, type: 'error', timestamp: new Date() }); }

        if (i < recipients.length - 1) await sleep(Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000);
      }
      activeStatus = 'completed';
      db.prepare('UPDATE campaigns SET status = "completed" WHERE id = ?').run(campaignId);
    } catch (err) { activeStatus = 'idle'; }
  })();
});

app.get('/api/logs', (req, res) => res.json({ logs: activeLogs, status: activeStatus }));

app.listen(PORT, () => console.log(`Backend Pro running on ${PORT}`));

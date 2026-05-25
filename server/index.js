const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { ImapFlow } = require('imapflow');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;

// --- HELPERS ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- ROUTES ---

app.get('/', (req, res) => {
  res.send('OutreachPro Backend Pro is running!');
});

// 1. OPEN TRACKING PIXEL
app.get('/api/t/:id.png', (req, res) => {
  const id = req.params.id;
  try {
    const stmt = db.prepare('UPDATE sent_emails SET opened_at = CURRENT_TIMESTAMP WHERE id = ? AND opened_at IS NULL');
    stmt.run(id);
  } catch (err) {
    console.error('Tracking error:', err);
  }
  
  // Return a 1x1 transparent PNG
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(pixel);
});

// 2. UNSUBSCRIBE
app.get('/api/unsubscribe/:email', (req, res) => {
  const email = req.params.email;
  try {
    db.prepare('INSERT OR REPLACE INTO recipients (id, email, unsubscribed) VALUES (?, ?, 1)')
      .run(uuidv4(), email);
    res.send('<h1>You have been unsubscribed.</h1><p>You will no longer receive emails from us.</p>');
  } catch (err) {
    res.status(500).send('Error processing unsubscribe request.');
  }
});

// 3. SEND CAMPAIGN
let activeLogs = [];
let activeStatus = 'idle';

app.post('/api/send', async (req, res) => {
  const { accounts, recipients, subject, body, delayMin, delayMax, campaignId = uuidv4() } = req.body;
  
  if (activeStatus === 'running') return res.status(400).json({ error: 'Already running' });

  activeStatus = 'running';
  activeLogs = [];
  res.json({ message: 'Campaign initiated', campaignId });

  // Background execution
  (async () => {
    try {
      db.prepare('INSERT OR REPLACE INTO campaigns (id, subject, body, status) VALUES (?, ?, ?, ?)')
        .run(campaignId, subject, body, 'running');

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        
        // Check if unsubscribed
        const isUnsubbed = db.prepare('SELECT unsubscribed FROM recipients WHERE email = ?').get(recipient.email);
        if (isUnsubbed && isUnsubbed.unsubscribed) {
          activeLogs.push({ text: `Skipping ${recipient.email} (Unsubscribed)`, type: 'info', timestamp: new Date() });
          continue;
        }

        const account = accounts[i % accounts.length];
        const sentId = uuidv4();

        const logMsg = `[${i+1}/${recipients.length}] Sending to ${recipient.email}...`;
        activeLogs.push({ text: logMsg, timestamp: new Date() });

        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: account.user, pass: account.pass }
          });

          // Inject Tracking & Unsubscribe
          const trackingPixel = `<img src="${BASE_URL}/api/t/${sentId}.png" width="1" height="1" style="display:none" />`;
          const unsubLink = `<div style="margin-top:50px; font-size:12px; color:#666">Don't want these emails? <a href="${BASE_URL}/api/unsubscribe/${recipient.email}">Unsubscribe here</a></div>`;
          
          const pSubject = subject.replace(/{{(\w+)}}/g, (_, k) => recipient[k] || '');
          const pBody = body.replace(/{{(\w+)}}/g, (_, k) => recipient[k] || '') + trackingPixel + unsubLink;

          await transporter.sendMail({
            from: account.user,
            to: recipient.email,
            subject: pSubject,
            html: pBody
          });

          db.prepare('INSERT INTO sent_emails (id, campaign_id, recipient_email, account_email, status) VALUES (?, ?, ?, ?, ?)')
            .run(sentId, campaignId, recipient.email, account.user, 'sent');
          
          activeLogs.push({ text: `✓ Sent to ${recipient.email}`, type: 'success', timestamp: new Date() });
        } catch (err) {
          activeLogs.push({ text: `✗ Error for ${recipient.email}: ${err.message}`, type: 'error', timestamp: new Date() });
        }

        if (i < recipients.length - 1) {
          const delay = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
          await sleep(delay);
        }
      }
      activeStatus = 'completed';
      db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('completed', campaignId);
    } catch (err) {
      activeStatus = 'idle';
      console.error('Fatal send error:', err);
    }
  })();
});

// 4. INTEGRATED INBOX (FETCHER)
app.post('/api/inbox', async (req, res) => {
  const { account } = req.body; // { user, pass }
  
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: account.user, pass: account.pass }
  });

  try {
    await client.connect();
    let lock = await client.getMailboxLock('INBOX');
    const messages = [];
    
    try {
      // Fetch last 10 messages
      for await (let msg of client.fetch({ last: 10 }, { envelope: true, bodyStructure: true })) {
        messages.push({
          subject: msg.envelope.subject,
          from: msg.envelope.from[0].address,
          date: msg.envelope.date,
          uid: msg.uid
        });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: activeLogs, status: activeStatus });
});

app.listen(PORT, () => console.log(`Backend Pro running on port ${PORT}`));

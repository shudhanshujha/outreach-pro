require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const supabase = require('./db');
const { ImapFlow } = require('imapflow');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const brevoKeyPromise = process.env.BREVO_API_KEY
  ? Promise.resolve(process.env.BREVO_API_KEY)
  : supabase.from('app_settings').select('value').eq('key', 'BREVO_API_KEY').maybeSingle()
      .then(({ data }) => data?.value || null);

async function getBrevoKey() {
  const key = await brevoKeyPromise;
  if (!key) throw new Error('BREVO_API_KEY not configured');
  return key;
}

async function sendViaBrevo({ from, to, subject, html, sentId, campaignId, recipientEmail, accountEmail }) {
  const key = await getBrevoKey();
  await axios.post('https://api.brevo.com/v3/smtp/email', {
    sender: { email: from, name: from.split('@')[0] },
    to: [{ email: to }],
    subject,
    htmlContent: html
  }, {
    headers: { 'api-key': key },
    timeout: 15000
  });
  if (sentId && campaignId && recipientEmail && accountEmail) {
    await supabase.from('sent_emails').insert({
      id: sentId, campaign_id: campaignId, recipient_email: recipientEmail, account_email: accountEmail, status: 'sent'
    });
  }
}

app.get('/', (req, res) => {
  res.send('OutreachPro Backend is running');
});

// ============================================================
// ACCOUNTS
// ============================================================

app.get('/api/accounts', async (req, res) => {
  try {
    const { data, error } = await supabase.from('accounts').select('email');
    if (error) throw error;
    res.json({ accounts: data });
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
    const { error } = await supabase.from('accounts').upsert({ email, appPassword }, { onConflict: 'email' });
    if (error) throw error;
    res.json({ success: true, email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:email', async (req, res) => {
  try {
    const { error } = await supabase.from('accounts').delete().eq('email', req.params.email);
    if (error) throw error;
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
    const { data: emailData, error } = await supabase.from('sent_emails').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (emailData && !emailData.opened_at) {
      const { error: updateErr } = await supabase.from('sent_emails').update({ opened_at: new Date().toISOString() }).eq('id', req.params.id);
      if (updateErr) throw updateErr;
      const { data: followUps } = await supabase.from('follow_ups').select('*').eq('campaign_id', emailData.campaign_id);
      for (const fu of followUps || []) {
        const scheduledTime = new Date();
        scheduledTime.setDate(scheduledTime.getDate() + fu.delay_days);
        const { error: insertErr } = await supabase.from('scheduled_emails').upsert({
          id: uuidv4(),
          campaign_id: emailData.campaign_id,
          recipient_email: emailData.recipient_email,
          account_email: emailData.account_email,
          subject: fu.subject,
          body: fu.body,
          scheduled_at: scheduledTime.toISOString()
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (insertErr) console.error('Scheduling follow-up failed:', insertErr.message);
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
    const { error: upsertErr } = await supabase.from('recipients').upsert({
      id: uuidv4(),
      email: req.params.email,
      unsubscribed: 1
    }, { onConflict: 'email' });
    if (upsertErr) throw upsertErr;
    const { error: updateErr } = await supabase.from('scheduled_emails').update({ status: 'cancelled' })
      .eq('recipient_email', req.params.email).eq('status', 'pending');
    if (updateErr) throw updateErr;
    res.send('<h1>Unsubscribed successfully.</h1>');
  } catch (err) { res.status(500).send('Error'); }
});

// ============================================================
// BACKGROUND WORKER
// ============================================================
async function runBackgroundWorker() {
  try {
    const now = new Date().toISOString();
    const { data: pending, error: fetchErr } = await supabase.from('scheduled_emails').select('*')
      .eq('status', 'pending').lte('scheduled_at', now);
    if (fetchErr) throw fetchErr;
    for (const email of pending || []) {
      const { data: accountData } = await supabase.from('accounts').select('*').eq('email', email.account_email).maybeSingle();
      if (!accountData || !accountData.appPassword) continue;
      try {
        const sentId = uuidv4();
        await sendViaBrevo({
          from: email.account_email,
          to: email.recipient_email,
          subject: email.subject,
          html: email.body +
            '<img src="' + BASE_URL + '/api/t/' + sentId + '.png" width="1" height="1" style="display:none" />' +
            '<div style="margin-top:40px;font-size:11px;color:#999"><a href="' + BASE_URL + '/api/unsubscribe/' + email.recipient_email + '">Unsubscribe</a></div>',
          sentId,
          campaignId: email.campaign_id,
          recipientEmail: email.recipient_email,
          accountEmail: email.account_email
        });
        await supabase.from('scheduled_emails').update({ status: 'sent' }).eq('id', email.id);
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
      const { error: campaignErr } = await supabase.from('campaigns').upsert({
        id: campaignId, subject, body, status: 'running'
      }, { onConflict: 'id' });
      if (campaignErr) throw campaignErr;

      for (const fu of followUps) {
        const { error: fuErr } = await supabase.from('follow_ups').insert({
          campaign_id: campaignId,
          delay_days: fu.delayDays,
          subject: fu.subject,
          body: fu.body
        });
        if (fuErr) throw fuErr;
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

        const { data: unsubData } = await supabase.from('recipients').select('unsubscribed').eq('email', recipient.email).maybeSingle();
        if (unsubData?.unsubscribed) {
          activeLogs.push({ text: 'Skipping ' + recipient.email + ' (unsubscribed)', type: 'info', timestamp: new Date() });
          continue;
        }

        const accEmail = accountEmails[i % accountEmails.length].user;
        const { data: accountData } = await supabase.from('accounts').select('*').eq('email', accEmail).maybeSingle();

        if (!accountData || !accountData.appPassword) {
          activeLogs.push({ text: 'Account ' + accEmail + ' has no app password set.', type: 'error', timestamp: new Date() });
          continue;
        }

        activeLogs.push({ text: '[' + (i + 1) + '/' + recipients.length + '] Sending to ' + recipient.email + ' via ' + accEmail + '...', timestamp: new Date() });

        try {
          const sentId = uuidv4();
          const pSubject = subject.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '');
          const pBody = body.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '') +
            '<img src="' + BASE_URL + '/api/t/' + sentId + '.png" width="1" height="1" style="display:none" />' +
            '<div style="margin-top:40px;font-size:11px;color:#999"><a href="' + BASE_URL + '/api/unsubscribe/' + recipient.email + '">Unsubscribe</a></div>';

          await sendViaBrevo({
            from: accEmail, to: recipient.email, subject: pSubject, html: pBody,
            sentId, campaignId, recipientEmail: recipient.email, accountEmail: accEmail
          });
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
      const { error: updateErr } = await supabase.from('campaigns').update({ status: activeStatus }).eq('id', campaignId);
      if (updateErr) console.error('Campaign status update error:', updateErr.message);
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
    const { data: dbAccount, error } = await supabase.from('accounts').select('*').eq('email', account.user).maybeSingle();
    if (error) throw error;
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
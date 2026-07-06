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

// Dynamic key loader — refreshes every 5 minutes so Render picks up changes without restart
let _brevoKeyCache = null;
let _brevoKeyCacheTime = 0;
const BREVO_KEY_TTL = 5 * 60 * 1000; // 5 minutes

async function getBrevoKey() {
  // 1. Env var always wins (set in Render dashboard → instant)
  if (process.env.BREVO_API_KEY) return process.env.BREVO_API_KEY;

  // 2. In-memory cache to avoid hammering Supabase on every email
  const now = Date.now();
  if (_brevoKeyCache && (now - _brevoKeyCacheTime) < BREVO_KEY_TTL) {
    return _brevoKeyCache;
  }

  // 3. Fresh fetch from Supabase
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'BREVO_API_KEY').maybeSingle();
  if (error) throw new Error('Failed to fetch BREVO_API_KEY from Supabase: ' + error.message);
  if (!data?.value) throw new Error('BREVO_API_KEY not configured in env or Supabase app_settings');

  _brevoKeyCache = data.value;
  _brevoKeyCacheTime = now;
  console.log('Brevo API key refreshed from Supabase at', new Date().toISOString());
  return _brevoKeyCache;
}

let _geminiKeyCache = null;
let _geminiKeyCacheTime = 0;
const GEMINI_KEY_TTL = 5 * 60 * 1000; // 5 minutes

let _apolloKeyCache = null;
let _apolloKeyCacheTime = 0;
const APOLLO_KEY_TTL = 5 * 60 * 1000;

async function getApolloKey() {
  if (process.env.APOLLO_API_KEY) return process.env.APOLLO_API_KEY;
  const now = Date.now();
  if (_apolloKeyCache && (now - _apolloKeyCacheTime) < APOLLO_KEY_TTL) {
    return _apolloKeyCache;
  }
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'APOLLO_API_KEY').maybeSingle();
  if (error) throw new Error('Failed to fetch APOLLO_API_KEY from Supabase: ' + error.message);
  _apolloKeyCache = data?.value || null;
  _apolloKeyCacheTime = now;
  console.log('Apollo API key refreshed from Supabase at', new Date().toISOString());
  return _apolloKeyCache;
}

async function getGeminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  const now = Date.now();
  if (_geminiKeyCache && (now - _geminiKeyCacheTime) < GEMINI_KEY_TTL) {
    return _geminiKeyCache;
  }

  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'GEMINI_API_KEY').maybeSingle();
  if (error) throw new Error('Failed to fetch GEMINI_API_KEY from Supabase: ' + error.message);

  _geminiKeyCache = data?.value || null;
  _geminiKeyCacheTime = now;
  console.log('Gemini API key refreshed from Supabase at', new Date().toISOString());
  return _geminiKeyCache;
}


// Only use tracking pixel if we have a real public HTTPS URL (not localhost)
function isPublicUrl(url) {
  return url && url.startsWith('https://');
}

// Strip HTML tags to generate plain-text version
function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Build clean email body — tracking pixel only if public URL, NO unsubscribe footer
function buildEmailBody(bodyHtml, sentId) {
  let html = bodyHtml;
  if (sentId && isPublicUrl(BASE_URL)) {
    html += '<img src="' + BASE_URL + '/api/t/' + sentId + '.png" width="1" height="1" style="display:none" />';
  }
  return { html, text: htmlToPlainText(bodyHtml) };
}

// Format a sender display name from an email address (e.g. john.doe@gmail.com → "John Doe")
function formatSenderName(email) {
  const local = email.split('@')[0];
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// Cache the Brevo verified sender email so we don't hit /v3/account on every email
let _brevoAccountEmail = null;
let _brevoAccountCacheTime = 0;
const BREVO_ACCOUNT_TTL = 30 * 60 * 1000; // 30 minutes

async function getBrevoAccountEmail(key) {
  const now = Date.now();
  if (_brevoAccountEmail && (now - _brevoAccountCacheTime) < BREVO_ACCOUNT_TTL) {
    return _brevoAccountEmail;
  }
  try {
    const res = await axios.get('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key },
      timeout: 10000
    });
    _brevoAccountEmail = res.data?.email || null;
    _brevoAccountCacheTime = now;
    console.log('Brevo verified sender fetched:', _brevoAccountEmail);
  } catch (err) {
    console.warn('Could not fetch Brevo account email, falling back to sender address:', err.message);
    _brevoAccountEmail = null;
  }
  return _brevoAccountEmail;
}

async function sendViaBrevo({ from, to, subject, html, textContent, sentId, campaignId, recipientEmail, accountEmail }) {
  const key = await getBrevoKey();
  const messageId = `<${uuidv4()}@outreachpro.mail>`;
  const plainText = textContent || htmlToPlainText(html);

  // All KloutKrew Gmail accounts are verified as senders in Brevo,
  // so we send directly from the selected Gmail address.
  const senderName = formatSenderName(from);

  const extraHeaders = {
    'Reply-To': `${from}`,
    'Message-ID': messageId,
    'X-Mailer': 'OutreachPro/1.0',
    'Precedence': 'bulk',
    'X-Entity-Ref-ID': sentId || uuidv4()
  };

  if (recipientEmail) {
    const unsubUrl = `${BASE_URL}/api/unsubscribe/${encodeURIComponent(recipientEmail)}`;
    extraHeaders['List-Unsubscribe'] = `<${unsubUrl}>`;
    extraHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { email: from, name: senderName },
      to: [{ email: to }],
      replyTo: { email: from, name: senderName },
      subject,
      htmlContent: html,
      textContent: plainText,
      headers: extraHeaders
    }, {
      headers: { 'api-key': key },
      timeout: 20000
    });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error('Brevo API: ' + detail);
  }
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
// KEEPALIVE — prevent Render free tier from spinning down
// ============================================================
const KEEPALIVE_URL = process.env.KEEPALIVE_URL || process.env.BACKEND_URL;
const KEEPALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

if (KEEPALIVE_URL && !KEEPALIVE_URL.includes('localhost') && !KEEPALIVE_URL.includes('127.0.0.1')) {
  setInterval(async () => {
    try {
      const resp = await fetch(`${KEEPALIVE_URL}/api/health`, { signal: AbortSignal.timeout(15000) });
      console.log(`[Keepalive] Ping OK — ${resp.status}`);
    } catch (err) {
      console.warn(`[Keepalive] Ping failed: ${err.message}`);
    }
  }, KEEPALIVE_INTERVAL);
  console.log(`[Keepalive] Enabled — pinging ${KEEPALIVE_URL} every 10min`);
}

// ============================================================
// SETTINGS
// ============================================================
app.get('/api/settings', async (req, res) => {
  try {
    const { data, error } = await supabase.from('app_settings').select('key');
    if (error) throw error;
    
    const brevoSet = !!process.env.BREVO_API_KEY || data.some(d => d.key === 'BREVO_API_KEY');
    const geminiSet = !!process.env.GEMINI_API_KEY || data.some(d => d.key === 'GEMINI_API_KEY');
    const apolloSet = !!process.env.APOLLO_API_KEY || data.some(d => d.key === 'APOLLO_API_KEY');
    
    res.json({
      settings: {
        BREVO_API_KEY: brevoSet,
        GEMINI_API_KEY: geminiSet,
        APOLLO_API_KEY: apolloSet
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) {
    return res.status(400).json({ error: 'Key and value are required' });
  }
  
  if (key !== 'BREVO_API_KEY' && key !== 'GEMINI_API_KEY' && key !== 'APOLLO_API_KEY') {
    return res.status(400).json({ error: 'Invalid setting key' });
  }
  
  try {
    const { error } = await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
    if (error) throw error;
    
    if (key === 'BREVO_API_KEY') {
      _brevoKeyCache = value;
      _brevoKeyCacheTime = Date.now();
    } else if (key === 'GEMINI_API_KEY') {
      _geminiKeyCache = value;
      _geminiKeyCacheTime = Date.now();
    } else if (key === 'APOLLO_API_KEY') {
      _apolloKeyCache = value;
      _apolloKeyCacheTime = Date.now();
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// AI UTILITIES (GEMINI)
// ============================================================
app.post('/api/ai/map-csv', async (req, res) => {
  const { headers, samples } = req.body;
  if (!headers || !Array.isArray(headers) || headers.length === 0) {
    return res.status(400).json({ error: 'CSV headers are required' });
  }

  let geminiKey;
  try {
    geminiKey = await getGeminiKey();
  } catch (err) {
    return res.status(500).json({ error: 'Gemini API key check failed.', detail: err.message });
  }

  if (!geminiKey) {
    return res.status(400).json({ error: 'Gemini API key is not configured. Please add it in settings.' });
  }

  const prompt = `You are a data assistant mapping CSV column headers to cold outreach recipient properties.
We need to map columns from the uploaded CSV to the following target fields:
1. "email": The recipient's email address.
2. "name": The recipient's full name, first name, or name.
3. "business": The recipient's company, organization, or business name.

Here are the CSV headers:
${JSON.stringify(headers)}

Here are some sample rows of data (each element corresponds to the header at the same index):
${JSON.stringify(samples || [])}

Please analyze the headers and sample values and map them to our targets.
Respond with a raw JSON object ONLY, containing the keys "emailColumn", "nameColumn", and "businessColumn".
The values must be the exact header names from the CSV headers above, or null if you cannot find a suitable match.
Do not wrap your response in markdown code blocks like \`\`\`json. Just output the clean JSON object.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      },
      { timeout: 15000 }
    );

    let resultText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error('Empty response from Gemini API');
    }
    
    resultText = resultText.trim();
    if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const mapping = JSON.parse(resultText);
    res.json(mapping);
  } catch (err) {
    console.error('Gemini mapping failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Gemini Column Mapping failed: ' + (err.response?.data?.error?.message || err.message) });
  }
});

app.post('/api/ai/write-email', async (req, res) => {
  const { prompt: userPrompt, tone, length } = req.body;
  if (!userPrompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  let geminiKey;
  try {
    geminiKey = await getGeminiKey();
  } catch (err) {
    return res.status(500).json({ error: 'Gemini API key check failed.', detail: err.message });
  }

  if (!geminiKey) {
    return res.status(400).json({ error: 'Gemini API key is not configured. Please add it in settings.' });
  }

  const systemInstructions = `You are an expert cold outreach strategist. Your task is to write a highly converting cold email template.
Instructions:
- Write both a subject line and a body.
- You MUST use two personalization placeholders:
  * {{name}} for the recipient's name (e.g. Hi {{name}},)
  * {{business}} for the recipient's business/company name (e.g. I was looking at {{business}}...)
- The body should be formatted in clean HTML (using <p> and <br /> tags for formatting, do not include <html>, <body> or <head> tags).
- Maintain the user's requested tone: ${tone || 'professional'}
- Maintain the user's requested length: ${length || 'medium'}
- Do NOT output any conversational text or formatting other than the JSON object requested below.

Respond with a raw JSON object containing the keys "subject" and "body".
Do not wrap your response in markdown code blocks like \`\`\`json. Just output the clean JSON object.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        contents: [
          {
            parts: [
              { text: `${systemInstructions}\n\nUser request for email contents: ${userPrompt}` }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      },
      { timeout: 20000 }
    );

    let resultText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error('Empty response from Gemini API');
    }

    resultText = resultText.trim();
    if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }

    const emailTemplate = JSON.parse(resultText);
    res.json(emailTemplate);
  } catch (err) {
    console.error('Gemini write email failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Gemini Email generation failed: ' + (err.response?.data?.error?.message || err.message) });
  }
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
        const { html: builtHtml, text: builtText } = buildEmailBody(email.body, sentId);
        await sendViaBrevo({
          from: email.account_email,
          to: email.recipient_email,
          subject: email.subject,
          html: builtHtml,
          textContent: builtText,
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
  try {
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

        // Check unsubscribed
        try {
          const { data: unsubData } = await supabase.from('recipients').select('unsubscribed').eq('email', recipient.email).maybeSingle();
          if (unsubData?.unsubscribed) {
            activeLogs.push({ text: 'Skipping ' + recipient.email + ' (unsubscribed)', type: 'info', timestamp: new Date() });
            continue;
          }
        } catch (_) { /* skip unsub check on error */ }

        const accEmail = accountEmails[i % accountEmails.length].user;

        activeLogs.push({ text: '[' + (i + 1) + '/' + recipients.length + '] Sending to ' + recipient.email + ' via ' + accEmail + '...', timestamp: new Date() });

        try {
          const sentId = uuidv4();
          const pSubject = subject.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '');
          const pBodyHtml = body.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '');
          const { html: builtHtml, text: builtText } = buildEmailBody(pBodyHtml, sentId);

          await sendViaBrevo({
            from: accEmail, to: recipient.email, subject: pSubject,
            html: builtHtml, textContent: builtText,
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
  } catch (err) {
    activeStatus = 'idle';
    activeLogs = [];
    res.status(500).json({ error: err.message });
  }
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
      auth: { user: account.user, pass: dbAccount.appPassword },
      logger: false
    });

    await imap.connect();
    const mailbox = await imap.mailboxOpen('INBOX');
    const total = mailbox.exists || 0;

    const messages = [];
    if (total > 0) {
      // Fetch the latest 50 messages (newest first via reverse sequence range)
      const start = Math.max(1, total - 49);
      const range = `${start}:${total}`;
      for await (const msg of imap.fetch(range, { envelope: true, uid: true, flags: true })) {
        const from = msg.envelope.from?.[0];
        if (!from) continue;
        // Build a readable sender name
        const fromName = [from.name, from.address]
          .filter(Boolean)
          .join(' ')
          .replace(/^"|"$/g, '')
          .trim() || from.address;
        messages.push({
          uid: msg.uid,
          subject: msg.envelope.subject || '(No Subject)',
          from: from.address,
          fromName,
          date: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
          seen: msg.flags?.has('\\Seen') || false
        });
      }
      // Sort newest first
      messages.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    await imap.logout();
    res.json({ messages });
  } catch (err) {
    console.error('Inbox fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch the full body of a single message by UID
app.post('/api/inbox/body', async (req, res) => {
  const { accountEmail, uid } = req.body;
  if (!accountEmail || !uid) return res.status(400).json({ error: 'accountEmail and uid are required' });

  try {
    const { data: dbAccount, error } = await supabase.from('accounts').select('*').eq('email', accountEmail).maybeSingle();
    if (error) throw error;
    if (!dbAccount || !dbAccount.appPassword) {
      return res.status(404).json({ error: 'Account not found or no app password set.' });
    }

    const imap = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: accountEmail, pass: dbAccount.appPassword },
      logger: false
    });

    await imap.connect();
    await imap.mailboxOpen('INBOX');

    let htmlBody = null;
    let textBody = null;

    // Fetch the raw source for this UID
    for await (const msg of imap.fetch({ uid: String(uid) }, { source: true }, { uid: true })) {
      if (!msg.source) continue;
      const raw = msg.source.toString();

      // Extract HTML part from multipart or direct HTML
      const htmlMatch = raw.match(/Content-Type:\s*text\/html[^\n]*\n(?:[^\n]+\n)*?\n([\s\S]*?)(?=--|\z)/i);
      const textMatch = raw.match(/Content-Type:\s*text\/plain[^\n]*\n(?:[^\n]+\n)*?\n([\s\S]*?)(?=--|\z)/i);

      if (htmlMatch) {
        htmlBody = decodeIMAPBody(htmlMatch[1].trim());
      }
      if (textMatch) {
        textBody = decodeIMAPBody(textMatch[1].trim());
      }

      // If no multipart found, treat entire body as text
      if (!htmlBody && !textBody) {
        const bodyStart = raw.indexOf('\r\n\r\n');
        if (bodyStart !== -1) {
          textBody = raw.slice(bodyStart + 4).trim();
        }
      }
    }

    // Mark as seen
    try {
      await imap.messageFlagsAdd({ uid: String(uid) }, ['\\Seen'], { uid: true });
    } catch (_) { /* non-critical */ }

    await imap.logout();
    res.json({ html: htmlBody, text: textBody });
  } catch (err) {
    console.error('Inbox body fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Decode quoted-printable or base64 encoded IMAP body segments
function decodeIMAPBody(raw) {
  try {
    // Base64
    if (/^[A-Za-z0-9+/\r\n]+=*$/.test(raw.replace(/\s/g, '')) && raw.length > 40) {
      return Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf-8');
    }
    // Quoted-printable: decode =XX hex sequences and soft line breaks
    return raw
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  } catch (_) {
    return raw;
  }
}

// ============================================================
// TEST EMAIL (diagnostic)
// ============================================================
app.post('/api/test-email', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Provide a "to" email address in the request body' });

  let key;
  try {
    key = await getBrevoKey();
  } catch (err) {
    return res.status(500).json({ error: 'BREVO_API_KEY not set', detail: err.message });
  }

  // Verify the key is valid by fetching account info
  let accountInfo;
  try {
    const accountRes = await axios.get('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key },
      timeout: 10000
    });
    accountInfo = accountRes.data;
  } catch (err) {
    return res.status(500).json({
      error: 'Brevo API key invalid or request failed',
      detail: err.response?.data || err.message
    });
  }

  // Attempt to send a test email
  try {
    const testMessageId = `<${uuidv4()}@outreachpro.mail>`;
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { email: accountInfo.email, name: formatSenderName(accountInfo.email) },
      to: [{ email: to }],
      replyTo: { email: accountInfo.email },
      subject: 'Connection check from OutreachPro',
      htmlContent: '<p>Hi there,</p><p>This is a quick connection test from OutreachPro to confirm your Brevo integration is working correctly.</p><p>You can ignore this message.</p>',
      textContent: 'Hi there,\n\nThis is a quick connection test from OutreachPro to confirm your Brevo integration is working correctly.\n\nYou can ignore this message.',
      headers: {
        'Reply-To': accountInfo.email,
        'Message-ID': testMessageId,
        'X-Mailer': 'OutreachPro/1.0',
        'X-Entity-Ref-ID': uuidv4()
      }
    }, {
      headers: { 'api-key': key },
      timeout: 15000
    });

    res.json({
      success: true,
      brevoAccount: accountInfo.email,
      brevoCompany: accountInfo.companyName,
      brevoResponse: response.data,
      note: 'Email sent successfully via Brevo. Check inbox (and spam) to confirm delivery.'
    });
  } catch (err) {
    res.status(500).json({
      error: 'Brevo send failed',
      brevoAccount: accountInfo?.email,
      detail: err.response?.data || err.message
    });
  }
});

// ============================================================
// ENRICH — Apollo.io People Search
// ============================================================
app.post('/api/enrich', async (req, res) => {
  const { emails } = req.body;
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'Provide an array of emails to enrich' });
  }

  let apiKey;
  try {
    apiKey = await getApolloKey();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (!apiKey) {
    return res.status(501).json({ error: 'Apollo.io API key not configured. Add it in Settings or set APOLLO_API_KEY in .env' });
  }

  try {
    const enrichedData = [];
    for (const email of emails) {
      if (!email) continue;
      const response = await axios.post('https://api.apollo.io/api/v1/people/match', {
        email
      }, {
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        timeout: 10000
      });

      const person = response.data?.person;
      if (person) {
        const org = person.organization || {};
        enrichedData.push({
          email: person.email || email,
          name: [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Unknown',
          business: org.name || 'N/A',
          title: person.title || '',
          phone: person.phone || '',
          linkedin: person.linkedin_url || '',
          company_domain: org.domain || '',
          company_industry: org.industry || '',
          company_size: org.employee_count || '',
          company_city: org.city || '',
          company_state: org.state || ''
        });
      } else {
        enrichedData.push({ email, name: 'Unknown', business: 'N/A', title: '', phone: '', linkedin: '' });
      }
    }

    res.json({ enrichedData });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('Apollo enrichment error:', detail);
    res.status(500).json({ error: 'Apollo enrichment failed: ' + detail });
  }
});

// Apollo People Search — enrich a single contact to show what's available
// Full people search requires a paid Apollo plan; the free plan supports /v1/people/match (email → person)
app.post('/api/apollo/search', async (req, res) => {
  const { company } = req.body;

  let apiKey;
  try {
    apiKey = await getApolloKey();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (!apiKey) {
    return res.status(501).json({ error: 'Apollo.io API key not configured.' });
  }

  try {
    // Enrich the organization by domain (free-tier friendly)
    let orgInfo = null;
    if (company) {
      try {
        const orgRes = await axios.post('https://api.apollo.io/api/v1/organizations/enrich', {
          api_key: apiKey,
          domain: company
        }, { timeout: 10000 });
        orgInfo = orgRes.data?.organization || null;
      } catch (orgErr) {
        console.warn('Organization enrich failed:', orgErr.message);
      }
    }

    res.json({
      people: orgInfo ? [{
        email: '',
        name: '',
        business: orgInfo.name || company || '',
        title: '',
        phone: '',
        linkedin: orgInfo.linkedin_url || '',
        city: orgInfo.city || '',
        state: orgInfo.state || '',
        company_domain: orgInfo.domain || company || '',
        company_industry: orgInfo.industry || '',
        company_size: orgInfo.employee_count || '',
        company_phone: orgInfo.phone || '',
        company_founded: orgInfo.founded_year || '',
        company_revenue: orgInfo.estimated_revenue || ''
      }] : [],
      total: orgInfo ? 1 : 0,
      note: orgInfo ? 'Organization found. Full people search requires a paid Apollo plan.' : 'No organization found for this domain.'
    });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('Apollo search error:', detail);
    res.status(500).json({ error: 'Apollo search failed: ' + detail });
  }
});

// ============================================================
// DIAGNOSTIC — Brevo connection check
// ============================================================
app.get('/api/diagnose', async (req, res) => {
  const results = { brevo: false, supabase: false, apollo: false };
  
  try {
    const key = await getBrevoKey();
    const accountRes = await axios.get('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key },
      timeout: 10000
    });
    results.brevo = { ok: true, email: accountRes.data.email, company: accountRes.data.companyName };
  } catch (err) {
    results.brevo = { ok: false, error: err.response?.data?.message || err.message, code: err.response?.data?.code };
  }

  try {
    const { data, error } = await supabase.from('accounts').select('email');
    if (error) throw error;
    results.supabase = { ok: true, accounts: data.map(a => a.email) };
  } catch (err) {
    results.supabase = { ok: false, error: err.message };
  }

  try {
    const apolloKey = await getApolloKey();
    results.apollo = apolloKey ? { ok: true, configured: true } : { ok: true, configured: false };
  } catch (err) {
    results.apollo = { ok: false, error: err.message };
  }

  results.env = {
    BACKEND_URL: process.env.BACKEND_URL || 'not set',
    RENDER: !!process.env.RENDER,
    NODE_ENV: process.env.NODE_ENV || 'not set'
  };

  res.json(results);
});

// ============================================================
// 404 HANDLER
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found: ' + req.method + ' ' + req.path });
});

// ============================================================
// STARTUP ACCOUNT SEED
// Ensures Gmail accounts + app passwords are always in Supabase.
// Set SEED_ACCOUNTS env var on Render as a JSON array, e.g.:
// [{"email":"x@gmail.com","appPassword":"xxxx xxxx xxxx xxxx"}]
// ============================================================
async function seedAccounts() {
  const raw = process.env.SEED_ACCOUNTS;
  if (!raw) return;
  let accounts;
  try { accounts = JSON.parse(raw); } catch (e) { console.warn('SEED_ACCOUNTS is not valid JSON'); return; }
  for (const acc of accounts) {
    if (!acc.email || !acc.appPassword) continue;
    const { error } = await supabase.from('accounts').upsert(
      { email: acc.email, appPassword: acc.appPassword },
      { onConflict: 'email' }
    );
    if (error) console.error('Seed failed for', acc.email, error.message);
    else console.log('Seeded account:', acc.email);
  }
}

// ============================================================
// START
// ============================================================
if (process.env.NODE_ENV !== 'production' || process.env.RENDER) {
  app.listen(PORT, async () => {
    console.log('Backend running on port ' + PORT);
    await seedAccounts();
  });
}

module.exports = app;
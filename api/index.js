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
      id: sentId, campaign_id: campaignId, recipient_email: recipientEmail, account_email: accountEmail, status: 'sent', message_id: messageId.replace(/[<>]/g, '')
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
    
    const keys = data || [];
    const brevoSet = !!process.env.BREVO_API_KEY || keys.some(d => d.key === 'BREVO_API_KEY');
    const geminiSet = !!process.env.GEMINI_API_KEY || keys.some(d => d.key === 'GEMINI_API_KEY');
    const apolloSet = !!process.env.APOLLO_API_KEY || keys.some(d => d.key === 'APOLLO_API_KEY');
    
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`,
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
      { timeout: 15000, headers: { 'X-Goog-Api-Key': geminiKey } }
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`,
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
      { timeout: 20000, headers: { 'X-Goog-Api-Key': geminiKey } }
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
// AI PERSONALIZE — batch-generate unique emails per recipient
// ============================================================
app.post('/api/ai/personalize', async (req, res) => {
  const { recipients, pitch, tone = 'Professional', length = 'Medium' } = req.body;
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: 'Recipients array is required' });
  }
  if (!pitch) {
    return res.status(400).json({ error: 'Please describe what you are pitching' });
  }

  let geminiKey;
  try { geminiKey = await getGeminiKey(); } catch (err) {
    return res.status(500).json({ error: 'Gemini API key check failed.', detail: err.message });
  }
  if (!geminiKey) {
    return res.status(400).json({ error: 'Gemini API key is not configured. Please add it in settings.' });
  }

  const results = [];

  const peopleDesc = recipients.map((r, idx) =>
    `Person ${idx + 1}:\n- Name: ${r.name || 'Unknown'}\n- Business: ${r.business || 'Unknown'}\n- Email: ${r.email}`
  ).join('\n\n');

  const prompt = `You are a world-class cold email copywriter. Your task is to write unique, personalized cold emails for each person below.

THE PITCH / OFFER:
${pitch}

DIRECTIVES:
- Write a completely UNIQUE email for EACH person — no two emails should be the same.
- Research each person's business name and weave relevant, specific details into the email. If the business name suggests an industry (e.g. "Smith Construction" → construction), reference it naturally.
- The email must feel hand-written, not templated.
- Use ${tone} tone.
- Keep it ${length} length.
- Use the person's name naturally in the greeting and body.
- Reference their business specifically — mention what you imagine they do, or a plausible challenge they face.
- Weave the pitch in as a natural solution, not a hard sell.
- End with a soft call to action (e.g. "Would you be open to a quick call?").

OUTPUT FORMAT:
Respond with a raw JSON array ONLY. Each element must have:
{
  "email": "the person's email address",
  "subject": "a compelling subject line (max 10 words)",
  "body": "full email body in clean HTML using <p> and <br /> tags. Do NOT include <html>, <body>, or <head> tags."
}

Here are the people to write for:
${peopleDesc}

Return ONLY the JSON array, no markdown, no code fences.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      },
      { timeout: 120000, headers: { 'X-Goog-Api-Key': geminiKey } }
    );

    let resultText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error('Empty response from Gemini');

    resultText = resultText.trim();
    if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(resultText);
    if (Array.isArray(parsed)) results.push(...parsed);
  } catch (err) {
    console.error('Gemini personalize error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'AI personalization failed. Please try again or reduce recipient count.' });
  }

  res.json({ personalized: results, total: results.length });
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
      const fuSet = _campaignFollowUpEmails[emailData.campaign_id];
      const shouldFollowUp = fuSet && fuSet.has(emailData.recipient_email.toLowerCase());
      if (!shouldFollowUp) {
        console.log(`[Tracking] Skipping follow-ups for ${emailData.recipient_email} (not selected)`);
        const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store' });
        res.end(pixel);
        return;
      }
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
      .eq('status', 'pending').lte('scheduled_at', now).limit(100);
    if (fetchErr) throw fetchErr;

    // Batch-fetch reply statuses
    const campaignIds = [...new Set((pending || []).map(e => e.campaign_id))];
    const repliedMap = {};
    if (campaignIds.length > 0) {
      try {
        const { data: repliedData } = await supabase
          .from('sent_emails')
          .select('campaign_id, recipient_email, replied')
          .in('campaign_id', campaignIds)
          .eq('replied', true);
        for (const r of repliedData || []) {
          repliedMap[`${r.campaign_id}:${r.recipient_email}`] = true;
        }
      } catch (_) {}
    }

    for (const email of pending || []) {
      if (repliedMap[`${email.campaign_id}:${email.recipient_email}`]) {
        await supabase.from('scheduled_emails').update({ status: 'cancelled' }).eq('id', email.id).catch(() => {});
        continue;
      }

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
  setTimeout(runBackgroundWorker, 60 * 1000);
}
setTimeout(runBackgroundWorker, 60 * 1000);

// ============================================================
// CAMPAIGN SEND
// ============================================================
let activeLogs = [];
let activeStatus = 'idle';
let activeStop = false;
const _campaignFollowUpEmails = {}; // campaignId → Set of recipient emails

app.post('/api/send', async (req, res) => {
  try {
    if (activeStatus === 'running') return res.status(400).json({ error: 'A campaign is already running' });

    const { accounts: accountEmails, recipients, subject, body, delayMin = 30, delayMax = 90, followUps = [], campaignId = uuidv4(), followUpEmails = [], personalized } = req.body;
    const minDelay = Math.max(1, Math.min(delayMin, delayMax));
    const maxDelay = Math.max(minDelay, delayMax);

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

      _campaignFollowUpEmails[campaignId] = new Set(followUpEmails.map(e => e.toLowerCase()));
      const followUpCount = followUpEmails.length;
      activeLogs.push({ text: `Follow-ups enabled for ${followUpCount} of ${recipients.length} recipients`, type: 'info', timestamp: new Date() });

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
        const hasFollowUps = _campaignFollowUpEmails[campaignId]?.has(recipient.email.toLowerCase());

        activeLogs.push({ text: '[' + (i + 1) + '/' + recipients.length + '] Sending to ' + recipient.email + ' via ' + accEmail + (hasFollowUps ? ' [follow-ups on]' : '') + '...', timestamp: new Date() });

        try {
          const sentId = uuidv4();
          const pd = personalized?.[recipient.email];
          const pSubject = pd?.subject || subject.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '');
          const pBodyHtml = pd?.body || body.replace(/{{\s*(\w+)\s*}}/g, (_, k) => recipient[k] || '');
          const { html: builtHtml, text: builtText } = buildEmailBody(pBodyHtml, sentId);

          const logLabel = pd ? ' [AI personalized]' : '';
          await sendViaBrevo({
            from: accEmail, to: recipient.email, subject: pSubject,
            html: builtHtml, textContent: builtText,
            sentId, campaignId, recipientEmail: recipient.email, accountEmail: accEmail
          });
          activeLogs.push({ text: 'Sent to ' + recipient.email + logLabel, type: 'success', timestamp: new Date() });
        } catch (err) {
          console.error('Email send error:', err);
          activeLogs.push({ text: 'Failed to send to ' + recipient.email + ': ' + err.message, type: 'error', timestamp: new Date() });
        }

        if (!activeStop && i < recipients.length - 1) {
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
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
// CAMPAIGN HISTORY
// ============================================================
app.get('/api/campaigns', async (req, res) => {
  try {
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    if (!campaigns || campaigns.length === 0) return res.json({ campaigns: [] });

    const ids = campaigns.map(c => c.id);

    // Batch-fetch all sent_emails for all campaigns
    let sentRows = [];
    try {
      const { data } = await supabase
        .from('sent_emails')
        .select('id, campaign_id, recipient_email, account_email, status, opened_at, sent_at, replied, replied_at, tag, bounced, bounce_reason')
        .in('campaign_id', ids);
      sentRows = data || [];
    } catch (_) {
      const { data } = await supabase
        .from('sent_emails')
        .select('id, campaign_id, recipient_email, account_email, status, opened_at, sent_at')
        .in('campaign_id', ids);
      sentRows = data || [];
    }

    // Batch-fetch follow_ups
    const { data: allFollowUps } = await supabase
      .from('follow_ups')
      .select('campaign_id, delay_days, subject, body')
      .in('campaign_id', ids);

    // Batch-fetch scheduled_emails for follow-up status
    const { data: allScheduled } = await supabase
      .from('scheduled_emails')
      .select('campaign_id, recipient_email, status')
      .in('campaign_id', ids);

    // Group by campaign
    const sentByCampaign = {};
    for (const s of sentRows || []) {
      if (!sentByCampaign[s.campaign_id]) sentByCampaign[s.campaign_id] = [];
      sentByCampaign[s.campaign_id].push(s);
    }

    const fuByCampaign = {};
    for (const fu of allFollowUps || []) {
      if (!fuByCampaign[fu.campaign_id]) fuByCampaign[fu.campaign_id] = [];
      fuByCampaign[fu.campaign_id].push(fu);
    }

    const scheduledByCampaign = {};
    for (const s of allScheduled || []) {
      if (!scheduledByCampaign[s.campaign_id]) scheduledByCampaign[s.campaign_id] = [];
      scheduledByCampaign[s.campaign_id].push(s);
    }

    const result = [];
    for (const c of campaigns || []) {
      const sent = sentByCampaign[c.id] || [];
      const followUps = fuByCampaign[c.id] || [];
      const scheduled = scheduledByCampaign[c.id] || [];

      const recipientEmails = sent.map(s => s.recipient_email);
      const scheduledMap = {};
      for (const s of scheduled) {
        if (!scheduledMap[s.recipient_email]) scheduledMap[s.recipient_email] = [];
        scheduledMap[s.recipient_email].push(s.status);
      }

      result.push({
        id: c.id,
        subject: c.subject,
        status: c.status,
        created_at: c.created_at,
        sentCount: sent.filter(s => s.status === 'sent').length || 0,
        openedCount: sent.filter(s => s.opened_at).length || 0,
        totalRecipients: sent.length || 0,
        hasFollowUps: followUps.length > 0,
        recipients: sent.map(s => ({
          email: s.recipient_email,
          account: s.account_email,
          status: s.status,
          opened_at: s.opened_at,
          sent_at: s.sent_at,
          replied: s.replied || false,
          replied_at: s.replied_at,
          tag: s.tag || null,
          bounced: s.bounced || false,
          bounce_reason: s.bounce_reason || null,
          followUpStatus: !followUps.length ? 'none' : (scheduledMap[s.recipient_email] || []).some(st => st === 'pending') ? 'running' : 'stopped'
        })) || [],
        followUps: followUps || []
      });
    }

    res.json({ campaigns: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// STOP FOLLOW-UP for a recipient in a campaign
// ============================================================
app.post('/api/campaigns/:id/stop-followup', async (req, res) => {
  const { email } = req.body;
  const campaignId = req.params.id;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const { error: cancelErr } = await supabase
      .from('scheduled_emails')
      .update({ status: 'cancelled' })
      .eq('campaign_id', campaignId)
      .eq('recipient_email', email)
      .eq('status', 'pending');
    if (cancelErr) throw cancelErr;

    res.json({ success: true, message: `Follow-ups stopped for ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// START FOLLOW-UP for a recipient in a campaign
// ============================================================
app.post('/api/campaigns/:id/start-followup', async (req, res) => {
  const { email } = req.body;
  const campaignId = req.params.id;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const { data: followUps, error: fuErr } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('campaign_id', campaignId);
    if (fuErr) throw fuErr;

    if (!followUps || followUps.length === 0) {
      return res.status(400).json({ error: 'No follow-up sequence configured for this campaign' });
    }

    // Fetch the original account_email used for this recipient
    let accountEmail = '';
    try {
      const { data: sentRecord } = await supabase
        .from('sent_emails')
        .select('account_email')
        .eq('campaign_id', campaignId)
        .eq('recipient_email', email)
        .maybeSingle();
      if (sentRecord) accountEmail = sentRecord.account_email;
    } catch (_) {}

    for (const fu of followUps) {
      const scheduledTime = new Date();
      scheduledTime.setDate(scheduledTime.getDate() + fu.delay_days);

      const { error: insertErr } = await supabase.from('scheduled_emails').upsert({
        id: uuidv4(),
        campaign_id: campaignId,
        recipient_email: email,
        account_email: accountEmail,
        subject: fu.subject,
        body: fu.body,
        scheduled_at: scheduledTime.toISOString(),
        status: 'pending'
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (insertErr) console.error('Schedule follow-up error:', insertErr.message);
    }

    res.json({ success: true, message: `Follow-ups started for ${email} (${followUps.length} emails scheduled)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
// REPLY DETECTION — scan IMAP inboxes for replies to sent campaigns
// ============================================================
app.post('/api/detect-replies', async (req, res) => {
  try {
    const { data: accounts } = await supabase.from('accounts').select('*');
    if (!accounts || accounts.length === 0) return res.status(400).json({ error: 'No accounts configured' });

    let sentEmails;
    try {
      const result = await supabase
        .from('sent_emails')
        .select('id, recipient_email, account_email, campaign_id, message_id')
        .is('replied', null);
      sentEmails = result.data;
    } catch (_) {
      const result = await supabase
        .from('sent_emails')
        .select('id, recipient_email, account_email, campaign_id')
        .is('replied', null);
      sentEmails = result.data;
    }

    if (!sentEmails || sentEmails.length === 0) return res.json({ replies: [], total: 0 });

    const sentByAccount = {};
    for (const s of sentEmails) {
      if (!sentByAccount[s.account_email]) sentByAccount[s.account_email] = [];
      sentByAccount[s.account_email].push(s);
    }

    const replies = [];
    for (const acc of accounts) {
      const sentList = sentByAccount[acc.email];
      if (!sentList || sentList.length === 0) continue;

      const imap = new ImapFlow({
        host: 'imap.gmail.com', port: 993, secure: true,
        auth: { user: acc.email, pass: acc.appPassword },
        logger: false
      });

      try {
        await imap.connect();
        const mailbox = await imap.mailboxOpen('INBOX');
        const total = mailbox.exists || 0;
        if (total > 0) {
          const start = Math.max(1, total - 99);
          for await (const msg of imap.fetch(`${start}:${total}`, { envelope: true, uid: true, flags: true })) {
            const env = msg.envelope;
            if (!env) continue;
            const rawInReplyTo = env.inReplyTo ? env.inReplyTo.replace(/[<>]/g, '').trim() : null;
            if (!rawInReplyTo) continue;

            // Match against message_id first, fall back to id for backward compat
            const matched = sentList.find(s => (s.message_id && rawInReplyTo === s.message_id) || s.id === rawInReplyTo);
            if (!matched) continue;

            const from = env.from?.[0];
            if (!from) continue;
            const subject = env.subject || '';
            const interested = subject.toLowerCase().includes('interested') || subject.toLowerCase().includes('yes') || subject.toLowerCase().includes('pricing') || subject.toLowerCase().includes('call') || subject.toLowerCase().includes('meeting') || subject.toLowerCase().includes('quote') || subject.toLowerCase().includes('let\'s') || subject.toLowerCase().includes('sounds good') || subject.toLowerCase().includes('schedule');
            const tag = interested ? 'interested' : 'not-interested';

            try {
              await supabase.from('sent_emails').update({
                replied: true,
                replied_at: new Date().toISOString(),
                reply_subject: subject,
                reply_snippet: subject.slice(0, 200),
                tag
              }).eq('id', matched.id);
            } catch (updateErr) {
              console.error('Failed to update reply status:', updateErr.message);
            }

            replies.push({
              email: matched.recipient_email,
              campaignId: matched.campaign_id,
              sentId: matched.id,
              subject,
              tag
            });
          }
        }
        await imap.logout().catch(() => {});
      } catch (imapErr) {
        console.error('IMAP scan failed for', acc.email, imapErr.message);
        try { await imap.logout().catch(() => {}); } catch (_) {}
      }
    }

    res.json({ replies, total: replies.length });
  } catch (err) {
    res.status(500).json({ error: 'Reply detection failed' });
  }
});

// ============================================================
// TAG LEAD — manually tag a lead as interested / not-interested
// ============================================================
app.post('/api/leads/:email/tag', async (req, res) => {
  const { email } = req.params;
  const { tag, campaignId } = req.body;
  if (!['interested', 'not-interested'].includes(tag)) {
    return res.status(400).json({ error: 'Tag must be "interested" or "not-interested"' });
  }
  try {
    const query = supabase.from('sent_emails').update({ tag }).eq('recipient_email', email);
    if (campaignId) query.eq('campaign_id', campaignId);
    await query;
    res.json({ success: true, email, tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET REPLIES for a campaign
// ============================================================
app.get('/api/campaigns/:id/replies', async (req, res) => {
  try {
    const { data } = await supabase
      .from('sent_emails')
      .select('recipient_email, replied, replied_at, reply_subject, reply_snippet, tag')
      .eq('campaign_id', req.params.id)
      .eq('replied', true);
    res.json({ replies: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELIVERY HEALTH — per account bounce/spam stats
// ============================================================
app.get('/api/delivery-health', async (req, res) => {
  try {
    let sent;
    try {
      const result = await supabase.from('sent_emails').select('account_email, bounced, bounce_reason, status');
      sent = result.data;
    } catch (_) {
      // Fallback if bounced/bounce_reason columns don't exist yet
      const result = await supabase.from('sent_emails').select('account_email, status');
      sent = result.data;
    }
    const accountMap = {};
    for (const s of sent || []) {
      if (!accountMap[s.account_email]) accountMap[s.account_email] = { total: 0, bounced: 0, spam: 0, sent: 0 };
      accountMap[s.account_email].total++;
      if (s.status === 'sent') accountMap[s.account_email].sent++;
      if (s.bounced) {
        accountMap[s.account_email].bounced++;
        if (s.bounce_reason === 'spam') accountMap[s.account_email].spam++;
      }
    }
    res.json({ accounts: accountMap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// AI FOLLOW-UP GENERATOR — context-aware unique follow-ups
// ============================================================
app.post('/api/ai/generate-followup', async (req, res) => {
  const { originalSubject, originalBody, pitch, recipientName, recipientBusiness, delayDays } = req.body;
  if (!pitch) return res.status(400).json({ error: 'Pitch is required' });
  if (!recipientName) return res.status(400).json({ error: 'Recipient name is required' });

  let geminiKey;
  try { geminiKey = await getGeminiKey(); } catch (err) {
    return res.status(500).json({ error: 'Gemini API key check failed.' });
  }
  if (!geminiKey) {
    return res.status(400).json({ error: 'Gemini API key is not configured.' });
  }

  const delayDesc = delayDays === 1 ? '1 day' : `${delayDays} days`;
  const prompt = `You are a world-class cold email follow-up copywriter. Write a SINGLE follow-up email.

CONTEXT:
- Recipient: ${recipientName}${recipientBusiness ? ` (${recipientBusiness})` : ''}
- Original email subject: "${originalSubject || 'N/A'}"
- Original email body: "${(originalBody || '').slice(0, 500)}"
- Pitch/offer: ${pitch}
- Days since last email: ${delayDays}

DIRECTIVES:
- This is the follow-up sent ${delayDesc} after the initial email.
- Do NOT repeat the original email. Add NEW value — a different angle, new insight, or social proof.
- Reference the previous email naturally ("Following up on my note from last week...").
- Use the recipient's name naturally.
- Keep it concise (3-5 sentences).
- End with a soft CTA.

OUTPUT FORMAT: Return a raw JSON object ONLY:
{
  "subject": "compelling follow-up subject line (max 10 words)",
  "body": "full email body in clean HTML using <p> and <br /> tags. Do NOT include <html>, <body>, or <head> tags."
}

Return ONLY the JSON object, no markdown, no code fences.`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      },
      { timeout: 30000, headers: { 'X-Goog-Api-Key': geminiKey } }
    );

    let resultText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error('Empty response from Gemini');

    resultText = resultText.trim();
    if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(resultText);
    res.json({ followUp: parsed });
  } catch (err) {
    console.error('Gemini follow-up error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate follow-up', detail: err.message });
  }
});

// ============================================================
// SPAM SCORE CHECKER — analyze email body for spam triggers
// ============================================================
app.post('/api/check-spam', async (req, res) => {
  const { subject, body } = req.body;
  if (!body) return res.status(400).json({ error: 'Email body is required' });

  const plainText = body.replace(/<[^>]+>/g, '').toLowerCase();

  const spamWords = [
    'free', 'act now', 'limited time', 'guaranteed', 'click here', 'exclusive offer',
    'buy now', 'order now', 'urgent', 'congratulations', 'winner', 'cash', 'bonus',
    'earn money', 'work from home', 'no cost', 'no obligation', 'risk free',
    'click below', 'subscribe now', 'don\'t delete', 'amazing', 'deal', 'discount',
    'prize', 'promise', 'credit', 'loan', 'mortgage', 'debt', 'income', 'investment',
    'million dollars', 'billion dollars', 'great offer', 'incredible', 'limited supply',
    'once in a lifetime', 'special promotion', 'this is not spam', 'giveaway',
    '100% free', 'double your', 'extra income', 'financial freedom', 'instant',
    'lowest price', 'only $', 'pounds', 'save money', 'save up to', 'trial',
    'unlimited', 'while supplies last', 'you have been selected', 'dear friend',
    'no catch', 'accept credit cards', 'all natural', 'apply now', 'avoid bankruptcy',
    'be your own boss', 'best price', 'big bucks', 'billion', 'billing', 'bulk email',
    'buy direct', 'cable converter', 'call now', 'cancel at any time', 'can\'t live without',
    'cash bonus', 'cash now', 'collect', 'compare rates', 'cures', 'deal ending soon',
    'dear ', 'debt free', 'delete this', 'disclaimer', 'do it today', 'don\'t hesitate',
    'dormant', 'earn extra cash', 'easy money', 'eliminate debt', 'email marketing',
    'explode your', 'fast cash', 'fast money', 'financial', 'for only', 'for sale',
    'free access', 'free consultation', 'free gift', 'free info', 'free investment',
    'free membership', 'free money', 'free offer', 'free preview', 'free website',
    'get it now', 'get paid', 'giving away', 'guarantee', 'has a solution',
    'hello ', 'hidden', 'home employment', 'home based', 'important information',
    'interest rate', 'join millions', 'life insurance', 'lose weight', 'lower rates',
    'meeting point', 'message contains', 'million', 'miracle', 'money back',
    'multi level marketing', 'name brand', 'no age', 'no catch', 'no credit check',
    'no fees', 'no hidden', 'no interest', 'no investment', 'no purchase necessary',
    'no questions asked', 'no selling', 'not spam', 'now only', 'obligation',
    'offer expires', 'one time', 'online degree', 'only $', 'open source',
    'opt in', 'order today', 'performance', 'phone', 'please read', 'potential',
    'pre approved', 'presenting', 'prevent', 'price', 'print out', 'priority',
    'privacy', 'problem', 'produced', 'promise', 'pure', 'quote', 'rate',
    'real thing', 'refinance', 'refund', 'remove', 'reverses', 'sample',
    'satisfaction guaranteed', 'save up to', 'score', 'search engine', 'serious',
    'sex', 'shopping', 'sign up free', 'solution', 'spam', 'special', 'start now',
    'stock alert', 'stock pick', 'stop snoring', 'strong', 'subject to', 'success',
    'super', 'supplies', 'take action', 'terms and conditions', 'the best',
    'the following', 'this is not spam', 'thousands', 'to someone', 'trial',
    'unbelievable', 'unsecured credit', 'unsolicited', 'us dollars', 'valued',
    'viagra', 'vicodin', 'web address', 'weight loss', 'what are', 'what\'s app',
    'while you\'re', 'while supplies last', 'why pay', 'will not believe', 'win',
    'winner', 'wire transfer', 'work at home', 'you are a winner', 'you have been',
    'you\'re a winner'
  ];

  const foundWords = [];
  for (const word of spamWords) {
    if (plainText.includes(word)) foundWords.push(word);
  }

  // Check excessive punctuation
  const exclCount = (body.match(/!/g) || []).length;
  const questionCount = (body.match(/\?/g) || []).length;
  const capsWordCount = (plainText.match(/\b[A-Z]{2,}\b/g) || []).length;
  const allCapsLines = body.split('\n').filter(l => l.trim() && l === l.toUpperCase() && l.trim().length > 3).length;

  let score = 0;
  const issues = [];

  if (foundWords.length > 0) {
    score += Math.min(foundWords.length * 5, 40);
    issues.push(`${foundWords.length} spam trigger word${foundWords.length > 1 ? 's' : ''} found: ${foundWords.slice(0, 10).join(', ')}${foundWords.length > 10 ? ` (+ ${foundWords.length - 10} more)` : ''}`);
  }
  if (exclCount > 3) {
    score += Math.min((exclCount - 3) * 5, 15);
    issues.push(`${exclCount} exclamation marks — excessive punctuation flagged`);
  }
  if (questionCount > 3) {
    score += Math.min((questionCount - 3) * 3, 10);
    issues.push(`${questionCount} question marks — reduce if possible`);
  }
  if (allCapsLines > 0) {
    score += Math.min(allCapsLines * 10, 20);
    issues.push(`${allCapsLines} line${allCapsLines > 1 ? 's are' : ' is'} in ALL CAPS`);
  }
  if (capsWordCount > 5) {
    score += 5;
    issues.push(`Unusual number of ALL CAPS words`);
  }

  // Check for personalization (good)
  const hasNamePlaceholder = body.includes('{{name}}') || body.includes('{name}') || body.includes('{{Name}}');
  if (!hasNamePlaceholder && !body.includes(',')) {
    score += 10;
    issues.push('No personalization detected — emails without names look templated');
  }

  // Check link count
  const linkCount = (body.match(/https?:\/\//g) || []).length;
  if (linkCount > 3) {
    score += 10;
    issues.push(`${linkCount} links — more than 3 links can trigger spam filters`);
  }

  const result = {
    score: Math.min(score, 100),
    rating: score <= 20 ? 'Safe' : score <= 50 ? 'Warning' : 'High Risk',
    issues,
    foundWords: foundWords.slice(0, 15),
    stats: { exclamationMarks: exclCount, questionMarks: questionCount, links: linkCount, capsLines: allCapsLines, capsWords: capsWordCount }
  };

  res.json(result);
});

// ============================================================
// EXPORT CAMPAIGN — CSV download
// ============================================================
app.get('/api/campaigns/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const { data: sent } = await supabase
      .from('sent_emails')
      .select('recipient_email, account_email, status, opened_at, sent_at, replied, replied_at, tag, bounced, bounce_reason')
      .eq('campaign_id', id);

    const esc = (v) => (v || '').replace(/"/g, '""');
    const headers = 'Email,Sent From,Status,Sent At,Opened At,Replied,Replied At,Tag,Bounced,Bounce Reason';
    const rows = (sent || []).map(s =>
      `"${esc(s.recipient_email)}","${esc(s.account_email)}","${esc(s.status)}","${esc(s.sent_at)}","${esc(s.opened_at)}","${s.replied ? 'Yes' : 'No'}","${esc(s.replied_at)}","${esc(s.tag)}","${s.bounced ? 'Yes' : 'No'}","${esc(s.bounce_reason)}"`
    ).join('\n');

    const csv = `${headers}\n${rows}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
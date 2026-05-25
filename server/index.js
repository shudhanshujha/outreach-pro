const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { parse } = require('csv-parse/sync');
const app = express();

const axios = require('axios');

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('OutreachPro Backend is running!');
});

// Enrichment Route
app.post('/api/enrich', async (req, res) => {
  const { emails } = req.body;
  const apiKey = process.env.HUNTER_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: 'Hunter.io API Key is missing on the server.' });
  }

  const enrichedData = [];
  
  for (const email of emails) {
    try {
      // Using Hunter.io Email Verifier API which also returns some info
      const response = await axios.get(`https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${apiKey}`);
      const data = response.data.data;
      
      enrichedData.push({
        email,
        name: data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : 'Unknown',
        business: data.domain || 'N/A',
        status: data.result
      });
    } catch (err) {
      enrichedData.push({ email, name: 'Failed', business: 'N/A', status: 'error' });
    }
  }

  res.json({ enrichedData });
});

let logs = [];
let status = 'idle'; // idle, running, completed

app.post('/api/send', async (req, res) => {
  const { accounts, recipients, subject, body, delayMin, delayMax } = req.body;
  
  if (status === 'running') {
    return res.status(400).json({ error: 'Outreach already in progress' });
  }

  status = 'running';
  logs = [];
  res.json({ message: 'Outreach started' });

  // Start the process in the background
  (async () => {
    try {
      const minDelay = parseInt(delayMin) * 1000;
      const maxDelay = parseInt(delayMax) * 1000;

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const account = accounts[i % accounts.length];

        const logEntry = `[${i + 1}/${recipients.length}] Sending to ${recipient.email} using ${account.user}...`;
        console.log(logEntry);
        logs.push({ text: logEntry, timestamp: new Date().toISOString() });

        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: account.user,
              pass: account.pass
            }
          });

          const personalizedSubject = subject.replace(/{{(\w+)}}/g, (_, key) => recipient[key] || '');
          const personalizedHtml = body.replace(/{{(\w+)}}/g, (_, key) => recipient[key] || '');

          await transporter.sendMail({
            from: account.user,
            to: recipient.email,
            subject: personalizedSubject,
            html: personalizedHtml
          });

          logs.push({ text: `✓ Sent successfully to ${recipient.email}`, type: 'success', timestamp: new Date().toISOString() });
        } catch (error) {
          logs.push({ text: `✗ Failed to send to ${recipient.email}: ${error.message}`, type: 'error', timestamp: new Date().toISOString() });
        }

        if (i < recipients.length - 1) {
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
          const waitMsg = `Waiting ${Math.round(delay / 1000)}s...`;
          logs.push({ text: waitMsg, type: 'info', timestamp: new Date().toISOString() });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      status = 'completed';
      logs.push({ text: 'Outreach complete!', type: 'success', timestamp: new Date().toISOString() });
    } catch (err) {
      status = 'idle';
      logs.push({ text: `CRITICAL ERROR: ${err.message}`, type: 'error', timestamp: new Date().toISOString() });
    }
  })();
});

app.get('/api/logs', (res, resObj) => {
  resObj.json({ logs, status });
});

app.post('/api/reset', (req, res) => {
  status = 'idle';
  logs = [];
  res.json({ message: 'Reset successful' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

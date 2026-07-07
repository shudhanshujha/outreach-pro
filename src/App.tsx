import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Send, Users, Mail, Settings, RefreshCcw, Terminal, 
  FileText, Sparkles, Loader2, BarChart3, 
  Inbox, ListTree, Clock, KeyRound, CheckCircle2, Trash2, Square, Plus, X,
  Upload, Download, Eye, EyeOff, LogOut, Lock, Play
} from 'lucide-react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfService from './TermsOfService';

// --- TYPES ---
interface Account { email: string; }
interface LogEntry { text: string; type?: 'success' | 'error' | 'info'; timestamp: string; }
interface EmailMessage { uid: number; subject: string; from: string; fromName: string; date: string; seen: boolean; }
interface FollowUp { delayDays: number; subject: string; body: string; }

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const CACHE_KEY = 'outreach_accounts_cache';
const SESSION_KEY = 'outreach_session';
const VALID_USERNAME = 'shudhanshu@2207';
const VALID_PASSWORD = 'admin@shudhanshu';

// --- LOGIN SCREEN ---
const LoginScreen: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    // Simulate a brief async check for UX
    await new Promise(r => setTimeout(r, 600));
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      localStorage.setItem(SESSION_KEY, 'true');
      onLogin();
    } else {
      setError('Invalid username or password.');
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#070708] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-3xl" />
      </div>

      <div
        className={`relative w-full max-w-md transition-all duration-100 ${
          shaking ? 'animate-[shake_0.5s_ease-in-out]' : ''
        }`}
        style={shaking ? { animation: 'shake 0.5s ease-in-out' } : {}}
      >
        {/* Card */}
        <div className="bg-[#0d0d0f] border border-slate-800/60 rounded-3xl p-8 shadow-2xl shadow-black/50">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-4">
              <Send className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Outreach<span className="text-indigo-400">Pro</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">Sign in to your dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Username</label>
              <div className="relative">
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(''); }}
                  placeholder="Enter your username"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 outline-none focus:border-indigo-500/60 transition-colors placeholder:text-slate-600"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 pr-11 text-sm text-slate-200 outline-none focus:border-indigo-500/60 transition-colors placeholder:text-slate-600"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-700 mt-6">
          OutreachPro &mdash; Private Dashboard
        </p>
      </div>

      {/* Shake keyframe */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
};


// --- CSV PARSER UTILITY ---
function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let entry = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        entry += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(entry.trim());
      entry = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      row.push(entry.trim());
      entry = '';
      if (row.some(val => val !== '')) {
        result.push(row);
      }
      row = [];
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      entry += char;
    }
  }
  if (entry || row.length > 0) {
    row.push(entry.trim());
    if (row.some(val => val !== '')) {
      result.push(row);
    }
  }
  return result;
}

const Dashboard: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'campaign' | 'analytics' | 'inbox' | 'prospect' | 'settings' | 'followups' | 'history'>('campaign');
  // ✅ Load accounts from localStorage cache on startup (survives page refresh)
  const [connectedAccounts, setConnectedAccounts] = useState<Account[]>(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
  });
  const [recipientText, setRecipientText] = useState('email,name,business');
  const [subject, setSubject] = useState('Hello {{name}} from {{business}}');
  const [body, setBody] = useState('<p>Hi {{name}},</p>\n<p>I noticed your business, {{business}}, and wanted to reach out regarding a potential collaboration.</p>\n<p>Best regards,<br>Your Name</p>');
  const [followUps, setFollowUps] = useState<FollowUp[]>([
    { delayDays: 3, subject: 'Checking in: {{business}}', body: '<p>Hi {{name}}, just following up on my previous email...</p>' },
    { delayDays: 7, subject: 'Still interested?', body: '<p>Hi {{name}}, following up again...</p>' },
    { delayDays: 10, subject: 'Quick question', body: '<p>Hi {{name}}, following up for the third time...</p>' },
    { delayDays: 15, subject: 'Final follow up', body: '<p>Hi {{name}}, this is my final follow up...</p>' },
  ]);
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(90);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');
  const [isEnriching, setIsEnriching] = useState(false);

  // Parsed recipient list + follow-up selection
  const parsedRecipients = recipientText.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('email,'))
    .map(line => {
      const parts = line.split(',').map(s => s.trim());
      return { email: parts[0] || '', name: parts[1] || 'Unknown', business: parts[2] || 'N/A' };
    })
    .filter(r => r.email);

  const [followUpEmails, setFollowUpEmails] = useState<Set<string>>(new Set());

  const toggleFollowUp = (email: string) => {
    const next = new Set(followUpEmails);
    if (next.has(email)) next.delete(email); else next.add(email);
    setFollowUpEmails(next);
  };

  // Inbox state
  const [inboxMessages, setInboxMessages] = useState<EmailMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [selectedInboxAccount, setSelectedInboxAccount] = useState<string>('');
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [messageBody, setMessageBody] = useState<{ html: string | null; text: string | null } | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [mobileShowReading, setMobileShowReading] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newAppPassword, setNewAppPassword] = useState('');

  // Settings API states
  const [settingsStatus, setSettingsStatus] = useState<{ BREVO_API_KEY: boolean; GEMINI_API_KEY: boolean; APOLLO_API_KEY: boolean }>({
    BREVO_API_KEY: false,
    GEMINI_API_KEY: false,
    APOLLO_API_KEY: false
  });
  const [tempBrevoKey, setTempBrevoKey] = useState('');
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [tempApolloKey, setTempApolloKey] = useState('');
  const [savingBrevo, setSavingBrevo] = useState(false);
  const [savingGemini, setSavingGemini] = useState(false);
  const [savingApollo, setSavingApollo] = useState(false);

  // CSV Import mapping states
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [mappedEmailCol, setMappedEmailCol] = useState<string>('');
  const [mappedNameCol, setMappedNameCol] = useState<string>('');
  const [mappedBusinessCol, setMappedBusinessCol] = useState<string>('');
  const [mappingLoading, setMappingLoading] = useState(false);

  // AI Email Writer states
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('Professional');
  const [aiLength, setAiLength] = useState('Medium');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResultSubject, setAiResultSubject] = useState('');
  const [aiResultBody, setAiResultBody] = useState('');

  // Campaign History state
  const [campaignHistory, setCampaignHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [_actionLoading, _setActionLoading] = useState<string | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<Record<string, Set<string>>>({});

  const handleStopFollowUp = async (campaignId: string, email: string) => {
    _setActionLoading(email);
    try {
      await axios.post(`${API_BASE_URL}/api/campaigns/${campaignId}/stop-followup`, { email });
      fetchCampaignHistory();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to stop follow-ups');
    } finally {
      _setActionLoading(null);
    }
  };

  const handleStartFollowUp = async (campaignId: string, email: string) => {
    _setActionLoading(email);
    try {
      await axios.post(`${API_BASE_URL}/api/campaigns/${campaignId}/start-followup`, { email });
      fetchCampaignHistory();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to start follow-ups');
    } finally {
      _setActionLoading(null);
    }
  };

  // Prospect Search states
  const [searchCompany, setSearchCompany] = useState('');
  const [_searchTitle, _setSearchTitle] = useState('');
  const [_searchIndustry, _setSearchIndustry] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [_searchPage, _setSearchPage] = useState(1);
  const [_searchLoadingMore, _setSearchLoadingMore] = useState(false);
  const [selectedProspects, setSelectedProspects] = useState<Set<number>>(new Set());
  const [_importingProspects, _setImportingProspects] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // --- EFFECTS ---
  useEffect(() => {
    fetchConnectedAccounts();
    fetchSettingsStatus();
    let interval: any;
    if (status === 'running') {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_BASE_URL}/api/logs`);
          setLogs(res.data.logs);
          setStatus(res.data.status);
        } catch (err) { console.error(err); }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (activeTab === 'history') fetchCampaignHistory();
  }, [activeTab]);

  // useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // --- ACTIONS ---
  const fetchConnectedAccounts = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/accounts`);
      setConnectedAccounts(res.data.accounts);
      // ✅ Persist to localStorage so accounts survive page refresh
      localStorage.setItem(CACHE_KEY, JSON.stringify(res.data.accounts));
    } catch (err) {
      console.error('Failed to load accounts — using cached data');
      // Keep showing cached accounts if backend is temporarily unreachable
    }
  };

  const fetchSettingsStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/settings`);
      setSettingsStatus(res.data.settings);
    } catch (err) {
      console.error('Failed to fetch settings status');
    }
  };

  const fetchCampaignHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/campaigns`);
      setCampaignHistory(res.data.campaigns);
    } catch (err) {
      console.error('Failed to fetch campaign history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSaveSetting = async (key: 'BREVO_API_KEY' | 'GEMINI_API_KEY' | 'APOLLO_API_KEY', value: string) => {
    if (!value) return alert('Please enter a key value');
    if (key === 'BREVO_API_KEY') setSavingBrevo(true);
    else if (key === 'GEMINI_API_KEY') setSavingGemini(true);
    else setSavingApollo(true);
    
    try {
      await axios.post(`${API_BASE_URL}/api/settings`, { key, value });
      alert('Key saved successfully!');
      if (key === 'BREVO_API_KEY') setTempBrevoKey('');
      else if (key === 'GEMINI_API_KEY') setTempGeminiKey('');
      else setTempApolloKey('');
      fetchSettingsStatus();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save key');
    } finally {
      if (key === 'BREVO_API_KEY') setSavingBrevo(false);
      else if (key === 'GEMINI_API_KEY') setSavingGemini(false);
      else setSavingApollo(false);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        alert('CSV file is empty');
        return;
      }

      const headers = parsed[0];
      const dataRows = parsed.slice(1);
      setCsvHeaders(headers);
      setCsvRows(dataRows);

      // Pre-select defaults if any headers match
      const emailIdx = headers.findIndex(h => h.toLowerCase().includes('email'));
      const nameIdx = headers.findIndex(h => h.toLowerCase().includes('name') && !h.toLowerCase().includes('company') && !h.toLowerCase().includes('business'));
      const businessIdx = headers.findIndex(h => h.toLowerCase().includes('company') || h.toLowerCase().includes('business') || h.toLowerCase().includes('organization'));

      setMappedEmailCol(emailIdx !== -1 ? headers[emailIdx] : headers[0] || '');
      setMappedNameCol(nameIdx !== -1 ? headers[nameIdx] : headers[1] || headers[0] || '');
      setMappedBusinessCol(businessIdx !== -1 ? headers[businessIdx] : headers[2] || headers[0] || '');

      setShowCsvModal(true);

      // Call Gemini for smart mapping if Gemini key is active
      if (settingsStatus.GEMINI_API_KEY) {
        setMappingLoading(true);
        try {
          const samples = dataRows.slice(0, 5).map(row => row.slice(0, headers.length));
          const res = await axios.post(`${API_BASE_URL}/api/ai/map-csv`, {
            headers,
            samples
          });
          if (res.data) {
            if (res.data.emailColumn) setMappedEmailCol(res.data.emailColumn);
            if (res.data.nameColumn) setMappedNameCol(res.data.nameColumn);
            if (res.data.businessColumn) setMappedBusinessCol(res.data.businessColumn);
          }
        } catch (err) {
          console.warn('Gemini smart mapping failed, using heuristic fallback', err);
        } finally {
          setMappingLoading(false);
        }
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleConfirmCsvMapping = () => {
    const emailIdx = csvHeaders.indexOf(mappedEmailCol);
    const nameIdx = csvHeaders.indexOf(mappedNameCol);
    const businessIdx = csvHeaders.indexOf(mappedBusinessCol);

    if (emailIdx === -1) {
      alert('Please select a valid email column.');
      return;
    }

    const rows = csvRows.map(row => {
      const email = row[emailIdx] || '';
      const name = nameIdx !== -1 ? row[nameIdx] || 'Unknown' : 'Unknown';
      const business = businessIdx !== -1 ? row[businessIdx] || 'N/A' : 'N/A';
      return `${email},${name},${business}`;
    });

    setRecipientText(rows.join('\n'));
    setShowCsvModal(false);
  };

  const handleExportCsv = () => {
    if (!recipientText.trim()) {
      alert('No recipients to export');
      return;
    }
    const header = 'email,name,business\n';
    const blob = new Blob([header + recipientText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'outreach_recipients.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAiGenerateEmail = async () => {
    if (!aiPrompt.trim()) return alert('Please enter what you want the email to say.');
    setAiGenerating(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/ai/write-email`, {
        prompt: aiPrompt,
        tone: aiTone,
        length: aiLength
      });
      setAiResultSubject(res.data.subject || '');
      setAiResultBody(res.data.body || '');
    } catch (err: any) {
      alert(err.response?.data?.error || 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newEmail || !newAppPassword) return alert('Enter both email and app password.');
    try {
      await axios.post(`${API_BASE_URL}/api/accounts`, { email: newEmail, appPassword: newAppPassword });
      setNewEmail('');
      setNewAppPassword('');
      setShowAddForm(false);
      fetchConnectedAccounts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add account');
    }
  };

  const handleRemoveAccount = async (email: string) => {
    if (!confirm(`Are you sure you want to remove ${email}?`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/accounts/${email}`);
      // Also remove from local cache immediately
      const updated = connectedAccounts.filter(a => a.email !== email);
      setConnectedAccounts(updated);
      localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
    } catch (err) { alert('Failed to remove account'); }
  };

  // ✅ Stop running campaign
  const handleStop = async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/stop`);
      setStatus('idle');
    } catch (err) { alert('Failed to stop campaign'); }
  };

  const handleEnrich = async () => {
    const emails = recipientText.split('\n').map(l => l.split(',')[0].trim()).filter(e => e);
    if (emails.length === 0) return alert('Enter emails first');
    setIsEnriching(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/enrich`, { emails });
      if (res.data.enrichedData) {
        setRecipientText(res.data.enrichedData.map((i: any) => `${i.email}, ${i.name}, ${i.business}`).join('\n'));
      } else {
        alert(res.data.error || 'Enrichment unavailable');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Enrichment failed');
    }
    finally { setIsEnriching(false); }
  };

  const handleStart = async () => {
    if (connectedAccounts.length === 0) return alert('Connect at least one Gmail account first.');
    const recipients = recipientText.split('\n').filter(l => l.trim()).map(line => {
      const p = line.split(',').map(s => s.trim());
      return { email: p[0], name: p[1] || 'Unknown', business: p[2] || 'N/A' };
    });
    try {
      await axios.post(`${API_BASE_URL}/api/send`, { 
        accounts: connectedAccounts.map(a => ({ user: a.email })), 
        recipients, 
        subject, 
        body, 
        delayMin, 
        delayMax,
        followUps,
        followUpEmails: Array.from(followUpEmails)
      });
      setStatus('running');
      setActiveTab('campaign');
    } catch (err) { alert('Failed to start'); }
  };

  const updateFollowUp = (index: number, field: keyof FollowUp, value: any) => {
    const newFollowUps = [...followUps];
    newFollowUps[index] = { ...newFollowUps[index], [field]: value };
    setFollowUps(newFollowUps);
  };

  const fetchInboxForAccount = async (accountEmail: string) => {
    if (!accountEmail) return;
    setLoadingInbox(true);
    setSelectedMessage(null);
    setMessageBody(null);
    setInboxMessages([]);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/inbox`, { account: { user: accountEmail } });
      setInboxMessages(res.data.messages || []);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to fetch inbox');
    } finally {
      setLoadingInbox(false);
    }
  };

  const fetchMessageBody = async (msg: EmailMessage) => {
    setSelectedMessage(msg);
    setMessageBody(null);
    setLoadingBody(true);
    setMobileShowReading(true);
    // Mark as seen locally
    setInboxMessages(prev => prev.map(m => m.uid === msg.uid ? { ...m, seen: true } : m));
    try {
      const res = await axios.post(`${API_BASE_URL}/api/inbox/body`, {
        accountEmail: selectedInboxAccount,
        uid: msg.uid
      });
      setMessageBody(res.data);
    } catch (err: any) {
      setMessageBody({ html: null, text: 'Failed to load message body.' });
    } finally {
      setLoadingBody(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070708] text-slate-300 font-sans">
      <aside className="fixed left-0 top-0 bottom-0 w-20 md:w-64 bg-[#0d0d0f] border-r border-slate-800/50 z-50 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800/50">
          <Link to="/" className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
              <Send className="w-5 h-5 text-white" />
            </div>
            <span className="hidden md:block font-bold text-lg text-white tracking-tight">Outreach<span className="text-indigo-500">Pro</span></span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-2 mt-4">
          <button onClick={() => setActiveTab('campaign')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'campaign' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-slate-800/50 text-slate-500'}`}>
            <ListTree className="w-5 h-5" />
            <span className="hidden md:block font-medium">Campaign</span>
          </button>
          <button onClick={() => setActiveTab('followups')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'followups' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-slate-800/50 text-slate-500'}`}>
            <Clock className="w-5 h-5" />
            <span className="hidden md:block font-medium">Follow-ups</span>
          </button>
          <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-slate-800/50 text-slate-500'}`}>
            <BarChart3 className="w-5 h-5" />
            <span className="hidden md:block font-medium">History</span>
          </button>
          <button onClick={() => setActiveTab('inbox')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'inbox' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-slate-800/50 text-slate-500'}`}>
            <Inbox className="w-5 h-5" />
            <span className="hidden md:block font-medium">Unified Inbox</span>
          </button>
          <button onClick={() => setActiveTab('prospect')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'prospect' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-slate-800/50 text-slate-500'}`}>
            <Users className="w-5 h-5" />
            <span className="hidden md:block font-medium">Prospect Search</span>
          </button>
          <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'analytics' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-slate-800/50 text-slate-500'}`}>
            <BarChart3 className="w-5 h-5" />
            <span className="hidden md:block font-medium">Analytics</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-slate-800/50 text-slate-500'}`}>
            <Settings className="w-5 h-5" />
            <span className="hidden md:block font-medium">Settings</span>
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800/50 space-y-3">
           <div className="space-y-1">
             <Link to="/privacy" className="block text-[10px] text-slate-600 hover:text-slate-400 uppercase font-bold tracking-widest">Privacy Policy</Link>
             <Link to="/terms" className="block text-[10px] text-slate-600 hover:text-slate-400 uppercase font-bold tracking-widest">Terms of Service</Link>
           </div>
           <div className="flex items-center gap-3 px-3 py-2 bg-slate-900/50 rounded-xl">
              <div className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{status}</span>
           </div>
           <button
             onClick={onLogout}
             className="w-full flex items-center gap-3 p-3 rounded-xl text-slate-600 hover:text-rose-400 hover:bg-rose-500/5 transition-all group"
             title="Sign out"
           >
             <LogOut className="w-4 h-4" />
             <span className="hidden md:block text-xs font-bold uppercase tracking-widest">Sign Out</span>
           </button>
        </div>
      </aside>

      <main className="ml-20 md:ml-64 p-6 md:p-10 relative">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'campaign' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="xl:col-span-7 space-y-8">
                <section className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Settings className="w-4 h-4" /> Gmail Rotation (Goal: 5+)
                      </h2>
                      <p className="text-[10px] text-slate-500 mt-1">Add Gmail accounts using App Passwords (requires 2FA enabled).</p>
                    </div>
                    <button onClick={() => setShowAddForm(true)} className="text-xs flex items-center gap-2 font-bold text-white bg-indigo-600 px-4 py-2 rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20">
                      <Plus className="w-3.5 h-3.5" /> Add Account
                    </button>
                  </div>

                  {showAddForm && (
                    <div className="mb-6 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">New Gmail Account</span>
                        <button onClick={() => setShowAddForm(false)} className="text-slate-500 hover:text-slate-300">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <input
                        placeholder="Gmail address"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
                      />
                      <div>
                        <input
                          type="password"
                          placeholder="App Password (get from myaccount.google.com/apppasswords)"
                          value={newAppPassword}
                          onChange={e => setNewAppPassword(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
                        />
                        <p className="text-[10px] text-slate-600 mt-1">Enable 2FA, then visit <span className="text-indigo-400">myaccount.google.com/apppasswords</span> to generate one.</p>
                      </div>
                      <button onClick={handleAddAccount} className="w-full bg-indigo-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-indigo-500 transition-all flex items-center justify-center gap-2">
                        <KeyRound className="w-3.5 h-3.5" /> Save Account
                      </button>
                    </div>
                  )}

                  <div className="mb-6">
                    <div className="flex justify-between text-[10px] font-bold uppercase mb-2">
                      <span className={connectedAccounts.length >= 5 ? 'text-emerald-400' : 'text-indigo-400'}>
                        {connectedAccounts.length} / 5 Accounts Connected
                      </span>
                      <span className="text-slate-600">{Math.min(100, (connectedAccounts.length / 5) * 100)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${connectedAccounts.length >= 5 ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                        style={{ width: `${Math.min(100, (connectedAccounts.length / 5) * 100)}%` }} 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {connectedAccounts.length === 0 && <div className="text-slate-600 text-sm italic p-4 text-center border border-dashed border-slate-800 rounded-xl">No accounts added yet. Click "Add Account" to add your first Gmail with an app password.</div>}
                    {connectedAccounts.map((acc, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800/50 group">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center"><Mail className="w-4 h-4 text-indigo-400" /></div>
                           <span className="text-sm font-medium text-slate-200">{acc.email}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-500/50 uppercase">Active</span>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          </div>
                          <button 
                            onClick={() => handleRemoveAccount(acc.email)}
                            className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                            title="Remove Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Users className="w-4 h-4" /> Recipients
                    </h2>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => fileInputRef.current?.click()} 
                        className="text-xs flex items-center gap-2 font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Import CSV
                      </button>
                      <button 
                        onClick={handleExportCsv} 
                        className="text-xs flex items-center gap-2 font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                      </button>
                      <button onClick={handleEnrich} disabled={isEnriching} className="text-xs flex items-center gap-2 font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all">
                        {isEnriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Enrich Leads
                      </button>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleCsvUpload} 
                      accept=".csv" 
                      className="hidden" 
                    />
                  </div>
                  <textarea value={recipientText} onChange={e => setRecipientText(e.target.value)} className="w-full h-40 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm font-mono text-slate-400 focus:border-indigo-500/50 outline-none resize-none" />
                </section>

                <section className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-4 h-4" /> Initial Email
                    </h2>
                    <button 
                      onClick={() => {
                        setAiResultSubject('');
                        setAiResultBody('');
                        setShowAiModal(true);
                      }} 
                      className="text-xs flex items-center gap-2 font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Write with AI
                    </button>
                  </div>
                  <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold mb-4 focus:border-indigo-500/50 outline-none" />
                  <textarea value={body} onChange={e => setBody(e.target.value)} className="w-full h-64 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm font-mono focus:border-indigo-500/50 outline-none resize-none" />
                </section>

                <section className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Follow-up Sequence (Triggers on Open)
                  </h2>
                  <div className="space-y-6">
                    {followUps.map((fu, idx) => (
                      <div key={idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800/50 space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-xs font-bold border border-indigo-500/20">Day {fu.delayDays}</span>
                          <input placeholder="Subject" value={fu.subject} onChange={e => updateFollowUp(idx, 'subject', e.target.value)} className="flex-1 bg-transparent border-b border-slate-800 py-1 text-sm outline-none focus:border-indigo-500/50" />
                        </div>
                        <textarea placeholder="Body" value={fu.body} onChange={e => updateFollowUp(idx, 'body', e.target.value)} className="w-full bg-transparent text-xs font-mono py-2 outline-none h-20 resize-none" />
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="xl:col-span-5">
                <div className="sticky top-10 space-y-8">
                  <section className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 rounded-3xl shadow-2xl shadow-indigo-500/20 text-white">
                    <h2 className="text-2xl font-bold mb-2 text-white">Ready to launch?</h2>
                    <p className="text-indigo-100/70 text-sm mb-6">Click to begin outreach to {parsedRecipients.length} leads</p>
                    <div className="flex items-center gap-2 mb-8">
                      <span className="bg-white/10 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                        {followUpEmails.size} with follow-ups
                      </span>
                      <button
                        onClick={() => setActiveTab('followups')}
                        className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      >
                        Manage
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      <div className="bg-white/10 p-4 rounded-2xl">
                        <label className="text-[10px] uppercase font-bold text-indigo-200 block mb-1">Min Delay</label>
                        <input type="number" value={delayMin} onChange={e => setDelayMin(Number(e.target.value))} className="bg-transparent text-xl font-bold outline-none w-full text-white" />
                      </div>
                      <div className="bg-white/10 p-4 rounded-2xl">
                        <label className="text-[10px] uppercase font-bold text-indigo-200 block mb-1">Max Delay</label>
                        <input type="number" value={delayMax} onChange={e => setDelayMax(Number(e.target.value))} className="bg-transparent text-xl font-bold outline-none w-full text-white" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <button onClick={handleStart} disabled={status === 'running' || connectedAccounts.length === 0} className="w-full bg-white text-indigo-600 font-bold py-4 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50">
                        {status === 'running' ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Campaign Active...
                          </span>
                        ) : 'Start Now'}
                      </button>
                      {status === 'running' && (
                        <button onClick={handleStop} className="w-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold py-3 rounded-2xl hover:bg-rose-500/30 transition-all flex items-center justify-center gap-2">
                          <Square className="w-4 h-4" /> Stop Campaign
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="bg-[#111113] rounded-2xl border border-slate-800/40 shadow-sm overflow-hidden flex flex-col h-[400px]">
                    <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-800/50 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Terminal className="w-3 h-3" /> System Logs</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2">
                      {logs.map((l, i) => (
                        <div key={i} className={`flex gap-3 ${l.type === 'success' ? 'text-emerald-400' : l.type === 'error' ? 'text-rose-400' : 'text-slate-400'}`}>
                          <span className="opacity-30">{new Date(l.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                          <span>{l.text}</span>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'inbox' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-white">Unified Inbox</h1>
                  <p className="text-slate-500 text-sm mt-1">Read replies from all your connected accounts.</p>
                </div>
                <button
                  onClick={() => selectedInboxAccount && fetchInboxForAccount(selectedInboxAccount)}
                  disabled={loadingInbox || !selectedInboxAccount}
                  className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-500 transition-all disabled:opacity-40 text-sm"
                >
                  {loadingInbox ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  Refresh
                </button>
              </div>

              {/* Account Switcher */}
              {connectedAccounts.length === 0 ? (
                <div className="bg-[#111113] border border-slate-800/40 rounded-2xl p-12 text-center">
                  <Inbox className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No accounts connected.</p>
                  <p className="text-slate-600 text-xs mt-1">Add a Gmail account in the Campaign tab to get started.</p>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    {connectedAccounts.map((acc) => (
                      <button
                        key={acc.email}
                        onClick={() => {
                          setSelectedInboxAccount(acc.email);
                          fetchInboxForAccount(acc.email);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                          selectedInboxAccount === acc.email
                            ? 'bg-indigo-600/15 text-indigo-300 border-indigo-500/30'
                            : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[9px] font-black text-indigo-300">
                          {acc.email[0].toUpperCase()}
                        </div>
                        {acc.email}
                      </button>
                    ))}
                  </div>

                  {/* Two-pane inbox layout */}
                  {!selectedInboxAccount ? (
                    <div className="bg-[#111113] border border-slate-800/40 rounded-2xl p-12 text-center">
                      <Mail className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">Select an account above to load its inbox.</p>
                    </div>
                  ) : (
                    <div className="bg-[#111113] border border-slate-800/40 rounded-2xl overflow-hidden shadow-xl" style={{ height: 'calc(100vh - 260px)', minHeight: '500px' }}>
                      <div className="flex h-full">
                        {/* Message List */}
                        <div className={`flex flex-col border-r border-slate-800/50 ${
                          mobileShowReading ? 'hidden md:flex' : 'flex'
                        } w-full md:w-[340px] lg:w-[380px] flex-shrink-0`}>
                          <div className="px-4 py-3 border-b border-slate-800/50 bg-slate-900/30">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              {loadingInbox ? 'Loading...' : `${inboxMessages.length} Messages`}
                            </span>
                          </div>
                          <div className="flex-1 overflow-y-auto">
                            {loadingInbox ? (
                              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span className="text-xs">Fetching inbox via IMAP...</span>
                              </div>
                            ) : inboxMessages.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 p-8 text-center">
                                <Inbox className="w-8 h-8" />
                                <p className="text-sm">No messages found.</p>
                              </div>
                            ) : (
                              inboxMessages.map((msg) => {
                                const initials = (msg.fromName || msg.from).slice(0, 2).toUpperCase();
                                const isSelected = selectedMessage?.uid === msg.uid;
                                const formattedDate = (() => {
                                  const d = new Date(msg.date);
                                  const now = new Date();
                                  const isToday = d.toDateString() === now.toDateString();
                                  return isToday
                                    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                })();
                                return (
                                  <button
                                    key={msg.uid}
                                    onClick={() => fetchMessageBody(msg)}
                                    className={`w-full text-left px-4 py-3.5 border-b border-slate-800/30 transition-all group ${
                                      isSelected
                                        ? 'bg-indigo-600/10 border-l-2 border-l-indigo-500'
                                        : 'hover:bg-white/[0.02] border-l-2 border-l-transparent'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center text-[11px] font-black text-indigo-300 flex-shrink-0 mt-0.5">
                                        {initials}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                          <span className={`text-xs truncate ${
                                            !msg.seen ? 'font-bold text-white' : 'font-medium text-slate-400'
                                          }`}>
                                            {msg.fromName || msg.from}
                                          </span>
                                          <span className="text-[10px] text-slate-600 flex-shrink-0">{formattedDate}</span>
                                        </div>
                                        <p className={`text-xs truncate ${
                                          !msg.seen ? 'text-slate-300 font-semibold' : 'text-slate-500'
                                        }`}>
                                          {msg.subject}
                                        </p>
                                        {!msg.seen && (
                                          <div className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Reading Pane */}
                        <div className={`flex flex-col flex-1 min-w-0 ${
                          !mobileShowReading ? 'hidden md:flex' : 'flex'
                        }`}>
                          {!selectedMessage ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-700">
                              <Mail className="w-12 h-12" />
                              <p className="text-sm text-slate-500">Select a message to read it</p>
                            </div>
                          ) : (
                            <>
                              {/* Reading pane header */}
                              <div className="px-6 py-4 border-b border-slate-800/50 bg-slate-900/20">
                                <button
                                  onClick={() => { setMobileShowReading(false); }}
                                  className="md:hidden flex items-center gap-1.5 text-xs text-indigo-400 mb-3 font-bold"
                                >
                                  ← Back to inbox
                                </button>
                                <h2 className="text-base font-bold text-white mb-2 leading-snug">{selectedMessage.subject}</h2>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 flex items-center justify-center text-[10px] font-black text-indigo-300">
                                      {(selectedMessage.fromName || selectedMessage.from).slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-slate-200">{selectedMessage.fromName}</p>
                                      <p className="text-[10px] text-slate-500">{selectedMessage.from}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] text-slate-600">
                                      {new Date(selectedMessage.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                    </span>
                                    <a
                                      href={`mailto:${selectedMessage.from}?subject=Re: ${encodeURIComponent(selectedMessage.subject)}`}
                                      className="flex items-center gap-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                    >
                                      <Mail className="w-3.5 h-3.5" /> Reply
                                    </a>
                                  </div>
                                </div>
                              </div>

                              {/* Body */}
                              <div className="flex-1 overflow-hidden">
                                {loadingBody ? (
                                  <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                    <span className="text-xs">Loading message...</span>
                                  </div>
                                ) : messageBody?.html ? (
                                  <iframe
                                    srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#cbd5e1;background:#0f0f11;}a{color:#818cf8;}img{max-width:100%;}</style></head><body>${messageBody.html}</body></html>`}
                                    className="w-full h-full border-0"
                                    sandbox="allow-same-origin"
                                    title="Email content"
                                  />
                                ) : messageBody?.text ? (
                                  <div className="p-6 overflow-y-auto h-full">
                                    <pre className="text-sm text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">{messageBody.text}</pre>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600 p-8 text-center">
                                    <FileText className="w-8 h-8" />
                                    <p className="text-sm">No content could be loaded for this message.</p>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'followups' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-white">Follow-up Settings</h1>
                  <p className="text-slate-500 text-sm mt-1">Manage your follow-up sequence and choose who receives it.</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-slate-400">{parsedRecipients.length} recipients</span>
                  <span className="w-px h-4 bg-slate-700" />
                  <span className="text-indigo-400 font-bold">{followUpEmails.size} with follow-ups</span>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                {/* Sequence config */}
                <div className="xl:col-span-7 space-y-8">
                  <section className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Follow-up Sequence (Triggers on Open)
                    </h2>
                    <div className="space-y-6">
                      {followUps.map((fu, idx) => (
                        <div key={idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800/50 space-y-3">
                          <div className="flex items-center gap-3">
                            <span className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg text-xs font-bold border border-indigo-500/20">Day {fu.delayDays}</span>
                            <input
                              placeholder="Subject"
                              value={fu.subject}
                              onChange={e => updateFollowUp(idx, 'subject', e.target.value)}
                              className="flex-1 bg-transparent border-b border-slate-800 py-1 text-sm outline-none focus:border-indigo-500/50"
                            />
                          </div>
                          <textarea
                            placeholder="Body"
                            value={fu.body}
                            onChange={e => updateFollowUp(idx, 'body', e.target.value)}
                            className="w-full bg-transparent text-xs font-mono py-2 outline-none h-20 resize-none placeholder:text-slate-600"
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* Recipient assignment */}
                <div className="xl:col-span-5 space-y-8">
                  <div className="sticky top-10 space-y-8">
                    <section className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <Users className="w-4 h-4" /> Assign Follow-ups
                        </h2>
                        <div className="flex gap-2 text-[10px]">
                          <button onClick={() => setFollowUpEmails(new Set(parsedRecipients.map(r => r.email)))} className="text-indigo-400 hover:text-indigo-300 uppercase font-bold tracking-widest">All</button>
                          <button onClick={() => setFollowUpEmails(new Set())} className="text-slate-500 hover:text-slate-300 uppercase font-bold tracking-widest">None</button>
                        </div>
                      </div>

                      {parsedRecipients.length === 0 ? (
                        <div className="text-slate-600 text-sm italic p-6 text-center border border-dashed border-slate-800 rounded-xl">
                          No recipients loaded. Go to <button onClick={() => setActiveTab('campaign')} className="text-indigo-400 underline">Campaign</button> to add contacts.
                        </div>
                      ) : (
                        <div className="border border-slate-800/50 rounded-xl overflow-hidden">
                          <div className="max-h-[420px] overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-900/80 sticky top-0">
                                <tr className="text-slate-500 uppercase tracking-wider">
                                  <th className="px-3 py-2 text-left w-8">
                                    <input
                                      type="checkbox"
                                      checked={parsedRecipients.length > 0 && followUpEmails.size === parsedRecipients.length}
                                      onChange={() => {
                                        if (followUpEmails.size === parsedRecipients.length) setFollowUpEmails(new Set());
                                        else setFollowUpEmails(new Set(parsedRecipients.map(r => r.email)));
                                      }}
                                      className="accent-indigo-500"
                                    />
                                  </th>
                                  <th className="px-3 py-2 text-left font-bold">Email</th>
                                  <th className="px-3 py-2 text-left font-bold hidden sm:table-cell">Name</th>
                                  <th className="px-3 py-2 text-left font-bold">Follow-ups</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/20">
                                {parsedRecipients.map((r, i) => (
                                  <tr key={i} className="hover:bg-white/[0.02] transition-all">
                                    <td className="px-3 py-2">
                                      <input
                                        type="checkbox"
                                        checked={followUpEmails.has(r.email)}
                                        onChange={() => toggleFollowUp(r.email)}
                                        className="accent-indigo-500"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-slate-300 font-medium truncate max-w-[180px]">{r.email}</td>
                                    <td className="px-3 py-2 text-slate-500 hidden sm:table-cell truncate max-w-[100px]">{r.name}</td>
                                    <td className="px-3 py-2">
                                      {followUpEmails.has(r.email) ? (
                                        <span className="text-indigo-400 text-[10px] font-bold">On</span>
                                      ) : (
                                        <span className="text-slate-600 text-[10px] font-bold">Off</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="px-3 py-2 bg-slate-900/40 border-t border-slate-800/30 flex justify-between text-[10px] text-slate-500">
                            <span>{parsedRecipients.length} total</span>
                            <span className="text-indigo-400 font-bold">{followUpEmails.size} with follow-ups</span>
                          </div>
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-white">Campaign History</h1>
                  <p className="text-slate-500 text-sm mt-1">Past campaigns, sent emails, and recipient details.</p>
                </div>
                <button
                  onClick={fetchCampaignHistory}
                  disabled={loadingHistory}
                  className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-500 transition-all disabled:opacity-40 text-sm"
                >
                  {loadingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  Refresh
                </button>
              </div>

              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-600">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">Loading campaigns...</span>
                </div>
              ) : campaignHistory.length === 0 ? (
                <div className="bg-[#111113] border border-slate-800/40 rounded-2xl p-12 text-center">
                  <BarChart3 className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No campaigns yet.</p>
                  <p className="text-slate-600 text-xs mt-1">Start a campaign from the Campaign tab to see history here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {campaignHistory.map((c) => (
                    <div key={c.id} className="bg-[#111113] border border-slate-800/40 rounded-2xl overflow-hidden shadow-sm">
                      {/* Campaign header */}
                      <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-all" onClick={() => setExpandedCampaign(expandedCampaign === c.id ? null : c.id)}>
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === 'completed' ? 'bg-emerald-500' : c.status === 'running' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-600'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{c.subject || '(No subject)'}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {' · '}{c.totalRecipients} recipients · {c.sentCount} sent · {c.openedCount} opened
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${c.status === 'completed' ? 'text-emerald-400' : c.status === 'running' ? 'text-indigo-400' : 'text-slate-500'}`}>
                            {c.status}
                          </span>
                          <span className="text-slate-600 text-lg">{expandedCampaign === c.id ? '−' : '+'}</span>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {expandedCampaign === c.id && (
                        <div className="border-t border-slate-800/40 p-5 space-y-6">
                          {/* Follow-up sequence used */}
                          {c.followUps?.length > 0 && (
                            <div>
                              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Follow-up Sequence</h3>
                              <div className="flex flex-wrap gap-2">
                                {c.followUps.map((fu: any, i: number) => (
                                  <span key={i} className="bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-indigo-500/20">
                                    Day {fu.delay_days}: {fu.subject?.slice(0, 40)}{fu.subject?.length > 40 ? '...' : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Sent recipients table */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                {c.totalRecipients} Recipients
                              </h3>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-600">
                                  {(selectedRecipients[c.id] || new Set()).size} selected
                                </span>
                                <button
                                  onClick={() => {
                                    const sel = selectedRecipients[c.id] || new Set();
                                    if (sel.size === c.recipients.length) {
                                      const next = { ...selectedRecipients, [c.id]: new Set() };
                                      setSelectedRecipients(next);
                                    } else {
                                      const next = { ...selectedRecipients, [c.id]: new Set(c.recipients.map((r: any) => r.email)) };
                                      setSelectedRecipients(next);
                                    }
                                  }}
                                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest"
                                >
                                  {(selectedRecipients[c.id] || new Set()).size === c.recipients.length ? 'Deselect All' : 'Select All'}
                                </button>
                              </div>
                            </div>

                            {/* Bulk action bar */}
                            {(selectedRecipients[c.id] || new Set()).size > 0 && (
                              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                                <span className="text-[10px] text-slate-400 flex-1">{(selectedRecipients[c.id] || new Set()).size} recipient(s) selected</span>
                                <button
                                  onClick={async () => {
                                    const emails = Array.from(selectedRecipients[c.id] || []);
                                    for (const email of emails) {
                                      await handleStartFollowUp(c.id, email);
                                    }
                                    setSelectedRecipients(prev => ({ ...prev, [c.id]: new Set() }));
                                  }}
                                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-indigo-500/10 transition-all"
                                >
                                  <Play className="w-3 h-3" /> Start All
                                </button>
                                <button
                                  onClick={async () => {
                                    const emails = Array.from(selectedRecipients[c.id] || []);
                                    for (const email of emails) {
                                      await handleStopFollowUp(c.id, email);
                                    }
                                    setSelectedRecipients(prev => ({ ...prev, [c.id]: new Set() }));
                                  }}
                                  className="text-[10px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-rose-500/10 transition-all"
                                >
                                  <Square className="w-3 h-3" /> Stop All
                                </button>
                              </div>
                            )}

                            <div className="border border-slate-800/50 rounded-xl overflow-hidden">
                              <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-900/80 sticky top-0">
                                    <tr className="text-slate-500 uppercase tracking-wider">
                                      <th className="px-3 py-2 text-left w-8">
                                        <input
                                          type="checkbox"
                                          checked={c.recipients.length > 0 && (selectedRecipients[c.id] || new Set()).size === c.recipients.length}
                                          onChange={() => {
                                            const sel = selectedRecipients[c.id] || new Set();
                                            if (sel.size === c.recipients.length) {
                                              setSelectedRecipients(prev => ({ ...prev, [c.id]: new Set() }));
                                            } else {
                                              setSelectedRecipients(prev => ({ ...prev, [c.id]: new Set(c.recipients.map((r: any) => r.email)) }));
                                            }
                                          }}
                                          className="accent-indigo-500"
                                        />
                                      </th>
                                      <th className="px-3 py-2 text-left font-bold">Email</th>
                                      <th className="px-3 py-2 text-left font-bold hidden sm:table-cell">Sent From</th>
                                      <th className="px-3 py-2 text-left font-bold">Status</th>
                                      <th className="px-3 py-2 text-left font-bold hidden md:table-cell">Opened</th>
                                      <th className="px-3 py-2 text-left font-bold w-24">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/20">
                                    {c.recipients.map((r: any, i: number) => (
                                      <tr key={i} className={`hover:bg-white/[0.02] transition-all ${(selectedRecipients[c.id] || new Set()).has(r.email) ? 'bg-indigo-600/5' : ''}`}>
                                        <td className="px-3 py-2">
                                          <input
                                            type="checkbox"
                                            checked={(selectedRecipients[c.id] || new Set()).has(r.email)}
                                            onChange={() => {
                                              const sel = new Set(selectedRecipients[c.id] || []);
                                              if (sel.has(r.email)) sel.delete(r.email); else sel.add(r.email);
                                              setSelectedRecipients(prev => ({ ...prev, [c.id]: sel }));
                                            }}
                                            className="accent-indigo-500"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-slate-300 font-medium truncate max-w-[160px]">{r.email}</td>
                                        <td className="px-3 py-2 text-slate-500 hidden sm:table-cell truncate max-w-[140px]">{r.account}</td>
                                        <td className="px-3 py-2">
                                          <span className={`text-[10px] font-bold ${r.status === 'sent' ? 'text-emerald-400' : r.status === 'failed' ? 'text-rose-400' : 'text-slate-500'}`}>
                                            {r.status}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 hidden md:table-cell">
                                          {r.opened_at ? (
                                            <span className="text-emerald-400 text-[10px] font-bold">
                                              {new Date(r.opened_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                            </span>
                                          ) : r.status === 'sent' ? (
                                            <span className="text-slate-600 text-[10px]">—</span>
                                          ) : (
                                            <span className="text-slate-600 text-[10px]">—</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-1">
                                            <button
                                              onClick={() => handleStartFollowUp(c.id, r.email)}
                                              disabled={_actionLoading === r.email}
                                              className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-400 transition-all disabled:opacity-30"
                                              title="Start follow-ups"
                                            >
                                              {_actionLoading === r.email ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                              onClick={() => handleStopFollowUp(c.id, r.email)}
                                              disabled={_actionLoading === r.email}
                                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10 hover:text-rose-400 transition-all disabled:opacity-30"
                                              title="Stop follow-ups"
                                            >
                                              <Square className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-20">
              <div className="p-10 bg-[#111113] border border-slate-800/40 rounded-[40px] max-w-lg mx-auto shadow-2xl">
                 <div className="w-20 h-20 bg-indigo-600/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/20">
                    <BarChart3 className="w-10 h-10 text-indigo-400" />
                 </div>
                 <h2 className="text-2xl font-bold text-white mb-2 text-white">Campaign Intelligence</h2>
                 <p className="text-slate-500 text-sm leading-relaxed mb-8">
                    Open tracking is active!
                 </p>
              </div>
            </div>
          )}

          {activeTab === 'prospect' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-white">Prospect Search</h1>
                  <p className="text-slate-500 text-sm mt-1">Find leads on Apollo.io by company, title, or industry.</p>
                </div>
                {searchResults.length > 0 && (
                  <button
                    onClick={() => {
                      alert('Organization data found! To get individual leads:\n\n1. Go to Campaign tab\n2. Search for people on Apollo directly, or\n3. Use "Enrich Leads" with emails you already have\n\nFor full people search by title/industry, upgrade your Apollo plan.');
                    }}
                    className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-500 transition-all text-sm"
                  >
                    <Users className="w-4 h-4" />
                    How to Get Individual Leads
                  </button>
                )}
              </div>

              {/* Search Form */}
              <div className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm mb-8">
                <div className="mb-4">
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
                    ⚡ Free Apollo plan: search by company domain to enrich organization data.
                    Full people search (by title/industry) requires a paid plan.
                    Use <strong>Enrich Leads</strong> on the Campaign tab to look up individual emails.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1.5">Company Domain</label>
                    <input
                      value={searchCompany}
                      onChange={e => setSearchCompany(e.target.value)}
                      placeholder="e.g. google.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-indigo-500/50"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={async () => {
                        setSearchLoading(true);
                        setSearchResults([]);
                        setSelectedProspects(new Set());
                        try {
                          const res = await axios.post(`${API_BASE_URL}/api/apollo/search`, {
                            company: searchCompany || undefined
                          });
                          setSearchResults(res.data.people || []);
                          setSearchTotal(res.data.total || 0);
                          if (res.data.note) {
                            alert(res.data.note);
                          }
                        } catch (err: any) {
                          alert(err.response?.data?.error || 'Search failed');
                        } finally {
                          setSearchLoading(false);
                        }
                      }}
                      disabled={searchLoading || !searchCompany}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                      Search
                    </button>
                  </div>
                </div>
              </div>

              {/* Results */}
              {searchResults.length > 0 && (
                <div className="bg-[#111113] rounded-2xl border border-slate-800/40 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800/50 bg-slate-900/30 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      {searchTotal} Prospects Found
                    </span>
                    <button
                      onClick={() => {
                        const allSelected = searchResults.every((_, i) => selectedProspects.has(i));
                        if (allSelected) {
                          setSelectedProspects(new Set());
                        } else {
                          setSelectedProspects(new Set(searchResults.map((_, i) => i)));
                        }
                      }}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest"
                    >
                      {searchResults.every((_, i) => selectedProspects.has(i)) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800/30 text-xs text-slate-500 uppercase tracking-wider">
                          <th className="p-3 text-left w-10">
                            <input
                              type="checkbox"
                              checked={searchResults.length > 0 && searchResults.every((_, i) => selectedProspects.has(i))}
                              onChange={() => {
                                const allSelected = searchResults.every((_, i) => selectedProspects.has(i));
                                if (allSelected) setSelectedProspects(new Set());
                                else setSelectedProspects(new Set(searchResults.map((_, i) => i)));
                              }}
                              className="accent-indigo-500"
                            />
                          </th>
                          <th className="p-3 text-left font-semibold">Company</th>
                          <th className="p-3 text-left font-semibold">Domain</th>
                          <th className="p-3 text-left font-semibold">Industry</th>
                          <th className="p-3 text-left font-semibold">Size</th>
                          <th className="p-3 text-left font-semibold">Location</th>
                          <th className="p-3 text-left font-semibold">LinkedIn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/20">
                        {searchResults.map((org, i) => (
                          <tr
                            key={i}
                            className={`hover:bg-white/[0.02] transition-all ${selectedProspects.has(i) ? 'bg-indigo-600/5' : ''}`}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedProspects.has(i)}
                                onChange={() => {
                                  const next = new Set(selectedProspects);
                                  if (next.has(i)) next.delete(i);
                                  else next.add(i);
                                  setSelectedProspects(next);
                                }}
                                className="accent-indigo-500"
                              />
                            </td>
                            <td className="p-3 font-medium text-slate-200">{org.business || '—'}</td>
                            <td className="p-3 text-slate-400">{org.company_domain || '—'}</td>
                            <td className="p-3 text-slate-400">{org.company_industry || '—'}</td>
                            <td className="p-3 text-slate-400">{org.company_size || '—'}</td>
                            <td className="p-3 text-slate-400">{[org.city, org.state].filter(Boolean).join(', ') || '—'}</td>
                            <td className="p-3">
                              {org.linkedin ? (
                                <a
                                  href={org.linkedin}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-400 hover:text-indigo-300 text-xs font-medium"
                                >
                                  Profile
                                </a>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {searchTotal > 0 && (
                    <div className="px-4 py-3 border-t border-slate-800/50 text-center">
                      <span className="text-xs text-slate-500">
                        1 organization found · Full people search requires a paid Apollo plan
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!searchLoading && searchResults.length === 0 && (
                <div className="bg-[#111113] border border-slate-800/40 rounded-2xl p-12 text-center">
                  <Users className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No results yet.</p>
                  <p className="text-slate-600 text-xs mt-1">Enter search criteria above and click Search to find prospects.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-slate-500">Configure your system API keys and integrations.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Brevo Settings Card */}
                <div className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">Brevo SMTP Settings</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${settingsStatus.BREVO_API_KEY ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {settingsStatus.BREVO_API_KEY ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Used to send cold emails and campaign sequences safely using Gmail aliases or domain verification.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="password"
                      placeholder="Paste Brevo API Key"
                      value={tempBrevoKey}
                      onChange={e => setTempBrevoKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
                    />
                    <button
                      onClick={() => handleSaveSetting('BREVO_API_KEY', tempBrevoKey)}
                      disabled={savingBrevo}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                      {savingBrevo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                      Save Brevo Key
                    </button>
                  </div>
                </div>

                {/* Apollo.io Settings Card */}
                <div className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">Apollo.io API</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${settingsStatus.APOLLO_API_KEY ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {settingsStatus.APOLLO_API_KEY ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Used to enrich leads with company data (industry, size, location, LinkedIn) and search for new prospects.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="password"
                      placeholder="Paste Apollo.io API Key"
                      value={tempApolloKey}
                      onChange={e => setTempApolloKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
                    />
                    <button
                      onClick={() => handleSaveSetting('APOLLO_API_KEY', tempApolloKey)}
                      disabled={savingApollo}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                      {savingApollo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                      Save Apollo Key
                    </button>
                  </div>
                </div>

                {/* Gemini Settings Card */}
                <div className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">Gemini AI Settings</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${settingsStatus.GEMINI_API_KEY ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {settingsStatus.GEMINI_API_KEY ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Used to intelligently map CSV headers and write high-converting cold email copy.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="password"
                      placeholder="Paste Gemini API Key"
                      value={tempGeminiKey}
                      onChange={e => setTempGeminiKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
                    />
                    <button
                      onClick={() => handleSaveSetting('GEMINI_API_KEY', tempGeminiKey)}
                      disabled={savingGemini}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                      {savingGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Save Gemini Key
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* CSV Mapper Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111113] border border-slate-800 rounded-3xl w-full max-w-lg p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800/60 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-indigo-400" />
                  Map CSV Columns
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {mappingLoading ? (
                    <span className="flex items-center gap-1.5 text-indigo-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> Gemini is analyzing your columns...
                    </span>
                  ) : (
                    "Gemini has mapped the column fields. Verify them below."
                  )}
                </p>
              </div>
              <button onClick={() => setShowCsvModal(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Email Mapping */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 block">Email Address (Required)</label>
                <select 
                  value={mappedEmailCol} 
                  onChange={e => setMappedEmailCol(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-indigo-500/50"
                >
                  <option value="">-- Select Column --</option>
                  {csvHeaders.map((header, i) => (
                    <option key={i} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              {/* Name Mapping */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 block">Recipient Name</label>
                <select 
                  value={mappedNameCol} 
                  onChange={e => setMappedNameCol(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-indigo-500/50"
                >
                  <option value="">-- Select Column (or default to Unknown) --</option>
                  {csvHeaders.map((header, i) => (
                    <option key={i} value={header}>{header}</option>
                  ))}
                </select>
              </div>

              {/* Business Mapping */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 block">Business/Company Name</label>
                <select 
                  value={mappedBusinessCol} 
                  onChange={e => setMappedBusinessCol(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-indigo-500/50"
                >
                  <option value="">-- Select Column (or default to N/A) --</option>
                  {csvHeaders.map((header, i) => (
                    <option key={i} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live Preview */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900/60 space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Preview mapping (first 3 rows)</span>
              <div className="divide-y divide-slate-900 text-xs">
                {csvRows.slice(0, 3).map((row, i) => {
                  const emailVal = row[csvHeaders.indexOf(mappedEmailCol)] || 'N/A';
                  const nameVal = row[csvHeaders.indexOf(mappedNameCol)] || 'Unknown';
                  const businessVal = row[csvHeaders.indexOf(mappedBusinessCol)] || 'N/A';
                  return (
                    <div key={i} className="py-1.5 flex justify-between text-slate-400 gap-4">
                      <span className="truncate max-w-[150px] font-medium text-slate-300">{emailVal}</span>
                      <span className="truncate max-w-[100px]">{nameVal}</span>
                      <span className="truncate max-w-[120px] text-indigo-400">{businessVal}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setShowCsvModal(false)}
                className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 py-3 rounded-xl font-bold text-xs transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmCsvMapping}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold text-xs text-white shadow-lg shadow-indigo-500/20 transition-all"
              >
                Confirm & Load Recipients
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Writer Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111113] border border-slate-800 rounded-3xl w-full max-w-2xl p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-800/60 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
                  AI Email Writer
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Describe your campaign goal and let Gemini generate cold outreach templates with dynamic placeholders.
                </p>
              </div>
              <button onClick={() => setShowAiModal(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Form Details */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 block">What is the focus/pitch of this email?</label>
                  <textarea 
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="e.g. Pitching cold web design services. Mention that we offer a free design audit and want to schedule a 10-minute call next week."
                    className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-300 outline-none focus:border-indigo-500/50 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 block">Email Tone</label>
                    <select 
                      value={aiTone}
                      onChange={e => setAiTone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500/50"
                    >
                      <option value="Professional">Professional</option>
                      <option value="Friendly">Friendly</option>
                      <option value="Casual">Casual</option>
                      <option value="Direct">Direct</option>
                      <option value="Persuasive">Persuasive</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 block">Length</label>
                    <select 
                      value={aiLength}
                      onChange={e => setAiLength(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500/50"
                    >
                      <option value="Short">Short (1-2 sentences)</option>
                      <option value="Medium">Medium (1-2 paragraphs)</option>
                      <option value="Long">Long (Detailed pitch)</option>
                    </select>
                  </div>
                </div>

                <button 
                  onClick={handleAiGenerateEmail}
                  disabled={aiGenerating}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  {aiGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Writing email template...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" /> Generate Template
                    </>
                  )}
                </button>
              </div>

              {/* Right Column: AI Output Preview */}
              <div className="flex flex-col h-[280px] bg-slate-950 rounded-2xl border border-slate-900 p-4">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Live Generated Preview</span>
                
                {aiResultSubject || aiResultBody ? (
                  <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                    <div className="border-b border-slate-900 pb-2">
                      <span className="text-[10px] font-bold text-indigo-400 block">SUBJECT:</span>
                      <p className="text-sm font-bold text-white">{aiResultSubject}</p>
                    </div>
                    <div className="text-xs text-slate-400 space-y-2">
                      <span className="text-[10px] font-bold text-indigo-400 block">BODY:</span>
                      <div 
                        className="prose prose-invert max-w-none prose-xs"
                        dangerouslySetInnerHTML={{ __html: aiResultBody }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-600">
                    <Sparkles className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs italic">Generated email subject & body will preview here.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-800/60 pt-4">
              <button 
                onClick={() => setShowAiModal(false)}
                className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 py-3 rounded-xl font-bold text-xs transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (!aiResultSubject || !aiResultBody) return alert('Please generate an email first.');
                  setSubject(aiResultSubject);
                  setBody(aiResultBody);
                  setShowAiModal(false);
                }}
                disabled={!aiResultSubject || !aiResultBody}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-3 rounded-xl font-bold text-xs text-white shadow-lg shadow-indigo-500/20 transition-all"
              >
                Apply to Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem(SESSION_KEY) === 'true';
  });

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard onLogout={() => { localStorage.removeItem(SESSION_KEY); setIsLoggedIn(false); }} />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
      </Routes>
    </Router>
  );
};

export default App;

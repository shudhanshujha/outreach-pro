import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Send, Users, Mail, Settings, RefreshCcw, Terminal, 
  FileText, Sparkles, Loader2, BarChart3, 
  Inbox, ListTree, Clock, KeyRound, CheckCircle2, Trash2, Square, Plus, X,
  Upload, Download
} from 'lucide-react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfService from './TermsOfService';

// --- TYPES ---
interface Account { email: string; }
interface LogEntry { text: string; type?: 'success' | 'error' | 'info'; timestamp: string; }
interface EmailReply { subject: string; from: string; date: string; uid: number; }
interface FollowUp { delayDays: number; subject: string; body: string; }

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const CACHE_KEY = 'outreach_accounts_cache';

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

const Dashboard: React.FC = () => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'campaign' | 'analytics' | 'inbox' | 'settings'>('campaign');
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
  const [replies, setReplies] = useState<EmailReply[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newAppPassword, setNewAppPassword] = useState('');

  // Settings API states
  const [settingsStatus, setSettingsStatus] = useState<{ BREVO_API_KEY: boolean; GEMINI_API_KEY: boolean }>({
    BREVO_API_KEY: false,
    GEMINI_API_KEY: false
  });
  const [tempBrevoKey, setTempBrevoKey] = useState('');
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [savingBrevo, setSavingBrevo] = useState(false);
  const [savingGemini, setSavingGemini] = useState(false);

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

  const handleSaveSetting = async (key: 'BREVO_API_KEY' | 'GEMINI_API_KEY', value: string) => {
    if (!value) return alert('Please enter a key value');
    if (key === 'BREVO_API_KEY') setSavingBrevo(true);
    else setSavingGemini(true);
    
    try {
      await axios.post(`${API_BASE_URL}/api/settings`, { key, value });
      alert('Key saved successfully!');
      if (key === 'BREVO_API_KEY') setTempBrevoKey('');
      else setTempGeminiKey('');
      fetchSettingsStatus();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save key');
    } finally {
      if (key === 'BREVO_API_KEY') setSavingBrevo(false);
      else setSavingGemini(false);
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
        followUps
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

  const fetchInbox = async () => {
    if (connectedAccounts.length === 0) return alert('Connect an account first');
    setLoadingInbox(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/inbox`, { account: { user: connectedAccounts[0].email } });
      setReplies(res.data.messages);
    } catch (err) { alert('Failed to fetch inbox'); }
    finally { setLoadingInbox(false); }
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
          <button onClick={() => setActiveTab('inbox')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'inbox' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-slate-800/50 text-slate-500'}`}>
            <Inbox className="w-5 h-5" />
            <span className="hidden md:block font-medium">Unified Inbox</span>
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
        <div className="p-4 border-t border-slate-800/50 space-y-4">
           <div className="space-y-1">
             <Link to="/privacy" className="block text-[10px] text-slate-600 hover:text-slate-400 uppercase font-bold tracking-widest">Privacy Policy</Link>
             <Link to="/terms" className="block text-[10px] text-slate-600 hover:text-slate-400 uppercase font-bold tracking-widest">Terms of Service</Link>
           </div>
           <div className="flex items-center gap-3 px-3 py-2 bg-slate-900/50 rounded-xl">
              <div className={`w-2 h-2 rounded-full ${status === 'running' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{status}</span>
           </div>
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
                    <p className="text-indigo-100/70 text-sm mb-8">Click to begin outreach to {recipientText.split('\n').length} leads.</p>
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
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2 text-white">Unified Inbox</h1>
                  <p className="text-slate-500">Replies from your connected accounts.</p>
                </div>
                <button onClick={fetchInbox} disabled={loadingInbox} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-500 transition-all disabled:opacity-50">
                  {loadingInbox ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  Check for Replies
                </button>
              </header>
              <div className="bg-[#111113] rounded-3xl border border-slate-800/40 overflow-hidden shadow-xl">
                {replies.length === 0 ? (
                  <div className="p-20 text-center flex flex-col items-center gap-4">
                    <Inbox className="w-12 h-12 text-slate-800" />
                    <p className="text-slate-600 font-medium">No replies found.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/50">
                    {replies.map((reply, i) => (
                      <div key={i} className="p-6 flex items-center gap-6 hover:bg-white/[0.02] cursor-pointer group">
                         <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-all">
                            <Mail className="w-5 h-5 text-indigo-400" />
                         </div>
                         <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                               <h3 className="font-bold text-white">{reply.from}</h3>
                               <span className="text-[10px] text-slate-600 uppercase font-bold">{new Date(reply.date).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm text-slate-400">{reply.subject}</p>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                      {settingsStatus.BREVO_API_KEY ? 'Configured' : 'Not Set'}
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

                {/* Gemini Settings Card */}
                <div className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">Gemini AI Settings</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${settingsStatus.GEMINI_API_KEY ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {settingsStatus.GEMINI_API_KEY ? 'Configured' : 'Not Set'}
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
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
      </Routes>
    </Router>
  );
};

export default App;

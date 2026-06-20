import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Send, Users, Mail, Settings, RefreshCcw, Terminal, 
  FileText, Sparkles, Loader2, BarChart3, 
  Inbox, ListTree, Clock, KeyRound, CheckCircle2, Trash2, Square, Plus, X
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

const Dashboard: React.FC = () => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'campaign' | 'analytics' | 'inbox'>('campaign');
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

  const logEndRef = useRef<HTMLDivElement>(null);

  // --- EFFECTS ---
  useEffect(() => {
    fetchConnectedAccounts();
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
                    <button onClick={handleEnrich} disabled={isEnriching} className="text-xs flex items-center gap-2 font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/20 transition-all">
                      {isEnriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Enrich Leads
                    </button>
                  </div>
                  <textarea value={recipientText} onChange={e => setRecipientText(e.target.value)} className="w-full h-40 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm font-mono text-slate-400 focus:border-indigo-500/50 outline-none resize-none" />
                </section>

                <section className="bg-[#111113] p-6 rounded-2xl border border-slate-800/40 shadow-sm">
                  <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Initial Email
                  </h2>
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
        </div>
      </main>
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

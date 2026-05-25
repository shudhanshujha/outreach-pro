import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Send, Users, Mail, Settings, Play, RefreshCcw, Terminal, KeyRound, Clock, FileText } from 'lucide-react';

interface Account {
  user: string;
  pass: string;
}

interface Recipient {
  email: string;
  name: string;
  business: string;
  [key: string]: string;
}

interface LogEntry {
  text: string;
  type?: 'success' | 'error' | 'info';
  timestamp: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const App: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([
    { user: '', pass: '' },
    { user: '', pass: '' },
    { user: '', pass: '' },
    { user: '', pass: '' },
    { user: '', pass: '' },
  ]);
  const [recipientText, setRecipientText] = useState('jhash0099@gmail.com,John Doe,Example Corp\njhash0099@gmail.com,Jane Smith,Test LLC');
  const [subject, setSubject] = useState('Hello {{name}} from {{business}}');
  const [body, setBody] = useState('<p>Hi {{name}},</p>\n<p>I noticed your business, {{business}}, and wanted to reach out regarding a potential collaboration.</p>\n<p>Best regards,<br>Your Name</p>');
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(90);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');
  
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: number;
    if (status === 'running') {
      interval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_BASE_URL}/api/logs`);
          setLogs(res.data.logs);
          setStatus(res.data.status);
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleStart = async () => {
    const validAccounts = accounts.filter(a => a.user && a.pass);
    if (validAccounts.length === 0) return alert('Please add at least one Gmail account');

    const lines = recipientText.split('\n').filter(l => l.trim());
    const recipients: Recipient[] = lines.map(line => {
      const [email, name, business] = line.split(',').map(s => s.trim());
      return { email, name, business };
    });

    try {
      await axios.post(`${API_BASE_URL}/api/send`, {
        accounts: validAccounts,
        recipients,
        subject,
        body,
        delayMin,
        delayMax
      });
      setStatus('running');
    } catch (err) {
      alert('Failed to start outreach');
    }
  };

  const handleReset = async () => {
    await axios.post(`${API_BASE_URL}/api/reset`);
    setLogs([]);
    setStatus('idle');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Background ambient glow */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/10 blur-[120px]" />
      </div>

      <div className="relative z-10 p-6 md:p-10 w-full max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-10 pb-6 border-b border-slate-800/60">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Send className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Outreach<span className="text-indigo-400">Pro</span></h1>
              <p className="text-slate-400 text-sm mt-1 font-medium">Mass Email Automation Engine</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-3">
             <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700/50">
                <span className="relative flex h-3 w-3">
                  {status === 'running' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${status === 'running' ? 'bg-indigo-500' : status === 'completed' ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                </span>
                <span className="text-sm font-medium capitalize tracking-wide text-slate-300">
                  {status}
                </span>
             </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Configuration (Takes up 7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Accounts Panel */}
            <section className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-800/60 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-800 rounded-lg"><Settings className="w-5 h-5 text-indigo-400" /></div>
                <div>
                  <h2 className="text-lg font-semibold text-white">SMTP Rotation Accounts</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Use 16-character App Passwords, not your standard password.</p>
                </div>
              </div>
              <div className="space-y-3">
                {accounts.map((acc, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        placeholder={`Account ${idx + 1} Email`}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-600 transition-all outline-none"
                        value={acc.user}
                        onChange={(e) => {
                          const newAccs = [...accounts];
                          newAccs[idx].user = e.target.value;
                          setAccounts(newAccs);
                        }}
                      />
                    </div>
                    <div className="relative flex-1">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        placeholder="App Password"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-600 transition-all outline-none"
                        value={acc.pass}
                        onChange={(e) => {
                          const newAccs = [...accounts];
                          newAccs[idx].pass = e.target.value;
                          setAccounts(newAccs);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recipients Panel */}
            <section className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-800/60 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-800 rounded-lg"><Users className="w-5 h-5 text-blue-400" /></div>
                  <h2 className="text-lg font-semibold text-white">Target Recipients</h2>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2.5 py-1 rounded-md">CSV Format</span>
              </div>
              <p className="text-xs text-slate-400 mb-3 ml-1">Format: <span className="text-indigo-300 font-mono">email, name, business</span></p>
              <textarea
                className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-4 h-40 text-sm text-slate-300 placeholder-slate-600 font-mono leading-relaxed transition-all outline-none resize-y"
                value={recipientText}
                onChange={(e) => setRecipientText(e.target.value)}
              />
            </section>

            {/* Template Panel */}
            <section className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-2xl border border-slate-800/60 shadow-xl">
               <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-800 rounded-lg"><FileText className="w-5 h-5 text-purple-400" /></div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Email Template</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Use <span className="text-purple-300 font-mono">{"{{name}}"}</span> and <span className="text-purple-300 font-mono">{"{{business}}"}</span> for personalization.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold tracking-wide text-slate-400 uppercase ml-1 block mb-2">Subject Line</label>
                  <input
                    placeholder="Enter subject..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-3 text-sm text-slate-200 transition-all outline-none"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
                <div>
                   <label className="text-xs font-semibold tracking-wide text-slate-400 uppercase ml-1 block mb-2">HTML Body</label>
                  <textarea
                    placeholder="<p>Hello world</p>"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl p-4 h-56 text-sm text-slate-300 font-mono leading-relaxed transition-all outline-none resize-y"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Controls & Logs (Takes up 5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            <div className="sticky top-8 space-y-6">
              
              {/* Controls Panel */}
              <section className="bg-slate-900/60 backdrop-blur-xl p-6 rounded-2xl border border-slate-800/60 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                   <h2 className="text-lg font-semibold text-white">Launch Control</h2>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8 bg-slate-950/50 p-4 rounded-xl border border-slate-800/40">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
                      <Clock className="w-3.5 h-3.5" /> Min Delay (s)
                    </label>
                    <input type="number" className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white outline-none" value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
                      <Clock className="w-3.5 h-3.5" /> Max Delay (s)
                    </label>
                    <input type="number" className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white outline-none" value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    disabled={status === 'running'}
                    onClick={handleStart}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-900/20 disabled:opacity-50 disabled:grayscale transition-all py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 group"
                  >
                    <Play className="w-5 h-5 group-hover:scale-110 transition-transform" /> 
                    {status === 'running' ? 'Sending...' : 'Initiate Outreach'}
                  </button>
                  <button
                    onClick={handleReset}
                    title="Reset Status & Clear Logs"
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors px-5 rounded-xl flex items-center justify-center"
                  >
                    <RefreshCcw className="w-5 h-5" />
                  </button>
                </div>
              </section>

              {/* Terminal / Logs Panel */}
              <section className="bg-black/80 backdrop-blur-md rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden flex flex-col h-[500px]">
                {/* Terminal Header */}
                <div className="bg-slate-900/80 px-4 py-3 border-b border-slate-800 flex items-center gap-4">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-mono font-medium mx-auto -ml-8">
                    <Terminal className="w-3.5 h-3.5" /> process_logs.sh
                  </div>
                </div>
                
                {/* Terminal Body */}
                <div className="flex-1 p-5 overflow-y-auto font-mono text-[13px] leading-relaxed space-y-2.5 custom-scrollbar">
                  {logs.length === 0 && (
                    <div className="text-slate-600 flex flex-col items-center justify-center h-full gap-3 opacity-50">
                      <Terminal className="w-10 h-10" />
                      <p>System idle. Waiting for execution command.</p>
                    </div>
                  )}
                  {logs.map((log, i) => (
                    <div key={i} className="flex items-start gap-3 hover:bg-white/[0.02] p-1 -mx-1 rounded transition-colors break-words">
                      <span className="text-slate-600 shrink-0 select-none">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                      </span>
                      <span className={`flex-1 ${
                        log.type === 'success' ? 'text-emerald-400' : 
                        log.type === 'error' ? 'text-rose-400' : 
                        log.type === 'info' ? 'text-sky-400' : 'text-slate-300'
                      }`}>
                        {log.text}
                      </span>
                    </div>
                  ))}
                  <div ref={logEndRef} className="h-1" />
                </div>
              </section>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;

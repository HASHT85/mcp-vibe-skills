import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { checkAuth, setAuth, listPipelines, killPipeline, deletePipeline, connectAllSSE, modifyPipeline, retryPipeline } from './api/client';
import type { Pipeline, PipelineEvent, PipelineAgent } from './api/client';
import './index.css';

import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { AgentsView } from './components/AgentsView';
import { TokensView } from './components/TokensView';
import { DeployView } from './components/DeployView';
import { ContainersView } from './components/ContainersView';
import { ChatView } from './components/ChatView';
import { LiveActivityPanel } from './components/LiveActivityPanel';
import { formatTime, formatTokenCount } from './utils';

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Claude 4.6 Sonnet' },
  { value: 'claude-opus-4-6', label: 'Claude 4.6 Opus' },
  { value: 'claude-haiku-4-5', label: 'Claude 4.5 Haiku' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'o1', label: 'o1 (OpenAI)' },
  { value: 'o3-mini', label: 'o3-mini (OpenAI)' },
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
  { value: 'gemini-3.0-pro', label: 'Gemini 3.0 Pro' }
];

// ─── App ───

export default function App() {
  const [authed, setAuthed] = useState(checkAuth());

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;
  return <Dashboard />;
}

// ─── Login ───

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Set credentials first, then test them against the API
      setAuth(user, pass);
      await listPipelines(); // This will throw 'Unauthorized' if credentials are wrong
      onLogin();
    } catch (err: any) {
      // Clear bad credentials
      localStorage.removeItem('veist_auth');
      setError('SECURITY BREACH DETECTED: ACCESS DENIED');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-mono overflow-x-hidden relative min-h-screen bg-v-bg text-white selection:bg-v-accent selection:text-black">
      {/* Scanline Overlay */}
      <div className="scanline"></div>

      {/* Global Header */}
      <header className="fixed top-0 w-full z-50 bg-v-bg border-b-3 border-white px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-v-accent"></div>
          <span className="font-sans text-xl font-bold tracking-tighter">VEIST_SYS</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm font-bold">
          <span className="text-v-accent">[ STATUS_OK ]</span>
          <span className="text-v-accent">[ AUTH_REQ ]</span>
        </div>
        <div className="text-v-alert text-xs hidden sm:block">
          COORDINATES: 40.7128° N, 74.0060° W
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative min-h-screen pt-24 grid-bg flex flex-col justify-center px-6 md:px-12">
        {/* Background Crosshairs */}
        <div className="absolute top-40 left-10 text-white/20 select-none hidden md:block">┌ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ┐<br /><br />└ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ┘</div>
        <div className="absolute bottom-40 right-10 text-white/20 select-none hidden md:block">┌ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ┐<br /><br />└ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ┘</div>
        
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="inline-block bg-v-alert text-v-bg font-bold px-2 py-1 mb-6 text-sm">
            INITIATING_SEQUENCE: LOGIN_PR_03
          </div>
          <h1 className="font-sans text-7xl md:text-[8rem] lg:text-[12rem] leading-none font-bold tracking-tighter mb-8 break-all">
            VEIST<span className="text-v-accent">_V3</span>
          </h1>
          
          <div className="grid md:grid-cols-2 gap-12 items-end">
            <div className="space-y-6">
              <p className="text-xl md:text-2xl leading-tight max-w-xl">
                CRITICAL FOCUS ENGAGED. INDUSTRIAL-GRADE CREATIVE ENGINE FOR THE NEW MARATHON. NO BLOAT. NO FRICTION. JUST THE CORE.
              </p>
              
              {/* Login Form */}
              <form onSubmit={submit} className="flex flex-col gap-4 pt-6 max-w-md">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-v-alert/20 border-l-4 border-v-alert p-3 text-v-alert font-mono text-xs uppercase tracking-widest font-bold"
                  >
                    ! {error}
                  </motion.div>
                )}
                
                <input
                  className="bg-v-bg border-3 border-white text-v-accent p-4 font-mono outline-none focus:border-v-accent focus:shadow-brutalist transition-all placeholder:text-white/30 uppercase"
                  placeholder="IDENTIFICATION"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                />
                
                <input
                  className="bg-v-bg border-3 border-white text-v-accent p-4 font-mono outline-none focus:border-v-accent focus:shadow-brutalist transition-all placeholder:text-white/30"
                  type="password"
                  placeholder="PASSCODE"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                />
                
                <div className="flex flex-col sm:flex-row gap-4 mt-2">
                  <button type="submit" disabled={loading} className="bg-v-accent text-v-bg hover:bg-white font-sans text-xl md:text-2xl font-bold px-10 py-5 transition-all flex items-center justify-between group disabled:opacity-50">
                    {loading ? 'AUTHENTICATING...' : 'INITIALIZE_NOW'}
                    <span className="ml-4 group-hover:translate-x-2 transition-transform">→</span>
                  </button>
                </div>
              </form>
            </div>
            
            {/* System Logs UI decor */}
            <div className="border-3 border-white p-6 bg-v-bg/50 backdrop-blur-sm hidden md:block">
              <div className="flex justify-between items-center mb-4 border-b border-white/20 pb-2">
                <span className="text-xs text-white/50">SYSTEM_LOGS</span>
                <span className="w-2 h-2 bg-v-accent animate-pulse"></span>
              </div>
              <div className="space-y-2 text-xs font-mono uppercase">
                <div className="text-v-accent">&gt; BOOTING CORE MODULES... [DONE]</div>
                <div>&gt; CALIBRATING GRID MARKERS... [DONE]</div>
                <div>&gt; ESTABLISHING SECURE PROTOCOLS... [DONE]</div>
                <div className="text-v-alert">&gt; WARNING: UNAUTHORIZED ACCESS DETECTED</div>
                <div className="animate-pulse">&gt; WAITING FOR CREDENTIALS_</div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Dashboard ───

function Dashboard() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<PipelineEvent[]>([]);
  const [activeNav, setActiveNav] = useState('projects');

  // Load pipelines
  const load = useCallback(async () => {
    try {
      const data = await listPipelines();
      setPipelines(data.pipelines || []);
    } catch (err) {
      console.warn('Failed to load pipelines:', err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll every 5s
  useEffect(() => {
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  // SSE live events
  useEffect(() => {
    const close = connectAllSSE((event) => {
      setLiveEvents(prev => [event, ...prev].slice(0, 100));
      load(); // Refresh pipeline list on event
    });
    return close;
  }, [load]);

  const selected = pipelines.find(p => p.id === selectedId);

  // Render main content based on active nav
  const renderMainContent = () => {
    // If a project is selected, always show detail
    if (selected) {
      return (
        <ProjectDetail
          key={selected.id}
          pipeline={selected}
          onBack={() => setSelectedId(null)}
          onRefresh={load}
        />
      );
    }

    switch (activeNav) {
      case 'projects':
        return (
          <ProjectList
            key="list"
            pipelines={pipelines}
            onSelect={(id) => setSelectedId(id)}
            onRetry={async (id) => { try { await retryPipeline(id); load(); } catch (err: any) { alert(`RETRY_FAILED: ${err.message}`); } }}
          />
        );
      case 'containers':
        return <ContainersView key="containers" pipelines={pipelines} />;
      case 'chat':
        return <ChatView key="chat" pipelines={pipelines} onPipelineLaunched={() => { setActiveNav('projects'); load(); }} onRefresh={load} />;
      case 'agents':
        return <AgentsView key="agents" pipelines={pipelines} />;
      case 'tokens':
        return <TokensView key="tokens" pipelines={pipelines} />;
      case 'deploy':
        return <DeployView key="deploy" pipelines={pipelines} />;
      default:
        return null;
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden scanline bg-v-bg font-mono">
      
      {/* ─── Header / Top Bar ─── */}
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar Navigation ─── */}
        <Sidebar active={activeNav} onChange={(id) => { setActiveNav(id); setSelectedId(null); }} />

        {/* ─── Main Content Area ─── */}
        <main className="flex-1 overflow-y-auto bg-v-bg p-4 md:p-8">
          <AnimatePresence mode="wait">
            {renderMainContent()}
          </AnimatePresence>
        </main>

        {/* ─── Right Sidebar: Live Activity ─── */}
        <LiveActivityPanel events={liveEvents} />
      </div>

      {/* ─── System Footer ─── */}
      <footer className="mt-auto border-t-2 border-white/20 pt-2 pb-2 px-6 flex flex-col md:flex-row justify-between text-[10px] text-white/40 bg-v-bg z-10 font-mono tracking-widest uppercase">
        <div className="flex gap-4 mb-2 md:mb-0">
          <span>LOC: SECTOR_A-14</span>
          <span>HOST: HOST_A09</span>
          <span className="text-v-accent">SECURE_LINK: ESTABLISHED</span>
        </div>
        <div>
          VEIST INDUSTRIAL OS v5.0.0-STABLE // MARATHON_MODE_ON
        </div>
      </footer>

    </div>
  );
}


import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { checkAuth, setAuth, listPipelines, launchIdea, killPipeline, deletePipeline, connectAllSSE, modifyPipeline } from './api/client';
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
import { LaunchModal } from './components/LaunchModal';
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
      localStorage.removeItem('vibe_auth');
      setError('SECURITY BREACH DETECTED: ACCESS DENIED');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background-dark scanline relative overflow-hidden">
      
      {/* Background Decorators */}
      <div className="absolute top-10 left-10 text-accent opacity-20 font-mono tracking-widest text-xs pointer-events-none">
        U.E.S.C. MARATHON // SYSTEM TERMINAL v4.2<br/>
        INITIALIZING CONNECTION...
      </div>
      <div className="absolute bottom-10 right-10 text-primary opacity-20 font-mono tracking-widest text-xs text-right pointer-events-none">
        SECURE PROTOCOL ACTIVE<br/>
        UNAUTHORIZED ACCESS WILL BE LOGGED
      </div>

      <motion.form
        className="w-full max-w-md p-8 bg-panel border-2 border-border-muted relative z-10"
        onSubmit={submit}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Frame corner blocks for industrial look */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-accent"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-accent"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-accent"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-accent"></div>

        <h1 className="text-4xl font-display font-bold text-slate-100 tracking-[0.2em] mb-2 uppercase">VibeCraft<span className="text-primary">_HQ</span></h1>
        <p className="font-mono text-accent tracking-widest mb-8 text-sm opacity-80 uppercase">&gt; Universal AI Builder</p>
        
        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6 bg-primary/20 border-l-4 border-primary p-3 text-primary font-mono text-xs uppercase tracking-widest"
          >
            ! {error}
          </motion.div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-slate-500 font-mono text-[10px] uppercase tracking-widest mb-1">Identification</label>
            <input
              className="login-input"
              placeholder="ENTER_USERNAME"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          <div>
            <label className="block text-slate-500 font-mono text-[10px] uppercase tracking-widest mb-1">Passcode</label>
            <input
              className="login-input"
              type="password"
              placeholder="••••••••••••"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="btn-login" disabled={loading}>
          {loading ? 'AUTHENTICATING...' : 'INITIALIZE UPLINK'}
        </button>
      </motion.form>
    </div>
  );
}

// ─── Dashboard ───

function Dashboard() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
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
          />
        );
      case 'containers':
        return <ContainersView key="containers" pipelines={pipelines} />;
      case 'chat':
        return <ChatView key="chat" onPipelineLaunched={() => { setActiveNav('projects'); load(); }} />;
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
    <div className="relative flex h-screen w-full flex-col overflow-hidden scanline">
      
      {/* ─── Header / Top Bar ─── */}
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar Navigation ─── */}
        <Sidebar active={activeNav} onChange={(id) => { setActiveNav(id); setSelectedId(null); }} onLaunch={() => setShowModal(true)} />

        {/* ─── Main Content Area ─── */}
        <main className="flex-1 overflow-y-auto bg-background-dark p-6">
          <AnimatePresence mode="wait">
            {renderMainContent()}
          </AnimatePresence>
        </main>

        {/* ─── Right Sidebar: Live Activity ─── */}
        <LiveActivityPanel events={liveEvents} />
      </div>

      {/* ─── System Footer ─── */}
      <footer className="h-8 bg-panel border-t border-border-muted flex items-center justify-between px-4 text-[9px] font-bold text-slate-500 tracking-[0.2em] uppercase">
        <div>VIBECRAFT_HQ // HOST_A09 // USER_ROOT</div>
        <div className="flex gap-4">
          <span>COORD: 45.92 - 12.01</span>
          <span>STATUS: NOMINAL</span>
          <span className="text-accent">TERM_SECURED</span>
        </div>
      </footer>

      {/* ─── Launch Modal ─── */}
      <AnimatePresence>
        {showModal && (
          <LaunchModal
            onClose={() => setShowModal(false)}
            onLaunch={async (desc: string, name?: string, model?: string, files?: { base64: string; type: string }[]) => {
              await launchIdea(desc, name, model, files);
              setShowModal(false);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}


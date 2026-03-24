import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { checkAuth, setAuth, listPipelines, killPipeline, deletePipeline, connectAllSSE, modifyPipeline, retryPipeline } from './api/client';
import type { Pipeline, PipelineEvent, PipelineAgent } from './api/client';
import './index.css';

import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { TokensView } from './components/TokensView';
import { DeployView } from './components/DeployView';
import { ContainersView } from './components/ContainersView';
import { VpsMonitor } from './components/VpsMonitor';
import { QuickDeployView } from './components/QuickDeployView';
import { ChatView } from './components/ChatView';
import { LiveActivityPanel } from './components/LiveActivityPanel';
import { formatTime, formatTokenCount } from './utils';

const MODEL_OPTIONS = [
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
  { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
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
      setAuth(user, pass);
      await listPipelines();
      onLogin();
    } catch (err: any) {
      localStorage.removeItem('veist_auth');
      setError('ACCESS DENIED — INVALID CREDENTIALS');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-body min-h-screen flex flex-col relative overflow-hidden bg-[#0B0F14] text-[#D7FF2F]">
      {/* Background Decorative VEIST text */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none select-none">
        <span className="font-headline text-[30rem] font-bold tracking-tighter">VEIST</span>
      </div>

      {/* Status HUD Header */}
      <header className="fixed top-0 left-0 w-full p-6 flex justify-between items-start z-40">
        <div className="flex flex-col">
          <span className="font-label text-[10px] tracking-[0.3em] opacity-60">SYSTEM_STATUS</span>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#D7FF2F]"></span>
            <span className="font-label text-xs uppercase tracking-widest">VEIST_OS // SECURE_LINK_ESTABLISHED</span>
          </div>
        </div>
        <div className="hidden md:flex flex-col items-end">
          <span className="font-label text-[10px] tracking-[0.3em] opacity-60">COORDINATES</span>
          <span className="font-label text-xs">40.7128° N, 74.0060° W</span>
        </div>
      </header>

      {/* Main Login Form */}
      <main className="flex-grow flex items-center justify-center px-6 relative">
        <div className="w-full max-w-[420px] flex flex-col gap-16 relative z-10">
          {/* Branding */}
          <div className="flex flex-col items-center md:items-start">
            <h1 className="font-headline text-5xl md:text-7xl font-bold tracking-tighter uppercase leading-none text-[#D7FF2F]">
              SECURE_<br/>LOGIN
            </h1>
            <div className="mt-4 flex items-center gap-4">
              <span className="h-[1px] w-12 bg-[#D7FF2F]"></span>
              <span className="font-label text-xs tracking-widest opacity-60">RESTRICTED_ACCESS_PORTAL_V2.4</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#FF6A3D]/10 border border-[#FF6A3D]/30 p-4 text-[#FF6A3D] font-label text-xs uppercase tracking-widest"
            >
              {error}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={submit} className="flex flex-col gap-6">
            <div className="group relative">
              <label className="absolute -top-2.5 left-4 bg-[#0B0F14] px-2 font-label text-[10px] tracking-[0.2em] text-[#D7FF2F] z-10">OPERATOR_ID</label>
              <div className="flex items-center border border-[#D7FF2F]/30 group-focus-within:border-[#D7FF2F] bg-transparent transition-colors duration-200">
                <span className="material-symbols-outlined px-4 opacity-40 text-sm">person</span>
                <input
                  className="w-full bg-transparent border-none focus:ring-0 text-[#D7FF2F] font-label py-4 pr-4 uppercase tracking-widest placeholder:text-[#D7FF2F]/20"
                  placeholder="ENTER_UID"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="absolute -top-[1px] -left-[1px] w-1 h-1 bg-[#D7FF2F]"></div>
              <div className="absolute -bottom-[1px] -right-[1px] w-1 h-1 bg-[#D7FF2F]"></div>
            </div>

            <div className="group relative">
              <label className="absolute -top-2.5 left-4 bg-[#0B0F14] px-2 font-label text-[10px] tracking-[0.2em] text-[#D7FF2F] z-10">PASS_KEY</label>
              <div className="flex items-center border border-[#D7FF2F]/30 group-focus-within:border-[#D7FF2F] bg-transparent transition-colors duration-200">
                <span className="material-symbols-outlined px-4 opacity-40 text-sm">key</span>
                <input
                  className="w-full bg-transparent border-none focus:ring-0 text-[#D7FF2F] font-label py-4 pr-4 tracking-[0.5em] placeholder:tracking-widest placeholder:text-[#D7FF2F]/20"
                  type="password"
                  placeholder="••••••••"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                />
              </div>
              <div className="absolute -top-[1px] -left-[1px] w-1 h-1 bg-[#D7FF2F]"></div>
              <div className="absolute -bottom-[1px] -right-[1px] w-1 h-1 bg-[#D7FF2F]"></div>
            </div>

            <div className="mt-8">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#FF6A3D] text-[#0B0F14] font-headline font-bold py-5 flex items-center justify-between px-8 group hover:bg-white transition-all duration-300 relative overflow-hidden disabled:opacity-50"
              >
                <span className="text-xl tracking-tighter">
                  {loading ? 'AUTHENTICATING...' : 'INITIALIZE_SESSION'}
                </span>
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 w-full p-6 flex flex-col md:flex-row justify-between items-center gap-4 z-40 border-t border-[#D7FF2F]/5 bg-[#0B0F14]/80 backdrop-blur-sm">
        <div className="flex items-center gap-6 font-label text-[10px] tracking-widest opacity-40 uppercase">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[12px]">terminal</span>
            <span>TTY: /dev/pts/0</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[12px]">security</span>
            <span>ENCRYPTION: AES-256-GCM</span>
          </div>
        </div>
        <div className="flex items-center gap-8 font-label text-[10px] tracking-widest uppercase">
          <div className="flex items-center gap-2">
            <span className="opacity-40">LATENCY:</span>
            <span className="text-[#D7FF2F]">14ms</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-40">SESSION_TIME:</span>
            <span className="text-[#D7FF2F]">00:00:00</span>
          </div>
        </div>
      </footer>

      {/* Decorative Corner Elements */}
      <div className="fixed top-0 left-0 w-16 h-16 border-t border-l border-[#D7FF2F]/20 m-4 pointer-events-none"></div>
      <div className="fixed top-0 right-0 w-16 h-16 border-t border-r border-[#D7FF2F]/20 m-4 pointer-events-none"></div>
      <div className="fixed bottom-0 left-0 w-16 h-16 border-b border-l border-[#D7FF2F]/20 m-4 pointer-events-none"></div>
      <div className="fixed bottom-0 right-0 w-16 h-16 border-b border-r border-[#D7FF2F]/20 m-4 pointer-events-none"></div>
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
      load();
    });
    return close;
  }, [load]);

  const selected = pipelines.find(p => p.id === selectedId);

  const renderMainContent = () => {
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
      case 'tokens':
        return <TokensView key="tokens" pipelines={pipelines} />;
      case 'quick_deploy':
        return <QuickDeployView key="quick_deploy" />;
      case 'deploy':
        return <DeployView key="deploy" pipelines={pipelines} />;
      case 'vps':
        return <VpsMonitor key="vps" />;
      default:
        return null;
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#0B0F14] font-body">
      
      {/* ─── Header / Top Bar ─── */}
      <TopBar />

      {/* ─── Sidebar Navigation ─── */}
      <Sidebar active={activeNav} onChange={(id) => { setActiveNav(id); setSelectedId(null); }} />

      {/* ─── Main Content Area ─── */}
      <main className="ml-20 mt-16 h-[calc(100vh-64px)] overflow-y-auto bg-[#0B0F14] p-8 relative custom-scrollbar">
        <AnimatePresence mode="wait">
          {renderMainContent()}
        </AnimatePresence>
      </main>



    </div>
  );
}

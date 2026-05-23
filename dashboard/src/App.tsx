import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { checkAuth, setAuth, listPipelines, connectAllSSE, listChatSessions, getChatSession } from './api/client';
import type { Pipeline, PipelineEvent, ChatSession } from './api/client';
import './index.css';

import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { DetailPanel } from './components/DetailPanel';

// ─── Mock Data (dev preview) ───
const MOCK_PIPELINES: Pipeline[] = [
  {
    id: 'pipe-001', name: 'app-todo-mobile', description: 'Application mobile todo list avec React Native, notifications push et mode offline.',
    phase: 'RUNNING', progress: 67, model: 'anthropic/claude-sonnet-4',
    agents: [
      { role: 'Planner', emoji: '🧠', status: 'done' },
      { role: 'Developer', emoji: '⚡', status: 'active', currentAction: 'Implementing offline sync logic...' },
      { role: 'Evaluator', emoji: '🎯', status: 'waiting' },
    ],
    events: [], artifacts: {},
    tokenUsage: { inputTokens: 84200, outputTokens: 12800 },
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    github: { owner: 'HASHT85', repo: 'app-todo-mobile', url: 'https://github.com/HASHT85/app-todo-mobile' },
  },
  {
    id: 'pipe-002', name: 'landing-saas', description: 'Landing page moderne pour SaaS avec animations, pricing table et CTA optimisé.',
    phase: 'COMPLETED', progress: 100, model: 'anthropic/claude-sonnet-4',
    agents: [
      { role: 'Planner', emoji: '🧠', status: 'done' },
      { role: 'Designer', emoji: '🎨', status: 'done' },
      { role: 'Developer', emoji: '⚡', status: 'done' },
      { role: 'Evaluator', emoji: '🎯', status: 'done' },
    ],
    events: [], artifacts: { evalReport: { score: 92, recommendation: 'SHIP', cycle: 2, timestamp: new Date().toISOString(), checks: [] } },
    tokenUsage: { inputTokens: 62000, outputTokens: 9400 },
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    github: { owner: 'HASHT85', repo: 'landing-saas', url: 'https://github.com/HASHT85/landing-saas' },
  },
  {
    id: 'pipe-003', name: 'discord-bot', description: 'Bot Discord avec commandes slash, modération auto et intégration OpenAI.',
    phase: 'FAILED', progress: 34, model: 'google/gemini-2.5-flash',
    agents: [
      { role: 'Planner', emoji: '🧠', status: 'done' },
      { role: 'Developer', emoji: '⚡', status: 'error', currentAction: 'Build failed: missing discord.js types' },
    ],
    events: [], artifacts: {},
    tokenUsage: { inputTokens: 18400, outputTokens: 2200 },
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 22 * 3600000).toISOString(),
    error: 'Build failed: Cannot find module discord.js types',
  },
];

const MOCK_SESSIONS: ChatSession[] = [
  {
    id: 'sess-001', model: 'anthropic/claude-sonnet-4',
    messages: [{ role: 'user', content: 'Génère une app todo mobile avec React Native et mode offline', timestamp: new Date(Date.now() - 2 * 3600000).toISOString() }, { role: 'assistant', content: 'Je lance le pipeline...', timestamp: new Date(Date.now() - 2 * 3600000 + 1000).toISOString() }],
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    id: 'sess-002', model: 'anthropic/claude-sonnet-4',
    messages: [{ role: 'user', content: 'app-todo-mobile — ajoute les notifications push', timestamp: new Date(Date.now() - 1 * 3600000).toISOString() }, { role: 'assistant', content: 'Modification en cours...', timestamp: new Date(Date.now() - 3500000).toISOString() }],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3500000).toISOString(),
  },
  {
    id: 'sess-003', model: 'anthropic/claude-sonnet-4',
    messages: [{ role: 'user', content: 'Crée une landing page SaaS avec pricing table animée', timestamp: new Date(Date.now() - 5 * 3600000).toISOString() }, { role: 'assistant', content: 'Voici le pipeline...', timestamp: new Date(Date.now() - 5 * 3600000 + 1000).toISOString() }],
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: 'sess-004', model: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Comment fonctionne le système de mémoire long-terme de VEIST ?', timestamp: new Date(Date.now() - 26 * 3600000).toISOString() }, { role: 'assistant', content: 'Le système de mémoire utilise...', timestamp: new Date(Date.now() - 26 * 3600000 + 2000).toISOString() }],
    createdAt: new Date(Date.now() - 26 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 26 * 3600000).toISOString(),
  },
  {
    id: 'sess-005', model: 'anthropic/claude-sonnet-4',
    messages: [{ role: 'user', content: 'Quelle est la différence entre claude-sonnet-4 et gemini-2.5 pour du code ?', timestamp: new Date(Date.now() - 48 * 3600000).toISOString() }, { role: 'assistant', content: 'Voici une comparaison...', timestamp: new Date(Date.now() - 48 * 3600000 + 3000).toISOString() }],
    createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
  },
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
    setError(''); setLoading(true);
    try {
      setAuth(user, pass);
      await listPipelines();
      onLogin();
    } catch {
      localStorage.removeItem('veist_auth');
      setError('Invalid credentials');
    } finally { setLoading(false); }
  };

  return (
    <div className="font-body min-h-screen flex items-center justify-center bg-surface-0 text-text-primary px-4">
      <motion.div
        className="w-full max-w-[400px] flex flex-col gap-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.png" alt="VEIST" className="w-14 h-14 drop-shadow-[0_0_12px_rgba(215,255,47,0.3)]" />
          <h1 className="font-headline text-2xl font-bold tracking-tight">Welcome to VEIST</h1>
          <p className="text-text-secondary text-sm">Sign in to your workspace</p>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-status-error/10 border border-status-error/20 rounded-xl px-4 py-3 text-status-error text-sm text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form */}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="text-2xs text-text-tertiary font-medium uppercase tracking-wider mb-1.5 block">Username</label>
            <input
              className="w-full bg-surface-3 border border-surface-6 rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-v-accent/50 focus:shadow-input-focus transition-all"
              placeholder="Enter username"
              value={user} onChange={(e) => setUser(e.target.value)}
              autoComplete="off" autoCapitalize="none" spellCheck={false}
            />
          </div>
          <div>
            <label className="text-2xs text-text-tertiary font-medium uppercase tracking-wider mb-1.5 block">Password</label>
            <input
              className="w-full bg-surface-3 border border-surface-6 rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-v-accent/50 focus:shadow-input-focus transition-all"
              type="password" placeholder="••••••••"
              value={pass} onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="mt-2 w-full bg-v-accent text-surface-0 font-headline font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:shadow-glow-md transition-all disabled:opacity-50 text-sm"
          >
            {loading ? (
              <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> Signing in...</>
            ) : (
              <><span className="material-symbols-outlined text-[18px]">login</span> Sign in</>
            )}
          </button>
        </form>

        <p className="text-center text-2xs text-text-muted">
          VEIST Autonomous Multi-Agent System
        </p>
      </motion.div>
    </div>
  );
}

// ─── Dashboard ───

function Dashboard() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [liveEvents, setLiveEvents] = useState<PipelineEvent[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Main view: 'chat' shows ChatView, 'project' shows DetailPanel full-width
  const [view, setView] = useState<'chat' | 'project'>('chat');
  const [detailPipeline, setDetailPipeline] = useState<Pipeline | null>(null);

  // Load pipelines
  const loadPipelines = useCallback(async () => {
    try {
      const data = await listPipelines();
      setPipelines(data.pipelines || []);
    } catch {}
  }, []);

  // Load chat sessions
  const loadSessions = useCallback(async () => {
    try {
      const data = await listChatSessions();
      setSessions(data.sessions || []);
    } catch {}
  }, []);

  useEffect(() => { loadPipelines(); loadSessions(); }, [loadPipelines, loadSessions]);

  // Poll pipelines every 5s
  useEffect(() => {
    const id = setInterval(loadPipelines, 5000);
    return () => clearInterval(id);
  }, [loadPipelines]);

  // SSE live events
  useEffect(() => {
    const close = connectAllSSE((event) => {
      setLiveEvents(prev => [event, ...prev].slice(0, 100));
      loadPipelines();
    });
    return close;
  }, [loadPipelines]);

  const handleSelectSession = async (s: ChatSession) => {
    setActiveSession(s);
    setView('chat');
    try {
      const data = await getChatSession(s.id);
      setActiveSession(data.session);
    } catch {}
  };

  const handleNewChat = () => {
    setActiveSession(null);
    setView('chat');
  };

  const handleSelectProject = (p: Pipeline) => {
    setDetailPipeline(p);
    setView('project');
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface-0 font-body">

      {/* ─── Sidebar wrapper – controls width in flex flow ─── */}
      <div className={`shrink-0 h-screen transition-all duration-300 overflow-hidden ${
        sidebarCollapsed ? 'w-0' : 'w-[280px]'
      }`}>
        <Sidebar
          activeSessionId={activeSession?.id || null}
          activePipelineId={view === 'project' ? detailPipeline?.id || null : null}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onSelectProject={handleSelectProject}
          sessions={sessions}
          pipelines={pipelines}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* ─── Sidebar Re-open Button (visible when collapsed) ─── */}
      {sidebarCollapsed && (
        <button
          className="hidden md:flex fixed top-3 left-3 z-50 p-2 rounded-lg bg-surface-3 border border-surface-6/50 text-text-secondary hover:text-v-accent hover:border-v-accent/30 transition-all shadow-card items-center gap-2"
          onClick={() => setSidebarCollapsed(false)}
          title="Open sidebar"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>
      )}

      {/* ─── Main Area – takes all remaining space ─── */}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        {view === 'chat' ? (
          <ChatView
            pipelines={pipelines}
            onPipelineLaunched={() => { loadPipelines(); loadSessions(); }}
            onRefresh={loadPipelines}
            activeSession={activeSession}
            setActiveSession={setActiveSession}
            sessions={sessions}
            setSessions={setSessions}
            onOpenDetail={handleSelectProject}
          />
        ) : (
          <DetailPanel
            pipeline={detailPipeline}
            liveEvents={liveEvents}
            open={true}
            onClose={() => setView('chat')}
            fullscreen={true}
          />
        )}
      </main>
    </div>
  );
}

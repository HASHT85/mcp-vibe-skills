import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Rocket, FolderKanban, Bot, Sparkles, Server,
  ChevronLeft, Plus, ExternalLink, Github, Play, Bomb,
  Trash2, LayoutGrid, Coins, Edit, Paperclip, X,
  Globe, Cpu, Database
} from 'lucide-react';
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
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <motion.form
        className="login-box"
        onSubmit={submit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1>⚡ VibeCraft HQ</h1>
        <p>Universal AI & Software Builder</p>
        {error && <p style={{ color: '#ff6b6b', fontSize: '0.9rem', margin: '0 0 0.5rem' }}>{error}</p>}
        <input
          className="login-input"
          placeholder="Username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
        <input
          className="login-input"
          type="password"
          placeholder="Password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <button type="submit" className="btn-login" disabled={loading}>
          {loading ? 'Connecting...' : 'Enter HQ'}
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
    <div className="app-layout">
      {/* TopBar */}
      <TopBar
        pipelineCount={pipelines.filter(p => !['COMPLETED', 'FAILED'].includes(p.phase)).length}
        onLaunch={() => setShowModal(true)}
        totalTokens={pipelines.reduce((sum, p) => sum + (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0), 0)}
      />

      {/* Sidebar */}
      <Sidebar active={activeNav} onChange={(id) => { setActiveNav(id); setSelectedId(null); }} />

      {/* Main */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          {renderMainContent()}
        </AnimatePresence>
      </main>

      {/* Activity Panel */}
      <LiveActivityPanel events={liveEvents} pipelines={pipelines} />

      {/* Launch Modal */}
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


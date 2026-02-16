import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Rocket, FolderKanban, Bot, Sparkles, Server,
  ChevronLeft, Plus, ExternalLink, Github, Pause, Play,
  Trash2, LayoutGrid,
} from 'lucide-react';
import {
  checkAuth, setAuth, listPipelines, launchIdea,
  pausePipeline, resumePipeline, deletePipeline, connectAllSSE,
} from './api/client';
import type { Pipeline, PipelineEvent, PipelineAgent } from './api/client';
import './index.css';

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuth(user, pass);
    onLogin();
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
        <p>Multi-Agent Orchestrator Dashboard</p>
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
        <button type="submit" className="btn-login">Enter HQ</button>
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

  return (
    <div className="app-layout">
      {/* TopBar */}
      <TopBar
        pipelineCount={pipelines.filter(p => !['COMPLETED', 'FAILED'].includes(p.phase)).length}
        onLaunch={() => setShowModal(true)}
      />

      {/* Sidebar */}
      <Sidebar active={activeNav} onChange={setActiveNav} />

      {/* Main */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          {selected ? (
            <ProjectDetail
              key={selected.id}
              pipeline={selected}
              onBack={() => setSelectedId(null)}
              onRefresh={load}
            />
          ) : (
            <ProjectList
              key="list"
              pipelines={pipelines}
              onSelect={(id) => setSelectedId(id)}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Activity Panel */}
      <LiveActivityPanel events={liveEvents} pipelines={pipelines} />

      {/* Launch Modal */}
      <AnimatePresence>
        {showModal && (
          <LaunchModal
            onClose={() => setShowModal(false)}
            onLaunch={async (desc, name) => {
              await launchIdea(desc, name);
              setShowModal(false);
              load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── TopBar ───

function TopBar({ pipelineCount, onLaunch }: { pipelineCount: number; onLaunch: () => void }) {
  return (
    <header className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-icon">⚡</div>
        <span>VibeCraft HQ</span>
      </div>
      <div className="topbar-status">
        <div className="status-badge">
          <span className="status-dot" />
          {pipelineCount} active
        </div>
        <button className="btn-launch" onClick={onLaunch}>
          <Plus size={14} />
          Lancer une idée
        </button>
      </div>
    </header>
  );
}

// ─── Sidebar ───

const NAV_ITEMS = [
  { id: 'projects', icon: LayoutGrid, label: 'Projects' },
  { id: 'agents', icon: Bot, label: 'Agents' },
  { id: 'skills', icon: Sparkles, label: 'Skills' },
  { id: 'deploy', icon: Server, label: 'Deploy' },
];

function Sidebar({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <nav className="sidebar">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`sidebar-btn ${active === item.id ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
          title={item.label}
        >
          <item.icon size={18} />
        </button>
      ))}
    </nav>
  );
}

// ─── Project List ───

function ProjectList({ pipelines, onSelect }: { pipelines: Pipeline[]; onSelect: (id: string) => void }) {
  if (!pipelines.length) {
    return (
      <motion.div className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="empty-icon">🚀</div>
        <h3>Aucun projet en cours</h3>
        <p>Lance une idée pour démarrer ta première pipeline multi-agent.</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="section-title">Projets ({pipelines.length})</div>
      <div className="projects-grid">
        {pipelines.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <ProjectCard pipeline={p} onClick={() => onSelect(p.id)} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function ProjectCard({ pipeline: p, onClick }: { pipeline: Pipeline; onClick: () => void }) {
  return (
    <div className="project-card" onClick={onClick}>
      <div className="card-header">
        <span className="card-name">{p.name}</span>
        <span className={`phase-badge ${p.phase.toLowerCase()}`}>{p.phase}</span>
      </div>
      <div className="card-desc">{p.description}</div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${p.progress}%` }} />
      </div>
      <div className="agent-chips">
        {(p.agents || []).map(agent => (
          <span key={agent.role} className={`agent-chip ${agent.status}`}>
            {agent.emoji} {agent.role}
          </span>
        ))}
      </div>
      {p.github && (
        <div className="link-row">
          <Github size={12} />
          <a href={p.github.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            {p.github.owner}/{p.github.repo}
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Project Detail ───

function ProjectDetail({ pipeline: p, onBack, onRefresh }: {
  pipeline: Pipeline;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const handlePause = async () => {
    if (p.phase === 'PAUSED') {
      await resumePipeline(p.id);
    } else {
      await pausePipeline(p.id);
    }
    onRefresh();
  };

  const handleDelete = async () => {
    if (confirm(`Supprimer "${p.name}" et ses ressources ?`)) {
      await deletePipeline(p.id);
      onBack();
      onRefresh();
    }
  };

  return (
    <motion.div
      className="detail-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      {/* Header */}
      <div className="detail-header">
        <button className="btn-back" onClick={onBack}>
          <ChevronLeft size={16} />
        </button>
        <div className="detail-info">
          <h2>{p.name}</h2>
          <div className="detail-desc">{p.description}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span className={`phase-badge ${p.phase.toLowerCase()}`}>{p.phase}</span>
          {!['COMPLETED', 'FAILED'].includes(p.phase) && (
            <button className="btn-back" onClick={handlePause} title={p.phase === 'PAUSED' ? 'Resume' : 'Pause'}>
              {p.phase === 'PAUSED' ? <Play size={14} /> : <Pause size={14} />}
            </button>
          )}
          <button className="btn-back" onClick={handleDelete} title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${p.progress}%` }} />
      </div>

      {/* Links */}
      <div style={{ display: 'flex', gap: 16 }}>
        {p.github && (
          <div className="link-row">
            <Github size={12} />
            <a href={p.github.url} target="_blank" rel="noopener noreferrer">
              {p.github.owner}/{p.github.repo}
            </a>
          </div>
        )}
        {p.dokploy && (
          <div className="link-row">
            <Rocket size={12} />
            <span>Dokploy: {p.dokploy.applicationId?.slice(0, 8)}...</span>
          </div>
        )}
      </div>

      {/* Agent Cards */}
      <div className="section-title">Agents</div>
      <div className="agent-cards">
        {(p.agents || []).map(agent => (
          <AgentCard key={agent.role} agent={agent} />
        ))}
      </div>

      {/* Terminal */}
      <div className="section-title">Console</div>
      <Terminal events={p.events || []} />
    </motion.div>
  );
}

function AgentCard({ agent }: { agent: PipelineAgent }) {
  return (
    <motion.div
      className={`agent-card ${agent.status}`}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="agent-card-header">
        <span className="agent-card-emoji">{agent.emoji}</span>
        <span className="agent-card-name">{agent.role}</span>
        <span className={`agent-chip ${agent.status}`} style={{ marginLeft: 'auto' }}>
          {agent.status}
        </span>
      </div>
      {agent.currentAction && (
        <div className="agent-card-status">{agent.currentAction}</div>
      )}
    </motion.div>
  );
}

function Terminal({ events }: { events: PipelineEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-dots">
          <span /><span /><span />
        </div>
        Pipeline Events ({events.length})
      </div>
      <div className="terminal-body">
        {events.map(ev => (
          <div key={ev.id} className={`terminal-line ${ev.type}`}>
            <span className="terminal-time">{formatTime(ev.timestamp)}</span>
            <span className="terminal-agent">{ev.agentEmoji} {ev.agentRole}</span>
            <span className="terminal-msg">{ev.action}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

// ─── Live Activity Panel ───

function LiveActivityPanel({ events, pipelines }: { events: PipelineEvent[]; pipelines: Pipeline[] }) {
  const getPipelineName = (id: string) => pipelines.find(p => p.id === id)?.name || id;

  return (
    <aside className="activity-panel">
      <div className="activity-title">
        <span className="activity-dot" />
        Live Activity
      </div>

      {events.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
          En attente d'activité...
        </div>
      )}

      {events.map((ev) => (
        <motion.div
          key={ev.id + ev.timestamp}
          className="activity-item"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="activity-emoji">{ev.agentEmoji}</span>
          <div className="activity-content">
            <div className="activity-project">{getPipelineName(ev.pipelineId)}</div>
            <div className="activity-action">{ev.action}</div>
            <div className="activity-time">{formatTime(ev.timestamp)}</div>
          </div>
        </motion.div>
      ))}
    </aside>
  );
}

// ─── Launch Modal ───

function LaunchModal({ onClose, onLaunch }: {
  onClose: () => void;
  onLaunch: (desc: string, name?: string) => void;
}) {
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!desc.trim()) return;
    setLoading(true);
    try {
      await onLaunch(desc.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>🚀 Lancer une idée</h2>
        <p>Décris ton projet. Les agents IA vont l'analyser, le concevoir, le développer et le déployer automatiquement.</p>
        <textarea
          placeholder="Ex: Un dashboard analytics pour tracker les ventes e-commerce en temps réel avec des graphiques interactifs..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          autoFocus
        />
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Annuler</button>
          <button
            className="btn-launch"
            onClick={submit}
            disabled={!desc.trim() || loading}
          >
            {loading ? '⏳ Lancement...' : (
              <><Rocket size={14} /> Lancer la pipeline</>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Helpers ───

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

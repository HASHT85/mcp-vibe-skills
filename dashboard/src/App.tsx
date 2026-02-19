import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Rocket, FolderKanban, Bot, Sparkles, Server,
  ChevronLeft, Plus, ExternalLink, Github, Pause, Play,
  Trash2, LayoutGrid, Coins, Edit,
} from 'lucide-react';
import {
  checkAuth, setAuth, listPipelines, launchIdea,
  pausePipeline, resumePipeline, deletePipeline, connectAllSSE, modifyPipeline,
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

function TopBar({ pipelineCount, onLaunch, totalTokens }: { pipelineCount: number; onLaunch: () => void; totalTokens: number }) {
  return (
    <header className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-icon">⚡</div>
        <span>VibeCraft HQ</span>
      </div>
      <div className="topbar-status">
        <div className="status-badge" title="Total tokens used">
          <Coins size={12} />
          {formatTokenCount(totalTokens)} tokens
        </div>
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
  { id: 'tokens', icon: Coins, label: 'Tokens' },
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
  const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {p.github && (
          <div className="link-row">
            <Github size={12} />
            <a href={p.github.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {p.github.owner}/{p.github.repo}
            </a>
          </div>
        )}
        {totalTokens > 0 && (
          <div className="token-badge">
            <Coins size={10} />
            {formatTokenCount(totalTokens)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Project Detail ───

function ProjectDetail({ pipeline: p, onBack, onRefresh }: {
  pipeline: Pipeline;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [showModify, setShowModify] = useState(false);
  const [modifyText, setModifyText] = useState('');
  const [modifying, setModifying] = useState(false);

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

  const handleModify = async () => {
    if (!modifyText.trim()) return;
    setModifying(true);
    try {
      await modifyPipeline(p.id, modifyText.trim());
      setShowModify(false);
      setModifyText('');
      onRefresh();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    } finally {
      setModifying(false);
    }
  };

  const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);

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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`phase-badge ${p.phase.toLowerCase()}`}>{p.phase}</span>
          {['COMPLETED', 'FAILED'].includes(p.phase) && (
            <button className="btn-modify" onClick={() => setShowModify(true)} title="Modifier le projet">
              <Edit size={14} /> Modifier
            </button>
          )}
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

      {/* Links + Tokens */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {p.github && (
          <div className="link-row">
            <Github size={12} />
            <a href={p.github.url} target="_blank" rel="noopener noreferrer">
              {p.github.owner}/{p.github.repo}
            </a>
          </div>
        )}
        {p.dokploy?.url && (
          <div className="link-row">
            <ExternalLink size={12} />
            <a href={p.dokploy.url} target="_blank" rel="noopener noreferrer">
              {p.dokploy.url}
            </a>
          </div>
        )}
        {p.dokploy && !p.dokploy.url && (
          <div className="link-row">
            <Rocket size={12} />
            <span>Dokploy: {p.dokploy.applicationId?.slice(0, 8)}...</span>
          </div>
        )}
        {totalTokens > 0 && (
          <div className="token-badge" style={{ fontSize: 12 }}>
            <Coins size={12} />
            {formatTokenCount(p.tokenUsage?.inputTokens || 0)} in / {formatTokenCount(p.tokenUsage?.outputTokens || 0)} out
            ({formatTokenCount(totalTokens)} total)
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

      {/* Modify Modal */}
      <AnimatePresence>
        {showModify && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowModify(false)}
          >
            <motion.div
              className="modal modify-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>✏️ Modifier "{p.name}"</h3>
              <p style={{ color: 'var(--color-text-dim)', fontSize: 13, margin: '8px 0 16px' }}>
                Décris les modifications à apporter. L'agent Developer va modifier le code, push sur GitHub, et redéployer.
              </p>
              <textarea
                autoFocus
                rows={6}
                placeholder="Ex: Change le titre en 'Mon Portfolio', ajoute un mode dark, corrige le footer..."
                value={modifyText}
                onChange={(e) => setModifyText(e.target.value)}
                className="modify-textarea"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button className="btn-cancel" onClick={() => setShowModify(false)}>Annuler</button>
                <button
                  className="btn-launch"
                  onClick={handleModify}
                  disabled={modifying || !modifyText.trim()}
                >
                  {modifying ? 'Envoi...' : '🚀 Lancer la modification'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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

// ─── Agents View ───

function AgentsView({ pipelines }: { pipelines: Pipeline[] }) {
  const allAgents = pipelines.flatMap(p =>
    (p.agents || []).map(a => ({ ...a, pipelineName: p.name, pipelinePhase: p.phase }))
  );

  const byRole = allAgents.reduce((acc, a) => {
    if (!acc[a.role]) acc[a.role] = [];
    acc[a.role].push(a);
    return acc;
  }, {} as Record<string, typeof allAgents>);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="section-title">Agents ({allAgents.length})</div>
      {Object.entries(byRole).map(([role, agents]) => (
        <div key={role} style={{ marginBottom: 24 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            {agents[0]?.emoji} {role} ({agents.length})
          </div>
          <div className="agent-cards">
            {agents.map((agent, i) => (
              <motion.div
                key={`${agent.pipelineName}-${i}`}
                className={`agent-card ${agent.status}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="agent-card-header">
                  <span className="agent-card-emoji">{agent.emoji}</span>
                  <span className="agent-card-name">{agent.role}</span>
                  <span className={`agent-chip ${agent.status}`} style={{ marginLeft: 'auto' }}>
                    {agent.status}
                  </span>
                </div>
                <div className="agent-card-status">
                  {agent.pipelineName} • {agent.currentAction || agent.pipelinePhase}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
      {allAgents.length === 0 && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 60 }}>
          Aucun agent actif. Lance un projet pour les voir en action.
        </div>
      )}
    </motion.div>
  );
}

// ─── Tokens View ───

function TokensView({ pipelines }: { pipelines: Pipeline[] }) {
  const totalInput = pipelines.reduce((s, p) => s + (p.tokenUsage?.inputTokens || 0), 0);
  const totalOutput = pipelines.reduce((s, p) => s + (p.tokenUsage?.outputTokens || 0), 0);
  const totalTokens = totalInput + totalOutput;

  // Claude Haiku 4.5 pricing (claude-haiku-4-5-20251001)
  const costPerMInput = 1.00; // $1.00 per 1M input tokens
  const costPerMOutput = 5.00; // $5.00 per 1M output tokens
  const estimatedCost = (totalInput / 1_000_000) * costPerMInput + (totalOutput / 1_000_000) * costPerMOutput;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="section-title">Token Usage</div>

      {/* Summary Cards */}
      <div className="token-summary">
        <div className="token-card">
          <div className="token-card-label">Total Tokens</div>
          <div className="token-card-value">{formatTokenCount(totalTokens)}</div>
        </div>
        <div className="token-card">
          <div className="token-card-label">Input Tokens</div>
          <div className="token-card-value">{formatTokenCount(totalInput)}</div>
        </div>
        <div className="token-card">
          <div className="token-card-label">Output Tokens</div>
          <div className="token-card-value">{formatTokenCount(totalOutput)}</div>
        </div>
        <div className="token-card highlight">
          <div className="token-card-label">Coût estimé (Haiku 4.5)</div>
          <div className="token-card-value">${estimatedCost.toFixed(4)}</div>
        </div>
      </div>

      {/* Per-project breakdown */}
      <div className="section-title" style={{ marginTop: 24 }}>Par Projet</div>
      <div className="terminal">
        <div className="terminal-header">
          <div className="terminal-dots"><span /><span /><span /></div>
          Token Breakdown
        </div>
        <div className="terminal-body">
          {pipelines.map(p => {
            const inp = p.tokenUsage?.inputTokens || 0;
            const out = p.tokenUsage?.outputTokens || 0;
            const total = inp + out;
            const pct = totalTokens > 0 ? ((total / totalTokens) * 100).toFixed(1) : '0';
            return (
              <div key={p.id} className="terminal-line info">
                <span className="terminal-agent" style={{ minWidth: 200 }}>{p.name}</span>
                <span className="terminal-msg">
                  {formatTokenCount(inp)} in / {formatTokenCount(out)} out = {formatTokenCount(total)} ({pct}%)
                </span>
              </div>
            );
          })}
          {pipelines.length === 0 && (
            <div className="terminal-line info">
              <span className="terminal-msg" style={{ color: 'var(--text-muted)' }}>Aucune donnée de tokens</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Deploy View ───

function DeployView({ pipelines }: { pipelines: Pipeline[] }) {
  const deployed = pipelines.filter(p => p.dokploy);
  const withGithub = pipelines.filter(p => p.github);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="section-title">Déploiements ({deployed.length})</div>

      {deployed.length === 0 && withGithub.length === 0 && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 60 }}>
          Aucun déploiement. Les projets sont déployés automatiquement via Dokploy.
        </div>
      )}

      <div className="projects-grid">
        {withGithub.map(p => (
          <div key={p.id} className="project-card">
            <div className="card-header">
              <span className="card-name">{p.name}</span>
              <span className={`phase-badge ${p.phase.toLowerCase()}`}>{p.phase}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {p.github && (
                <div className="link-row">
                  <Github size={12} />
                  <a href={p.github.url} target="_blank" rel="noopener noreferrer">
                    {p.github.owner}/{p.github.repo}
                  </a>
                  <ExternalLink size={10} />
                </div>
              )}
              {p.dokploy && (
                <div className="link-row">
                  <Server size={12} />
                  <span>Dokploy: {p.dokploy.applicationId?.slice(0, 12)}...</span>
                  {p.dokploy.url && (
                    <a href={p.dokploy.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              )}
              {!p.dokploy && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>⏳ En attente de déploiement...</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
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

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

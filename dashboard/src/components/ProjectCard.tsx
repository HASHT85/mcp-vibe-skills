import { Globe, Cpu, Database, Github, Coins } from 'lucide-react';
import type { Pipeline } from '../api/client';
import { formatTokenCount } from '../utils';

interface ProjectCardProps {
    pipeline: Pipeline;
    onClick: () => void;
}

export function ProjectCard({ pipeline: p, onClick }: ProjectCardProps) {
    const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);

    const getTypeIcon = () => {
        if (p.projectType === 'spa' || p.projectType === 'static') return <Globe size={14} />;
        if (p.projectType?.includes('worker')) return <Cpu size={14} />;
        return <Database size={14} />; // api or fullstack
    };

    return (
        <div className="project-card" onClick={onClick}>
            <div className="card-header">
                <span className="card-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {getTypeIcon()} {p.name}
                </span>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
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

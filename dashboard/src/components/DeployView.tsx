import { motion } from 'framer-motion';
import { Github, Server, ExternalLink } from 'lucide-react';
import type { Pipeline } from '../api/client';

export function DeployView({ pipelines }: { pipelines: Pipeline[] }) {
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

import { motion } from 'framer-motion';
import type { Pipeline } from '../api/client';

export function AgentsView({ pipelines }: { pipelines: Pipeline[] }) {
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

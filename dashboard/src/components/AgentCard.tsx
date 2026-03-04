import { motion } from 'framer-motion';
import type { PipelineAgent } from '../api/client';

export function AgentCard({ agent }: { agent: PipelineAgent }) {
    // Determine if the agent is actively doing something
    const isActive = agent.status === 'active';

    return (
        <motion.div
            className={`agent-card ${agent.status}`}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
                opacity: 1,
                scale: 1,
                // Neural Glass active agent animation: pulsing border/glow
                boxShadow: isActive ? ['0px 0px 0px rgba(6,182,212,0)', '0px 0px 15px rgba(6,182,212,0.4)', '0px 0px 0px rgba(6,182,212,0)'] : '0px 0px 0px rgba(0,0,0,0)',
                borderColor: isActive ? ['rgba(255,255,255,0.06)', 'rgba(6,182,212,0.6)', 'rgba(255,255,255,0.06)'] : 'rgba(255,255,255,0.06)'
            }}
            transition={isActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        >
            <div className="agent-card-header">
                <span className="agent-card-emoji">{agent.emoji}</span>
                <span className="agent-card-name">{agent.role}</span>
                <span className={`agent-chip ${agent.status}`} style={{ marginLeft: 'auto' }}>
                    {agent.status}
                </span>
            </div>

            {/* Typing effect for current action when active */}
            {agent.currentAction && (
                <div className="agent-card-status">
                    <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        key={agent.currentAction} // forces re-render/animation on action change
                        transition={{ duration: 0.5 }}
                    >
                        {agent.currentAction}
                        {isActive && (
                            <motion.span
                                animate={{ opacity: [1, 0, 1] }}
                                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                            >
                                _
                            </motion.span>
                        )}
                    </motion.span>
                </div>
            )}
        </motion.div>
    );
}

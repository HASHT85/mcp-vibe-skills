import { motion } from 'framer-motion';
import type { PipelineEvent, Pipeline } from '../api/client';
import { formatTime } from '../utils';

export function LiveActivityPanel({ events, pipelines }: { events: PipelineEvent[]; pipelines: Pipeline[] }) {
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

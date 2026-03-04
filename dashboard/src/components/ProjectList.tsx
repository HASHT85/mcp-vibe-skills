import { motion } from 'framer-motion';
import type { Pipeline } from '../api/client';
import { ProjectCard } from './ProjectCard';

interface ProjectListProps {
    pipelines: Pipeline[];
    onSelect: (id: string) => void;
}

export function ProjectList({ pipelines, onSelect }: ProjectListProps) {
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

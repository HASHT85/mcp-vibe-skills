import { motion } from 'framer-motion';
import type { Pipeline } from '../api/client';
import { ProjectCard } from './ProjectCard';

interface ProjectListProps {
    pipelines: Pipeline[];
    onSelect: (id: string) => void;
    onRetry?: (id: string) => void;
}

const HIDDEN_PROJECTS = ['veist', 'veist-dashboard'];

export function ProjectList({ pipelines, onSelect, onRetry }: ProjectListProps) {
    const filtered = pipelines.filter(p => !HIDDEN_PROJECTS.some(h => (p.name || '').toLowerCase().includes(h) || (p.id || '').toLowerCase().includes(h)));
    if (!filtered.length) {
        return (
            <motion.div 
                className="flex flex-col items-center justify-center p-20 mt-10 brutalist-border bg-v-surface relative overflow-hidden h-[60vh] font-mono" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
            >
                {/* Decorative Marathon Frame corners */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-v-accent"></div>
                
                <span className="material-symbols-outlined text-6xl text-white/20 mb-6 font-light">
                    grid_view
                </span>
                
                <h3 className="text-2xl font-sans font-bold text-white uppercase mb-4">NO ACTIVE NODES</h3>
                <p className="text-v-accent text-xs max-w-md text-center opacity-80 uppercase tracking-widest leading-relaxed">
                    INITIALIZE A NEW PIPELINE SEQUENCE TO ESTABLISH A CONNECTION WITH THE CREATIVE MATRIX.
                </p>
                
                <div className="mt-10 flex gap-4">
                    <div className="w-2 h-2 bg-v-accent rounded-none animate-ping"></div>
                    <div className="w-2 h-2 bg-v-accent/50 rounded-none"></div>
                    <div className="w-2 h-2 bg-v-accent/20 rounded-none"></div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-8 border-b-2 border-v-accent pb-4">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-v-accent text-2xl font-bold">folder_managed</span>
                    <h1 className="text-2xl md:text-4xl font-sans font-bold text-v-accent uppercase">Project<span className="text-white">_Nodes</span></h1>
                    <span className="bg-white text-v-bg text-[10px] font-mono font-bold px-2 py-0.5 ml-2 mt-1 uppercase tracking-widest hidden sm:inline-block">
                        {filtered.length} ACTIVE
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map((p, i) => (
                    <motion.div
                        key={p.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05, duration: 0.2 }}
                    >
                        <ProjectCard pipeline={p} onClick={() => onSelect(p.id)} onRetry={onRetry} />
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

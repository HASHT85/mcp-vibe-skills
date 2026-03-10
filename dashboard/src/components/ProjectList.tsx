import { motion } from 'framer-motion';
import type { Pipeline } from '../api/client';
import { ProjectCard } from './ProjectCard';

interface ProjectListProps {
    pipelines: Pipeline[];
    onSelect: (id: string) => void;
}

const HIDDEN_PROJECTS = ['mcp-vibe-skills', 'mcp-vibe-dashboard'];

export function ProjectList({ pipelines, onSelect }: ProjectListProps) {
    const filtered = pipelines.filter(p => !HIDDEN_PROJECTS.some(h => p.name?.toLowerCase().includes(h) || p.id?.toLowerCase().includes(h)));
    if (!filtered.length) {
        return (
            <motion.div 
                className="flex flex-col items-center justify-center p-20 mt-10 border-2 border-border-muted bg-panel relative overflow-hidden h-[60vh]" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
            >
                {/* Decorative Marathon Frame corners */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary"></div>

                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10"></div>
                
                <span className="material-symbols-outlined text-6xl text-slate-700 mb-6 font-light">
                    grid_view
                </span>
                
                <h3 className="text-2xl font-display font-bold text-slate-100 tracking-[0.3em] uppercase mb-4 hover-glitch">NO ACTIVE NODES</h3>
                <p className="text-accent font-mono text-xs max-w-md text-center opacity-80 uppercase tracking-widest leading-relaxed">
                    INITIALIZE A NEW PIPELINE SEQUENCE TO ESTABLISH A CONNECTION WITH THE CREATIVE MATRIX.
                </p>
                
                <div className="mt-10 flex gap-4">
                    <div className="w-2 h-2 bg-primary rounded-none animate-ping shadow-neon-red"></div>
                    <div className="w-2 h-2 bg-primary/50 rounded-none"></div>
                    <div className="w-2 h-2 bg-primary/20 rounded-none"></div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-8 border-b-2 border-border-muted pb-4">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-accent text-2xl font-bold">folder_managed</span>
                    <h1 className="text-2xl font-display font-bold text-slate-100 tracking-[0.2em] uppercase">Project<span className="text-accent">_Nodes</span></h1>
                    <span className="bg-primary/10 text-primary text-[10px] font-mono font-bold px-2 py-0.5 ml-2 mt-1 border border-primary/30 uppercase tracking-widest">
                        {filtered.length} ACTIVE
                    </span>
                </div>
                
                <div className="flex bg-panel border-2 border-border-muted p-0.5 rounded-none">
                    <button className="px-4 py-1.5 bg-accent text-black text-[10px] font-bold uppercase tracking-widest transition-colors font-mono hover-glitch">GRID</button>
                    <button className="px-4 py-1.5 text-slate-500 hover:text-accent border border-transparent hover:border-accent text-[10px] font-bold uppercase tracking-widest transition-colors font-mono">LIST</button>
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
                        <ProjectCard pipeline={p} onClick={() => onSelect(p.id)} />
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

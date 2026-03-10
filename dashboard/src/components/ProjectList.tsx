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
                className="flex flex-col items-center justify-center p-20 mt-10 border border-border-muted bg-panel/30 relative overflow-hidden" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
            >
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10"></div>
                
                <span className="material-symbols-outlined text-6xl text-slate-700 mb-6 font-light">
                    grid_view
                </span>
                
                <h3 className="text-xl font-black text-white tracking-widest uppercase mb-2">No Active Nodes</h3>
                <p className="text-slate-400 text-sm max-w-md text-center">
                    Initialize a new pipeline sequence to establish a connection with the creative matrix.
                </p>
                
                <div className="mt-8 flex gap-2">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full animate-ping"></div>
                    <div className="w-1.5 h-1.5 bg-accent/50 rounded-full"></div>
                    <div className="w-1.5 h-1.5 bg-accent/20 rounded-full"></div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-accent text-xl">folder_managed</span>
                    <h1 className="text-2xl font-black text-white tracking-widest uppercase">Project_Nodes</h1>
                    <span className="bg-white/10 text-accent text-[10px] font-bold px-2 py-0.5 ml-2 mt-1 border border-white/5">
                        {filtered.length} ACTIVE
                    </span>
                </div>
                
                <div className="flex bg-panel border border-border-muted p-1 rounded-none">
                    <button className="px-3 py-1 bg-white/10 text-white text-[10px] font-bold uppercase">Grid</button>
                    <button className="px-3 py-1 text-slate-500 hover:text-white text-[10px] font-bold uppercase transition-colors">List</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map((p, i) => (
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

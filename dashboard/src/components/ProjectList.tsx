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
                className="flex flex-col items-center justify-center p-20 mt-10 bg-[#1c2025] border border-[#2A3442] relative overflow-hidden h-[60vh]" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
            >
                <div className="absolute top-0 left-0 w-1 h-1 bg-[#D7FF2F]"></div>
                <div className="absolute bottom-0 right-0 w-1 h-1 bg-[#D7FF2F]"></div>
                
                <span className="material-symbols-outlined text-6xl text-gray-600 mb-6">
                    dashboard
                </span>
                
                <h3 className="text-2xl font-headline font-bold text-white uppercase mb-4 tracking-tight">NO ACTIVE NODES</h3>
                <p className="font-mono text-xs text-gray-500 max-w-md text-center uppercase tracking-widest leading-relaxed">
                    Initialize a new pipeline sequence to establish a connection with the creative matrix.
                </p>
                
                <div className="mt-10 flex gap-2">
                    <div className="w-1.5 h-1.5 bg-[#D7FF2F] animate-pulse"></div>
                    <div className="w-1.5 h-1.5 bg-[#D7FF2F]/40"></div>
                    <div className="w-1.5 h-1.5 bg-[#D7FF2F]/20"></div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-between items-end mb-12">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 bg-[#D7FF2F]"></span>
                        <p className="font-mono text-xs text-[#D7FF2F] tracking-[0.2em] uppercase">System_State: Operational</p>
                    </div>
                    <h1 className="font-headline font-bold text-5xl tracking-tight text-white uppercase">Overview</h1>
                </div>
                <div className="flex items-center gap-4 font-mono text-[10px] text-gray-500">
                    <span className="border border-[#2A3442] px-2 py-1">{filtered.length} ACTIVE NODES</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((p, i) => (
                    <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.2 }}
                    >
                        <ProjectCard pipeline={p} onClick={() => onSelect(p.id)} onRetry={onRetry} />
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

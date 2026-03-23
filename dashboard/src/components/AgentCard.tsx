import { motion } from 'framer-motion';
import type { PipelineAgent } from '../api/client';

export function AgentCard({ agent }: { agent: PipelineAgent }) {
    const isActive = agent.status === 'active';
    const isDone = agent.status === 'done';
    const isError = agent.status === 'error';
    
    const statusColor = isActive ? 'text-primary' : (isDone ? 'text-accent' : (isError ? 'text-red-500' : 'text-slate-500'));
    const dotColor = isActive ? 'bg-primary' : (isDone ? 'bg-accent' : (isError ? 'bg-red-500' : 'bg-slate-500'));

    return (
        <motion.div
            className="group grid grid-cols-12 py-3 px-4 items-center bg-panel/30 border border-border-muted hover:bg-white/[0.02] transition-colors relative overflow-hidden"
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
        >
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>}
            {isError && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>}
            
            <div className="col-span-1 flex justify-center items-center">
                <span className="text-base">{agent.emoji}</span>
            </div>

            <div className="col-span-4">
                <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">Role</p>
                <h3 className="text-[11px] font-bold text-white uppercase tracking-widest truncate pr-2">{agent.role}</h3>
            </div>
            
            <div className="col-span-4">
                <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">Action</p>
                <span className="font-mono text-[10px] text-slate-400 block truncate pr-2" title={agent.currentAction}>
                    {agent.currentAction || 'AWAITING_INSTRUCTIONS'}
                    {isActive && (
                        <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>_</motion.span>
                    )}
                </span>
            </div>

            <div className="col-span-3 flex justify-end items-center">
                <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${isActive ? 'animate-pulse' : ''}`}></span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${statusColor}`}>{agent.status}</span>
                </div>
            </div>
        </motion.div>
    );
}

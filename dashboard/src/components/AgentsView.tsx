import { motion } from 'framer-motion';
import type { Pipeline } from '../api/client';

export function AgentsView({ pipelines }: { pipelines: Pipeline[] }) {
    const allAgents = pipelines.flatMap(p =>
        (p.agents || []).filter(Boolean).map(a => ({ ...a, pipelineName: p.name, pipelinePhase: p.phase }))
    );

    const byRole = allAgents.reduce((acc, a) => {
        if (!acc[a.role]) acc[a.role] = [];
        acc[a.role].push(a);
        return acc;
    }, {} as Record<string, typeof allAgents>);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-3 mb-8">
                <span className="material-symbols-outlined text-accent text-xl">account_tree</span>
                <h1 className="text-2xl font-black text-white tracking-widest uppercase">Operative_Nodes</h1>
                <span className="bg-white/10 text-accent text-[10px] font-bold px-2 py-0.5 ml-2 mt-1 border border-white/5">
                    {allAgents.length} ACTIVE
                </span>
            </div>

            {Object.entries(byRole).map(([role, agents]) => (
                <div key={role} className="mb-8">
                    <div className="flex items-center gap-2 mb-4 border-b border-border-muted pb-2">
                        <span className="text-lg">{agents[0]?.emoji}</span>
                        <h3 className="text-sm font-black text-accent tracking-widest uppercase">{role}</h3>
                        <span className="text-[10px] text-slate-500 font-bold ml-2">[{agents.length} INSTANCES]</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {agents.map((agent, i) => {
                            const isStatusActive = agent.status === 'active';
                            const isStatusDone = agent.status === 'done';
                            const isStatusError = agent.status === 'error';
                            
                            const borderColor = isStatusActive ? 'border-primary/50' : (isStatusDone ? 'border-accent/30' : (isStatusError ? 'border-red-500/50' : 'border-border-muted'));
                            const statusColor = isStatusActive ? 'text-primary' : (isStatusDone ? 'text-accent' : (isStatusError ? 'text-red-500' : 'text-slate-500'));
                            const statusBg = isStatusActive ? 'bg-primary/10' : (isStatusDone ? 'bg-accent/10' : (isStatusError ? 'bg-red-500/10' : 'bg-white/5'));

                            return (
                                <motion.div
                                    key={`${agent.pipelineName}-${i}`}
                                    className={`bg-panel border ${borderColor} p-4 flex flex-col relative overflow-hidden`}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    {isStatusActive && <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full blur-xl -mr-6 -mt-6"></div>}
                                    
                                    <div className="flex justify-between items-start mb-3 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{agent.emoji}</span>
                                            <span className="text-xs font-bold text-white uppercase tracking-widest">{agent.role}</span>
                                        </div>
                                        <span className={`${statusBg} ${statusColor} text-[9px] font-black px-2 py-0.5 uppercase tracking-widest flex items-center gap-1`}>
                                            {isStatusActive && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-ping mr-1"></span>}
                                            {agent.status}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mb-1 monospaced truncate" title={agent.pipelineName}>
                                        NODE: {(agent.pipelineName || 'unknown').replace(/\s+/g, '_').toUpperCase()}
                                    </div>
                                    <div className="text-xs text-slate-300 mt-2 font-medium line-clamp-2">
                                        {agent.currentAction || agent.pipelinePhase}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            ))}
            
            {allAgents.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 border border-border-muted bg-panel/30">
                    <span className="material-symbols-outlined text-4xl text-slate-700 mb-4">robot_2</span>
                    <p className="text-slate-400 text-xs tracking-widest uppercase">No Active Operatives Detected</p>
                </div>
            )}
        </motion.div>
    );
}

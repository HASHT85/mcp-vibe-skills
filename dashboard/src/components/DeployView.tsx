import { motion } from 'framer-motion';
import type { Pipeline } from '../api/client';

export function DeployView({ pipelines }: { pipelines: Pipeline[] }) {
    const deployed = pipelines.filter(p => p.dokploy);
    const withGithub = pipelines.filter(p => p.github);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-3 mb-8">
                <span className="material-symbols-outlined text-accent text-xl">rocket_launch</span>
                <h1 className="text-2xl font-black text-white tracking-widest uppercase">Deploy_Nodes</h1>
                <span className="bg-white/10 text-accent text-[10px] font-bold px-2 py-0.5 ml-2 mt-1 border border-white/5">
                    {deployed.length} ACTIVE
                </span>
            </div>

            {deployed.length === 0 && withGithub.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 border border-border-muted bg-panel/30">
                    <span className="material-symbols-outlined text-4xl text-slate-700 mb-4">cloud_off</span>
                    <p className="text-slate-400 text-xs tracking-widest uppercase">No active deployments. Projects auto-deploy via Dokploy.</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {withGithub.map(p => {
                    const isCompleted = p.phase === 'COMPLETED';
                    const isFailed = p.phase === 'FAILED';
                    const isRunning = !isCompleted && !isFailed;
                    
                    const borderColor = isCompleted ? 'border-accent/50' : (isFailed ? 'border-red-500/50' : 'border-primary/50');
                    const badgeColorClass = isCompleted ? 'bg-accent text-black' : (isFailed ? 'bg-red-500 text-white' : 'bg-primary text-white');

                    return (
                        <div key={p.id} className={`bg-panel border ${borderColor} p-4 relative overflow-hidden flex flex-col`}>
                            {isRunning && <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full blur-xl -mr-6 -mt-6"></div>}
                            
                            <div className="flex justify-between items-start mb-4 relative z-10 border-b border-border-muted pb-3">
                                <span className="text-lg font-black text-white tracking-widest uppercase truncate pr-2">
                                    {p.name.replace(/\s+/g, '_').toLowerCase()}
                                </span>
                                <span className={`${badgeColorClass} text-[9px] font-black px-2 py-0.5 uppercase tracking-widest shrink-0`}>
                                    {p.phase}
                                </span>
                            </div>
                            
                            <div className="flex flex-col gap-3 font-medium text-xs">
                                {p.github && (
                                    <div className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                                        <span className=" материала-symbols-outlined text-[14px]">code_blocks</span>
                                        <a href={p.github.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                                            {p.github.owner}/{p.github.repo}
                                        </a>
                                        <span className="material-symbols-outlined text-[12px] ml-auto">open_in_new</span>
                                    </div>
                                )}
                                {p.dokploy && (
                                    <div className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                                        <span className="material-symbols-outlined text-[14px]">dns</span>
                                        <span className="monospaced tracking-tight text-[10px]">DOKPLOY: {p.dokploy.applicationId?.slice(0, 12)}...</span>
                                        {p.dokploy.url && (
                                            <a href={p.dokploy.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-accent">
                                                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                            </a>
                                        )}
                                    </div>
                                )}
                                {!p.dokploy && (
                                    <div className="flex items-center gap-2 text-slate-500">
                                        <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
                                        <span>AWAITING DEPLOYMENT PROTOCOL...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
}

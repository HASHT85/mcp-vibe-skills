import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listContainers, stopContainer, startContainer, restartContainer, deleteContainer, getContainerLogs } from '../api/client';
import type { Container, Pipeline } from '../api/client';

// Extract pipeline ID from container name (format: veist-{pipelineId}-app)
function getPipelineForContainer(name: string, pipelines: Pipeline[]): Pipeline | undefined {
    const match = name.match(/^veist-([a-f0-9]+)-/);
    if (!match) return undefined;
    const pipelineId = match[1];
    return pipelines.find(p => p.id && p.id.startsWith(pipelineId));
}

// Extract deployed URL from pipeline events (looks for https://*.hach.dev URLs)
function getDeployedUrl(pipeline: Pipeline | undefined): string | null {
    if (!pipeline) return null;
    // Check dokploy.url first
    if (pipeline.dokploy?.url) return pipeline.dokploy.url;
    // Search events for deployed URL
    for (const ev of [...pipeline.events].reverse()) {
        const msg = ev.action || '';
        const urlMatch = msg.match(/https?:\/\/[a-z0-9-]+\.hach\.dev/i);
        if (urlMatch) return urlMatch[0];
    }
    // Derive from pipeline name/id → subdomain pattern
    const pipelineId = pipeline.id?.slice(0, 8);
    if (pipelineId) return `https://${pipelineId}.hach.dev`;
    return null;
}

export function ContainersView({ pipelines = [] }: { pipelines?: Pipeline[] }) {
    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [logsModal, setLogsModal] = useState<{ name: string; logs: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [showHidden, setShowHidden] = useState(false);
    const [hiddenNames, setHiddenNames] = useState<Set<string>>(() => {
        try { return new Set(JSON.parse(localStorage.getItem('veist_hidden_containers') || '[]')); } catch { return new Set(); }
    });

    const toggleHidden = (name: string) => {
        setHiddenNames(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            localStorage.setItem('veist_hidden_containers', JSON.stringify([...next]));
            return next;
        });
    };

    const visibleContainers = showHidden ? containers : containers.filter(c => !hiddenNames.has(c.name));
    const hiddenCount = containers.filter(c => hiddenNames.has(c.name)).length;

    const load = useCallback(async () => {
        try {
            const data = await listContainers();
            setContainers(data.containers || []);
        } catch (err) {
            console.warn('Failed to load containers:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, [load]);

    const doAction = async (name: string, action: () => Promise<any>) => {
        setActionLoading(name);
        try {
            await action();
            await load();
        } catch (err: any) {
            alert(`SYS_ERR: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const showLogs = async (name: string) => {
        try {
            const data = await getContainerLogs(name, 150);
            setLogsModal({ name, logs: data.logs });
        } catch (err: any) {
            setLogsModal({ name, logs: `SYS_ERR: ${err.message}` });
        }
    };

    const handleDelete = async (name: string) => {
        setConfirmDelete(null);
        await doAction(name, () => deleteContainer(name));
    };

    return (
        <motion.div
            className="flex flex-col"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
        >
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-accent text-2xl">view_in_ar</span>
                    <h2 className="text-2xl font-black text-white tracking-widest uppercase">Docker_Nodes</h2>
                    {!loading && containers.length > 0 && (
                        <span className="bg-white/10 text-accent text-[10px] font-bold px-2 py-0.5 ml-2 mt-1 border border-white/5">
                            {visibleContainers.filter(c => c.state === 'running').length} ACTIVE
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {hiddenCount > 0 && (
                        <button
                            className={`text-[10px] font-bold tracking-widest uppercase px-3 py-2 flex items-center gap-1.5 transition-colors border ${
                                showHidden
                                    ? 'bg-accent/10 text-accent border-accent/30'
                                    : 'bg-panel text-slate-400 border-border-muted hover:text-white hover:border-slate-500'
                            }`}
                            onClick={() => setShowHidden(!showHidden)}
                            title={showHidden ? 'Hide masked containers' : 'Show masked containers'}
                        >
                            <span className="material-symbols-outlined text-[14px]">{showHidden ? 'visibility' : 'visibility_off'}</span>
                            {hiddenCount} MASKED
                        </button>
                    )}
                    <button 
                        className="text-slate-400 hover:text-white transition-colors bg-panel border border-border-muted p-2 flex items-center justify-center hover:border-slate-500" 
                        onClick={load} 
                        title="Refresh Node List"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin text-accent' : ''}`}>sync</span>
                    </button>
                </div>
            </div>

            {loading && containers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border border-border-muted bg-panel/30">
                    <span className="material-symbols-outlined text-4xl text-accent animate-spin mb-4">sync</span>
                    <p className="text-slate-400 text-xs tracking-widest uppercase">Initializing Scanner...</p>
                </div>
            ) : containers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border border-border-muted bg-panel/30">
                    <span className="material-symbols-outlined text-4xl text-slate-700 mb-4">hexagon</span>
                    <p className="text-white text-sm font-bold tracking-widest uppercase mb-2">No Active Nodes</p>
                    <p className="text-slate-500 text-xs text-center max-w-sm">Launch a pipeline sequence to allocate container resources.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {visibleContainers.map((c, i) => {
                        const isRunning = c.state === 'running';
                        const isHidden = hiddenNames.has(c.name);
                        const dotColor = isRunning ? 'bg-primary' : 'bg-red-500';
                        const borderColor = isRunning ? 'border-primary/30 hover:border-primary' : 'border-red-500/30 hover:border-red-500';
                        const bgClass = isRunning ? 'bg-panel/80' : 'bg-red-950/20';
                        
                        return (
                            <motion.div 
                                key={c.id} 
                                className={`border ${borderColor} ${bgClass} transition-colors p-4 flex flex-col relative overflow-hidden ${isHidden ? 'opacity-40' : ''}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                            >
                                {isRunning && <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full blur-xl -mr-6 -mt-6"></div>}
                                
                                <div className="flex justify-between items-start mb-3 border-b border-border-muted/50 pb-2 relative z-10">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${isRunning ? 'animate-pulse shadow-[0_0_5px_currentColor]' : ''}`}></div>
                                        <span className="text-white font-bold text-sm tracking-wide truncate">{c.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 ml-2 shrink-0">
                                        {(() => {
                                            const linkedPipeline = getPipelineForContainer(c.name, pipelines);
                                            const siteUrl = c.url || getDeployedUrl(linkedPipeline);
                                            return (
                                                <>
                                                    {linkedPipeline?.github?.url && (
                                                        <a href={linkedPipeline.github.url} target="_blank" rel="noopener noreferrer" 
                                                           className="text-slate-400 hover:text-white transition-colors" title={`GitHub: ${linkedPipeline.github.url}`}>
                                                            <span className="material-symbols-outlined text-[16px]">code</span>
                                                        </a>
                                                    )}
                                                    {siteUrl && (
                                                        <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-accent transition-colors" title={siteUrl}>
                                                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                                        </a>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1 mb-4">
                                    <span className="text-[10px] text-accent monospaced truncate flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">code</span> {c.image}
                                    </span>
                                    <span className="text-[10px] text-slate-400 monospaced flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[12px]">info</span> {c.status}
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-2 mt-auto relative z-10">
                                    {isRunning ? (
                                        <>
                                            <button
                                                className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                                onClick={() => doAction(c.name, () => stopContainer(c.name))}
                                                disabled={actionLoading === c.name}
                                                title="Stop Node"
                                            >
                                                <span className="material-symbols-outlined text-[12px]">stop</span> STOP
                                            </button>
                                            <button
                                                className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                                onClick={() => doAction(c.name, () => restartContainer(c.name))}
                                                disabled={actionLoading === c.name}
                                                title="Restart Node"
                                            >
                                                <span className="material-symbols-outlined text-[12px]">restart_alt</span> RESTART
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                            onClick={() => doAction(c.name, () => startContainer(c.name))}
                                            disabled={actionLoading === c.name}
                                            title="Start Node"
                                        >
                                            <span className="material-symbols-outlined text-[12px]">play_arrow</span> START
                                        </button>
                                    )}
                                    <button
                                        className="bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600/50 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors ml-auto"
                                        onClick={() => showLogs(c.name)}
                                        title="View Logs"
                                    >
                                        <span className="material-symbols-outlined text-[12px]">terminal</span> LOGS
                                    </button>
                                    <button
                                        className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                        onClick={() => setConfirmDelete(c.name)}
                                        disabled={actionLoading === c.name}
                                        title="Purge Node"
                                    >
                                        <span className="material-symbols-outlined text-[12px]">delete</span>
                                    </button>
                                    <button
                                        className={`text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors border ${
                                            isHidden
                                                ? 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20'
                                                : 'bg-white/5 text-slate-400 border-slate-600/50 hover:bg-white/10 hover:text-white'
                                        }`}
                                        onClick={() => toggleHidden(c.name)}
                                        title={isHidden ? 'Unmask container' : 'Mask container'}
                                    >
                                        <span className="material-symbols-outlined text-[12px]">{isHidden ? 'visibility' : 'visibility_off'}</span>
                                        {isHidden ? 'SHOW' : 'MASK'}
                                    </button>
                                </div>

                                {actionLoading === c.name && (
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20">
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="material-symbols-outlined text-accent animate-spin mb-2">sync</span>
                                            <span className="text-[10px] text-accent font-bold uppercase tracking-widest monospaced">Processing...</span>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Logs Modal */}
            <AnimatePresence>
                {logsModal && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setLogsModal(null)}
                    >
                        <motion.div
                            className="bg-panel border border-border-muted w-full max-w-4xl h-[80vh] flex flex-col scanline shadow-2xl shadow-accent/5 origin-center"
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-4 border-b border-border-muted bg-background-dark">
                                <h3 className="text-sm font-black tracking-widest text-slate-300 uppercase flex items-center gap-2">
                                    <span className="material-symbols-outlined text-accent">terminal</span> 
                                    NODE_LOGS // {logsModal.name}
                                </h3>
                                <button className="text-slate-500 hover:text-white transition-colors" onClick={() => setLogsModal(null)}>
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="flex-1 bg-black p-4 overflow-auto border-y border-transparent">
                                <pre className="text-xs text-slate-300 monospaced leading-relaxed whitespace-pre-wrap break-all">
                                    {logsModal.logs}
                                </pre>
                            </div>
                            <div className="p-4 border-t border-border-muted bg-background-dark flex justify-end">
                                <button
                                    className="bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[10px] font-bold px-4 py-2 uppercase tracking-widest flex items-center gap-2 transition-colors"
                                    onClick={() => showLogs(logsModal.name)}
                                >
                                    <span className="material-symbols-outlined text-[14px]">sync</span> REFRESH_STREAM
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Confirm Delete */}
            <AnimatePresence>
                {confirmDelete && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setConfirmDelete(null)}
                    >
                        <motion.div
                            className="bg-red-950/20 border border-red-500/50 w-full max-w-md p-6 flex flex-col scanline shadow-[0_0_30px_rgba(239,68,68,0.2)] origin-center"
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4 text-red-500 border-b border-red-500/20 pb-4">
                                <span className="material-symbols-outlined text-3xl">warning</span>
                                <h3 className="text-lg font-black tracking-widest uppercase">Critical_Action</h3>
                            </div>
                            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                                You are about to PERMANENTLY purge node <strong className="text-white bg-white/10 px-1 py-0.5 mx-1 font-bold monospaced">{confirmDelete}</strong> and its underlying image slice. The matrix will lose all associated data.
                            </p>
                            <div className="flex gap-4 justify-end">
                                <button
                                    className="text-[10px] font-bold tracking-widest text-slate-400 hover:text-white uppercase px-4 py-2"
                                    onClick={() => setConfirmDelete(null)}
                                >
                                    ABORT
                                </button>
                                <button
                                    className="bg-red-600 text-white font-black text-xs px-6 py-2 tracking-widest uppercase hover:bg-red-500 flex items-center gap-2"
                                    onClick={() => handleDelete(confirmDelete!)}
                                >
                                    <span className="material-symbols-outlined text-[16px]">priority_high</span> CONFIRM_PURGE
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

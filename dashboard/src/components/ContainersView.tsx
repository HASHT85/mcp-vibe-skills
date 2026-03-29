import { useState, useEffect, useCallback, useMemo } from 'react';
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
    if (pipeline.dokploy?.url) return pipeline.dokploy.url;
    for (const ev of [...pipeline.events].reverse()) {
        const msg = ev.action || '';
        const urlMatch = msg.match(/https?:\/\/[a-z0-9-]+\.hach\.dev/i);
        if (urlMatch) return urlMatch[0];
    }
    const pipelineId = pipeline.id?.slice(0, 8);
    if (pipelineId) return `https://${pipelineId}.hach.dev`;
    return null;
}

// ─── Group containers into "projects" by Docker Compose project name ───
// Docker Compose names containers as: {project}-{service}-{N}
// Standalone containers (no dash-number suffix) are their own project.
type ProjectGroup = {
    name: string;
    containers: Container[];
    status: 'running' | 'partial' | 'stopped';
    pipeline?: Pipeline;
    url?: string | null;
};

function groupByProject(containers: Container[], pipelines: Pipeline[]): ProjectGroup[] {
    const groups = new Map<string, Container[]>();

    for (const c of containers) {
        // Try to extract Docker Compose project name
        // Patterns: project-service-N, project-service
        // Known standalone: names with no compose pattern (e.g. "veist", "veist-dashboard")
        const composeMatch = c.name.match(/^(.+?)-([a-z][a-z0-9_]*)-(\d+)$/);
        const projectName = composeMatch ? composeMatch[1] : c.name;

        if (!groups.has(projectName)) {
            groups.set(projectName, []);
        }
        groups.get(projectName)!.push(c);
    }

    // Merge standalone containers that share a prefix into their project group
    // e.g. "veist" and "veist-dashboard" should be in the same "veist" group
    const merged = new Map<string, Container[]>();
    const sortedKeys = [...groups.keys()].sort();

    for (const key of sortedKeys) {
        // Check if this key is a prefix match for an existing group
        let foundParent = false;
        for (const [existingKey] of merged) {
            if (key !== existingKey && key.startsWith(existingKey + '-') && !key.match(/-\d+$/)) {
                merged.get(existingKey)!.push(...groups.get(key)!);
                foundParent = true;
                break;
            }
        }
        if (!foundParent) {
            // Check if any existing key is a child of this key
            const children: string[] = [];
            for (const [existingKey] of merged) {
                if (existingKey.startsWith(key + '-') && !existingKey.match(/-\d+$/)) {
                    children.push(existingKey);
                }
            }
            if (children.length > 0) {
                const allContainers = [...groups.get(key)!];
                for (const child of children) {
                    allContainers.push(...merged.get(child)!);
                    merged.delete(child);
                }
                merged.set(key, allContainers);
            } else {
                merged.set(key, [...groups.get(key)!]);
            }
        }
    }

    return [...merged.entries()].map(([name, containers]) => {
        const runningCount = containers.filter(c => c.state === 'running').length;
        const status: ProjectGroup['status'] =
            runningCount === containers.length ? 'running' :
                runningCount > 0 ? 'partial' : 'stopped';

        // Find linked pipeline
        const pipeline = containers
            .map(c => getPipelineForContainer(c.name, pipelines))
            .find(Boolean);

        const url = containers.map(c => c.url).find(Boolean)
            || getDeployedUrl(pipeline);

        return { name, containers, status, pipeline, url };
    });
}

export function ContainersView({ pipelines = [] }: { pipelines?: Pipeline[] }) {
    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [logsModal, setLogsModal] = useState<{ name: string; logs: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [showHidden, setShowHidden] = useState(false);
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
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

    const toggleProject = (name: string) => {
        setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    const visibleContainers = showHidden ? containers : containers.filter(c => !hiddenNames.has(c.name));
    const hiddenCount = containers.filter(c => hiddenNames.has(c.name)).length;

    const projects = useMemo(() =>
        groupByProject(visibleContainers, pipelines),
        [visibleContainers, pipelines]
    );

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

    const totalRunning = containers.filter(c => c.state === 'running').length;

    const statusConfig = {
        running: { label: 'Running', dot: 'bg-primary', text: 'text-primary', border: 'border-primary/20' },
        partial: { label: 'Partial', dot: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500/20' },
        stopped: { label: 'Stopped', dot: 'bg-red-500', text: 'text-red-500', border: 'border-red-500/20' },
    };

    return (
        <motion.div
            className="flex flex-col"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
        >
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-accent text-2xl">deployed_code</span>
                    <h2 className="text-2xl font-black text-white tracking-widest uppercase">Docker Projects</h2>
                    {!loading && projects.length > 0 && (
                        <span className="bg-white/10 text-accent text-[10px] font-bold px-2 py-0.5 ml-2 mt-1 border border-white/5">
                            {projects.length} {projects.length === 1 ? 'PROJECT' : 'PROJECTS'}
                        </span>
                    )}
                    {!loading && totalRunning > 0 && (
                        <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 mt-1 border border-primary/20">
                            {totalRunning} RUNNING
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {hiddenCount > 0 && (
                        <button
                            className={`text-[10px] font-bold tracking-widest uppercase px-3 py-2 flex items-center gap-1.5 transition-colors border ${showHidden
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
                        title="Refresh"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin text-accent' : ''}`}>sync</span>
                    </button>
                </div>
            </div>

            {loading && containers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border border-border-muted bg-panel/30">
                    <span className="material-symbols-outlined text-4xl text-accent animate-spin mb-4">sync</span>
                    <p className="text-slate-400 text-xs tracking-widest uppercase">Scanning Docker Engine...</p>
                </div>
            ) : containers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border border-border-muted bg-panel/30">
                    <span className="material-symbols-outlined text-4xl text-slate-700 mb-4">deployed_code</span>
                    <p className="text-white text-sm font-bold tracking-widest uppercase mb-2">No Docker Projects</p>
                    <p className="text-slate-500 text-xs text-center max-w-sm">Launch a pipeline to deploy container resources.</p>
                </div>
            ) : (
                <div className="border border-border-muted bg-panel/40 overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-[1fr_140px_140px_200px] px-5 py-3 bg-background-dark border-b border-border-muted text-[10px] font-bold text-slate-500 tracking-widest uppercase">
                        <span>Project</span>
                        <span>Status</span>
                        <span>Access</span>
                        <span className="text-right">Actions</span>
                    </div>

                    {/* Project Rows */}
                    {projects.map((project, idx) => {
                        const isExpanded = expandedProjects.has(project.name);
                        const sc = statusConfig[project.status];
                        const isMulti = project.containers.length > 1;

                        return (
                            <motion.div
                                key={project.name}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.03 }}
                            >
                                {/* Project Row */}
                                <div
                                    className={`grid grid-cols-[1fr_140px_140px_200px] items-center px-5 py-3.5 border-b border-border-muted/50 transition-colors cursor-pointer hover:bg-white/[0.02] ${isExpanded ? 'bg-white/[0.03]' : ''}`}
                                    onClick={() => isMulti && toggleProject(project.name)}
                                >
                                    {/* Project Name */}
                                    <div className="flex items-center gap-3 min-w-0">
                                        {isMulti && (
                                            <motion.span
                                                className="material-symbols-outlined text-[18px] text-slate-500 shrink-0"
                                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                                transition={{ duration: 0.15 }}
                                            >
                                                chevron_right
                                            </motion.span>
                                        )}
                                        {!isMulti && <div className="w-[18px]" />}
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-white font-bold text-sm tracking-wide truncate">{project.name}</span>
                                            <span className="text-[10px] text-slate-500">
                                                {project.containers.length} {project.containers.length === 1 ? 'container' : 'containers'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${sc.dot} ${project.status === 'running' ? 'animate-pulse shadow-[0_0_4px_currentColor]' : ''}`}></div>
                                        <span className={`text-xs font-semibold ${sc.text}`}>{sc.label}</span>
                                    </div>

                                    {/* Access */}
                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                        {project.url && (
                                            <a href={project.url} target="_blank" rel="noopener noreferrer"
                                                className="text-accent hover:text-white text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                                Open
                                            </a>
                                        )}
                                        {project.pipeline?.github?.url && (
                                            <a href={project.pipeline.github.url} target="_blank" rel="noopener noreferrer"
                                                className="text-slate-400 hover:text-white transition-colors"
                                                title={`GitHub: ${project.pipeline.github.url}`}
                                            >
                                                <span className="material-symbols-outlined text-[14px]">code</span>
                                            </a>
                                        )}
                                        {!project.url && !project.pipeline?.github?.url && (
                                            <span className="text-slate-600 text-[10px]">—</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                                        {project.containers.length === 1 && (
                                            <>
                                                {project.containers[0].state === 'running' ? (
                                                    <>
                                                        <button
                                                            className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                                            onClick={() => doAction(project.containers[0].name, () => stopContainer(project.containers[0].name))}
                                                            disabled={actionLoading === project.containers[0].name}
                                                        >
                                                            <span className="material-symbols-outlined text-[11px]">stop</span>Stop
                                                        </button>
                                                        <button
                                                            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                                            onClick={() => doAction(project.containers[0].name, () => restartContainer(project.containers[0].name))}
                                                            disabled={actionLoading === project.containers[0].name}
                                                        >
                                                            <span className="material-symbols-outlined text-[11px]">restart_alt</span>Restart
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                                        onClick={() => doAction(project.containers[0].name, () => startContainer(project.containers[0].name))}
                                                        disabled={actionLoading === project.containers[0].name}
                                                    >
                                                        <span className="material-symbols-outlined text-[11px]">play_arrow</span>Start
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        <button
                                            className="bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600/50 text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                                            onClick={() => showLogs(project.containers[0].name)}
                                        >
                                            <span className="material-symbols-outlined text-[11px]">terminal</span>Logs
                                        </button>
                                        <button
                                            className={`text-[9px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors border ${hiddenNames.has(project.containers[0].name)
                                                ? 'bg-accent/10 text-accent border-accent/30'
                                                : 'bg-white/5 text-slate-400 border-slate-600/50 hover:bg-white/10'
                                                }`}
                                            onClick={() => {
                                                // Hide/show all containers in the project
                                                for (const c of project.containers) toggleHidden(c.name);
                                            }}
                                            title={hiddenNames.has(project.containers[0].name) ? 'Show project' : 'Hide project'}
                                        >
                                            <span className="material-symbols-outlined text-[11px]">{hiddenNames.has(project.containers[0].name) ? 'visibility' : 'visibility_off'}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Containers (for multi-container projects) */}
                                <AnimatePresence>
                                    {isExpanded && isMulti && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            {project.containers.map(c => {
                                                const isRunning = c.state === 'running';
                                                const isHidden = hiddenNames.has(c.name);
                                                return (
                                                    <div
                                                        key={c.id}
                                                        className={`grid grid-cols-[1fr_140px_140px_200px] items-center px-5 py-2.5 border-b border-border-muted/30 bg-white/[0.01] ${isHidden ? 'opacity-40' : ''}`}
                                                    >
                                                        {/* Container Name */}
                                                        <div className="flex items-center gap-3 min-w-0 pl-10">
                                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? 'bg-primary' : 'bg-red-500'}`}></div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-slate-300 text-xs font-medium truncate">{c.name}</span>
                                                                <span className="text-[9px] text-slate-600 monospaced truncate">{c.image}</span>
                                                            </div>
                                                        </div>

                                                        {/* Status */}
                                                        <span className={`text-[10px] monospaced ${isRunning ? 'text-primary/70' : 'text-red-400/70'}`}>
                                                            {c.status}
                                                        </span>

                                                        {/* Spacer */}
                                                        <div></div>

                                                        {/* Container Actions */}
                                                        <div className="flex items-center gap-1.5 justify-end">
                                                            {isRunning ? (
                                                                <>
                                                                    <button
                                                                        className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-widest flex items-center gap-0.5 transition-colors"
                                                                        onClick={() => doAction(c.name, () => stopContainer(c.name))}
                                                                        disabled={actionLoading === c.name}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[10px]">stop</span>Stop
                                                                    </button>
                                                                    <button
                                                                        className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-widest flex items-center gap-0.5 transition-colors"
                                                                        onClick={() => doAction(c.name, () => restartContainer(c.name))}
                                                                        disabled={actionLoading === c.name}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[10px]">restart_alt</span>Restart
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-widest flex items-center gap-0.5 transition-colors"
                                                                    onClick={() => doAction(c.name, () => startContainer(c.name))}
                                                                    disabled={actionLoading === c.name}
                                                                >
                                                                    <span className="material-symbols-outlined text-[10px]">play_arrow</span>Start
                                                                </button>
                                                            )}
                                                            <button
                                                                className="bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 border border-slate-600/50 text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-widest flex items-center gap-0.5 transition-colors"
                                                                onClick={() => showLogs(c.name)}
                                                            >
                                                                <span className="material-symbols-outlined text-[10px]">terminal</span>Logs
                                                            </button>
                                                            <button
                                                                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-widest flex items-center gap-0.5 transition-colors"
                                                                onClick={() => setConfirmDelete(c.name)}
                                                                disabled={actionLoading === c.name}
                                                            >
                                                                <span className="material-symbols-outlined text-[10px]">delete</span>
                                                            </button>
                                                            <button
                                                                className={`text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-widest flex items-center gap-0.5 transition-colors border ${isHidden
                                                                    ? 'bg-accent/10 text-accent border-accent/30'
                                                                    : 'bg-white/5 text-slate-400 border-slate-600/50 hover:bg-white/10'
                                                                    }`}
                                                                onClick={() => toggleHidden(c.name)}
                                                            >
                                                                <span className="material-symbols-outlined text-[10px]">{isHidden ? 'visibility' : 'visibility_off'}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
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
                                    LOGS // {logsModal.name}
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
                                    <span className="material-symbols-outlined text-[14px]">sync</span> REFRESH
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
                                <h3 className="text-lg font-black tracking-widest uppercase">Purge Container</h3>
                            </div>
                            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                                Permanently remove <strong className="text-white bg-white/10 px-1 py-0.5 mx-1 font-bold monospaced">{confirmDelete}</strong> and its image.
                            </p>
                            <div className="flex gap-4 justify-end">
                                <button
                                    className="text-[10px] font-bold tracking-widest text-slate-400 hover:text-white uppercase px-4 py-2"
                                    onClick={() => setConfirmDelete(null)}
                                >
                                    CANCEL
                                </button>
                                <button
                                    className="bg-red-600 text-white font-black text-xs px-6 py-2 tracking-widest uppercase hover:bg-red-500 flex items-center gap-2"
                                    onClick={() => handleDelete(confirmDelete!)}
                                >
                                    <span className="material-symbols-outlined text-[16px]">delete_forever</span> CONFIRM
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

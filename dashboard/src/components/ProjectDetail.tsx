import { useState } from 'react';
import { motion } from 'framer-motion';
import { killPipeline, deletePipeline, type Pipeline } from '../api/client';
import { Terminal } from './Terminal';
import { ProjectNodeMap } from './ProjectNodeMap';
import { formatTokenCount } from '../utils';

interface ProjectDetailProps {
    pipeline: Pipeline;
    onBack: () => void;
    onRefresh: () => void;
}

export function ProjectDetail({ pipeline: p, onBack, onRefresh }: ProjectDetailProps) {
    const handleKill = async () => {
        if (confirm(`FORCE_STOP sequence initiated for Node [${p.name}]. Confirm termination?`)) {
            await killPipeline(p.id);
            onRefresh();
        }
    };

    const handleDelete = async () => {
        if (confirm(`CRITICAL: Purge ALL data for Node [${p.name}]? This action is irreversible.`)) {
            try {
                // Delete via pipeline route
                await deletePipeline(p.id);
                onBack();
                onRefresh();
            } catch (err: any) {
                // Try projects route as fallback
                try {
                    const { deleteProject } = await import('../api/client');
                    await deleteProject(p.id);
                    onBack();
                    onRefresh();
                } catch (err2: any) {
                    alert(`DELETE_FAILED: ${err2.message || err.message}`);
                }
            }
        }
    };

    const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);
    const isCompleted = p.phase === 'COMPLETED';
    const isFailed = p.phase === 'FAILED';
    const isRunning = !isCompleted && !isFailed;
    const progressColorClass = isCompleted ? 'bg-accent' : (isFailed ? 'bg-red-500' : 'bg-primary');
    const badgeColorClass = isCompleted ? 'bg-accent text-black' : (isFailed ? 'bg-red-500 text-white' : 'bg-primary text-white');

    const getTypeIcon = () => {
        if (p.projectType === 'spa' || p.projectType === 'static') return 'language';
        if (p.projectType?.includes('worker')) return 'memory';
        return 'database';
    };

    return (
        <motion.div
            className="flex flex-col gap-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
        >
            {/* Header Area */}
            <div className="bg-panel border border-border-muted p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                
                <div className="flex items-start gap-4 mb-6">
                    <button 
                        onClick={onBack}
                        className="text-slate-400 hover:text-white hover:bg-white/5 p-2 rounded transition-colors mt-1"
                    >
                        <span className="material-symbols-outlined">arrow_back_ios_new</span>
                    </button>
                    
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-symbols-outlined text-accent text-3xl">
                                {getTypeIcon()}
                            </span>
                            <h2 className="text-3xl font-black text-white tracking-widest uppercase">
                                {(p.name || 'unnamed').replace(/\s+/g, '_').toLowerCase()}
                            </h2>
                            <span className={`${badgeColorClass} text-[10px] font-black px-3 py-1 tracking-widest uppercase ml-4`}>
                                {p.phase}
                            </span>
                        </div>
                        <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
                            {p.description}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 relative z-10">
                        {!['COMPLETED', 'FAILED'].includes(p.phase) && (
                            <button
                                onClick={handleKill}
                                className="border border-red-500/50 bg-red-500/10 text-red-500 font-bold text-[10px] px-4 py-2 hover:bg-red-500/20 uppercase flex items-center gap-2"
                                title="Force Stop Pipeline"
                            >
                                <span className="material-symbols-outlined text-[16px]">cancel</span> STOP
                            </button>
                        )}
                        <button 
                            onClick={handleDelete}
                            className="border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/30 hover:text-red-300 font-bold text-[10px] px-4 py-2 uppercase flex items-center gap-2 transition-colors"
                            title="Purge Node"
                        >
                            <span className="material-symbols-outlined text-[16px]">delete_forever</span> DELETE
                        </button>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1 h-1.5 bg-background-dark overflow-hidden">
                        <div className={`h-full ${progressColorClass} transition-all duration-1000 shadow-[0_0_10px_currentcolor]`} style={{ width: `${p.progress}%` }}></div>
                    </div>
                    <span className={`text-xs font-bold monospaced ${isCompleted ? 'text-accent' : 'text-primary'}`}>
                        {p.progress}%
                    </span>
                </div>

                {/* Meta Bar */}
                <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold tracking-widest uppercase text-slate-500 monospaced bg-background-dark/50 p-3 border border-border-muted">
                    {p.github && (
                        <div className="flex items-center gap-2 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-[14px]">code_blocks</span>
                            <a href={p.github.url} target="_blank" rel="noopener noreferrer">
                                {p.github.owner}/{p.github.repo}
                            </a>
                        </div>
                    )}
                    {p.dokploy?.url && (
                        <div className="flex items-center gap-2 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            <a href={p.dokploy.url} target="_blank" rel="noopener noreferrer">
                                {p.dokploy.url}
                            </a>
                        </div>
                    )}
                    {p.dokploy && !p.dokploy.url && (
                        <div className="flex items-center gap-2" style={{ color: p.projectType?.includes('worker') ? 'var(--color-primary)' : 'inherit' }}>
                            <span className="material-symbols-outlined text-[14px]">{p.projectType?.includes('worker') ? 'memory' : 'rocket_launch'}</span>
                            <span>{p.projectType?.includes('worker') ? 'BACKGROUND_DAEMON (NO_URL)' : `DOKPLOY: ${p.dokploy.applicationId?.slice(0, 8)}...`}</span>
                        </div>
                    )}
                    {totalTokens > 0 && (
                        <div className="flex items-center gap-2 ml-auto text-accent">
                            <span className="material-symbols-outlined text-[14px]">toll</span>
                            {formatTokenCount(p.tokenUsage?.inputTokens || 0)} IN // {formatTokenCount(p.tokenUsage?.outputTokens || 0)} OUT
                            <span className="opacity-50">[{formatTokenCount(totalTokens)} TOT]</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Layout */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 bg-slate-500 mr-2 rounded-none"></span>
                    <h3 className="text-sm font-black text-slate-400 tracking-widest uppercase">System_Console</h3>
                </div>
                <div className="bg-black border border-border-muted border-l-4 border-l-slate-700 min-h-[250px] max-h-[350px] overflow-hidden">
                    <Terminal events={p.events || []} />
                </div>

                <div className="w-full mt-4">
                    <ProjectNodeMap 
                        topology={p.topology} 
                        agents={p.agents || []} 
                        events={p.events || []} 
                    />
                </div>
            </div>
        </motion.div>
    );
}

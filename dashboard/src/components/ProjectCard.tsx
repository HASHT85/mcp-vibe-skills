import type { Pipeline } from '../api/client';
import { formatTokenCount } from '../utils';

interface ProjectCardProps {
    pipeline: Pipeline;
    onClick: () => void;
    onRetry?: (id: string) => void;
}

export function ProjectCard({ pipeline: p, onClick, onRetry }: ProjectCardProps) {
    const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);

    const isCompleted = p.phase === 'COMPLETED';
    const isFailed = p.phase === 'FAILED';
    const isRunning = !isCompleted && !isFailed;
    
    // Status-specific colors
    let borderColor = 'border-[#2A3442]';
    let statusBg = 'bg-[#D7FF2F]/5';
    let statusText = 'text-[#D7FF2F]';
    let statusBorder = 'border-[#D7FF2F]/20';
    let progressBar = 'bg-[#D7FF2F]';
    let accentText = 'text-[#D7FF2F]';
    let badgeLabel = p.phase || 'STANDBY';
    
    if (isFailed) {
        borderColor = 'border-red-500/30';
        statusBg = 'bg-red-500/5';
        statusText = 'text-red-400';
        statusBorder = 'border-red-500/20';
        progressBar = 'bg-red-400';
        accentText = 'text-red-400';
    } else if (isCompleted) {
        borderColor = 'border-emerald-500/30';
        statusBg = 'bg-emerald-500/5';
        statusText = 'text-emerald-400';
        statusBorder = 'border-emerald-500/20';
        progressBar = 'bg-emerald-400';
        accentText = 'text-emerald-400';
    }
    
    const formattedName = p.name ? p.name.replace(/\s+/g, '_').toUpperCase() : `NODE_${(p.id || '').substring(0,4)}`;

    return (
        <section
            className={`bg-[#1c2025] border ${borderColor} p-6 relative overflow-hidden flex flex-col justify-between h-64 cursor-pointer hover:border-[#D7FF2F]/30 transition-all group`}
            onClick={onClick}
        >
            {/* Corner tick */}
            <div className="absolute top-0 left-0 w-1 h-1 bg-[#D7FF2F]"></div>
            
            <div className="flex justify-between items-start mb-4 relative z-10">
                <h2 className="text-sm font-bold leading-tight font-headline tracking-tight truncate pr-2 text-on-surface group-hover:text-[#D7FF2F] transition-colors uppercase" title={formattedName}>
                    {formattedName}
                </h2>
                <span className={`${statusBg} ${statusText} ${statusBorder} border px-3 py-1 text-[10px] font-mono uppercase tracking-widest shrink-0`}>
                    {badgeLabel}
                </span>
            </div>
            
            <div className="space-y-4 relative z-10">
                <div className="text-[10px] text-gray-500 line-clamp-2 h-8 leading-relaxed mb-2 font-mono">
                    {p.description || "NO DATA STREAM"}
                </div>
                
                <div>
                    <div className="flex justify-between text-[10px] mb-1 font-mono">
                        <span className="text-gray-500 uppercase tracking-widest">Progress</span>
                        <span className={accentText}>{(p.progress || 0).toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-1 bg-[#262a30] overflow-hidden">
                        <div className={`${progressBar} h-full transition-all duration-500`} style={{ width: `${p.progress || 0}%` }}></div>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="border border-[#2A3442] p-2">
                        <span className="text-gray-600 block pb-1">TOKENS</span>
                        <span className={accentText}>{totalTokens > 0 ? formatTokenCount(totalTokens) : '0'}</span>
                    </div>
                    <div className="border border-[#2A3442] p-2">
                        <span className="text-gray-600 block pb-1">HASH ID</span>
                        <span className="text-on-surface">{(p.id || '').substring(0, 8)}</span>
                    </div>
                </div>

            {/* Progress — col 2 */}
            <div className="col-span-2 relative z-10">
                <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">Progress</p>
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 border border-white/20 p-[1px]">
                        <div className={`${barColor} h-full`} style={{ width: `${p.progress || 0}%` }}></div>
                    </div>
                    <span className={`text-[9px] font-bold ${statusColor}`}>{(p.progress || 0).toFixed(0)}%</span>
                </div>
            </div>

            {/* Tokens — col 2 */}
            <div className="col-span-2 relative z-10">
                <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">Tokens</p>
                <span className="font-mono text-[10px] text-white">
                    {totalTokens > 0 ? formatTokenCount(totalTokens) : '0'}
                </span>
            </div>

            {/* Status + Retry — col 2 */}
            <div className="col-span-2 flex justify-end items-center gap-2 relative z-10">
                {isFailed && onRetry && (
                    <button
                        className="w-full border border-[#D7FF2F]/30 bg-[#D7FF2F]/5 text-[#D7FF2F] font-bold text-[10px] px-3 py-2 hover:bg-[#D7FF2F]/10 uppercase flex items-center justify-center gap-2 transition-colors mt-1"
                        onClick={(e) => { e.stopPropagation(); onRetry(p.id); }}
                        title="Retry Pipeline"
                    >
                        <span className="material-symbols-outlined text-[12px]">replay</span> RETRY
                    </button>
                )}
                <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${isRunning ? 'animate-pulse' : ''}`}></span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${statusColor}`}>
                        {p.phase || 'STANDBY'}
                    </span>
                </div>
            </div>
        </section>
    );
}

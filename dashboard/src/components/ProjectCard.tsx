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

    // Status colors
    const statusColor = isRunning ? 'text-v-accent' : (isFailed ? 'text-v-alert' : 'text-v-nominal');
    const dotColor = isRunning ? 'bg-v-accent' : (isFailed ? 'bg-v-alert' : 'bg-v-nominal');
    const barColor = isRunning ? 'bg-v-accent' : (isFailed ? 'bg-v-alert' : 'bg-v-nominal');
    const borderLeft = isRunning ? 'border-l-2 border-l-v-accent' : (isFailed ? 'border-l-2 border-l-v-alert' : '');

    // Format name safely
    const formattedName = p.name ? p.name.replace(/\s+/g, '_').toUpperCase() : `NODE_${(p.id || '').substring(0,4)}`;

    return (
        <section
            className={`group grid grid-cols-12 gap-2 py-3 px-4 items-center bg-panel/30 hover:bg-white/[0.03] transition-colors cursor-pointer relative ${borderLeft}`}
            onClick={onClick}
        >
            {/* Scanline for running */}
            {isRunning && <div className="scanline absolute inset-0 pointer-events-none"></div>}

            {/* Name — col 3 */}
            <div className="col-span-3 relative z-10">
                <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">Node</p>
                <h2 className="text-[11px] font-bold text-white uppercase tracking-widest truncate pr-2" title={formattedName}>
                    {formattedName}
                </h2>
            </div>

            {/* Description — col 3 */}
            <div className="col-span-3 relative z-10">
                <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">Stream</p>
                <span className="font-mono text-[10px] text-slate-400 block truncate pr-2" title={p.description}>
                    {p.description || 'NO DATA STREAM'}
                </span>
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
                        className="border border-v-accent/50 bg-v-accent/10 text-v-accent font-bold text-[9px] px-2 py-1 hover:bg-v-accent/30 uppercase flex items-center gap-1 transition-colors"
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

import type { Pipeline } from '../api/client';
import { formatTokenCount } from '../utils';

interface ProjectCardProps {
    pipeline: Pipeline;
    onClick: () => void;
}

export function ProjectCard({ pipeline: p, onClick }: ProjectCardProps) {
    const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);

    const isCompleted = p.phase === 'COMPLETED';
    const isFailed = p.phase === 'FAILED';
    const isRunning = !isCompleted && !isFailed;
    
    // Choose styling based on status
    let cardClass = "brutalist-card p-4 relative overflow-hidden flex flex-col justify-between h-64 cursor-pointer";
    let badgeClass = "bg-white text-v-bg px-2 py-1 text-[10px] font-bold uppercase";
    let progressBorderClass = "border-white";
    let progressFillClass = "bg-white h-full";
    let accentTextClass = "text-white";
    
    if (isRunning) {
        badgeClass = "bg-v-accent text-v-bg px-2 py-1 text-[10px] font-bold";
        progressBorderClass = "border-v-accent";
        progressFillClass = "bg-v-accent h-full";
        accentTextClass = "text-v-accent";
    } else if (isFailed) {
        cardClass += " alert-card";
        badgeClass = "bg-v-alert text-v-bg px-2 py-1 text-[10px] font-bold italic animate-pulse";
        progressBorderClass = "border-v-alert";
        progressFillClass = "bg-v-alert h-full";
        accentTextClass = "text-v-alert";
    } else if (isCompleted) {
        cardClass += " border-v-nominal";
        badgeClass = "bg-v-nominal text-v-bg px-2 py-1 text-[10px] font-bold";
        progressBorderClass = "border-v-nominal";
        progressFillClass = "bg-v-nominal h-full";
        accentTextClass = "text-v-nominal";
    }
    
    // Format name safely
    const formattedName = p.name ? p.name.replace(/\s+/g, '_').toUpperCase() : `NODE_${(p.id || '').substring(0,4)}`;

    return (
        <section className={cardClass} onClick={onClick}>
            {isRunning && <div className="scanline"></div>}
            
            <div className="flex justify-between items-start mb-4 relative z-10">
                <h2 className="text-lg md:text-xl font-bold leading-tight font-sans truncate pr-2" title={formattedName}>
                    {formattedName}
                </h2>
                <span className={badgeClass}>
                    {p.phase || 'STANDBY'}
                </span>
            </div>
            
            <div className="space-y-4 relative z-10">
                <div className="text-[10px] text-white/60 line-clamp-2 h-8 leading-relaxed mb-2 font-mono">
                    {p.description || "NO DATA STREAM"}
                </div>
                
                <div data-purpose="technical-data">
                    <div className="flex justify-between text-[10px] mb-1 font-mono font-bold">
                        <span className="uppercase tracking-widest text-white/60">Progress</span>
                        <span className={accentTextClass}>{(p.progress || 0).toFixed(1)}%</span>
                    </div>
                    <div className={`w-full h-4 border ${progressBorderClass} p-[2px]`}>
                        <div className={progressFillClass} style={{ width: `${p.progress || 0}%` }}></div>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="border border-white/20 p-2">
                        <span className="text-white/40 block pb-1">TOKENS</span>
                        <span className={accentTextClass}>{totalTokens > 0 ? formatTokenCount(totalTokens) : '0'}</span>
                    </div>
                    <div className="border border-white/20 p-2">
                        <span className="text-white/40 block pb-1">HASH ID</span>
                        <span className="font-bold">{(p.id || '').substring(0, 8)}</span>
                    </div>
                </div>
            </div>
        </section>
    );
}

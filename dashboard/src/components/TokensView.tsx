import { motion } from 'framer-motion';
import type { Pipeline } from '../api/client';
import { formatTokenCount } from '../utils';

export function TokensView({ pipelines }: { pipelines: Pipeline[] }) {
    const totalInput = pipelines.reduce((s, p) => s + (p.tokenUsage?.inputTokens || 0), 0);
    const totalOutput = pipelines.reduce((s, p) => s + (p.tokenUsage?.outputTokens || 0), 0);
    const totalTokens = totalInput + totalOutput;

    // Claude Haiku 4.5 pricing (claude-haiku-4-5-20251001)
    const costPerMInput = 1.00; // $1.00 per 1M input tokens
    const costPerMOutput = 5.00; // $5.00 per 1M output tokens
    const estimatedCost = (totalInput / 1_000_000) * costPerMInput + (totalOutput / 1_000_000) * costPerMOutput;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-3 mb-8">
                <span className="material-symbols-outlined text-accent text-xl">toll</span>
                <h1 className="text-2xl font-black text-white tracking-widest uppercase">Token_Protocol_Usage</h1>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-panel border border-border-muted p-4 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span className="material-symbols-outlined text-slate-500 mb-2 text-3xl">data_usage</span>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Total Tokens</div>
                    <div className="text-2xl font-black text-white monospaced">{formatTokenCount(totalTokens)}</div>
                </div>
                
                <div className="bg-panel border border-border-muted p-4 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span className="material-symbols-outlined text-blue-500/50 mb-2 text-3xl">download</span>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Input Tokens</div>
                    <div className="text-2xl font-black text-blue-400 monospaced">{formatTokenCount(totalInput)}</div>
                </div>
                
                <div className="bg-panel border border-border-muted p-4 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span className="material-symbols-outlined text-purple-500/50 mb-2 text-3xl">upload</span>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Output Tokens</div>
                    <div className="text-2xl font-black text-purple-400 monospaced">{formatTokenCount(totalOutput)}</div>
                </div>
                
                <div className="bg-panel border border-accent/50 p-4 flex flex-col items-center justify-center relative overflow-hidden group shadow-[0_0_15px_rgba(212,255,0,0.1)]">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent opacity-50 group-hover:opacity-100 transition-opacity"></div>
                    <div className="absolute top-0 right-0 w-16 h-16 bg-accent/10 rounded-full blur-xl -mr-6 -mt-6"></div>
                    <span className="material-symbols-outlined text-accent mb-2 text-3xl">payments</span>
                    <div className="text-[10px] text-accent font-bold uppercase tracking-widest mb-1">Est. Cost (Haiku)</div>
                    <div className="text-2xl font-black text-white monospaced">${estimatedCost.toFixed(4)}</div>
                </div>
            </div>

            {/* Per-project breakdown */}
            <div className="flex items-center gap-2 mb-4 border-b border-border-muted pb-2">
                <span className="material-symbols-outlined text-lg text-slate-400">schema</span>
                <h3 className="text-sm font-black text-slate-300 tracking-widest uppercase">Project_Breakdown</h3>
            </div>
            
            <div className="bg-black border border-border-muted p-4 scanline shadow-inner max-h-[500px] overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-500 tracking-widest uppercase border-b border-white/5 pb-2">
                    <div className="flex gap-1 mr-2">
                        <span className="w-2 h-2 rounded-full bg-red-500/50"></span>
                        <span className="w-2 h-2 rounded-full bg-yellow-500/50"></span>
                        <span className="w-2 h-2 rounded-full bg-green-500/50"></span>
                    </div>
                    <span>Data_Stream_Activity</span>
                </div>
                
                <div className="flex flex-col gap-2">
                    {pipelines.map(p => {
                        const inp = p.tokenUsage?.inputTokens || 0;
                        const out = p.tokenUsage?.outputTokens || 0;
                        const total = inp + out;
                        const pct = totalTokens > 0 ? ((total / totalTokens) * 100).toFixed(1) : '0';
                        
                        if (total === 0) return null; // Skip empty pipelines to reduce clutter
                        
                        return (
                            <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group">
                                <div className="flex items-center gap-3 mb-2 sm:mb-0">
                                    <span className="material-symbols-outlined text-slate-500 group-hover:text-accent transition-colors">folder_data</span>
                                    <span className="text-sm font-bold text-white tracking-widest uppercase truncate max-w-[200px]" title={p.name}>
                                        {(p.name || 'unnamed').replace(/\s+/g, '_').toLowerCase()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-xs monospaced">
                                    <div className="flex items-center gap-1 text-blue-400" title="Input Tokens">
                                        <span className="material-symbols-outlined text-[14px]">arrow_downward</span> {formatTokenCount(inp)}
                                    </div>
                                    <div className="text-slate-600">/</div>
                                    <div className="flex items-center gap-1 text-purple-400" title="Output Tokens">
                                        <span className="material-symbols-outlined text-[14px]">arrow_upward</span> {formatTokenCount(out)}
                                    </div>
                                    <div className="text-slate-600">=</div>
                                    <div className="font-bold text-white min-w-[60px] text-right">
                                        {formatTokenCount(total)}
                                    </div>
                                    <div className="bg-white/10 text-slate-300 px-2 py-0.5 min-w-[50px] text-right text-[10px] font-black tracking-widest">
                                        {pct}%
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    
                    {pipelines.length === 0 || pipelines.every(p => (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0) === 0) ? (
                        <div className="flex items-center gap-2 text-slate-500 text-xs monospaced py-4">
                            <span className="text-accent">&gt;</span> No token usage data detected in current matrix.
                        </div>
                    ) : null}
                </div>
            </div>
        </motion.div>
    );
}

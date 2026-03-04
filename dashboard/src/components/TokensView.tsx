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
            <div className="section-title">Token Usage</div>

            {/* Summary Cards */}
            <div className="token-summary">
                <div className="token-card">
                    <div className="token-card-label">Total Tokens</div>
                    <div className="token-card-value">{formatTokenCount(totalTokens)}</div>
                </div>
                <div className="token-card">
                    <div className="token-card-label">Input Tokens</div>
                    <div className="token-card-value">{formatTokenCount(totalInput)}</div>
                </div>
                <div className="token-card">
                    <div className="token-card-label">Output Tokens</div>
                    <div className="token-card-value">{formatTokenCount(totalOutput)}</div>
                </div>
                <div className="token-card highlight">
                    <div className="token-card-label">Estimation (Moyenne)</div>
                    <div className="token-card-value">${estimatedCost.toFixed(4)}</div>
                </div>
            </div>

            {/* Per-project breakdown */}
            <div className="section-title" style={{ marginTop: 24 }}>Par Projet</div>
            <div className="terminal">
                <div className="terminal-header">
                    <div className="terminal-dots"><span /><span /><span /></div>
                    Token Breakdown
                </div>
                <div className="terminal-body">
                    {pipelines.map(p => {
                        const inp = p.tokenUsage?.inputTokens || 0;
                        const out = p.tokenUsage?.outputTokens || 0;
                        const total = inp + out;
                        const pct = totalTokens > 0 ? ((total / totalTokens) * 100).toFixed(1) : '0';
                        return (
                            <div key={p.id} className="terminal-line info">
                                <span className="terminal-agent" style={{ minWidth: 200 }}>{p.name}</span>
                                <span className="terminal-msg">
                                    {formatTokenCount(inp)} in / {formatTokenCount(out)} out = {formatTokenCount(total)} ({pct}%)
                                </span>
                            </div>
                        );
                    })}
                    {pipelines.length === 0 && (
                        <div className="terminal-line info">
                            <span className="terminal-msg" style={{ color: 'var(--text-muted)' }}>Aucune donnée de tokens</span>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

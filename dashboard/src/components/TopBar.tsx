import { Coins, Plus } from 'lucide-react';
import { formatTokenCount } from '../utils';

interface TopBarProps {
    pipelineCount: number;
    onLaunch: () => void;
    totalTokens: number;
}

export function TopBar({ pipelineCount, onLaunch, totalTokens }: TopBarProps) {
    return (
        <header className="topbar">
            <div className="topbar-logo">
                <div className="topbar-logo-icon">⚡</div>
                <span>VibeCraft HQ</span>
            </div>
            <div className="topbar-status">
                <div className="status-badge" title="Total tokens used">
                    <Coins size={12} />
                    {formatTokenCount(totalTokens)} tokens
                </div>
                <div className="status-badge">
                    <span className="status-dot" />
                    {pipelineCount} active
                </div>
                <button className="btn-launch" onClick={onLaunch}>
                    <Plus size={14} />
                    Lancer une idée
                </button>
            </div>
        </header>
    );
}

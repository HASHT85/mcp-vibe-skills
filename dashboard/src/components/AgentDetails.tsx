import { motion } from 'framer-motion';
import { formatTime } from '../utils';
import type { PipelineEvent } from '../api/client';
import type { NodeTopology } from './ProjectNodeMap';

interface AgentDetailsProps {
    node: NodeTopology;
    agentState?: { role: string; emoji: string; status: string; currentAction?: string; startedAt?: string; completedAt?: string };
    events: PipelineEvent[];
    onClose: () => void;
}

export function AgentDetails({ node, agentState, events, onClose }: AgentDetailsProps) {
    // Filter events specific to this agent's role
    const agentEvents = events.filter(e => e.agentRole === node.role);
    const status = agentState?.status || 'waiting';

    const StatusColor = {
        'waiting': 'bg-slate-800 text-slate-400',
        'active': 'bg-v-accent text-v-bg',
        'done': 'bg-white text-black',
        'error': 'bg-v-alert text-white'
    };

    return (
        <div className="h-full flex flex-col bg-v-bg border border-v-accent/50 shadow-[0_0_20px_rgba(205,255,0,0.1)] overflow-hidden relative">
            {/* Header */}
            <div className="flex border-b border-white/10 p-4 items-start justify-between bg-white/5">
                <div className="flex items-center gap-4">
                    <span className="text-4xl">{node.emoji}</span>
                    <div>
                        <div className="text-xs font-bold text-white/50 tracking-widest uppercase mb-1">AGENT_ID: {node.id}</div>
                        <h2 className="text-xl font-black text-v-accent tracking-tighter uppercase leading-none">{node.role}</h2>
                        <span className={`inline-block text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 mt-2 ${StatusColor[status as keyof typeof StatusColor]}`}>
                            {status}
                        </span>
                    </div>
                </div>
                <button onClick={onClose} className="text-white/50 hover:text-white p-1">
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            {/* Description / System Prompt */}
            <div className="p-4 border-b border-white/10 bg-black/40 text-sm">
                <div className="mb-2 text-xs font-bold text-white/30 tracking-widest uppercase">MISSION_OBJECTIVE</div>
                <p className="text-white/80 font-sans leading-relaxed">{node.description}</p>
                
                {agentState?.currentAction && status === 'active' && (
                    <div className="mt-4 p-3 bg-v-accent/10 border border-v-accent/30 text-v-accent font-bold animate-pulse">
                        <span className="material-symbols-outlined text-sm align-middle mr-2">military_tech</span>
                        {agentState.currentAction}
                    </div>
                )}
            </div>

            {/* Event Logs */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#0a0a0a]">
                <div className="flex items-center gap-2 mb-4 sticky top-0 bg-[#0a0a0a] pb-2 z-10 border-b border-white/5">
                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-none"></span>
                    <h3 className="text-xs font-black text-slate-400 tracking-widest uppercase">LOCAL_SYSTEM_LOGS</h3>
                </div>

                {agentEvents.length === 0 ? (
                    <div className="text-center p-8 text-white/20 font-bold tracking-widest uppercase text-xs">
                        NO_ACTIVITY_RECORDED
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {agentEvents.map((ev, i) => (
                            <motion.div 
                                key={ev.id || i}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="font-mono text-xs flex items-start gap-4 p-2 bg-white/5 hover:bg-white/10 transition-colors border-l-2 border-transparent hover:border-v-accent"
                            >
                                <span className="text-slate-500 shrink-0 w-16">{formatTime(ev.timestamp)}</span>
                                <span className="shrink-0">{ev.agentEmoji}</span>
                                <span className={`flex-1 break-words ${
                                    ev.type === 'error' ? 'text-v-alert font-bold' :
                                    ev.type === 'success' ? 'text-v-accent' :
                                    ev.type === 'warning' ? 'text-yellow-500' :
                                    'text-slate-300'
                                }`}>
                                    {ev.action}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            {agentState?.startedAt && (
                <div className="p-3 border-t border-white/10 bg-black text-[10px] font-bold text-white/30 tracking-widest flex justify-between uppercase">
                    <span>INIT: {formatTime(agentState.startedAt)}</span>
                    {agentState.completedAt && <span>TERM: {formatTime(agentState.completedAt)}</span>}
                </div>
            )}
        </div>
    );
}

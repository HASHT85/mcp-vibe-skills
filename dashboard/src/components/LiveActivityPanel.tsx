import { motion } from 'framer-motion';
import type { PipelineEvent } from '../api/client';
import { formatTime } from '../utils';

export function LiveActivityPanel({ events }: { events: PipelineEvent[] }) {
    return (
        <aside className="hidden lg:flex w-80 flex-col border-l border-border-muted bg-panel/50 backdrop-blur-md shrink-0">
            <div className="p-6 border-b border-border-muted flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-ping"></span>
                    <h2 className="text-xs font-black tracking-widest text-white uppercase">Live Activity</h2>
                </div>
                <span className="text-[10px] font-bold text-accent monospaced">78ms_ping</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 monospaced space-y-4">
                {events.length === 0 && (
                    <div className="text-slate-500 text-xs text-center mt-10">
                        Scanning for activity...
                    </div>
                )}
                
                {events.map((ev) => {
                    // Different border colors based on the role/event for vibe
                    const borderColorClass = ev.agentRole === 'developer' || ev.agentRole === 'architect' ? 'border-primary/50' : 'border-accent/30';
                    const textColorClass = ev.agentRole === 'developer' || ev.agentRole === 'architect' ? 'text-primary' : 'text-accent';

                    return (
                        <motion.div
                            key={ev.id + ev.timestamp}
                            className={`border-l ${borderColorClass} pl-3 py-1`}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <div className="flex justify-between text-[10px] mb-1">
                                <span className={`${textColorClass} font-bold uppercase`}>{ev.agentEmoji} {ev.agentRole || 'SYS'}</span>
                                <span className="text-slate-500">{formatTime(ev.timestamp)}</span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                                {ev.action}
                            </p>
                        </motion.div>
                    );
                })}

                {/* HUD-like visualization static element at the bottom */}
                <div className="pt-6 mt-8 border-t border-border-muted/50">
                    <div className="h-24 w-full bg-accent/5 border border-accent/20 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 flex items-center justify-around opacity-20">
                            <div className="w-[1px] h-full bg-accent"></div>
                            <div className="w-[1px] h-full bg-accent"></div>
                            <div className="w-[1px] h-full bg-accent"></div>
                            <div className="w-[1px] h-full bg-accent"></div>
                        </div>
                        <div className="z-10 text-center">
                            <div className="text-[10px] text-accent font-black tracking-widest uppercase">Network_Load</div>
                            <div className="text-2xl font-black text-white monospaced">42.8<span className="text-xs text-accent">GB/s</span></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-4 bg-background-dark/80 border-t border-border-muted mt-auto">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-accent rounded-full shadow-[0_0_8px_rgba(212,255,0,0.6)]"></div>
                    <span className="text-[10px] font-bold tracking-widest text-slate-400">ENCRYPTED_CHANNEL // ACTIVE</span>
                </div>
            </div>
        </aside>
    );
}

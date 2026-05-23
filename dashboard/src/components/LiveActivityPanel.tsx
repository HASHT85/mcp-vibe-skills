import { motion } from "framer-motion";
import type { PipelineEvent } from "../api/client";
import { formatTime } from "../utils";

export function LiveActivityPanel({ events }: { events: PipelineEvent[] }) {
    return (
        <aside className="hidden lg:flex w-72 flex-col border-l border-[#2A3442] bg-[#0a0e13] shrink-0">
            <div className="p-4 border-b border-[#2A3442] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#D7FF2F] animate-pulse"></span>
                    <h2 className="text-[10px] font-mono font-bold tracking-widest text-white uppercase">
                        Live Activity
                    </h2>
                </div>
                <span className="text-[10px] font-mono text-[#D7FF2F]">78ms</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {events.length === 0 && (
                    <div className="text-gray-600 text-[10px] font-mono text-center mt-10 uppercase tracking-widest">
                        Scanning for activity...
                    </div>
                )}

                {events.map((ev) => {
                    const isAgent = ev.agentRole === "developer" || ev.agentRole === "architect";
                    const borderColor = isAgent ? "border-[#FF6A3D]/30" : "border-[#D7FF2F]/20";
                    const textColor = isAgent ? "text-[#FF6A3D]" : "text-[#D7FF2F]";

                    return (
                        <motion.div
                            key={ev.id + ev.timestamp}
                            className={`border-l-2 ${borderColor} pl-3 py-1`}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                        >
                            <div className="flex justify-between text-[10px] mb-1 font-mono">
                                <span className={`${textColor} font-bold uppercase`}>
                                    {ev.agentEmoji} {ev.agentRole || "SYS"}
                                </span>
                                <span className="text-gray-600">{formatTime(ev.timestamp)}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 leading-relaxed font-mono">{ev.action}</p>
                        </motion.div>
                    );
                })}
            </div>

            <div className="p-4 border-t border-[#2A3442] mt-auto">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-[#D7FF2F]"></div>
                    <span className="text-[10px] font-mono tracking-widest text-gray-600 uppercase">
                        Encrypted_Channel
                    </span>
                </div>
            </div>
        </aside>
    );
}

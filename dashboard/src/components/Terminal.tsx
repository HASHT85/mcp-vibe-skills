import { useEffect, useRef } from "react";
import type { PipelineEvent } from "../api/client";
import { formatTime } from "../utils";

export function Terminal({ events }: { events: PipelineEvent[] }) {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [events.length]);

    return (
        <div className="bg-black flex flex-col scanline relative overflow-hidden h-full w-full">
            <div className="flex items-center gap-2 p-3 px-4 border-b border-border-muted/50 bg-[#06080A] text-[10px] font-bold tracking-widest uppercase text-slate-500 shrink-0">
                <div className="flex gap-2 mr-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/50"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/50"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-v-accent/50"></span>
                </div>
                <span>Event_Log [{events.length}]</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2 text-[10px] md:text-xs">
                {events.map((ev) => {
                    const isError = ev.type === "error";
                    const isSuccess = ev.type === "success";
                    const textColor = isError ? "text-red-400" : isSuccess ? "text-v-accent" : "text-slate-300";
                    const timeColor = isError ? "text-red-500/70" : "text-slate-500";

                    return (
                        <div key={ev.id} className={`flex items-start gap-3 ${textColor} font-mono leading-relaxed`}>
                            <span className={`shrink-0 ${timeColor}`}>[{formatTime(ev.timestamp)}]</span>
                            <span className="shrink-0 font-bold uppercase tracking-wider hidden sm:inline-block min-w-[140px]">
                                {ev.agentEmoji} {ev.agentRole}
                            </span>
                            <span className="flex-1 break-words pb-1">
                                <span className="sm:hidden font-bold uppercase mr-2">
                                    {ev.agentEmoji} {ev.agentRole}
                                </span>
                                <span className={isError ? "opacity-100 font-bold" : "opacity-90"}>{ev.action}</span>
                            </span>
                        </div>
                    );
                })}
                {events.length === 0 && (
                    <div className="text-slate-500 font-mono flex items-center gap-2 py-4">
                        <span className="text-v-accent animate-pulse">&gt;</span> AWAITING_TELEMETRY_DATA_STREAMS...
                    </div>
                )}
                <div ref={endRef} />
            </div>
        </div>
    );
}

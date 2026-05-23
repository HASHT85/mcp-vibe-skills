import { motion } from "framer-motion";
import type { Pipeline } from "../api/client";

export function AgentsView({ pipelines }: { pipelines: Pipeline[] }) {
    const allAgents = pipelines.flatMap((p) =>
        (p.agents || []).filter(Boolean).map((a) => ({ ...a, pipelineName: p.name, pipelinePhase: p.phase }))
    );

    const byRole = allAgents.reduce(
        (acc, a) => {
            if (!acc[a.role]) acc[a.role] = [];
            acc[a.role].push(a);
            return acc;
        },
        {} as Record<string, typeof allAgents>
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center gap-3 mb-8">
                <span className="material-symbols-outlined text-accent text-xl">account_tree</span>
                <h1 className="text-2xl font-black text-white tracking-widest uppercase">Operative_Nodes</h1>
                <span className="bg-white/10 text-accent text-[10px] font-bold px-2 py-0.5 ml-2 mt-1 border border-white/5">
                    {allAgents.length} ACTIVE
                </span>
            </div>

            {Object.entries(byRole).map(([role, agents]) => (
                <div key={role} className="mb-8">
                    <div className="flex items-center gap-2 mb-4 border-b border-border-muted pb-2">
                        <span className="text-lg">{agents[0]?.emoji}</span>
                        <h3 className="text-sm font-black text-accent tracking-widest uppercase">{role}</h3>
                        <span className="text-[10px] text-slate-500 font-bold ml-2">[{agents.length} INSTANCES]</span>
                    </div>

                    <div className="flex flex-col border border-border-muted divide-y divide-border-muted bg-panel/30">
                        {agents.map((agent, i) => {
                            const isStatusActive = agent.status === "active";
                            const isStatusDone = agent.status === "done";
                            const isStatusError = agent.status === "error";

                            const statusColor = isStatusActive
                                ? "text-primary"
                                : isStatusDone
                                  ? "text-accent"
                                  : isStatusError
                                    ? "text-red-500"
                                    : "text-slate-500";
                            const dotColor = isStatusActive
                                ? "bg-primary"
                                : isStatusDone
                                  ? "bg-accent"
                                  : isStatusError
                                    ? "bg-red-500"
                                    : "bg-slate-500";

                            return (
                                <motion.div
                                    key={`${agent.pipelineName}-${i}`}
                                    className="group grid grid-cols-12 py-3 px-4 items-center hover:bg-white/[0.02] transition-colors relative overflow-hidden"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    {isStatusActive && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
                                    )}
                                    {isStatusError && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                                    )}

                                    <div className="col-span-1 flex justify-center items-center">
                                        <span className="text-base">{agent.emoji}</span>
                                    </div>

                                    <div className="col-span-3">
                                        <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">
                                            Role
                                        </p>
                                        <h3 className="text-[11px] font-bold text-white uppercase tracking-widest truncate pr-2">
                                            {agent.role}
                                        </h3>
                                    </div>

                                    <div className="col-span-3">
                                        <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">
                                            Node
                                        </p>
                                        <span
                                            className="font-mono text-[10px] text-slate-300 block truncate pr-2"
                                            title={agent.pipelineName}
                                        >
                                            {(agent.pipelineName || "unknown").replace(/\s+/g, "_").toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="col-span-3">
                                        <p className="font-mono text-[9px] text-slate-500 mb-0.5 uppercase tracking-widest">
                                            Action
                                        </p>
                                        <span
                                            className="font-mono text-[10px] text-slate-400 block truncate pr-2"
                                            title={agent.currentAction || agent.pipelinePhase}
                                        >
                                            {agent.currentAction || agent.pipelinePhase || "AWAITING_INSTRUCTIONS"}
                                        </span>
                                    </div>

                                    <div className="col-span-2 flex justify-end items-center">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${dotColor} ${isStatusActive ? "animate-pulse" : ""}`}
                                            ></span>
                                            <span
                                                className={`text-[9px] font-black uppercase tracking-widest ${statusColor}`}
                                            >
                                                {agent.status}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {allAgents.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 border border-border-muted bg-panel/30">
                    <span className="material-symbols-outlined text-4xl text-slate-700 mb-4">robot_2</span>
                    <p className="text-slate-400 text-xs tracking-widest uppercase">No Active Operatives Detected</p>
                </div>
            )}
        </motion.div>
    );
}

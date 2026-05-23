import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Pipeline, PipelineEvent, PipelineAgent } from "../api/client";

type DetailTab = "agents" | "logs" | "info";

interface DetailPanelProps {
    pipeline: Pipeline | null;
    liveEvents: PipelineEvent[];
    open: boolean;
    onClose: () => void;
}

export function DetailPanel({ pipeline, liveEvents, open, onClose }: DetailPanelProps) {
    const [tab, setTab] = useState<DetailTab>("agents");

    if (!pipeline) return null;

    const pipelineEvents = liveEvents.filter((e) => e.pipelineId === pipeline.id).slice(0, 50);
    const activeAgents = pipeline.agents?.filter((a) => a.status === "active") || [];
    const completedAgents = pipeline.agents?.filter((a) => a.status === "done") || [];
    const errorAgents = pipeline.agents?.filter((a) => a.status === "error") || [];

    const getAgentStatusStyle = (status: string) => {
        switch (status) {
            case "active":
                return "border-v-accent/40 bg-accent-subtle";
            case "done":
                return "border-status-success/30 bg-status-success/5";
            case "error":
                return "border-status-error/30 bg-status-error/5";
            default:
                return "border-surface-6 bg-surface-3";
        }
    };

    const getAgentStatusIcon = (status: string) => {
        switch (status) {
            case "active":
                return "⚡";
            case "done":
                return "✅";
            case "error":
                return "❌";
            default:
                return "⏳";
        }
    };

    const getEventTypeColor = (type: string) => {
        switch (type) {
            case "success":
                return "text-status-success";
            case "error":
                return "text-status-error";
            case "warning":
                return "text-status-warning";
            case "deploy":
                return "text-v-accent";
            default:
                return "text-text-secondary";
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="hidden md:flex fixed right-0 top-0 h-screen w-[380px] bg-surface-2 border-l border-surface-6/50 flex-col z-30"
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 28, stiffness: 300 }}
                >
                    {/* ── Header ── */}
                    <div className="px-4 py-4 border-b border-surface-6/50 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <span className="material-symbols-outlined text-v-accent text-[20px]">deployed_code</span>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-text-primary truncate">
                                    {pipeline.name || "Project"}
                                </h3>
                                <span
                                    className={`text-2xs font-medium ${
                                        pipeline.phase === "COMPLETED"
                                            ? "text-status-success"
                                            : pipeline.phase === "FAILED"
                                              ? "text-status-error"
                                              : "text-v-accent"
                                    }`}
                                >
                                    {pipeline.phase}
                                </span>
                            </div>
                        </div>
                        <button
                            className="p-1.5 rounded-lg hover:bg-surface-4 text-text-tertiary hover:text-text-primary transition-all"
                            onClick={onClose}
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>

                    {/* ── Tabs ── */}
                    <div className="px-3 py-2 flex gap-1 border-b border-surface-6/30">
                        {[
                            { id: "agents" as DetailTab, icon: "group", label: "Agents" },
                            { id: "logs" as DetailTab, icon: "receipt_long", label: "Logs" },
                            { id: "info" as DetailTab, icon: "info", label: "Info" },
                        ].map((t) => (
                            <button
                                key={t.id}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                                    tab === t.id
                                        ? "bg-accent-muted text-v-accent"
                                        : "text-text-tertiary hover:bg-surface-4"
                                }`}
                                onClick={() => setTab(t.id)}
                            >
                                <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* ── Content ── */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                        {tab === "agents" && (
                            <div className="flex flex-col gap-2">
                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    <div className="bg-surface-3 rounded-lg p-3 text-center">
                                        <div className="text-lg font-bold text-v-accent">{activeAgents.length}</div>
                                        <div className="text-2xs text-text-tertiary">Active</div>
                                    </div>
                                    <div className="bg-surface-3 rounded-lg p-3 text-center">
                                        <div className="text-lg font-bold text-status-success">
                                            {completedAgents.length}
                                        </div>
                                        <div className="text-2xs text-text-tertiary">Done</div>
                                    </div>
                                    <div className="bg-surface-3 rounded-lg p-3 text-center">
                                        <div className="text-lg font-bold text-status-error">{errorAgents.length}</div>
                                        <div className="text-2xs text-text-tertiary">Error</div>
                                    </div>
                                </div>

                                {/* Agent List */}
                                {(pipeline.agents || []).map((agent, i) => (
                                    <div key={i} className={`agent-step ${getAgentStatusStyle(agent.status)}`}>
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-base">{agent.emoji || "🤖"}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-text-primary capitalize truncate">
                                                        {agent.role}
                                                    </span>
                                                    <span className="text-xs">{getAgentStatusIcon(agent.status)}</span>
                                                </div>
                                                {agent.currentAction && (
                                                    <p className="text-2xs text-text-tertiary mt-0.5 truncate">
                                                        {agent.currentAction}
                                                    </p>
                                                )}
                                            </div>
                                            {agent.status === "active" && (
                                                <div className="flex gap-0.5">
                                                    <div className="typing-dot" />
                                                    <div className="typing-dot" />
                                                    <div className="typing-dot" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {tab === "logs" && (
                            <div className="flex flex-col gap-1">
                                {pipelineEvents.length === 0 ? (
                                    <div className="py-8 text-center">
                                        <span className="material-symbols-outlined text-2xl text-text-muted mb-2 block">
                                            receipt_long
                                        </span>
                                        <p className="text-xs text-text-tertiary">No events yet</p>
                                    </div>
                                ) : (
                                    pipelineEvents.map((event, i) => (
                                        <div
                                            key={i}
                                            className="flex gap-2.5 py-2 px-2 rounded-lg hover:bg-surface-3/50 transition-colors"
                                        >
                                            <span className="text-sm shrink-0">{event.agentEmoji || "📡"}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span
                                                        className={`text-2xs font-semibold uppercase ${getEventTypeColor(event.type)}`}
                                                    >
                                                        {event.agentRole || "System"}
                                                    </span>
                                                    <span className="text-2xs text-text-muted">
                                                        {new Date(event.timestamp).toLocaleTimeString("en-GB", {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            second: "2-digit",
                                                        })}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-text-secondary leading-relaxed break-words">
                                                    {event.action}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {tab === "info" && (
                            <div className="flex flex-col gap-3">
                                <InfoRow label="ID" value={pipeline.id.slice(0, 12) + "..."} mono />
                                <InfoRow label="Model" value={pipeline.model || "Default"} />
                                <InfoRow label="Phase" value={pipeline.phase} />
                                <InfoRow label="Progress" value={`${pipeline.progress || 0}%`} />
                                {pipeline.github && <InfoRow label="GitHub" value={pipeline.github.url} link />}
                                {pipeline.description && (
                                    <div className="bg-surface-3 rounded-lg p-3 mt-2">
                                        <span className="text-2xs text-text-tertiary font-medium uppercase tracking-wider block mb-1.5">
                                            Description
                                        </span>
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                            {pipeline.description}
                                        </p>
                                    </div>
                                )}
                                {pipeline.tokenUsage && (
                                    <div className="bg-surface-3 rounded-lg p-3">
                                        <span className="text-2xs text-text-tertiary font-medium uppercase tracking-wider block mb-2">
                                            Token Usage
                                        </span>
                                        <div className="flex gap-4">
                                            <div>
                                                <div className="text-sm font-semibold text-v-accent">
                                                    {(pipeline.tokenUsage.inputTokens || 0).toLocaleString()}
                                                </div>
                                                <div className="text-2xs text-text-muted">Input</div>
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-v-alert">
                                                    {(pipeline.tokenUsage.outputTokens || 0).toLocaleString()}
                                                </div>
                                                <div className="text-2xs text-text-muted">Output</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <InfoRow label="Created" value={new Date(pipeline.createdAt).toLocaleString()} />
                                {pipeline.error && (
                                    <div className="bg-status-error/10 rounded-lg p-3 border border-status-error/20">
                                        <span className="text-2xs text-status-error font-medium uppercase tracking-wider block mb-1">
                                            Error
                                        </span>
                                        <p className="text-xs text-status-error/80 leading-relaxed break-words">
                                            {pipeline.error}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function InfoRow({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: boolean }) {
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-surface-6/30 last:border-0">
            <span className="text-2xs text-text-tertiary font-medium uppercase tracking-wider">{label}</span>
            {link ? (
                <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-v-accent hover:underline truncate max-w-[200px]"
                >
                    {value}
                </a>
            ) : (
                <span className={`text-xs text-text-primary truncate max-w-[200px] ${mono ? "font-mono" : ""}`}>
                    {value}
                </span>
            )}
        </div>
    );
}

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatSession, Pipeline } from "../api/client";

interface SidebarProps {
    activeSessionId: string | null;
    onSelectSession: (session: ChatSession) => void;
    onNewChat: () => void;
    onSelectProject: (pipeline: Pipeline) => void;
    sessions: ChatSession[];
    pipelines: Pipeline[];
    collapsed: boolean;
    onToggleCollapse: () => void;
    activePipelineId?: string | null;
}

// ─── Helpers ───

const getSessionTitle = (s: ChatSession): string => {
    const firstMsg = s.messages?.[0]?.content;
    if (firstMsg) return firstMsg.slice(0, 45) + (firstMsg.length > 45 ? "…" : "");
    return `Chat ${(s.id || "").slice(0, 6)}`;
};

const getTimeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
};

const getPhaseColor = (phase: string): string => {
    switch (phase) {
        case "COMPLETED": return "text-status-success";
        case "FAILED":    return "text-status-error";
        case "RUNNING":
        case "PLANNING":
        case "BUILDING":  return "text-v-accent";
        default:          return "text-text-tertiary";
    }
};

const getPhaseBadgeStyle = (phase: string): string => {
    switch (phase) {
        case "COMPLETED": return "bg-status-success/15 text-status-success border-status-success/25";
        case "FAILED":    return "bg-status-error/15 text-status-error border-status-error/25";
        case "RUNNING":
        case "PLANNING":
        case "BUILDING":  return "bg-v-accent/15 text-v-accent border-v-accent/25";
        default:          return "bg-surface-5/50 text-text-tertiary border-surface-6/30";
    }
};

const getPhaseIcon = (phase: string): string => {
    switch (phase) {
        case "COMPLETED": return "check_circle";
        case "FAILED":    return "error";
        case "RUNNING":
        case "PLANNING":
        case "BUILDING":  return "sync";
        default:          return "pending";
    }
};

const getProjectEmoji = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes("app") || lower.includes("mobile")) return "📱";
    if (lower.includes("web") || lower.includes("site") || lower.includes("landing")) return "🌐";
    if (lower.includes("bot") || lower.includes("discord")) return "🤖";
    if (lower.includes("api") || lower.includes("backend")) return "⚡";
    if (lower.includes("dashboard") || lower.includes("admin")) return "📊";
    if (lower.includes("game")) return "🎮";
    return "🚀";
};

// ─── Chat ↔ Project Linking ───

function linkSessionsToPipelines(
    sessions: ChatSession[],
    pipelines: Pipeline[]
): { linked: Map<string, ChatSession[]>; free: ChatSession[] } {
    const linked = new Map<string, ChatSession[]>(pipelines.map((p) => [p.id, []]));
    const free: ChatSession[] = [];

    for (const s of sessions) {
        const title = getSessionTitle(s).toLowerCase();
        const firstContent = (s.messages?.[0]?.content || "").toLowerCase();

        let matched = false;
        for (const p of pipelines) {
            const pName = (p.name || "").toLowerCase();
            if (!pName) continue;
            if (title.includes(pName) || firstContent.includes(pName)) {
                linked.get(p.id)!.push(s);
                matched = true;
                break;
            }
        }
        if (!matched) free.push(s);
    }

    return { linked, free };
}

// ─── Project Row ───

interface ProjectRowProps {
    pipeline: Pipeline;
    linkedSessions: ChatSession[];
    activeSessionId: string | null;
    activePipelineId?: string | null;
    onSelectProject: (p: Pipeline) => void;
    onSelectSession: (s: ChatSession) => void;
    onCloseMobile: () => void;
}

function ProjectRow({
    pipeline,
    linkedSessions,
    activeSessionId,
    activePipelineId,
    onSelectProject,
    onSelectSession,
    onCloseMobile,
}: ProjectRowProps) {
    const [expanded, setExpanded] = useState(true);
    const isActive = activePipelineId === pipeline.id;
    const isRunning = ["RUNNING", "PLANNING", "BUILDING"].includes(pipeline.phase);

    return (
        <div className="flex flex-col">
            {/* ── Project Header ── */}
            <div
                className={`group flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all cursor-pointer border-l-2 ${
                    isActive
                        ? "bg-accent-muted/50 border-v-accent"
                        : "border-transparent hover:bg-surface-4/60"
                }`}
            >
                {/* Expand/Collapse toggle */}
                <button
                    className="p-0.5 rounded text-text-tertiary hover:text-text-secondary transition-colors shrink-0"
                    onClick={() => setExpanded(!expanded)}
                    title={expanded ? "Collapse" : "Expand"}
                >
                    <motion.span
                        className="material-symbols-outlined text-[13px] block"
                        animate={{ rotate: expanded ? 90 : 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        chevron_right
                    </motion.span>
                </button>

                {/* Project title (clickable → infra detail) */}
                <button
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    onClick={() => {
                        onSelectProject(pipeline);
                        onCloseMobile();
                    }}
                >
                    <span className="text-[13px] shrink-0">{getProjectEmoji(pipeline.name)}</span>
                    <span
                        className={`text-sm font-semibold truncate flex-1 ${
                            isActive ? "text-text-primary" : "text-text-primary"
                        }`}
                    >
                        {pipeline.name || "Unnamed Project"}
                    </span>
                </button>

                {/* Phase badge */}
                <span
                    className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide border rounded px-1 py-0.5 ${getPhaseBadgeStyle(pipeline.phase)}`}
                >
                    <span
                        className={`material-symbols-outlined text-[9px] ${getPhaseColor(pipeline.phase)} ${isRunning ? "animate-spin" : ""}`}
                    >
                        {getPhaseIcon(pipeline.phase)}
                    </span>
                    {pipeline.phase === "COMPLETED"
                        ? "Done"
                        : pipeline.phase === "FAILED"
                        ? "Failed"
                        : isRunning
                        ? "Running"
                        : pipeline.phase}
                </span>
            </div>

            {/* ── Linked Chats ── */}
            <AnimatePresence initial={false}>
                {expanded && linkedSessions.length > 0 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col gap-0.5 pl-7 pb-0.5">
                            {linkedSessions.map((s) => {
                                const isActiveChat = activeSessionId === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-md transition-all group ${
                                            isActiveChat
                                                ? "bg-accent-muted text-text-primary"
                                                : "hover:bg-surface-4/70 text-text-secondary"
                                        }`}
                                        onClick={() => {
                                            onSelectSession(s);
                                            onCloseMobile();
                                        }}
                                    >
                                        <span
                                            className={`material-symbols-outlined text-[12px] shrink-0 ${
                                                isActiveChat ? "text-v-accent" : "text-text-muted"
                                            }`}
                                        >
                                            chat_bubble
                                        </span>
                                        <span className="text-xs truncate flex-1">
                                            {getSessionTitle(s)}
                                        </span>
                                        <span className="text-[10px] text-text-muted shrink-0">
                                            {getTimeAgo(s.updatedAt || s.createdAt)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Main Sidebar ───

export function Sidebar({
    activeSessionId,
    onSelectSession,
    onNewChat,
    onSelectProject,
    sessions,
    pipelines,
    collapsed,
    onToggleCollapse,
    activePipelineId,
}: SidebarProps) {
    const [mobileOpen, setMobileOpen] = useState(false);

    const { linked, free } = linkSessionsToPipelines(sessions, pipelines);

    // Sort: running first, then by updatedAt desc
    const sortedPipelines = [...pipelines].sort((a, b) => {
        const aRunning = ["RUNNING", "PLANNING", "BUILDING"].includes(a.phase) ? 1 : 0;
        const bRunning = ["RUNNING", "PLANNING", "BUILDING"].includes(b.phase) ? 1 : 0;
        if (aRunning !== bRunning) return bRunning - aRunning;
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });

    const sidebarContent = (
        <div className="flex flex-col h-full bg-surface-2">
            {/* ── Header ── */}
            <div className="px-4 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="VEIST" className="w-7 h-7" />
                    <span className="font-headline font-bold text-base text-text-primary tracking-tight">
                        VEIST
                    </span>
                </div>
                <button
                    className="p-1.5 rounded-lg hover:bg-surface-4 text-text-tertiary hover:text-text-primary transition-all"
                    onClick={onToggleCollapse}
                    title="Toggle sidebar"
                >
                    <span className="material-symbols-outlined text-[18px]">
                        {collapsed ? "menu_open" : "left_panel_close"}
                    </span>
                </button>
            </div>

            {/* ── New Chat Button ── */}
            <div className="px-3 pb-3">
                <button
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-surface-4 hover:bg-surface-5 text-text-primary text-sm font-medium transition-all group"
                    onClick={() => {
                        onNewChat();
                        setMobileOpen(false);
                    }}
                >
                    <span className="material-symbols-outlined text-[18px] text-text-secondary group-hover:text-v-accent transition-colors">
                        add_comment
                    </span>
                    <span>New chat</span>
                </button>
            </div>

            {/* ── Divider ── */}
            <div className="mx-3 mb-2 border-t border-surface-6/40" />

            {/* ── Unified List ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-0.5"
                >
                    {/* Projects section */}
                    {sortedPipelines.length > 0 && (
                        <>
                            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                                Projects
                            </p>
                            {sortedPipelines.map((p) => (
                                <ProjectRow
                                    key={p.id}
                                    pipeline={p}
                                    linkedSessions={linked.get(p.id) || []}
                                    activeSessionId={activeSessionId}
                                    activePipelineId={activePipelineId}
                                    onSelectProject={onSelectProject}
                                    onSelectSession={onSelectSession}
                                    onCloseMobile={() => setMobileOpen(false)}
                                />
                            ))}
                        </>
                    )}

                    {/* Free chats section */}
                    {free.length > 0 && (
                        <>
                            {sortedPipelines.length > 0 && (
                                <div className="mx-1 my-2 border-t border-surface-6/40" />
                            )}
                            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                                {sortedPipelines.length > 0 ? "Chats libres" : "Chats"}
                            </p>
                            {free.map((s) => {
                                const isActive = activeSessionId === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${
                                            isActive
                                                ? "bg-accent-muted text-text-primary"
                                                : "hover:bg-surface-4/70 text-text-secondary"
                                        }`}
                                        onClick={() => {
                                            onSelectSession(s);
                                            setMobileOpen(false);
                                        }}
                                    >
                                        <span
                                            className={`material-symbols-outlined text-[14px] shrink-0 ${
                                                isActive ? "text-v-accent" : "text-text-tertiary"
                                            }`}
                                        >
                                            chat_bubble
                                        </span>
                                        <span className="text-sm truncate flex-1">
                                            {getSessionTitle(s)}
                                        </span>
                                        <span className="text-[10px] text-text-muted shrink-0">
                                            {getTimeAgo(s.updatedAt || s.createdAt)}
                                        </span>
                                    </button>
                                );
                            })}
                        </>
                    )}

                    {/* Empty state */}
                    {sessions.length === 0 && pipelines.length === 0 && (
                        <div className="px-4 py-10 text-center">
                            <span className="material-symbols-outlined text-3xl text-text-muted mb-2 block">
                                forum
                            </span>
                            <p className="text-xs text-text-tertiary">No conversations yet</p>
                            <p className="text-[10px] text-text-muted mt-1">Start a new chat to begin</p>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* ── Footer ── */}
            <div className="px-3 py-3 border-t border-surface-6/50">
                <button className="sidebar-item w-full text-text-tertiary hover:text-text-primary">
                    <span className="material-symbols-outlined text-[18px]">settings</span>
                    <span className="text-sm">Settings</span>
                </button>
            </div>
        </div>
    );

    return (
        <>
            {/* ── Desktop Sidebar ── */}
            <aside
                className={`hidden md:flex fixed left-0 top-0 h-screen z-40 transition-all duration-300 ease-in-out ${
                    collapsed ? "w-0 overflow-hidden" : "w-[280px]"
                }`}
            >
                {sidebarContent}
            </aside>

            {/* ── Mobile: Hamburger Button ── */}
            <button
                className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg glass-surface text-text-secondary hover:text-text-primary"
                onClick={() => setMobileOpen(true)}
            >
                <span className="material-symbols-outlined text-[22px]">menu</span>
            </button>

            {/* ── Mobile: Slide-in Drawer ── */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileOpen(false)}
                        />
                        <motion.aside
                            className="md:hidden fixed left-0 top-0 h-full w-[300px] max-w-[85vw] z-50"
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        >
                            {sidebarContent}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

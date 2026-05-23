import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { listChatSessions, listPipelines } from "../api/client";
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
}

const MODEL_LABELS: Record<string, string> = {
    "anthropic/claude-sonnet-4": "Claude Sonnet 4",
    "anthropic/claude-opus-4.6": "Claude Opus 4.6",
    "anthropic/claude-haiku-4-5": "Claude Haiku 4.5",
    "google/gemini-3.1-pro-preview": "Gemini 3.1 Pro",
    "google/gemini-2.5-flash": "Gemini 2.5 Flash",
    "openai/gpt-4o": "GPT-4o",
    "deepseek/deepseek-chat": "DeepSeek Chat",
};

type SidebarTab = "chats" | "projects";

export function Sidebar({
    activeSessionId,
    onSelectSession,
    onNewChat,
    onSelectProject,
    sessions,
    pipelines,
    collapsed,
    onToggleCollapse,
}: SidebarProps) {
    const [tab, setTab] = useState<SidebarTab>("chats");
    const [mobileOpen, setMobileOpen] = useState(false);

    const getSessionTitle = (s: ChatSession) => {
        const firstMsg = s.messages?.[0]?.content;
        if (firstMsg) return firstMsg.slice(0, 40) + (firstMsg.length > 40 ? "..." : "");
        return `Chat ${(s.id || "").slice(0, 6)}`;
    };

    const getTimeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    const getPhaseColor = (phase: string) => {
        switch (phase) {
            case "COMPLETED":
                return "text-status-success";
            case "FAILED":
                return "text-status-error";
            case "RUNNING":
            case "PLANNING":
            case "BUILDING":
                return "text-v-accent";
            default:
                return "text-text-tertiary";
        }
    };

    const getPhaseIcon = (phase: string) => {
        switch (phase) {
            case "COMPLETED":
                return "check_circle";
            case "FAILED":
                return "error";
            case "RUNNING":
            case "PLANNING":
            case "BUILDING":
                return "sync";
            default:
                return "pending";
        }
    };

    const sidebarContent = (
        <div className="flex flex-col h-full bg-surface-2">
            {/* ── Header ── */}
            <div className="px-4 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="VEIST" className="w-7 h-7" />
                    <span className="font-headline font-bold text-base text-text-primary tracking-tight">VEIST</span>
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

            {/* ── Tab Switcher ── */}
            <div className="px-3 pb-2 flex gap-1">
                <button
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        tab === "chats"
                            ? "bg-accent-muted text-v-accent"
                            : "text-text-tertiary hover:bg-surface-4 hover:text-text-secondary"
                    }`}
                    onClick={() => setTab("chats")}
                >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    Chats
                </button>
                <button
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        tab === "projects"
                            ? "bg-accent-muted text-v-accent"
                            : "text-text-tertiary hover:bg-surface-4 hover:text-text-secondary"
                    }`}
                    onClick={() => setTab("projects")}
                >
                    <span className="material-symbols-outlined text-[16px]">deployed_code</span>
                    Projects
                    {pipelines.filter((p) => p.phase === "RUNNING" || p.phase === "BUILDING" || p.phase === "PLANNING")
                        .length > 0 && <span className="w-2 h-2 rounded-full bg-v-accent animate-pulse-soft" />}
                </button>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
                <AnimatePresence mode="wait">
                    {tab === "chats" ? (
                        <motion.div
                            key="chats"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            transition={{ duration: 0.15 }}
                            className="flex flex-col gap-0.5"
                        >
                            {sessions.length === 0 ? (
                                <div className="px-4 py-8 text-center">
                                    <span className="material-symbols-outlined text-3xl text-text-muted mb-2 block">
                                        forum
                                    </span>
                                    <p className="text-xs text-text-tertiary">No conversations yet</p>
                                    <p className="text-2xs text-text-muted mt-1">Start a new chat to begin</p>
                                </div>
                            ) : (
                                sessions.map((s) => {
                                    const isActive = activeSessionId === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group flex flex-col gap-0.5 ${
                                                isActive
                                                    ? "bg-accent-muted text-text-primary"
                                                    : "hover:bg-surface-4 text-text-secondary"
                                            }`}
                                            onClick={() => {
                                                onSelectSession(s);
                                                setMobileOpen(false);
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`material-symbols-outlined text-[14px] shrink-0 ${isActive ? "text-v-accent" : "text-text-tertiary"}`}
                                                >
                                                    chat_bubble
                                                </span>
                                                <span className="text-sm truncate flex-1 font-medium">
                                                    {getSessionTitle(s)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 pl-[22px]">
                                                <span className="text-2xs text-text-muted truncate">
                                                    {MODEL_LABELS[s.model] || s.model || "Default"}
                                                </span>
                                                <span className="text-2xs text-text-muted">·</span>
                                                <span className="text-2xs text-text-muted">
                                                    {getTimeAgo(s.updatedAt || s.createdAt)}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="projects"
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.15 }}
                            className="flex flex-col gap-0.5"
                        >
                            {pipelines.length === 0 ? (
                                <div className="px-4 py-8 text-center">
                                    <span className="material-symbols-outlined text-3xl text-text-muted mb-2 block">
                                        rocket_launch
                                    </span>
                                    <p className="text-xs text-text-tertiary">No projects yet</p>
                                    <p className="text-2xs text-text-muted mt-1">Launch one from the chat</p>
                                </div>
                            ) : (
                                pipelines.map((p) => (
                                    <button
                                        key={p.id}
                                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface-4 transition-all group flex flex-col gap-1"
                                        onClick={() => {
                                            onSelectProject(p);
                                            setMobileOpen(false);
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`material-symbols-outlined text-[14px] shrink-0 ${getPhaseColor(p.phase)} ${
                                                    ["RUNNING", "BUILDING", "PLANNING"].includes(p.phase)
                                                        ? "animate-spin"
                                                        : ""
                                                }`}
                                            >
                                                {getPhaseIcon(p.phase)}
                                            </span>
                                            <span className="text-sm truncate flex-1 font-medium text-text-primary">
                                                {p.name || "Unnamed Project"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 pl-[22px]">
                                            <span className={`text-2xs font-medium ${getPhaseColor(p.phase)}`}>
                                                {p.phase}
                                            </span>
                                            {p.agents?.length > 0 && (
                                                <>
                                                    <span className="text-2xs text-text-muted">·</span>
                                                    <span className="text-2xs text-text-muted">
                                                        {p.agents.filter((a) => a.status === "active").length}/
                                                        {p.agents.length} agents
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
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

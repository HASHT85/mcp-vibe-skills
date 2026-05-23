import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    createChatSession,
    sendChatMessage,
    listChatSessions,
    getChatSession,
    launchFromChat,
    deleteChatSession,
    modifyPipeline,
    launchIdea,
    getRepoContext,
    connectAllSSE,
    getPipeline,
    saveSecrets,
} from "../api/client";
import type { ChatSession, ChatMessage, Pipeline } from "../api/client";

const MODEL_OPTIONS = [
    { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    { value: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
    { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
    { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
    { value: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
];

const QUICK_ACTIONS = [
    { icon: "rocket_launch", label: "Create", desc: "Build a new project" },
    { icon: "edit_note", label: "Modify", desc: "Edit existing project" },
    { icon: "search", label: "Research", desc: "Explore & analyze" },
    { icon: "bolt", label: "Quick Deploy", desc: "Deploy from GitHub" },
];

type AttachedFile = {
    name: string;
    type: string;
    data: string;
    size: number;
    error?: string;
    thumbnail?: string;
};

interface ChatViewProps {
    pipelines?: Pipeline[];
    onPipelineLaunched?: () => void;
    onRefresh?: () => void;
    activeSession: ChatSession | null;
    setActiveSession: (s: ChatSession | null) => void;
    sessions: ChatSession[];
    setSessions: (s: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])) => void;
    onOpenDetail?: (pipeline: Pipeline) => void;
}

export function ChatView({
    pipelines = [],
    onPipelineLaunched,
    onRefresh,
    activeSession,
    setActiveSession,
    sessions,
    setSessions,
    onOpenDetail,
}: ChatViewProps) {
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [model, setModel] = useState("anthropic/claude-sonnet-4");
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
    const [files, setFiles] = useState<AttachedFile[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [projectName, setProjectName] = useState("");
    const [githubUrl, setGithubUrl] = useState("");
    const [showModelPicker, setShowModelPicker] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modifyCleanupRef = useRef<(() => void) | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const linkablePipelines = pipelines.filter((p) => ["COMPLETED", "FAILED"].includes(p.phase));

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "24px";
            textareaRef.current.style.height = `${Math.max(24, Math.min(textareaRef.current.scrollHeight, 200))}px`;
        }
    }, [input]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeSession?.messages, sending]);

    // ─── File Handling ───
    const processFile = (f: File) => {
        if (f.size > 10 * 1024 * 1024) {
            setFiles((prev) => [...prev, { name: f.name, type: f.type, data: "", size: f.size, error: "Max 10MB" }]);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const base64 = result.split(",")[1];
            if (base64) {
                const thumbnail = f.type.startsWith("image/") ? result : undefined;
                setFiles((prev) => [...prev, { name: f.name, type: f.type, data: base64, size: f.size, thumbnail }]);
            }
        };
        reader.readAsDataURL(f);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) Array.from(e.target.files).forEach(processFile);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith("image/") || item.type === "application/pdf") {
                const f = item.getAsFile();
                if (f) {
                    processFile(f);
                    e.preventDefault();
                }
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(processFile);
    };

    const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

    // ─── Build AI content with project context ───
    const buildAiContent = async (msg: string, session: ChatSession) => {
        let aiContent = msg || "[Attached files]";
        if (selectedPipelineId) {
            const targetPipeline = linkablePipelines.find((p) => p.id === selectedPipelineId);
            if (targetPipeline && session.messages.length === 0) {
                const repoCtx = await getRepoContext(selectedPipelineId);
                const ctx = [
                    `[CONTEXTE PROJET - MODE MODIFICATION]`,
                    `Nom: ${targetPipeline.name || "N/A"}`,
                    `ID: ${targetPipeline.id}`,
                    `Phase: ${targetPipeline.phase}`,
                    `Description: ${targetPipeline.description || "N/A"}`,
                    targetPipeline.github ? `GitHub: ${targetPipeline.github.url}` : null,
                    repoCtx ? `\n# CONTENU DU REPO\n${repoCtx}` : null,
                    `---`,
                    `L'utilisateur veut MODIFIER ce projet existant. Voici sa demande :`,
                ]
                    .filter(Boolean)
                    .join("\n");
                aiContent = ctx + "\n" + aiContent;
            }
        }
        return aiContent;
    };

    // ─── Send message in active session ───
    const handleSend = async () => {
        if ((!input.trim() && files.length === 0) || !activeSession || sending) return;
        const msg = input.trim();
        const detectedUrl = msg.match(/https?:\/\/(?:www\.)?github\.com\/[^\s]+/);
        if (detectedUrl) {
            setGithubUrl(detectedUrl[0]);
            const matchName = detectedUrl[0].match(/github\.com\/[^\/]+\/([^\/\.]+)/);
            if (matchName?.[1]) setProjectName(matchName[1].toLowerCase().replace(/[^a-z0-9-]/g, "-"));
        }
        const attachedFiles = files.filter((f) => !f.error).map((f) => ({ base64: f.data, type: f.type }));
        setInput("");
        setFiles([]);
        setSending(true);
        const fileNames = attachedFiles.length > 0 ? `\n[📎 ${attachedFiles.length} file(s)]` : "";
        const displayContent = msg + fileNames;
        const aiContent = await buildAiContent(msg, activeSession);
        const optimisticMsg: ChatMessage = {
            role: "user",
            content: displayContent,
            timestamp: new Date().toISOString(),
        };
        setActiveSession({ ...activeSession, messages: [...activeSession.messages, optimisticMsg] });
        try {
            const data = await sendChatMessage(
                activeSession.id,
                aiContent,
                attachedFiles.length > 0 ? attachedFiles : undefined
            );
            setActiveSession(data.session);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
            setActiveSession({ ...activeSession, messages: activeSession.messages });
        } finally {
            setSending(false);
        }
    };

    // ─── Initial search (new session + send) ───
    const handleInitialSearch = async (prefill?: string) => {
        const msgText = prefill || input.trim();
        if ((!msgText && files.length === 0) || sending || launching) return;
        setSending(true);
        try {
            const data = await createChatSession(model);
            const newSession = data.session;
            setSessions((prev: ChatSession[]) => [newSession, ...prev]);
            const detectedUrl = msgText.match(/https?:\/\/(?:www\.)?github\.com\/[^\s]+/);
            if (detectedUrl) {
                setGithubUrl(detectedUrl[0]);
                const matchName = detectedUrl[0].match(/github\.com\/[^\/]+\/([^\/\.]+)/);
                if (matchName?.[1]) setProjectName(matchName[1].toLowerCase().replace(/[^a-z0-9-]/g, "-"));
            }
            const attachedFiles = files.filter((f) => !f.error).map((f) => ({ base64: f.data, type: f.type }));
            setInput("");
            setFiles([]);
            const fileNames = attachedFiles.length > 0 ? `\n[📎 ${attachedFiles.length} file(s)]` : "";
            const aiContent = await buildAiContent(msgText, newSession);
            const optimisticMsg: ChatMessage = {
                role: "user",
                content: msgText + fileNames,
                timestamp: new Date().toISOString(),
            };
            setActiveSession({ ...newSession, messages: [optimisticMsg] });
            const sendData = await sendChatMessage(
                newSession.id,
                aiContent,
                attachedFiles.length > 0 ? attachedFiles : undefined
            );
            setActiveSession(sendData.session);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setSending(false);
        }
    };

    // ─── Deploy / Modify action ───
    const handleAction = async () => {
        if (!activeSession || launching) return;
        setLaunching(true);
        try {
            if (selectedPipelineId) {
                const instructions = activeSession.messages
                    .filter((m) => m.role === "user")
                    .map((m) => m.content)
                    .join("\n");
                const attachedFiles = files.filter((f) => !f.error).map((f) => ({ base64: f.data, type: f.type }));
                await modifyPipeline(
                    selectedPipelineId,
                    instructions,
                    model,
                    attachedFiles.length > 0 ? attachedFiles : undefined
                );
                setFiles([]);
                setActiveSession({
                    ...activeSession,
                    messages: [
                        ...activeSession.messages,
                        {
                            role: "assistant",
                            content: `⚡ Modification dispatched → Pipeline ${selectedPipelineId.slice(0, 8)}...`,
                            timestamp: new Date().toISOString(),
                        },
                    ],
                });
                if (modifyCleanupRef.current) modifyCleanupRef.current();
                const closeSSE = connectAllSSE((event) => {
                    if (event.pipelineId !== selectedPipelineId) return;
                    const msg = `${event.agentEmoji || "📡"} **${(event.agentRole || "System").toUpperCase()}** — ${event.action}`;
                    setActiveSession((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  messages: [
                                      ...prev.messages,
                                      {
                                          role: "assistant",
                                          content: msg,
                                          timestamp: event.timestamp || new Date().toISOString(),
                                      },
                                  ],
                              }
                            : null
                    );
                });
                const pollInterval = setInterval(async () => {
                    try {
                        const result = await getPipeline(selectedPipelineId);
                        const phase = result?.pipeline?.phase;
                        if (phase === "COMPLETED" || phase === "FAILED") {
                            clearInterval(pollInterval);
                            closeSSE();
                            modifyCleanupRef.current = null;
                            setLaunching(false);
                            const icon = phase === "COMPLETED" ? "✅" : "❌";
                            setActiveSession((prev) =>
                                prev
                                    ? {
                                          ...prev,
                                          messages: [
                                              ...prev.messages,
                                              {
                                                  role: "assistant",
                                                  content: `${icon} Modification ${phase.toLowerCase()}.`,
                                                  timestamp: new Date().toISOString(),
                                              },
                                          ],
                                      }
                                    : null
                            );
                            onRefresh?.();
                        }
                    } catch {}
                }, 3000);
                modifyCleanupRef.current = () => {
                    clearInterval(pollInterval);
                    closeSSE();
                };
                onRefresh?.();
                return;
            } else {
                const askedName = window.prompt("Project name (leave empty for auto):", projectName);
                if (askedName === null) {
                    setLaunching(false);
                    return;
                }
                const result = await launchFromChat(
                    activeSession.id,
                    askedName.trim() || undefined,
                    undefined,
                    githubUrl.trim() || undefined
                );
                setActiveSession({
                    ...activeSession,
                    messages: [
                        ...activeSession.messages,
                        {
                            role: "assistant",
                            content: `🚀 Deployment initiated — "${askedName.trim() || "auto"}"`,
                            timestamp: new Date().toISOString(),
                        },
                    ],
                });
                setProjectName("");
                onPipelineLaunched?.();
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setLaunching(false);
        }
    };

    const selectedModelLabel = MODEL_OPTIONS.find((m) => m.value === model)?.label || "Model";

    // ═══════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════

    return (
        <div
            className={`flex-1 flex flex-col relative bg-surface-0 overflow-hidden ${dragOver ? "ring-2 ring-v-accent/30 ring-inset rounded-xl" : ""}`}
            onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,application/pdf,.txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.jsx,.py"
                className="hidden"
                multiple
            />

            {/* Drag overlay */}
            {dragOver && (
                <div className="absolute inset-0 z-50 bg-surface-0/90 flex flex-col items-center justify-center pointer-events-none rounded-xl">
                    <span className="material-symbols-outlined text-5xl text-v-accent mb-3 animate-bounce">
                        upload_file
                    </span>
                    <span className="text-v-accent text-sm font-semibold">Drop files here</span>
                </div>
            )}

            {!activeSession ? (
                /* ════════════ WELCOME SCREEN ════════════ */
                <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8">
                    <div className="w-full max-w-2xl flex flex-col items-center flex-1 justify-center -mt-8">
                        {/* Greeting */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="text-center mb-10"
                        >
                            <h1 className="text-3xl md:text-4xl font-headline font-bold text-text-primary tracking-tight mb-2">
                                What shall we build?
                            </h1>
                            <p className="text-text-secondary text-sm">
                                Describe your idea — VEIST agents will plan, code, and deploy it autonomously.
                            </p>
                        </motion.div>

                        {/* Input Pill */}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15, duration: 0.4 }}
                            className="w-full"
                        >
                            <div className="input-pill p-2.5 flex flex-col gap-2">
                                {/* Files preview inside pill */}
                                {files.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 px-2 pt-1">
                                        {files.map((f, i) => (
                                            <div
                                                key={i}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs ${f.error ? "bg-status-error/10 text-status-error border border-status-error/20" : "bg-surface-4 text-text-secondary border border-surface-6/50"}`}
                                            >
                                                {f.thumbnail ? (
                                                    <img
                                                        src={f.thumbnail}
                                                        alt=""
                                                        className="w-4 h-4 rounded object-cover"
                                                    />
                                                ) : (
                                                    <span className="material-symbols-outlined text-[13px]">
                                                        description
                                                    </span>
                                                )}
                                                <span className="truncate max-w-[100px] text-2xs font-medium">
                                                    {f.name}
                                                </span>
                                                <button
                                                    className="hover:text-text-primary ml-0.5"
                                                    onClick={() => removeFile(i)}
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-end gap-2">
                                    <button
                                        className="shrink-0 p-2 text-text-tertiary hover:text-text-primary transition-colors"
                                        onClick={() => fileInputRef.current?.click()}
                                        title="Attach files"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">attach_file</span>
                                    </button>
                                    <textarea
                                        ref={textareaRef}
                                        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none py-2 leading-relaxed max-h-[200px] overflow-y-auto custom-scrollbar"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                if (input.trim() || files.length > 0) handleInitialSearch();
                                            }
                                        }}
                                        onPaste={handlePaste}
                                        placeholder="Describe your idea, paste a GitHub link, or ask anything..."
                                        disabled={sending}
                                        rows={1}
                                    />
                                    {/* Model picker + Send */}
                                    <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
                                        <div className="relative">
                                            <button
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-2xs text-text-tertiary hover:text-text-secondary hover:bg-surface-4 transition-all font-medium"
                                                onClick={() => setShowModelPicker(!showModelPicker)}
                                            >
                                                <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                                                <span className="hidden sm:inline">{selectedModelLabel}</span>
                                                <span className="material-symbols-outlined text-[14px]">
                                                    expand_more
                                                </span>
                                            </button>
                                            {showModelPicker && (
                                                <div className="absolute bottom-full right-0 mb-2 w-56 bg-surface-3 border border-surface-6 rounded-xl shadow-elevated p-1.5 z-50 animate-fade-in">
                                                    {MODEL_OPTIONS.map((m) => (
                                                        <button
                                                            key={m.value}
                                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${model === m.value ? "bg-accent-muted text-v-accent font-medium" : "text-text-secondary hover:bg-surface-4 hover:text-text-primary"}`}
                                                            onClick={() => {
                                                                setModel(m.value);
                                                                setShowModelPicker(false);
                                                            }}
                                                        >
                                                            {m.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${input.trim() || files.length > 0 ? "bg-v-accent text-surface-0 hover:shadow-glow-sm" : "bg-surface-4 text-text-muted cursor-not-allowed"}`}
                                            onClick={() => handleInitialSearch()}
                                            disabled={(!input.trim() && files.length === 0) || sending}
                                        >
                                            {sending ? (
                                                <span className="material-symbols-outlined text-[18px] animate-spin">
                                                    progress_activity
                                                </span>
                                            ) : (
                                                <span className="material-symbols-outlined text-[18px]">
                                                    arrow_upward
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Quick Actions */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="flex flex-wrap gap-2 mt-5 justify-center"
                        >
                            {QUICK_ACTIONS.map((a) => (
                                <button
                                    key={a.label}
                                    className="action-chip"
                                    onClick={() => {
                                        setInput(a.desc + ": ");
                                        textareaRef.current?.focus();
                                    }}
                                >
                                    <span className="material-symbols-outlined text-[16px]">{a.icon}</span>
                                    {a.label}
                                </button>
                            ))}
                        </motion.div>
                    </div>
                </div>
            ) : (
                /* ════════════ ACTIVE CHAT ════════════ */
                <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 py-6 flex flex-col gap-5">
                        {activeSession.messages.length === 0 && (
                            <div className="text-center py-8 text-text-tertiary text-sm">
                                <span className="material-symbols-outlined text-2xl text-text-muted block mb-2">
                                    chat
                                </span>
                                Session ready. Send a message to start.
                            </div>
                        )}
                        <AnimatePresence initial={false}>
                            {activeSession.messages.map((msg, i) => {
                                const isUser = msg.role === "user";
                                const ts = msg.timestamp
                                    ? new Date(msg.timestamp).toLocaleTimeString("en-GB", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                      })
                                    : "";
                                return (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                                    >
                                        <div className={isUser ? "msg-user" : "msg-assistant max-w-[85%]"}>
                                            {!isUser && (
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <div className="w-5 h-5 rounded-md bg-v-accent/15 flex items-center justify-center">
                                                        <span className="text-v-accent text-2xs font-bold">V</span>
                                                    </div>
                                                    <span className="text-2xs text-text-tertiary font-medium">
                                                        VEIST
                                                    </span>
                                                    <span className="text-2xs text-text-muted">{ts}</span>
                                                </div>
                                            )}
                                            <div
                                                className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${isUser ? "text-text-primary" : "text-text-secondary"}`}
                                            >
                                                {msg.content}
                                            </div>
                                            {isUser && (
                                                <div className="text-2xs text-text-muted mt-1.5 text-right">{ts}</div>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>

                        {/* Typing indicator */}
                        {sending && (
                            <div className="flex justify-start">
                                <div className="msg-assistant flex items-center gap-2 py-3">
                                    <div className="w-5 h-5 rounded-md bg-v-accent/15 flex items-center justify-center">
                                        <span className="text-v-accent text-2xs font-bold">V</span>
                                    </div>
                                    <div className="flex gap-1">
                                        <div className="typing-dot" />
                                        <div className="typing-dot" />
                                        <div className="typing-dot" />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} className="h-2" />
                    </div>

                    {/* Bottom Input Bar */}
                    <div className="px-3 md:px-6 pb-4 pt-2 shrink-0">
                        {/* Files */}
                        {files.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2 px-1">
                                {files.map((f, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-2xs ${f.error ? "bg-status-error/10 text-status-error" : "bg-surface-4 text-text-secondary"}`}
                                    >
                                        <span className="material-symbols-outlined text-[12px]">
                                            {f.thumbnail ? "image" : "description"}
                                        </span>
                                        <span className="truncate max-w-[90px] font-medium">{f.name}</span>
                                        <button onClick={() => removeFile(i)}>
                                            <span className="material-symbols-outlined text-[11px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="input-pill p-2 flex items-end gap-2">
                            <button
                                className="shrink-0 p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <span className="material-symbols-outlined text-[18px]">attach_file</span>
                            </button>
                            <textarea
                                ref={textareaRef}
                                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none py-1.5 leading-relaxed max-h-[160px] overflow-y-auto custom-scrollbar"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                onPaste={handlePaste}
                                placeholder={selectedPipelineId ? "Describe modifications..." : "Send a message..."}
                                disabled={sending || launching}
                                rows={1}
                            />
                            <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
                                {activeSession.messages.length >= 2 && (
                                    <button
                                        className={`px-3 py-1.5 rounded-lg text-2xs font-semibold transition-all flex items-center gap-1.5 ${selectedPipelineId ? "text-v-alert hover:bg-v-alert/10 border border-v-alert/30" : "text-v-accent hover:bg-accent-muted border border-v-accent/30"}`}
                                        onClick={handleAction}
                                        disabled={launching || sending}
                                    >
                                        <span
                                            className={`material-symbols-outlined text-[14px] ${launching ? "animate-spin" : ""}`}
                                        >
                                            {launching
                                                ? "progress_activity"
                                                : selectedPipelineId
                                                  ? "edit_note"
                                                  : "rocket_launch"}
                                        </span>
                                        {launching ? "Running..." : selectedPipelineId ? "Modify" : "Deploy"}
                                    </button>
                                )}
                                <button
                                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${input.trim() || files.length > 0 ? "bg-v-accent text-surface-0 hover:shadow-glow-sm" : "bg-surface-4 text-text-muted cursor-not-allowed"}`}
                                    onClick={handleSend}
                                    disabled={(!input.trim() && files.length === 0) || sending || launching}
                                >
                                    {sending ? (
                                        <span className="material-symbols-outlined text-[16px] animate-spin">
                                            progress_activity
                                        </span>
                                    ) : (
                                        <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    createChatSession, sendChatMessage, listChatSessions, getChatSession, launchFromChat, deleteChatSession,
    modifyPipeline, launchIdea, getRepoContext, connectAllSSE, getPipeline, saveSecrets,
} from '../api/client';
import type { ChatSession, ChatMessage, Pipeline } from '../api/client';

const MODEL_OPTIONS = [
    { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
    { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
    { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
];

type AttachedFile = {
    name: string;
    type: string;
    data: string;    // base64
    size: number;
    error?: string;
    thumbnail?: string;
};

interface ChatViewProps {
    pipelines?: Pipeline[];
    onPipelineLaunched?: () => void;
    onRefresh?: () => void;
}

export function ChatView({ pipelines = [], onPipelineLaunched, onRefresh }: ChatViewProps) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [model, setModel] = useState('anthropic/claude-sonnet-4');
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
    const [files, setFiles] = useState<AttachedFile[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [projectName, setProjectName] = useState('');
    const [githubUrl, setGithubUrl] = useState('');
    const [secrets, setSecrets] = useState<{key: string; value: string}[]>([]);
    const [secretsExpanded, setSecretsExpanded] = useState(false);
    const [secretsVisible, setSecretsVisible] = useState<Set<number>>(new Set());
    const bottomRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modifyCleanupRef = useRef<(() => void) | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '30px'; // Reset height to recalculate
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = `${Math.max(30, Math.min(scrollHeight, 200))}px`;
        }
    }, [input]);

    // All pipelines for linking
    const linkablePipelines = pipelines.filter(p => ['COMPLETED', 'FAILED'].includes(p.phase));

    const loadSessions = useCallback(async () => {
        try {
            const data = await listChatSessions();
            setSessions(data.sessions || []);
        } catch {}
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages, sending]);

    // ─── File Handling ───

    const processFile = (f: File) => {
        const MAX_MB = 10;
        if (f.size > MAX_MB * 1024 * 1024) {
            setFiles(prev => [...prev, { name: f.name, type: f.type, data: '', size: f.size, error: `MAX ${MAX_MB}MB` }]);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const base64 = result.split(',')[1];
            if (base64) {
                const thumbnail = f.type.startsWith('image/') ? result : undefined;
                setFiles(prev => [...prev, { name: f.name, type: f.type, data: base64, size: f.size, thumbnail }]);
            }
        };
        reader.readAsDataURL(f);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) Array.from(e.target.files).forEach(processFile);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/') || item.type === 'application/pdf') {
                const f = item.getAsFile();
                if (f) { processFile(f); e.preventDefault(); }
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(processFile);
    };

    const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));

    // ─── Chat Logic ───

    const createNewSession = async () => {
        try {
            const data = await createChatSession(model);
            setActiveSession(data.session);
            setSessions(prev => [data.session, ...prev]);
        } catch (err: any) {
            alert(`SYS_ERR: ${err.message}`);
        }
    };

    const selectSession = async (s: ChatSession) => {
        // Set immediately with truncated data for responsiveness
        setActiveSession(s);
        // Sync model selector with session's model
        if (s.model) setModel(s.model);
        // Restore linked pipeline if any
        const pid = (s as any).projectId || '';
        setSelectedPipelineId(pid);
        // Sync projectName from linked pipeline or reset
        if (pid) {
            const linked = pipelines.find(p => p.id === pid);
            setProjectName(linked?.name || '');
        } else {
            setProjectName('');
        }
        setGithubUrl('');
        // Clear secrets — they're per-session, not global
        setSecrets([]);
        setSecretsExpanded(false);
        // Then fetch full session with all messages
        try {
            const data = await getChatSession(s.id);
            setActiveSession(data.session);
            if (data.session.model) setModel(data.session.model);
            const fullPid = (data.session as any).projectId || '';
            setSelectedPipelineId(fullPid);
            if (fullPid) {
                const linked = pipelines.find(p => p.id === fullPid);
                setProjectName(linked?.name || '');
            } else {
                setProjectName('');
            }
        } catch {
            // Keep truncated version if fetch fails
        }
    };

    const handleSend = async () => {
        if ((!input.trim() && files.length === 0) || !activeSession || sending) return;
        const msg = input.trim();
        const attachedFiles = files.filter(f => !f.error).map(f => ({ base64: f.data, type: f.type }));
        setInput('');
        setFiles([]);
        setSending(true);

        // Build display content (what the user sees)
        const fileNames = attachedFiles.length > 0 ? `\n[📎 ${attachedFiles.length} FILE(S) ATTACHED]` : '';
        const displayContent = msg + fileNames;

        // Build actual content sent to AI (with project context if linked)
        let aiContent = msg || '[Attached files]';
        if (selectedPipelineId) {
            const targetPipeline = linkablePipelines.find(p => p.id === selectedPipelineId);
            if (targetPipeline && activeSession.messages.length === 0) {
                // First message: inject full project context + repo contents
                const repoCtx = await getRepoContext(selectedPipelineId);
                const ctx = [
                    `[CONTEXTE PROJET - MODE MODIFICATION]`,
                    `Nom: ${targetPipeline.name || 'N/A'}`,
                    `ID: ${targetPipeline.id}`,
                    `Phase: ${targetPipeline.phase}`,
                    `Description: ${targetPipeline.description || 'N/A'}`,
                    targetPipeline.github ? `GitHub: ${targetPipeline.github.url}` : null,
                    repoCtx ? `\n# CONTENU DU REPO\n${repoCtx}` : null,
                    `---`,
                    `L'utilisateur veut MODIFIER ce projet existant. Voici sa demande :`,
                ].filter(Boolean).join('\n');
                aiContent = ctx + '\n' + aiContent;
            }
        }

        // Optimistic UI
        const optimisticMsg: ChatMessage = { role: 'user', content: displayContent, timestamp: new Date().toISOString() };
        setActiveSession(prev => prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : null);

        try {
            const data = await sendChatMessage(
                activeSession.id,
                aiContent,
                attachedFiles.length > 0 ? attachedFiles : undefined
            );
            setActiveSession(data.session);
        } catch (err: any) {
            alert(`SYS_ERR: ${err.message}`);
            setActiveSession(prev => prev ? {
                ...prev,
                messages: prev.messages.filter(m => m !== optimisticMsg),
            } : null);
        } finally {
            setSending(false);
        }
    };

    const handleAction = async () => {
        if (!activeSession || launching) return;
        setLaunching(true);
        try {
            if (selectedPipelineId) {
                // ─── MODIFY existing project ───
                const pipelineId = selectedPipelineId;
                const instructions = activeSession.messages
                    .filter(m => m.role === 'user')
                    .map(m => m.content)
                    .join('\n');
                const attachedFiles = files.filter(f => !f.error).map(f => ({ base64: f.data, type: f.type }));
                await modifyPipeline(pipelineId, instructions, model, attachedFiles.length > 0 ? attachedFiles : undefined);
                setFiles([]);

                // Add initial dispatched message
                setActiveSession(prev => prev ? {
                    ...prev,
                    messages: [...prev.messages, {
                        role: 'assistant',
                        content: `⚡ MODIFY_NODE DISPATCHED → Pipeline ${pipelineId.slice(0,8)}\n\n🔄 Streaming live progress below...`,
                        timestamp: new Date().toISOString(),
                    }],
                } : null);

                // Subscribe to SSE events for this pipeline
                if (modifyCleanupRef.current) modifyCleanupRef.current();
                const closeSSE = connectAllSSE((event) => {
                    if (event.pipelineId !== pipelineId) return;
                    const msg = `${event.agentEmoji || '📡'} **${(event.agentRole || 'System').toUpperCase()}** — ${event.action}`;
                    setActiveSession(prev => prev ? {
                        ...prev,
                        messages: [...prev.messages, {
                            role: 'assistant',
                            content: msg,
                            timestamp: event.timestamp || new Date().toISOString(),
                        }],
                    } : null);
                });

                // Poll pipeline status until COMPLETED or FAILED
                const pollInterval = setInterval(async () => {
                    try {
                        const result = await getPipeline(pipelineId);
                        const phase = result?.pipeline?.phase;
                        if (phase === 'COMPLETED' || phase === 'FAILED') {
                            clearInterval(pollInterval);
                            closeSSE();
                            modifyCleanupRef.current = null;
                            setLaunching(false);
                            const icon = phase === 'COMPLETED' ? '✅' : '❌';
                            setActiveSession(prev => prev ? {
                                ...prev,
                                messages: [...prev.messages, {
                                    role: 'assistant',
                                    content: `${icon} **MODIFICATION ${phase}** — Pipeline ${pipelineId.slice(0,8)} is now ${phase.toLowerCase()}.`,
                                    timestamp: new Date().toISOString(),
                                }],
                            } : null);
                            onRefresh?.();
                        }
                    } catch {}
                }, 3000);

                modifyCleanupRef.current = () => {
                    clearInterval(pollInterval);
                    closeSSE();
                };

                onRefresh?.();
                return; // Don't setLaunching(false) yet — polling will do it
            } else {
                // ─── CREATE new project ───
                const result = await launchFromChat(activeSession.id, projectName.trim() || undefined, undefined, githubUrl.trim() || undefined);
                const launchName = projectName.trim() || 'AUTO_NAMED';

                // Save secrets to vault if any are defined
                const validSecrets = secrets.filter(s => s.key.trim() && s.value.trim());
                if (validSecrets.length > 0 && result?.pipeline?.id) {
                    const secretsObj: Record<string, string> = {};
                    for (const s of validSecrets) secretsObj[s.key.trim()] = s.value.trim();
                    await saveSecrets(result.pipeline.id, secretsObj);
                }

                setActiveSession(prev => prev ? {
                    ...prev,
                    messages: [...prev.messages, {
                        role: 'assistant',
                        content: `DEPLOYMENT_INITIATED → Pipeline "${launchName}" spawned.${validSecrets.length > 0 ? ` 🔐 ${validSecrets.length} secret(s) saved to vault.` : ''} Orchestrator is bootstrapping agents.`,
                        timestamp: new Date().toISOString(),
                    }],
                } : null);
                setProjectName('');
                setSecrets([]);
                onPipelineLaunched?.();
            }
        } catch (err: any) {
            alert(`SYS_ERR: ${err.message}`);
        } finally {
            setLaunching(false);
        }
    };

    const handleDeleteSession = async (id: string) => {
        await deleteChatSession(id);
        setSessions(prev => prev.filter(s => s.id !== id));
        if (activeSession?.id === id) setActiveSession(null);
    };

    const selectedPipelineName = linkablePipelines.find(p => p.id === selectedPipelineId)?.name;

    const [showSessions, setShowSessions] = useState(false);

    return (
        <motion.div
            className="flex h-[calc(100vh-140px)] md:h-[calc(100vh-140px)] brutalist-border bg-v-bg font-mono relative"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
        >
            {/* Sessions sidebar - Slide-in Drawer for all screens */}
            <div className={`
                fixed inset-y-0 left-0 z-50
                w-[280px] max-w-[85vw]
                brutalist-border-r flex flex-col bg-v-surface overflow-hidden
                transition-transform duration-300 ease-in-out shadow-2xl
                ${showSessions ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="p-4 brutalist-border-b flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-v-accent">
                            <span className="material-symbols-outlined text-lg">forum</span>
                            <h3 className="text-sm font-black tracking-widest uppercase">Com_Link</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                className="bg-v-accent/20 hover:bg-v-accent/40 text-v-accent border border-v-accent/50 text-[10px] font-bold px-2 py-1 uppercase tracking-widest flex items-center transition-colors"
                                onClick={createNewSession} title="New Session"
                            >
                                <span className="material-symbols-outlined text-[12px]">add</span>
                            </button>
                            <button 
                                className="text-slate-400 hover:text-white p-1"
                                onClick={() => setShowSessions(false)}
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                    </div>
                    
                    {/* Model Selector */}
                    <div className="relative">
                        <select 
                            className="w-full bg-v-bg brutalist-border text-xs text-v-accent p-2 appearance-none outline-none focus:ring-0 rounded-none cursor-pointer"
                            value={model} 
                            onChange={(e) => setModel(e.target.value)}
                        >
                            {MODEL_OPTIONS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-v-accent pointer-events-none text-[16px]">expand_more</span>
                    </div>

                    {/* Link to Project (optional) */}
                    <div className="relative">
                        <label className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mb-1 block">LINK_TO_PROJECT</label>
                        <select
                            className="w-full bg-v-bg brutalist-border text-xs text-v-accent p-2 appearance-none outline-none focus:ring-0 rounded-none cursor-pointer"
                            value={selectedPipelineId}
                            onChange={(e) => setSelectedPipelineId(e.target.value)}
                        >
                            <option value="">[ NEW_PROJECT ]</option>
                            {linkablePipelines.map(p => (
                                <option key={p.id} value={p.id}>
                                    {(p.name || 'unnamed').replace(/\s+/g, '_').toUpperCase()} [{p.phase}]
                                </option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-2 bottom-2 text-v-accent pointer-events-none text-[16px]">expand_more</span>
                    </div>

                    {/* Project Name & GitHub URL (only when no project linked = new project mode) */}
                    {!selectedPipelineId && (
                            <div className="flex flex-col gap-3 mb-3">
                                <div>
                                    <label className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mb-1 block">GITHUB_URL (OPT.)</label>
                                    <input
                                        className="w-full bg-v-bg brutalist-border text-xs text-v-accent p-2 outline-none focus:ring-0 rounded-none placeholder:text-v-accent/20"
                                        value={githubUrl}
                                        onChange={(e) => {
                                            const url = e.target.value;
                                            setGithubUrl(url);
                                            // Auto-derive project name if URL is provided
                                            if (url) {
                                                const match = url.match(/github\.com\/[^\/]+\/([^\/\.]+)/);
                                                if (match && match[1]) {
                                                    setProjectName(match[1].toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                                                }
                                            } else {
                                                setProjectName('');
                                            }
                                        }}
                                        placeholder="https://github.com/owner/repo"
                                        spellCheck="false"
                                    />
                                </div>
                                
                                <div>
                                    <label className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mb-1 flex items-center justify-between">
                                        <span>PROJECT_ID (OPT.)</span>
                                        {githubUrl && <span className="text-v-accent/60 text-[8px] italic">AUTO-LINKED FROM REPO</span>}
                                    </label>
                                    <input
                                        className={`w-full brutalist-border text-xs p-2 outline-none focus:ring-0 rounded-none placeholder:text-v-accent/20 uppercase transition-all ${githubUrl ? 'bg-v-bg/50 text-v-accent/50 cursor-not-allowed border-v-accent/30' : 'bg-v-bg text-v-accent'}`}
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder={githubUrl ? "AUTO-DERIVED" : "AUTO_GENERATED"}
                                        spellCheck="false"
                                        disabled={!!githubUrl}
                                        title={githubUrl ? "Project ID is locked and derived from the GitHub repository URL" : ""}
                                    />
                                </div>
                            </div>
                    )}

                    {/* 🔐 Secrets Vault (only in NEW_PROJECT mode) */}
                    {!selectedPipelineId && (
                        <div className="brutalist-border">
                            <button
                                className="w-full flex items-center justify-between px-2 py-1.5 text-[9px] text-slate-400 font-bold tracking-widest uppercase hover:text-v-accent transition-colors"
                                onClick={() => setSecretsExpanded(!secretsExpanded)}
                            >
                                <span>🔐 SECRETS_VAULT {secrets.length > 0 && `(${secrets.length})`}</span>
                                <span className="material-symbols-outlined text-[14px]">{secretsExpanded ? 'expand_less' : 'expand_more'}</span>
                            </button>
                            {secretsExpanded && (
                                <div className="px-2 pb-2 flex flex-col gap-1.5">
                                    {secrets.map((s, i) => (
                                        <div key={i} className="flex gap-1 items-center">
                                            <input
                                                className="flex-1 bg-v-bg border border-slate-700 text-[10px] text-v-accent p-1.5 outline-none rounded-none placeholder:text-slate-600 uppercase font-mono"
                                                value={s.key}
                                                onChange={(e) => {
                                                    const updated = [...secrets];
                                                    updated[i] = { ...s, key: e.target.value };
                                                    setSecrets(updated);
                                                }}
                                                placeholder="KEY"
                                                spellCheck="false"
                                            />
                                            <input
                                                className="flex-1 bg-v-bg border border-slate-700 text-[10px] text-v-accent p-1.5 outline-none rounded-none placeholder:text-slate-600 font-mono"
                                                type={secretsVisible.has(i) ? "text" : "password"}
                                                value={s.value}
                                                onChange={(e) => {
                                                    const updated = [...secrets];
                                                    updated[i] = { ...s, value: e.target.value };
                                                    setSecrets(updated);
                                                }}
                                                placeholder="value"
                                                spellCheck="false"
                                            />
                                            <button
                                                className="text-slate-600 hover:text-v-accent shrink-0 transition-colors"
                                                onClick={() => {
                                                    setSecretsVisible(prev => {
                                                        const next = new Set(prev);
                                                        next.has(i) ? next.delete(i) : next.add(i);
                                                        return next;
                                                    });
                                                }}
                                                title={secretsVisible.has(i) ? "Hide" : "Show"}
                                                type="button"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">{secretsVisible.has(i) ? 'visibility_off' : 'visibility'}</span>
                                            </button>
                                            <button
                                                className="text-v-alert hover:text-red-400 shrink-0"
                                                onClick={() => setSecrets(secrets.filter((_, j) => j !== i))}
                                                title="Remove"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">close</span>
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        className="w-full text-[9px] text-slate-500 hover:text-v-accent border border-dashed border-slate-700 hover:border-v-accent py-1 transition-colors uppercase tracking-widest"
                                        onClick={() => setSecrets([...secrets, { key: '', value: '' }])}
                                    >
                                        + ADD_SECRET
                                    </button>
                                    <p className="text-[8px] text-slate-600 leading-tight mt-0.5">
                                        Injected into .env — never sent to AI
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-2 relative">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:10px_10px] pointer-events-none opacity-20" />
                    
                    {sessions.map(s => {
                        const isActive = activeSession?.id === s.id;
                        const modelLabel = MODEL_OPTIONS.find(m => m.value === s.model)?.label || s.model || 'N/A';
                        const linkedPipeline = pipelines.find(p => p.id === (s as any).projectId);
                        const chatTitle = linkedPipeline
                            ? `📦 ${linkedPipeline.name?.replace(/\s+/g, '_').toUpperCase() || 'PROJECT'}`
                            : (s.messages?.[0]?.content?.slice(0, 30) || `SESSION_${(s.id || '').slice(0,6)}`);
                        const linkedProject = !!(s as any).projectId;
                        return (
                            <div
                                key={s.id}
                                className={`flex items-center gap-3 p-3 cursor-pointer brutalist-border-b transition-colors relative z-10 ${
                                    isActive 
                                    ? 'bg-v-accent text-v-bg font-bold' 
                                    : 'bg-transparent text-slate-400 hover:bg-v-accent hover:text-v-bg'
                                }`}
                                onClick={() => selectSession(s)}
                            >
                                <span className="material-symbols-outlined text-[16px] shrink-0">{linkedProject ? 'deployed_code' : 'chat_bubble'}</span>
                                <div className="flex-1 overflow-hidden flex flex-col">
                                    <span className="text-xs font-bold tracking-wider truncate">
                                        {chatTitle}
                                    </span>
                                    <span className={`text-[9px] uppercase tracking-widest monospaced truncate mt-0.5 ${isActive ? 'opacity-70' : 'opacity-50'}`}>
                                        🤖 {modelLabel}
                                    </span>
                                    {linkedProject && !linkedPipeline && (
                                        <span className={`text-[9px] uppercase tracking-widest monospaced truncate mt-0.5 ${isActive ? 'opacity-70' : 'opacity-50'}`}>
                                            🔗 LINKED_PROJECT
                                        </span>
                                    )}
                                </div>
                                <button
                                    className={`p-1 rounded opacity-0 transition-opacity hover:bg-v-alert/20 text-v-alert ${isActive ? 'opacity-100 hover:text-white' : 'group-hover:opacity-100'}`}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                                    title="Purge Com_Link"
                                >
                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                            </div>
                        );
                    })}
                    {sessions.length === 0 && (
                        <div className="p-4 text-center text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed border border-dashed border-border-muted m-2 relative z-10 bg-black/50">
                            NO COM_LINKS ACTIVE.<br/>ESTABLISH NEW CONNECTION.
                        </div>
                    )}
                </div>
            </div>

            {/* Backdrop for sessions drawer */}
            {showSessions && (
                <div 
                    className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity"
                    onClick={() => setShowSessions(false)}
                />
            )}

            {/* Chat main area */}
            <div
                className={`flex-1 flex flex-col relative bg-v-bg overflow-hidden scanline ${dragOver ? 'ring-2 ring-v-accent ring-inset' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
            >
                {/* Hidden file input */}
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
                    <div className="absolute inset-0 z-50 bg-v-bg/90 flex flex-col items-center justify-center pointer-events-none">
                        <span className="material-symbols-outlined text-6xl text-v-accent mb-4 animate-bounce">upload_file</span>
                        <span className="text-v-accent text-sm font-black tracking-widest uppercase">DROP FILES HERE</span>
                    </div>
                )}

                {!activeSession ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10">
                        <span className="material-symbols-outlined text-6xl text-white/20 mb-6 font-light">terminal</span>
                        <h2 className="text-xl font-black text-white tracking-widest uppercase mb-2 font-sans">Com_Link Offline</h2>
                        <p className="text-v-accent text-xs max-w-sm mb-8 leading-relaxed opacity-70">Awaiting input connection parameters...</p>
                        <button 
                            className="bg-v-accent text-v-bg text-xs font-bold px-6 py-3 uppercase tracking-widest flex items-center gap-2 transition-colors hover:bg-white"
                            onClick={() => setShowSessions(true)}
                        >
                            <span className="material-symbols-outlined">menu</span>
                            <span>Open Link Interface</span>
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Minimalist Top Header */}
                        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#2A2F35] bg-[#0E1318] z-10 sticky top-0 backdrop-blur-md">
                            <button 
                                className="shrink-0 p-1 hover:bg-white/10 transition-colors rounded text-slate-400 hover:text-v-accent flex items-center justify-center"
                                onClick={() => setShowSessions(true)}
                            >
                                <span className="material-symbols-outlined text-[16px]">menu</span>
                            </button>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest shrink-0">~ / COM_LINK /</span>
                                {selectedPipelineName && (
                                    <span className="text-[10px] text-v-accent font-bold truncate">
                                        {selectedPipelineName.replace(/\s+/g, '_').toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <span className={`text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0 ${selectedPipelineId ? 'bg-v-alert/20 text-v-alert' : 'bg-v-accent/20 text-v-accent'}`}>
                                {selectedPipelineId ? '[ MODIFY ]' : '[ NEW ]'}
                            </span>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 flex flex-col gap-6 relative z-10 text-xs md:text-[13px] leading-relaxed" id="terminal-display">
                            {activeSession.messages.length === 0 && (
                                <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest border-l-2 border-[#2A2F35] pl-3 py-1">
                                    <span className="text-v-accent">[HANDSHAKE_VERIFIED]</span>{' '}
                                    {selectedPipelineId 
                                        ? 'LINK ESTABLISHED. DESCRIBE MODIFICATIONS FOR TARGET NODE...'
                                        : 'CONNECTION ESTABLISHED. INITIALIZING DATA STREAM... AWAITING INPUT PARAMETERS...'}
                                </div>
                            )}
                            <AnimatePresence initial={false}>
                                {activeSession.messages.map((msg, i) => {
                                    const ts = msg.timestamp 
                                        ? new Date(msg.timestamp).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
                                        : '';
                                    const isUser = msg.role === 'user';
                                    return (
                                        <motion.div
                                            key={i}
                                            className={`flex flex-col gap-1 max-w-4xl ${isUser ? 'ml-8' : 'mr-8'}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider mb-1">
                                                {isUser ? (
                                                    <>
                                                        <span className="text-v-accent">OPERATOR_01</span>
                                                        <span className="text-slate-600 font-normal">[{ts}]</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-white">SYS_RES</span>
                                                        <span className="text-slate-600 font-normal">[{ts}]</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className={`pl-3 py-0.5 ${isUser ? 'border-l-2 border-v-accent text-slate-300' : 'border-l-2 border-slate-600 text-slate-100'}`}>
                                                <div className="whitespace-pre-wrap font-mono break-words">{msg.content}</div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                            
                            {sending && (
                                <div className="flex flex-col gap-1 max-w-4xl mr-8">
                                    <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider mb-1">
                                        <span className="text-white animate-pulse">SYS_RES</span>
                                    </div>
                                    <div className="pl-3 py-0.5 border-l-2 border-slate-600">
                                        <span className="material-symbols-outlined text-v-accent animate-spin text-[14px] align-middle mr-2">sync</span>
                                        <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold align-middle">Processing stream...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} className="h-4" />
                        </div>

                        {/* Input Area - Condensed Terminal Style */}
                        <div className="px-3 pb-3 md:px-4 md:pb-4 pt-2 border-t flex flex-col gap-2 border-[#2A2F35] bg-[#0B0F14] relative z-10 w-full shrink-0">
                            {/* Attached Files Preview */}
                            {files.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-1 pl-2">
                                    {files.map((f, i) => (
                                        <div key={i} className={`flex items-center gap-1.5 p-1 bg-[#11161D] border ${f.error ? 'border-v-alert' : 'border-[#2A2F35]'} max-w-[160px] rounded-sm shadow-sm`}>
                                            {f.thumbnail ? (
                                                <img src={f.thumbnail} alt="preview" className="w-5 h-5 object-cover shrink-0" />
                                            ) : (
                                                <span className="material-symbols-outlined text-slate-400 text-[14px] shrink-0">description</span>
                                            )}
                                            <span className={`text-[9px] font-bold truncate flex-1 ${f.error ? 'text-v-alert' : 'text-slate-400'}`}>
                                                {f.name}
                                            </span>
                                            <button className="text-slate-500 hover:text-white shrink-0 ml-1" onClick={() => removeFile(i)}>
                                                <span className="material-symbols-outlined text-[12px]">close</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Streamlined Input Bar */}
                            <div className="flex items-end gap-2 w-full">
                                <div className="relative flex-1 group flex items-ends border border-[#2A2F35] focus-within:border-v-accent bg-[#11161D] transition-colors rounded-sm overflow-hidden">
                                    <div className="shrink-0 flex items-center justify-center p-2 text-v-accent font-bold select-none h-[42px]">
                                        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                                    </div>
                                    <textarea
                                        ref={textareaRef}
                                        className="w-full bg-transparent p-3 pl-0 text-xs md:text-[13px] text-white placeholder:text-slate-600 focus:outline-none focus:ring-0 font-mono resize-none min-h-[42px] max-h-[160px] overflow-y-auto leading-relaxed"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                if (input.trim() || files.length > 0) handleSend();
                                            }
                                        }}
                                        placeholder={selectedPipelineId ? "Inject instructions to modify project constraint parameters..." : "Initiate standard communication protocol or project specs..."}
                                        disabled={sending || launching}
                                        spellCheck="false"
                                    />
                                    <button
                                        className="shrink-0 text-slate-500 hover:text-v-accent p-2 self-start h-[42px] flex items-center justify-center transition-colors tooltip"
                                        onClick={() => fileInputRef.current?.click()}
                                        title="Attach context files"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">attach_file</span>
                                    </button>
                                </div>
                                
                                <button
                                    className={`shrink-0 h-[42px] px-3 md:px-5 flex items-center justify-center gap-1.5 font-bold text-[10px] md:text-xs uppercase tracking-widest rounded-sm transition-all shadow-md group ${
                                        (input.trim() || files.length > 0)
                                        ? 'bg-v-accent text-v-bg hover:bg-white'
                                        : 'bg-[#2A2F35] text-slate-500 cursor-not-allowed opacity-50'
                                    }`}
                                    onClick={handleSend}
                                    disabled={(!input.trim() && files.length === 0) || sending || launching}
                                >
                                    {(sending || launching) ? (
                                        <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">send</span>
                                    )}
                                    <span className="hidden sm:inline">Commit</span>
                                </button>
                                
                                {activeSession.messages.length >= 2 && (
                                     <button
                                         className={`shrink-0 h-[42px] px-3 md:px-5 flex items-center justify-center gap-1.5 font-bold text-[10px] md:text-xs uppercase tracking-widest rounded-sm transition-all shadow-md group opacity-90 hover:opacity-100 ${
                                             selectedPipelineId
                                             ? 'border border-v-alert text-v-alert hover:bg-v-alert hover:text-v-bg'
                                             : 'border border-v-accent text-v-accent hover:bg-v-accent hover:text-v-bg'
                                         }`}
                                         onClick={handleAction}
                                         disabled={launching || sending}
                                     >
                                         <span className={`material-symbols-outlined text-[16px] ${launching ? 'animate-bounce' : ''}`}>
                                             {selectedPipelineId ? 'edit_square' : 'rocket_launch'}
                                         </span>
                                         <span className="hidden sm:inline">{launching ? 'EXEC...' : (selectedPipelineId ? 'MODIFY' : 'DEPLOY')}</span>
                                     </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
}

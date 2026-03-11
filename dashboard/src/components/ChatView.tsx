import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    createChatSession, sendChatMessage, listChatSessions, getChatSession, launchFromChat, deleteChatSession,
    modifyPipeline, launchIdea, getRepoContext, connectAllSSE, getPipeline,
} from '../api/client';
import type { ChatSession, ChatMessage, Pipeline } from '../api/client';

const MODEL_OPTIONS = [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
    { value: 'gemini-3.0-pro', label: 'Gemini 3.0 Pro' },
    { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
];

type ChatMode = 'new' | 'modify';

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
    const [model, setModel] = useState('claude-sonnet-4-6');
    const [mode, setMode] = useState<ChatMode>('new');
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
    const [files, setFiles] = useState<AttachedFile[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [projectName, setProjectName] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const modifyCleanupRef = useRef<(() => void) | null>(null);

    // Filter pipelines that can be modified (COMPLETED or FAILED)
    const modifiablePipelines = pipelines.filter(p => ['COMPLETED', 'FAILED'].includes(p.phase));

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
        // Then fetch full session with all messages
        try {
            const data = await getChatSession(s.id);
            setActiveSession(data.session);
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

        // Build actual content sent to AI (with project context in modify mode)
        let aiContent = msg || '[Attached files]';
        if (mode === 'modify' && selectedPipelineId) {
            const targetPipeline = modifiablePipelines.find(p => p.id === selectedPipelineId);
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
            if (mode === 'modify' && selectedPipelineId) {
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
                await launchFromChat(activeSession.id, projectName.trim() || undefined);
                const launchName = projectName.trim() || 'AUTO_NAMED';
                setActiveSession(prev => prev ? {
                    ...prev,
                    messages: [...prev.messages, {
                        role: 'assistant',
                        content: `DEPLOYMENT_INITIATED → Pipeline "${launchName}" spawned. Orchestrator is bootstrapping agents.`,
                        timestamp: new Date().toISOString(),
                    }],
                } : null);
                setProjectName('');
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

    const selectedPipelineName = modifiablePipelines.find(p => p.id === selectedPipelineId)?.name;

    return (
        <motion.div
            className="flex h-[calc(100vh-140px)] brutalist-border bg-v-bg font-mono"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
        >
            {/* Sessions sidebar */}
            <div className="w-1/3 md:w-1/4 max-w-[300px] min-w-[200px] brutalist-border-r flex flex-col bg-v-surface overflow-hidden">
                <div className="p-4 brutalist-border-b flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-v-accent">
                            <span className="material-symbols-outlined text-lg">forum</span>
                            <h3 className="text-sm font-black tracking-widest uppercase">Com_Link</h3>
                        </div>
                        <button 
                            className="bg-v-accent/20 hover:bg-v-accent/40 text-v-accent border border-v-accent/50 text-[10px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors relative z-10"
                            onClick={createNewSession}
                        >
                            <span className="material-symbols-outlined text-[12px]">add</span> NEW
                        </button>
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

                    {/* Mode Selector: NEW vs MODIFY */}
                    <div className="flex gap-0">
                        <button
                            className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2 px-1 flex items-center justify-center gap-1 transition-colors border-2 ${
                                mode === 'new'
                                ? 'bg-v-accent text-v-bg border-v-accent'
                                : 'bg-transparent text-slate-400 border-v-accent/30 hover:text-v-accent'
                            }`}
                            onClick={() => setMode('new')}
                        >
                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                            NEW
                        </button>
                        <button
                            className={`flex-1 text-[10px] font-black uppercase tracking-widest py-2 px-1 flex items-center justify-center gap-1 transition-colors border-2 border-l-0 ${
                                mode === 'modify'
                                ? 'bg-v-accent text-v-bg border-v-accent'
                                : 'bg-transparent text-slate-400 border-v-accent/30 hover:text-v-accent'
                            }`}
                            onClick={() => setMode('modify')}
                        >
                            <span className="material-symbols-outlined text-[14px]">edit_square</span>
                            MODIFY
                        </button>
                    </div>

                    {/* Project Name (only in new mode) */}
                    {mode === 'new' && (
                        <div>
                            <label className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mb-1 block">PROJECT_ID (OPT.)</label>
                            <input
                                className="w-full bg-v-bg brutalist-border text-xs text-v-accent p-2 outline-none focus:ring-0 rounded-none placeholder:text-v-accent/20 uppercase"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="AUTO_GENERATED"
                                spellCheck="false"
                            />
                        </div>
                    )}

                    {/* Pipeline Selector (only in modify mode) */}
                    {mode === 'modify' && (
                        <div className="relative">
                            <label className="text-[9px] text-v-alert font-bold tracking-widest uppercase mb-1 block">TARGET_NODE</label>
                            <select
                                className="w-full bg-v-bg brutalist-border text-xs text-v-accent p-2 appearance-none outline-none focus:ring-0 rounded-none cursor-pointer"
                                value={selectedPipelineId}
                                onChange={(e) => setSelectedPipelineId(e.target.value)}
                            >
                                <option value="">[ SELECT_PROJECT ]</option>
                                {modifiablePipelines.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {(p.name || 'unnamed').replace(/\s+/g, '_').toUpperCase()} [{p.phase}]
                                    </option>
                                ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-2 bottom-2 text-v-accent pointer-events-none text-[16px]">expand_more</span>
                        </div>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-2 relative">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:10px_10px] pointer-events-none opacity-20" />
                    
                    {sessions.map(s => {
                        const isActive = activeSession?.id === s.id;
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
                                <span className="material-symbols-outlined text-[16px] shrink-0">chat_bubble</span>
                                <div className="flex-1 overflow-hidden flex flex-col">
                                    <span className="text-xs font-bold tracking-wider truncate">
                                        {s.messages?.[0]?.content?.slice(0, 30) || `SESSION_${(s.id || '').slice(0,6)}`}
                                    </span>
                                    <span className="text-[9px] uppercase tracking-widest monospaced opacity-50 truncate mt-0.5">
                                        ID: {s.id}
                                    </span>
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
                        <span className="material-symbols-outlined text-6xl text-white/20 mb-6 font-light">speaker_notes_off</span>
                        <h2 className="text-xl font-black text-white tracking-widest uppercase mb-2 font-sans">Com_Link Offline</h2>
                        <p className="text-v-accent text-xs max-w-sm mb-8 leading-relaxed">Establish a connection to discuss architectural parameters prior to matrix deployment.</p>
                        <button 
                            className="bg-v-accent text-v-bg text-xs font-bold px-6 py-3 uppercase tracking-widest flex items-center gap-2 transition-colors hover:bg-white"
                            onClick={createNewSession}
                        >
                            <span className="material-symbols-outlined">cable</span>
                            <span>Initialize Connection</span>
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Header bar */}
                        <div className="bg-v-accent text-v-bg px-4 py-1 font-black flex justify-between items-center font-sans tracking-tight z-10 relative">
                            <div className="flex items-center gap-3">
                                <span>{mode === 'modify' ? 'MODIFY_STREAM' : 'LOG_READOUT_STREAM'}</span>
                                {mode === 'modify' && selectedPipelineName && (
                                    <span className="text-[10px] bg-v-bg text-v-accent px-2 py-0.5 font-mono">
                                        → {selectedPipelineName.replace(/\s+/g, '_').toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] uppercase">
                                {mode === 'modify' ? 'MODE: MODIFY_NODE' : 'MODE: NEW_PROJECT'}
                            </span>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative z-10 bg-v-bg text-sm leading-relaxed" id="terminal-display">
                            {activeSession.messages.length === 0 && (
                                <div className="p-4 brutalist-border bg-v-surface text-v-accent text-xs font-bold tracking-widest uppercase flex items-center gap-3 w-fit mx-auto mt-4">
                                    <span className="material-symbols-outlined animate-pulse">sensors</span>
                                    <span>
                                        {mode === 'modify' 
                                            ? 'Connection Established. Describe modifications for target node...'
                                            : 'Connection Established. Awaiting Input Parameters...'}
                                    </span>
                                </div>
                            )}
                            <AnimatePresence initial={false}>
                                {activeSession.messages.map((msg, i) => (
                                    <motion.div
                                        key={i}
                                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%] ${msg.role === 'user' ? 'ml-auto' : 'mr-auto'}`}
                                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            {msg.role === 'user' ? (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">&gt;&gt; USER_EXEC</span>
                                            ) : (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-v-accent">&gt;&gt; SYS_RES</span>
                                            )}
                                        </div>
                                        <div 
                                            className={`p-4 text-sm leading-relaxed ${
                                                msg.role === 'user' 
                                                ? 'bg-v-surface text-white border-l-2 border-white' 
                                                : 'text-v-accent bg-v-bg'
                                            }`}
                                        >
                                            <div className="whitespace-pre-wrap font-mono uppercase">{msg.content}</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            
                            {sending && (
                                <div className="flex flex-col items-start max-w-[85%] mr-auto">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-v-accent">&gt;&gt; SYS_RES</span>
                                    </div>
                                    <div className="p-4 text-v-accent bg-v-bg flex items-center gap-3 min-w-[120px]">
                                        <span className="material-symbols-outlined text-v-accent animate-spin text-[18px]">sync</span>
                                        <span className="text-[10px] uppercase tracking-widest font-bold monospaced relative after:content-[''] after:animate-ping after:absolute after:right-[-10px] after:bottom-[2px] after:w-1 after:h-1 after:bg-v-accent after:rounded-full">Processing</span>
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} className="h-4" />
                        </div>

                        {/* Attached Files Preview */}
                        {files.length > 0 && (
                            <div className="px-4 py-2 border-t border-v-accent/30 bg-v-surface/50 flex flex-wrap gap-2 relative z-10">
                                {files.map((f, i) => (
                                    <div key={i} className={`flex items-center gap-2 p-2 bg-v-bg border ${f.error ? 'border-v-alert' : 'border-v-accent/30'} max-w-[200px]`}>
                                        {f.thumbnail ? (
                                            <img src={f.thumbnail} alt="preview" className="w-8 h-8 object-cover border border-white/20 shrink-0" />
                                        ) : (
                                            <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0">description</span>
                                        )}
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className={`text-[10px] font-bold truncate ${f.error ? 'text-v-alert' : 'text-slate-300'}`}>
                                                {f.name}
                                            </span>
                                            {f.error && <span className="text-[9px] text-v-alert font-black tracking-widest">{f.error}</span>}
                                            {!f.error && <span className="text-[9px] text-slate-500">{(f.size / 1024).toFixed(1)}KB</span>}
                                        </div>
                                        <button className="text-slate-500 hover:text-white transition-colors shrink-0" onClick={() => removeFile(i)}>
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Input Area */}
                        <div className="p-4 border-t-2 border-v-accent bg-v-bg flex flex-col gap-3 relative z-10">
                            {/* Toolbar */}
                            <div className="flex justify-between items-center px-2">
                                <div className="flex items-center gap-2">
                                    {/* Attach button */}
                                    <button
                                        className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-slate-400 hover:text-v-accent uppercase px-2 py-1 border border-transparent hover:border-v-accent/30 transition-colors"
                                        onClick={() => fileInputRef.current?.click()}
                                        title="Attach files (images, PDF, code) or paste with Ctrl+V"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">attach_file</span>
                                        ATTACH
                                    </button>

                                    {mode === 'modify' && !selectedPipelineId && (
                                        <span className="text-[10px] text-v-alert font-bold tracking-widest uppercase flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">warning</span>
                                            SELECT TARGET
                                        </span>
                                    )}
                                    {mode === 'modify' && selectedPipelineId && (
                                        <span className="text-[10px] text-v-nominal font-bold tracking-widest uppercase flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                            LOCKED
                                        </span>
                                    )}
                                </div>

                                {activeSession.messages.length >= 2 && (
                                    <button
                                        className={`text-[10px] font-black px-4 py-1.5 uppercase tracking-widest flex items-center gap-2 transition-colors relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed ${
                                            mode === 'modify'
                                            ? 'bg-v-alert text-white hover:bg-white hover:text-v-bg'
                                            : 'bg-v-accent text-v-bg hover:bg-white'
                                        }`}
                                        onClick={handleAction}
                                        disabled={launching || sending || (mode === 'modify' && !selectedPipelineId)}
                                        title={mode === 'modify' ? 'Execute Modification Protocol' : 'Execute Pipeline Deployment Protocol'}
                                    >
                                        <span className={`material-symbols-outlined text-[14px] ${launching ? 'animate-bounce' : ''}`}>
                                            {mode === 'modify' ? 'edit_square' : 'rocket_launch'}
                                        </span>
                                        {launching 
                                            ? 'EXECUTING...' 
                                            : (mode === 'modify' ? 'EXECUTE_MODIFY' : 'INITIATE_DEPLOYMENT')
                                        }
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-3">
                                <label className="font-black text-xl text-white">&gt;</label>
                                <input
                                    className="bg-transparent border-none focus:ring-0 p-0 text-v-accent font-mono text-lg flex-grow uppercase placeholder:text-v-accent/30 w-full"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    onPaste={handlePaste}
                                    placeholder={mode === 'modify' ? 'DESCRIBE MODIFICATIONS...' : 'ENTER COMMAND...'}
                                    disabled={sending}
                                    autoFocus
                                    spellCheck="false"
                                />
                                <button
                                    className="bg-v-accent text-v-bg px-6 py-1 font-black hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={handleSend}
                                    disabled={(!input.trim() && files.length === 0) || sending}
                                    title="Execute [Enter]"
                                >
                                    EXECUTE
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
}

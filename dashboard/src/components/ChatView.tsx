import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    createChatSession, sendChatMessage, listChatSessions, launchFromChat, deleteChatSession,
} from '../api/client';
import type { ChatSession, ChatMessage } from '../api/client';

const MODEL_OPTIONS = [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
    { value: 'gemini-3.0-pro', label: 'Gemini 3.0 Pro' },
    { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
];

export function ChatView({ onPipelineLaunched }: { onPipelineLaunched?: () => void }) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [model, setModel] = useState('claude-sonnet-4-6');
    const bottomRef = useRef<HTMLDivElement>(null);

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

    const createNewSession = async () => {
        try {
            const data = await createChatSession(model);
            setActiveSession(data.session);
            setSessions(prev => [data.session, ...prev]);
        } catch (err: any) {
            alert(`SYS_ERR: ${err.message}`);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || !activeSession || sending) return;
        const msg = input.trim();
        setInput('');
        setSending(true);

        // Optimistic UI: add user message immediately
        const optimisticMsg: ChatMessage = { role: 'user', content: msg, timestamp: new Date().toISOString() };
        setActiveSession(prev => prev ? {
            ...prev,
            messages: [...prev.messages, optimisticMsg],
        } : null);

        try {
            const data = await sendChatMessage(activeSession.id, msg);
            setActiveSession(data.session);
        } catch (err: any) {
            alert(`SYS_ERR: ${err.message}`);
            // Revert optimistic update
            setActiveSession(prev => prev ? {
                ...prev,
                messages: prev.messages.filter(m => m !== optimisticMsg),
            } : null);
        } finally {
            setSending(false);
        }
    };

    const handleLaunch = async () => {
        if (!activeSession || launching) return;
        setLaunching(true);
        try {
            await launchFromChat(activeSession.id);
            onPipelineLaunched?.();
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
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-2 relative">
                    {/* Background Grid Pattern */}
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
                                onClick={() => setActiveSession(s)}
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
            <div className="flex-1 flex flex-col relative bg-v-bg overflow-hidden scanline">
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
                        <div className="bg-v-accent text-v-bg px-4 py-1 font-black flex justify-between items-center font-sans tracking-tight z-10 relative">
                            <span>LOG_READOUT_STREAM</span>
                            <span className="text-[10px] uppercase">T-MINUS 00:04:12</span>
                        </div>
                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative z-10 bg-v-bg text-sm leading-relaxed" id="terminal-display">
                            {activeSession.messages.length === 0 && (
                                <div className="p-4 brutalist-border bg-v-surface text-v-accent text-xs font-bold tracking-widest uppercase flex items-center gap-3 w-fit mx-auto mt-4">
                                    <span className="material-symbols-outlined animate-pulse">sensors</span>
                                    <span>Connection Established. Awaiting Input Parameters...</span>
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

                        {/* Input Area */}
                        <div className="p-4 border-t-2 border-v-accent bg-v-bg flex flex-col gap-3 relative z-10">
                            {/* Toolbar */}
                            <div className="flex justify-end px-2">
                                {activeSession.messages.length >= 2 && (
                                    <button
                                        className="bg-v-accent text-v-bg text-[10px] font-black px-4 py-1.5 uppercase tracking-widest flex items-center gap-2 transition-colors relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white"
                                        onClick={handleLaunch}
                                        disabled={launching || sending}
                                        title="Execute Pipeline Deployment Protocol"
                                    >
                                        <span className={`material-symbols-outlined text-[14px] ${launching ? 'animate-bounce' : ''}`}>rocket_launch</span>
                                        {launching ? 'EXECUTING...' : 'INITIATE_DEPLOYMENT'}
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
                                    placeholder="ENTER COMMAND..."
                                    disabled={sending}
                                    autoFocus
                                    spellCheck="false"
                                />
                                <button
                                    className="bg-v-accent text-v-bg px-6 py-1 font-black hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={handleSend}
                                    disabled={!input.trim() || sending}
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

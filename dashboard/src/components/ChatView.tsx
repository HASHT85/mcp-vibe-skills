import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    createChatSession, sendChatMessage, listChatSessions, launchFromChat, deleteChatSession,
} from '../api/client';
import type { ChatSession, ChatMessage } from '../api/client';

const MODEL_OPTIONS = [
    { value: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
    { value: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
];

export function ChatView({ onPipelineLaunched }: { onPipelineLaunched?: () => void }) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [model, setModel] = useState('claude-3-7-sonnet-latest');
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
            className="flex h-[calc(100vh-140px)] bg-panel border border-border-muted"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
        >
            {/* Sessions sidebar */}
            <div className="w-1/3 md:w-1/4 max-w-[300px] min-w-[200px] border-r border-border-muted flex flex-col bg-background-dark overflow-hidden">
                <div className="p-4 border-b border-border-muted flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white">
                            <span className="material-symbols-outlined text-accent text-lg">forum</span>
                            <h3 className="text-sm font-black tracking-widest uppercase">Com_Link</h3>
                        </div>
                        <button 
                            className="bg-primary/20 hover:bg-primary/40 text-primary border border-primary/50 text-[10px] font-bold px-2 py-1 uppercase tracking-widest flex items-center gap-1 transition-colors"
                            onClick={createNewSession}
                        >
                            <span className="material-symbols-outlined text-[12px]">add</span> NEW
                        </button>
                    </div>
                    
                    <div className="relative">
                        <select 
                            className="w-full bg-black border border-border-muted text-xs text-slate-300 p-2 appearance-none outline-none focus:border-accent rounded-none"
                            value={model} 
                            onChange={(e) => setModel(e.target.value)}
                        >
                            {MODEL_OPTIONS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[16px]">expand_more</span>
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
                                className={`flex items-center gap-3 p-3 cursor-pointer border transition-colors relative z-10 ${
                                    isActive 
                                    ? 'bg-accent/10 border-accent/50 text-white' 
                                    : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10 hover:border-white/20'
                                }`}
                                onClick={() => setActiveSession(s)}
                            >
                                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent shadow-[0_0_10px_rgba(212,255,0,0.8)]"></div>}
                                
                                <span className={`material-symbols-outlined text-[16px] shrink-0 ${isActive ? 'text-accent' : ''}`}>chat_bubble</span>
                                <div className="flex-1 overflow-hidden flex flex-col">
                                    <span className="text-xs font-bold tracking-wider truncate">
                                        {s.messages?.[0]?.content?.slice(0, 30) || `SESSION_${s.id.slice(0,6)}`}
                                    </span>
                                    <span className="text-[9px] uppercase tracking-widest monospaced opacity-50 truncate mt-0.5">
                                        ID: {s.id}
                                    </span>
                                </div>
                                <button
                                    className={`p-1 rounded opacity-0 transition-opacity hover:bg-red-500/20 text-red-500 ${isActive ? 'opacity-100' : 'group-hover:opacity-100'}`}
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
            <div className="flex-1 flex flex-col relative bg-black overflow-hidden scanline">
                {!activeSession ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10">
                        <span className="material-symbols-outlined text-6xl text-slate-700 mb-6 drop-shadow-[0_0_15px_rgba(0,0,0,1)]">speaker_notes_off</span>
                        <h2 className="text-xl font-black text-white tracking-widest uppercase mb-2">Com_Link Offline</h2>
                        <p className="text-slate-400 text-xs max-w-sm mb-8">Establish a connection to discuss architectural parameters prior to matrix deployment.</p>
                        <button 
                            className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 text-xs font-bold px-6 py-3 uppercase tracking-widest flex items-center gap-2 transition-colors relative overflow-hidden group"
                            onClick={createNewSession}
                        >
                            <span className="absolute inset-0 bg-primary/10 translate-y-[100%] group-hover:translate-y-0 transition-transform"></span>
                            <span className="material-symbols-outlined relative z-10">cable</span>
                            <span className="relative z-10">Initialize Connection</span>
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative z-10">
                            {activeSession.messages.length === 0 && (
                                <div className="p-4 border border-accent/30 bg-accent/5 text-accent text-xs font-bold tracking-widest uppercase flex items-center gap-3 w-fit mx-auto mt-4 backdrop-blur-sm">
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
                                        <div className="flex items-center gap-2 mb-1 opacity-70">
                                            {msg.role === 'user' ? (
                                                <>
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-primary">Operative</span>
                                                    <span className="material-symbols-outlined text-[12px] text-primary">person</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-[12px] text-accent">smart_toy</span>
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-accent">VibeCraft_AI</span>
                                                </>
                                            )}
                                        </div>
                                        <div 
                                            className={`p-4 text-sm leading-relaxed border relative shadow-xl ${
                                                msg.role === 'user' 
                                                ? 'bg-primary/10 border-primary/30 text-slate-200' 
                                                : 'bg-panel/80 border-border-muted text-slate-300 backdrop-blur-md'
                                            }`}
                                        >
                                            {/* Decorative Corner Elements */}
                                            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20"></div>
                                            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20"></div>
                                            
                                            <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            
                            {sending && (
                                <div className="flex flex-col items-start max-w-[85%] mr-auto">
                                    <div className="flex items-center gap-2 mb-1 opacity-70">
                                        <span className="material-symbols-outlined text-[12px] text-accent">smart_toy</span>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-accent">VibeCraft_AI</span>
                                    </div>
                                    <div className="p-4 border border-border-muted bg-panel/80 flex items-center gap-3 backdrop-blur-md min-w-[120px]">
                                        <span className="material-symbols-outlined text-accent animate-spin text-[18px]">sync</span>
                                        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold monospaced relative after:content-[''] after:animate-ping after:absolute after:right-[-10px] after:bottom-[2px] after:w-1 after:h-1 after:bg-accent after:rounded-full">Processing</span>
                                    </div>
                                </div>
                            )}
                            <div ref={bottomRef} className="h-4" />
                        </div>

                        {/* Input Area */}
                        <div className="border-t border-border-muted bg-background-dark p-4 relative z-10 flex flex-col gap-3">
                            {/* Toolbar */}
                            <div className="flex justify-end px-2">
                                {activeSession.messages.length >= 2 && (
                                    <button
                                        className="bg-accent/20 hover:bg-accent/40 text-accent border border-accent/50 text-[10px] font-black px-4 py-1.5 uppercase tracking-widest flex items-center gap-2 transition-colors relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={handleLaunch}
                                        disabled={launching || sending}
                                        title="Execute Pipeline Deployment Protocol from current context"
                                    >
                                        <span className={`material-symbols-outlined text-[14px] ${launching ? 'animate-bounce' : ''}`}>rocket_launch</span>
                                        {launching ? 'EXECUTING...' : 'INITIATE_DEPLOYMENT'}
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex gap-2 relative">
                                <div className="flex-1 relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-slate-500 font-bold monospaced text-sm select-none">&gt;</span>
                                    </div>
                                    <input
                                        className="w-full bg-black border border-border-muted text-sm text-white pl-8 pr-4 py-3 appearance-none outline-none focus:border-primary/50 transition-colors rounded-none placeholder:text-slate-600 font-medium font-sans"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        placeholder="Enter architectural directives..."
                                        disabled={sending}
                                        autoFocus
                                    />
                                    {/* Input Focus decorative line */}
                                    <div className="absolute bottom-0 left-0 w-0 h-[1px] bg-primary transition-all duration-300 group-focus-within:w-full"></div>
                                </div>
                                
                                <button
                                    className="bg-primary border border-primary text-black font-black px-4 flex items-center justify-center hover:bg-white hover:border-white transition-colors disabled:opacity-50 disabled:bg-slate-800 disabled:border-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed shrink-0"
                                    onClick={handleSend}
                                    disabled={!input.trim() || sending}
                                    title="Transmit Message [Enter]"
                                >
                                    <span className="material-symbols-outlined text-xl">send</span>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
}

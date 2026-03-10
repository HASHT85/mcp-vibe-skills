import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Rocket, Trash2, Plus, MessageCircle, Loader2 } from 'lucide-react';
import {
    createChatSession, sendChatMessage, listChatSessions, launchFromChat, deleteChatSession,
} from '../api/client';
import type { ChatSession, ChatMessage } from '../api/client';

const MODEL_OPTIONS = [
    { value: 'claude-sonnet-4-6', label: 'Claude 4.6 Sonnet' },
    { value: 'claude-haiku-4-5', label: 'Claude 4.5 Haiku' },
    { value: 'claude-opus-4-6', label: 'Claude 4.6 Opus' },
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
    }, [activeSession?.messages]);

    const createNewSession = async () => {
        try {
            const data = await createChatSession(model);
            setActiveSession(data.session);
            setSessions(prev => [data.session, ...prev]);
        } catch (err: any) {
            alert(`Error creating session: ${err.message}`);
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
            alert(`Error: ${err.message}`);
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
            alert(`Launch error: ${err.message}`);
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
            className="view-container chat-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
        >
            <div className="chat-layout">
                {/* Sessions sidebar */}
                <div className="chat-sessions">
                    <div className="chat-sessions-header">
                        <h3>💬 Chat</h3>
                        <button className="btn-sm btn-primary" onClick={createNewSession}>
                            <Plus size={14} /> New
                        </button>
                    </div>
                    <div className="chat-model-select">
                        <select value={model} onChange={(e) => setModel(e.target.value)}>
                            {MODEL_OPTIONS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="chat-sessions-list">
                        {sessions.map(s => (
                            <div
                                key={s.id}
                                className={`chat-session-item ${activeSession?.id === s.id ? 'active' : ''}`}
                                onClick={() => setActiveSession(s)}
                            >
                                <MessageCircle size={14} />
                                <span className="chat-session-preview">
                                    {s.messages?.[0]?.content?.slice(0, 40) || `Session ${s.id}`}
                                </span>
                                <button
                                    className="btn-icon-xs"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                                    title="Delete session"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                        {sessions.length === 0 && (
                            <div className="empty-state" style={{ padding: '1rem', fontSize: '0.8rem' }}>
                                No sessions yet. Click "New" to start.
                            </div>
                        )}
                    </div>
                </div>

                {/* Chat main area */}
                <div className="chat-main">
                    {!activeSession ? (
                        <div className="chat-empty">
                            <div className="chat-empty-icon">💬</div>
                            <h2>VibeCraft Chat</h2>
                            <p>Discuss your project idea with the AI before launching the pipeline.</p>
                            <button className="btn-primary" onClick={createNewSession}>
                                <Plus size={16} /> Start New Conversation
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Messages */}
                            <div className="chat-messages">
                                {activeSession.messages.length === 0 && (
                                    <div className="chat-welcome">
                                        <p>👋 Start by describing your project idea. I'll help you refine it before launching!</p>
                                    </div>
                                )}
                                <AnimatePresence>
                                    {activeSession.messages.map((msg, i) => (
                                        <motion.div
                                            key={i}
                                            className={`chat-bubble ${msg.role}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <div className="chat-bubble-content">
                                                {msg.content}
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                {sending && (
                                    <div className="chat-bubble assistant">
                                        <div className="chat-bubble-content typing">
                                            <Loader2 size={16} className="spin" /> Thinking...
                                        </div>
                                    </div>
                                )}
                                <div ref={bottomRef} />
                            </div>

                            {/* Input bar */}
                            <div className="chat-input-bar">
                                <input
                                    className="chat-input"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    placeholder="Describe your project idea..."
                                    disabled={sending}
                                />
                                <button
                                    className="btn-sm btn-primary"
                                    onClick={handleSend}
                                    disabled={!input.trim() || sending}
                                >
                                    <Send size={14} />
                                </button>
                                {activeSession.messages.length >= 2 && (
                                    <button
                                        className="btn-sm btn-launch"
                                        onClick={handleLaunch}
                                        disabled={launching}
                                        title="Launch Pipeline from Chat"
                                    >
                                        <Rocket size={14} /> {launching ? 'Launching...' : 'Launch 🚀'}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

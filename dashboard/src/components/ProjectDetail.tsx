import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { killPipeline, deletePipeline, modifyPipeline, type Pipeline } from '../api/client';
import { AgentCard } from './AgentCard';
import { Terminal } from './Terminal';
import { formatTokenCount } from '../utils';

const MODEL_OPTIONS = [
    { value: 'claude-sonnet-4-6', label: 'Claude 4.6 Sonnet' },
    { value: 'claude-opus-4-6', label: 'Claude 4.6 Opus' },
    { value: 'claude-haiku-4-5', label: 'Claude 4.5 Haiku' },
    { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
    { value: 'o1', label: 'o1 (OpenAI)' },
    { value: 'o3-mini', label: 'o3-mini (OpenAI)' },
    { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
    { value: 'gemini-3.0-pro', label: 'Gemini 3.0 Pro' }
];

interface ProjectDetailProps {
    pipeline: Pipeline;
    onBack: () => void;
    onRefresh: () => void;
}

export function ProjectDetail({ pipeline: p, onBack, onRefresh }: ProjectDetailProps) {
    const [showModify, setShowModify] = useState(false);
    const [modifyText, setModifyText] = useState('');
    const [modifyModel, setModifyModel] = useState('');
    const [files, setFiles] = useState<{ name: string; type: string; data: string; size: number; error?: string; thumbnail?: string }[]>([]);
    const [modifying, setModifying] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleKill = async () => {
        if (confirm(`FORCE_STOP sequence initiated for Node [${p.name}]. Confirm termination?`)) {
            await killPipeline(p.id);
            onRefresh();
        }
    };

    const handleDelete = async () => {
        if (confirm(`CRITICAL: Purge ALL data for Node [${p.name}]? This action is irreversible.`)) {
            await deletePipeline(p.id);
            onBack();
            onRefresh();
        }
    };

    const handleModify = async () => {
        if ((!modifyText.trim() && files.length === 0) || modifying) return;
        setModifying(true);
        try {
            const validFiles = files
                .filter(f => !f.error && f.data)
                .map(f => ({ base64: f.data, type: f.type }));

            await modifyPipeline(p.id, modifyText.trim(), modifyModel || undefined, validFiles.length > 0 ? validFiles : undefined);
            setShowModify(false);
            setModifyText('');
            setModifyModel('');
            setFiles([]);
            onRefresh();
        } catch (err: any) {
            alert(`SYS_ERR: ${err.message}`);
        } finally {
            setModifying(false);
        }
    };

    const processFile = (f: File) => {
        const MAX_MB = 10;
        if (f.size > MAX_MB * 1024 * 1024) {
            setFiles(prev => [...prev, { name: f.name, type: f.type, data: '', size: f.size, error: `EXCEEDS_LIMIT (Max ${MAX_MB}MB)` }]);
            return;
        }

        if (f.type.startsWith('image/') || f.type === 'application/pdf') {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result as string;
                const base64 = result.split(',')[1];
                if (base64) {
                    let thumbnail: string | undefined = undefined;
                    if (f.type.startsWith('image/')) thumbnail = result;
                    setFiles(prev => [...prev, { name: f.name, type: f.type, data: base64, size: f.size, thumbnail }]);
                }
            };
            reader.readAsDataURL(f);
        } else {
            alert("UNSUPPORTED_FORMAT. Only IMAGE and PDF packets accepted.");
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) Array.from(e.target.files).forEach(processFile);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const pastedFile = items[i].getAsFile();
                if (pastedFile) {
                    e.preventDefault();
                    processFile(pastedFile);
                    break;
                }
            }
        }
    }, []);

    const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);
    const isCompleted = p.phase === 'COMPLETED';
    const isFailed = p.phase === 'FAILED';
    const isRunning = !isCompleted && !isFailed;
    const progressColorClass = isCompleted ? 'bg-accent' : (isFailed ? 'bg-red-500' : 'bg-primary');
    const badgeColorClass = isCompleted ? 'bg-accent text-black' : (isFailed ? 'bg-red-500 text-white' : 'bg-primary text-white');

    const getTypeIcon = () => {
        if (p.projectType === 'spa' || p.projectType === 'static') return 'language';
        if (p.projectType?.includes('worker')) return 'memory';
        return 'database';
    };

    return (
        <motion.div
            className="flex flex-col gap-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
        >
            {/* Header Area */}
            <div className="bg-panel border border-border-muted p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
                
                <div className="flex items-start gap-4 mb-6">
                    <button 
                        onClick={onBack}
                        className="text-slate-400 hover:text-white hover:bg-white/5 p-2 rounded transition-colors mt-1"
                    >
                        <span className="material-symbols-outlined">arrow_back_ios_new</span>
                    </button>
                    
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="material-symbols-outlined text-accent text-3xl">
                                {getTypeIcon()}
                            </span>
                            <h2 className="text-3xl font-black text-white tracking-widest uppercase">
                                {(p.name || 'unnamed').replace(/\s+/g, '_').toLowerCase()}
                            </h2>
                            <span className={`${badgeColorClass} text-[10px] font-black px-3 py-1 tracking-widest uppercase ml-4`}>
                                {p.phase}
                            </span>
                        </div>
                        <p className="text-slate-400 text-sm max-w-3xl leading-relaxed">
                            {p.description}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {['COMPLETED', 'FAILED'].includes(p.phase) && (
                            <button 
                                onClick={() => setShowModify(true)}
                                className="bg-accent text-black font-bold text-[10px] px-4 py-2 hover:brightness-110 uppercase flex items-center gap-2"
                                title="Modify Project Params"
                            >
                                <span className="material-symbols-outlined text-[16px]">edit_square</span> MODIFY
                            </button>
                        )}
                        {!['COMPLETED', 'FAILED'].includes(p.phase) && (
                            <button
                                onClick={handleKill}
                                className="border border-red-500/50 bg-red-500/10 text-red-500 font-bold text-[10px] px-4 py-2 hover:bg-red-500/20 uppercase flex items-center gap-2"
                                title="Force Stop Pipeline"
                            >
                                <span className="material-symbols-outlined text-[16px]">cancel</span> STOP
                            </button>
                        )}
                        <button 
                            onClick={handleDelete}
                            className="text-slate-500 hover:text-red-500 hover:bg-red-500/10 p-2 rounded transition-colors"
                            title="Purge Node"
                        >
                            <span className="material-symbols-outlined">delete_forever</span>
                        </button>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1 h-1.5 bg-background-dark overflow-hidden">
                        <div className={`h-full ${progressColorClass} transition-all duration-1000 shadow-[0_0_10px_currentcolor]`} style={{ width: `${p.progress}%` }}></div>
                    </div>
                    <span className={`text-xs font-bold monospaced ${isCompleted ? 'text-accent' : 'text-primary'}`}>
                        {p.progress}%
                    </span>
                </div>

                {/* Meta Bar */}
                <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold tracking-widest uppercase text-slate-500 monospaced bg-background-dark/50 p-3 border border-border-muted">
                    {p.github && (
                        <div className="flex items-center gap-2 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-[14px]">code_blocks</span>
                            <a href={p.github.url} target="_blank" rel="noopener noreferrer">
                                {p.github.owner}/{p.github.repo}
                            </a>
                        </div>
                    )}
                    {p.dokploy?.url && (
                        <div className="flex items-center gap-2 hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            <a href={p.dokploy.url} target="_blank" rel="noopener noreferrer">
                                {p.dokploy.url}
                            </a>
                        </div>
                    )}
                    {p.dokploy && !p.dokploy.url && (
                        <div className="flex items-center gap-2" style={{ color: p.projectType?.includes('worker') ? 'var(--color-primary)' : 'inherit' }}>
                            <span className="material-symbols-outlined text-[14px]">{p.projectType?.includes('worker') ? 'memory' : 'rocket_launch'}</span>
                            <span>{p.projectType?.includes('worker') ? 'BACKGROUND_DAEMON (NO_URL)' : `DOKPLOY: ${p.dokploy.applicationId?.slice(0, 8)}...`}</span>
                        </div>
                    )}
                    {totalTokens > 0 && (
                        <div className="flex items-center gap-2 ml-auto text-accent">
                            <span className="material-symbols-outlined text-[14px]">toll</span>
                            {formatTokenCount(p.tokenUsage?.inputTokens || 0)} IN // {formatTokenCount(p.tokenUsage?.outputTokens || 0)} OUT
                            <span className="opacity-50">[{formatTokenCount(totalTokens)} TOT]</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Sub-sections layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 flex flex-col gap-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-1.5 h-1.5 bg-slate-500 mr-2 rounded-none"></span>
                        <h3 className="text-sm font-black text-slate-400 tracking-widest uppercase">Operatives</h3>
                    </div>
                    <div className="flex flex-col gap-3">
                        {(p.agents || []).map(agent => (
                            <AgentCard key={agent.role} agent={agent} />
                        ))}
                    </div>
                </div>
                
                <div className="lg:col-span-2 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="w-1.5 h-1.5 bg-slate-500 mr-2 rounded-none"></span>
                        <h3 className="text-sm font-black text-slate-400 tracking-widest uppercase">System_Console</h3>
                    </div>
                    <div className="flex-1 bg-black border border-border-muted border-l-4 border-l-slate-700 min-h-[400px]">
                        <Terminal events={p.events || []} />
                    </div>
                </div>
            </div>

            {/* Modify Modal */}
            <AnimatePresence>
                {showModify && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => { setShowModify(false); setFiles([]); setModifyText(''); }}
                    >
                        <motion.div
                            className="bg-panel border border-border-muted w-full max-w-2xl flex flex-col scanline shadow-2xl shadow-accent/5 origin-center"
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-4 border-b border-border-muted bg-background-dark">
                                <h3 className="text-sm font-black tracking-widest text-accent uppercase flex items-center gap-2">
                                    <span className="material-symbols-outlined">edit_square</span> 
                                    MODIFY_NODE // {p.name}
                                </h3>
                                <button className="text-slate-500 hover:text-white" onClick={() => { setShowModify(false); setFiles([]); setModifyText(''); }}>
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            
                            <div className="p-6">
                                <p className="text-xs text-slate-400 mb-4 monospaced">
                                    INPUT MODIFICATION DIRECTIVES. DEV_OPERATIVE WILL EXECUTE CHANGES ON THE TARGET REPOSITORY.
                                </p>
                                
                                <textarea
                                    autoFocus
                                    rows={5}
                                    placeholder="e.g. Change hero title to 'My Portfolio' // Paste images here (Ctrl+V)..."
                                    value={modifyText}
                                    onChange={(e) => setModifyText(e.target.value)}
                                    onPaste={handlePaste}
                                    className="w-full bg-background-dark border border-border-muted text-white p-4 focus:ring-1 focus:ring-accent focus:border-accent outline-none monospaced text-sm resize-none mb-4"
                                />
                                
                                <div className="flex flex-col mb-6">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">AI_MODEL_SELECT</label>
                                    <select
                                        className="bg-background-dark border border-border-muted text-white p-3 outline-none text-xs focus:ring-1 focus:ring-accent"
                                        value={modifyModel}
                                        onChange={(e) => setModifyModel(e.target.value)}
                                    >
                                        <option value="">[SYSTEM_DEFAULT]</option>
                                        {MODEL_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>

                                {files.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {files.map((f, i) => (
                                            <div key={i} className={`flex items-center gap-2 p-2 bg-background-dark border ${f.error ? 'border-red-500/50 text-red-400' : 'border-border-muted text-slate-300'}`}>
                                                {f.thumbnail ? (
                                                    <img src={f.thumbnail} alt="preview" className="w-8 h-8 object-cover opacity-80" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-[16px]">attachment</span>
                                                )}
                                                <div className="flex flex-col max-w-[150px]">
                                                    <span className="text-[10px] monospaced truncate">{f.name}</span>
                                                    {f.error && <span className="text-[9px] text-red-500">{f.error}</span>}
                                                </div>
                                                <button onClick={() => removeFile(i)} className="ml-1 text-slate-500 hover:text-white" title="Remove Packet">
                                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <input
                                    type="file"
                                    multiple
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*,application/pdf"
                                    onChange={handleFileChange}
                                />

                                <div className="flex justify-between items-center mt-4 pt-4 border-t border-border-muted">
                                    <button
                                        className="text-[10px] font-bold tracking-widest uppercase text-slate-400 hover:text-white flex items-center gap-2 transition-colors border-b border-transparent hover:border-slate-400 pb-0.5"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <span className="material-symbols-outlined text-[16px]">attach_file</span> ATTACH_PACKET
                                    </button>

                                    <div className="flex gap-4">
                                        <button 
                                            className="text-[10px] font-bold tracking-widest text-slate-400 hover:text-white uppercase px-4 py-2"
                                            onClick={() => { setShowModify(false); setFiles([]); setModifyText(''); }}
                                        >
                                            ABORT
                                        </button>
                                        <button
                                            className="bg-accent text-black font-black text-xs px-6 py-2 tracking-widest uppercase hover:brightness-110 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={handleModify}
                                            disabled={modifying || (!modifyText.trim() && files.length === 0)}
                                        >
                                            {modifying ? (
                                                <><span className="material-symbols-outlined animate-spin text-[16px]">sync</span> TRANSMITTING...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-[16px]">rocket_launch</span> EXECUTE</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

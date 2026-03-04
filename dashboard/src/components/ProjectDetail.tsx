import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Edit, Bomb, Trash2, Github, ExternalLink, Rocket, Coins, Paperclip, X, Globe, Cpu, Database } from 'lucide-react';
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
        if (confirm(`Es-tu sûr de vouloir forcer l'arrêt de "${p.name}" ?`)) {
            await killPipeline(p.id);
            onRefresh();
        }
    };

    const handleDelete = async () => {
        if (confirm(`Supprimer "${p.name}" et ses ressources ?`)) {
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
            alert(`Erreur: ${err.message}`);
        } finally {
            setModifying(false);
        }
    };

    const processFile = (f: File) => {
        const MAX_MB = 10;
        if (f.size > MAX_MB * 1024 * 1024) {
            setFiles(prev => [...prev, { name: f.name, type: f.type, data: '', size: f.size, error: `Trop lourd (Max ${MAX_MB}MB)` }]);
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
            alert("Seuls les images et les PDF sont supportés.");
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

    return (
        <motion.div
            className="detail-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
        >
            <div className="detail-header">
                <button className="btn-back" onClick={onBack}>
                    <ChevronLeft size={16} />
                </button>
                <div className="detail-info">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {p.projectType === 'spa' || p.projectType === 'static' ? <Globe size={18} /> : p.projectType?.includes('worker') ? <Cpu size={18} /> : <Database size={18} />}
                        {p.name}
                    </h2>
                    <div className="detail-desc">{p.description}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`phase-badge ${p.phase.toLowerCase()}`}>{p.phase}</span>
                    {['COMPLETED', 'FAILED'].includes(p.phase) && (
                        <button className="btn-modify" onClick={() => setShowModify(true)} title="Modifier le projet">
                            <Edit size={14} /> Modifier
                        </button>
                    )}
                    {!['COMPLETED', 'FAILED'].includes(p.phase) && (
                        <button
                            onClick={handleKill}
                            title="Forcer l'arrêt du pipeline"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                        >
                            <Bomb size={14} /> Stop
                        </button>
                    )}
                    <button className="btn-back" onClick={handleDelete} title="Delete">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${p.progress}%` }} />
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {p.github && (
                    <div className="link-row">
                        <Github size={12} />
                        <a href={p.github.url} target="_blank" rel="noopener noreferrer">
                            {p.github.owner}/{p.github.repo}
                        </a>
                    </div>
                )}
                {p.dokploy?.url && (
                    <div className="link-row">
                        <ExternalLink size={12} />
                        <a href={p.dokploy.url} target="_blank" rel="noopener noreferrer">
                            {p.dokploy.url}
                        </a>
                    </div>
                )}
                {p.dokploy && !p.dokploy.url && (
                    <div className="link-row" style={{ color: p.projectType?.includes('worker') ? 'var(--info)' : 'inherit' }}>
                        {p.projectType?.includes('worker') ? <Cpu size={12} /> : <Rocket size={12} />}
                        <span>{p.projectType?.includes('worker') ? '⚙️ Background Daemon (Actif 24/7, pas d\'URL)' : `Dokploy: ${p.dokploy.applicationId?.slice(0, 8)}...`}</span>
                    </div>
                )}
                {totalTokens > 0 && (
                    <div className="token-badge" style={{ fontSize: 12 }}>
                        <Coins size={12} />
                        {formatTokenCount(p.tokenUsage?.inputTokens || 0)} in / {formatTokenCount(p.tokenUsage?.outputTokens || 0)} out
                        ({formatTokenCount(totalTokens)} total)
                    </div>
                )}
            </div>

            <div className="section-title">Agents</div>
            <div className="agent-cards">
                {(p.agents || []).map(agent => (
                    <AgentCard key={agent.role} agent={agent} />
                ))}
            </div>

            <div className="section-title">Console</div>
            <Terminal events={p.events || []} />

            {/* Modify Modal */}
            <AnimatePresence>
                {showModify && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => { setShowModify(false); setFiles([]); setModifyText(''); }}
                    >
                        <motion.div
                            className="modal modify-modal"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3>✏️ Modifier "{p.name}"</h3>
                            <p style={{ color: 'var(--color-text-dim)', fontSize: 13, margin: '8px 0 16px' }}>
                                Décris les modifications à apporter. L'agent Developer va modifier le code.
                            </p>
                            <textarea
                                autoFocus
                                rows={4}
                                placeholder="Ex: Change le titre en 'Mon Portfolio', OU (si Worker Analytics): Ajoute l'import de Pandas pour nettoyer le CSV... (Ctrl+V pour coller une image)"
                                value={modifyText}
                                onChange={(e) => setModifyText(e.target.value)}
                                onPaste={handlePaste}
                                className="modify-textarea"
                                style={{ marginBottom: '12px' }}
                            />
                            <input
                                list="model-options"
                                className="login-input"
                                placeholder="Modèle IA (Laisse vide pour modèle par défaut)"
                                value={modifyModel}
                                onChange={(e) => setModifyModel(e.target.value)}
                                style={{ marginBottom: '16px', width: '100%', padding: '12px', background: 'var(--bg-layer-2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px' }}
                            />
                            <datalist id="model-options">
                                {MODEL_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </datalist>

                            {files.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                    {files.map((f, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, border: f.error ? '1px solid var(--error)' : '1px solid transparent' }}>
                                            {f.thumbnail ? (
                                                <img src={f.thumbnail} alt="preview" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4 }} />
                                            ) : (
                                                <Paperclip size={14} />
                                            )}
                                            <span style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: f.error ? 'var(--error)' : 'inherit' }}>
                                                {f.name}
                                                {f.error && <span style={{ display: 'block', fontSize: 10, marginTop: 2 }}>{f.error}</span>}
                                            </span>
                                            <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Retirer le fichier">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <input
                                type="file"
                                multiple
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/*,application/pdf"
                                onChange={handleFileChange}
                            />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                <button
                                    className="btn-cancel"
                                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Joindre une image ou un PDF"
                                >
                                    <Paperclip size={16} /> Joindre un fichier
                                </button>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn-cancel" onClick={() => { setShowModify(false); setFiles([]); setModifyText(''); }}>Annuler</button>
                                    <button
                                        className="btn-launch"
                                        onClick={handleModify}
                                        disabled={modifying || (!modifyText.trim() && files.length === 0)}
                                    >
                                        {modifying ? 'Envoi...' : '🚀 Lancer la modification'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

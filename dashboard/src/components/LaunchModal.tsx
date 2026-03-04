import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Paperclip, X } from 'lucide-react';

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

export function LaunchModal({ onClose, onLaunch }: {
    onClose: () => void;
    onLaunch: (desc: string, name?: string, model?: string, files?: { base64: string; type: string }[]) => void;
}) {
    const [desc, setDesc] = useState('');
    const [name, setName] = useState('');
    const [model, setModel] = useState('');
    const [files, setFiles] = useState<{ name: string; type: string; data: string; size: number; error?: string; thumbnail?: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            Array.from(e.target.files).forEach(processFile);
        }
        // clear input so same file can be selected again if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.indexOf('image/') === 0 || item.type === 'application/pdf') {
                const f = item.getAsFile();
                if (f) processFile(f);
            }
        }
    };

    const processFile = (f: File) => {
        const MAX_MB = 10;
        const isTooLarge = f.size > MAX_MB * 1024 * 1024;

        if (isTooLarge) {
            setFiles(prev => [...prev, { name: f.name, type: f.type, data: '', size: f.size, error: `Trop lourd (Max ${MAX_MB}MB)` }]);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const base64 = result.split(',')[1];
            if (base64) {
                let thumbnail: string | undefined = undefined;
                // If image, use the data URL directly as thumbnail
                if (f.type.startsWith('image/')) {
                    thumbnail = result;
                }

                setFiles(prev => [...prev, { name: f.name, type: f.type, data: base64, size: f.size, thumbnail }]);
            }
        };
        reader.readAsDataURL(f);
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const submit = async () => {
        if (!desc.trim()) return;
        setLoading(true);
        try {
            const validFiles = files.filter(f => !f.error).map(f => ({ base64: f.data, type: f.type }));
            await onLaunch(desc.trim(), name.trim() || undefined, model || undefined, validFiles.length > 0 ? validFiles : undefined);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="modal"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2>🚀 Lancer une idée</h2>
                <p>Décris ton projet. Les agents IA vont l'analyser, le concevoir, le développer et le déployer automatiquement.</p>
                <input
                    className="login-input"
                    placeholder="Titre du projet (optionnel)"
                    value={name}
                    onChange={(e: any) => setName(e.target.value)}
                    style={{ marginBottom: '12px', width: '100%' }}
                />
                <input
                    list="model-options-launch"
                    className="login-input"
                    placeholder="Modèle IA (Laisse vide pour claude-4-6-sonnet, ou tape ton modèle API proxy)"
                    value={model}
                    onChange={(e: any) => setModel(e.target.value)}
                    style={{ marginBottom: '12px', width: '100%', padding: '12px', background: 'var(--bg-layer-2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '8px' }}
                />
                <datalist id="model-options-launch">
                    {MODEL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </datalist>
                <textarea
                    placeholder="Ex: Un dashboard React analytique, OU un Bot Python autonome pour scraper des annonces Web 24/7... (Vous pouvez aussi coller une image Ctrl+V)"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    onPaste={handlePaste}
                    autoFocus
                />

                {files.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {files.map((f, i) => (
                            <div key={i} className="file-preview-pill" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-layer-2)', borderRadius: 8, border: f.error ? '1px solid var(--error)' : '1px solid transparent' }}>
                                {f.thumbnail ? (
                                    <img src={f.thumbnail} alt="preview" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4 }} />
                                ) : (
                                    <Paperclip size={14} />
                                )}
                                <span style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: f.error ? 'var(--error)' : 'inherit' }}>
                                    {f.name}
                                    {f.error && <span style={{ display: 'block', fontSize: 10, marginTop: 2 }}>{f.error}</span>}
                                </span>
                                <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="modal-actions">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*,application/pdf"
                        style={{ display: 'none' }}
                    />
                    <button className="btn-cancel" onClick={() => fileInputRef.current?.click()} title="Joindre une image ou un PDF" style={{ marginRight: 'auto' }}>
                        <Paperclip size={16} />
                    </button>

                    <button className="btn-cancel" onClick={onClose}>Annuler</button>
                    <button
                        className="btn-launch"
                        onClick={submit}
                        disabled={!desc.trim() || loading}
                    >
                        {loading ? '⏳ Lancement...' : (
                            <><Rocket size={14} /> Lancer la pipeline</>
                        )}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

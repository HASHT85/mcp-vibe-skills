import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

const MODEL_OPTIONS = [
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
    { value: 'gemini-3.0-pro', label: 'Gemini 3.0 Pro' },
    { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
    { value: 'o3-mini', label: 'o3-mini (OpenAI)' },
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
            setFiles(prev => [...prev, { name: f.name, type: f.type, data: '', size: f.size, error: `TOO LARGE (MAX ${MAX_MB}MB)` }]);
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
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="bg-panel border border-accent/30 w-full max-w-2xl flex flex-col scanline shadow-[0_0_30px_rgba(212,255,0,0.1)] relative origin-center overflow-hidden"
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-accent/50 m-1"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-accent/50 m-1"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-accent/50 m-1"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-accent/50 m-1"></div>

                <div className="flex items-center gap-3 p-6 border-b border-border-muted/50 bg-background-dark relative z-10">
                    <span className="material-symbols-outlined text-3xl text-accent">add_box</span>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-widest uppercase m-0">Initialize_Project</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            Provide architectural directives for autonomous matrix deployment
                        </p>
                    </div>
                </div>

                <div className="p-6 flex flex-col gap-4 relative z-10">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Project Identifier (Optional)</label>
                        <input
                            className="bg-black border border-border-muted focus:border-accent text-white p-3 font-medium outline-none transition-colors placeholder:text-slate-600 rounded-none w-full"
                            placeholder="e.g. Nexus_Dashboard_v2"
                            value={name}
                            onChange={(e: any) => setName(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Select Neural Engine (Optional)</label>
                        <div className="relative">
                            <input
                                list="model-options-launch"
                                className="bg-black border border-border-muted focus:border-accent text-white p-3 font-medium outline-none transition-colors placeholder:text-slate-600 rounded-none w-full"
                                placeholder="Default: Claude 3.7 Sonnet"
                                value={model}
                                onChange={(e: any) => setModel(e.target.value)}
                            />
                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">expand_more</span>
                        </div>
                        <datalist id="model-options-launch">
                            {MODEL_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </datalist>
                    </div>

                    <div className="flex flex-col gap-1 flex-1 min-h-[150px]">
                        <label className="text-[10px] font-black text-accent tracking-widest uppercase flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">terminal</span> Architectural Directives
                        </label>
                        <textarea
                            className="bg-black border border-border-muted focus:border-accent text-white p-3 font-medium outline-none transition-colors placeholder:text-slate-600 rounded-none w-full flex-1 resize-y min-h-[150px] custom-scrollbar"
                            placeholder="Ex: Un dashboard React analytique, avec un backend FastAPI et une base de données PostgreSQL..."
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            onPaste={handlePaste}
                            autoFocus
                        />
                    </div>

                    {files.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-3 bg-black/50 border border-white/5 border-dashed">
                            {files.map((f, i) => (
                                <div key={i} className={`flex items-center gap-2 p-2 bg-white/5 border rounded-none ${f.error ? 'border-red-500' : 'border-white/10'}`}>
                                    {f.thumbnail ? (
                                        <img src={f.thumbnail} alt="preview" className="w-8 h-8 object-cover border border-white/20" />
                                    ) : (
                                        <span className="material-symbols-outlined text-slate-400">description</span>
                                    )}
                                    <div className="flex flex-col max-w-[150px]">
                                        <span className={`text-[10px] font-bold truncate ${f.error ? 'text-red-500' : 'text-slate-300'}`}>
                                            {f.name}
                                        </span>
                                        {f.error && <span className="text-[9px] text-red-500 font-black tracking-widest">{f.error}</span>}
                                    </div>
                                    <button 
                                        className="ml-auto text-slate-500 hover:text-white transition-colors"
                                        onClick={() => removeFile(i)}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border-muted/50 bg-background-dark flex items-center justify-between relative z-10">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*,application/pdf"
                        className="hidden"
                        multiple
                    />
                    <button 
                        className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-slate-400 hover:text-white uppercase px-3 py-2 border border-transparent hover:border-slate-700 transition-colors" 
                        onClick={() => fileInputRef.current?.click()} 
                        title="Attach Media or Documents"
                    >
                        <span className="material-symbols-outlined text-[16px]">attach_file</span>
                        Attach_Data
                    </button>

                    <div className="flex items-center gap-3">
                        <button 
                            className="text-[10px] font-bold tracking-widest text-slate-400 hover:text-white uppercase px-4 py-2" 
                            onClick={onClose}
                        >
                            Abort
                        </button>
                        <button
                            className="bg-accent/20 hover:bg-accent/40 text-accent border border-accent/50 font-black text-xs px-6 py-2 tracking-widest uppercase flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={submit}
                            disabled={!desc.trim() || loading}
                        >
                            {loading ? (
                                <><span className="material-symbols-outlined animate-spin text-[16px]">sync</span> EXECUTING...</>
                            ) : (
                                <><span className="material-symbols-outlined text-[16px]">rocket_launch</span> INITIATE_SEQUENCE</>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

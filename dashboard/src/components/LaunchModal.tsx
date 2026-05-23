import React, { useState, useRef } from "react";
import { motion } from "framer-motion";

const MODEL_OPTIONS = [
    { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    { value: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
    { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
    { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "openai/gpt-4o", label: "GPT-4o" },
    { value: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
];

const TEMPLATE_OPTIONS = [
    { id: "web-spa", emoji: "🌐", name: "Web App", desc: "React, Vue, Svelte" },
    { id: "api-only", emoji: "⚡", name: "API Backend", desc: "Express, FastAPI" },
    { id: "fullstack", emoji: "🏗️", name: "Fullstack", desc: "Frontend + API + DB" },
    { id: "discord-bot", emoji: "🤖", name: "Bot", desc: "Discord, Telegram" },
    { id: "cli-tool", emoji: "🔧", name: "CLI Tool", desc: "Scripts, Scrapers" },
    { id: "python-app", emoji: "🐍", name: "Python", desc: "FastAPI, Flask, ML" },
    { id: "game", emoji: "🎮", name: "Jeu Web", desc: "Phaser, Three.js" },
];

export function LaunchModal({
    onClose,
    onLaunch,
}: {
    onClose: () => void;
    onLaunch: (
        desc: string,
        name?: string,
        model?: string,
        files?: { base64: string; type: string }[],
        templateId?: string
    ) => void;
}) {
    const [desc, setDesc] = useState("");
    const [name, setName] = useState("");
    const [model, setModel] = useState("");
    const [templateId, setTemplateId] = useState("");
    const [files, setFiles] = useState<
        { name: string; type: string; data: string; size: number; error?: string; thumbnail?: string }[]
    >([]);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            Array.from(e.target.files).forEach(processFile);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.indexOf("image/") === 0 || item.type === "application/pdf") {
                const f = item.getAsFile();
                if (f) processFile(f);
            }
        }
    };

    const processFile = (f: File) => {
        const MAX_MB = 10;
        const isTooLarge = f.size > MAX_MB * 1024 * 1024;

        if (isTooLarge) {
            setFiles((prev) => [
                ...prev,
                { name: f.name, type: f.type, data: "", size: f.size, error: `TOO LARGE (MAX ${MAX_MB}MB)` },
            ]);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const base64 = result.split(",")[1];
            if (base64) {
                let thumbnail: string | undefined = undefined;
                if (f.type.startsWith("image/")) {
                    thumbnail = result;
                }
                setFiles((prev) => [...prev, { name: f.name, type: f.type, data: base64, size: f.size, thumbnail }]);
            }
        };
        reader.readAsDataURL(f);
    };

    const removeFile = (index: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const submit = async () => {
        if (!desc.trim()) return;
        setLoading(true);
        try {
            const validFiles = files.filter((f) => !f.error).map((f) => ({ base64: f.data, type: f.type }));
            await onLaunch(
                desc.trim(),
                name.trim() || undefined,
                model || undefined,
                validFiles.length > 0 ? validFiles : undefined,
                templateId || undefined
            );
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
                className="bg-panel border border-accent/30 w-full max-w-2xl flex flex-col scanline shadow-[0_0_30px_rgba(212,255,0,0.1)] relative origin-center overflow-hidden max-h-[90vh]"
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
                        <h2 className="text-xl font-black text-white tracking-widest uppercase m-0">
                            Initialize_Project
                        </h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            Select project type & provide architectural directives
                        </p>
                    </div>
                </div>

                <div className="p-6 flex flex-col gap-4 relative z-10 overflow-y-auto custom-scrollbar">
                    {/* Template Picker */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-accent tracking-widest uppercase flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">widgets</span> Project Type
                        </label>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                            {TEMPLATE_OPTIONS.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTemplateId(templateId === t.id ? "" : t.id)}
                                    className={`flex flex-col items-center gap-1 p-2 border transition-all text-center cursor-pointer ${
                                        templateId === t.id
                                            ? "border-accent bg-accent/15 text-accent shadow-[0_0_10px_rgba(212,255,0,0.15)]"
                                            : "border-border-muted/50 bg-black/30 text-slate-400 hover:border-slate-500 hover:text-slate-300"
                                    }`}
                                >
                                    <span className="text-xl leading-none">{t.emoji}</span>
                                    <span className="text-[9px] font-black tracking-wider uppercase leading-tight">
                                        {t.name}
                                    </span>
                                    <span className="text-[8px] opacity-60 leading-tight hidden sm:block">
                                        {t.desc}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {!templateId && (
                            <p className="text-[9px] text-slate-500 italic">Auto-détection si non sélectionné</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">
                                Project Identifier
                            </label>
                            <input
                                className="bg-black border border-border-muted focus:border-accent text-white p-2.5 text-sm font-medium outline-none transition-colors placeholder:text-slate-600 rounded-none w-full"
                                placeholder="e.g. Nexus_Dashboard"
                                value={name}
                                onChange={(e: any) => setName(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black text-slate-400 tracking-widest uppercase">
                                Neural Engine
                            </label>
                            <div className="relative">
                                <input
                                    list="model-options-launch"
                                    className="bg-black border border-border-muted focus:border-accent text-white p-2.5 text-sm font-medium outline-none transition-colors placeholder:text-slate-600 rounded-none w-full"
                                    placeholder="Default: Claude Sonnet"
                                    value={model}
                                    onChange={(e: any) => setModel(e.target.value)}
                                />
                                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[16px]">
                                    expand_more
                                </span>
                            </div>
                            <datalist id="model-options-launch">
                                {MODEL_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </datalist>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 flex-1 min-h-[120px]">
                        <label className="text-[10px] font-black text-accent tracking-widest uppercase flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">terminal</span> Architectural
                            Directives
                        </label>
                        <textarea
                            className="bg-black border border-border-muted focus:border-accent text-white p-3 font-medium outline-none transition-colors placeholder:text-slate-600 rounded-none w-full flex-1 resize-y min-h-[120px] custom-scrollbar"
                            placeholder="Ex: Un dashboard React avec un backend FastAPI et PostgreSQL pour tracker les crypto..."
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            onPaste={handlePaste}
                            autoFocus
                        />
                    </div>

                    {files.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-3 bg-black/50 border border-white/5 border-dashed">
                            {files.map((f, i) => (
                                <div
                                    key={i}
                                    className={`flex items-center gap-2 p-2 bg-white/5 border rounded-none ${f.error ? "border-red-500" : "border-white/10"}`}
                                >
                                    {f.thumbnail ? (
                                        <img
                                            src={f.thumbnail}
                                            alt="preview"
                                            className="w-8 h-8 object-cover border border-white/20"
                                        />
                                    ) : (
                                        <span className="material-symbols-outlined text-slate-400">description</span>
                                    )}
                                    <div className="flex flex-col max-w-[150px]">
                                        <span
                                            className={`text-[10px] font-bold truncate ${f.error ? "text-red-500" : "text-slate-300"}`}
                                        >
                                            {f.name}
                                        </span>
                                        {f.error && (
                                            <span className="text-[9px] text-red-500 font-black tracking-widest">
                                                {f.error}
                                            </span>
                                        )}
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
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>{" "}
                                    EXECUTING...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[16px]">rocket_launch</span>{" "}
                                    INITIATE_SEQUENCE
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

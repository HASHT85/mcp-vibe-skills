import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeRepo, launchQuickDeploy, getDeployStatus, getDeployContainers } from '../api/client';
import type { RepoAnalysis } from '../api/client';

type Step = 'input' | 'configure' | 'deploying' | 'done';

const LANG_ICONS: Record<string, string> = {
    go: '🐹', node: '🟢', python: '🐍', rust: '🦀', unknown: '📦',
};

const MODE_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
    hub_image: { label: 'DOCKER_HUB', icon: 'cloud_download', desc: 'Pull pre-built image from Docker Hub' },
    build_from_source: { label: 'BUILD_SRC', icon: 'construction', desc: 'Build from Dockerfile in repo' },
    existing_compose: { label: 'COMPOSE', icon: 'description', desc: 'Use existing docker-compose.yml' },
};

export function QuickDeployView() {
    const [step, setStep] = useState<Step>('input');
    const [githubUrl, setGithubUrl] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
    const [error, setError] = useState('');

    // Config state
    const [projectName, setProjectName] = useState('');
    const [subdomain, setSubdomain] = useState('');
    const [deployMode, setDeployMode] = useState<string>('hub_image');
    const [port, setPort] = useState(8080);
    const [secrets, setSecrets] = useState<{ key: string; value: string }[]>([]);
    const [secretsVisible, setSecretsVisible] = useState<Set<number>>(new Set());

    // Deploy state
    const [deploying, setDeploying] = useState(false);
    const [actionId, setActionId] = useState<number | null>(null);
    const [deployState, setDeployState] = useState('');
    const [compose, setCompose] = useState('');
    const [containers, setContainers] = useState<any[]>([]);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ─── Analyze ───
    const handleAnalyze = async () => {
        if (!githubUrl.includes('github.com')) {
            setError('Please enter a valid GitHub URL');
            return;
        }
        setError('');
        setAnalyzing(true);
        try {
            const result = await analyzeRepo(githubUrl);
            setAnalysis(result);

            // Auto-fill config from analysis
            const repoMatch = githubUrl.match(/github\.com\/[^\/]+\/([^\/\.\?\#]+)/);
            const name = repoMatch?.[1]?.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'project';
            setProjectName(name);
            setSubdomain(name);
            setDeployMode(result.deployMode);
            if (result.detectedPorts.length > 0) setPort(result.detectedPorts[0]);
            setSecrets(result.detectedEnvVars.map(k => ({ key: k, value: '' })));
            setStep('configure');
        } catch (err: any) {
            setError(err.message || 'Analysis failed');
        } finally {
            setAnalyzing(false);
        }
    };

    // ─── Deploy ───
    const handleDeploy = async () => {
        setDeploying(true);
        setError('');
        setStep('deploying');
        try {
            const secretsObj: Record<string, string> = {};
            secrets.forEach(s => { if (s.key && s.value) secretsObj[s.key] = s.value; });

            const result = await launchQuickDeploy({
                githubUrl,
                projectName,
                subdomain,
                secrets: secretsObj,
                deployMode,
                dockerHubImage: analysis?.dockerHubImage || undefined,
                port,
            });

            setActionId(result.actionId);
            setDeployState(result.state);
            if (result.compose) setCompose(result.compose);
        } catch (err: any) {
            setError(err.message || 'Deploy failed');
            setStep('configure');
            setDeploying(false);
        }
    };

    // ─── Poll Status ───
    useEffect(() => {
        if (actionId && step === 'deploying') {
            pollRef.current = setInterval(async () => {
                try {
                    const status = await getDeployStatus(actionId);
                    setDeployState(status.state);
                    if (status.state === 'success' || status.state === 'error') {
                        if (pollRef.current) clearInterval(pollRef.current);
                        if (status.state === 'success') {
                            try {
                                const ctrs = await getDeployContainers(projectName);
                                setContainers(ctrs);
                            } catch {}
                        }
                        setStep('done');
                        setDeploying(false);
                    }
                } catch {}
            }, 5000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [actionId, step]);

    // ─── Reset ───
    const handleReset = () => {
        setStep('input');
        setGithubUrl('');
        setAnalysis(null);
        setError('');
        setProjectName('');
        setSubdomain('');
        setSecrets([]);
        setActionId(null);
        setDeployState('');
        setCompose('');
        setContainers([]);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <span className="material-symbols-outlined text-v-accent text-xl">bolt</span>
                <h1 className="text-2xl font-black text-white tracking-widest uppercase">Quick_Deploy</h1>
                <span className="bg-v-accent/10 text-v-accent text-[10px] font-bold px-2 py-0.5 border border-v-accent/20">
                    GITHUB → HOSTINGER
                </span>
            </div>

            <AnimatePresence mode="wait">
                {/* ═══ STEP 1: URL Input ═══ */}
                {step === 'input' && (
                    <motion.div key="input" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        <div className="bg-[#0B0F14] border-2 border-v-accent/30 p-8">
                            <div className="text-[10px] text-v-accent font-bold tracking-[0.3em] uppercase mb-6 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">link</span>
                                STEP_01 // REPOSITORY_URL
                            </div>

                            <div className="flex gap-3">
                                <input
                                    className="flex-1 bg-black border-2 border-slate-700 focus:border-v-accent text-sm text-white p-4 outline-none font-mono placeholder:text-slate-600 transition-all"
                                    value={githubUrl}
                                    onChange={(e) => setGithubUrl(e.target.value)}
                                    placeholder="https://github.com/owner/repo"
                                    spellCheck="false"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                                />
                                <button
                                    className="px-8 bg-v-accent text-black font-black text-sm uppercase tracking-widest hover:bg-[#b0d900] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    onClick={handleAnalyze}
                                    disabled={analyzing || !githubUrl}
                                >
                                    {analyzing ? (
                                        <><span className="material-symbols-outlined animate-spin text-[18px]">sync</span> ANALYZING...</>
                                    ) : (
                                        <><span className="material-symbols-outlined text-[18px]">search</span> ANALYZE</>
                                    )}
                                </button>
                            </div>

                            {analyzing && (
                                <div className="mt-6 flex items-center gap-3 text-slate-400 text-xs">
                                    <div className="w-full bg-slate-800 h-1 overflow-hidden">
                                        <motion.div className="h-full bg-v-accent" initial={{ width: '5%' }} animate={{ width: '85%' }} transition={{ duration: 15, ease: 'linear' }} />
                                    </div>
                                    <span className="shrink-0 tracking-widest uppercase">Cloning & scanning...</span>
                                </div>
                            )}

                            {error && (
                                <div className="mt-4 bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs font-mono">
                                    ✗ {error}
                                </div>
                            )}

                            <div className="mt-6 text-[10px] text-slate-600 leading-relaxed">
                                Paste a GitHub repository URL. VEIST will clone it, read the README, detect Dockerfile/docker-compose,
                                and prepare deployment to your Hostinger VPS with Traefik SSL.
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ═══ STEP 2: Configure ═══ */}
                {step === 'configure' && analysis && (
                    <motion.div key="configure" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        {/* Analysis Summary */}
                        <div className="bg-[#0B0F14] border-2 border-v-accent/30 p-6 mb-4">
                            <div className="text-[10px] text-v-accent font-bold tracking-[0.3em] uppercase mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">analytics</span>
                                ANALYSIS_RESULT
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-black/50 border border-slate-800 p-3">
                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Language</div>
                                    <div className="text-sm font-bold text-white">{LANG_ICONS[analysis.language]} {analysis.language.toUpperCase()}</div>
                                </div>
                                <div className="bg-black/50 border border-slate-800 p-3">
                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Docker Hub</div>
                                    <div className="text-sm font-bold text-white">{analysis.dockerHubImage ? '✅ Found' : '—'}</div>
                                    {analysis.dockerHubImage && <div className="text-[10px] text-v-accent mt-1 truncate">{analysis.dockerHubImage}</div>}
                                </div>
                                <div className="bg-black/50 border border-slate-800 p-3">
                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Dockerfile</div>
                                    <div className="text-sm font-bold text-white">{analysis.hasDockerfile ? '✅ Yes' : '❌ No'}</div>
                                </div>
                                <div className="bg-black/50 border border-slate-800 p-3">
                                    <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Ports</div>
                                    <div className="text-sm font-bold text-white">{analysis.detectedPorts.join(', ') || '—'}</div>
                                </div>
                            </div>
                        </div>

                        {/* Config Form */}
                        <div className="bg-[#0B0F14] border-2 border-slate-700 p-6 mb-4">
                            <div className="text-[10px] text-v-accent font-bold tracking-[0.3em] uppercase mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">tune</span>
                                STEP_02 // CONFIGURE
                            </div>

                            {/* Deploy Mode */}
                            <div className="mb-4">
                                <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold block mb-2">Deploy Mode</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {Object.entries(MODE_LABELS).map(([mode, info]) => {
                                        const isAvailable = mode === 'hub_image' ? !!analysis.dockerHubImage :
                                            mode === 'build_from_source' ? analysis.hasDockerfile :
                                            mode === 'existing_compose' ? analysis.hasCompose : false;
                                        return (
                                            <button
                                                key={mode}
                                                className={`p-3 text-left border transition-all ${
                                                    deployMode === mode
                                                        ? 'border-v-accent bg-v-accent/10 text-white'
                                                        : isAvailable
                                                            ? 'border-slate-700 bg-black/30 text-slate-400 hover:border-slate-500'
                                                            : 'border-slate-800 bg-black/10 text-slate-700 cursor-not-allowed'
                                                }`}
                                                onClick={() => isAvailable && setDeployMode(mode)}
                                                disabled={!isAvailable}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="material-symbols-outlined text-[14px]">{info.icon}</span>
                                                    <span className="text-[10px] font-bold tracking-widest">{info.label}</span>
                                                </div>
                                                <div className="text-[9px] opacity-70">{info.desc}</div>
                                                {!isAvailable && <div className="text-[8px] text-red-500/50 mt-1">NOT AVAILABLE</div>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Name & Subdomain */}
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold block mb-2">Project Name</label>
                                    <input
                                        className="w-full bg-black border border-slate-700 focus:border-v-accent text-xs text-v-accent p-3 outline-none font-mono uppercase"
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                                        spellCheck="false"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold block mb-2">Subdomain</label>
                                    <div className="flex items-center">
                                        <input
                                            className="flex-1 bg-black border border-slate-700 focus:border-v-accent text-xs text-v-accent p-3 outline-none font-mono"
                                            value={subdomain}
                                            onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                            spellCheck="false"
                                        />
                                        <span className="text-[10px] text-slate-500 ml-2 shrink-0">.hach.dev</span>
                                    </div>
                                </div>
                            </div>

                            {/* Port */}
                            <div className="mb-4">
                                <label className="text-[9px] text-slate-400 uppercase tracking-widest font-bold block mb-2">Container Port</label>
                                <input
                                    className="w-32 bg-black border border-slate-700 focus:border-v-accent text-xs text-white p-3 outline-none font-mono"
                                    type="number"
                                    value={port}
                                    onChange={(e) => setPort(parseInt(e.target.value) || 8080)}
                                />
                            </div>
                        </div>

                        {/* Secrets */}
                        <div className="bg-[#0B0F14] border-2 border-slate-700 p-6 mb-4">
                            <div className="text-[10px] text-v-accent font-bold tracking-[0.3em] uppercase mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[14px]">lock</span>
                                SECRETS_VAULT
                                {secrets.length > 0 && <span className="text-slate-500">[{secrets.length}]</span>}
                            </div>

                            <div className="flex flex-col gap-2">
                                {secrets.map((s, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <input
                                            className="w-1/3 bg-black border border-slate-700 focus:border-v-accent text-[10px] text-v-accent p-2 outline-none font-mono uppercase tracking-wider"
                                            value={s.key}
                                            onChange={(e) => {
                                                const u = [...secrets]; u[i] = { ...s, key: e.target.value }; setSecrets(u);
                                            }}
                                            placeholder="ENV_KEY"
                                            spellCheck="false"
                                        />
                                        <input
                                            className="flex-1 bg-black border border-slate-700 focus:border-white/30 text-[10px] text-white p-2 outline-none font-mono"
                                            type={secretsVisible.has(i) ? 'text' : 'password'}
                                            value={s.value}
                                            onChange={(e) => {
                                                const u = [...secrets]; u[i] = { ...s, value: e.target.value }; setSecrets(u);
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
                                            title={secretsVisible.has(i) ? 'Hide' : 'Show'}
                                        >
                                            <span className="material-symbols-outlined text-[14px]">{secretsVisible.has(i) ? 'visibility_off' : 'visibility'}</span>
                                        </button>
                                        <button
                                            className="text-red-500/50 hover:text-red-500 shrink-0 transition-colors"
                                            onClick={() => setSecrets(secrets.filter((_, j) => j !== i))}
                                        >
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                ))}
                                <button
                                    className="w-full text-[9px] text-slate-500 hover:text-v-accent border border-dashed border-slate-700 hover:border-v-accent py-2 transition-colors uppercase tracking-widest"
                                    onClick={() => setSecrets([...secrets, { key: '', value: '' }])}
                                >
                                    + ADD_SECRET
                                </button>
                            </div>
                        </div>

                        {/* README Preview */}
                        {analysis.readme && (
                            <details className="bg-[#0B0F14] border border-slate-800 mb-4">
                                <summary className="p-4 text-[10px] text-slate-400 font-bold tracking-[0.3em] uppercase cursor-pointer hover:text-white transition-colors">
                                    📄 README_PREVIEW
                                </summary>
                                <pre className="p-4 pt-0 text-[10px] text-slate-500 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
                                    {analysis.readme.slice(0, 3000)}
                                </pre>
                            </details>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                className="px-6 py-3 bg-slate-800 text-slate-400 hover:text-white text-xs font-bold uppercase tracking-widest transition-all"
                                onClick={() => setStep('input')}
                            >
                                ← BACK
                            </button>
                            <button
                                className="flex-1 py-3 bg-v-accent text-black font-black text-sm uppercase tracking-widest hover:bg-[#b0d900] shadow-[0_0_20px_rgba(205,255,0,0.2)] transition-all flex items-center justify-center gap-2"
                                onClick={handleDeploy}
                            >
                                <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                                DEPLOY TO VPS
                            </button>
                        </div>

                        {error && (
                            <div className="mt-4 bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-xs font-mono">
                                ✗ {error}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ═══ STEP 3: Deploying ═══ */}
                {step === 'deploying' && (
                    <motion.div key="deploying" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        <div className="bg-[#0B0F14] border-2 border-v-accent/30 p-12 text-center">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                className="inline-block mb-6"
                            >
                                <span className="material-symbols-outlined text-v-accent text-5xl">sync</span>
                            </motion.div>
                            <h2 className="text-xl font-black text-white tracking-widest uppercase mb-4">DEPLOYING...</h2>
                            <p className="text-slate-400 text-xs tracking-widest uppercase mb-2">
                                Project: <span className="text-v-accent">{projectName}</span>
                            </p>
                            <p className="text-slate-500 text-xs">
                                Status: <span className={deployState === 'error' ? 'text-red-400' : 'text-v-accent'}>{deployState || 'SENT'}</span>
                            </p>
                            <div className="mt-8 w-full bg-slate-800 h-1 overflow-hidden">
                                <motion.div
                                    className="h-full bg-v-accent"
                                    initial={{ width: '10%' }}
                                    animate={{ width: deployState === 'success' ? '100%' : '80%' }}
                                    transition={{ duration: 60, ease: 'linear' }}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ═══ STEP 4: Done ═══ */}
                {step === 'done' && (
                    <motion.div key="done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        <div className={`bg-[#0B0F14] border-2 p-8 ${deployState === 'success' ? 'border-green-500/50' : 'border-red-500/50'}`}>
                            <div className="text-center mb-6">
                                <span className={`material-symbols-outlined text-5xl ${deployState === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                    {deployState === 'success' ? 'check_circle' : 'error'}
                                </span>
                                <h2 className="text-xl font-black text-white tracking-widest uppercase mt-4">
                                    {deployState === 'success' ? 'DEPLOY_SUCCESS' : 'DEPLOY_FAILED'}
                                </h2>
                            </div>

                            {deployState === 'success' && (
                                <div className="space-y-4">
                                    <div className="bg-black/50 border border-green-500/20 p-4">
                                        <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Live URL</div>
                                        <a
                                            href={`https://${subdomain}.hach.dev`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-v-accent hover:underline text-sm font-mono"
                                        >
                                            https://{subdomain}.hach.dev ↗
                                        </a>
                                    </div>

                                    {containers.length > 0 && (
                                        <div className="bg-black/50 border border-slate-800 p-4">
                                            <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">Containers</div>
                                            {containers.map((c: any) => (
                                                <div key={c.id} className="flex items-center gap-2 text-xs text-white">
                                                    <span className={`w-2 h-2 rounded-full ${c.state === 'running' ? 'bg-green-400' : 'bg-red-400'}`} />
                                                    <span className="font-mono">{c.name}</span>
                                                    <span className="text-slate-500">{c.status}</span>
                                                    {c.health && <span className="text-green-400 text-[10px]">[{c.health}]</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-6 flex gap-3">
                                <button
                                    className="flex-1 py-3 bg-slate-800 text-white font-bold text-xs uppercase tracking-widest hover:bg-slate-700 transition-all"
                                    onClick={handleReset}
                                >
                                    ← DEPLOY_ANOTHER
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

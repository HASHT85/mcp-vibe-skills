import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    killPipeline,
    deletePipeline,
    retryPipeline,
    getSecrets,
    saveSecrets,
    type Pipeline,
    type EvalReport,
} from "../api/client";
import { Terminal } from "./Terminal";
import { ProjectNodeMap } from "./ProjectNodeMap";
import { EvalReportPanel } from "./EvalReportPanel";
import { formatTokenCount } from "../utils";

interface ProjectDetailProps {
    pipeline: Pipeline;
    onBack: () => void;
    onRefresh: () => void;
}

// ─── SecretsPanel sub-component ───
function SecretsPanel({ pipelineId }: { pipelineId: string }) {
    const [expanded, setExpanded] = useState(false);
    const [entries, setEntries] = useState<{ key: string; value: string; masked?: boolean }[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (expanded && !loaded) {
            getSecrets(pipelineId)
                .then((data) => {
                    const existing = Object.entries(data.secrets || {}).map(([key, value]) => ({
                        key,
                        value: value as string,
                        masked: true,
                    }));
                    setEntries(existing);
                    setLoaded(true);
                })
                .catch(() => setLoaded(true));
        }
    }, [expanded, loaded, pipelineId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const secrets: Record<string, string> = {};
            for (const e of entries) {
                if (e.key.trim() && e.value.trim() && !e.masked) {
                    secrets[e.key.trim()] = e.value.trim();
                }
            }
            if (Object.keys(secrets).length > 0) {
                await saveSecrets(pipelineId, secrets);
                setLoaded(false); // reload
            }
        } catch (err: any) {
            alert(`SECRETS_SAVE_FAILED: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-[#0B0F14] border border-border-muted/50 flex flex-col shrink-0">
            <button
                className="w-full flex items-center justify-between p-4 text-[11px] text-slate-300 font-bold tracking-widest uppercase hover:text-white transition-colors bg-[#06080A] border-b border-border-muted/50"
                onClick={() => setExpanded(!expanded)}
            >
                <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-v-accent">lock</span>
                    SECRETS_VAULT {entries.length > 0 && `[${entries.length}]`}
                </span>
                <span className="material-symbols-outlined text-[14px] text-slate-500 hover:text-v-accent">
                    {expanded ? "expand_less" : "expand_more"}
                </span>
            </button>
            {expanded && (
                <div className="p-4 flex flex-col gap-3">
                    {entries.map((e, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <input
                                className="w-1/3 bg-black border border-border-muted/50 focus:border-v-accent/50 focus:shadow-[0_0_10px_rgba(205,255,0,0.1)] transition-all text-[11px] text-v-accent p-2 outline-none font-mono uppercase tracking-wider placeholder:text-slate-700"
                                value={e.key}
                                onChange={(ev) => {
                                    const u = [...entries];
                                    u[i] = { ...e, key: ev.target.value, masked: false };
                                    setEntries(u);
                                }}
                                placeholder="ENV_KEY"
                                spellCheck="false"
                            />
                            <div className="flex-1 relative">
                                <input
                                    className="w-full bg-black border border-border-muted/50 focus:border-white/30 transition-all text-[11px] text-white p-2 pr-8 outline-none font-mono placeholder:text-slate-700"
                                    type={e.masked ? "password" : "text"}
                                    value={e.value}
                                    onChange={(ev) => {
                                        const u = [...entries];
                                        u[i] = { ...e, value: ev.target.value, masked: false };
                                        setEntries(u);
                                    }}
                                    placeholder={e.masked ? "••••••••••••••••" : "Secret Value"}
                                    spellCheck="false"
                                />
                            </div>
                            <button
                                className="text-slate-600 hover:text-v-accent shrink-0 p-2 border border-transparent hover:border-v-accent/20 bg-transparent hover:bg-v-accent/5 transition-all"
                                onClick={() => {
                                    const u = [...entries];
                                    u[i] = { ...e, masked: !e.masked };
                                    setEntries(u);
                                }}
                                title={e.masked ? "Show value" : "Hide value"}
                            >
                                <span className="material-symbols-outlined text-[14px]">
                                    {e.masked ? "visibility" : "visibility_off"}
                                </span>
                            </button>
                            <button
                                className="text-red-500/50 hover:text-red-500 shrink-0 p-2 border border-transparent hover:border-red-500/20 bg-transparent hover:bg-red-500/10 transition-all"
                                onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                                title="Remove Secret"
                            >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                        </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                        <button
                            className="flex-1 bg-black text-[10px] text-slate-400 hover:text-white border border-dashed border-border-muted/50 hover:border-white/30 py-2 transition-colors uppercase tracking-widest font-bold"
                            onClick={() => setEntries([...entries, { key: "", value: "", masked: false }])}
                        >
                            + ADD_KEY
                        </button>
                        {entries.some((e) => !e.masked) && (
                            <button
                                className="px-6 text-[10px] bg-v-accent text-black hover:bg-[#b0d900] shadow-[0_0_15px_rgba(205,255,0,0.2)] py-2 transition-all uppercase tracking-widest font-black"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? "SYNCING..." : "SAVE_VAULT"}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function ProjectDetail({ pipeline: p, onBack, onRefresh }: ProjectDetailProps) {
    const [activeTab, setActiveTab] = useState<"console" | "topology">("console");
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const handleKill = async () => {
        if (confirm(`FORCE_STOP sequence initiated for Node [${p.name}]. Confirm termination?`)) {
            await killPipeline(p.id);
            onRefresh();
        }
    };

    const handleDelete = async () => {
        if (confirm(`CRITICAL: Purge ALL data for Node [${p.name}]? This action is irreversible.`)) {
            try {
                // Delete via pipeline route
                await deletePipeline(p.id);
                onBack();
                onRefresh();
            } catch (err: any) {
                // Try projects route as fallback
                try {
                    const { deleteProject } = await import("../api/client");
                    await deleteProject(p.id);
                    onBack();
                    onRefresh();
                } catch (err2: any) {
                    alert(`DELETE_FAILED: ${err2.message || err.message}`);
                }
            }
        }
    };

    const handleRetry = async () => {
        if (confirm(`RESUME: Reprendre le pipeline [${p.name}] depuis le dernier point de contrôle ?`)) {
            try {
                await retryPipeline(p.id);
                onRefresh();
            } catch (err: any) {
                alert(`RETRY_FAILED: ${err.message}`);
            }
        }
    };

    const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);
    const isCompleted = p.phase === "COMPLETED";
    const isFailed = p.phase === "FAILED";
    const progressColorClass = isCompleted ? "bg-v-accent" : isFailed ? "bg-red-500" : "bg-v-accent";

    return (
        <motion.div
            className="flex flex-col h-full gap-4 relative"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
        >
            {/* Header Bar */}
            <header className="flex flex-wrap items-center justify-between bg-v-bg border-b-2 border-border-muted/50 pb-4 shrink-0 gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="text-slate-500 hover:text-white transition-colors"
                        title="Back to Projects"
                    >
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-v-accent">hexagon</span>
                        <h2 className="text-xl md:text-2xl font-black text-white tracking-widest uppercase">
                            VEIST <span className="text-slate-500 font-normal mx-1">//</span>{" "}
                            {p.name.replace(/\s+/g, "_").toLowerCase()}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-6 text-[10px] md:text-[11px] font-bold tracking-widest uppercase">
                    {p.github && (
                        <div className="flex items-center gap-2 text-slate-400">
                            GIT REPOSITORY:
                            <a
                                href={p.github.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white hover:text-v-accent transition-colors flex items-center gap-1"
                            >
                                {p.github.owner}/{p.github.repo}
                            </a>
                        </div>
                    )}

                    {/* Repository Branch Mock UI (Static for aesthetic) */}
                    <div className="hidden lg:flex items-center gap-2 bg-black border border-border-muted px-2 py-1">
                        <span className="material-symbols-outlined text-[14px] text-v-accent">merge</span>
                        <span className="text-v-accent">MAIN</span>
                        <span className="text-slate-500 ml-2">2 COMMITS AHEAD</span>
                    </div>

                    <div className="flex items-center gap-2 border border-border-muted px-3 py-1 bg-black">
                        <div
                            className={`w-2 h-2 rounded-full ${isCompleted ? "bg-v-accent" : isFailed ? "bg-red-500" : "bg-v-accent animate-pulse"}`}
                        ></div>
                        <span className={isCompleted || !isFailed ? "text-v-accent" : "text-red-500"}>{p.phase}</span>
                    </div>
                </div>
            </header>

            {/* Main Content Layout (Split View) */}
            <div className="flex flex-col xl:flex-row gap-4 flex-1 min-h-0">
                {/* Left Area (Main content) */}
                <div className="flex-1 flex flex-col min-h-0 bg-[#0B0F14] border border-border-muted/50 relative overflow-hidden">
                    {/* Tabs */}
                    <div className="flex items-center border-b border-border-muted/50 bg-[#06080A] shrink-0">
                        <button
                            onClick={() => setActiveTab("console")}
                            className={`px-6 py-3 text-[11px] font-bold tracking-widest uppercase transition-colors relative ${activeTab === "console" ? "text-v-accent bg-black" : "text-slate-500 hover:text-white hover:bg-white/5"}`}
                        >
                            SYSTEM CONSOLE
                            {activeTab === "console" && (
                                <div className="absolute top-0 left-0 w-full h-[2px] bg-v-accent shadow-[0_0_10px_currentcolor]"></div>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab("topology")}
                            className={`px-6 py-3 text-[11px] font-bold tracking-widest uppercase transition-colors relative ${activeTab === "topology" ? "text-v-accent bg-black" : "text-slate-500 hover:text-white hover:bg-white/5"}`}
                        >
                            NODE TOPOLOGY
                            {activeTab === "topology" && (
                                <div className="absolute top-0 left-0 w-full h-[2px] bg-v-accent shadow-[0_0_10px_currentcolor]"></div>
                            )}
                        </button>
                    </div>

                    {/* Tab Content Area */}
                    <div className="flex-1 min-h-0 overflow-hidden relative">
                        {activeTab === "console" ? (
                            <div className="h-full w-full overflow-hidden absolute inset-0">
                                <Terminal events={p.events || []} />
                            </div>
                        ) : (
                            <div className="h-full w-full overflow-hidden absolute inset-0">
                                <ProjectNodeMap
                                    topology={p.topology}
                                    agents={p.agents || []}
                                    selectedNodeId={selectedNodeId}
                                    onSelectNode={setSelectedNodeId}
                                    nodeStatuses={p.nodeStatuses}
                                    pipelinePhase={p.phase}
                                    modifyRuns={(p as any).modifyRuns}
                                    evalReport={p.artifacts?.evalReport as EvalReport | undefined}
                                />
                            </div>
                        )}
                    </div>

                    {/* Progress Bar Area Container (Bottom of Left Column) */}
                    <div className="shrink-0 border-t border-border-muted bg-[#06080A] px-6 py-4 flex flex-col gap-3">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-slate-400">
                            <div className="flex gap-4">
                                {totalTokens > 0 ? (
                                    <>
                                        <span>{formatTokenCount(p.tokenUsage?.inputTokens || 0)} IN</span>
                                        <span className="text-slate-600">//</span>
                                        <span>{formatTokenCount(p.tokenUsage?.outputTokens || 0)} OUT</span>
                                        <span className="text-slate-600">[{formatTokenCount(totalTokens)} TOTAL]</span>
                                    </>
                                ) : (
                                    <span>AWAITING TELEMETRY...</span>
                                )}
                            </div>
                            <span className={isCompleted ? "text-v-accent" : "text-slate-500"}>{p.progress}%</span>
                        </div>
                        <div className="h-[6px] bg-black border border-border-muted overflow-hidden relative">
                            <div
                                className={`h-full ${progressColorClass} transition-all duration-1000 w-full rounded-r`}
                                style={{ width: `${p.progress}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Right Area (Side Panel) */}
                <div className="w-full xl:w-[380px] flex flex-col gap-4 shrink-0 min-h-[400px]">
                    {/* Action Center */}
                    <div className="bg-[#0B0F14] border border-border-muted/50 p-4 shrink-0">
                        <div className="text-[10px] font-bold text-slate-500 mb-3 tracking-widest uppercase">
                            NODE COMMANDS
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {isFailed && (
                                <button
                                    onClick={handleRetry}
                                    className="border border-v-accent/50 bg-v-accent/10 text-v-accent hover:bg-v-accent hover:text-black font-bold text-[10px] py-2 uppercase transition-colors col-span-2"
                                >
                                    RETRY LIFECYCLE
                                </button>
                            )}
                            {!["COMPLETED", "FAILED"].includes(p.phase) && (
                                <button
                                    onClick={handleKill}
                                    className="border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-bold text-[10px] py-2 uppercase transition-colors"
                                >
                                    FORCE STOP
                                </button>
                            )}
                            <button
                                onClick={handleDelete}
                                className={`border border-red-500/30 text-red-400/80 hover:bg-red-500 hover:text-white font-bold text-[10px] py-2 uppercase transition-colors ${!["COMPLETED", "FAILED"].includes(p.phase) ? "" : "col-span-2"}`}
                            >
                                PURGE
                            </button>
                        </div>
                    </div>

                    {/* Contextual Side Panel */}
                    <div className="flex-1 bg-[#0B0F14] border border-border-muted/50 flex flex-col min-h-0 overflow-hidden relative">
                        {activeTab === "console" ? (
                            // Console side-panel: Live Activity
                            <div className="flex flex-col h-full">
                                <div className="p-4 border-b border-border-muted/50 shrink-0">
                                    <h3 className="text-[11px] font-bold text-slate-300 tracking-widest uppercase mb-1">
                                        LIVE ACTIVITY
                                    </h3>
                                    <p className="text-[10px] text-slate-500">REAL-TIME SYSTEM EVENTS</p>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4 relative">
                                    <div className="scanline absolute inset-0 pointer-events-none opacity-20 z-0"></div>
                                    {p.events && p.events.length > 0 ? (
                                        p.events
                                            .slice()
                                            .reverse()
                                            .slice(0, 50)
                                            .map((ev, i) => (
                                                <div
                                                    key={ev.id}
                                                    className="text-[10px] font-mono leading-relaxed pb-3 border-b border-border-muted/30 relative z-10 flex flex-col"
                                                >
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span
                                                            className={`font-bold ${ev.type === "error" ? "text-red-400" : "text-white"}`}
                                                        >
                                                            {ev.agentEmoji} {ev.agentRole}
                                                        </span>
                                                        <span className="text-v-accent">
                                                            <span className="material-symbols-outlined text-[12px]">
                                                                check_circle
                                                            </span>
                                                        </span>
                                                    </div>
                                                    <span
                                                        className={`${ev.type === "error" ? "text-red-400/80" : "text-slate-400"} break-words whitespace-pre-wrap`}
                                                    >
                                                        {ev.action}
                                                    </span>
                                                </div>
                                            ))
                                    ) : (
                                        <div className="text-[10px] text-slate-600 italic z-10">No recent activity</div>
                                    )}
                                </div>
                                <div className="shrink-0 p-4 border-t border-border-muted/50 text-[10px] uppercase text-slate-500 flex justify-between">
                                    <span>NETWORK TRAFFIC</span>
                                    <span className="text-white">1.2 GB/S</span>
                                </div>
                            </div>
                        ) : (
                            // Topology side-panel: Node Detailed Inspection
                            <div className="flex flex-col h-full bg-[#0d1218]">
                                <div className="p-4 border-b border-border-muted/50 shrink-0 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-v-accent/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                                    <h3 className="text-[11px] font-bold text-slate-300 tracking-widest uppercase mb-1 relative z-10">
                                        NODE INSPECTION
                                    </h3>
                                    <p className="text-[10px] text-slate-500 relative z-10">
                                        SELECT A NODE TO VIEW DATA
                                    </p>
                                </div>

                                {selectedNodeId ? (
                                    (() => {
                                        const selectedTopo = p.topology?.find((t) => t.id === selectedNodeId);
                                        const selectedAgentData = p.agents?.find((a) => selectedTopo?.role === a.role);
                                        const agentTokenData =
                                            p.agentTokens?.filter((t) => t.role === selectedTopo?.role) || [];
                                        const agentEvents =
                                            p.events?.filter((e) => e.agentRole === selectedTopo?.role).slice(-20) ||
                                            [];
                                        const totalIn = agentTokenData.reduce((s, t) => s + t.inputTokens, 0);
                                        const totalOut = agentTokenData.reduce((s, t) => s + t.outputTokens, 0);
                                        const totalCost = agentTokenData.reduce((s, t) => s + t.cost, 0);

                                        // Accurate status
                                        let nodeStatus = selectedAgentData?.status || "waiting";
                                        if (p.phase === "COMPLETED") nodeStatus = "done";
                                        else if (p.nodeStatuses?.[selectedNodeId] === "COMPLETED") nodeStatus = "done";
                                        else if (p.nodeStatuses?.[selectedNodeId] === "FAILED") nodeStatus = "error";

                                        return (
                                            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
                                                {/* Header */}
                                                <div className="flex items-center gap-3">
                                                    <span className="text-3xl">{selectedTopo?.emoji || "🔧"}</span>
                                                    <div>
                                                        <div className="text-sm font-black text-white uppercase tracking-wider">
                                                            {selectedTopo?.role || selectedNodeId}
                                                        </div>
                                                        <div className="text-[9px] text-slate-500 font-mono">
                                                            {selectedNodeId}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Status + Model */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-black/50 border border-white/10 p-3">
                                                        <div className="text-[9px] text-slate-500 font-bold mb-1">
                                                            STATUS
                                                        </div>
                                                        <div
                                                            className={`text-xs font-black uppercase flex items-center gap-2 ${
                                                                nodeStatus === "active"
                                                                    ? "text-v-accent"
                                                                    : nodeStatus === "done"
                                                                      ? "text-emerald-400"
                                                                      : nodeStatus === "error"
                                                                        ? "text-red-400"
                                                                        : "text-slate-400"
                                                            }`}
                                                        >
                                                            <span
                                                                className={`w-2 h-2 rounded-full ${
                                                                    nodeStatus === "active"
                                                                        ? "bg-v-accent animate-pulse"
                                                                        : nodeStatus === "done"
                                                                          ? "bg-emerald-400"
                                                                          : nodeStatus === "error"
                                                                            ? "bg-red-500 animate-pulse"
                                                                            : "bg-slate-600"
                                                                }`}
                                                            ></span>
                                                            {nodeStatus}
                                                        </div>
                                                    </div>
                                                    <div className="bg-black/50 border border-white/10 p-3">
                                                        <div className="text-[9px] text-slate-500 font-bold mb-1">
                                                            PROVIDER
                                                        </div>
                                                        <span
                                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase ${
                                                                selectedTopo?.provider === "openrouter"
                                                                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                                                    : "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                                                            }`}
                                                        >
                                                            {selectedTopo?.provider || "anthropic"}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Model */}
                                                {selectedTopo?.model && (
                                                    <div className="bg-black/50 border border-white/10 p-3">
                                                        <div className="text-[9px] text-slate-500 font-bold mb-1">
                                                            MODEL
                                                        </div>
                                                        <div className="text-[11px] font-mono text-white truncate">
                                                            {selectedTopo.model}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Description */}
                                                {selectedTopo?.description && (
                                                    <div className="bg-black/50 border border-white/10 p-3">
                                                        <div className="text-[9px] text-slate-500 font-bold mb-1">
                                                            DESCRIPTION
                                                        </div>
                                                        <div className="text-[11px] text-slate-300">
                                                            {selectedTopo.description}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Token Usage */}
                                                {(totalIn > 0 || totalOut > 0) && (
                                                    <div className="bg-black/50 border border-white/10 p-3">
                                                        <div className="text-[9px] text-slate-500 font-bold mb-2">
                                                            TOKEN USAGE
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2 text-center">
                                                            <div>
                                                                <div className="text-[10px] text-v-accent font-black">
                                                                    {formatTokenCount(totalIn)}
                                                                </div>
                                                                <div className="text-[8px] text-slate-600">INPUT</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-white font-black">
                                                                    {formatTokenCount(totalOut)}
                                                                </div>
                                                                <div className="text-[8px] text-slate-600">OUTPUT</div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-amber-400 font-black">
                                                                    ${totalCost.toFixed(4)}
                                                                </div>
                                                                <div className="text-[8px] text-slate-600">COST</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Current Process */}
                                                {selectedAgentData?.currentAction && (
                                                    <div className="bg-black/50 border border-white/10 p-3">
                                                        <div className="text-[9px] text-slate-500 font-bold mb-1">
                                                            CURRENT PROCESS
                                                        </div>
                                                        <div className="text-[10px] font-mono text-v-accent break-words whitespace-pre-wrap">
                                                            {selectedAgentData.currentAction}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Agent Logs */}
                                                {agentEvents.length > 0 && (
                                                    <div className="bg-black/50 border border-white/10 p-3">
                                                        <div className="text-[9px] text-slate-500 font-bold mb-2">
                                                            AGENT LOGS ({agentEvents.length})
                                                        </div>
                                                        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                                                            {agentEvents
                                                                .slice()
                                                                .reverse()
                                                                .map((ev) => (
                                                                    <div
                                                                        key={ev.id}
                                                                        className="text-[9px] font-mono border-l-2 pl-2 py-1 break-words"
                                                                        style={{
                                                                            borderColor:
                                                                                ev.type === "error"
                                                                                    ? "#ef4444"
                                                                                    : ev.type === "success"
                                                                                      ? "#34d399"
                                                                                      : "#334155",
                                                                        }}
                                                                    >
                                                                        <span
                                                                            className={
                                                                                ev.type === "error"
                                                                                    ? "text-red-400"
                                                                                    : ev.type === "success"
                                                                                      ? "text-emerald-400"
                                                                                      : "text-slate-400"
                                                                            }
                                                                        >
                                                                            {ev.action}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* System Prompt (collapsible) */}
                                                {selectedTopo?.systemPrompt && (
                                                    <details className="bg-black/50 border border-white/10">
                                                        <summary className="p-3 text-[9px] text-slate-500 font-bold cursor-pointer hover:text-white transition-colors uppercase tracking-widest">
                                                            SYSTEM PROMPT
                                                        </summary>
                                                        <div className="px-3 pb-3 text-[10px] font-mono text-slate-400 break-words whitespace-pre-wrap border-t border-white/5 pt-2">
                                                            {selectedTopo.systemPrompt}
                                                        </div>
                                                    </details>
                                                )}

                                                {/* Eval Report — shown when eval node is selected */}
                                                {selectedNodeId === "eval" && p.artifacts?.evalReport && (
                                                    <div className="mt-1">
                                                        <EvalReportPanel
                                                            report={p.artifacts.evalReport as EvalReport}
                                                            deployedUrl={p.artifacts?.deployedUrl as string | undefined}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="flex-1 flex items-center justify-center p-6 opacity-30">
                                        <div className="flex flex-col items-center gap-4 text-center">
                                            <span className="material-symbols-outlined text-[48px] text-slate-400">
                                                account_tree
                                            </span>
                                            <span className="text-xs font-mono uppercase tracking-widest text-slate-400">
                                                Select a node to inspect
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Secrets Vault */}
                    <SecretsPanel pipelineId={p.id} />
                </div>
            </div>
        </motion.div>
    );
}

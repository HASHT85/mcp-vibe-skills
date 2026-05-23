import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { Pipeline, AgentTokenRecord } from "../api/client";
import { formatTokenCount } from "../utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

// ─── Color palette for agents ───
const AGENT_COLORS = [
    "#d4ff00",
    "#00e5ff",
    "#ff6b6b",
    "#ffd93d",
    "#6bff8a",
    "#c084fc",
    "#fb923c",
    "#38bdf8",
    "#f472b6",
    "#a3e635",
];

function getAgentColor(index: number) {
    return AGENT_COLORS[index % AGENT_COLORS.length];
}

// ─── Main Component ───
export function TokensView({ pipelines }: { pipelines: Pipeline[] }) {
    const [selectedProjectId, setSelectedProjectId] = useState<string>("all");

    const filteredPipelines = useMemo(
        () => (selectedProjectId === "all" ? pipelines : pipelines.filter((p) => p.id === selectedProjectId)),
        [pipelines, selectedProjectId]
    );

    // ── Aggregate all agent token records across all pipelines ──
    const allAgentTokens: AgentTokenRecord[] = useMemo(
        () => filteredPipelines.flatMap((p) => p.agentTokens || []),
        [filteredPipelines]
    );

    // ── Per-agent aggregation ──
    const agentSummary = useMemo(() => {
        const map = new Map<
            string,
            {
                role: string;
                emoji: string;
                provider: string;
                model: string;
                inputTokens: number;
                outputTokens: number;
                cost: number;
                lastTimestamp: string;
                count: number;
            }
        >();
        for (const rec of allAgentTokens) {
            const key = rec.role;
            const existing = map.get(key);
            if (existing) {
                existing.inputTokens += rec.inputTokens;
                existing.outputTokens += rec.outputTokens;
                existing.cost += rec.cost;
                existing.count++;
                if (rec.timestamp > existing.lastTimestamp) {
                    existing.lastTimestamp = rec.timestamp;
                    existing.model = rec.model;
                    existing.provider = rec.provider;
                }
            } else {
                map.set(key, {
                    role: rec.role,
                    emoji: rec.emoji,
                    provider: rec.provider,
                    model: rec.model,
                    inputTokens: rec.inputTokens,
                    outputTokens: rec.outputTokens,
                    cost: rec.cost,
                    lastTimestamp: rec.timestamp,
                    count: 1,
                });
            }
        }
        return Array.from(map.values()).sort(
            (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)
        );
    }, [allAgentTokens]);

    // ── Global totals ──
    const totalInput = filteredPipelines.reduce((s, p) => s + (p.tokenUsage?.inputTokens || 0), 0);
    const totalOutput = filteredPipelines.reduce((s, p) => s + (p.tokenUsage?.outputTokens || 0), 0);
    const totalTokens = totalInput + totalOutput;
    const totalCost = agentSummary.reduce((s, a) => s + a.cost, 0);
    const activeAgents = new Set(
        filteredPipelines
            .filter((p) => p.phase !== "COMPLETED" && p.phase !== "FAILED")
            .flatMap((p) => (p.agentTokens || []).map((t) => t.role))
    ).size;
    const totalAgents = agentSummary.length;
    const activePipelines = filteredPipelines.filter((p) => p.phase !== "COMPLETED" && p.phase !== "FAILED").length;

    // ── Pie chart data ──
    const pieData = agentSummary.map((a, i) => ({
        name: a.role,
        value: a.inputTokens + a.outputTokens,
        color: getAgentColor(i),
    }));

    // ── Time series data (aggregate tokenHistory from all pipelines) ──
    const timeSeriesData = useMemo(() => {
        const allHistory = filteredPipelines.flatMap((p) => p.tokenHistory || []);
        if (allHistory.length === 0) return [];

        // Group by hour buckets
        const buckets = new Map<string, Record<string, number>>();
        for (const entry of allHistory) {
            const d = new Date(entry.timestamp);
            const hourKey = `${d.getHours().toString().padStart(2, "0")}:00`;
            const bucket = buckets.get(hourKey) || {};
            const role = entry.agentRole || "Unknown";
            bucket[role] = (bucket[role] || 0) + entry.tokens;
            buckets.set(hourKey, bucket);
        }

        const roles = [...new Set(allHistory.map((h) => h.agentRole || "Unknown"))];
        return Array.from(buckets.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([hour, data]) => ({ hour, ...data }));
    }, [filteredPipelines]);

    const allRoles = useMemo(
        () => [
            ...new Set(filteredPipelines.flatMap((p) => (p.tokenHistory || []).map((h) => h.agentRole || "Unknown"))),
        ],
        [filteredPipelines]
    );

    // ── Recent activity feed ──
    const recentEvents = useMemo(
        () =>
            filteredPipelines
                .flatMap((p) => p.events.map((e) => ({ ...e, projectName: p.name })))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 8),
        [filteredPipelines]
    );

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* ═══ HEADER ═══ */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-[#d4ff00] animate-pulse"></div>
                    <h1 className="text-xl font-black text-white tracking-[0.3em] uppercase">MISSION CONTROL</h1>
                    <span className="text-xs text-slate-500 tracking-widest">// TOKEN MANAGEMENT</span>
                </div>
                <div className="flex items-center gap-3">
                    {/* Project Filter Dropdown */}
                    <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="bg-black border border-white/20 text-white text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 outline-none focus:border-v-accent transition-colors cursor-pointer"
                    >
                        <option value="all">ALL PROJECTS</option>
                        {pipelines.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name.toUpperCase()}
                            </option>
                        ))}
                    </select>
                    <div className="text-[10px] text-[#d4ff00] font-bold tracking-widest bg-[#d4ff00]/10 px-2 py-1 border border-[#d4ff00]/30">
                        GATEWAY ONLINE
                    </div>
                </div>
            </div>

            {/* ═══ KPI CARDS ═══ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="TOKENS AUJOURD'HUI" value={formatTokenCount(totalTokens)} accent="#d4ff00" icon="⚡" />
                <KPICard label="COÛT TOTAL" value={`$${totalCost.toFixed(3)}`} accent="#00e5ff" icon="💰" />
                <KPICard
                    label="AGENTS ACTIFS"
                    value={`${activeAgents} / ${totalAgents || "—"}`}
                    accent="#6bff8a"
                    icon="🤖"
                />
                <KPICard label="PIPELINES EN COURS" value={String(activePipelines)} accent="#ffd93d" icon="🔄" />
            </div>

            {/* ═══ CHARTS ROW ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Time series chart */}
                <div className="lg:col-span-2 bg-[#0d0d0d] border border-white/10 p-4">
                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase mb-3">
                        TOKENS / HEURE — TOUS AGENTS
                    </div>
                    {timeSeriesData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={timeSeriesData}>
                                <XAxis
                                    dataKey="hour"
                                    tick={{ fill: "#64748b", fontSize: 10 }}
                                    axisLine={{ stroke: "#1e293b" }}
                                />
                                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={{ stroke: "#1e293b" }} />
                                <Tooltip
                                    contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 11 }}
                                    labelStyle={{ color: "#d4ff00" }}
                                />
                                {allRoles.map((role, i) => (
                                    <Area
                                        key={role}
                                        type="monotone"
                                        dataKey={role}
                                        stackId="1"
                                        stroke={getAgentColor(i)}
                                        fill={getAgentColor(i)}
                                        fillOpacity={0.3}
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[200px] text-slate-600 text-xs tracking-widest">
                            EN ATTENTE DE DONNÉES...
                        </div>
                    )}
                </div>

                {/* Pie chart */}
                <div className="bg-[#0d0d0d] border border-white/10 p-4">
                    <div className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase mb-3">
                        RÉPARTITION TOKENS
                    </div>
                    {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={70}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, i) => (
                                        <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                                    ))}
                                </Pie>
                                <Legend
                                    layout="vertical"
                                    align="right"
                                    verticalAlign="middle"
                                    iconSize={8}
                                    formatter={(value: string) => (
                                        <span className="text-[10px] text-slate-300 tracking-wider">{value}</span>
                                    )}
                                />
                                <Tooltip
                                    contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 11 }}
                                    formatter={(value: any) => [formatTokenCount(Number(value)), "Tokens"]}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[200px] text-slate-600 text-xs tracking-widest">
                            AUCUNE DONNÉE
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ AGENT CARDS GRID ═══ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {agentSummary.map((agent, i) => {
                    const total = agent.inputTokens + agent.outputTokens;
                    const isOpenRouter = agent.provider === "openrouter";
                    const statusColor = agent.count > 0 ? "#d4ff00" : "#64748b";
                    const timeDiff = agent.lastTimestamp ? getTimeDiff(agent.lastTimestamp) : "";

                    return (
                        <motion.div
                            key={agent.role}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-[#0d0d0d] border border-white/10 p-4 hover:border-white/20 transition-all group"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">{agent.emoji}</span>
                                    <span className="text-xs font-black text-white tracking-wider uppercase truncate max-w-[100px]">
                                        {agent.role}
                                    </span>
                                </div>
                                <span
                                    className="text-[8px] font-bold tracking-widest px-2 py-0.5 border"
                                    style={{
                                        color: statusColor,
                                        borderColor: statusColor + "50",
                                        backgroundColor: statusColor + "10",
                                    }}
                                >
                                    {agent.count > 0 ? "ACTIF" : "IDLE"}
                                </span>
                            </div>

                            {/* Category */}
                            <div className="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-3">
                                {isOpenRouter ? "OPENROUTER" : "ANTHROPIC"}
                            </div>

                            {/* Metrics */}
                            <div className="flex items-end justify-between mb-3">
                                <div>
                                    <div className="text-[9px] text-slate-500 tracking-wider">TOKENS</div>
                                    <div className="text-lg font-black text-white" style={{ color: getAgentColor(i) }}>
                                        {formatTokenCount(total)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[9px] text-slate-500 tracking-wider">COÛT</div>
                                    <div className="text-lg font-black text-white">${agent.cost.toFixed(3)}</div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="border-t border-white/5 pt-2 space-y-1">
                                {timeDiff && <div className="text-[9px] text-slate-500 truncate">{timeDiff}</div>}
                                <div className="text-[9px] text-slate-600 truncate">
                                    via <span className="text-slate-400">{agent.model || "N/A"}</span>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}

                {agentSummary.length === 0 && (
                    <div className="col-span-full flex items-center justify-center py-12 text-slate-600 text-xs tracking-widest">
                        <span className="text-[#d4ff00] mr-2">&gt;</span> AUCUN AGENT DÉTECTÉ — LANCEZ UN PROJET
                    </div>
                )}
            </div>

            {/* ═══ ACTIVITY FEED ═══ */}
            <div className="bg-[#0d0d0d] border border-white/10 p-4">
                <div className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase mb-3">
                    ACTIVITÉ RÉCENTE
                </div>
                <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {recentEvents.map((evt, i) => (
                        <div
                            key={evt.id || i}
                            className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0 text-xs"
                        >
                            <span className="text-slate-600 w-12 shrink-0 text-[10px] font-mono">
                                {new Date(evt.timestamp).toLocaleTimeString("fr-FR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </span>
                            <span className="font-bold text-[#d4ff00] tracking-wider text-[10px] w-24 shrink-0 truncate">
                                {evt.agentRole}
                            </span>
                            <span className="text-slate-400 truncate text-[10px]">{evt.action}</span>
                        </div>
                    ))}
                    {recentEvents.length === 0 && (
                        <div className="text-slate-600 text-[10px] tracking-widest py-4">
                            <span className="text-[#d4ff00]">&gt;</span> Aucune activité récente
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Sub-components ───

function KPICard({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: string }) {
    return (
        <div
            className="bg-[#0d0d0d] border p-4 relative overflow-hidden group hover:border-opacity-100 transition-all"
            style={{ borderColor: accent + "30" }}
        >
            <div
                className="absolute top-0 left-0 w-full h-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }}
            />
            <div className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase mb-1">{label}</div>
            <div className="text-2xl font-black" style={{ color: accent }}>
                {value}
            </div>
            <div className="absolute bottom-2 right-3 text-xl opacity-20 group-hover:opacity-40 transition-opacity">
                {icon}
            </div>
        </div>
    );
}

function getTimeDiff(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    return `il y a ${Math.floor(hours / 24)}j`;
}

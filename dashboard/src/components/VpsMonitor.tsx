import { useState, useEffect, useCallback } from "react";

interface VpsData {
    vps: {
        id: number;
        hostname: string;
        state: string;
        plan: string;
        os: string;
        ip: string;
        cpus: number;
        createdAt: string;
    };
    current: {
        cpu: number;
        ram: { used: number; total: number; percent: number };
        disk: { used: number; total: number; percent: number };
        bandwidth: { used: number; total: number; percent: number };
        traffic: { incoming: number; outgoing: number };
        uptime: number;
    };
    charts: {
        cpu: { t: number; v: number }[];
        ram: { t: number; v: number }[];
        disk: { t: number; v: number }[];
    };
}

const API_BASE = import.meta.env.DEV ? "/api" : "https://api.veist.hach.dev";
const getAuthHeaders = (): Record<string, string> => {
    const auth = localStorage.getItem("veist_auth");
    return auth ? { Authorization: `Basic ${btoa(auth)}` } : {};
};

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
}

function MiniChart({ data, color, height = 32 }: { data: { t: number; v: number }[]; color: string; height?: number }) {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data.map((d) => d.v)) || 1;
    const w = 120;
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = height - (d.v / max) * (height - 4);
        return `${x},${y}`;
    });

    return (
        <svg width={w} height={height} style={{ opacity: 0.6 }}>
            <polyline fill="none" stroke={color} strokeWidth={1.5} points={points.join(" ")} />
            {/* Fill area */}
            <polygon fill={color} opacity={0.1} points={`0,${height} ${points.join(" ")} ${w},${height}`} />
        </svg>
    );
}

function GaugeRing({
    percent,
    color,
    size = 80,
    label,
    value,
    subValue,
}: {
    percent: number;
    color: string;
    size?: number;
    label: string;
    value: string;
    subValue?: string;
}) {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
        <div className="flex flex-col items-center gap-1.5">
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={4}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={4}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s ease" }}
                />
            </svg>
            <div
                style={{
                    marginTop: -size - 4,
                    height: size,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <span style={{ fontSize: "1rem", fontWeight: 700, color }}>{value}</span>
            </div>
            <div
                style={{
                    fontSize: "0.6rem",
                    color: "rgba(255,255,255,0.4)",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    marginTop: 4,
                }}
            >
                {label}
            </div>
            {subValue && <div style={{ fontSize: "0.5rem", color: "rgba(255,255,255,0.25)" }}>{subValue}</div>}
        </div>
    );
}

export function VpsMonitor() {
    const [data, setData] = useState<VpsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/vps/metrics`, {
                headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json);
            setError("");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [load]);

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div style={{ color: "rgba(215,255,47,0.4)", fontSize: "0.7rem", letterSpacing: "0.1em" }}>
                    LOADING VPS METRICS...
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="h-full flex items-center justify-center">
                <div style={{ color: "#FF6A3D", fontSize: "0.7rem" }}>ERROR: {error || "No data"}</div>
            </div>
        );
    }

    const { vps, current, charts } = data;
    const cpuColor = current.cpu > 80 ? "#FF6A3D" : current.cpu > 50 ? "#F59E0B" : "#D7FF2F";
    const ramColor = current.ram.percent > 80 ? "#FF6A3D" : current.ram.percent > 60 ? "#F59E0B" : "#34d399";
    const diskColor = current.disk.percent > 80 ? "#FF6A3D" : current.disk.percent > 60 ? "#F59E0B" : "#60a5fa";

    return (
        <div className="h-full overflow-y-auto" style={{ fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace" }}>
            <div className="p-6 max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 style={{ fontSize: "0.8rem", color: "#D7FF2F", fontWeight: 700, letterSpacing: "0.15em" }}>
                            VPS MONITOR
                        </h2>
                        <div style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                            REAL-TIME SYSTEM METRICS • HOSTINGER KVM
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: vps.state === "running" ? "#34d399" : "#FF6A3D",
                                display: "inline-block",
                                boxShadow: vps.state === "running" ? "0 0 8px #34d399" : "0 0 8px #FF6A3D",
                            }}
                        />
                        <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>
                            {vps.state.toUpperCase()}
                        </span>
                    </div>
                </div>

                {/* VPS Info Card */}
                <div
                    className="mb-6 p-4"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ fontSize: "0.55rem" }}>
                        <div>
                            <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 4, letterSpacing: "0.1em" }}>
                                HOSTNAME
                            </div>
                            <div style={{ color: "#D7FF2F" }}>{vps.hostname}</div>
                        </div>
                        <div>
                            <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 4, letterSpacing: "0.1em" }}>
                                IP ADDRESS
                            </div>
                            <div style={{ color: "rgba(255,255,255,0.7)" }}>{vps.ip}</div>
                        </div>
                        <div>
                            <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 4, letterSpacing: "0.1em" }}>
                                PLAN
                            </div>
                            <div style={{ color: "rgba(255,255,255,0.7)" }}>
                                {vps.plan} • {vps.cpus} vCPU
                            </div>
                        </div>
                        <div>
                            <div style={{ color: "rgba(255,255,255,0.3)", marginBottom: 4, letterSpacing: "0.1em" }}>
                                UPTIME
                            </div>
                            <div style={{ color: "#34d399" }}>{formatUptime(current.uptime)}</div>
                        </div>
                    </div>
                </div>

                {/* Gauges Row */}
                <div className="grid grid-cols-3 gap-6 mb-8">
                    <div
                        className="flex flex-col items-center p-5"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <GaugeRing
                            percent={current.cpu}
                            color={cpuColor}
                            label="CPU USAGE"
                            value={`${current.cpu}%`}
                            subValue={`${vps.cpus} vCPU`}
                        />
                        <div className="mt-4">
                            <MiniChart data={charts.cpu} color={cpuColor} />
                        </div>
                    </div>

                    <div
                        className="flex flex-col items-center p-5"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <GaugeRing
                            percent={current.ram.percent}
                            color={ramColor}
                            label="MEMORY"
                            value={`${current.ram.percent}%`}
                            subValue={`${formatBytes(current.ram.used)} / ${formatBytes(current.ram.total)}`}
                        />
                        <div className="mt-4">
                            <MiniChart data={charts.ram} color={ramColor} />
                        </div>
                    </div>

                    <div
                        className="flex flex-col items-center p-5"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <GaugeRing
                            percent={current.disk.percent}
                            color={diskColor}
                            label="DISK USAGE"
                            value={`${current.disk.percent}%`}
                            subValue={`${formatBytes(current.disk.used)} / ${formatBytes(current.disk.total)}`}
                        />
                        <div className="mt-4">
                            <MiniChart data={charts.disk} color={diskColor} />
                        </div>
                    </div>
                </div>

                {/* Traffic & Bandwidth */}
                <div className="grid grid-cols-2 gap-4">
                    <div
                        className="p-4"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <div
                            style={{
                                fontSize: "0.55rem",
                                color: "rgba(255,255,255,0.3)",
                                letterSpacing: "0.1em",
                                marginBottom: 12,
                            }}
                        >
                            NETWORK TRAFFIC (24H)
                        </div>
                        <div className="flex justify-between items-center">
                            <div>
                                <div style={{ fontSize: "0.5rem", color: "rgba(255,255,255,0.3)" }}>↓ INCOMING</div>
                                <div style={{ fontSize: "0.9rem", color: "#60a5fa", fontWeight: 700 }}>
                                    {formatBytes(current.traffic.incoming)}
                                </div>
                            </div>
                            <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.06)" }} />
                            <div>
                                <div style={{ fontSize: "0.5rem", color: "rgba(255,255,255,0.3)" }}>↑ OUTGOING</div>
                                <div style={{ fontSize: "0.9rem", color: "#a78bfa", fontWeight: 700 }}>
                                    {formatBytes(current.traffic.outgoing)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        className="p-4"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <div
                            style={{
                                fontSize: "0.55rem",
                                color: "rgba(255,255,255,0.3)",
                                letterSpacing: "0.1em",
                                marginBottom: 12,
                            }}
                        >
                            BANDWIDTH
                        </div>
                        <div className="flex items-end gap-3">
                            <div style={{ fontSize: "1.2rem", color: "#D7FF2F", fontWeight: 700 }}>
                                {formatBytes(current.bandwidth.used)}
                            </div>
                            <div style={{ fontSize: "0.5rem", color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>
                                / {formatBytes(current.bandwidth.total)}
                            </div>
                        </div>
                        {/* Bandwidth bar */}
                        <div
                            className="mt-3"
                            style={{ height: 4, background: "rgba(255,255,255,0.06)", width: "100%" }}
                        >
                            <div
                                style={{
                                    height: "100%",
                                    width: `${Math.min(current.bandwidth.percent, 100)}%`,
                                    background: "linear-gradient(90deg, #D7FF2F, #34d399)",
                                    transition: "width 1s ease",
                                }}
                            />
                        </div>
                        <div style={{ fontSize: "0.45rem", color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
                            {current.bandwidth.percent}% USED
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

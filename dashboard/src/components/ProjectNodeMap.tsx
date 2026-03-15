import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { PipelineEvent } from '../api/client';

export interface NodeTopology {
    id: string;
    role: string;
    emoji: string;
    description: string;
    dependencies: string[];
    provider?: 'anthropic' | 'openrouter';
    model?: string;
}

export interface ProjectNodeMapProps {
    topology?: NodeTopology[];
    agents: { role: string; emoji: string; status: string; currentAction?: string }[];
    events?: PipelineEvent[];
    selectedNodeId?: string | null;
    onSelectNode?: (id: string | null) => void;
    nodeStatuses?: Record<string, 'COMPLETED' | 'FAILED' | 'PENDING'>;
    pipelinePhase?: string;
}

type NodeStatus = 'waiting' | 'active' | 'done' | 'error';

interface LayoutNode {
    id: string;
    node: NodeTopology;
    x: number;
    y: number;
    depth: number;
}

function calculateDepths(nodes: NodeTopology[]): Map<string, number> {
    const depths = new Map<string, number>();
    nodes.forEach(n => depths.set(n.id, 0));
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of nodes) {
            let maxDep = -1;
            for (const depId of node.dependencies) {
                const d = depths.get(depId);
                if (d !== undefined && d > maxDep) maxDep = d;
            }
            const newDepth = maxDep + 1;
            if (depths.get(node.id) !== newDepth) {
                depths.set(node.id, newDepth);
                changed = true;
            }
        }
    }
    return depths;
}

const NODE_W = 180;
const NODE_H = 52;
const H_SPACING = 260;
const V_SPACING = 90;

export function ProjectNodeMap({ topology, agents, selectedNodeId, onSelectNode, nodeStatuses, pipelinePhase }: ProjectNodeMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });
    const tRef = useRef(transform);
    tRef.current = transform;

    const safeTopology = useMemo(() => {
        if (topology && topology.length > 0) return topology;
        return agents.filter(Boolean).map((a, i, arr) => ({
            id: a.role.replace(/\s+/g, '_').toLowerCase(),
            role: a.role,
            emoji: a.emoji,
            description: '',
            dependencies: i > 0 ? [arr[i - 1].role.replace(/\s+/g, '_').toLowerCase()] : []
        }));
    }, [topology, agents]);

    // Tree layout
    const layout = useMemo((): LayoutNode[] => {
        const depths = calculateDepths(safeTopology);
        const maxDepth = Math.max(0, ...Array.from(depths.values()));
        const layers: NodeTopology[][] = Array.from({ length: maxDepth + 1 }, () => []);
        safeTopology.forEach(node => {
            layers[depths.get(node.id) || 0].push(node);
        });
        const maxLayerSize = Math.max(...layers.map(l => l.length));
        const totalH = maxLayerSize * V_SPACING;
        const result: LayoutNode[] = [];
        layers.forEach((layer, col) => {
            const layerH = layer.length * V_SPACING;
            const offsetY = (totalH - layerH) / 2;
            layer.forEach((node, row) => {
                result.push({
                    id: node.id,
                    node,
                    x: col * H_SPACING + 60,
                    y: offsetY + row * V_SPACING + 60,
                    depth: col
                });
            });
        });
        return result;
    }, [safeTopology]);

    const layoutMap = useMemo(() => {
        const m = new Map<string, LayoutNode>();
        layout.forEach(l => m.set(l.id, l));
        return m;
    }, [layout]);

    // Auto-fit only on first render
    const hasInitialized = useRef(false);
    useEffect(() => {
        if (hasInitialized.current || !containerRef.current || layout.length === 0) return;
        hasInitialized.current = true;
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const minX = Math.min(...layout.map(n => n.x)) - 40;
        const maxX = Math.max(...layout.map(n => n.x)) + NODE_W + 40;
        const minY = Math.min(...layout.map(n => n.y)) - 40;
        const maxY = Math.max(...layout.map(n => n.y)) + NODE_H + 40;
        const gw = maxX - minX;
        const gh = maxY - minY;
        const scale = Math.min(cw / gw, ch / gh, 1.3);
        setTransform({
            x: (cw - gw * scale) / 2 - minX * scale,
            y: (ch - gh * scale) / 2 - minY * scale,
            scale
        });
    }, [layout]);

    // Zoom (mouse wheel)
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const t = tRef.current;
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const ns = Math.max(0.15, Math.min(4, t.scale * factor));
        setTransform({
            x: mx - (mx - t.x) * (ns / t.scale),
            y: my - (my - t.y) * (ns / t.scale),
            scale: ns
        });
    }, []);

    // Pan
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('[data-node]')) return;
        setIsPanning(true);
        panStart.current = { x: e.clientX - tRef.current.x, y: e.clientY - tRef.current.y };
    }, []);
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning) return;
        setTransform(t => ({ ...t, x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }));
    }, [isPanning]);
    const handleMouseUp = useCallback(() => setIsPanning(false), []);

    // Status
    const getStatus = (nodeId: string, role: string): NodeStatus => {
        if (pipelinePhase === 'COMPLETED') return 'done';
        if (pipelinePhase === 'FAILED') {
            if (nodeStatuses?.[nodeId] === 'FAILED') return 'error';
            if (nodeStatuses?.[nodeId] === 'COMPLETED') return 'done';
        }
        if (nodeStatuses?.[nodeId] === 'COMPLETED') return 'done';
        if (nodeStatuses?.[nodeId] === 'FAILED') return 'error';
        const ag = agents.find(a => a.role === role);
        return (ag?.status as NodeStatus) || 'waiting';
    };

    const sc: Record<NodeStatus, { dot: string; border: string; text: string; label: string }> = {
        waiting: { dot: 'rgba(215,255,47,0.15)', border: 'rgba(215,255,47,0.2)', text: 'rgba(215,255,47,0.4)', label: 'IDLE' },
        active:  { dot: '#D7FF2F', border: '#D7FF2F', text: '#D7FF2F', label: 'PROCESSING' },
        done:    { dot: '#34d399', border: 'rgba(52,211,153,0.5)', text: '#34d399', label: 'STABLE' },
        error:   { dot: '#FF6A3D', border: '#FF6A3D', text: '#FF6A3D', label: 'CRITICAL' }
    };

    const graphW = layout.length > 0 ? Math.max(...layout.map(n => n.x)) + NODE_W + 200 : 800;
    const graphH = layout.length > 0 ? Math.max(...layout.map(n => n.y)) + NODE_H + 200 : 600;

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden"
            style={{
                background: 'radial-gradient(ellipse at center, rgba(28,36,44,0.3) 0%, #0B0F14 70%)',
                cursor: isPanning ? 'grabbing' : 'grab',
                fontFamily: "'JetBrains Mono', 'IBM Plex Mono', monospace"
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* CRT Scanlines */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.06] z-[1]"
                style={{
                    background: 'linear-gradient(to bottom, transparent 50%, rgba(215,255,47,0.05) 50%)',
                    backgroundSize: '100% 4px'
                }}
            />

            {/* Transform layer */}
            <div style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: '0 0',
                position: 'absolute',
                top: 0, left: 0,
                willChange: 'transform'
            }}>
                {/* SVG Connection Lines */}
                <svg className="absolute pointer-events-none" style={{ top: 0, left: 0, width: graphW, height: graphH, overflow: 'visible' }}>
                    {safeTopology.map(node =>
                        node.dependencies.map(depId => {
                            const src = layoutMap.get(depId);
                            const tgt = layoutMap.get(node.id);
                            if (!src || !tgt) return null;

                            const sx = src.x + NODE_W;
                            const sy = src.y + NODE_H / 2;
                            const tx = tgt.x;
                            const ty = tgt.y + NODE_H / 2;

                            const srcSt = getStatus(depId, src.node.role);
                            const tgtSt = getStatus(node.id, node.role);
                            const isLive = srcSt === 'active' || tgtSt === 'active';
                            const isDone = srcSt === 'done' && tgtSt === 'done';
                            const isErr = srcSt === 'error' || tgtSt === 'error';

                            const color = isErr ? '#FF6A3D' : isLive ? '#D7FF2F' : isDone ? '#34d399' : '#D7FF2F';
                            const opacity = isErr ? 0.8 : isLive ? 0.6 : isDone ? 0.4 : 0.15;
                            const width = isLive ? 1.5 : 1;

                            // Bezier curve
                            const cpx = (sx + tx) / 2;

                            return (
                                <g key={`${depId}->${node.id}`}>
                                    <path
                                        d={`M ${sx} ${sy} C ${cpx} ${sy}, ${cpx} ${ty}, ${tx} ${ty}`}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={width}
                                        opacity={opacity}
                                        strokeDasharray={isErr ? '4 3' : isLive ? '6 4' : 'none'}
                                    />
                                    <rect x={tx - 2} y={ty - 2} width={4} height={4} fill={color} opacity={opacity} />
                                </g>
                            );
                        })
                    )}
                </svg>

                {/* Nodes */}
                {layout.map(ln => {
                    const status = getStatus(ln.id, ln.node.role);
                    const s = sc[status];
                    const sel = selectedNodeId === ln.id;
                    const agent = agents.find(a => a.role === ln.node.role);

                    return (
                        <div
                            key={ln.id}
                            data-node="true"
                            onClick={(e) => { e.stopPropagation(); onSelectNode?.(sel ? null : ln.id); }}
                            className="absolute select-none group"
                            style={{ left: ln.x, top: ln.y, width: NODE_W, cursor: 'pointer' }}
                        >
                            <div
                                className="relative p-2.5 transition-all duration-200"
                                style={{
                                    background: sel ? 'rgba(215,255,47,0.05)' : '#0B0F14',
                                    border: `1px solid ${sel ? '#D7FF2F' : s.border}`,
                                    boxShadow: sel
                                        ? '0 0 20px rgba(215,255,47,0.12)'
                                        : status === 'error'
                                            ? '0 0 15px rgba(255,106,61,0.15)'
                                            : status === 'active'
                                                ? '0 0 10px rgba(215,255,47,0.08)'
                                                : 'none',
                                }}
                            >
                                {/* Header: dot + role */}
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span
                                        className="shrink-0"
                                        style={{
                                            width: 6, height: 6,
                                            background: s.dot,
                                            display: 'block',
                                            animation: status === 'active' ? 'pulse 2s infinite' : 'none'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.6rem', color: s.text, fontWeight: 700, letterSpacing: '0.05em' }}>
                                        {ln.node.role.toUpperCase()}
                                    </span>
                                </div>
                                {/* Status label */}
                                <div style={{ fontSize: '0.5rem', color: s.text, opacity: 0.6, marginLeft: 14, letterSpacing: '0.1em' }}>
                                    STATUS: {s.label}
                                </div>
                                {/* Model info on hover / selected */}
                                {(sel || status !== 'waiting') && ln.node.model && (
                                    <div style={{
                                        fontSize: '0.45rem',
                                        color: 'rgba(215,255,47,0.3)',
                                        marginLeft: 14,
                                        marginTop: 2,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap' as const
                                    }}>
                                        {ln.node.provider === 'openrouter' ? 'OR' : 'AN'}::{ln.node.model}
                                    </div>
                                )}
                                {/* Current action */}
                                {status === 'active' && agent?.currentAction && (
                                    <div style={{
                                        fontSize: '0.45rem',
                                        color: '#D7FF2F',
                                        opacity: 0.5,
                                        marginLeft: 14,
                                        marginTop: 3,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap' as const
                                    }}>
                                        ▶ {agent.currentAction}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Zoom HUD */}
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-3"
                style={{ fontSize: '0.55rem', color: 'rgba(215,255,47,0.3)', fontFamily: "'JetBrains Mono', monospace" }}
            >
                <span>ZOOM: {Math.round(transform.scale * 100)}%</span>
                <span>|</span>
                <span>NODES: {layout.length}</span>
                <span>|</span>
                <span>SCROLL_ZOOM • DRAG_PAN</span>
            </div>
        </div>
    );
}

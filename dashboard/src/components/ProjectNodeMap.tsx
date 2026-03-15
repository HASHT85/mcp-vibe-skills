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

export function ProjectNodeMap({ topology, agents, selectedNodeId, onSelectNode, nodeStatuses, pipelinePhase }: ProjectNodeMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });
    const transformRef = useRef(transform);
    transformRef.current = transform;

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

    // Layout: tree with horizontal spacing
    const layout = useMemo((): LayoutNode[] => {
        const depths = calculateDepths(safeTopology);
        const maxDepth = Math.max(0, ...Array.from(depths.values()));
        
        // Group by depth
        const layers: NodeTopology[][] = Array.from({ length: maxDepth + 1 }, () => []);
        safeTopology.forEach(node => {
            const d = depths.get(node.id) || 0;
            layers[d].push(node);
        });

        const NODE_H_SPACING = 280;
        const NODE_V_SPACING = 120;
        const result: LayoutNode[] = [];

        // Calculate total height needed
        const maxLayerSize = Math.max(...layers.map(l => l.length));
        const totalHeight = maxLayerSize * NODE_V_SPACING;

        layers.forEach((layer, colIdx) => {
            const layerHeight = layer.length * NODE_V_SPACING;
            const offsetY = (totalHeight - layerHeight) / 2;
            layer.forEach((node, rowIdx) => {
                result.push({
                    id: node.id,
                    node,
                    x: colIdx * NODE_H_SPACING,
                    y: offsetY + rowIdx * NODE_V_SPACING,
                    depth: colIdx
                });
            });
        });

        return result;
    }, [safeTopology]);

    // Auto-fit on mount
    useEffect(() => {
        if (!containerRef.current || layout.length === 0) return;
        const container = containerRef.current;
        const cw = container.clientWidth;
        const ch = container.clientHeight;

        const NODE_W = 200;
        const NODE_H = 60;
        const minX = Math.min(...layout.map(n => n.x));
        const maxX = Math.max(...layout.map(n => n.x)) + NODE_W;
        const minY = Math.min(...layout.map(n => n.y));
        const maxY = Math.max(...layout.map(n => n.y)) + NODE_H;

        const graphW = maxX - minX + 100;
        const graphH = maxY - minY + 100;


        const scale = Math.min(cw / graphW, ch / graphH, 1.2);
        const scaledW = graphW * scale;
        const scaledH = graphH * scale;

        setTransform({
            x: (cw - scaledW) / 2 - minX * scale + 50 * scale,
            y: (ch - scaledH) / 2 - minY * scale + 50 * scale,
            scale
        });
    }, [layout]);

    // Zoom with mouse wheel
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const t = transformRef.current;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.2, Math.min(3, t.scale * delta));

        // Zoom towards mouse position
        const newX = mouseX - (mouseX - t.x) * (newScale / t.scale);
        const newY = mouseY - (mouseY - t.y) * (newScale / t.scale);

        setTransform({ x: newX, y: newY, scale: newScale });
    }, []);

    // Pan
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        // Only pan on background click
        if ((e.target as HTMLElement).closest('[data-node]')) return;
        setIsPanning(true);
        panStart.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning) return;
        setTransform(t => ({
            ...t,
            x: e.clientX - panStart.current.x,
            y: e.clientY - panStart.current.y
        }));
    }, [isPanning]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    // Status resolution
    const getNodeStatus = (nodeId: string, role: string): NodeStatus => {
        if (pipelinePhase === 'COMPLETED') return 'done';
        if (pipelinePhase === 'FAILED') {
            if (nodeStatuses?.[nodeId] === 'FAILED') return 'error';
            if (nodeStatuses?.[nodeId] === 'COMPLETED') return 'done';
        }
        if (nodeStatuses) {
            if (nodeStatuses[nodeId] === 'COMPLETED') return 'done';
            if (nodeStatuses[nodeId] === 'FAILED') return 'error';
        }
        const agent = agents.find(a => a.role === role);
        if (agent) return agent.status as NodeStatus;
        return 'waiting';
    };

    const statusColors: Record<NodeStatus, { dot: string; border: string; text: string; label: string; glow: string }> = {
        waiting: { dot: '#475569', border: '#334155', text: '#94a3b8', label: 'IDLE', glow: 'none' },
        active:  { dot: '#CDFF00', border: '#CDFF00', text: '#CDFF00', label: 'ACTIVE', glow: '0 0 12px rgba(205,255,0,0.4)' },
        done:    { dot: '#34d399', border: '#059669', text: '#34d399', label: 'DONE', glow: 'none' },
        error:   { dot: '#ef4444', border: '#dc2626', text: '#ef4444', label: 'ERROR', glow: '0 0 12px rgba(239,68,68,0.4)' }
    };

    // Node dimensions for connection math
    const NODE_W = 200;
    const NODE_H = 56;

    // Build layout map for connections
    const layoutMap = useMemo(() => {
        const map = new Map<string, LayoutNode>();
        layout.forEach(l => map.set(l.id, l));
        return map;
    }, [layout]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden bg-[#080C10]"
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Grid background */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04]">
                <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#fff" strokeWidth="0.5"/>
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {/* Transform container */}
            <div
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    transformOrigin: '0 0',
                    position: 'absolute',
                    top: 0, left: 0,
                    willChange: 'transform'
                }}
            >
                {/* SVG Connections */}
                <svg
                    className="absolute pointer-events-none"
                    style={{
                        top: 0, left: 0,
                        width: layout.length > 0 ? Math.max(...layout.map(n => n.x)) + NODE_W + 200 : 800,
                        height: layout.length > 0 ? Math.max(...layout.map(n => n.y)) + NODE_H + 200 : 600,
                        overflow: 'visible'
                    }}
                >
                    {safeTopology.map(node =>
                        node.dependencies.map(depId => {
                            const source = layoutMap.get(depId);
                            const target = layoutMap.get(node.id);
                            if (!source || !target) return null;

                            const sx = source.x + NODE_W;
                            const sy = source.y + NODE_H / 2;
                            const tx = target.x;
                            const ty = target.y + NODE_H / 2;

                            const srcStatus = getNodeStatus(depId, source.node.role);
                            const tgtStatus = getNodeStatus(node.id, node.role);
                            const isLive = srcStatus === 'active' || tgtStatus === 'active';
                            const isDone = srcStatus === 'done' && tgtStatus === 'done';

                            const color = isLive ? '#CDFF00' : isDone ? '#34d399' : '#1e293b';
                            const width = isLive ? 2 : isDone ? 1.5 : 1;

                            // Organic bezier
                            const cpx = (sx + tx) / 2;

                            return (
                                <g key={`${depId}->${node.id}`}>
                                    <path
                                        d={`M ${sx} ${sy} C ${cpx} ${sy}, ${cpx} ${ty}, ${tx} ${ty}`}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={width}
                                        strokeDasharray={isLive ? '6 4' : 'none'}
                                        opacity={isLive || isDone ? 1 : 0.5}
                                    />
                                    {/* Dot at target */}
                                    <circle cx={tx} cy={ty} r={3} fill={color} />
                                    {/* Dot at source */}
                                    <circle cx={sx} cy={sy} r={2.5} fill={color} />
                                </g>
                            );
                        })
                    )}
                </svg>

                {/* Nodes */}
                {layout.map(ln => {
                    const status = getNodeStatus(ln.id, ln.node.role);
                    const sc = statusColors[status];
                    const isSelected = selectedNodeId === ln.id;
                    const agent = agents.find(a => a.role === ln.node.role);

                    return (
                        <div
                            key={ln.id}
                            data-node="true"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectNode?.(isSelected ? null : ln.id);
                            }}
                            className="absolute select-none transition-all duration-200"
                            style={{
                                left: ln.x,
                                top: ln.y,
                                width: NODE_W,
                                cursor: 'pointer'
                            }}
                        >
                            <div
                                className="relative border rounded-sm px-3 py-2 transition-all duration-200"
                                style={{
                                    background: isSelected ? 'rgba(205,255,0,0.06)' : 'rgba(8,12,16,0.95)',
                                    borderColor: isSelected ? '#CDFF00' : sc.border,
                                    boxShadow: isSelected ? '0 0 20px rgba(205,255,0,0.15)' : sc.glow,
                                }}
                            >
                                {/* Status dot + label row */}
                                <div className="flex items-center gap-2 mb-1">
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{
                                            background: sc.dot,
                                            animation: (status === 'active' || status === 'error') ? 'pulse 2s infinite' : 'none'
                                        }}
                                    />
                                    <span className="text-[10px] font-mono font-bold truncate" style={{ color: sc.text }}>
                                        {ln.node.role.toUpperCase()}
                                    </span>
                                </div>
                                {/* Status label */}
                                <div className="text-[8px] font-mono ml-4 tracking-widest" style={{ color: sc.text, opacity: 0.7 }}>
                                    [{sc.label}]
                                </div>
                                {/* Current action if active */}
                                {status === 'active' && agent?.currentAction && (
                                    <div className="text-[8px] font-mono text-v-accent/60 mt-1 ml-4 truncate">
                                        ▶ {agent.currentAction}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Zoom indicator */}
            <div className="absolute bottom-3 right-3 text-[9px] font-mono text-slate-600 bg-black/50 px-2 py-1 rounded border border-white/5">
                {Math.round(transform.scale * 100)}% • scroll to zoom • drag to pan
            </div>
        </div>
    );
}

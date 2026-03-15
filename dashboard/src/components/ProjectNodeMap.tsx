import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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

function calculateDepths(nodes: NodeTopology[]): Map<string, number> {
    const depths = new Map<string, number>();
    let changed = true;
    nodes.forEach(n => depths.set(n.id, 0));
    while (changed) {
        changed = false;
        for (const node of nodes) {
            let maxDepDepth = -1;
            for (const depId of node.dependencies) {
                const d = depths.get(depId);
                if (d !== undefined && d > maxDepDepth) maxDepDepth = d;
            }
            const newDepth = maxDepDepth + 1;
            if (depths.get(node.id) !== newDepth) {
                depths.set(node.id, newDepth);
                changed = true;
            }
        }
    }
    return depths;
}

type NodeStatus = 'waiting' | 'active' | 'done' | 'error';

export function ProjectNodeMap({ topology, agents, events, selectedNodeId, onSelectNode, nodeStatuses, pipelinePhase }: ProjectNodeMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [nodeRects, setNodeRects] = useState<Record<string, { x: number, y: number, w: number, h: number }>>({});
    
    const safeTopology = useMemo(() => {
        if (topology && topology.length > 0) return topology;
        const safeAgents = agents.filter(Boolean);
        return safeAgents.map((a, i) => ({
            id: a.role.replace(/\s+/g, '_').toLowerCase(),
            role: a.role,
            emoji: a.emoji,
            description: "Legacy node",
            dependencies: i > 0 ? [safeAgents[i-1].role.replace(/\s+/g, '_').toLowerCase()] : []
        }));
    }, [topology, agents]);

    const layers = useMemo(() => {
        const depths = calculateDepths(safeTopology);
        const maxDepth = Math.max(0, ...Array.from(depths.values()));
        const result: NodeTopology[][] = Array.from({ length: maxDepth + 1 }, () => []);
        safeTopology.forEach(node => {
            const d = depths.get(node.id) || 0;
            if (result[d]) result[d].push(node);
        });
        return result;
    }, [safeTopology]);

    const updateRects = useCallback(() => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const newRects: Record<string, {x: number, y: number, w: number, h: number}> = {};
        const elements = containerRef.current.querySelectorAll('[data-node-id]');
        elements.forEach(el => {
            const id = el.getAttribute('data-node-id')!;
            const rect = el.getBoundingClientRect();
            newRects[id] = {
                x: rect.left - containerRect.left,
                y: rect.top - containerRect.top,
                w: rect.width,
                h: rect.height
            };
        });
        setNodeRects(newRects);
    }, [layers]);

    useEffect(() => {
        updateRects();
        const handleResize = () => requestAnimationFrame(updateRects);
        window.addEventListener('resize', handleResize);
        const timeout = setTimeout(updateRects, 150);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeout);
        };
    }, [updateRects]);

    // Accurate status resolution
    const getNodeStatus = (nodeId: string, role: string): NodeStatus => {
        // Pipeline completed → all nodes done
        if (pipelinePhase === 'COMPLETED') return 'done';
        if (pipelinePhase === 'FAILED') {
            // Check if this specific node failed
            if (nodeStatuses?.[nodeId] === 'FAILED') return 'error';
            if (nodeStatuses?.[nodeId] === 'COMPLETED') return 'done';
        }
        
        // Use nodeStatuses from backend if available
        if (nodeStatuses) {
            const ns = nodeStatuses[nodeId];
            if (ns === 'COMPLETED') return 'done';
            if (ns === 'FAILED') return 'error';
        }
        
        // Fallback to agent status
        const agent = agents.find(a => a.role === role);
        if (agent) return agent.status as NodeStatus;
        
        return 'waiting';
    };

    const statusConfig: Record<NodeStatus, { bg: string; border: string; dot: string; label: string; labelColor: string }> = {
        waiting: { bg: 'bg-[#0B0F14]', border: 'border-slate-700/60', dot: 'bg-slate-600', label: 'WAITING', labelColor: 'text-slate-500' },
        active:  { bg: 'bg-[#0d1a0f]', border: 'border-v-accent/60', dot: 'bg-v-accent animate-pulse', label: 'ACTIVE', labelColor: 'text-v-accent' },
        done:    { bg: 'bg-[#0B0F14]', border: 'border-emerald-500/40', dot: 'bg-emerald-400', label: 'DONE', labelColor: 'text-emerald-400' },
        error:   { bg: 'bg-[#1a0d0d]', border: 'border-red-500/50', dot: 'bg-red-500 animate-pulse', label: 'ERROR', labelColor: 'text-red-400' }
    };

    return (
        <div className="w-full h-full p-6 relative overflow-auto custom-scrollbar" ref={containerRef}>
            {/* SVG Connections */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                {safeTopology.map(node => 
                    node.dependencies.map(depId => {
                        const source = nodeRects[depId];
                        const target = nodeRects[node.id];
                        if (!source || !target) return null;
                        
                        const startX = source.x + source.w;
                        const startY = source.y + (source.h / 2);
                        const endX = target.x;
                        const endY = target.y + (target.h / 2);
                        
                        const sourceStatus = getNodeStatus(depId, safeTopology.find(n => n.id === depId)?.role || '');
                        const targetStatus = getNodeStatus(node.id, node.role);
                        const isLive = sourceStatus === 'active' || targetStatus === 'active';
                        const isDone = sourceStatus === 'done' && targetStatus === 'done';
                        
                        const strokeColor = isLive ? '#CDFF00' : isDone ? '#34d399' : 'rgba(255,255,255,0.08)';
                        const strokeWidth = isLive ? 2.5 : isDone ? 1.5 : 1;
                        const controlX = startX + (endX - startX) / 2;

                        return (
                            <g key={`${depId}->${node.id}`}>
                                <path
                                    d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
                                    fill="none"
                                    stroke={strokeColor}
                                    strokeWidth={strokeWidth}
                                    strokeDasharray={isLive ? "6 4" : "none"}
                                    className={isLive ? 'animate-[dash_1s_linear_infinite]' : ''}
                                />
                                {/* Arrow head */}
                                <circle cx={endX} cy={endY} r={3} fill={strokeColor} />
                            </g>
                        );
                    })
                )}
            </svg>

            {/* Node Layers (left → right) */}
            <div className="relative z-10 w-full h-full flex justify-start items-center gap-12 overflow-x-auto overflow-y-hidden">
                {layers.map((layer, colIndex) => (
                    <div key={colIndex} className="flex flex-col justify-center gap-6 min-w-[240px] shrink-0">
                        {/* Column label */}
                        <div className="text-[9px] text-slate-600 font-bold tracking-[0.3em] uppercase text-center mb-1">
                            {colIndex === 0 ? 'INIT' : colIndex === layers.length - 1 ? 'FINAL' : `STAGE_${colIndex}`}
                        </div>
                        {layer.map(node => {
                            const status = getNodeStatus(node.id, node.role);
                            const cfg = statusConfig[status];
                            const isSelected = selectedNodeId === node.id;
                            const agent = agents.find(a => a.role === node.role);
                            
                            return (
                                <motion.button
                                    key={node.id}
                                    data-node-id={node.id}
                                    onClick={() => onSelectNode?.(isSelected ? null : node.id)}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    className={`group relative text-left p-4 border-2 transition-all duration-300 rounded-sm ${
                                        isSelected 
                                            ? 'bg-[#0d1a0f] border-v-accent shadow-[0_0_25px_rgba(205,255,0,0.15)] z-20' 
                                            : `${cfg.bg} ${cfg.border} hover:border-white/30`
                                    }`}
                                >
                                    {/* Status dot */}
                                    <div className="absolute top-3 right-3 flex items-center gap-2">
                                        <span className={`text-[8px] font-bold tracking-widest ${cfg.labelColor}`}>{cfg.label}</span>
                                        <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`}></div>
                                    </div>

                                    {/* Node header */}
                                    <div className="flex items-center gap-3 mb-2 pr-20">
                                        <span className="text-2xl">{node.emoji}</span>
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-bold tracking-widest uppercase truncate text-white/30">
                                                {node.id}
                                            </div>
                                            <div className={`text-xs font-black uppercase truncate ${isSelected ? 'text-v-accent' : 'text-white'}`}>
                                                {node.role}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div className="text-[9px] text-slate-500 mt-1 truncate">
                                        {node.description}
                                    </div>

                                    {/* Model/Provider tag */}
                                    {node.model && (
                                        <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-2">
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${
                                                node.provider === 'openrouter' 
                                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                                                    : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                            }`}>
                                                {node.provider || 'anthropic'}
                                            </span>
                                            <span className="text-[9px] text-slate-400 font-mono truncate">
                                                {node.model}
                                            </span>
                                        </div>
                                    )}

                                    {/* Current action (if active) */}
                                    {status === 'active' && agent?.currentAction && (
                                        <div className="mt-2 text-[9px] text-v-accent/70 font-mono truncate animate-pulse">
                                            ▶ {agent.currentAction}
                                        </div>
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

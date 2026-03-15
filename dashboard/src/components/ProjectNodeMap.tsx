import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PipelineEvent } from '../api/client';

export interface NodeTopology {
    id: string;
    role: string;
    emoji: string;
    description: string;
    dependencies: string[];
}

export interface ProjectNodeMapProps {
    topology?: NodeTopology[];
    agents: { role: string; emoji: string; status: string }[];
    events?: PipelineEvent[];
    selectedNodeId?: string | null;
    onSelectNode?: (id: string | null) => void;
}

function calculateDepths(nodes: NodeTopology[]): Map<string, number> {
    const depths = new Map<string, number>();
    let changed = true;
    
    // Initialize
    nodes.forEach(n => depths.set(n.id, 0));

    // Iteratively resolve depths
    while (changed) {
        changed = false;
        for (const node of nodes) {
            let maxDepDepth = -1;
            for (const depId of node.dependencies) {
                const d = depths.get(depId);
                if (d !== undefined && d > maxDepDepth) {
                    maxDepDepth = d;
                }
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

export function ProjectNodeMap({ topology, agents, events, selectedNodeId, onSelectNode }: ProjectNodeMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [nodeRects, setNodeRects] = useState<Record<string, { x: number, y: number, w: number, h: number }>>({});
    
    // Default fallback if topology is old/missing
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
        const timeout = setTimeout(updateRects, 100);
        return () => {
            window.removeEventListener('resize', handleResize);
            clearTimeout(timeout);
        };
    }, [updateRects]);

    const getAgentStatus = (role: string) => {
        return agents.find(a => a.role === role)?.status || 'waiting';
    };

    const StatusColor = {
        'waiting': 'bg-[#0B0F14] border-border-muted/50 text-slate-400',
        'active': 'bg-v-accent/10 border-v-accent text-v-accent shadow-[0_0_15px_rgba(205,255,0,0.2)]',
        'done': 'bg-[#0B0F14] border-slate-500/50 text-white',
        'error': 'bg-v-alert/10 border-v-alert text-v-alert shadow-[0_0_15px_rgba(255,51,102,0.2)]'
    };

    const StatusDot = {
        'waiting': 'bg-slate-700',
        'active': 'bg-v-accent animate-pulse',
        'done': 'bg-slate-400',
        'error': 'bg-v-alert animate-pulse'
    };

    return (
        <div className="w-full h-full p-6 relative" ref={containerRef}>
            {/* SVG Connections Layer */}
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
                        
                        const sActive = getAgentStatus(safeTopology.find(n => n.id === depId)?.role || '') === 'active';
                        const tActive = getAgentStatus(node.role) === 'active';
                        const strokeColor = (sActive || tActive) ? '#CDFF00' : 'rgba(255,255,255,0.1)';
                        const strokeWidth = (sActive || tActive) ? 2 : 1;
                        
                        const controlPointX = startX + (endX - startX) / 2;

                        return (
                            <path
                                key={`${depId}->${node.id}`}
                                d={`M ${startX} ${startY} C ${controlPointX} ${startY}, ${controlPointX} ${endY}, ${endX} ${endY}`}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                strokeDasharray={(sActive || tActive) ? "4 4" : "none"}
                                className={(sActive || tActive) ? 'animate-[dash_1s_linear_infinite]' : ''}
                            />
                        );
                    })
                )}
            </svg>

            {/* Nodes Layout */}
            <div className="relative z-10 w-full h-full flex justify-start items-center gap-16 overflow-x-auto overflow-y-hidden custom-scrollbar">
                {layers.map((layer, colIndex) => (
                    <div key={colIndex} className="flex flex-col justify-center gap-8 min-w-[220px]">
                        {layer.map(node => {
                            const status = getAgentStatus(node.role);
                            const isSelected = selectedNodeId === node.id;
                            return (
                                <motion.button
                                    key={node.id}
                                    data-node-id={node.id}
                                    onClick={() => onSelectNode?.(node.id)}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className={`group relative text-left p-4 border transition-all duration-300 ${
                                        isSelected 
                                            ? 'bg-v-bg border-v-accent shadow-[0_0_20px_rgba(205,255,0,0.15)] z-20' 
                                            : StatusColor[status as keyof typeof StatusColor]
                                    }`}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-2xl">{node.emoji}</span>
                                        <div>
                                            <div className="text-[10px] font-bold tracking-widest uppercase truncate max-w-[140px] text-white/40">
                                                {node.id}
                                            </div>
                                            <div className={`text-xs font-black uppercase truncate max-w-[140px] ${isSelected ? 'text-v-accent' : ''}`}>
                                                {node.role}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="absolute top-0 right-0 p-2">
                                        <div className={`w-2 h-2 rounded-full ${StatusDot[status as keyof typeof StatusDot]}`}></div>
                                    </div>
                                    <div className="text-[9px] uppercase font-bold tracking-widest mt-2 border-t border-border-muted/30 pt-2 opacity-60">
                                        STATUS: {status}
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

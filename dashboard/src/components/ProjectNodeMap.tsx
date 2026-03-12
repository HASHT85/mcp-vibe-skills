import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PipelineEvent } from '../api/client';
import { AgentDetails } from './AgentDetails';

// Minimal interface locally to type the props, matches the backend NodeTopology
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
    events: PipelineEvent[];
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

export function ProjectNodeMap({ topology, agents, events }: ProjectNodeMapProps) {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [nodeRects, setNodeRects] = useState<Record<string, { x: number, y: number, w: number, h: number }>>({});
    
    // Default fallback if topology is old/missing
    const safeTopology = useMemo(() => {
        if (topology && topology.length > 0) return topology;
        // Mock topology to show something if backend doesn't provide it
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
    }, [layers]); // re-run if layers change

    // Re-measure on window resize
    useEffect(() => {
        updateRects();
        const handleResize = () => requestAnimationFrame(updateRects);
        window.addEventListener('resize', handleResize);
        // Also measure after a slight delay for initial layout shifts
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
        'waiting': 'bg-slate-800 border-slate-700 text-slate-400',
        'active': 'bg-v-accent/20 border-v-accent text-v-accent shadow-[0_0_15px_rgba(205,255,0,0.2)]',
        'done': 'bg-white/10 border-white text-white',
        'error': 'bg-v-alert/20 border-v-alert text-v-alert shadow-[0_0_15px_rgba(255,51,102,0.2)]'
    };

    const StatusDot = {
        'waiting': 'bg-slate-600',
        'active': 'bg-v-accent animate-pulse',
        'done': 'bg-white',
        'error': 'bg-v-alert animate-pulse'
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 w-full h-[600px]">
            {/* The Map */}
            <div 
                ref={containerRef}
                className={`relative flex-1 bg-black border border-white/20 p-8 overflow-hidden transition-all duration-300 ${selectedNodeId ? 'lg:w-2/3' : 'w-full'}`}
            >
                <div className="absolute top-4 left-4 flex items-center gap-2 z-20">
                    <span className="w-2 h-2 bg-v-accent"></span>
                    <h3 className="text-sm font-black text-v-accent tracking-widest uppercase">NODE_TOPOLOGY_MAP</h3>
                </div>

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
                            const strokeColor = (sActive || tActive) ? '#CDFF00' : 'rgba(255,255,255,0.15)';
                            const strokeWidth = (sActive || tActive) ? 2 : 1;
                            
                            // Draw an elegant S-curve
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
                <div className="relative z-10 w-full h-full flex justify-between items-center gap-4 py-8 overflow-x-auto overflow-y-hidden hide-scrollbar">
                    {layers.map((layer, colIndex) => (
                        <div key={colIndex} className="flex flex-col justify-center gap-8 min-w-[220px]">
                            {layer.map(node => {
                                const status = getAgentStatus(node.role);
                                const isSelected = selectedNodeId === node.id;
                                return (
                                    <motion.button
                                        key={node.id}
                                        data-node-id={node.id}
                                        onClick={() => setSelectedNodeId(node.id)}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={`group relative text-left p-4 border-2 transition-all duration-300 ${
                                            isSelected 
                                                ? 'bg-v-bg border-v-accent shadow-[0_0_20px_rgba(205,255,0,0.3)] z-20' 
                                                : StatusColor[status as keyof typeof StatusColor]
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-2xl">{node.emoji}</span>
                                            <div>
                                                <div className="text-xs font-bold tracking-widest uppercase truncate max-w-[140px] text-white/50">
                                                    {node.id}
                                                </div>
                                                <div className={`font-black uppercase truncate max-w-[140px] ${isSelected ? 'text-v-accent' : ''}`}>
                                                    {node.role}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="absolute top-0 right-0 p-2">
                                            <div className={`w-2 h-2 rounded-full ${StatusDot[status as keyof typeof StatusDot]}`}></div>
                                        </div>
                                        {/* Status text on hover or active */}
                                        <div className="text-[10px] uppercase font-bold tracking-widest mt-2 border-t border-current pt-2 opacity-50">
                                            STATUS: {status}
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Sub-Agent Details Panel */}
            <AnimatePresence>
                {selectedNodeId && (
                    <motion.div
                        initial={{ opacity: 0, width: 0, x: 20 }}
                        animate={{ opacity: 1, width: 'auto', x: 0 }}
                        exit={{ opacity: 0, width: 0, x: 20 }}
                        className="lg:w-1/3 min-w-[320px] shrink-0"
                    >
                        <AgentDetails 
                            node={safeTopology.find(n => n.id === selectedNodeId)!}
                            events={events}
                            agentState={agents.find(a => a.role === safeTopology.find(n => n.id === selectedNodeId)?.role)}
                            onClose={() => setSelectedNodeId(null)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

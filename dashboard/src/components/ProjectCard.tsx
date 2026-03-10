import { motion } from 'framer-motion';
import type { Pipeline } from '../api/client';
import { formatTokenCount } from '../utils';

interface ProjectCardProps {
    pipeline: Pipeline;
    onClick: () => void;
}

// Background images for different project state vibes
const VIBE_IMAGES = [
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBhahqJ4AILZXnaiGRkY42UD3c6gzfJSnkC6UIU8ldNIPmOR4XX8DedMjbhhkGedByrG6434dGqqDdyT_169SFZebW24mzJNY6KgIPYff-6o54LG-bZ5Y7yIj93CuPWJU-E6NvV0BkMJOoSbM0apez6yxXbP4BymEMxQrs6oJ3imbv7SMQqehX1l9g_B1YNqiVKT4C3mEisa-Wu1MyJAKALAoy3z1Byd4rsXThQOe1EiBchPOH5ECdVEnMj4CEOHncaBjUHiMTlS5A",
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDJfSra_9K8t1f6luxIWW4a6dcPiIYtDuBhdAmBtSu7uJqRTOGAOxLfXqGCCYLiEdGG907nTcSkr4oQ-tU1i866MeTkTASKhbfT_4fOaOTUc11soH_LiKdtszM019q0fwJdngYsxFuHmqpLFFxqDjud9GXNkxKA_fQUCeEVENQgyF-2aIBZYuvKVnlmfwifI0Lkx3xzeRrvsqBjdeeA15X78GnVtn2pGLdmi9t9alqbIaqJN0ZSNj6z7s12_ThryZ06K2_fIKbuROc",
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBfUKvfZ_Y95NDnNlv4L2eef_pZKQmynUFd29NJoFSe-irIwObjYOoFeMS5iOhp4WTcoImPyYAu85xHteH23YzJqG5GliRDyshP1zGflp42pmYdkWJz1N-QqKBKvjfrcabslv5GGFn2kKRXt4Eqlhk22DgjZ-4-IToOA29pWKOEXTxclR0EgNzLm5-Opi7zz2hXu3eYDkRhXFlNRiE8Jw6WoGV0ej282rza_6bCwacE7ww7Feh97h1jPhxIlWBLPSIOHodhKA6900c",
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAN3yy5np489jRQwynU8iO2sMpfE8GH_VjUdOG_o4AsglTjFNwCx1Qds1D1ez3u5z8KL2D1CUp029t8DfGe1ClC8CvHaOEQ8T_0k7ppuf9AmKE7wvz8rWoQzhkg-9orNafWKto1_iUN3qclGFlMmTUQs8LiLiAXLZHY8vBMxrpdp5jH-2IfJe-PHELAJeWuWZ7O3VrQuWnWI0yOLvzYwYmpXmiJnFVX6rJb3tzkZ1EFRgQgod_huo_ByPe_xXZAGv0k_RYZ6eZg1xc"
];

export function ProjectCard({ pipeline: p, onClick }: ProjectCardProps) {
    const totalTokens = (p.tokenUsage?.inputTokens || 0) + (p.tokenUsage?.outputTokens || 0);

    const isCompleted = p.phase === 'COMPLETED';
    const isFailed = p.phase === 'FAILED';
    const isRunning = !isCompleted && !isFailed;
    
    // Pick image somewhat deterministically based on ID length
    const bgImage = VIBE_IMAGES[p.id.length % VIBE_IMAGES.length];
    
    // Determine theme colors based on phase
    const themeColorClass = isCompleted ? 'bg-accent text-black' : (isFailed ? 'bg-red-500 text-white' : 'bg-primary text-white');
    const progressColorClass = isCompleted ? 'bg-accent' : (isFailed ? 'bg-red-500' : 'bg-primary');
    
    // Last active agent
    const reversedAgents = [...(p.agents || [])].reverse();
    const activeAgent = reversedAgents.find(a => a.status === 'active' || a.status === 'done') || reversedAgents[0];

    return (
        <div 
            className="group bg-panel border border-border-muted hover:border-accent transition-colors flex flex-col overflow-hidden cursor-pointer h-full"
            onClick={onClick}
        >
            {/* Image Header Block */}
            <div className="relative h-40 bg-slate-800 overflow-hidden shrink-0">
                <img 
                    src={bgImage} 
                    alt="Project visual" 
                    className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-panel to-transparent"></div>
                
                {/* Badges */}
                <div className="absolute top-3 left-3 flex gap-2">
                    <span className={`${themeColorClass} text-[9px] font-black px-2 py-0.5 tracking-tighter uppercase`}>
                        {p.phase === 'DONE' ? 'COMPLETED' : p.phase}
                    </span>
                    {activeAgent && (
                        <span className="bg-white/10 text-white text-[9px] font-black px-2 py-0.5 tracking-tighter border border-white/20 uppercase flex items-center gap-1">
                            <span>{activeAgent.emoji}</span> {activeAgent.role}
                        </span>
                    )}
                </div>
                
                {p.github && (
                    <div className="absolute top-3 right-3 text-white/50 group-hover:text-white transition-colors">
                        <span className="material-symbols-outlined text-[18px]">code</span>
                    </div>
                )}
            </div>

            {/* Content Block */}
            <div className="p-4 border-t border-border-muted flex flex-col flex-1">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-black text-white tracking-tight monospaced truncate pr-2">
                        {p.name.replace(/\s+/g, '_').toLowerCase()} // NODE
                    </h3>
                    <span className={`material-symbols-outlined transition-colors ${isRunning ? 'text-accent animate-pulse' : 'text-accent/50 group-hover:text-accent'}`}>
                        {p.projectType === 'spa' ? 'language' : (p.projectType?.includes('worker') ? 'memory' : 'database')}
                    </span>
                </div>
                
                <p className="text-[11px] text-slate-400 mb-4 line-clamp-2 leading-relaxed flex-1">
                    {p.description}
                </p>

                {/* Progress & Meta */}
                <div className="space-y-3 mt-auto">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-white/5">
                            <div className={`h-full ${progressColorClass} transition-all duration-1000`} style={{ width: `${p.progress}%` }}></div>
                        </div>
                        <span className={`text-[9px] font-bold monospaced ${isCompleted ? 'text-accent' : 'text-primary'}`}>
                            {p.progress}%
                        </span>
                    </div>
                    
                    <div className="flex justify-between items-center text-[10px] monospaced pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2 text-slate-500">
                            <span className="uppercase tracking-widest text-[9px]">Hash ID</span>
                            <span className="text-accent underline cursor-pointer">{p.id.substring(0, 8)}_x</span>
                        </div>
                        {totalTokens > 0 && (
                            <div className="flex items-center gap-1 text-slate-500">
                                <span className="material-symbols-outlined text-[12px]">toll</span>
                                {formatTokenCount(totalTokens)}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

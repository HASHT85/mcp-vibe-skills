interface SidebarProps {
    active: string;
    onChange: (id: string) => void;
    onLaunch?: () => void;
}

const NAV_ITEMS = [
    { id: 'projects', icon: 'grid_view', label: 'Overview' },
    { id: 'containers', icon: 'inventory_2', label: 'Containers' },
    { id: 'chat', icon: 'forum', label: 'Chat' },
    { id: 'agents', icon: 'account_tree', label: 'Agents' },
    { id: 'tokens', icon: 'memory', label: 'Tokens' },
    { id: 'deploy', icon: 'cloud_upload', label: 'Deploy' },
];

export function Sidebar({ active, onChange, onLaunch }: SidebarProps) {
    return (
        <aside className="w-16 md:w-56 border-r-2 border-border-muted bg-panel flex flex-col shrink-0 py-6 overflow-y-auto relative z-10">
            <div className="flex flex-col gap-2 px-3">
                <div className="hidden md:block text-[10px] text-primary font-mono font-bold px-3 mb-4 tracking-[0.3em] uppercase opacity-80 border-b border-border-muted pb-2">System_HUD</div>
                
                {NAV_ITEMS.map((item) => {
                    const isActive = active === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onChange(item.id)}
                            title={item.label}
                            className={`group flex items-center justify-center md:justify-start gap-4 px-3 py-3 transition-all ${
                                isActive 
                                ? 'bg-accent/10 border-l-4 border-accent shadow-[inset_4px_0_0_0_#d4ff00]' 
                                : 'hover:bg-white/5 border-l-4 border-transparent hover:border-slate-500'
                            }`}
                        >
                            <span className={`material-symbols-outlined ${isActive ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                {item.icon}
                            </span>
                            <span className={`hidden md:block text-xs font-mono font-bold tracking-widest uppercase ${isActive ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
            
            <div className="mt-auto px-4 pt-6">
                <button 
                    onClick={onLaunch}
                    className="w-full bg-primary text-background-dark font-display font-bold text-xs py-4 tracking-widest uppercase transition-all flex items-center justify-center md:justify-between border-2 border-transparent hover:bg-transparent hover:text-primary hover:border-primary hover:shadow-neon-red hover-glitch"
                    title="NEW ENTRY"
                >
                    <span className="hidden md:inline">+ NEW_ENTRY</span>
                    <span className="material-symbols-outlined md:hidden">add</span>
                </button>
            </div>
        </aside>
    );
}

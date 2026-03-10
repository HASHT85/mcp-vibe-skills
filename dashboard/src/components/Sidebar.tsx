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
        <aside className="w-16 md:w-56 border-r border-border-muted bg-panel flex flex-col shrink-0 py-6 overflow-y-auto">
            <div className="flex flex-col gap-1 px-3">
                <div className="hidden md:block text-[10px] text-slate-500 font-bold px-3 mb-2 tracking-widest uppercase">System_HUD</div>
                
                {NAV_ITEMS.map((item) => {
                    const isActive = active === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onChange(item.id)}
                            title={item.label}
                            className={`group flex items-center justify-center md:justify-start gap-4 px-3 py-3 transition-all ${
                                isActive 
                                ? 'bg-accent/5 border-l-2 border-accent' 
                                : 'hover:bg-white/5 border-l-2 border-transparent hover:border-white/20'
                            }`}
                        >
                            <span className={`material-symbols-outlined ${isActive ? 'text-accent' : 'text-slate-400 group-hover:text-white'}`}>
                                {item.icon}
                            </span>
                            <span className={`hidden md:block text-xs font-bold tracking-widest uppercase ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
            
            <div className="mt-auto px-4 pt-6">
                <button 
                    onClick={onLaunch}
                    className="w-full bg-accent text-black font-black text-xs py-3 tracking-widest uppercase hover:brightness-110 flex items-center justify-center md:justify-between"
                    title="NEW ENTRY"
                >
                    <span className="hidden md:inline">+ NEW_ENTRY</span>
                    <span className="material-symbols-outlined md:hidden">add</span>
                </button>
            </div>
        </aside>
    );
}

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
        <aside className="w-16 md:w-56 border-r-2 border-v-accent bg-v-surface flex flex-col shrink-0 py-6 overflow-y-auto relative z-10">
            <div className="flex flex-col gap-2 px-3">
                <div className="hidden md:block text-[10px] text-v-alert font-mono font-bold px-3 mb-4 tracking-[0.3em] uppercase opacity-80 border-b-2 border-v-accent pb-2">COMMAND_MODULES</div>
                
                {NAV_ITEMS.map((item) => {
                    const isActive = active === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onChange(item.id)}
                            title={item.label}
                            className={`group flex items-center justify-center md:justify-start gap-4 px-3 py-3 transition-colors brutalist-border-b ${
                                isActive 
                                ? 'bg-v-accent text-v-bg font-bold' 
                                : 'bg-transparent text-slate-400 hover:bg-v-accent hover:text-v-bg'
                            }`}
                        >
                            <span className="material-symbols-outlined">
                                {item.icon}
                            </span>
                            <span className="hidden md:block text-xs font-mono font-bold tracking-widest uppercase">
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
            
            <div className="mt-auto px-4 pt-6">
                <button 
                    onClick={onLaunch}
                    className="w-full brutalist-border bg-transparent text-v-accent font-sans font-bold text-sm py-4 tracking-widest uppercase transition-all flex items-center justify-center md:justify-between hover:bg-v-accent hover:text-v-bg"
                    title="NEW ENTRY"
                >
                    <span className="hidden md:inline pl-2">INITIALIZE_ORCH.</span>
                    <span className="material-symbols-outlined md:hidden">add</span>
                    <span className="hidden md:inline pr-2 border-l border-current pl-2">→</span>
                </button>
            </div>
        </aside>
    );
}

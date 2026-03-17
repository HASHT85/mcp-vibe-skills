interface SidebarProps {
    active: string;
    onChange: (id: string) => void;
}

const NAV_ITEMS = [
    { id: 'projects', icon: 'grid_view', label: 'Overview' },
    { id: 'containers', icon: 'inventory_2', label: 'Containers' },
    { id: 'chat', icon: 'forum', label: 'Chat' },
    { id: 'tokens', icon: 'memory', label: 'Tokens' },
    { id: 'quick_deploy', icon: 'bolt', label: 'Quick Deploy' },
    { id: 'deploy', icon: 'cloud_upload', label: 'Deploys' },
    { id: 'vps', icon: 'dns', label: 'VPS' },
];

export function Sidebar({ active, onChange }: SidebarProps) {
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
        </aside>
    );
}

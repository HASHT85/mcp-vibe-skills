interface SidebarProps {
    active: string;
    onChange: (id: string) => void;
}

const NAV_ITEMS = [
    { id: 'projects', icon: 'dashboard', label: 'Overview' },
    { id: 'containers', icon: 'hub', label: 'Topology' },
    { id: 'chat', icon: 'code', label: 'Dev Chat' },
    { id: 'tokens', icon: 'monitoring', label: 'Analytics' },
    { id: 'quick_deploy', icon: 'bolt', label: 'Quick Deploy' },
    { id: 'deploy', icon: 'cloud_upload', label: 'Deploys' },
    { id: 'vps', icon: 'dns', label: 'VPS' },
];

export function Sidebar({ active, onChange }: SidebarProps) {
    return (
        <aside className="fixed left-0 top-16 h-[calc(100vh-64px-32px)] flex flex-col z-40 bg-[#11161D] border-r border-[#2A3442] w-20 hover:w-64 transition-all duration-300 group overflow-hidden">
            <div className="flex-1 py-4 flex flex-col gap-1">
                {NAV_ITEMS.map((item) => {
                    const isActive = active === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onChange(item.id)}
                            title={item.label}
                            className={`flex items-center gap-4 h-12 px-6 transition-all duration-200 font-label text-xs uppercase ${
                                isActive
                                    ? 'bg-[#D7FF2F] text-[#171E00] font-bold shadow-[0_0_15px_rgba(215,255,47,0.3)]'
                                    : 'text-gray-500 hover:bg-[#262A30] hover:text-[#D7FF2F]'
                            }`}
                        >
                            <span className="material-symbols-outlined min-w-[24px]">
                                {item.icon}
                            </span>
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="border-t border-[#2A3442] py-4">
                <button className="flex items-center gap-4 h-12 px-6 text-gray-500 hover:text-white transition-all font-label text-xs uppercase w-full">
                    <span className="material-symbols-outlined min-w-[24px]">help_center</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Support</span>
                </button>
            </div>
        </aside>
    );
}

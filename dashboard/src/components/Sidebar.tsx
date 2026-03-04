import { LayoutGrid, Bot, Coins, Server } from 'lucide-react';

const NAV_ITEMS = [
    { id: 'projects', icon: LayoutGrid, label: 'Projects' },
    { id: 'agents', icon: Bot, label: 'Agents' },
    { id: 'tokens', icon: Coins, label: 'Tokens' },
    { id: 'deploy', icon: Server, label: 'Deploy' },
];

interface SidebarProps {
    active: string;
    onChange: (id: string) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
    return (
        <nav className="sidebar">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.id}
                        className={`sidebar-btn ${active === item.id ? 'active' : ''}`}
                        onClick={() => onChange(item.id)}
                        title={item.label}
                    >
                        <Icon size={18} />
                    </button>
                );
            })}
        </nav>
    );
}

export function TopBar() {
    return (
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-muted bg-panel px-6 relative z-10 w-full">
            <div className="flex items-center gap-8">
                <div className="flex items-center gap-3">
                    <div className="text-accent">
                        <span className="material-symbols-outlined text-3xl">deployed_code</span>
                    </div>
                    <div className="flex flex-col">
                        <h2 className="text-sm font-black tracking-widest text-white leading-none">VIBECRAFT HQ</h2>
                        <span className="text-[10px] text-accent font-bold tracking-tighter uppercase opacity-80">System Terminal // v0.4.8-STABLE</span>
                    </div>
                </div>
                <nav className="hidden md:flex items-center gap-6">
                    <a className="text-[11px] font-bold tracking-widest text-accent border-b-2 border-accent pb-1" href="#dashboard">DASHBOARD</a>
                    <a className="text-[11px] font-bold tracking-widest text-slate-400 hover:text-white transition-colors" href="#network">NETWORK</a>
                    <a className="text-[11px] font-bold tracking-widest text-slate-400 hover:text-white transition-colors" href="#archive">ARCHIVE</a>
                    <a className="text-[11px] font-bold tracking-widest text-slate-400 hover:text-white transition-colors" href="#logs">LOGS</a>
                </nav>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="relative hidden sm:block">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-accent text-sm">search</span>
                    <input 
                        className="bg-background-dark border border-border-muted rounded-none pl-10 pr-4 py-1.5 text-xs text-accent placeholder:text-accent/30 focus:ring-1 focus:ring-accent focus:border-accent w-64 outline-none" 
                        placeholder="QUERY_DATABASE..." 
                        type="text" 
                    />
                </div>
                <div className="flex items-center gap-2 border-l border-border-muted pl-4">
                    <button className="text-accent hover:bg-accent/10 p-1 flex items-center justify-center rounded">
                        <span className="material-symbols-outlined">notifications</span>
                    </button>
                    <button className="text-accent hover:bg-accent/10 p-1 flex items-center justify-center rounded">
                        <span className="material-symbols-outlined">settings_input_component</span>
                    </button>
                    <div className="h-8 w-8 bg-accent flex items-center justify-center rounded-none ml-2">
                        <span className="material-symbols-outlined text-black font-bold">person</span>
                    </div>
                </div>
            </div>
        </header>
    );
}

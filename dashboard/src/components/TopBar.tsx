export function TopBar() {
    return (
        <header className="flex h-16 shrink-0 items-center justify-between border-b-2 border-border-muted bg-panel px-6 relative z-10 w-full">
            <div className="flex items-center gap-8">
                <div className="flex items-center gap-3">
                    <div className="text-primary hover-glitch transition-colors">
                        <span className="material-symbols-outlined text-3xl">deployed_code</span>
                    </div>
                    <div className="flex flex-col">
                        <h2 className="text-sm font-display font-bold tracking-[0.3em] text-slate-100 uppercase leading-none">VIBECRAFT<span className="text-primary">_HQ</span></h2>
                        <span className="text-[10px] text-accent font-mono font-bold tracking-widest uppercase opacity-80 mt-1">System Terminal // v0.4.8-STABLE</span>
                    </div>
                </div>
                <nav className="hidden md:flex items-center gap-6 ml-8">
                    <a className="text-[10px] font-mono font-bold tracking-widest text-accent border-b-2 border-accent pb-1 hover:text-black hover:bg-accent transition-all px-2" href="#dashboard">DASHBOARD</a>
                    <a className="text-[10px] font-mono font-bold tracking-widest text-slate-500 hover:text-accent border-b-2 border-transparent hover:border-accent pb-1 transition-all px-2" href="#network">NETWORK</a>
                    <a className="text-[10px] font-mono font-bold tracking-widest text-slate-500 hover:text-accent border-b-2 border-transparent hover:border-accent pb-1 transition-all px-2" href="#archive">ARCHIVE</a>
                    <a className="text-[10px] font-mono font-bold tracking-widest text-slate-500 hover:text-accent border-b-2 border-transparent hover:border-accent pb-1 transition-all px-2" href="#logs">LOGS</a>
                </nav>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="relative hidden sm:block">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-accent text-sm">search</span>
                    <input 
                        className="bg-background-dark border-2 border-border-muted rounded-none pl-10 pr-4 py-1.5 text-xs text-accent placeholder:text-accent/30 focus:border-accent focus:shadow-neon-yellow w-64 outline-none font-mono tracking-widest transition-all" 
                        placeholder="QUERY_DATABASE..." 
                        type="text" 
                        spellCheck="false"
                    />
                </div>
                <div className="flex items-center gap-2 border-l-2 border-border-muted pl-4">
                    <button className="text-slate-400 hover:text-accent p-1 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined">notifications</span>
                    </button>
                    <button className="text-slate-400 hover:text-accent p-1 flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined">settings_input_component</span>
                    </button>
                    <div className="h-8 w-8 bg-accent flex items-center justify-center ml-2 border-2 border-accent hover:bg-transparent hover:text-accent transition-colors cursor-pointer text-black">
                        <span className="material-symbols-outlined font-bold">person</span>
                    </div>
                </div>
            </div>
        </header>
    );
}

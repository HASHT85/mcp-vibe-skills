export function TopBar() {
    return (
        <header className="flex shrink-0 flex-col md:flex-row justify-between items-end gap-4 border-b-2 border-v-accent bg-v-bg px-6 py-4 relative z-10 w-full mb-0">
            <div data-purpose="brand-id" className="flex items-center gap-3">
                <img src="/logo.png" alt="VEIST" className="h-10 w-10 object-contain" />
                <div>
                    <h1 className="text-3xl md:text-5xl font-sans font-bold text-v-accent leading-none tracking-tighter">VEIST</h1>
                    <p className="text-xs mt-1 text-white/60 font-mono uppercase tracking-widest">System Status: Active</p>
                </div>
            </div>
            
            <div className="flex gap-6 text-right font-mono" data-purpose="global-metrics">
                <div>
                   <span className="block text-[10px] text-v-accent uppercase tracking-widest">Network Nodes</span>
                   <span className="text-xl font-bold text-white">NOMINAL</span>
                </div>
                <div>
                   <span className="block text-[10px] text-v-alert uppercase tracking-widest">Intrusion Attempts</span>
                   <span className="text-xl font-bold text-v-alert">00</span>
                </div>
                <div className="hidden sm:block">
                   <span className="block text-[10px] text-v-accent uppercase tracking-widest">Term Uplink</span>
                   <div className="h-6 w-8 bg-v-accent flex items-center justify-center mt-1 border-2 border-v-accent hover:bg-transparent hover:text-v-accent transition-colors cursor-crosshair text-black">
                       <span className="material-symbols-outlined font-bold text-sm">person</span>
                   </div>
                </div>
            </div>
        </header>
    );
}

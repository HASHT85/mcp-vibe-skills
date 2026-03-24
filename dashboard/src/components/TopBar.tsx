export function TopBar() {
    return (
        <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-[#0B0F14] border-b border-[#2A3442]">
            <div className="flex items-center gap-8">
                <span className="text-2xl font-bold text-[#D7FF2F] tracking-widest font-headline uppercase">VEIST</span>
                <nav className="hidden md:flex items-center gap-6">
                    <a className="font-headline uppercase tracking-tighter text-gray-500 hover:text-white transition-colors text-sm" href="#">Docs</a>
                    <a className="font-headline uppercase tracking-tighter text-gray-500 hover:text-white transition-colors text-sm" href="#">API</a>
                    <a className="font-headline uppercase tracking-tighter text-gray-500 hover:text-white transition-colors text-sm" href="#">Status</a>
                </nav>
            </div>
            <div className="flex items-center gap-4">
            </div>
        </header>
    );
}

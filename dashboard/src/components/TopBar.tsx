export function TopBar() {
    return (
        <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-6 h-14 md:h-16 bg-[#0B0F14] border-b border-[#2A3442]">
            <div className="flex items-center gap-4 md:gap-8">
                <img src="/logo.png" alt="VEIST" className="w-8 h-8" />
                <span className="text-xl md:text-2xl font-bold text-[#D7FF2F] tracking-widest font-headline uppercase">
                    VEIST
                </span>
            </div>
            <div className="flex items-center gap-4"></div>
        </header>
    );
}

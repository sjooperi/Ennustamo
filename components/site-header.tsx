export function SiteHeader() {
    return (
      <header className="flex justify-between items-center px-8 py-4 border-b border-gray-800 bg-[#0d1117] sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center text-black font-bold">📈</div>
            <span className="text-xl font-bold tracking-tight text-white">Ennustamo</span>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-medium">
            <a href="/" className="text-cyan-400">Markkinat</a>
            <a href="/tulostaulukko" className="text-gray-300 hover:text-cyan-400">Tulostaulukko</a>
            <a href="#" className="text-gray-300 hover:text-cyan-400">Säännöt</a>
          </nav>
        </div>
  
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-400 w-64">
            <span>🔍</span>
            <input type="text" placeholder="Etsi kohdetta..." className="bg-transparent border-none outline-none pl-2 text-white w-full text-xs" />
          </div>
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-full text-sm text-cyan-400 font-semibold">
            <span>🪙</span> 1 000 Fyrkkaa
          </div>
          <div className="w-8 h-8 rounded-full bg-cyan-600 text-black font-bold flex items-center justify-center text-xs">
            VK
          </div>
        </div>
      </header>
    )
  }
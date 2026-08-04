export function SiteFooter() {
    return (
      <footer className="border-t border-gray-800 py-8 px-8 bg-[#0d1117] text-gray-400 text-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-cyan-500 text-black flex items-center justify-center font-bold text-xs">📈</span>
            <span className="font-bold text-white">Ennustamo</span>
          </div>
          <p className="text-xs text-gray-500">Täysin ilmainen leikkirahapeli. Ei oikeaa rahaa.</p>
          <div className="flex gap-6 text-xs">
            <a href="/tulostaulukko" className="hover:text-cyan-400">Tulostaulukko</a>
            <a href="#" className="hover:text-cyan-400">Säännöt</a>
          </div>
        </div>
      </footer>
    )
  }
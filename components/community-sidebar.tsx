export function CommunitySidebar() {
    return (
      <aside className="bg-[#161b22] border border-gray-800 p-4 rounded-xl text-white">
        <h3 className="font-bold mb-4 text-sm text-gray-300">💬 Kuumimmat keskustelut</h3>
        <div className="space-y-4 text-xs">
          <div>
            <span className="font-semibold text-cyan-400">Jere H.</span> <span className="text-gray-500">· Euribor-korko · 5 min</span>
            <p className="text-gray-300 mt-1">EKP:n signaalit viittaavat selvästi koronlaskuun keväällä.</p>
          </div>
          <div className="border-t border-gray-800 pt-3">
            <span className="font-semibold text-cyan-400">Petra N.</span> <span className="text-gray-500">· Leijonat MM-kulta · 22 min</span>
            <p className="text-gray-300 mt-1">Maalivahtitilanne huolettaa, mutta hyökkäys on huippuluokkaa.</p>
          </div>
          <div className="border-t border-gray-800 pt-3">
            <span className="font-semibold text-cyan-400">Oskari T.</span> <span className="text-gray-500">· Euroviisut TOP 5 · 1 t</span>
            <p className="text-gray-300 mt-1">Vetokerroin tuntuu liian matalalta tälle biisille.</p>
          </div>
        </div>
      </aside>
    )
  }
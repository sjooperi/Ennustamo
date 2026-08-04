'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Market {
  id: string
  title: string
  category: string
  end_date: string
  yes_votes: number
  no_votes: number
  total_fyrkka?: number
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('Kaikki')

  // Haetaan kohteet Supabasesta
  useEffect(() => {
    async function fetchMarkets() {
      setLoading(true)
      const { data, error } = await supabase
        .from('markets') // Jos Supabasen taulusi nimi on eri (esim. 'kohteet'), vaihda se tähän
        .select('*')

      if (error) {
        console.error('Virhe haettaessa kohteita:', error)
      } else if (data) {
        setMarkets(data)
      }
      setLoading(false)
    }

    fetchMarkets()
  }, [])

  // Äänestysfunktion runko
  const handleVote = async (marketId: string, choice: 'YES' | 'NO') => {
    alert(`Veikkasit: ${choice} kohteelle!`)
    // Tähän kytketään tietokannan päivitys seuraavaksi
  }

  const categories = ['Kaikki', 'Politiikka', 'Talous', 'Urheilu', 'Viihde', 'Teknologia']

  const filteredMarkets = selectedCategory === 'Kaikki' 
    ? markets 
    : markets.filter(m => m.category?.toLowerCase() === selectedCategory.toLowerCase())

  return (
    <main className="min-h-screen bg-[#0d1117] text-white p-6 max-w-6xl mx-auto">
      {/* Otsikko */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        <h1 className="text-2xl font-bold text-cyan-400">📈 Ennustamo</h1>
        <div className="flex gap-6 text-sm text-gray-400">
          <span className="text-white font-medium">Markkinat</span>
          <span>Tulostaulukko</span>
          <span>Säännöt</span>
        </div>
      </div>

      <h2 className="text-3xl font-extrabold mb-2">Markkinat</h2>
      <p className="text-gray-400 mb-6">Valitse kohde ja tee ennustuksesi.</p>

      {/* Kategoriat */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-cyan-500 text-black font-semibold'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lataustila */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Ladataan kohteita Supabasesta...</div>
      ) : filteredMarkets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Ei kohteita tässä kategoriassa tai tietokanta on tyhjä.
        </div>
      ) : (
        /* Korttilistaus */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredMarkets.map((market) => {
            const total = (market.yes_votes || 0) + (market.no_votes || 0)
            const yesPercent = total > 0 ? Math.round((market.yes_votes / total) * 100) : 50
            const noPercent = 100 - yesPercent

            return (
              <div 
                key={market.id} 
                className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-3">
                    <span className="font-semibold text-gray-300">{market.category || 'Yleinen'}</span>
                    <span>📅 Päättyy {market.end_date ? new Date(market.end_date).toLocaleDateString('fi-FI') : 'Avoin'}</span>
                  </div>

                  <h3 className="text-lg font-bold mb-4 text-white leading-snug">
                    {market.title}
                  </h3>

                  {/* Prosenttipalkki */}
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-emerald-400">{yesPercent}% KYLLÄ</span>
                    <span className="text-rose-400">{noPercent}% EI</span>
                  </div>
                  <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mb-6 flex">
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${yesPercent}%` }} />
                    <div className="bg-rose-500 h-full transition-all" style={{ width: `${noPercent}%` }} />
                  </div>
                </div>

                {/* Veikkausnapit */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleVote(market.id, 'YES')}
                    className="py-3 px-4 rounded-xl border border-emerald-500/30 text-emerald-400 font-bold hover:bg-emerald-500/10 transition-colors text-center"
                  >
                    KYLLÄ {yesPercent}%
                  </button>
                  <button
                    onClick={() => handleVote(market.id, 'NO')}
                    className="py-3 px-4 rounded-xl border border-rose-500/30 text-rose-400 font-bold hover:bg-rose-500/10 transition-colors text-center"
                  >
                    EI {noPercent}%
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
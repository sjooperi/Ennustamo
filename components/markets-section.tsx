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
}

export function MarketsSection() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('Kaikki')

  // Haetaan kohteet
  const loadData = async () => {
    const { data, error } = await supabase.from('markets').select('*')
    if (error) {
      console.error('Haku virhe:', error)
    } else if (data) {
      setMarkets(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()

    // Päivitetään tiedot automaattisesti 3 sekunnin välein
    const timer = setInterval(() => {
      loadData()
    }, 3000)

    return () => clearInterval(timer)
  }, [])

  const handleVote = async (marketId: string, choice: 'YES' | 'NO') => {
    const target = markets.find((m) => m.id === marketId)
    if (!target) return

    const currentYes = Number(target.yes_votes || 0)
    const currentNo = Number(target.no_votes || 0)

    const newYes = choice === 'YES' ? currentYes + 1 : currentYes
    const newNo = choice === 'NO' ? currentNo + 1 : currentNo

    // 1. Päivitetään ruutu heti
    setMarkets((prev) =>
      prev.map((m) =>
        m.id === marketId ? { ...m, yes_votes: newYes, no_votes: newNo } : m
      )
    )

    // 2. Tallennetaan tietokantaan
    const { error } = await supabase
      .from('markets')
      .update({ yes_votes: newYes, no_votes: newNo })
      .eq('id', marketId)

    if (error) {
      alert(`Tietokantavirhe: ${error.message}`)
      console.error('Päivitysvirhe:', error)
    }
  }

  const categories = ['Kaikki', 'Politiikka', 'Talous', 'Urheilu', 'Viihde', 'Teknologia']

  const filteredMarkets = selectedCategory === 'Kaikki' 
    ? markets 
    : markets.filter(m => m.category?.toLowerCase() === selectedCategory.toLowerCase())

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-cyan-500 text-black font-semibold'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Ladataan kohteita...</div>
      ) : filteredMarkets.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          Ei kohteita tässä kategoriassa.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMarkets.map((market) => {
            const yes = Number(market.yes_votes || 0)
            const no = Number(market.no_votes || 0)
            const total = yes + no
            const yesPercent = total > 0 ? Math.round((yes / total) * 100) : 50
            const noPercent = 100 - yesPercent

            return (
              <div 
                key={market.id} 
                className="bg-[#161b22] border border-gray-800 rounded-xl p-5 flex flex-col justify-between hover:border-gray-700 transition-all"
              >
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-2">
                    <span className="font-semibold text-cyan-400">{market.category || 'Yleinen'}</span>
                    <span>Päättyy {market.end_date ? new Date(market.end_date).toLocaleDateString('fi-FI') : 'Avoin'}</span>
                  </div>

                  <h3 className="font-bold text-white mb-4 text-base leading-snug">
                    {market.title}
                  </h3>

                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-emerald-400">{yesPercent}% KYLLÄ ({yes})</span>
                    <span className="text-rose-400">{noPercent}% EI ({no})</span>
                  </div>
                  <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mb-5 flex">
                    <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${yesPercent}%` }} />
                    <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${noPercent}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleVote(market.id, 'YES')}
                    className="py-2.5 px-3 rounded-lg border border-emerald-500/30 text-emerald-400 font-bold hover:bg-emerald-500/10 text-xs transition-colors"
                  >
                    KYLLÄ {yesPercent}%
                  </button>
                  <button
                    onClick={() => handleVote(market.id, 'NO')}
                    className="py-2.5 px-3 rounded-lg border border-rose-500/30 text-rose-400 font-bold hover:bg-rose-500/10 text-xs transition-colors"
                  >
                    EI {noPercent}%
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
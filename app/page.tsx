'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Market {
  id: string
  title: string
  description: string
  category: string
  yes_pool: number
  no_pool: number
}

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)

  // Haetaan kohteet tietokannasta
  useEffect(() => {
    async function fetchMarkets() {
      const { data, error } = await supabase.from('markets').select('*')
      if (error) {
        console.error('Virhe haettaessa kohteita:', error)
      } else {
        setMarkets(data || [])
      }
      setLoading(false)
    }

    fetchMarkets()
  }, [])

  // Veikkaustoiminto: lisää 100 Fyrkkaa valittuun pottiin
  const handleVote = async (marketId: string, option: 'yes' | 'no', currentPool: number) => {
    const betAmount = 100
    const newPool = currentPool + betAmount
    const updateData = option === 'yes' ? { yes_pool: newPool } : { no_pool: newPool }

    // 1. Päivitetään tietokanta
    const { error } = await supabase
      .from('markets')
      .update(updateData)
      .eq('id', marketId)

    if (error) {
      console.error('Virhe veikkauksessa:', error)
      alert('Veikkaus epäonnistui! Tarkista yhteys.')
      return
    }

    // 2. Päivitetään ruudun näkymä välittömästi
    setMarkets((prevMarkets) =>
      prevMarkets.map((market) =>
        market.id === marketId
          ? {
              ...market,
              yes_pool: option === 'yes' ? newPool : market.yes_pool,
              no_pool: option === 'no' ? newPool : market.no_pool,
            }
          : market
      )
    )
  }

  return (
    <main className="min-h-screen p-8 bg-slate-950 text-white font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-extrabold mb-2 text-emerald-400">
          Ennustamo {"🔮"}
        </h1>
        <p className="text-slate-400 mb-8">Suomen ensimmäinen sosiaalinen ennustemarkkina.</p>

        {loading ? (
          <p className="text-slate-500">Ladataan kohteita tietokannasta...</p>
        ) : markets.length === 0 ? (
          <p className="text-amber-400">Ei vielä kohteita tietokannassa.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {markets.map((market) => (
              <div key={market.id} className="p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-lg hover:border-slate-700 transition">
                <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-950 text-emerald-400 rounded-full border border-emerald-800/50">
                  {market.category}
                </span>
                <h2 className="text-xl font-bold mt-3 mb-2">{market.title}</h2>
                <p className="text-sm text-slate-400 mb-6">{market.description}</p>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleVote(market.id, 'yes', market.yes_pool)}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-sm transition active:scale-95"
                  >
                    Kyllä ({market.yes_pool} Fyrkkaa)
                  </button>
                  <button
                    onClick={() => handleVote(market.id, 'no', market.no_pool)}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg text-sm transition active:scale-95"
                  >
                    Ei ({market.no_pool} Fyrkkaa)
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
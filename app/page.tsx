'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Market {
  id: string
  title: string
  category?: string
  end_date?: string
  yes_votes?: number
  no_votes?: number
}

export default function Page() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('Kaikki')
  const [userVotes, setUserVotes] = useState<Record<string, 'YES' | 'NO'>>({})

  useEffect(() => {
    async function fetchMarkets() {
      setLoading(true)
      const { data, error } = await supabase.from('markets').select('*')
      if (error) {
        console.error('Virhe haettaessa kohteita:', error)
      } else if (data) {
        setMarkets(data)
      }
      setLoading(false)
    }

    const savedVotes = localStorage.getItem('ennustamo_user_votes')
    if (savedVotes) {
      try {
        setUserVotes(JSON.parse(savedVotes))
      } catch (e) {
        console.error('Virhe äänten lataamisessa muistista:', e)
      }
    }

    fetchMarkets()

    // REAALIAIKAINEN TILAUS
    const channel = supabase
      .channel('realtime_markets')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'markets',
        },
        (payload) => {
          const updatedMarket = payload.new as Market
          setMarkets((prevMarkets) =>
            prevMarkets.map((m) =>
              m.id === updatedMarket.id ? { ...m, ...updatedMarket } : m
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleVote = async (marketId: string, choice: 'YES' | 'NO') => {
    const currentVote = userVotes[marketId]

    if (currentVote === choice) return

    const targetMarket = markets.find((m) => m.id === marketId)
    if (!targetMarket) return

    let newYesVotes = targetMarket.yes_votes || 0
    let newNoVotes = targetMarket.no_votes || 0

    if (currentVote === 'NO' && choice === 'YES') {
      newNoVotes = Math.max(0, newNoVotes - 1)
      newYesVotes += 1
    } else if (currentVote === 'YES' && choice === 'NO') {
      newYesVotes = Math.max(0, newYesVotes - 1)
      newNoVotes += 1
    } else if (!currentVote) {
      if (choice === 'YES') newYesVotes += 1
      if (choice === 'NO') newNoVotes += 1
    }

    // Päivitetään paikallinen tila välittömästi omalla ruudulla
    setMarkets((prev) =>
      prev.map((m) =>
        m.id === marketId
          ? { ...m, yes_votes: newYesVotes, no_votes: newNoVotes }
          : m
      )
    )

    const updatedUserVotes = { ...userVotes, [marketId]: choice }
    setUserVotes(updatedUserVotes)
    localStorage.setItem('ennustamo_user_votes', JSON.stringify(updatedUserVotes))

    // Lähetetään tietokantaan (josta se peilautuu reaaliajassa muille)
    const { error } = await supabase
      .from('markets')
      .update({
        yes_votes: newYesVotes,
        no_votes: newNoVotes,
      })
      .eq('id', marketId)

    if (error) {
      console.error('Virhe äänen tallentamisessa Supabaseen:', error)
    }
  }

  const categories = ['Kaikki', 'Politiikka', 'Talous', 'Urheilu', 'Viihde', 'Teknologia']

  const filteredMarkets = selectedCategory === 'Kaikki'
    ? markets
    : markets.filter(m => m.category?.toLowerCase() === selectedCategory.toLowerCase())

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col justify-between">
      <header className="border-b border-gray-800 bg-[#161b22] px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
              📈 Ennustamo
            </h1>
            <nav className="hidden md:flex gap-6 text-sm text-gray-300">
              <a href="#" className="hover:text-cyan-400 font-medium text-cyan-400">Markkinat</a>
              <a href="#" className="hover:text-cyan-400">Tulostaulukko</a>
              <a href="#" className="hover:text-cyan-400">Säännöt</a>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="bg-gray-800 px-3 py-1.5 rounded-full border border-gray-700">
              💰 <strong className="text-white">1 000</strong> Fyrkkaa
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-gradient-to-b from-[#161b22] to-[#0d1117] border-b border-gray-800 py-8 px-6">
          <div className="max-w-7xl mx-auto text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
              Suomen suosituin ennustemarkkina
            </h2>
            <p className="text-gray-400 max-w-2xl text-base mb-6">
              Mitä tulevaisuudessa tapahtuu? Ennusta urheilun, talouden ja politiikan käänteitä.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-6 text-sm">
              <div><strong className="text-cyan-400 text-xl block">248</strong> Aktiivista kohdetta</div>
              <div><strong className="text-cyan-400 text-xl block">31 400</strong> Veikkausta</div>
              <div><strong className="text-cyan-400 text-xl block">4,2 t.</strong> Käyttäjää</div>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-white">Markkinat</h3>
                <p className="text-sm text-gray-400 mt-1">Valitse kohde ja tee ennustuksesi.</p>
              </div>

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
                  Ei kohteita tässä kategoriassa tai tietokanta on tyhjä.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMarkets.map((market) => {
                    const total = (market.yes_votes || 0) + (market.no_votes || 0)
                    const yesPercent = total > 0 ? Math.round((market.yes_votes! / total) * 100) : 50
                    const noPercent = 100 - yesPercent
                    const hasVoted = userVotes[market.id]

                    return (
                      <div
                        key={market.id}
                        className="bg-[#161b22] border border-gray-800 rounded-xl p-5 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between text-xs text-gray-400 mb-2">
                            <span className="font-semibold text-cyan-400">{market.category || 'Yleinen'}</span>
                            <span>Päättyy {market.end_date ? new Date(market.end_date).toLocaleDateString('fi-FI') : 'Ei pvm'}</span>
                          </div>

                          <h4 className="font-bold text-white mb-4 text-base leading-snug">
                            {market.title}
                          </h4>

                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-emerald-400">{yesPercent}% KYLLÄ</span>
                            <span className="text-rose-400">{noPercent}% EI</span>
                          </div>
                          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden flex mb-4">
                            <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${yesPercent}%` }} />
                            <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${noPercent}%` }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleVote(market.id, 'YES')}
                            className={`py-2.5 px-3 rounded-lg border font-bold text-xs transition-all ${
                              hasVoted === 'YES'
                                ? 'bg-emerald-500 text-black border-emerald-500'
                                : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            {hasVoted === 'YES' ? '✔ KYLLÄ' : `KYLLÄ ${yesPercent}%`}
                          </button>
                          <button
                            onClick={() => handleVote(market.id, 'NO')}
                            className={`py-2.5 px-3 rounded-lg border font-bold text-xs transition-all ${
                              hasVoted === 'NO'
                                ? 'bg-rose-500 text-black border-rose-500'
                                : 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                            }`}
                          >
                            {hasVoted === 'NO' ? '✔ EI' : `EI ${noPercent}%`}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { CommunitySidebar } from '@/components/community-sidebar'
import { Hero } from '@/components/hero'
import { MarketsSection } from '@/components/markets-section'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export default function Page() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <SiteHeader />
      <main>
        <Hero />
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    Markkinat
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Valitse kohde ja tee ennustuksesi.
                  </p>
                </div>
              </div>
              <MarketsSection />
            </div>
            <CommunitySidebar />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
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

export default function Page() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('Kaikki')
  const [userVotes, setUserVotes] = useState<Record<string, 'YES' | 'NO'>>({})

  // 1. Haetaan kohteet Supabasesta ja käyttäjän aiemmat äänet selaimesta
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
  }, [])

  // 2. Äänen tallennus ja vaihto
  const handleVote = async (marketId: string, choice: 'YES' | 'NO') => {
    const currentVote = userVotes[marketId]
    
    // Jos painaa samaa valintaa mitä jo äänesti, ei tehdä mitään
    if (currentVote === choice) return

    const targetMarket = markets.find((m) => m.id === marketId)
    if (!targetMarket) return

    let newYesVotes = targetMarket.yes_votes || 0
    let newNoVotes = targetMarket.no_votes || 0

    // Lasketaan äänet uudelleen valinnan mukaan (sallitaan äänen vaihtaminen)
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

    // Päivitetään tila ruudulle
    setMarkets((prev) =>
      prev.map((m) =>
        m.id === marketId
          ? { ...m, yes_votes: newYesVotes, no_votes: newNoVotes }
          : m
      )
    )

    // Tallennetaan uusi valinta selaimen muistiin
    const updatedUserVotes = { ...userVotes, [marketId]: choice }
    setUserVotes(updatedUserVotes)
    localStorage.setItem('ennustamo_user_votes', JSON.stringify(updatedUserVotes))

    // Päivitetään Supabase-tietokantaan
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
      {/* Yläpalkki */}
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
            <span className="bg-gray-800 px-3 py-1.5 rounded-full border border-gray-700 text-gray-300">
              💰 <strong className="text-white">1 000</strong> Fyrkkaa
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero-osio */}
        <section className="bg-gradient-to-b from-[#161b22] to-[#0d1117] border-b border-gray-800 py-10 px-6">
          <div className="max-w-7xl mx-auto text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
              Suomen suosituin ennustemarkkina
            </h2>
            <p className="text-gray-400 max-w-2xl text-base mb-6">
              Mitä tulevaisuudessa tapahtuu? Ennusta urheilun, talouden ja politiikan käänteitä, kerää Fyrkkaa ja nouse tulostaulukon kärkeen.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-6 text-sm text-gray-400">
              <div><strong className="text-cyan-400 text-xl block">248</strong> Aktiivista kohdetta</div>
              <div><strong className="text-cyan-400 text-xl block">31 400</strong> Veikattua Fyrkkaa</div>
              <div><strong className="text-cyan-400 text-xl block">4,2 t.</strong> Käyttäjää</div>
            </div>
          </div>
        </section>

        {/* Pääsisältö */}
        <div className="max-w-7xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            {/* Kohteet */}
            <div>
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-white">Markkinat</h3>
                <p className="text-sm text-gray-400 mt-1">Valitse kohde ja tee ennustuksesi.</p>
              </div>

              {/* Kategoriat */}
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

              {/* Kohdekortit */}
              {loading ? (
                <div className="py-12 text-center text-sm text-gray-400">Ladataan kohteita Supabasesta...</div>
              ) : filteredMarkets.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  Ei kohteita tässä kategoriassa tai tietokanta on tyhjä.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMarkets.map((market) => {
                    const total = (market.yes_votes || 0) + (market.no_votes || 0)
                    const yesPercent = total > 0 ? Math.round((market.yes_votes / total) * 100) : 50
                    const noPercent = 100 - yesPercent
                    const hasVoted = userVotes[market.id]

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

                          <h4 className="font-bold text-white mb-4 text-base leading-snug">
                            {market.title}
                          </h4>

                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-emerald-400">{yesPercent}% KYLLÄ</span>
                            <span className="text-rose-400">{noPercent}% EI</span>
                          </div>
                          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mb-5 flex">
                            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${yesPercent}%` }} />
                            <div className="bg-rose-500 h-full transition-all" style={{ width: `${noPercent}%` }} />
                          </div>
                        </div>

                        {/* Äänestyspainikkeet (molemmat aina klikattavissa) */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleVote(market.id, 'YES')}
                            className={`py-2.5 px-3 rounded-lg border font-bold text-xs transition-colors ${
                              hasVoted === 'YES'
                                ? 'bg-emerald-500 text-black border-emerald-500'
                                : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            {hasVoted === 'YES' ? '✔ KYLLÄ' : `KYLLÄ ${yesPercent}%`}
                          </button>
                          <button
                            onClick={() => handleVote(market.id, 'NO')}
                            className={`py-2.5 px-3 rounded-lg border font-bold text-xs transition-colors ${
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

            {/* Sivupalkki */}
            <aside className="space-y-6">
              <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5">
                <h3 className="font-bold text-white text-base mb-4">🏆 Ennustajien Kärkikaarti</h3>
                <ul className="space-y-3 text-xs">
                  <li className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <span className="text-gray-300">1. Anssi K.</span>
                    <span className="text-emerald-400 font-bold">+12 400 F</span>
                  </li>
                  <li className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <span className="text-gray-300">2. Mikko L.</span>
                    <span className="text-emerald-400 font-bold">+9 150 F</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-gray-300">3. Riikka T.</span>
                    <span className="text-emerald-400 font-bold">+7 800 F</span>
                  </li>
                </ul>
              </div>

              <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5">
                <h3 className="font-bold text-white text-base mb-2">💬 Yhteisö</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Liity mukaan keskusteluun ja haasta kaverisi ennustamaan päivän kuumimpia aiheita!
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Alatunniste */}
      <footer className="border-t border-gray-800 bg-[#161b22] py-6 px-6 text-center text-xs text-gray-500">
        <p>© {new Date().getFullYear()} Ennustamo. Kaikki oikeudet pidätetään. Veikkaaminen tapahtuu leikkirahalla (Fyrkka).</p>
      </footer>
    </div>
  )
}
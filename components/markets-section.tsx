'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  formatPct,
  formatShares,
  getPrices,
  quoteBuy,
} from '@/lib/amm'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

type BetChoice = 'YES' | 'NO'

interface Market {
  id: string
  title: string
  category: string
  end_date: string
  yes_pool: number
  no_pool: number
  yes_votes: number
  no_votes: number
}

interface UserPosition {
  choice: BetChoice
  amount: number
  shares: number
}

const DEFAULT_STAKE = 10
const STAKE_PRESETS = [10, 25, 50, 100]

function translateBetError(message: string): string {
  if (message.includes('UNAUTHORIZED')) return 'Kirjaudu sisään lyödäksesi vetoa.'
  if (message.includes('INSUFFICIENT_BALANCE')) return 'Saldo ei riitä.'
  if (message.includes('INVALID_CHOICE')) return 'Virheellinen valinta.'
  if (message.includes('INVALID_AMOUNT')) return 'Virheellinen panos.'
  if (message.includes('MARKET_NOT_FOUND')) return 'Kohdetta ei löytynyt.'
  if (message.includes('INVALID_SHARES')) return 'Panos on liian pieni tälle markkinalle.'
  return message
}

export function MarketsSection() {
  const { user, ready, balance, openAuth, refreshProfile } = useAuth()
  const [markets, setMarkets] = useState<Market[]>([])
  const [userPositions, setUserPositions] = useState<Record<string, UserPosition[]>>({})
  const [loading, setLoading] = useState(true)
  const [bettingMarketId, setBettingMarketId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('Kaikki')
  const [actionError, setActionError] = useState<string | null>(null)
  const [stakeByMarket, setStakeByMarket] = useState<Record<string, number>>({})
  const [hoverChoice, setHoverChoice] = useState<{
    marketId: string
    choice: BetChoice
  } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const marketsPromise = supabase
        .from('markets')
        .select('*')
        .order('created_at', { ascending: false })

      const betsPromise = user
        ? supabase
            .from('bets')
            .select('market_id, option, amount, shares')
            .eq('user_id', user.id)
        : Promise.resolve({
            data: [] as {
              market_id: string
              option: string
              amount: number
              shares: number
            }[],
            error: null,
          })

      const [marketsResult, betsResult] = await Promise.all([marketsPromise, betsPromise])

      if (marketsResult.error) {
        console.error('Failed to load markets:', marketsResult.error.message)
      } else if (marketsResult.data) {
        setMarkets(marketsResult.data)
      }

      if (betsResult.error) {
        if (betsResult.error.code !== 'PGRST205') {
          console.error('Failed to load bets:', betsResult.error.message)
        }
        setUserPositions({})
      } else if (betsResult.data) {
        const grouped: Record<string, UserPosition[]> = {}
        for (const bet of betsResult.data) {
          const raw = String(bet.option || '').toUpperCase()
          const choice: BetChoice = raw === 'NO' ? 'NO' : 'YES'
          const list = grouped[bet.market_id] ?? []
          list.push({
            choice,
            amount: Number(bet.amount),
            shares: Number(bet.shares || 0),
          })
          grouped[bet.market_id] = list
        }
        setUserPositions(grouped)
      } else {
        setUserPositions({})
      }
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!ready) return
    void loadData()
    const timer = setInterval(() => void loadData(), 5000)
    return () => clearInterval(timer)
  }, [loadData, ready])

  const getStake = (marketId: string) => stakeByMarket[marketId] ?? DEFAULT_STAKE

  const setStake = (marketId: string, value: number) => {
    setStakeByMarket((prev) => ({ ...prev, [marketId]: value }))
  }

  const handleBet = async (marketId: string, choice: BetChoice) => {
    setActionError(null)

    if (!user) {
      openAuth('login')
      return
    }

    const amount = getStake(marketId)
    if (!(amount > 0)) {
      setActionError('Syötä positiivinen panos.')
      return
    }

    if (amount > balance) {
      setActionError('Saldo ei riitä.')
      return
    }

    if (bettingMarketId) return

    setBettingMarketId(marketId)

    const { data, error } = await supabase.rpc('place_bet', {
      p_market_id: marketId,
      p_choice: choice,
      p_amount: amount,
    })

    if (error) {
      setActionError(translateBetError(error.message))
      setBettingMarketId(null)
      return
    }

    const shares = Number(data?.shares ?? 0)
    setUserPositions((prev) => ({
      ...prev,
      [marketId]: [
        ...(prev[marketId] ?? []),
        { choice, amount, shares },
      ],
    }))

    await refreshProfile()
    setBettingMarketId(null)
    void loadData()
  }

  const categories = ['Kaikki', 'Politiikka', 'Talous', 'Urheilu', 'Viihde', 'Teknologia']

  const filteredMarkets = useMemo(
    () =>
      selectedCategory === 'Kaikki'
        ? markets
        : markets.filter(
            (market) =>
              market.category?.toLowerCase() === selectedCategory.toLowerCase()
          ),
    [markets, selectedCategory]
  )

  return (
    <div>
      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
        >
          {actionError}
        </div>
      )}

      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-cyan-500 font-semibold text-black'
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredMarkets.map((market) => {
            const yesPool = Number(market.yes_pool || 0)
            const noPool = Number(market.no_pool || 0)
            const { yesPrice, noPrice } = getPrices(yesPool, noPool)
            const yesPercent = Math.round(yesPrice * 100)
            const noPercent = Math.round(noPrice * 100)
            const stake = getStake(market.id)
            const positions = userPositions[market.id] ?? []
            const isBetting = bettingMarketId === market.id

            const yesQuote = quoteBuy(yesPool, noPool, 'YES', stake)
            const noQuote = quoteBuy(yesPool, noPool, 'NO', stake)
            const activeQuote =
              hoverChoice?.marketId === market.id
                ? hoverChoice.choice === 'YES'
                  ? yesQuote
                  : noQuote
                : null

            const totalSharesYes = positions
              .filter((p) => p.choice === 'YES')
              .reduce((sum, p) => sum + p.shares, 0)
            const totalSharesNo = positions
              .filter((p) => p.choice === 'NO')
              .reduce((sum, p) => sum + p.shares, 0)
            const totalSpent = positions.reduce((sum, p) => sum + p.amount, 0)

            return (
              <div
                key={market.id}
                className="flex flex-col justify-between rounded-xl border border-gray-800 bg-[#161b22] p-5 transition-all hover:border-gray-700"
              >
                <div>
                  <div className="mb-2 flex justify-between text-xs text-gray-400">
                    <span className="font-semibold text-cyan-400">
                      {market.category || 'Yleinen'}
                    </span>
                    <span>
                      Päättyy{' '}
                      {market.end_date
                        ? new Date(market.end_date).toLocaleDateString('fi-FI')
                        : 'Avoin'}
                    </span>
                  </div>

                  <h3 className="mb-4 text-base leading-snug font-bold text-white">
                    {market.title}
                  </h3>

                  <div className="mb-1 flex justify-between text-xs font-semibold">
                    <span className="text-emerald-400">
                      {formatPct(yesPrice)} KYLLÄ
                    </span>
                    <span className="text-rose-400">{formatPct(noPrice)} EI</span>
                  </div>
                  <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${yesPercent}%` }}
                    />
                    <div
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${noPercent}%` }}
                    />
                  </div>
                  <p className="mb-4 text-[11px] text-gray-500">
                    Poolit: {Math.round(yesPool)} YES / {Math.round(noPool)} NO
                  </p>
                </div>

                {positions.length > 0 && (
                  <div className="mb-3 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-gray-300">
                    Positiosi:{' '}
                    {totalSharesYes > 0 && (
                      <span className="font-semibold text-emerald-400">
                        {formatShares(totalSharesYes)} KYLLÄ
                      </span>
                    )}
                    {totalSharesYes > 0 && totalSharesNo > 0 && ' · '}
                    {totalSharesNo > 0 && (
                      <span className="font-semibold text-rose-400">
                        {formatShares(totalSharesNo)} EI
                      </span>
                    )}
                    <span className="text-gray-500"> · käytetty {totalSpent} Fyrkkaa</span>
                  </div>
                )}

                {!user ? (
                  <button
                    type="button"
                    onClick={() => openAuth('login')}
                    className="rounded-lg border border-cyan-500/30 px-3 py-2.5 text-xs font-bold text-cyan-300 transition-colors hover:bg-cyan-500/10"
                  >
                    Kirjaudu ostaaksesi osuuksia
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-400">
                        <span>Panos (Fyrkkaa)</span>
                        <span>Saldo: {Math.round(balance)}</span>
                      </div>
                      <div className="flex gap-1.5">
                        {STAKE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setStake(market.id, preset)}
                            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                              stake === preset
                                ? 'bg-cyan-500 text-black'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={stake}
                        onChange={(e) =>
                          setStake(market.id, Math.max(0, Number(e.target.value) || 0))
                        }
                        className="mt-2 h-9 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    {activeQuote && (
                      <p className="text-[11px] text-gray-400">
                        Saat ≈{' '}
                        <span className="font-semibold text-white">
                          {formatShares(activeQuote.shares)}
                        </span>{' '}
                        osuutta · keskihinta{' '}
                        <span className="font-semibold text-white">
                          {formatPct(activeQuote.avgPrice)}
                        </span>
                        {activeQuote.slippagePct > 0.05 && (
                          <>
                            {' '}
                            · slippage{' '}
                            <span className="text-amber-400">
                              +{activeQuote.slippagePct.toFixed(1)}%
                            </span>
                          </>
                        )}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleBet(market.id, 'YES')}
                        disabled={isBetting || stake <= 0 || stake > balance}
                        onMouseEnter={() =>
                          setHoverChoice({ marketId: market.id, choice: 'YES' })
                        }
                        onMouseLeave={() => setHoverChoice(null)}
                        onFocus={() =>
                          setHoverChoice({ marketId: market.id, choice: 'YES' })
                        }
                        onBlur={() => setHoverChoice(null)}
                        className="rounded-lg border border-emerald-500/30 px-3 py-2.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBetting ? (
                          'Ostetaan...'
                        ) : (
                          <>
                            Osta KYLLÄ
                            <span className="mt-0.5 block font-medium opacity-80">
                              {formatPct(yesPrice)}
                              {yesQuote
                                ? ` → ${formatShares(yesQuote.shares)} os.`
                                : ''}
                            </span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleBet(market.id, 'NO')}
                        disabled={isBetting || stake <= 0 || stake > balance}
                        onMouseEnter={() =>
                          setHoverChoice({ marketId: market.id, choice: 'NO' })
                        }
                        onMouseLeave={() => setHoverChoice(null)}
                        onFocus={() =>
                          setHoverChoice({ marketId: market.id, choice: 'NO' })
                        }
                        onBlur={() => setHoverChoice(null)}
                        className="rounded-lg border border-rose-500/30 px-3 py-2.5 text-xs font-bold text-rose-400 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBetting ? (
                          'Ostetaan...'
                        ) : (
                          <>
                            Osta EI
                            <span className="mt-0.5 block font-medium opacity-80">
                              {formatPct(noPrice)}
                              {noQuote
                                ? ` → ${formatShares(noQuote.shares)} os.`
                                : ''}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

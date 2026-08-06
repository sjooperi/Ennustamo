'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  applyMarketChange,
  isOpenMarketStatus,
  readMarketStatus,
  type MarketRow,
} from '@/lib/market-realtime'
import { buildPriceHistory, type MarketBet } from '@/lib/price-history'
import { supabase } from '@/lib/supabase'
import { MarketCard, type LiveMarket, type UserPosition } from '@/components/market-card'

type BetChoice = 'YES' | 'NO'

const DEFAULT_STAKE = 0

function translateBetError(message: string): string {
  if (message.includes('UNAUTHORIZED')) return 'Kirjaudu sisään lyödäksesi vetoa.'
  if (message.includes('INSUFFICIENT_BALANCE')) return 'Saldo ei riitä.'
  if (message.includes('INVALID_CHOICE')) return 'Virheellinen valinta.'
  if (message.includes('INVALID_AMOUNT')) return 'Virheellinen panos.'
  if (message.includes('MARKET_NOT_FOUND')) return 'Kohdetta ei löytynyt.'
  if (message.includes('INVALID_SHARES')) return 'Panos on liian pieni tälle markkinalle.'
  if (message.includes('MARKET_CLOSED')) return 'Kohde on suljettu tai ratkaistu.'
  return message
}

function toLiveMarket(row: MarketRow): LiveMarket & { created_at?: string } {
  return {
    id: row.id,
    title: String(row.title || ''),
    category: String(row.category || ''),
    end_date: String(row.end_date || ''),
    yes_pool: Number(row.yes_pool || 0),
    no_pool: Number(row.no_pool || 0),
    status: row.status ?? null,
    created_at: row.created_at ? String(row.created_at) : undefined,
  }
}

export function MarketsSection() {
  const { user, ready, balance, openAuth, refreshProfile } = useAuth()
  const [markets, setMarkets] = useState<(LiveMarket & { created_at?: string })[]>([])
  const [userPositions, setUserPositions] = useState<Record<string, UserPosition[]>>({})
  const [loading, setLoading] = useState(true)
  const [bettingMarketId, setBettingMarketId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('Kaikki')
  const [actionError, setActionError] = useState<string | null>(null)
  const [stakeByMarket, setStakeByMarket] = useState<Record<string, number>>({})
  const [marketBets, setMarketBets] = useState<Record<string, MarketBet[]>>({})

  const loadData = useCallback(async () => {
    try {
      const marketsPromise = supabase
        .from('markets')
        .select('*')
        .order('created_at', { ascending: false })

      const userBetsPromise = user
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

      const historyBetsPromise = supabase
        .from('bets')
        .select('market_id, option, amount, created_at')
        .order('created_at', { ascending: true })

      const [marketsResult, betsResult, historyResult] = await Promise.all([
        marketsPromise,
        userBetsPromise,
        historyBetsPromise,
      ])

      if (marketsResult.error) {
        if (
          marketsResult.error.message?.includes('status') ||
          marketsResult.error.code === '42703'
        ) {
          const fallback = await supabase
            .from('markets')
            .select('*')
            .order('created_at', { ascending: false })
          if (fallback.data) setMarkets(fallback.data)
        } else {
          console.error('Failed to load markets:', marketsResult.error.message)
        }
      } else if (marketsResult.data) {
        setMarkets(
          marketsResult.data.filter((m) => isOpenMarketStatus(m.status))
        )
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

      if (historyResult.error) {
        if (historyResult.error.code !== 'PGRST205') {
          console.error('Failed to load bet history:', historyResult.error.message)
        }
        setMarketBets({})
      } else if (historyResult.data) {
        const grouped: Record<string, MarketBet[]> = {}
        for (const bet of historyResult.data) {
          const list = grouped[bet.market_id] ?? []
          list.push({
            option: String(bet.option || ''),
            amount: Number(bet.amount),
            created_at: bet.created_at,
          })
          grouped[bet.market_id] = list
        }
        setMarketBets(grouped)
      } else {
        setMarketBets({})
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
  }, [loadData, ready])

  // Live updates: resolution removes market; rollback / pool changes patch list
  useEffect(() => {
    if (!ready) return

    const channel = supabase
      .channel('public-markets-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        (payload) => {
          const wasOpen =
            payload.eventType === 'INSERT'
              ? false
              : isOpenMarketStatus(readMarketStatus(payload.old))
          const isOpen =
            payload.eventType === 'DELETE'
              ? false
              : isOpenMarketStatus(readMarketStatus(payload.new))

          setMarkets((prev) => applyMarketChange(prev, payload, toLiveMarket))

          // Winner payouts / rollback — refresh Fyrkka balance
          if (user && wasOpen !== isOpen) {
            void refreshProfile()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bets' },
        (payload) => {
          const row = payload.new as {
            market_id?: string
            option?: string
            amount?: number
            created_at?: string
          }
          if (!row?.market_id) return

          setMarketBets((prev) => {
            const list = prev[row.market_id!] ?? []
            return {
              ...prev,
              [row.market_id!]: [
                ...list,
                {
                  option: String(row.option || ''),
                  amount: Number(row.amount || 0),
                  created_at: row.created_at || new Date().toISOString(),
                },
              ],
            }
          })
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime markets channel error:', err)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [ready, user, refreshProfile])

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
    setStakeByMarket((prev) => ({ ...prev, [marketId]: 0 }))

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
    <div className="w-full max-w-full min-w-0 overflow-x-hidden">
      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-[var(--no)]/30 bg-[var(--no)]/10 px-3 py-2 text-sm text-[var(--no)]"
        >
          {actionError}
        </div>
      )}

      <div className="mb-6 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Ladataan kohteita...
        </div>
      ) : filteredMarkets.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Ei kohteita tässä kategoriassa.
        </div>
      ) : (
        <div className="grid w-full max-w-full grid-cols-1 gap-2.5 md:grid-cols-2">
          {filteredMarkets.map((market) => {
            const yesPool = Number(market.yes_pool || 0)
            const noPool = Number(market.no_pool || 0)
            const stake = getStake(market.id)
            const priceHistory = buildPriceHistory(
              market.created_at,
              marketBets[market.id] ?? [],
              yesPool,
              noPool
            )

            return (
              <MarketCard
                key={market.id}
                market={market}
                priceHistory={priceHistory}
                stake={stake}
                balance={balance}
                positions={userPositions[market.id] ?? []}
                isBetting={bettingMarketId === market.id}
                isLoggedIn={!!user}
                onStakeChange={(value) => setStake(market.id, value)}
                onBet={(choice) => handleBet(market.id, choice)}
                onLogin={() => openAuth('login')}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

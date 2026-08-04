'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface LeaderboardUser {
  id: string
  username: string
  fyrkat: number
}

export default function TulostaulukkoPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('fyrkat', { ascending: false })
        .limit(10)

      if (error) {
        console.error('Virhe haettaessa tulostaulukkoa:', error)
      } else if (data) {
        setUsers(data)
      }
      setLoading(false)
    }

    fetchLeaderboard()
  }, [])

  return (
    <div className="min-h-screen bg-[#0d1117] text-white p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-cyan-400 mb-2">🏆 Ennustamon Leaderboard</h1>
        <p className="text-gray-400 mb-8 text-sm">Parhaat ennustajat ja heidän keräämänsä Fyrkat.</p>

        <div className="bg-[#161b22] border border-gray-800 rounded-xl p-6 shadow-xl">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Ladataan tulostaulukkoa...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Ei vielä käyttäjiä tulostaulukossa.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {users.map((user, index) => {
                const rank = index + 1
                let rankColor = 'text-gray-400'
                if (rank === 1) rankColor = 'text-yellow-400'
                if (rank === 2) rankColor = 'text-gray-300'
                if (rank === 3) rankColor = 'text-amber-600'

                return (
                  <div
                    key={user.id}
                    className="flex justify-between items-center bg-gray-900/60 p-4 rounded-lg border border-gray-800"
                  >
                    <div className="flex items-center gap-4">
                      <span className={`font-bold text-lg w-6 ${rankColor}`}>{rank}.</span>
                      <span className="text-white font-semibold">{user.username || 'Anonyymi käyttäjä'}</span>
                    </div>
                    <span className="text-cyan-400 font-bold">{user.fyrkat} Fyrkkaa</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-8">
          <a href="/" className="text-sm text-cyan-400 hover:underline font-medium">
            ← Takaisin markkinoille
          </a>
        </div>
      </div>
    </div>
  )
}
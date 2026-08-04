import { CommunitySidebar } from '@/components/community-sidebar'
import { MarketsSection } from '@/components/markets-section'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export default function Page() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <SiteHeader />
      <main>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Markkinat
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Valitse kohde ja tee ennustuksesi.
                </p>
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
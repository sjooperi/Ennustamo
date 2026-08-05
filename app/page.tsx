import { CommunitySidebar } from '@/components/community-sidebar'
import { Hero } from '@/components/hero'
import { MarketsSection } from '@/components/markets-section'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export default function Page() {
  return (
    <div className="min-h-screen">
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

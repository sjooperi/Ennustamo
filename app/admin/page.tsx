import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { AdminPanel } from '@/components/admin-panel'

export const metadata = {
  title: 'Hallintapaneeli — Ennustamo',
  description: 'Ratkaise markkinat ja tilitä Fyrkat voittajille.',
}

export default function AdminPage() {
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPanel />
      </main>
      <SiteFooter />
    </div>
  )
}

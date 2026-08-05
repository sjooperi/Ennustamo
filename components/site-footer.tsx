import { TrendingUp } from 'lucide-react'

const LINK_GROUPS = [
  { title: 'Tuote', links: ['Markkinat', 'Tulostaulukko', 'Säännöt'] },
  { title: 'Yhteisö', links: ['Ennustajat', 'Keskustelut', 'Blogi'] },
  { title: 'Tietoa', links: ['Meistä', 'Yhteystiedot', 'Tietosuoja'] },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <TrendingUp className="size-4.5" strokeWidth={2.5} />
              </span>
              <span className="font-semibold tracking-tight">Ennustamo</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Täysin ilmainen leikkirahapeli. Ei oikeaa rahaa, ei
              rahapelaamista — pelkkää ennustamisen iloa.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            {LINK_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {group.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Ennustamo. Kaikki oikeudet pidätetään.</p>
          <p>
            Ennustamo on viihdepalvelu. Fyrkka on leikkirahaa, jolla ei ole
            rahallista arvoa.
          </p>
        </div>
      </div>
    </footer>
  )
}

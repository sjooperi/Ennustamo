export type Category =
  | 'Politiikka'
  | 'Talous'
  | 'Urheilu'
  | 'Viihde'
  | 'Teknologia'

export type Market = {
  id: string
  category: Category
  question: string
  closes: string
  yesPct: number
  volume: number
  comments: number
  sponsored?: string
  createdOrder: number
}

export const CATEGORIES: (Category | 'Suosituimmat')[] = [
  'Suosituimmat',
  'Politiikka',
  'Talous',
  'Urheilu',
  'Viihde',
  'Teknologia',
]

export const SORT_OPTIONS = [
  'Kuumimmat',
  'Uusimmat',
  'Päättyvät piakkoin',
] as const

export type SortOption = (typeof SORT_OPTIONS)[number]

export const MARKETS: Market[] = [
  {
    id: 'euribor',
    category: 'Talous',
    question:
      'Laskeeko 12kk Euribor-korko alle 2,0 % ennen vuoden loppua?',
    closes: '31.12.2026',
    yesPct: 65,
    volume: 14200,
    comments: 128,
    sponsored: 'Talouspankki',
    createdOrder: 3,
  },
  {
    id: 'vaalit',
    category: 'Politiikka',
    question:
      'Voittaako nykyinen pääministeripuolue seuraavat eduskuntavaalit?',
    closes: '19.4.2026',
    yesPct: 42,
    volume: 28650,
    comments: 342,
    createdOrder: 5,
  },
  {
    id: 'leijonat',
    category: 'Urheilu',
    question: 'Voittaako Leijonat jääkiekon MM-kultaa keväällä 2026?',
    closes: '24.5.2026',
    yesPct: 38,
    volume: 41300,
    comments: 512,
    createdOrder: 6,
  },
  {
    id: 'nokia',
    category: 'Teknologia',
    question: 'Ylittääkö Nokian osakekurssi 5 € ennen Q3-tulosjulkistusta?',
    closes: '30.9.2026',
    yesPct: 54,
    volume: 9800,
    comments: 76,
    createdOrder: 4,
  },
  {
    id: 'euroviisut',
    category: 'Viihde',
    question: 'Sijoittuuko Suomi Euroviisujen finaalissa TOP 5:een?',
    closes: '16.5.2026',
    yesPct: 27,
    volume: 6450,
    comments: 198,
    createdOrder: 2,
  },
  {
    id: 'inflaatio',
    category: 'Talous',
    question: 'Pysyykö Suomen vuosi-inflaatio alle 2,5 % koko vuoden 2026?',
    closes: '31.12.2026',
    yesPct: 71,
    volume: 12750,
    comments: 89,
    createdOrder: 1,
  },
]

export type LeaderboardEntry = {
  rank: number
  name: string
  handle: string
  profit: number
  initials: string
}

export const LEADERBOARD: LeaderboardEntry[] = [
  {
    rank: 1,
    name: 'Aino Virtanen',
    handle: '@aino_ennustaa',
    profit: 48200,
    initials: 'AV',
  },
  {
    rank: 2,
    name: 'Mikko Lehtonen',
    handle: '@mikko_oracle',
    profit: 37650,
    initials: 'ML',
  },
  {
    rank: 3,
    name: 'Sofia Koskinen',
    handle: '@sofiak',
    profit: 29100,
    initials: 'SK',
  },
]

export type Discussion = {
  id: string
  author: string
  initials: string
  market: string
  comment: string
  time: string
}

export const DISCUSSIONS: Discussion[] = [
  {
    id: 'd1',
    author: 'Jere H.',
    initials: 'JH',
    market: 'Euribor-korko',
    comment: 'EKP:n signaalit viittaavat selvästi koronlaskuun keväällä.',
    time: '5 min',
  },
  {
    id: 'd2',
    author: 'Petra N.',
    initials: 'PN',
    market: 'Leijonat MM-kulta',
    comment: 'Maalivahtitilanne huolettaa, mutta hyökkäys on huippuluokkaa.',
    time: '22 min',
  },
  {
    id: 'd3',
    author: 'Oskari T.',
    initials: 'OT',
    market: 'Euroviisut TOP 5',
    comment: 'Vetokerroin tuntuu liian matalalta tälle biisille.',
    time: '1 t',
  },
]

export function formatFyrkka(n: number): string {
  return n.toLocaleString('fi-FI')
}

import { create } from 'zustand'
import { SessionRecord, Rating, Profile } from '../core/types'

type AppState = {
  profile: Profile
  ratings: Record<string, Rating>
  history: SessionRecord[]
  addSession: (rec: SessionRecord) => void
  updateRating: (gameId: string, score: number) => void
  setProfileName: (name: string) => void
  exportData: () => string
  importData: (json: string) => void
}

function load<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return def
    return JSON.parse(raw) as T
  } catch { return def }
}

function save(key: string, val: any) {
  localStorage.setItem(key, JSON.stringify(val))
}

const defaultProfile: Profile = load('profile', {
  id: 'local',
  displayName: 'Trader',
  createdAt: Date.now()
})

const defaultRatings: Record<string, Rating> = load('ratings', {})
const defaultHistory: SessionRecord[] = load('history', [])

export const useAppStore = create<AppState>((set, get) => ({
  profile: defaultProfile,
  ratings: defaultRatings,
  history: defaultHistory,
  addSession: (rec) => {
    const h = [...get().history, rec]
    // keep last 1000
    const trimmed = h.slice(-1000)
    set({ history: trimmed })
    save('history', trimmed)
    // auto update rating
    get().updateRating(rec.gameId, rec.score)
  },
  updateRating: (gameId, score) => {
    const ratings = { ...get().ratings }
    const prev = ratings[gameId] || { gameId, elo: 1200, ewma: 50, plays: 0, best: 0, lastTs: 0 }
    const alpha = 0.25
    const newEwma = prev.plays === 0 ? score : prev.ewma * (1 - alpha) + score * alpha
    const newBest = Math.max(prev.best, score)
    ratings[gameId] = {
      gameId,
      elo: prev.elo + 32 * ((score / 100) - 0.5), // simple
      ewma: newEwma,
      plays: prev.plays + 1,
      best: newBest,
      lastTs: Date.now()
    }
    set({ ratings })
    save('ratings', ratings)
  },
  setProfileName: (name) => {
    const p = { ...get().profile, displayName: name }
    set({ profile: p })
    save('profile', p)
  },
  exportData: () => {
    return JSON.stringify({ profile: get().profile, ratings: get().ratings, history: get().history }, null, 2)
  },
  importData: (json) => {
    try {
      const data = JSON.parse(json)
      if (data.profile) { set({ profile: data.profile }); save('profile', data.profile) }
      if (data.ratings) { set({ ratings: data.ratings }); save('ratings', data.ratings) }
      if (data.history) { set({ history: data.history }); save('history', data.history) }
    } catch (e) { console.error(e) }
  }
}))

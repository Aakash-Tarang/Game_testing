export type SettingsBase = {
  seed: number
  difficulty: 'easy' | 'medium' | 'hard' | 'expert'
  durationSec: number // fixed session duration
}

export type SessionRecord = {
  id: string
  gameId: string
  seed: number
  settings: any
  score: number
  breakdown: any
  ts: number
  durationMs: number
}

export type Rating = {
  gameId: string
  elo: number // or skill score
  ewma: number // 0-100 normalized
  plays: number
  best: number
  lastTs: number
}

export type Profile = {
  id: string
  displayName: string
  createdAt: number
}

export type GameMeta = {
  id: string
  name: string
  description: string
  icon: string
}

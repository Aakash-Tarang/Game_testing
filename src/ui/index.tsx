import { useEffect, useState } from 'react'

export function Timer({ remainingMs, totalMs }: { remainingMs: number, totalMs: number }) {
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100))
  const color = pct > 50 ? '#00ff88' : pct > 20 ? '#ffaa00' : '#ff0055'
  return (
    <div className="timer">
      <div className="timer-bar-bg"><div className="timer-bar" style={{ width: `${pct}%`, background: color }} /></div>
      <span style={{ color }}>{(remainingMs/1000).toFixed(1)}s</span>
    </div>
  )
}

export function NumberInput({ value, onChange, placeholder, autoFocus }: { value: string, onChange: (v:string)=>void, placeholder?: string, autoFocus?: boolean }) {
  return (
    <input
      className="input big"
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e=>onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  )
}

export function ScoreBoard({ score, breakdown }: { score: number, breakdown?: any }) {
  return (
    <div className="scoreboard">
      <div className="score-big">{score.toFixed(1)}</div>
      {breakdown && <pre className="breakdown">{JSON.stringify(breakdown, null, 2)}</pre>}
    </div>
  )
}

export function useCountdown(durationMs: number, running: boolean, onExpire?: ()=>void) {
  const [remaining, setRemaining] = useState(durationMs)
  const [startTs, setStartTs] = useState<number|null>(null)

  useEffect(()=>{
    if (!running) return
    setStartTs(performance.now())
    setRemaining(durationMs)
    const iv = setInterval(()=>{
      const elapsed = performance.now() - (startTs ?? performance.now())
      // recalc from Date.now? simpler use state
      setRemaining(prev => {
        const next = prev - 100
        if (next <= 0) {
          clearInterval(iv)
          onExpire?.()
          return 0
        }
        return next
      })
    }, 100)
    return ()=>clearInterval(iv)
  }, [running, durationMs])

  useEffect(()=>{
    if (running) {
      setRemaining(durationMs)
    }
  }, [durationMs, running])

  return remaining
}

import { useEffect, useState, useRef } from 'react'
import { initEV, applyEV, resultEV, EVSettings, EVState } from './engine'
import { navigate } from '../../app/router'
import { useAppStore } from '../../app/store'

const defaultSettings: EVSettings = {
  seed: Math.floor(Math.random()*1e9),
  difficulty: 'medium',
  durationSec: 120,
  questionTimeSec: 30
}

function formatNum(n: number) {
  if (Math.abs(n) < 0.01) return n.toFixed(4)
  if (Math.abs(n) < 1) return n.toFixed(3)
  if (Math.abs(n) < 100) return n.toFixed(2)
  return n.toFixed(1)
}

export function EVDrillPage({ params }: { params: Record<string,string> }) {
  const [settings, setSettings] = useState<EVSettings>(defaultSettings)
  const [state, setState] = useState<EVState | null>(null)
  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const addSession = useAppStore(s=>s.addSession)

  // tick loop
  useEffect(()=>{
    if (!state || state.over) return
    const iv = setInterval(()=>{
      setState(prev => prev ? applyEV(prev, { type: 'tick', nowMs: Date.now() }) : prev)
    }, 100)
    return ()=>clearInterval(iv)
  }, [state?.over])

  useEffect(()=>{
    if (state && !showSettings) inputRef.current?.focus()
  }, [state?.currentIdx, showSettings])

  const start = (custom?: Partial<EVSettings>) => {
    const s = { ...settings, ...custom, seed: custom?.seed ?? Math.floor(Math.random()*1e9) }
    setSettings(s)
    setState(initEV(s.seed, s))
    setShowSettings(false)
    setInput('')
  }

  const submit = () => {
    if (!state) return
    const v = parseFloat(input)
    if (isNaN(v)) return
    const ns = applyEV(state, { type: 'answer', value: v })
    setState(ns)
    setInput('')
    if (ns.over) {
      const res = resultEV(ns)
      addSession({
        id: `${Date.now()}-${ns.seed}`,
        gameId: 'ev-drill',
        seed: ns.seed,
        settings: ns.settings,
        score: res.totalScore,
        breakdown: res,
        ts: Date.now(),
        durationMs: ns.settings.durationSec*1000
      })
    }
  }

  const skip = () => {
    if (!state) return
    const ns = applyEV(state, { type: 'skip' })
    setState(ns)
    setInput('')
    if (ns.over) {
      const res = resultEV(ns)
      addSession({
        id: `${Date.now()}-${ns.seed}`,
        gameId: 'ev-drill',
        seed: ns.seed,
        settings: ns.settings,
        score: res.totalScore,
        breakdown: res,
        ts: Date.now(),
        durationMs: ns.settings.durationSec*1000
      })
    }
  }

  if (showSettings || !state) {
    return (
      <div className="page">
        <div className="page-header">
          <button className="btn ghost" onClick={()=>navigate('/')}>{'<'} HUB</button>
          <h2>EV_DRILL // SETTINGS</h2>
        </div>

        <div className="panel">
          <h3>Mode: free-text number (tolerance-graded)</h3>
          <p className="muted">Every scenario has computable fair value. Answer within 1% = full, 5% = half. Time bonus rewards speed.</p>

          <div className="settings-grid">
            <div>
              <label>Difficulty</label>
              <select className="input" value={settings.difficulty} onChange={e=>setSettings({...settings, difficulty: e.target.value as any})}>
                <option value="easy">easy — lottery, 30 pts mean</option>
                <option value="medium">medium — + conditional</option>
                <option value="hard">hard — + compound, cost</option>
                <option value="expert">expert — + call payoff, mixed</option>
              </select>
            </div>
            <div>
              <label>Session duration (sec)</label>
              <select className="input" value={settings.durationSec} onChange={e=>setSettings({...settings, durationSec: parseInt(e.target.value)})}>
                <option value="60">60s sprint</option>
                <option value="120">120s standard</option>
                <option value="180">180s extended</option>
                <option value="300">300s marathon</option>
              </select>
            </div>
            <div>
              <label>Per question (sec)</label>
              <select className="input" value={settings.questionTimeSec} onChange={e=>setSettings({...settings, questionTimeSec: parseInt(e.target.value)})}>
                <option value="15">15s</option>
                <option value="30">30s (interview)</option>
                <option value="45">45s</option>
                <option value="60">60s</option>
              </select>
            </div>
          </div>

          <div className="row" style={{marginTop:16}}>
            <button className="btn primary" onClick={()=>start()}>START SESSION</button>
            <button className="btn ghost" onClick={()=>start({seed: settings.seed})}>REPLAY SEED {settings.seed}</button>
          </div>

          <div className="panel small">
            <h4>Tiers included</h4>
            <ul className="tier-list">
              <li><b>T1</b> Lottery: Σ p_i·x_i (3–6 outcomes)</li>
              <li><b>T2</b> Sequence of 30 points: mean / sum / EV draw</li>
              <li><b>T3</b> Conditional EV: E[x | x&gt;k]</li>
              <li><b>T4</b> Two-step: EV of EV (compound lottery)</li>
              <li><b>T5</b> EV with cost/entry fee: net EV</li>
              <li><b>T6</b> Mixed: EV of max(0, x-K) call payoff</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  if (state.over) {
    const res = resultEV(state)
    return (
      <div className="page">
        <div className="page-header">
          <button className="btn ghost" onClick={()=>navigate('/')}>HUB</button>
          <h2>EV_DRILL // RESULTS</h2>
          <button className="btn" onClick={()=>setShowSettings(true)}>NEW SESSION</button>
        </div>

        <div className="panel">
          <div className="results-top">
            <div className="big-score">{res.totalScore.toFixed(1)}<span> pts</span></div>
            <div className="results-meta">
              <div>{res.answered} answered | {res.correct} perfect (≤1%) | {res.half} close (≤5%)</div>
              <div>avg time {res.avgTime.toFixed(1)}s | avg error {(res.avgRatio*100).toFixed(1)}%</div>
              <div>seed {state.seed} | {state.settings.difficulty} | {state.settings.durationSec}s total</div>
            </div>
          </div>

          <table className="table">
            <thead><tr><th>#</th><th>Type</th><th>Prompt</th><th>Your</th><th>Truth</th><th>Err%</th><th>Score</th><th>Time</th></tr></thead>
            <tbody>
              {res.answers.map((a,i)=>(
                <tr key={i} className={a.accuracy>=1 ? 'row-good' : a.accuracy>=0.5 ? 'row-mid' : 'row-bad'}>
                  <td>{i+1}</td>
                  <td>{a.scenario.type}</td>
                  <td style={{maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={a.scenario.prompt}>{a.scenario.prompt}</td>
                  <td>{a.userAns !== null ? formatNum(a.userAns) : '—'}</td>
                  <td>{formatNum(a.truth)}</td>
                  <td>{(a.ratio*100).toFixed(1)}%</td>
                  <td>{a.score.toFixed(1)}</td>
                  <td>{(a.timeTakenMs/1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row" style={{marginTop:16}}>
            <button className="btn primary" onClick={()=>start()}>AGAIN</button>
            <button className="btn ghost" onClick={()=>start({seed: state.seed})}>REPLAY SAME SEED</button>
          </div>
        </div>
      </div>
    )
  }

  const curQ = state.questions[state.currentIdx]
  const elapsedQ = Date.now() - state.currentStartMs
  const remainingQ = Math.max(0, state.settings.questionTimeSec*1000 - elapsedQ)
  const totalRemaining = state.sessionRemainingMs

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn ghost" onClick={()=>setShowSettings(true)}>QUIT</button>
        <div className="timer-group">
          <div>Q {state.currentIdx+1}/{state.questions.length} | TOTAL {(totalRemaining/1000).toFixed(0)}s left</div>
        </div>
        <div className="score-mini">Score: {state.totalScore.toFixed(1)}</div>
      </div>

      <div className="ev-layout">
        <div className="panel ev-question">
          <div className="q-header">
            <span className="badge">T{curQ.tier} // {curQ.type}</span>
            <div className="timer-bar-wrap">
              <div className="timer-bar-bg"><div className="timer-bar" style={{ width: `${(remainingQ/(state.settings.questionTimeSec*1000))*100}%`, background: remainingQ>10000 ? '#00ff88' : remainingQ>5000 ? '#ffaa00' : '#ff0055' }} /></div>
            </div>
            <span className="timer-text">{(remainingQ/1000).toFixed(1)}s</span>
          </div>

          <h2 className="ev-prompt">{curQ.prompt}</h2>
          {curQ.visual && <pre className="ev-visual">{curQ.visual}</pre>}

          <div className="ev-input-row">
            <input
              ref={inputRef}
              className="input big ev-input"
              type="text"
              inputMode="decimal"
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if (e.key==='Enter') submit() }}
              placeholder="enter number e.g. 12.34"
              autoFocus
            />
            <button className="btn primary" onClick={submit} disabled={input.trim()===''}>SUBMIT ↵</button>
            <button className="btn ghost" onClick={skip}>SKIP</button>
          </div>

          <div className="muted small">Tolerance: ≤1% full, ≤5% half, ≤10% quarter. Time bonus up to 1.5x. Free-text only.</div>
        </div>

        <div className="panel ev-history">
          <h4>Session progress</h4>
          <div className="history-list">
            {state.answers.slice(-8).reverse().map((a,i)=>(
              <div key={i} className={`history-item ${a.accuracy>=1?'good':a.accuracy>=0.5?'mid':'bad'}`}>
                <span>#{state.answers.length - i}</span>
                <span>{a.scenario.type}</span>
                <span>{a.userAns!==null?formatNum(a.userAns):'—'} vs {formatNum(a.truth)}</span>
                <span>{a.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

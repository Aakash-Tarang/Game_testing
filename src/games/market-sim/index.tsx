import { useEffect, useState } from 'react'
import { initMarket, applyMarket, resultMarket, getClassicPreset, MarketSettings, MarketState } from './engine'
import { navigate } from '../../app/router'
import { useAppStore } from '../../app/store'

const defaultSettings: MarketSettings = getClassicPreset(Math.floor(Math.random()*1e9))

export function MarketSimPage({ params }: { params: Record<string,string> }) {
  const [settings, setSettings] = useState<MarketSettings>(defaultSettings)
  const [state, setState] = useState<MarketState | null>(null)
  const [showSettings, setShowSettings] = useState(true)
  const [qty, setQty] = useState(5)
  const addSession = useAppStore(s=>s.addSession)

  useEffect(()=>{
    if (!state || state.over) return
    const iv = setInterval(()=>{
      setState(prev => prev ? applyMarket(prev, { type: 'tick', nowMs: Date.now() }) : prev)
    }, settings.tickMs)
    return ()=>clearInterval(iv)
  }, [state?.over, settings.tickMs])

  const start = (custom?: Partial<MarketSettings>) => {
    const s = { ...settings, ...custom, seed: custom?.seed ?? Math.floor(Math.random()*1e9) }
    setSettings(s)
    setState(initMarket(s.seed, s))
    setShowSettings(false)
  }

  const trade = (id: string, side: 'buy'|'sell') => {
    if (!state) return
    const ns = applyMarket(state, { type: 'trade', instrumentId: id, side, qty })
    setState(ns)
  }

  if (showSettings || !state) {
    return (
      <div className="page">
        <div className="page-header">
          <button className="btn ghost" onClick={()=>navigate('/')}>{'<'} HUB</button>
          <h2>MARKET_SIM // SETTINGS</h2>
        </div>

        <div className="panel">
          <h3>Generalized Market Simulator — classic preset = your interview</h3>
          <p className="muted">4 vars x,y,z,w each mean-reverting. q = x·y + z·w (classic) or weighted/product/runningMax. Instruments: spot, forward, call, binary, monoCall. Arb injection with mean-reversion. P&L mark-to-market vs fair.</p>

          <div className="settings-grid">
            <div>
              <label>Formula</label>
              <select className="input" value={settings.formula} onChange={e=>setSettings({...settings, formula: e.target.value as any})}>
                <option value="classic">classic: x·y + z·w</option>
                <option value="weighted">weighted: 1.2·x·y + 0.8·z·w + 0.5·(x+z)</option>
                <option value="product">product: x·y·z + w</option>
                <option value="runningMax">runningMax: classic + monotonic bound</option>
              </select>
            </div>
            <div>
              <label>Difficulty</label>
              <select className="input" value={settings.difficulty} onChange={e=>setSettings({...settings, difficulty: e.target.value as any})}>
                <option value="easy">easy — large ε, slow ticks</option>
                <option value="medium">medium — classic interview</option>
                <option value="hard">hard — small ε, fast</option>
                <option value="expert">expert — tiny ε, noisy</option>
              </select>
            </div>
            <div>
              <label>Duration</label>
              <select className="input" value={settings.durationSec} onChange={e=>setSettings({...settings, durationSec: parseInt(e.target.value)})}>
                <option value="60">60s</option>
                <option value="120">120s</option>
                <option value="180">180s</option>
                <option value="300">300s</option>
              </select>
            </div>
            <div>
              <label>Tick ms</label>
              <select className="input" value={settings.tickMs} onChange={e=>setSettings({...settings, tickMs: parseInt(e.target.value)})}>
                <option value="1500">1500 slow</option>
                <option value="1000">1000 classic</option>
                <option value="700">700 fast</option>
                <option value="400">400 expert</option>
              </select>
            </div>
            <div>
              <label>p(mispricing)</label>
              <input className="input" type="range" min="0.05" max="0.5" step="0.05" value={settings.pMispricing} onChange={e=>setSettings({...settings, pMispricing: parseFloat(e.target.value)})} />
              <span className="muted">{settings.pMispricing}</span>
            </div>
            <div>
              <label>Spread</label>
              <input className="input" type="range" min="0.2" max="3" step="0.1" value={settings.spread} onChange={e=>setSettings({...settings, spread: parseFloat(e.target.value)})} />
              <span className="muted">{settings.spread}</span>
            </div>
            <div>
              <label>Monotonic arb</label>
              <input type="checkbox" checked={settings.monotonic} onChange={e=>setSettings({...settings, monotonic: e.target.checked})} /> include MONO_CALL (obvious arb below intrinsic)
            </div>
          </div>

          <div className="row" style={{marginTop:16}}>
            <button className="btn primary" onClick={()=>start()}>START CLASSIC</button>
            <button className="btn ghost" onClick={()=>start({ formula: 'weighted' })}>WEIGHTED PRESET</button>
            <button className="btn ghost" onClick={()=>start({ formula: 'product', monotonic: false })}>PRODUCT PRESET</button>
          </div>

          <div className="panel small" style={{marginTop:16}}>
            <h4>How to play — the invariant</h4>
            <ul className="tier-list">
              <li><b>Fair value is computable</b> from visible x,y,z,w. Engine shows fair; market quotes bid/ask around fair ± mispricing.</li>
              <li><b>Arb injection:</b> each tick with p, one instrument shifted by ±ε, decays over ~5 ticks (mean-reversion).</li>
              <li><b>Trade:</b> buy underpriced (ask &lt; fair), sell overpriced (bid &gt; fair). Size up to cap.</li>
              <li><b>Monotonic case:</b> q non-decreasing ⇒ call fair ≥ max(0,q-K). Any quote below intrinsic = free money.</li>
              <li><b>Scoring:</b> P&L + edge captured % + detection F1 - false positives. Random trading ≈ 0.</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  if (state.over) {
    const res = resultMarket(state)
    return (
      <div className="page">
        <div className="page-header">
          <button className="btn ghost" onClick={()=>navigate('/')}>HUB</button>
          <h2>MARKET_SIM // RESULTS</h2>
          <button className="btn" onClick={()=>setShowSettings(true)}>NEW SESSION</button>
        </div>

        <div className="panel">
          <div className="results-top">
            <div className="big-score">{res.score.toFixed(1)}<span> pts</span></div>
            <div className="results-meta">
              <div>P&L {res.pnl.toFixed(2)} | edge {res.edgeCaptured.toFixed(1)}% | F1 {res.f1.toFixed(2)}</div>
              <div>injected {res.totalInjected} | captured {res.totalCaptured} | falsePos {res.falsePositives} | trades {res.trades}</div>
              <div>max possible {res.maxPossiblePnl.toFixed(1)} | precision { (res.precision*100).toFixed(0)}% | detection {(res.detectionRate*100).toFixed(0)}%</div>
            </div>
          </div>

          <table className="table">
            <thead><tr><th>Tick</th><th>Inst</th><th>Side</th><th>Qty</th><th>Price</th><th>Fair</th><th>Mis</th><th>Instant P&L</th><th>Arb?</th></tr></thead>
            <tbody>
              {state.trades.slice(-50).reverse().map((t,i)=>(
                <tr key={i} className={t.wasCorrect?'row-good':t.wasArb?'row-mid':'row-bad'}>
                  <td>{t.tick}</td><td>{t.instrumentId}</td><td>{t.side}</td><td>{t.qty}</td><td>{t.price.toFixed(2)}</td><td>{t.fairAtTrade.toFixed(2)}</td><td>{t.mispricingAtTrade.toFixed(2)}</td><td>{t.pnlInstant.toFixed(2)}</td><td>{t.wasCorrect?'✓':t.wasArb?'miss':''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row" style={{marginTop:16}}>
            <button className="btn primary" onClick={()=>start()}>AGAIN</button>
            <button className="btn ghost" onClick={()=>start({seed: state.seed})}>REPLAY SEED {state.seed}</button>
          </div>
        </div>
      </div>
    )
  }

  // live view
  const resLive = resultMarket(state)
  return (
    <div className="page market-page">
      <div className="page-header">
        <button className="btn ghost" onClick={()=>setShowSettings(true)}>QUIT</button>
        <div className="timer-group">
          <span>TICK {state.tick}</span>
          <span className="dot" style={{background: state.tick%2===0?'#00ff88':'#003311'}} />
          <span>{(state.remainingMs/1000).toFixed(0)}s left</span>
          <span>q={state.q}</span>
        </div>
        <div className="score-mini">P&L {state.realizedPnl.toFixed(1)} | score {resLive.score.toFixed(1)}</div>
      </div>

      <div className="market-layout">
        <div className="panel vars-panel">
          <h4>BASE VARS // x·y + z·w = q</h4>
          <div className="vars-grid">
            {state.vars.map(v=>(
              <div key={v.name} className="var-card">
                <div className="var-name">{v.name}</div>
                <div className="var-value">{v.value}</div>
                <div className="var-hist">
                  {v.history.map((h,i)=><div key={i} className="var-bar" style={{ height: `${((h - v.min)/(v.max - v.min))*100}%` }} />)}
                </div>
                <div className="muted small">{v.min}..{v.max} mean {v.mean}</div>
              </div>
            ))}
          </div>
          <div className="q-history">
            <div className="muted small">q history</div>
            <div className="q-bars">
              {state.qHistory.map((qq,i)=>{
                const min = Math.min(...state.qHistory)
                const max = Math.max(...state.qHistory)
                const h = max===min?50: ((qq-min)/(max-min))*100
                return <div key={i} className="q-bar" style={{ height: `${h}%` }} title={`${qq}`} />
              })}
            </div>
            <div className="muted small">formula {state.settings.formula} | q={state.q} = {state.vars[0].value}*{state.vars[1].value} + {state.vars[2].value}*{state.vars[3].value}</div>
          </div>

          <div className="panel small">
            <h4>Positions</h4>
            {Object.values(state.positions).length===0 ? <div className="muted">no pos</div> :
              <table className="table small">
                <thead><tr><th>Inst</th><th>Qty</th><th>Avg</th><th>Fair</th><th>U-P&L</th></tr></thead>
                <tbody>
                  {Object.values(state.positions).map(p=>{
                    const inst = state.instruments.find(i=>i.id===p.instrumentId)
                    const upnl = inst ? (inst.fair - p.avgPrice)*p.qty : 0
                    return <tr key={p.instrumentId}><td>{p.instrumentId}</td><td>{p.qty}</td><td>{p.avgPrice.toFixed(2)}</td><td>{inst?.fair.toFixed(2)}</td><td style={{color: upnl>=0?'#00ff88':'#ff0055'}}>{upnl.toFixed(2)}</td></tr>
                  })}
                </tbody>
              </table>
            }
            <div className="muted small">cash {state.cash.toFixed(2)} | total P&L {state.realizedPnl.toFixed(2)} | edge {resLive.edgeCaptured.toFixed(1)}%</div>
          </div>
        </div>

        <div className="panel instruments-panel">
          <div className="row" style={{justifyContent:'space-between'}}>
            <h4>INSTRUMENTS // bid / fair / ask</h4>
            <div className="row">
              <label>Qty</label>
              <input className="input" type="number" min="1" max={settings.sizeCap} value={qty} onChange={e=>setQty(parseInt(e.target.value)||1)} style={{width:60}} />
            </div>
          </div>

          <div className="instruments-list">
            {state.instruments.map(inst=>{
              const isArb = Math.abs(inst.mispricing) > settings.spread*0.6
              const arbDir = inst.mispricing < 0 ? 'BUY' : 'SELL'
              const isMonoArb = inst.type==='monoCall' && inst.ask < Math.max(0, state.q - (inst.strike||0))
              return (
                <div key={inst.id} className={`instrument-card ${isArb?'arb':''} ${isMonoArb?'arb-obvious':''}`}>
                  <div className="inst-header">
                    <span className="inst-id">{inst.id}</span>
                    <span className="inst-type">{inst.type}</span>
                    {isArb && <span className="badge arb-badge">{arbDir} {Math.abs(inst.mispricing).toFixed(1)} off</span>}
                    {isMonoArb && <span className="badge arb-obvious-badge">BELOW INTRINSIC!</span>}
                  </div>
                  <div className="inst-prices">
                    <div><label>bid</label><b className={inst.bid > inst.fair ? 'up' : ''}>{inst.bid.toFixed(2)}</b></div>
                    <div><label>fair</label><b className="fair">{inst.fair.toFixed(2)}</b>{inst.strike!==undefined && <span className="muted small"> K={inst.strike}</span>}</div>
                    <div><label>ask</label><b className={inst.ask < inst.fair ? 'down' : ''}>{inst.ask.toFixed(2)}</b></div>
                    <div><label>mis</label><span style={{color: Math.abs(inst.mispricing)>0.5 ? (inst.mispricing<0?'#00ff88':'#ffaa00') : '#888'}}>{inst.mispricing.toFixed(2)}</span></div>
                  </div>
                  <div className="inst-actions">
                    <button className="btn sell" onClick={()=>trade(inst.id,'sell')}>SELL {qty} @ {inst.bid.toFixed(2)}</button>
                    <button className="btn buy" onClick={()=>trade(inst.id,'buy')}>BUY {qty} @ {inst.ask.toFixed(2)}</button>
                  </div>
                  {inst.type==='monoCall' && (
                    <div className="muted small">intrinsic = max(0, q - K) = max(0, {state.q} - {inst.strike}) = {Math.max(0, state.q - (inst.strike||0))} . Quote below intrinsic = instant free money.</div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="panel small">
            <h4>Last trades</h4>
            <div style={{maxHeight:120, overflow:'auto'}}>
              {state.trades.slice(-10).reverse().map((t,i)=>(
                <div key={i} className={`trade-row ${t.wasCorrect?'good':''}`}>
                  <span>{t.tick}</span><span>{t.instrumentId}</span><span>{t.side} {t.qty}@{t.price.toFixed(1)}</span><span>fair {t.fairAtTrade.toFixed(1)}</span><span style={{color:t.wasCorrect?'#00ff88':'#888'}}>{t.wasCorrect?'✓ arb': t.wasArb?'missed':''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

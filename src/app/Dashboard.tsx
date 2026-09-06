import { useAppStore } from './store'
import { navigate } from './router'

const games = [
  {
    id: 'ev-drill',
    name: 'EV DRILL',
    desc: 'Free-text expected value. 30 points / 30s feel. Tiered generator.',
    icon: 'Σ',
    path: '/ev-drill',
    color: '#00ff88'
  },
  {
    id: 'market-sim',
    name: 'MARKET SIM',
    desc: 'Flagship Optiver-style. 4 vars, spot+swap+call+binary, monotonic arb. Generalized.',
    icon: '◧',
    path: '/market-sim',
    color: '#ffaa00'
  },
  {
    id: 'etf-arb',
    name: 'ETF ARB',
    desc: 'Coming soon — basket vs NAV mean-reversion',
    icon: '◫',
    path: '#',
    color: '#555',
    disabled: true
  },
  {
    id: 'card-taking',
    name: 'CARD TAKING',
    desc: 'Coming soon — market taking with card values',
    icon: '♠',
    path: '#',
    color: '#555',
    disabled: true
  },
]

export function Dashboard() {
  const { ratings, profile, history } = useAppStore()

  return (
    <div className="dash">
      <header className="dash-header">
        <div>
          <h1>QUANT<span>_SIM</span> // TRAINING_HUB</h1>
          <p className="sub">local / seeded / deterministic / dark_terminal</p>
        </div>
        <div className="header-right">
          <div className="profile-badge" onClick={() => navigate('/profile')}>
            <span className="dot" /> {profile.displayName} // {history.length} sessions
          </div>
          <button className="btn ghost" onClick={() => navigate('/profile')}>PROFILE</button>
        </div>
      </header>

      <div className="grid">
        {games.map(g => {
          const r = ratings[g.id]
          return (
            <div key={g.id} className={`card ${g.disabled ? 'disabled' : ''}`} style={{ borderColor: g.color }}>
              <div className="card-top">
                <span className="card-icon" style={{ color: g.color }}>{g.icon}</span>
                <span className="card-id">{g.id}</span>
                {r && <span className="card-plays">{r.plays} plays</span>}
              </div>
              <h2>{g.name}</h2>
              <p>{g.desc}</p>

              <div className="card-stats">
                <div><label>EWMA</label><b>{r ? r.ewma.toFixed(1) : '--'}</b></div>
                <div><label>BEST</label><b>{r ? r.best.toFixed(1) : '--'}</b></div>
                <div><label>ELO</label><b>{r ? Math.round(r.elo) : '--'}</b></div>
              </div>

              {r && history.length > 0 && (
                <div className="sparkline">
                  {history.filter(h=>h.gameId===g.id).slice(-20).map((h,i)=>(
                    <div key={i} className="spark-bar" style={{ height: `${Math.max(4, h.score)}%`, background: g.color }} />
                  ))}
                </div>
              )}

              <button className="btn" disabled={g.disabled} onClick={()=>navigate(g.path)} style={{ background: g.color, color: '#000' }}>
                {g.disabled ? 'LOCKED' : 'PLAY >'}
              </button>
            </div>
          )
        })}
      </div>

      <footer className="dash-footer">
        <span>seeded RNG: mulberry32 // fairValue is source of truth // no AI market makers</span>
        <span>v0.1.0 mvp // phase 1</span>
      </footer>
    </div>
  )
}

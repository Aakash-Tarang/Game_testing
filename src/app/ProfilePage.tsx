import { useAppStore } from './store'
import { navigate } from './router'
import { useState } from 'react'

export function ProfilePage() {
  const { profile, ratings, history, setProfileName, exportData, importData } = useAppStore()
  const [name, setName] = useState(profile.displayName)
  const [importText, setImportText] = useState('')

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn ghost" onClick={()=>navigate('/')}>{'<'} HUB</button>
        <h2>PROFILE // {profile.displayName}</h2>
      </div>

      <div className="panel">
        <h3>Identity</h3>
        <div className="row">
          <input className="input" value={name} onChange={e=>setName(e.target.value)} />
          <button className="btn" onClick={()=>setProfileName(name)}>SAVE</button>
        </div>
        <div className="meta">ID: {profile.id} | Created: {new Date(profile.createdAt).toLocaleString()}</div>
      </div>

      <div className="panel">
        <h3>Ratings</h3>
        <table className="table">
          <thead><tr><th>Game</th><th>Plays</th><th>EWMA</th><th>Best</th><th>Elo</th></tr></thead>
          <tbody>
            {Object.values(ratings).map(r=>(
              <tr key={r.gameId}><td>{r.gameId}</td><td>{r.plays}</td><td>{r.ewma.toFixed(1)}</td><td>{r.best.toFixed(1)}</td><td>{Math.round(r.elo)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>History ({history.length})</h3>
        <div style={{ maxHeight: 200, overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>TS</th><th>Game</th><th>Score</th><th>Seed</th></tr></thead>
            <tbody>
              {history.slice(-50).reverse().map(h=>(
                <tr key={h.id}><td>{new Date(h.ts).toLocaleTimeString()}</td><td>{h.gameId}</td><td>{h.score.toFixed(1)}</td><td>{h.seed}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Export / Import</h3>
        <button className="btn ghost" onClick={()=>{
          const data = exportData()
          const blob = new Blob([data], {type:'application/json'})
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download='quant-sim-backup.json'; a.click()
        }}>EXPORT JSON</button>
        <div className="row" style={{marginTop:10}}>
          <textarea className="input" style={{height:80, width:300}} value={importText} onChange={e=>setImportText(e.target.value)} placeholder="paste backup json" />
          <button className="btn ghost" onClick={()=>importData(importText)}>IMPORT</button>
        </div>
      </div>
    </div>
  )
}

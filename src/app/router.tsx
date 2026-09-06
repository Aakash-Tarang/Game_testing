import { useEffect, useState } from 'react'
import { Dashboard } from './Dashboard'
import { EVDrillPage } from '../games/ev-drill'
import { MarketSimPage } from '../games/market-sim'
import { ProfilePage } from './ProfilePage'

type Route = { path: string, params: Record<string,string> }

function parseHash(): Route {
  const hash = window.location.hash.slice(1) || '/'
  const [pathPart, queryPart] = hash.split('?')
  const params: Record<string,string> = {}
  if (queryPart) {
    queryPart.split('&').forEach(kv => {
      const [k,v] = kv.split('=')
      params[decodeURIComponent(k)] = decodeURIComponent(v || '')
    })
  }
  return { path: pathPart, params }
}

export function Router() {
  const [route, setRoute] = useState<Route>(parseHash())

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const path = route.path

  if (path === '/' || path === '') return <Dashboard />
  if (path.startsWith('/ev-drill')) return <EVDrillPage params={route.params} />
  if (path.startsWith('/market-sim')) return <MarketSimPage params={route.params} />
  if (path.startsWith('/profile')) return <ProfilePage />

  return <div style={{padding:20}}>Unknown route {path} <a href="#/">home</a></div>
}

export function navigate(path: string) {
  window.location.hash = path
}

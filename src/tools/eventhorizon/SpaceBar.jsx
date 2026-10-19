// Event Horizon — which space you're in. Default (the real map) just says hello; Test is labelled loudly.
import { useEffect, useState } from 'react'
import * as api from './api'

export const SPACE_LABEL = { default: 'Default', test: 'Test space' }

export function SpaceBar({ space, who: given }) {
  const [who, setWho] = useState(given || null)
  const [problem, setProblem] = useState(null)
  useEffect(() => {
    if (given) { setWho(given); return }
    let on = true
    api.whoami().then((w) => on && setWho(w)).catch((e) => on && setProblem(e.message))
    return () => { on = false }
  }, [space, given])
  return (
    <p className={`eh-space ${space}`} aria-live="polite">
      <span className="eh-space-dot" aria-hidden="true">{space === 'test' ? '▲' : '●'}</span>
      {space === 'test' && <span className="eh-space-name">{who?.space?.name ? `${who.space.name} space` : SPACE_LABEL.test}</span>}
      {who?.user?.name
        ? <span className={space === 'test' ? 'eh-muted' : 'eh-space-name'}>{space === 'test' ? ' · ' : ''}hello {who.user.name}</span>
        : space !== 'test' && <span className="eh-space-name">your map</span>}
      {space === 'test' && <span className="eh-muted"> · nothing here touches your real map</span>}
      {problem && <span className="eh-problem"> · {problem}</span>}
    </p>
  )
}

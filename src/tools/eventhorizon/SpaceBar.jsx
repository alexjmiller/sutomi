// Event Horizon — which space you're in. Quiet for Default (the real map), loud for Test.
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
      <span className="eh-space-name">{who?.space?.name ? (space === 'test' ? `${who.space.name} space` : who.space.name) : SPACE_LABEL[space]}</span>
      {who?.user?.name && <span className="eh-muted"> · hello {who.user.name}</span>}
      {space === 'test' && <span className="eh-muted"> · nothing here touches your real map</span>}
      {problem && <span className="eh-problem"> · {problem}</span>}
    </p>
  )
}

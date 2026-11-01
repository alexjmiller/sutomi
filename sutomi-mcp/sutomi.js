// The one place that knows sutomi's HTTP shape. Talks to the tasklists API and the Event Horizon
// proxy with the API token (sutomi's requireAuth accepts `Authorization: Bearer <SUTOMI_API_TOKEN>`
// as well as the passkey session cookie). Errors carry `status` so a tool can tell "no such list"
// from "sutomi is down". Event Horizon calls land in the Default space (no X-EH-Space header).
export function sutomiClient({ url, token, fetchImpl = fetch }) {
  const base = String(url).replace(/\/$/, '')

  async function request(path, options = {}) {
    const res = await fetchImpl(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    })
    if (!res.ok) {
      let detail = ''
      try { detail = (await res.json()).error || '' } catch { /* not json */ }
      const err = new Error(`sutomi ${options.method || 'GET'} ${path} failed (${res.status}${detail ? `: ${detail}` : ''})`)
      err.status = res.status
      throw err
    }
    return res.status === 204 ? null : res.json()
  }
  const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })

  return {
    listLists: () => request('/api/tasklists'),
    getList: (id) => request(`/api/tasklists/${encodeURIComponent(id)}`),
    /** Merge item ops into a list; sutomi returns the merged list. */
    patchList: (id, body) => request(`/api/tasklists/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

    // Event Horizon, through sutomi's allow-listed substrate proxy.
    /** One page of materialized occurrences: { items, next_cursor }. */
    ehEvents: (params) => request(`/api/eh/substrate/events?${new URLSearchParams(params)}`),
    /** Create an authored event (the substrate's POST /events body); returns the event. */
    ehCreateEvent: (body) => post('/api/eh/substrate/events', body),
    /** Add a reminder rule to an event. */
    ehAddReminder: (id, body) => post(`/api/eh/substrate/events/${encodeURIComponent(id)}/reminders`, body),
  }
}

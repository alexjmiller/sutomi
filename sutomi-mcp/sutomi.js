// The one place that knows sutomi's HTTP shape. Talks to the tasklists API with the API token
// (sutomi's requireAuth accepts `Authorization: Bearer <SUTOMI_API_TOKEN>` as well as the passkey
// session cookie). Errors carry `status` so a tool can tell "no such list" from "sutomi is down".
export function sutomiClient({ url, token, fetchImpl = fetch }) {
  const base = String(url).replace(/\/$/, '')

  async function request(path, options = {}) {
    const res = await fetchImpl(`${base}/api/tasklists${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    })
    if (!res.ok) {
      const err = new Error(`sutomi ${options.method || 'GET'} /api/tasklists${path} failed (${res.status})`)
      err.status = res.status
      throw err
    }
    return res.json()
  }

  return {
    listLists: () => request(''),
    getList: (id) => request(`/${encodeURIComponent(id)}`),
    /** Merge item ops into a list; sutomi returns the merged list. */
    patchList: (id, body) => request(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  }
}

;(function () {
  async function postJSON(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  const api = {
    async get(key) {
      const r = await postJSON('/api/storage/get', { key })
      return r.data ?? null
    },
    async set(key, value) {
      await postJSON('/api/storage/set', { key, value })
    },
    async delete(key) {
      await postJSON('/api/storage/delete', { key })
    },
  }

  // Attach to window for external scripts (e.g., RedditPlatformBridge.js)
  // Both names: grouped object and direct functions for convenience
  window.RedditStorageBridge = api
  // Also mount under window.reddit.storage for SDK-style access
  const reddit = (window.reddit = window.reddit || {})
  reddit.storage = api
  // New short names
  window.get = api.get
  window.set = api.set
  window.delete = api.delete
  // Notify listeners that storage is ready
  try {
    window.dispatchEvent(new CustomEvent('reddit:storage-ready'))
  } catch (_) {}
})()

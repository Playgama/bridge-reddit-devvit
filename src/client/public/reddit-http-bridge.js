;(function () {
  const asJSONorText = async (res) => {
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) return res.json()
    return res.text()
  }

  const http = {
    async get(path, init) {
      const res = await fetch(path, { method: 'GET', ...(init || {}) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return asJSONorText(res)
    },
    async post(path, body, init) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(init && init.headers ? init.headers : {}) },
        body: body === undefined ? null : JSON.stringify(body),
        ...(init || {}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return asJSONorText(res)
    },
  }

  // Ensure a single global object
  const reddit = (window.reddit = window.reddit || {})
  reddit.get = reddit.get || http.get
  reddit.post = reddit.post || http.post
  // Attach storage bridge if available
  if (window.RedditStorageBridge) {
    reddit.storage = window.RedditStorageBridge
  }

  // Provide a stub storage with queue if storage isn't ready yet
  if (!reddit.storage) {
    const queue = []
    const stub = {
      get: (...args) => new Promise((resolve, reject) => queue.push({ m: 'get', a: args, r: resolve, j: reject })),
      set: (...args) => new Promise((resolve, reject) => queue.push({ m: 'set', a: args, r: resolve, j: reject })),
      delete: (...args) => new Promise((resolve, reject) => queue.push({ m: 'delete', a: args, r: resolve, j: reject })),
    }
    reddit.storage = stub

    function flushIfReady() {
      const real = (window.reddit && window.reddit.storage && window.reddit.storage !== stub) ? window.reddit.storage : (window.RedditStorageBridge || null)
      if (!real) return false
      // Replace stub
      window.reddit.storage = real
      // Flush queued calls (ignore third arg like storage type)
      queue.splice(0).forEach(({ m, a, r, j }) => {
        try {
          const args = m === 'set' ? [a[0], a[1]] : [a[0]]
          Promise.resolve(real[m](...args)).then(r, j)
        } catch (err) {
          j(err)
        }
      })
      return true
    }

    // Listen for explicit ready event
    window.addEventListener('reddit:storage-ready', () => flushIfReady(), { once: false })
    // Fallback: poll briefly in case event was missed
    let attempts = 0
    const iv = setInterval(() => {
      attempts += 1
      if (flushIfReady() || attempts > 200) clearInterval(iv) // ~10s max
    }, 50)
  }
})()

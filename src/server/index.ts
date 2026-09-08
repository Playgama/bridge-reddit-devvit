import express from 'express'
import type { Request, Response } from 'express'
import {
  context,
  createServer,
  getServerPort,
  payments,
  redis,
  reddit,
} from '@devvit/web/server'
import type { PaymentHandlerResponse } from '@devvit/web/server'
import type { Order, UiResponse } from '@devvit/web/shared'

/**
 * Playgama Bridge — Devvit Web server.
 *
 * `/api/*` endpoints implement the HTTP contract of `RedditPlatformBridge`
 * (playgama-bridge.js): the bridge running inside the post webview calls them
 * with fetch(), and this server talks to Reddit (users, posts, comments,
 * payments) and Redis (saves, leaderboards) on the game's behalf.
 *
 * `/internal/*` endpoints are invoked by the Reddit platform itself and are
 * wired up in devvit.json (menu items, triggers, payment fulfillment).
 */

const app = express()
app.use(express.json())

// Number of entries returned by /api/leaderboards/entries.
const LEADERBOARD_ENTRIES_LIMIT = 50

// Title used for posts created from the moderator menu and on app install.
const GAME_POST_TITLE = 'Play the Game!'

// Claimable posts stop accepting claims after this many days.
const CLAIMABLE_TTL_DAYS = 30

// Safety caps, independent of the game's own cooldown rules.
const CLAIM_MAX_PER_POST_PER_DAY = 100
const INBOX_MAX_EVENTS = 200

// ─── helpers ────────────────────────────────────────────────────────────────

// Devvit's Redis is scoped to the app installation (the subreddit), not to the
// user — so every save key must be namespaced by user id or all players share
// one save slot.
function storageKey(userId: string, key: unknown): string {
  return `u:${userId}:${String(key)}`
}

function leaderboardKey(id: string): string {
  return `lb:${id}`
}

// Public profile snapshot shown in leaderboard entries.
function profileKey(userId: string): string {
  return `profile:${userId}`
}

// Data attached to a post created via /api/create-post.
function postDataKey(postId: string): string {
  return `post:${postId}:data`
}

function postPayloadKey(postId: string): string {
  return `post:${postId}:payload`
}

function postAuthorKey(postId: string): string {
  return `post:${postId}:author`
}

// Marks a post created with `claimable: true`; expires with the post's claim window.
function claimableKey(postId: string): string {
  return `claimable:${postId}`
}

function claimCountKey(postId: string): string {
  return `claimable:${postId}:count`
}

function claimDayKey(postId: string, day: string): string {
  return `claimable:${postId}:day:${day}`
}

// Cooldown lock: exists while the player may not claim again.
function claimLockKey(scope: string, postId: string, userId: string): string {
  return scope === 'post' ? `claimable:${postId}:claim:${userId}` : `claim:${userId}`
}

// Claim events waiting for the post author, scored by server time.
function inboxKey(userId: string): string {
  return `inbox:${userId}`
}

// The bridge always sends key arrays; single values are accepted for
// hand-written clients.
function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

// Endpoints that only need the user id resolve it the same way as
// currentPlayer(), so a Reddit API hiccup never turns into a 500.
async function requireUserId(res: Response): Promise<string | null> {
  const userId = (await currentPlayer())?.id ?? null
  if (!userId) {
    res.status(401).json({ error: 'not authorized' })
    return null
  }
  return userId
}

// Resolves the current player id and name from the request context — no
// Reddit API call in the common case, so a Reddit API hiccup never fails a
// request that only needs the identity. Falls back to the Reddit API and then
// to the last known profile snapshot.
async function currentPlayer(): Promise<{ id: string; name: string | null } | null> {
  let id = context.userId ?? null
  let name = context.username ?? null
  if (!id || !name) {
    try {
      const user = await reddit.getCurrentUser()
      if (user) {
        id = user.id
        name = user.username
      }
    } catch (error) {
      console.warn('reddit.getCurrentUser failed, using context:', error)
    }
  }
  if (!id) return null
  if (!name) {
    const profile = parseJson(await redis.get(profileKey(id))) as { name?: string } | null
    name = profile?.name ?? null
  }
  return { id, name }
}

function fail(res: Response, endpoint: string, error: unknown): void {
  console.error(`${endpoint} failed:`, error)
  res.status(500).json({ error: String(error) })
}

// Creates a post running this app in the current subreddit. Any `data` and
// `payload` are stored in Redis under the new post id and handed back to the
// bridge by /api/initialize when that post is opened.
async function createGamePost(options: Record<string, unknown> = {}) {
  const {
    data, payload, title, entry, claimable, ...rest
  } = options

  const post = await reddit.submitCustomPost({
    ...rest,
    title: typeof title === 'string' && title ? title : GAME_POST_TITLE,
    entry: typeof entry === 'string' && entry ? entry : 'default',
    subredditName: context.subredditName!,
  })

  const author = await currentPlayer()
  if (author) {
    await redis.set(postAuthorKey(post.id), author.id)
    // Snapshot the author's public profile so the post card can show it.
    let photo: string | null = null
    try {
      photo = (await (await reddit.getCurrentUser())?.getSnoovatarUrl()) ?? null
    } catch {
      photo = (parseJson(await redis.get(profileKey(author.id))) as { photo?: string | null } | null)?.photo ?? null
    }
    await redis.set(profileKey(author.id), JSON.stringify({ name: author.name, photo }))
  }
  if (data !== undefined) {
    await redis.set(postDataKey(post.id), JSON.stringify(data))
  }
  if (typeof payload === 'string' && payload) {
    await redis.set(postPayloadKey(post.id), payload)
  }
  if (claimable === true) {
    await redis.set(claimableKey(post.id), String(Date.now()), {
      expiration: new Date(Date.now() + CLAIMABLE_TTL_DAYS * 86400000),
    })
  }

  console.log(`post created: ${post.id} (${post.url}) data=${data !== undefined} payload=${payload ?? ''} claimable=${claimable === true}`)
  return post
}

// Claim status of a claimable post for a player, without claiming: whether the
// claim window is still open, whether the player is the author, and whether a
// cooldown lock (either scope) is still running.
async function claimStatus(postId: string, userId: string | null, authorId: string | null, active: boolean) {
  const now = Date.now()
  const count = Number(await redis.get(claimCountKey(postId))) || 0
  const status = (available: boolean, reason?: string, nextClaimAt: number | null = null) => ({
    available, ...(reason ? { reason } : {}), count, nextClaimAt, serverTime: now,
  })

  if (!active) return status(false, 'expired')
  if (!userId) return status(false, 'unauthorized')
  if (authorId === userId) return status(false, 'own')

  const [userLock, postLock] = await redis.mGet([
    claimLockKey('user', postId, userId), claimLockKey('post', postId, userId),
  ])
  if (userLock || postLock) {
    const expires = await Promise.all([
      userLock ? redis.expireTime(claimLockKey('user', postId, userId)) : 0,
      postLock ? redis.expireTime(claimLockKey('post', postId, userId)) : 0,
    ])
    const latest = Math.max(...expires)
    return status(false, 'cooldown', latest > 0 ? latest * 1000 : null)
  }

  return status(true)
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// ─── /api/* — called by the Playgama bridge from the webview ────────────────

// player
app.get('/api/initialize', async (_req: Request, res: Response) => {
  try {
    const result: Record<string, unknown> = { isPlayerAuthorized: false }

    try {
      const user = await reddit.getCurrentUser()
      if (user) {
        result.isPlayerAuthorized = true
        result.playerId = user.id
        result.playerName = user.username
        result.playerPhoto = await user.getSnoovatarUrl()
        await redis.set(profileKey(user.id), JSON.stringify({ name: user.username, photo: result.playerPhoto ?? null }))
      }
    } catch (error) {
      // Reddit API hiccup: stay authorized from the context and use the last known profile.
      console.warn('/api/initialize: reddit.getCurrentUser failed, using context:', error)
      const player = await currentPlayer()
      if (player) {
        result.isPlayerAuthorized = true
        result.playerId = player.id
        result.playerName = player.name
      }
    }

    // Post context — exposed to the game as `bridge.platform.launchData`.
    const { postId, subredditName } = context
    if (postId) {
      result.postId = postId
      result.subredditName = subredditName

      const [data, payload, authorId, claimable] = await redis.mGet([
        postDataKey(postId), postPayloadKey(postId), postAuthorKey(postId), claimableKey(postId),
      ])
      if (data) {
        result.postData = parseJson(data)
      }
      if (payload) {
        result.payload = payload
      }
      if (authorId) {
        result.postAuthorId = authorId
        const profile = parseJson(await redis.get(profileKey(authorId))) as { name?: string; photo?: string | null } | null
        if (profile) {
          result.postAuthor = { name: profile.name ?? null, photo: profile.photo ?? null }
        }
      }
      result.claimable = !!claimable
      if (claimable) {
        result.claim = await claimStatus(postId, (result.playerId as string) ?? null, authorId ?? null, true)
      }

      console.log(`initialize: post=${postId} user=${result.playerName ?? 'guest'} data=${!!data} payload=${payload ?? ''} claimable=${!!claimable}`)
    }

    res.json(result)
  } catch (error) {
    fail(res, '/api/initialize', error)
  }
})

// storage
app.post('/api/storage/get', async (req: Request, res: Response) => {
  try {
    const userId = await requireUserId(res)
    if (!userId) return

    const keys = toArray<unknown>(req.body?.key ?? [])
    const values = keys.length > 0
      ? await redis.mGet(keys.map((key) => storageKey(userId, key)))
      : []

    res.json(values.map((value) => value ?? null))
  } catch (error) {
    fail(res, '/api/storage/get', error)
  }
})

app.post('/api/storage/set', async (req: Request, res: Response) => {
  try {
    const userId = await requireUserId(res)
    if (!userId) return

    const keys = toArray<unknown>(req.body?.key ?? [])
    const values = toArray<unknown>(req.body?.value ?? [])
    if (keys.length > 0) {
      const keyValues: Record<string, string> = {}
      keys.forEach((key, index) => {
        keyValues[storageKey(userId, key)] = String(values[index] ?? '')
      })
      await redis.mSet(keyValues)
    }

    res.json({ success: true })
  } catch (error) {
    fail(res, '/api/storage/set', error)
  }
})

app.post('/api/storage/delete', async (req: Request, res: Response) => {
  try {
    const userId = await requireUserId(res)
    if (!userId) return

    const keys = toArray<unknown>(req.body?.key ?? [])
    if (keys.length > 0) {
      await redis.del(...keys.map((key) => storageKey(userId, key)))
    }

    res.json({ success: true })
  } catch (error) {
    fail(res, '/api/storage/delete', error)
  }
})

// leaderboards
app.post('/api/leaderboards/set-score', async (req: Request, res: Response) => {
  try {
    const user = await currentPlayer()
    if (!user) {
      res.status(401).json({ error: 'not authorized' })
      return
    }

    const { id, score } = req.body ?? {}
    const numericScore = Number(score)
    if (typeof id !== 'string' || !id || !Number.isFinite(numericScore)) {
      res.status(400).json({ error: 'invalid leaderboard id or score' })
      return
    }

    const key = leaderboardKey(id)
    const existing = await redis.zScore(key, user.id)
    if (existing === undefined || numericScore > existing) {
      await redis.zAdd(key, { member: user.id, score: numericScore })
    }

    let photo: string | null = null
    try {
      photo = (await (await reddit.getCurrentUser())?.getSnoovatarUrl()) ?? null
    } catch {
      photo = (parseJson(await redis.get(profileKey(user.id))) as { photo?: string | null } | null)?.photo ?? null
    }
    await redis.set(profileKey(user.id), JSON.stringify({ name: user.name, photo }))

    res.json({ success: true })
  } catch (error) {
    fail(res, '/api/leaderboards/set-score', error)
  }
})

app.get('/api/leaderboards/entries', async (req: Request, res: Response) => {
  try {
    const id = req.query.id
    if (typeof id !== 'string' || !id) {
      res.status(400).json({ error: 'invalid leaderboard id' })
      return
    }

    const members = await redis.zRange(leaderboardKey(id), 0, LEADERBOARD_ENTRIES_LIMIT - 1, {
      reverse: true,
      by: 'rank',
    })
    const profiles = members.length > 0
      ? await redis.mGet(members.map((entry) => profileKey(entry.member)))
      : []

    res.json(members.map((entry, index) => {
      let profile: { name?: string; photo?: string | null } = {}
      try {
        profile = profiles[index] ? JSON.parse(profiles[index]) : {}
      } catch {
        profile = {}
      }
      return {
        id: entry.member,
        name: profile.name ?? '',
        score: entry.score,
        rank: index + 1,
        photo: profile.photo ?? null,
      }
    }))
  } catch (error) {
    fail(res, '/api/leaderboards/entries', error)
  }
})

// social

// Share on Reddit = comment under the post the game is running in.
app.post('/api/share', async (req: Request, res: Response) => {
  try {
    const { text } = req.body?.options ?? {}
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text is required' })
      return
    }

    const { postId } = context
    if (!postId) {
      res.status(400).json({ error: 'no post in context' })
      return
    }

    const comment = await reddit.submitComment({ id: postId, text })
    res.json({ commentId: comment.id, commentUrl: comment.url })
  } catch (error) {
    fail(res, '/api/share', error)
  }
})

app.post('/api/create-post', async (req: Request, res: Response) => {
  try {
    const post = await createGamePost(req.body?.options ?? {})
    res.json({ postId: post.id, postUrl: post.url })
  } catch (error) {
    fail(res, '/api/create-post', error)
  }
})

app.post('/api/join-community', async (_req: Request, res: Response) => {
  try {
    await reddit.subscribeToCurrentSubreddit()
    res.json({ success: true })
  } catch (error) {
    fail(res, '/api/join-community', error)
  }
})

// platform
app.get('/api/server-time', (_req: Request, res: Response) => {
  res.json({ serverTime: Date.now() })
})

// claims — other players act on a post created with `claimable: true`.
app.post('/api/claim', async (req: Request, res: Response) => {
  try {
    const user = await currentPlayer()
    if (!user) {
      res.status(401).json({ error: 'not authorized' })
      return
    }

    const { postId } = context
    if (!postId) {
      res.status(400).json({ error: 'no post in context' })
      return
    }

    const options = req.body?.options ?? {}
    const cooldown = Math.max(0, Math.floor(Number(options.cooldown) || 0))
    const scope = options.scope === 'post' ? 'post' : 'user'
    const now = Date.now()
    const verdict = (granted: boolean, reason?: string, nextClaimAt: number | null = null) => ({
      granted, ...(reason ? { reason } : {}), nextClaimAt, serverTime: now,
    })

    const [claimable, authorId] = await redis.mGet([claimableKey(postId), postAuthorKey(postId)])
    if (!claimable) {
      res.json({ ...verdict(false, 'expired'), count: 0 })
      return
    }
    const count = Number(await redis.get(claimCountKey(postId))) || 0
    if (authorId === user.id) {
      res.json({ ...verdict(false, 'own'), count })
      return
    }

    // Daily safety cap per post — counts granted claims only, so repeated
    // denied attempts cannot exhaust it for everyone else.
    const dayKey = claimDayKey(postId, new Date(now).toISOString().slice(0, 10))
    if ((Number(await redis.get(dayKey)) || 0) >= CLAIM_MAX_PER_POST_PER_DAY) {
      res.json({ ...verdict(false, 'limit'), count })
      return
    }

    // The cooldown lock is a SET NX with the cooldown as TTL (no TTL = one-time
    // claim): whoever creates the key wins, so concurrent claims cannot double-grant.
    const lockKey = claimLockKey(scope, postId, user.id)
    const token = `${now}:${Math.random().toString(36).slice(2)}`
    await redis.set(lockKey, token, {
      nx: true,
      ...(cooldown > 0 ? { expiration: new Date(now + cooldown * 1000) } : {}),
    })
    if ((await redis.get(lockKey)) !== token) {
      const expiresAt = cooldown > 0 ? await redis.expireTime(lockKey) : 0
      res.json({ ...verdict(false, 'cooldown', expiresAt > 0 ? expiresAt * 1000 : null), count })
      return
    }

    const total = await redis.incrBy(claimCountKey(postId), 1)
    await redis.incrBy(dayKey, 1)
    await redis.expire(dayKey, 2 * 86400)

    if (authorId) {
      const event = {
        postId,
        from: { id: user.id, name: user.name },
        at: now,
      }
      const key = inboxKey(authorId)
      await redis.zAdd(key, { member: JSON.stringify(event), score: now })
      await redis.zRemRangeByRank(key, 0, -INBOX_MAX_EVENTS - 1)
    }

    res.json({ ...verdict(true, undefined, cooldown > 0 ? now + cooldown * 1000 : null), count: total })
  } catch (error) {
    fail(res, '/api/claim', error)
  }
})

app.post('/api/inbox', async (req: Request, res: Response) => {
  try {
    const userId = await requireUserId(res)
    if (!userId) return

    const key = inboxKey(userId)
    const ackUntil = Number(req.body?.options?.ackUntil)
    if (Number.isFinite(ackUntil) && ackUntil > 0) {
      await redis.zRemRangeByScore(key, 0, ackUntil)
    }

    const members = await redis.zRange(key, 0, -1, { by: 'rank' })
    res.json({
      events: members.map((entry) => parseJson(entry.member)).filter(Boolean),
      serverTime: Date.now(),
    })
  } catch (error) {
    fail(res, '/api/inbox', error)
  }
})

// payments
app.get('/api/catalog', async (_req: Request, res: Response) => {
  try {
    const { products } = await payments.getProducts()
    res.json(products.map((product) => {
      const amount = product.price?.amount ?? 0
      return {
        id: product.sku,
        title: product.name,
        description: product.description,
        imageURI: product.images?.icon,
        price: `${amount} Gold`,
        priceCurrencyCode: 'Gold',
        priceValue: amount,
      }
    }))
  } catch (error) {
    fail(res, '/api/catalog', error)
  }
})

app.get('/api/purchases', async (_req: Request, res: Response) => {
  try {
    const { orders } = await payments.getOrders({ limit: 100 })
    res.json(orders.map((order) => ({
      id: order.products[0]?.sku ?? order.id,
      orderId: order.id,
      status: order.status,
      products: order.products.map((product) => product.sku),
    })))
  } catch (error) {
    fail(res, '/api/purchases', error)
  }
})

// ─── /internal/* — called by the Reddit platform (see devvit.json) ──────────

app.post(
  '/internal/payments/fulfill',
  async (req: Request, res: Response<PaymentHandlerResponse>) => {
    const order = req.body as Order
    // Reddit handles the transaction; the webview receives the purchase result
    // via @devvit/web/client's purchase() promise and grants the entitlement.
    // Persist anything server-side here if the game needs it.
    console.log('order fulfilled:', order.id, order.products.map((product) => product.sku))
    res.json({ success: true })
  },
)

app.post('/internal/menu/create-post', async (_req: Request, res: Response<UiResponse>) => {
  try {
    const post = await createGamePost()
    res.json({ navigateTo: post, showToast: 'Game post created!' })
  } catch (error) {
    console.error('/internal/menu/create-post failed:', error)
    res.json({ showToast: 'Failed to create game post.' })
  }
})

app.post('/internal/triggers/app-install', async (_req: Request, res: Response) => {
  try {
    await createGamePost()
    console.log('Game post auto-created on app install')
  } catch (error) {
    console.error('app-install auto-post failed:', error)
  }
  res.json({ status: 'ok' })
})

const server = createServer(app)
server.on('error', (error) => console.error('server error:', error))
server.listen(getServerPort())

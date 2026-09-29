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

// Posts stop granting rewards this many days after creation.
const POST_REWARD_TTL_DAYS = 30

// The payload a post was created with outlives its reward window: a shared
// level should still open long after the post stopped granting anything.
const POST_PAYLOAD_TTL_DAYS = 365

// Safety cap, independent of the game's own cooldown rules.
const POST_REWARD_MAX_PER_POST_PER_DAY = 100

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

// Author of a post created via /api/create-post; expires with the post's reward window.
function postAuthorKey(postId: string): string {
  return `post:${postId}:author`
}

// Id of the config `posts` entry the post was created from, handed back to the
// bridge at launch as `post: { id }` and resolved there against the game config.
function postConfigIdKey(postId: string): string {
  return `post:${postId}:id`
}

// The game's own string for this one post, handed back as platform.payload.
function postPayloadKey(postId: string): string {
  return `post:${postId}:payload`
}

function postRewardDayKey(postId: string, day: string): string {
  return `post:${postId}:reward:${day}`
}

// Cooldown lock: exists while the player may not be rewarded again. It is keyed
// by player only, so the wait covers every post of the game at once.
function postRewardLockKey(userId: string): string {
  return `reward:${userId}`
}

// Players rewarded through the author's posts, not yet handed out to the author.
// A hash: field is the config entry id of the post they came through, value is
// how many of them, so a game with several kinds of post can reward each kind.
function postAuthorRewardKey(userId: string): string {
  return `reward:${userId}:counts`
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

// Creates a post running this app in the current subreddit. The author and the
// config entry id are remembered for the post reward window (see
// /api/post-visit-reward).
async function createGamePost(options: Record<string, unknown> = {}, id?: unknown, payload?: unknown) {
  const {
    title, text, entry, ...rest
  } = options

  // `text` is the bridge's canonical content field; games that target Reddit
  // directly may pass `title` instead.
  const postTitle = [title, text].find((value) => typeof value === 'string' && value)

  const post = await reddit.submitCustomPost({
    ...rest,
    title: typeof postTitle === 'string' ? postTitle : GAME_POST_TITLE,
    entry: typeof entry === 'string' && entry ? entry : 'default',
    subredditName: context.subredditName!,
  })

  const author = await currentPlayer()
  if (author) {
    await redis.set(postAuthorKey(post.id), author.id, {
      expiration: new Date(Date.now() + POST_REWARD_TTL_DAYS * 86400000),
    })
    // Snapshot the author's public profile so the post card can show it.
    let photo: string | null = null
    try {
      photo = (await (await reddit.getCurrentUser())?.getSnoovatarUrl()) ?? null
    } catch {
      photo = (parseJson(await redis.get(profileKey(author.id))) as { photo?: string | null } | null)?.photo ?? null
    }
    await redis.set(profileKey(author.id), JSON.stringify({ name: author.name, photo }))
  }
  if (typeof id === 'string' && id) {
    await redis.set(postConfigIdKey(post.id), id, {
      expiration: new Date(Date.now() + POST_REWARD_TTL_DAYS * 86400000),
    })
  }
  if (typeof payload === 'string' && payload) {
    await redis.set(postPayloadKey(post.id), payload, {
      expiration: new Date(Date.now() + POST_PAYLOAD_TTL_DAYS * 86400000),
    })
  }

  console.log(`post created: ${post.id} (${post.url}) id=${id ?? 'none'} payload=${payload ? 'yes' : 'no'}`)
  return post
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

    // The post the game runs in, when it was created by the game itself: the
    // bridge resolves this id against the `posts` section of the game config.
    const { postId } = context
    if (postId) {
      const [configId, payload] = await redis.mGet([postConfigIdKey(postId), postPayloadKey(postId)])
      if (configId || payload) {
        result.post = {
          ...(configId ? { id: configId } : {}),
          ...(payload ? { payload } : {}),
        }
      }
    }

    console.log(`initialize: post=${postId ?? 'none'} user=${result.playerName ?? 'guest'}`)

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

    const requested = req.body?.key ?? []
    const keys = toArray<unknown>(requested)
    const values = keys.length > 0
      ? await redis.mGet(keys.map((key) => storageKey(userId, key)))
      : []

    // A single key answers with a single value, an array of keys with an array.
    res.json(Array.isArray(requested)
      ? values.map((value) => value ?? null)
      : values[0] ?? null)
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
    const post = await createGamePost(req.body?.options ?? {}, req.body?.id, req.body?.payload)
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

// post rewards — a player who came to the game through a post created via
// /api/create-post is rewarded once per cooldown, and the author of that post
// collects one reward per such player.
app.post('/api/post-visit-reward', async (req: Request, res: Response) => {
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

    const cooldown = Math.max(0, Math.floor(Number(req.body?.cooldown) || 0))
    const now = Date.now()

    // The author key expires with the reward window, so no author = no reward.
    const [authorId, configId] = await redis.mGet([postAuthorKey(postId), postConfigIdKey(postId)])
    if (!authorId) {
      res.json({ granted: false, reason: 'expired' })
      return
    }
    if (authorId === user.id) {
      res.json({ granted: false, reason: 'own' })
      return
    }

    // Daily safety cap per post — counts granted rewards only, so repeated
    // denied attempts cannot exhaust it for everyone else.
    const dayKey = postRewardDayKey(postId, new Date(now).toISOString().slice(0, 10))
    if ((Number(await redis.get(dayKey)) || 0) >= POST_REWARD_MAX_PER_POST_PER_DAY) {
      res.json({ granted: false, reason: 'limit' })
      return
    }

    // The cooldown lock is a SET NX with the cooldown as TTL (no TTL = one-time
    // reward): whoever creates the key wins, so concurrent calls cannot double-grant.
    const lockKey = postRewardLockKey(user.id)
    const token = `${now}:${Math.random().toString(36).slice(2)}`
    await redis.set(lockKey, token, {
      nx: true,
      ...(cooldown > 0 ? { expiration: new Date(now + cooldown * 1000) } : {}),
    })
    if ((await redis.get(lockKey)) !== token) {
      res.json({ granted: false, reason: 'cooldown' })
      return
    }

    await redis.incrBy(dayKey, 1)
    await redis.expire(dayKey, 2 * 86400)
    if (configId) {
      await redis.hIncrBy(postAuthorRewardKey(authorId), configId, 1)
    }

    res.json({ granted: true })
  } catch (error) {
    fail(res, '/api/post-visit-reward', error)
  }
})

// Hands the author the players rewarded through their posts since the previous
// call, counted per config entry id, and resets the counters.
app.post('/api/post-author-reward', async (_req: Request, res: Response) => {
  try {
    const userId = await requireUserId(res)
    if (!userId) return

    const key = postAuthorRewardKey(userId)
    const stored = await redis.hGetAll(key)
    const counts: Record<string, number> = {}
    Object.keys(stored ?? {}).forEach((configId) => {
      const count = Number(stored[configId]) || 0
      if (count > 0) {
        counts[configId] = count
      }
    })

    const handedOut = Object.keys(counts)
    if (handedOut.length > 0) {
      await redis.hDel(key, handedOut)
    }

    res.json({ counts })
  } catch (error) {
    fail(res, '/api/post-author-reward', error)
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

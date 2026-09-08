# Playgama Bridge — Reddit (Devvit) Template

Server-side integration layer for running [Playgama Bridge](https://github.com/Playgama/bridge) games as Reddit apps on [Devvit Web](https://developers.reddit.com/docs).

The bridge's `RedditPlatformBridge` has no client SDK: every call it makes goes over HTTP to `/api/*` endpoints served by this app. This template implements that contract and ships a test bench page that exercises every bridge module.

| Bridge module | Reddit implementation |
|---|---|
| `player` | Current Reddit user (id, username, Snoovatar) |
| `storage` | Redis cloud saves, namespaced per user |
| `leaderboards` | In-game leaderboards on Redis sorted sets |
| `social.share` | Comment under the post the game runs in |
| `social.createPost` | New post running this app, with optional data attached |
| `social.joinCommunity` | Subscribe the user to the subreddit |
| `payments` | Reddit Gold products via `@devvit/payments` |
| `social.claim` / `social.getInbox` | Claims on posts created with `claimable: true`; the author reads the events |
| `platform.launchData` | The post the game runs in (`postId`, `subredditName`, `authorId`, `data`) |

## Project layout

```
devvit.json                 Reddit app config: entrypoints, permissions, menu, triggers, payments
products.json               Reddit Gold products (SKU, price tier, accounting type)
src/server/index.ts         Express server: /api/* (bridge contract) + /internal/* (Reddit hooks)
src/client/
  splash.html|ts|css        Inline post view: a Play button that opens the game fullscreen
  index.html + main.ts      The game page. Ships as a bridge test bench — replace with your game
  devvit-payments.ts        Registers the Reddit purchase hook the bridge expects
  public/                   Static files copied to the build as-is
    playgama-bridge.js      Playgama Bridge SDK bundle
    playgama-bridge-config.json
```

Build output goes to `dist/client` (webview) and `dist/server/index.cjs` (server) via `vite` + `@devvit/start`.

## Getting started

```sh
npm install
npm run login          # once: authorize the Devvit CLI with your Reddit account
npm run dev            # playtest: installs to your dev subreddit and watches for changes
npm run deploy         # devvit upload — new version, installable to test subreddits
npm run launch         # devvit publish — submit for review
```

`npm run dev` needs a subreddit you moderate; the CLI creates one on first run or pass it explicitly: `devvit playtest r/your_subreddit`.

## Putting your game in

1. Copy the game build into `src/client/public/` (files there are served from the webview root, e.g. `public/Build/game.wasm` → `/Build/game.wasm`).
2. Replace `src/client/index.html` with the game's HTML. Keep the two script steps at the top of `main.ts`: `registerDevvitPayments()` must run **before** `playgama-bridge.js` loads.
3. Load the bridge the usual way (`<script src="./playgama-bridge.js">` or `loader.ts`) and call `bridge.initialize()`.
4. Put the game title into `splash.html`, the icon into `assets/icon.png`, and rename the app in `devvit.json` (`name`).
5. Register products in **both** `products.json` (Reddit) and `playgama-bridge-config.json` → `payments` (bridge id → Reddit SKU).

Playgama Bridge detects Reddit by the webview hostname (`*.devvit.net`). To run the page locally against mock data set `"forciblySetPlatformId": "reddit"` in the bridge config — note the `/api/*` calls will fail outside Devvit.

## Bridge → server contract

All endpoints are relative to the webview origin; Devvit routes `/api/*` to this server with the current user, post and subreddit in `context`. Errors are returned as non-2xx with `{ "error": string }`.

| Bridge call | Endpoint | Request | Response |
|---|---|---|---|
| `initialize()` | `GET /api/initialize` | — | `{ isPlayerAuthorized, playerId?, playerName?, playerPhoto?, payload?, postId?, subredditName?, postAuthorId?, postAuthor?: { name, photo }, postData?, claimable?, claim? }` |
| `storage.get(keys)` | `POST /api/storage/get` | `{ key: string[] }` | `unknown[]` — values in key order, `null` when missing |
| `storage.set(keys, values)` | `POST /api/storage/set` | `{ key: string[], value: unknown[] }` | `{ success: true }` |
| `storage.delete(keys)` | `POST /api/storage/delete` | `{ key: string[] }` | `{ success: true }` |
| `leaderboards.setScore(id, score)` | `POST /api/leaderboards/set-score` | `{ id, score, isMain }` | `{ success: true }` |
| `leaderboards.getEntries(id)` | `GET /api/leaderboards/entries?id=` | — | `[{ id, name, score, rank, photo }]` |
| `social.share({ text })` | `POST /api/share` | `{ options: { text, ... } }` | `{ commentId, commentUrl }` |
| `social.createPost({ text, data?, payload?, claimable? })` | `POST /api/create-post` | `{ options: { title, data?, payload?, claimable?, ... } }` | `{ postId, postUrl }` → bridge resolves `{ id, url, postId, postUrl }` |
| `social.joinCommunity()` | `POST /api/join-community` | — | `{ success: true }` |
| `platform.getServerTime()` | `GET /api/server-time` | — | `{ serverTime }` (ms) |
| `social.claim({ cooldown?, scope? })` | `POST /api/claim` | `{ options: { cooldown, scope } }` | `{ granted, reason?, count, nextClaimAt, serverTime }` |
| `social.getInbox({ ackUntil? })` | `POST /api/inbox` | `{ options: { ackUntil? } }` | `{ events: [{ postId, from: { id, name }, at }], serverTime }` |
| `payments.getCatalog()` | `GET /api/catalog` | — | `[{ id, title, description, price, priceCurrencyCode, priceValue }]` |
| `payments.getPurchases()` | `GET /api/purchases` | — | `[{ id, orderId, status, products }]` |
| `payments.purchase(id)` | — | handled on the client by `@devvit/web/client` `purchase()` via `window.__playgama_devvit.purchase` | |

Notes:

- **Storage** keys are stored as `u:{userId}:{key}` — Devvit's Redis is per app installation, not per user. Guests (`isPlayerAuthorized: false`) get `401`; the bridge then falls back to local storage on its own.
- **Leaderboards** keep one sorted set per leaderboard id (`lb:{id}`), one score per user, updated only when the new score is higher. `getEntries` returns the top 50 with the player's public profile snapshot taken at `setScore` time.
- **Share** is a comment on the post the game is running in (`context.postId`), posted as the user (`permissions.reddit.scope: "user"`).
- **Post card (splash)**: the inline post view is `splash.html`. If the game attached `data.preview = { title?, button?, image?, accent? }` when creating the post, the splash renders it — title, the author's name and Snoovatar (from the server), the button label — and, for claimable posts, the viewer's claim state (CLAIM / PLAY with a countdown / "Your post · N claimed"). Everything else in `data` is ignored by the splash; without `preview` the default game card is shown.
- **Create post** creates a post with the `default` entrypoint in the current subreddit. `data` (any JSON) and `payload` (string) are stored under the new post id and returned by `/api/initialize` — as `platform.launchData.data` and `platform.payload` — when someone opens that post. This is how user-generated content (levels, challenges) travels between posts. `data` is for the game; the post card is described by `data.preview` (see above); `payload` is the plain-string form for games that only need a short id.
- **Claims**: a post created with `claimable: true` accepts `social.claim()` from other players for 30 days. When such a post is opened, `platform.launchData` carries `claimable: true` and `claim` — the current player's status without claiming (`{ available, reason?, count, nextClaimAt, serverTime }`) — so a splash or the game can show a countdown or "your post · N claimed" before any button is pressed. `claim()` is verified here: the user comes from `context`, the author cannot claim their own post, and the cooldown is a `SET NX` lock keyed by player (`scope: "user"`, default) or by player+post (`scope: "post"`) with the cooldown as TTL — no cooldown means a one-time claim. Each granted claim is queued in the author's inbox (`inbox:{userId}`, last 200 events); the author reads it with `social.getInbox()` and acknowledges with `ackUntil: serverTime` once the reward is applied. Server cap: 100 claims per post per day. What a claim grants is decided by the game on both sides.
- **Payments**: Reddit allows fixed Gold price tiers (5, 25, 50, 100, 150, 250, 500, 1000, 2500). `/internal/payments/fulfill` is where to persist entitlements server-side if the game needs it; by default the webview grants them from the `purchase()` result.

## Example: "help me" energy posts, client only

```js
// Out of energy → ask the community. The post carries `data` for the game.
const { url } = await bridge.social.createPost({ text: 'u/me needs energy!', data: { type: 'energy' }, claimable: true })

// Someone opened that post → claim once per 4 hours, then reward both sides.
const launch = bridge.platform.launchData
if (launch?.claimable && launch.data?.type === 'energy' && bridge.social.isClaimSupported) {
  if (launch.claim && !launch.claim.available) showTimer(launch.claim)          // cooldown / own post / expired
  else {
    const result = await bridge.social.claim({ cooldown: 4 * 3600, scope: 'user' })
    if (result.granted) energy += 1
  }
}

// The author, on next launch: one energy per helper, then acknowledge.
const { events, serverTime } = await bridge.social.getInbox()
energy += events.length
await bridge.social.getInbox({ ackUntil: serverTime })
```

No server code and no `devvit.json` changes are needed for this — the same code runs on every platform where `bridge.social.isClaimSupported` is true.

## Reddit hooks (`/internal/*`)

| Endpoint | Configured in | Purpose |
|---|---|---|
| `/internal/menu/create-post` | `devvit.json` → `menu` | Moderator menu item "Create Game Post" |
| `/internal/triggers/app-install` | `devvit.json` → `triggers.onAppInstall` | Auto-creates the first game post when the app is installed |
| `/internal/payments/fulfill` | `devvit.json` → `payments.endpoints.fulfillOrder` | Order fulfillment callback |

## Useful links

+ [Playgama Bridge](https://github.com/playgama/bridge)
+ [Playgama Bridge documentation](https://wiki.playgama.com/?utm_source=github&utm_medium=bridge)
+ [Devvit Web documentation](https://developers.reddit.com/docs)
+ [Discord](https://discord.gg/pzqd2upxr8)

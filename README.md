# Playgama Bridge — Reddit (Devvit) Template

Server-side integration layer for running [Playgama Bridge](https://github.com/Playgama/bridge) games as Reddit apps on [Devvit Web](https://developers.reddit.com/docs).

The bridge's `RedditPlatformBridge` has no client SDK: every call it makes goes over HTTP to `/api/*` endpoints served by this app. This template implements that contract and ships a test bench page that exercises every bridge module.

| Bridge module | Reddit implementation |
|---|---|
| `player` | Current Reddit user (id, username, Snoovatar) |
| `storage` | Redis cloud saves, namespaced per user |
| `leaderboards` | In-game leaderboards on Redis sorted sets |
| `social.share` | Comment under the post the game runs in |
| `social.createPost(id, payload?)` | New post running this app, described by an entry of the config `posts` section, with an optional payload string for this one post |
| `social.joinCommunity` | Subscribe the user to the subreddit |
| `payments` | Reddit Gold products via `@devvit/payments` |
| `platform.launchSource` / `platform.payload` | `post` when the game was opened from a post it created, and the payload that post was created with |
| `platform.data` | What the launch carries: the platform's own launch parameters, plus `postId` when the game was opened from one of its posts |
| `social.getPostReward` | Everything waiting for the player: the reward for the post they came through and what their own posts earned, in one array |
| `platform.getServerTime` | Server clock of this app, so the game never trusts the device |

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
| `initialize()` | `GET /api/initialize` | — | `{ isPlayerAuthorized, playerId?, playerName?, playerPhoto?, post?: { id?, payload? } }` |
| `storage.get(key)` | `POST /api/storage/get` | `{ key: string }` (an array is also accepted) | the value, `null` when missing (an array of values for an array of keys) |
| `storage.set(key, value)` | `POST /api/storage/set` | `{ key: string, value: unknown }` (arrays are also accepted) | `{ success: true }` |
| `storage.delete(key)` | `POST /api/storage/delete` | `{ key: string }` (an array is also accepted) | `{ success: true }` |
| `leaderboards.setScore(id, score)` | `POST /api/leaderboards/set-score` | `{ id, score, isMain }` | `{ success: true }` |
| `leaderboards.getEntries(id)` | `GET /api/leaderboards/entries?id=` | — | `[{ id, name, score, rank, photo }]` |
| `social.share({ text })` | `POST /api/share` | `{ options: { text, ... } }` | `{ commentId, commentUrl }` |
| `social.createPost(id, payload?)` | `POST /api/create-post` | `{ options: { title, ... }, id, payload? }` — the content the platform needs, with the config entry id and the payload beside it | `{ postId, postUrl }` |
| `social.getPostReward()`, the post side | `POST /api/post-visit-reward` | `{ cooldown }` from the config entry | `{ granted, reason? }` |
| `social.getPostReward()`, the author side | `POST /api/post-author-reward` | — | `{ counts: { [postId]: number } }` |
| `social.joinCommunity()` | `POST /api/join-community` | — | `{ success: true }` |
| `platform.getServerTime()` | `GET /api/server-time` | — | `{ serverTime }` (ms) |
| `payments.getCatalog()` | `GET /api/catalog` | — | `[{ id, title, description, price, priceCurrencyCode, priceValue }]` |
| `payments.getPurchases()` | `GET /api/purchases` | — | `[{ id, orderId, status, products }]` |
| `payments.purchase(id)` | — | handled on the client by `@devvit/web/client` `purchase()` via `window.__playgama_devvit.purchase` | |

Notes:

- **Storage** keys are stored as `u:{userId}:{key}` — Devvit's Redis is per app installation, not per user. The bridge asks for one key per request and gets one value back; an array of keys answers with an array of values, in key order. Guests (`isPlayerAuthorized: false`) get `401`; the bridge then falls back to local storage on its own.
- **Leaderboards** keep one sorted set per leaderboard id (`lb:{id}`), one score per user, updated only when the new score is higher. `getEntries` returns the top 50 with the player's public profile snapshot taken at `setScore` time.
- **Share** is a comment on the post the game is running in (`context.postId`), posted as the user (`permissions.reddit.scope: "user"`).
- **Create post** creates a post with the `default` entrypoint in the current subreddit, titled by the `text` of the config entry. The entry id and the author are remembered for 30 days, which is the window post rewards use. When someone opens that post, `/api/initialize` returns the id and the bridge hands the whole entry to the game as `platform.data`.
- **Post card (splash)**: the inline post view is `splash.html` — a title and a Play button that opens the game fullscreen, plus the viewer's Snoovatar read from `/api/initialize`. Put the game's own title and art in `splash.html` and `splash.css`.
- **Payments**: Reddit allows fixed Gold price tiers (5, 25, 50, 100, 150, 250, 500, 1000, 2500). `/internal/payments/fulfill` is where to persist entitlements server-side if the game needs it; by default the webview grants them from the `purchase()` result.

## Posts

A post is declared once in `playgama-bridge-config.json` and created by its id, so the game carries no texts and the publisher edits them without a rebuild:

```json
"posts": [
    {
        "id": "gift",
        "text": "I'm sharing coins!",
        "rewards": [
            { "id": "coins", "amount": 100 },
            { "id": "coins", "amount": 50, "type": "author" }
        ],
        "rewardCooldown": 14400,
        "reddit": { "text": "🎁 Free coins inside" }
    }
]
```

`text` becomes the Reddit post title and the `reddit` block overrides the common fields on Reddit. `rewards` follows the shape the tasks module uses: `id` and `amount` are opaque to the bridge, the game decides what they mean, and `type` says who gets the reward — the player who came through the post (the default) or its author, once per such player. The same code runs on every platform:

```js
// share a post
if (bridge.social.isCreatePostSupported) {
    const { url } = await bridge.social.createPost('gift')
}

// one call covers both sides and always resolves: an empty array simply means
// nothing is waiting — no reason to tell the player anything
if (bridge.social.isPostRewardSupported) {
    const rewards = await bridge.social.getPostReward()
    rewards.forEach(({ id, amount }) => grant(id, amount))
}
```

Only the entry id and the payload travel to this server; the values are resolved from the config on the client, so editing the config changes the behaviour of posts that already exist. The payload is the game's own string for one post — a shared level, a seed, a challenge — stored for a year and handed back as `platform.payload` when someone opens that post. A game recognises this kind of launch through `platform.launchSource`, the same field that already reports notification launches.

`/api/post-visit-reward` is verified here: the user comes from `context`, the author is never rewarded on their own post, and the wait is a `SET NX` lock keyed by player with the cooldown as TTL. The lock is per player, not per post, so a player who opens ten posts in a row is rewarded once. No cooldown means a one-time reward. Rewards stop 30 days after the post was created, and a post grants at most 100 per day. Every granted reward increments the author's counter for the config entry the post was created from, kept as a hash under `reward:{userId}:counts`. `/api/post-author-reward` hands the counters out and clears them, so a game with several kinds of post rewards each kind on its own terms.

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

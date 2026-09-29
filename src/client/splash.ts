import { requestExpandedMode } from '@devvit/web/client'

// The splash is the inline post view; the game itself runs in the `game`
// entrypoint (see devvit.json) which opens in expanded (fullscreen) mode.
//
// It reads /api/initialize — the same endpoint the bridge uses — for the viewer
// and for the id of the `posts` config entry this post was created from. The
// card is then drawn from that entry's `card` block, so what a post looks like
// is declared next to everything else about it and needs no code here.

interface PostCard {
  title?: string
  button?: string
  image?: string
  accent?: string
}

interface PostEntry {
  id: string
  text?: string
  card?: PostCard
  [key: string]: unknown
}

interface InitializeResponse {
  playerName?: string
  playerPhoto?: string
  post?: { id?: string }
}

const PLATFORM_ID = 'reddit'

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

function showPlayer({ playerName, playerPhoto }: InitializeResponse): void {
  if (!playerPhoto) return

  const wrap = el('splash-player')
  const avatar = el<HTMLImageElement>('splash-player-avatar')
  const name = el('splash-player-name')
  if (!wrap || !avatar) return

  avatar.onload = () => { wrap.hidden = false }
  avatar.onerror = () => { wrap.hidden = true }
  avatar.src = playerPhoto
  if (name) name.textContent = playerName ? `u/${playerName}` : ''
}

// The entry as the bridge resolves it: the platform block wins over the common
// fields, every other platform's block is ignored.
async function readPostEntry(id: string): Promise<PostEntry | null> {
  try {
    const response = await fetch('./playgama-bridge-config.json')
    if (!response.ok) return null

    const config = await response.json() as { posts?: PostEntry[] }
    const entry = config.posts?.find((post) => post?.id === id)
    if (!entry) return null

    const platformData = entry[PLATFORM_ID]
    return platformData && typeof platformData === 'object'
      ? { ...entry, ...platformData as PostEntry }
      : entry
  } catch (error) {
    console.warn('Could not read the posts config:', error)
    return null
  }
}

function drawCard(entry: PostEntry): void {
  const card = entry.card ?? {}
  const title = card.title ?? entry.text
  const root = el('splash')
  const image = el<HTMLImageElement>('splash-image')

  if (root && card.accent) root.style.setProperty('--accent', card.accent)
  if (title) {
    const node = el('splash-title')
    if (node) node.textContent = title
  }
  if (card.button) {
    const button = el('play-button')
    if (button) button.textContent = card.button
  }
  if (image && card.image) {
    image.onload = () => { image.hidden = false }
    image.onerror = () => { image.hidden = true }
    image.src = card.image
  }
}

async function applyPostContext(): Promise<void> {
  let response: InitializeResponse
  try {
    const result = await fetch('/api/initialize')
    if (!result.ok) return
    response = await result.json() as InitializeResponse
  } catch (error) {
    console.warn('Could not read the post context:', error)
    return
  }

  showPlayer(response)

  const postId = response.post?.id
  if (!postId) return

  const entry = await readPostEntry(postId)
  if (entry) drawCard(entry)
}

el('play-button')?.addEventListener('click', async (event) => {
  try {
    await requestExpandedMode(event, 'game')
  } catch (error) {
    console.error('Failed to enter expanded mode:', error)
  }
})

applyPostContext()

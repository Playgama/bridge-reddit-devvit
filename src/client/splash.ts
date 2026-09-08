import { requestExpandedMode } from '@devvit/web/client'

// The splash is the inline post view; the game itself runs in the `game`
// entrypoint (see devvit.json) which opens in expanded (fullscreen) mode.
//
// It reads /api/initialize — the same endpoint the bridge uses — and renders
// the post card from what the game attached when it created the post:
//   data.preview = { title?, button?, image?, accent? }   (all optional)
// The author (name, Snoovatar) and the viewer's claim state come from the
// server, so the game never has to describe them.

interface ClaimStatus {
  available: boolean
  reason?: 'unauthorized' | 'own' | 'cooldown' | 'expired' | 'limit'
  count: number
  nextClaimAt: number | null
  serverTime: number
}

interface Preview {
  title?: string
  button?: string
  image?: string
  accent?: string
}

interface InitializeResponse {
  playerName?: string
  playerPhoto?: string
  postData?: { preview?: Preview } & Record<string, unknown>
  postAuthor?: { name: string | null; photo: string | null }
  claimable?: boolean
  claim?: ClaimStatus
}

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null
}

function setText(id: string, text: string): void {
  const node = el(id)
  if (!node) return
  node.textContent = text
  node.hidden = false
}

function setImage(id: string, src?: string | null): void {
  const img = el<HTMLImageElement>(id)
  if (!img || !src) return
  img.onload = () => { img.hidden = false }
  img.onerror = () => { img.hidden = true }
  img.src = src
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

// Live countdown to `nextClaimAt` on the server clock; flips to ready at zero.
function startCountdown(claim: ClaimStatus, onReady: () => void): void {
  const offset = claim.serverTime - Date.now()
  const target = claim.nextClaimAt ?? 0
  const tick = (): void => {
    const remaining = target - (Date.now() + offset)
    if (remaining <= 0) {
      onReady()
      return
    }
    setText('splash-timer', formatCountdown(remaining))
    window.setTimeout(tick, 1000)
  }
  tick()
}

function showClaimReady(button: string): void {
  const timer = el('splash-timer')
  if (timer) timer.hidden = true
  setText('play-button', button)
  setText('splash-hint', 'Open the game to claim')
}

function applyClaimState(claim: ClaimStatus | undefined, button: string): void {
  if (!claim || claim.available) {
    showClaimReady(button)
    return
  }

  setText('play-button', 'PLAY')
  switch (claim.reason) {
    case 'own':
      setText('splash-hint', `Your post · ${claim.count} player(s) claimed it`)
      break
    case 'cooldown':
      if (claim.nextClaimAt) {
        setText('splash-hint', 'Not ready yet. Next claim in')
        startCountdown(claim, () => showClaimReady(button))
      } else {
        setText('splash-hint', 'Already claimed')
      }
      break
    case 'unauthorized':
      setText('splash-hint', 'Log in to Reddit to claim')
      break
    default:
      setText('splash-hint', 'This offer is no longer available')
  }
}

function render(response: InitializeResponse): void {
  const {
    playerName, playerPhoto, postData, postAuthor, claimable, claim,
  } = response

  // The viewer, as a character in the corner.
  if (playerPhoto) {
    setImage('splash-player-avatar', playerPhoto)
    const wrap = el('splash-player')
    const avatar = el<HTMLImageElement>('splash-player-avatar')
    if (wrap && avatar) {
      avatar.onload = () => { wrap.hidden = false }
    }
    setText('splash-player-name', playerName ? `u/${playerName}` : '')
  }

  const preview = postData?.preview
  if (!preview) return

  const root = el('splash')
  if (root) {
    root.classList.add('splash-container--post')
    if (preview.accent) root.style.setProperty('--accent', preview.accent)
  }
  if (preview.title) setText('splash-title', preview.title)
  setImage('splash-image', preview.image ?? postAuthor?.photo)
  if (postAuthor?.name) setText('splash-subtitle', `u/${postAuthor.name}`)

  if (claimable) {
    applyClaimState(claim, preview.button ?? 'CLAIM')
  } else if (preview.button) {
    setText('play-button', preview.button)
  }
}

async function applyPostContext(): Promise<void> {
  try {
    const response = await fetch('/api/initialize')
    if (!response.ok) return
    render((await response.json()) as InitializeResponse)
  } catch (error) {
    console.warn('Could not read post context:', error)
  }
}

el('play-button')?.addEventListener('click', async (event) => {
  try {
    await requestExpandedMode(event, 'game')
  } catch (error) {
    console.error('Failed to enter expanded mode:', error)
  }
})

applyPostContext()

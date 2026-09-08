import { el, pretty, setText } from '../util'

export function bindPlayerSection(bridge: PlaygamaBridge): void {
    const refresh = (): void => {
        const p = bridge.player
        setText('player-auth-supported', p.isAuthorizationSupported)
        setText('player-authorized', p.isAuthorized)
        setText('player-id', p.id)
        setText('player-name', p.name)
        setText('player-photos', p.photos)
        el('player-extra').textContent = p.extra ? pretty(p.extra) : '—'
    }
    refresh()

    el<HTMLButtonElement>('player-authorize-btn').addEventListener('click', async () => {
        try {
            await bridge.player.authorize()
        } catch (error) {
            console.warn('player.authorize failed', error)
        } finally {
            refresh()
        }
    })
}

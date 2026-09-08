import { el } from '../util'

// The v2 SDK removed the standalone `game` module. The one method that
// mattered — reporting in-game loading progress — moved to the top-level
// `bridge.setGameLoadingProgress`. Visibility/pause state moved to
// `bridge.platform.isPaused` + `bridge.on('pause_state_changed', ...)`.
export function bindGameSection(bridge: PlaygamaBridge): void {
    el<HTMLButtonElement>('game-progress-btn').addEventListener('click', () => {
        const raw = el<HTMLInputElement>('game-progress-input').value
        const percent = Number(raw)
        if (Number.isFinite(percent)) {
            bridge.setGameLoadingProgress(percent)
        }
    })
}

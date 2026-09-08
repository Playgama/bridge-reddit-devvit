import { el, pretty, setText } from '../util'

export function bindLeaderboardsSection(bridge: PlaygamaBridge): void {
    const lb = bridge.leaderboards
    setText('lb-type', lb.type)

    const out = el('lb-output')
    const idInput = el<HTMLInputElement>('lb-id')
    const scoreInput = el<HTMLInputElement>('lb-score')

    el<HTMLButtonElement>('lb-set-score-btn').addEventListener('click', async () => {
        try {
            await lb.setScore(idInput.value, scoreInput.value)
            out.textContent = 'setScore: ok'
        } catch (error) {
            out.textContent = `setScore failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('lb-get-entries-btn').addEventListener('click', async () => {
        try {
            const entries = await lb.getEntries(idInput.value)
            out.textContent = pretty(entries)
        } catch (error) {
            out.textContent = `getEntries failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('lb-show-popup-btn').addEventListener('click', async () => {
        try {
            await lb.showNativePopup(idInput.value)
            out.textContent = 'showNativePopup: ok'
        } catch (error) {
            out.textContent = `showNativePopup failed: ${(error as Error).message ?? error}`
        }
    })
}

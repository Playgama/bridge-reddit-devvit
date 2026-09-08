import { el, pretty } from '../util'

export function bindAchievementsSection(bridge: PlaygamaBridge): void {
    const a = bridge.achievements

    const out = el('ach-output')

    el<HTMLButtonElement>('ach-list-btn').addEventListener('click', async () => {
        try {
            out.textContent = pretty(await a.getAchievements())
        } catch (error) {
            out.textContent = `getAchievements failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('ach-unlock-btn').addEventListener('click', async () => {
        const id = el<HTMLInputElement>('ach-id').value
        try {
            out.textContent = pretty(await a.unlock(id))
        } catch (error) {
            out.textContent = `unlock failed: ${(error as Error).message ?? error}`
        }
    })
}

import { el, parseJsonLoose } from '../util'

export function bindAnalyticsSection(bridge: PlaygamaBridge): void {
    const out = el('an-output')

    el<HTMLButtonElement>('an-send-btn').addEventListener('click', () => {
        const event = el<HTMLInputElement>('an-event').value.trim()
        if (!event) {
            out.textContent = 'event name required'
            return
        }
        const dataRaw = el<HTMLInputElement>('an-data').value
        const parsed = parseJsonLoose(dataRaw)
        const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {}
        try {
            bridge.analytics.send(event, data)
            out.textContent = `sent: ${event}`
        } catch (error) {
            out.textContent = `failed: ${(error as Error).message ?? error}`
        }
    })
}

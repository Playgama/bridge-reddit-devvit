import { appendLog, el, formatValue } from '../util'

const TRACKED_EVENTS: EventName[] = [
    'interstitial_state_changed',
    'rewarded_state_changed',
    'banner_state_changed',
    'advanced_banners_state_changed',
    'audio_state_changed',
    'pause_state_changed',
    'orientation_state_changed',
    'screen_size_changed',
    'platform_message_sent',
    'platform_storage_availability_changed',
]

export function bindEventsSection(bridge: PlaygamaBridge): void {
    const log = el('events-log')

    for (const event of TRACKED_EVENTS) {
        bridge.on(event, (...args: unknown[]) => {
            const payload = args.length === 0
                ? ''
                : args.length === 1
                    ? ` ${formatValue(args[0])}`
                    : ` ${args.map(formatValue).join(', ')}`
            appendLog(log, `bridge.${event}${payload}`)
        })
    }

    el<HTMLButtonElement>('events-clear-btn').addEventListener('click', () => {
        log.textContent = ''
    })
}

import { el, parseJsonLoose, pretty, setStatus, setText } from '../util'

export function bindPlatformSection(bridge: PlaygamaBridge): void {
    const p = bridge.platform

    setText('platform-id', p.id)
    setText('platform-language', p.language)
    setText('platform-payload', p.payload)
    setText('platform-launch-data', p.launchData === null || p.launchData === undefined ? '—' : pretty(p.launchData))
    setText('platform-tld', p.tld)
    setText('platform-launch-source', p.launchSource)
    setText('platform-audio', p.isAudioEnabled)
    setText('platform-paused', p.isPaused)
    setText('platform-external-calls', p.isExternalCallsSupported)
    setText('platform-external-links', p.isExternalLinksAllowed)

    document.querySelectorAll<HTMLButtonElement>('#platform-section .action[data-message]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const message = btn.dataset.message as PlatformMessage | undefined
            if (!message) return
            try {
                await p.sendMessage(message)
                setStatus('platform-send-message-status', `sent: ${message}`, 'ok')
            } catch (error) {
                setStatus('platform-send-message-status', `failed: ${(error as Error).message ?? error}`, 'err')
            }
        })
    })

    el<HTMLButtonElement>('platform-server-time-btn').addEventListener('click', async () => {
        try {
            const time = await p.getServerTime()
            setText('platform-server-time', `${time} (${new Date(Number(time)).toISOString()})`)
        } catch (error) {
            setText('platform-server-time', `failed: ${(error as Error).message ?? error}`)
        }
    })

    el<HTMLButtonElement>('platform-send-custom-btn').addEventListener('click', async () => {
        const id = el<HTMLInputElement>('platform-custom-id').value
        const optionsRaw = el<HTMLInputElement>('platform-custom-options').value
        const options = parseJsonLoose(optionsRaw) as Record<string, unknown> | undefined
        try {
            const result = await p.sendCustomMessage(id, options)
            setStatus('platform-send-message-status', `custom ok: ${pretty(result)}`, 'ok')
        } catch (error) {
            setStatus('platform-send-message-status', `custom failed: ${(error as Error).message ?? error}`, 'err')
        }
    })
}

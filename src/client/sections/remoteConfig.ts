import { el, parseJsonLoose, pretty, setText } from '../util'

export function bindRemoteConfigSection(bridge: PlaygamaBridge): void {
    setText('rc-supported', bridge.remoteConfig.isSupported)

    const out = el('rc-output')

    el<HTMLButtonElement>('rc-set-context-btn')?.addEventListener('click', () => {
        const raw = el<HTMLInputElement>('rc-context').value
        const parameters = (parseJsonLoose(raw) as Record<string, unknown>) ?? {}
        try {
            bridge.remoteConfig.setContext(parameters)
            out.textContent = `setContext: ok\n${pretty(parameters)}`
        } catch (error) {
            out.textContent = `setContext failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('rc-get-btn').addEventListener('click', async () => {
        try {
            out.textContent = pretty(await bridge.remoteConfig.get())
        } catch (error) {
            out.textContent = `failed: ${(error as Error).message ?? error}`
        }
    })
}

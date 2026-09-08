import { el, setText } from '../util'

export function bindClipboardSection(bridge: PlaygamaBridge): void {
    setText('clip-supported', bridge.clipboard.isSupported)

    const input = el<HTMLInputElement>('clip-input')
    const out = el('clip-output')

    el<HTMLButtonElement>('clip-read-btn').addEventListener('click', async () => {
        try {
            const text = await bridge.clipboard.read()
            input.value = text
            out.textContent = 'read: ok'
        } catch (error) {
            out.textContent = `read failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('clip-write-btn').addEventListener('click', async () => {
        try {
            await bridge.clipboard.write(input.value)
            out.textContent = 'write: ok'
        } catch (error) {
            out.textContent = `write failed: ${(error as Error).message ?? error}`
        }
    })
}

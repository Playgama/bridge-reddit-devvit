// Mirrors the official Playgama Bridge sample: dynamically inject the SDK
// <script>, wait for onload, then resolve with window.bridge.

const SCRIPT_SRC = './playgama-bridge.js'

export function loadBridge(): Promise<PlaygamaBridge> {
    if (typeof window.bridge !== 'undefined') {
        return Promise.resolve(window.bridge)
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = false
        script.onload = () => {
            if (typeof window.bridge === 'undefined') {
                reject(new Error('window.bridge missing after playgama-bridge.js loaded'))
                return
            }
            resolve(window.bridge)
        }
        script.onerror = () => reject(new Error(`Failed to load ${SCRIPT_SRC}`))
        document.body.appendChild(script)
    })
}

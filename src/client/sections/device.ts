import { appendLog, el, pretty, setText } from '../util'

export function bindDeviceSection(bridge: PlaygamaBridge): void {
    const refresh = (): void => {
        setText('device-type', bridge.device.type)
        setText('device-os', bridge.device.os)
        setText('device-orientation', bridge.device.orientation)
        setText('device-safearea', pretty(bridge.device.safeArea))
    }
    refresh()

    const orientationLog = el('device-orientation-log')
    const screenLog = el('device-screen-log')

    bridge.on('orientation_state_changed', (orientation: DeviceOrientation) => {
        appendLog(orientationLog, `→ ${orientation}`)
        refresh()
    })

    bridge.on('screen_size_changed', (size: unknown) => {
        appendLog(screenLog, `→ ${pretty(size)}`)
        refresh()
    })
}

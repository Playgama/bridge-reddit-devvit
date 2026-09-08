import './styles.css'
import { loadBridge } from './loader'
import { registerDevvitPayments } from './devvit-payments'
import { bindPlatformSection } from './sections/platform'
import { bindPlayerSection } from './sections/player'
import { bindGameSection } from './sections/game'
import { bindDeviceSection } from './sections/device'
import { bindStorageSection } from './sections/storage'
import { bindAdvertisementSection } from './sections/advertisement'
import { bindSocialSection } from './sections/social'
import { bindLeaderboardsSection } from './sections/leaderboards'
import { bindPaymentsSection } from './sections/payments'
import { bindAchievementsSection } from './sections/achievements'
import { bindRemoteConfigSection } from './sections/remoteConfig'
import { bindClipboardSection } from './sections/clipboard'
import { bindAnalyticsSection } from './sections/analytics'
import { bindEventsSection } from './sections/events'
import { el } from './util'

async function bootstrap(): Promise<void> {
    setMeta('status', 'loading')

    registerDevvitPayments()
    const bridge = await loadBridge()
    setMeta('version', bridge.version)

    setMeta('status', 'initializing')
    try {
        await bridge.initialize()
    } catch (error) {
        setMeta('status', 'init failed')
        console.error('initialize() failed', error)
        return
    }

    setMeta('status', 'ready')
    setMeta('platform', bridge.platform.id)
    setMeta('engine', bridge.engine)

    bindPlatformSection(bridge)
    bindPlayerSection(bridge)
    bindGameSection(bridge)
    bindDeviceSection(bridge)
    bindStorageSection(bridge)
    bindAdvertisementSection(bridge)
    bindSocialSection(bridge)
    bindLeaderboardsSection(bridge)
    bindPaymentsSection(bridge)
    bindAchievementsSection(bridge)
    bindRemoteConfigSection(bridge)
    bindClipboardSection(bridge)
    bindAnalyticsSection(bridge)
    bindEventsSection(bridge)

    bridge.platform.sendMessage('game_ready').catch(() => undefined)
}

function setMeta(kind: 'version' | 'platform' | 'engine' | 'status', text: string): void {
    const node = el(`meta-${kind}`)
    const strong = node.querySelector('strong')
    if (strong) {
        strong.textContent = text
    } else {
        node.textContent = text
    }
}

void bootstrap()

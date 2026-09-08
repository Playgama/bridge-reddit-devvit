import { appendLog, el, setText } from '../util'

export function bindAdvertisementSection(bridge: PlaygamaBridge): void {
    const a = bridge.advertisement

    const refreshStatic = (): void => {
        setText('ad-banner-supported', a.isBannerSupported)
        setText('ad-banner-state', a.bannerState)
        setText('ad-interstitial-supported', a.isInterstitialSupported)
        setText('ad-interstitial-state', a.interstitialState)
        setText('ad-rewarded-supported', a.isRewardedSupported)
        setText('ad-rewarded-state', a.rewardedState)
        setText('ad-rewarded-placement', a.rewardedPlacement)
        setText('ad-advanced-supported', a.isAdvancedBannersSupported)
        setText('ad-min-delay', a.minimumDelayBetweenInterstitial)
    }
    refreshStatic()
    el<HTMLInputElement>('ad-min-delay-input').value = String(a.minimumDelayBetweenInterstitial)

    const log = el('ad-event-log')

    bridge.on('banner_state_changed', (state: BannerState) => {
        setText('ad-banner-state', state)
        appendLog(log, `banner → ${state}`)
    })
    bridge.on('interstitial_state_changed', (state: InterstitialState) => {
        setText('ad-interstitial-state', state)
        appendLog(log, `interstitial → ${state}`)
    })
    bridge.on('rewarded_state_changed', (state: RewardedState) => {
        setText('ad-rewarded-state', state)
        setText('ad-rewarded-placement', a.rewardedPlacement)
        appendLog(log, `rewarded → ${state}`)
    })
    bridge.on('advanced_banners_state_changed', (state: unknown) => {
        appendLog(log, `advanced → ${JSON.stringify(state)}`)
    })

    el<HTMLButtonElement>('ad-set-min-delay').addEventListener('click', () => {
        const value = el<HTMLInputElement>('ad-min-delay-input').value
        a.setMinimumDelayBetweenInterstitial(Number(value))
        setText('ad-min-delay', a.minimumDelayBetweenInterstitial)
    })

    el<HTMLButtonElement>('ad-show-banner').addEventListener('click', () => {
        const position = el<HTMLSelectElement>('ad-banner-position').value as BannerPosition
        const placement = el<HTMLInputElement>('ad-banner-placement').value || null
        a.showBanner(position, placement)
    })
    el<HTMLButtonElement>('ad-hide-banner').addEventListener('click', () => a.hideBanner())

    el<HTMLButtonElement>('ad-preload-interstitial').addEventListener('click', () => {
        const placement = el<HTMLInputElement>('ad-interstitial-placement').value || null
        a.preloadInterstitial(placement)
    })
    el<HTMLButtonElement>('ad-show-interstitial').addEventListener('click', () => {
        const placement = el<HTMLInputElement>('ad-interstitial-placement').value || null
        a.showInterstitial(placement)
    })

    el<HTMLButtonElement>('ad-preload-rewarded').addEventListener('click', () => {
        const placement = el<HTMLInputElement>('ad-rewarded-placement-input').value || null
        a.preloadRewarded(placement)
    })
    el<HTMLButtonElement>('ad-show-rewarded').addEventListener('click', () => {
        const placement = el<HTMLInputElement>('ad-rewarded-placement-input').value || null
        a.showRewarded(placement)
    })

    el<HTMLButtonElement>('ad-show-advanced').addEventListener('click', () => {
        const placement = el<HTMLInputElement>('ad-advanced-placement').value
        if (placement) a.showAdvancedBanners(placement)
    })
    el<HTMLButtonElement>('ad-hide-advanced').addEventListener('click', () => a.hideAdvancedBanners())

    el<HTMLButtonElement>('ad-check-adblock').addEventListener('click', async () => {
        try {
            const detected = await a.checkAdBlock()
            setText('ad-adblock', detected)
        } catch (error) {
            setText('ad-adblock', `failed: ${(error as Error).message ?? error}`)
        }
    })
}

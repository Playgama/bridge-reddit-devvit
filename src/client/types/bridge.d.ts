// Type declarations for the Playgama Bridge global (`window.bridge`).
// Mirrors the public surface of `playgama/bridge` v2.0.0 (main branch).

export {}

declare global {
    type PlatformId =
        | 'vk' | 'ok' | 'yandex' | 'crazy_games'
        | 'game_distribution' | 'playgama' | 'standalone' | 'playdeck' | 'telegram'
        | 'y8' | 'lagged' | 'facebook' | 'poki' | 'mock' | 'qa_tool'
        | 'msn' | 'microsoft_store' | 'huawei' | 'gamepush'
        | 'discord' | 'jio_games' | 'youtube' | 'portal' | 'reddit'
        | 'xiaomi' | 'tiktok' | 'dlightek' | 'gamesnacks' | 'samsung'

    type ModuleName =
        | 'core' | 'platform' | 'player' | 'storage'
        | 'advertisement' | 'social' | 'device' | 'leaderboards'
        | 'payments' | 'remote_config' | 'clipboard' | 'achievements'
        | 'analytics' | 'daily_rewards' | 'tasks' | 'cross_promo'

    type EventName =
        | 'interstitial_state_changed' | 'rewarded_state_changed'
        | 'banner_state_changed' | 'advanced_banners_state_changed'
        | 'audio_state_changed'
        | 'pause_state_changed' | 'orientation_state_changed'
        | 'screen_size_changed' | 'platform_message_sent'
        | 'platform_storage_availability_changed'

    type LaunchSource = 'launcher' | 'notification' | 'unknown'

    type InterstitialState = 'loading' | 'opened' | 'closed' | 'failed'
    type RewardedState = 'loading' | 'opened' | 'closed' | 'failed' | 'rewarded'
    type BannerState = 'loading' | 'shown' | 'hidden' | 'failed'
    type BannerPosition = 'top' | 'bottom'
    type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'tv'
    type DeviceOs = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other'
    type DeviceOrientation = 'portrait' | 'landscape'
    type LeaderboardType = 'not_available' | 'in_game' | 'native' | 'native_popup'

    type PlatformMessage =
        | 'game_ready' | 'level_started' | 'level_completed' | 'level_failed'
        | 'level_paused' | 'level_resumed' | 'in_game_loading_started'
        | 'in_game_loading_stopped' | 'gameplay_started' | 'gameplay_stopped'
        | 'player_got_achievement'

    interface Emitter<E extends string = string> {
        on(event: E, listener: (...args: any[]) => void): void
        off(event: E, listener?: (...args: any[]) => void): void
        once(event: E, listener: (...args: any[]) => void): void
        emit(event: E, ...args: unknown[]): void
    }

    interface PlatformModuleApi {
        readonly id: PlatformId
        readonly sdk: unknown
        readonly language: string
        readonly payload: string | null
        readonly launchData: LaunchData | null
        readonly tld: string | null
        readonly launchSource: LaunchSource | null
        readonly isExternalCallsSupported: boolean
        readonly isExternalLinksAllowed: boolean
        readonly isAudioEnabled: boolean
        readonly isPaused: boolean
        sendMessage(message: PlatformMessage | string, options?: Record<string, unknown>): Promise<unknown>
        sendCustomMessage(id: string, options?: Record<string, unknown>): Promise<unknown>
        getServerTime(): Promise<unknown>
    }

    interface ClaimStatus {
        available: boolean
        reason?: 'unauthorized' | 'own' | 'cooldown' | 'expired' | 'limit'
        count: number
        nextClaimAt: number | null
        serverTime: number
    }

    interface LaunchData {
        id: string
        authorId: string | null
        data: unknown
        claimable: boolean
        claim?: ClaimStatus
        [key: string]: unknown
    }

    interface ClaimResult {
        granted: boolean
        reason?: 'unauthorized' | 'own' | 'cooldown' | 'expired' | 'limit'
        count: number
        nextClaimAt: number | null
        serverTime: number
    }

    interface InboxEvent {
        postId: string
        from: { id: string; name: string | null }
        at: number
    }

    interface PlayerModuleApi {
        readonly isAuthorizationSupported: boolean
        readonly isAuthorized: boolean
        readonly isGuest: boolean
        readonly id: string | null
        readonly name: string | null
        readonly photos: string[]
        readonly extra: Record<string, unknown> | null
        authorize(options?: Record<string, unknown>): Promise<unknown>
    }

    interface StorageModuleApi {
        get(key: string | string[], tryParseJson?: boolean): Promise<unknown>
        set(key: string | string[], value: unknown | unknown[]): Promise<void>
        delete(key: string | string[]): Promise<void>
    }

    interface AdvertisementModuleApi {
        readonly isBannerSupported: boolean
        readonly isInterstitialSupported: boolean
        readonly isRewardedSupported: boolean
        readonly isAdvancedBannersSupported: boolean
        readonly bannerState: BannerState | null
        readonly interstitialState: InterstitialState | null
        readonly rewardedState: RewardedState | null
        readonly rewardedPlacement: string | null
        readonly advancedBannersState: Record<string, BannerState> | null
        readonly minimumDelayBetweenInterstitial: number
        setMinimumDelayBetweenInterstitial(value: number | string): void
        showBanner(position?: BannerPosition, placement?: string | null): void
        hideBanner(): void
        preloadInterstitial(placement?: string | null): void
        showInterstitial(placement?: string | null): void
        preloadRewarded(placement?: string | null): void
        showRewarded(placement?: string | null): void
        showAdvancedBanners(placement: string): void
        hideAdvancedBanners(): void
        checkAdBlock(): Promise<unknown>
    }

    interface SocialModuleApi {
        readonly isShareSupported: boolean
        readonly isInviteFriendsSupported: boolean
        readonly isJoinCommunitySupported: boolean
        readonly isCreatePostSupported: boolean
        readonly isAddToHomeScreenSupported: boolean
        readonly isAddToHomeScreenRewardSupported: boolean
        readonly isAddToFavoritesSupported: boolean
        readonly isAddToFavoritesRewardSupported: boolean
        readonly isRateSupported: boolean
        readonly isClaimSupported: boolean
        readonly isInboxSupported: boolean
        share(options?: Record<string, unknown>): Promise<unknown>
        inviteFriends(options?: Record<string, unknown>): Promise<unknown>
        joinCommunity(options?: Record<string, unknown>): Promise<unknown>
        createPost(options?: Record<string, unknown>): Promise<unknown>
        addToHomeScreen(): Promise<unknown>
        getAddToHomeScreenReward(): Promise<unknown>
        addToFavorites(): Promise<unknown>
        getAddToFavoritesReward(): Promise<unknown>
        rate(): Promise<unknown>
        claim(options?: { cooldown?: number; scope?: 'user' | 'post' }): Promise<ClaimResult>
        getInbox(options?: { ackUntil?: number }): Promise<{ events: InboxEvent[]; serverTime: number }>
    }

    interface DeviceSafeArea {
        top: number
        bottom: number
        left: number
        right: number
    }

    interface DeviceModuleApi {
        readonly type: DeviceType
        readonly os: DeviceOs
        readonly orientation: DeviceOrientation | null
        readonly safeArea: DeviceSafeArea
    }

    interface LeaderboardEntry {
        id: string
        name: string
        score: number
        rank: number
        photo?: string
    }

    interface LeaderboardsModuleApi {
        readonly type: LeaderboardType
        setScore(id: string, score: number | string): Promise<unknown>
        getEntries(id: string): Promise<LeaderboardEntry[]>
        showNativePopup(id: string): Promise<unknown>
    }

    interface PaymentsModuleApi {
        readonly isSupported: boolean
        purchase(id: string, options?: Record<string, unknown>): Promise<unknown>
        getPurchases(): Promise<unknown[]>
        getCatalog(): Promise<unknown[]>
        consumePurchase(id: string): Promise<unknown>
    }

    interface AchievementsModuleApi {
        unlock(id: string): Promise<unknown>
        getAchievements(): Promise<unknown[]>
    }

    interface RemoteConfigModuleApi {
        readonly isSupported: boolean
        setContext(parameters: Record<string, unknown>): void
        get(): Promise<Record<string, unknown>>
    }

    interface ClipboardModuleApi {
        readonly isSupported: boolean
        read(): Promise<string>
        write(text: string): Promise<void>
    }

    interface AnalyticsModuleApi {
        send(eventType: string, data?: Record<string, unknown>): void
    }

    // New v2 modules — surfaced but bench doesn't yet drive them.
    interface CrossPromoModuleApi {
        readonly isVisible: boolean
        getGames(): Promise<unknown[]>
        show(): Promise<void>
        hide(): void
    }

    interface DailyRewardsModuleApi {
        getRewards(): Promise<unknown[]>
        getCurrentDay(): Promise<unknown>
        getCurrentReward(): Promise<unknown>
        claimCurrentReward(): Promise<unknown>
    }

    interface TasksModuleApi {
        getTasks(): Promise<unknown[]>
        addProgress(options: Record<string, unknown>): Promise<unknown>
        claimReward(options: Record<string, unknown>): Promise<unknown>
    }

    interface PlaygamaBridge extends Emitter<EventName> {
        readonly version: string
        readonly isInitialized: boolean
        readonly options: Record<string, unknown>
        readonly engine: string

        readonly platform: PlatformModuleApi
        readonly player: PlayerModuleApi
        readonly storage: StorageModuleApi
        readonly advertisement: AdvertisementModuleApi
        readonly social: SocialModuleApi
        readonly device: DeviceModuleApi
        readonly leaderboards: LeaderboardsModuleApi
        readonly payments: PaymentsModuleApi
        readonly achievements: AchievementsModuleApi
        readonly remoteConfig: RemoteConfigModuleApi
        readonly clipboard: ClipboardModuleApi
        readonly analytics: AnalyticsModuleApi
        readonly crossPromo: CrossPromoModuleApi
        readonly dailyRewards: DailyRewardsModuleApi
        readonly tasks: TasksModuleApi

        readonly PLATFORM_ID: Record<string, PlatformId>
        readonly PLATFORM_MESSAGE: Record<string, PlatformMessage>
        readonly MODULE_NAME: Record<string, ModuleName>
        readonly EVENT_NAME: Record<string, EventName>
        readonly INTERSTITIAL_STATE: Record<string, InterstitialState>
        readonly REWARDED_STATE: Record<string, RewardedState>
        readonly BANNER_STATE: Record<string, BannerState>
        readonly DEVICE_TYPE: Record<string, DeviceType>
        readonly DEVICE_ORIENTATION: Record<string, DeviceOrientation>
        readonly LAUNCH_SOURCE: Record<string, LaunchSource>

        initialize(options?: { configFilePath?: string } & Record<string, unknown>): Promise<void>
        setGameLoadingProgress(percent: number): void
    }

    interface Window {
        bridge: PlaygamaBridge
    }
}

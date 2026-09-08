import { el, parseJsonLoose, pretty, setText } from '../util'

// On Reddit: share() leaves a comment under the current post, createPost()
// creates a new post running this app (optionally with `data` attached — it
// comes back as `platform.launchData.data` when that post is opened).
export function bindSocialSection(bridge: PlaygamaBridge): void {
    const s = bridge.social
    setText('social-share-supported', s.isShareSupported)
    setText('social-invite-supported', s.isInviteFriendsSupported)
    setText('social-join-supported', s.isJoinCommunitySupported)
    setText('social-create-post-supported', s.isCreatePostSupported)
    setText('social-home-supported', s.isAddToHomeScreenSupported)
    setText('social-home-reward-supported', s.isAddToHomeScreenRewardSupported)
    setText('social-fav-supported', s.isAddToFavoritesSupported)
    setText('social-fav-reward-supported', s.isAddToFavoritesRewardSupported)
    setText('social-rate-supported', s.isRateSupported)

    const out = el('social-output')
    const wrap = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
        try {
            const result = await fn()
            out.textContent = `${label}: ok ${result === undefined ? '' : pretty(result)}`
        } catch (error) {
            out.textContent = `${label}: failed — ${(error as Error).message ?? error}`
        }
    }

    el<HTMLButtonElement>('social-share-btn').addEventListener('click', () =>
        wrap('share', () => s.share({ text: el<HTMLInputElement>('social-share-text').value })),
    )

    el<HTMLButtonElement>('social-invite-btn').addEventListener('click', () =>
        wrap('inviteFriends', () => s.inviteFriends({ text: el<HTMLInputElement>('social-share-text').value })),
    )

    el<HTMLButtonElement>('social-join-btn').addEventListener('click', () =>
        wrap('joinCommunity', () => s.joinCommunity()),
    )

    el<HTMLButtonElement>('social-post-btn').addEventListener('click', () => {
        const text = el<HTMLInputElement>('social-post-title').value
        const data = parseJsonLoose(el<HTMLInputElement>('social-post-data').value)
        const claimable = el<HTMLInputElement>('social-post-claimable').checked
        return wrap('createPost', () => s.createPost({ text, ...(data === undefined ? {} : { data }), claimable }))
    })

    // Claims: other players act on a claimable post; the author reads the inbox.
    setText('social-claim-supported', s.isClaimSupported)
    el<HTMLButtonElement>('social-claim-btn').addEventListener('click', () => {
        const cooldown = Number(el<HTMLInputElement>('social-claim-cooldown').value) || 0
        const scope = el<HTMLSelectElement>('social-claim-scope').value as 'user' | 'post'
        return wrap('claim', () => s.claim({ cooldown, scope }))
    })
    el<HTMLButtonElement>('social-inbox-btn').addEventListener('click', () => wrap('getInbox', () => s.getInbox()))
    el<HTMLButtonElement>('social-inbox-ack-btn').addEventListener('click', () => wrap('getInbox (ack all)', async () => {
        const { serverTime } = await s.getInbox()
        return s.getInbox({ ackUntil: serverTime })
    }))

    el<HTMLButtonElement>('social-home-btn').addEventListener('click', () =>
        wrap('addToHomeScreen', () => s.addToHomeScreen()),
    )
    el<HTMLButtonElement>('social-home-reward-btn').addEventListener('click', () =>
        wrap('getAddToHomeScreenReward', () => s.getAddToHomeScreenReward()),
    )
    el<HTMLButtonElement>('social-fav-btn').addEventListener('click', () =>
        wrap('addToFavorites', () => s.addToFavorites()),
    )
    el<HTMLButtonElement>('social-fav-reward-btn').addEventListener('click', () =>
        wrap('getAddToFavoritesReward', () => s.getAddToFavoritesReward()),
    )
    el<HTMLButtonElement>('social-rate-btn').addEventListener('click', () => wrap('rate', () => s.rate()))
}

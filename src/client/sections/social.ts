import { el, pretty, setText } from '../util'

// On Reddit: share() leaves a comment under the current post and createPost()
// creates a new post running this app. A post declared in the config `posts`
// section is created by its id, and the game that is launched from it reads the
// same entry back as platform.data.
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
    setText('social-post-reward-supported', s.isPostRewardSupported)

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
        const id = el<HTMLInputElement>('social-post-id').value.trim()
        const text = el<HTMLInputElement>('social-post-title').value.trim()
        const payload = el<HTMLInputElement>('social-post-payload').value.trim()
        return wrap('createPost', () => (id
            ? s.createPost(id, payload || undefined)
            : s.createPost({ text })))
    })

    // One method for both sides: the visit reward inside a post, the author's
    // rewards anywhere else.
    el<HTMLButtonElement>('social-post-reward-btn').addEventListener('click', () =>
        wrap('getPostReward', () => s.getPostReward()),
    )

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

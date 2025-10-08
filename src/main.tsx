// Learn more at developers.reddit.com/docs
import { Devvit, useWebView } from "@devvit/public-api";

export const ACTION_NAME = {
  INITIALIZE: 'initialize',
  AUTHORIZE_PLAYER: 'authorize_player',
  SHARE: 'share',
  INVITE_FRIENDS: 'invite_friends',
  JOIN_COMMUNITY: 'join_community',
  CREATE_POST: 'create_post',
  ADD_TO_HOME_SCREEN: 'add_to_home_screen',
  ADD_TO_FAVORITES: 'add_to_favorites',
  RATE: 'rate',
  LEADERBOARDS_SET_SCORE: 'leaderboards_set_score',
  LEADERBOARDS_GET_ENTRIES: 'leaderboards_get_entries',
  LEADERBOARDS_SHOW_NATIVE_POPUP: 'leaderboards_show_native_popup',
  GET_PURCHASES: 'get_purchases',
  GET_CATALOG: 'get_catalog',
  PURCHASE: 'purchase',
  CONSUME_PURCHASE: 'consume_purchase',
  GET_REMOTE_CONFIG: 'get_remote_config',
  GET_STORAGE_DATA: 'get_storage_data',
  SET_STORAGE_DATA: 'set_storage_data',
  DELETE_STORAGE_DATA: 'delete_storage_data',
  CLIPBOARD_WRITE: 'clipboard_write',
  ADBLOCK_DETECT: 'adblock_detect',
  SET_INTERSTITIAL_STATE: 'set_interstitial_state',
  SET_REWARDED_STATE: 'set_rewarded_state',
  SHOW_INTERSTITIAL: 'show_interstitial',
  SHOW_REWARDED: 'show_rewarded',
}

Devvit.configure({
  redis: true
})

// Add a post type definition
Devvit.addCustomPostType({
  name: "Experience Post",
  height: "regular",
  render: (_context) => {
    const { mount } = useWebView({
      url: "game/index.html",
      onMessage: async (message: any, webView) => {
        console.log("MESSAGGE =======>", { message })
        if (message.type === ACTION_NAME.INITIALIZE) {
          webView.postMessage({
            type: ACTION_NAME.INITIALIZE,
            data: { isInitialized: true },
          });
        } else if (message.type === ACTION_NAME.SET_STORAGE_DATA) {
          try {
            const { key, value } = message.data;
            if (Array.isArray(key)) {
              if (!Array.isArray(value)) {
                throw new Error("Value must be an array if key is an array");
              }
              if (key.length !== value.length) {
                throw new Error("Key and value arrays must have the same length");
              }

              await Promise.all(
                key.map((k, i) => _context.redis.set(String(k), String(value[i])))
              );
            } else {
              await _context.redis.set(String(key), String(value as unknown as string));
            }

            webView.postMessage({
              type: ACTION_NAME.SET_STORAGE_DATA,
              data: { success: true },
            });
          } catch (error) {
            webView.postMessage({
              type: ACTION_NAME.SET_STORAGE_DATA,
              data: { success: false, error: String(error) },
            });
          }
        } else if (message.type === ACTION_NAME.GET_STORAGE_DATA) {
          const { key } = message.data;
          let result;

          try {
            if (Array.isArray(key)) {
              const values = await Promise.all(key.map((k) => {
                console.log("Key", String(k))
                return _context.redis.get(String(k))
              }));
              result = values.map((v) => (v ?? null));
            } else {
              result = await _context.redis.get(String(key)) || null
            }

            webView.postMessage({
              type: ACTION_NAME.GET_STORAGE_DATA,
              data: { success: true, data: result },
            });
          } catch (error) {
            webView.postMessage({
              type: ACTION_NAME.GET_STORAGE_DATA,
              data: { success: false, error: String(error) },
            });
          }
        } else if (message.type === ACTION_NAME.DELETE_STORAGE_DATA) {
          try {
            const { key } = message.data;
            if (Array.isArray(key)) {
              await Promise.all(key.map((k) => _context.redis.del(String(k))));
              return;
            }

            await _context.redis.del(String(key));

            webView.postMessage({
              type: ACTION_NAME.DELETE_STORAGE_DATA,
              data: { success: true },
            });
          } catch (error) {
            webView.postMessage({
              type: ACTION_NAME.DELETE_STORAGE_DATA,
              data: { success: false, error: String(error) },
            });
          }
        }
      }
    })

    return (
      <vstack height="100%" width="100%" gap="medium" alignment="center middle">
        <image
          url="logo.png"
          description="logo"
          imageHeight={256}
          imageWidth={256}
          height="48px"
          width="48px"
        />
        <button
          appearance="primary"
          onPress={() => mount()}
        >
          Mount
        </button>
      </vstack>
    );
  },
});

export default Devvit;

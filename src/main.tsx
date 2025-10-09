// Learn more at developers.reddit.com/docs
import { Devvit, useWebView } from "@devvit/public-api";
import { addPaymentHandler, OnPurchaseResult, usePayments, getProducts, getOrders } from '@devvit/payments';

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
  redis: true,
  redditAPI: true,
})

addPaymentHandler({
  fulfillOrder: async (order, ctx) => {},
});

// Add a post type definition
Devvit.addCustomPostType({
  name: "Game",
  height: "regular",
  render: (_context) => {
    function postToWebView(type: string, data: any) {
      postMessage({ type, data });
    }

    const payments = usePayments(({ sku, orderId, status, errorCode, errorMessage }: OnPurchaseResult) => {
      if (status === 1) {
        postToWebView(ACTION_NAME.PURCHASE, { success: true, sku, orderId });
      } else {
        postToWebView(ACTION_NAME.PURCHASE, { success: false, sku, errorCode, errorMessage });
      }
    });

    const { mount, postMessage } = useWebView({
      url: "game/index.html",
      onMessage: async (message: any) => {
        // initialize
        const handleInitialize = () => {
          postToWebView(ACTION_NAME.INITIALIZE, { success: true, isIsnitialized: true })
        }

        // storage
        const handleSetStorageData = async (message: any) => {
          try {
            const { key, value } = message.data;
            if (Array.isArray(key)) {
              await Promise.all(key.map((k, i) => _context.redis.set(String(k), String(value[i]))));
            } else {
              await _context.redis.set(String(key), String(value as unknown as string));
            }

            postToWebView(ACTION_NAME.SET_STORAGE_DATA, { success: true })
          } catch (error) {
            postToWebView(ACTION_NAME.SET_STORAGE_DATA, { success: false, error: String(error) })
          }
        }

        const handleGetStorageData = async (message: any) => {
          const { key } = message.data;
          let result;

          try {
            if (Array.isArray(key)) {
              const values = await Promise.all(key.map((k) => _context.redis.get(String(k))));
              result = values.map((v) => (v ?? null));
            } else {
              result = await _context.redis.get(String(key)) || null
            }

            postToWebView(ACTION_NAME.GET_STORAGE_DATA, { success: true, data: result })
          } catch (error) {
            postToWebView(ACTION_NAME.GET_STORAGE_DATA, { success: false, error: String(error) })
          }
        }

        const handleDeleteStorageData = async (message: any) => {
          try {
            const { key } = message.data;
            if (Array.isArray(key)) {
              await Promise.all(key.map((k) => _context.redis.del(String(k))));
            } else {
              await _context.redis.del(String(key));
            }

            postToWebView(ACTION_NAME.DELETE_STORAGE_DATA, { success: true })
          } catch (error) {
            postToWebView(ACTION_NAME.DELETE_STORAGE_DATA, { success: false, error: String(error) })
          }
        }

        // payments
        const handlePurchase = async (message: any) => {
          const { id } = message.data;
          payments.purchase(id)
        }

        const handleGetCatalog = async () => {
          try {
            const products = await getProducts();

            postToWebView(ACTION_NAME.GET_CATALOG, { success: true, data: products })
          } catch (error) {
            postToWebView(ACTION_NAME.GET_CATALOG, { success: false, error: String(error) })
          }
        }

        const handleGetPurchases = async () => {
          try {
            const purchases = await getOrders();

            postToWebView(ACTION_NAME.GET_PURCHASES, { success: true, data: purchases })
          } catch (error) {
            postToWebView(ACTION_NAME.GET_PURCHASES, { success: false, error: String(error) })
          }
        }

        if (message.type === ACTION_NAME.INITIALIZE) {
          handleInitialize()
        } else if (message.type === ACTION_NAME.SET_STORAGE_DATA) {
          await handleSetStorageData(message)
        } else if (message.type === ACTION_NAME.GET_STORAGE_DATA) {
          await handleGetStorageData(message)
        } else if (message.type === ACTION_NAME.DELETE_STORAGE_DATA) {
          await handleDeleteStorageData(message)
        } else if (message.type === ACTION_NAME.PURCHASE) {
          await handlePurchase(message)
        } else if (message.type === ACTION_NAME.GET_CATALOG) {
          await handleGetCatalog()
        } else if (message.type === ACTION_NAME.GET_PURCHASES) {
          await handleGetPurchases()
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
          Play
        </button>
      </vstack>
    );
  },
});

export default Devvit;

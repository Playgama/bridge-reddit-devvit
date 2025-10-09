import { Devvit, useWebView } from "@devvit/public-api";
import { addPaymentHandler, OnPurchaseResult, usePayments, getProducts, getOrders } from '@devvit/payments';

export const ACTION_NAME = {
  INITIALIZE: 'initialize',
  CREATE_POST: 'create_post',
  GET_PURCHASES: 'get_purchases',
  GET_CATALOG: 'get_catalog',
  PURCHASE: 'purchase',
  GET_STORAGE_DATA: 'get_storage_data',
  SET_STORAGE_DATA: 'set_storage_data',
  DELETE_STORAGE_DATA: 'delete_storage_data',
}

Devvit.configure({
  redis: true,
  redditAPI: true,
})

addPaymentHandler({
  fulfillOrder: async (order, ctx) => {},
});

Devvit.addCustomPostType({
  name: "Game",
  height: "regular",
  render: (context) => {
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
        const handleInitialize = async () => {
          const currentUser = await context.reddit.getCurrentUser();

          const data: any = {
            isPlayerAuthorized: !!currentUser,
          }

          if (currentUser) {
            data.playerId = currentUser.id;
            data.playerName = currentUser.username;
            data.playerPhoto = await currentUser.getSnoovatarUrl();
          }
          
          postToWebView(ACTION_NAME.INITIALIZE, { success: true, ...data  })
        }

        // storage
        const handleSetStorageData = async (message: any) => {
          try {
            const { key, value } = message.data;
            if (Array.isArray(key)) {
              await Promise.all(key.map((k, i) => context.redis.set(String(k), String(value[i]))));
            } else {
              await context.redis.set(String(key), String(value as unknown as string));
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
              const values = await Promise.all(key.map((k) => context.redis.get(String(k))));
              result = values.map((v) => (v ?? null));
            } else {
              result = await context.redis.get(String(key)) || null
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
              await Promise.all(key.map((k) => context.redis.del(String(k))));
            } else {
              await context.redis.del(String(key));
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

        // social
        const handleCreatePost = async (message: any) => {
          try {
            const { options } = message.data;
            const post = await context.reddit.submitPost(options);

            postToWebView(ACTION_NAME.CREATE_POST, { success: true, data: { postId: post.id, postUrl: post.url } })
          } catch (error) {
            postToWebView(ACTION_NAME.CREATE_POST, { success: false, error: String(error) })
          }
        }

        if (message.type === ACTION_NAME.INITIALIZE) {
          await handleInitialize()
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
        } else if (message.type === ACTION_NAME.CREATE_POST) {
          await handleCreatePost(message)
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

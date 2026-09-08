import { purchase, OrderResultStatus } from '@devvit/web/client'

// Reddit purchases are driven by @devvit/web/client on the webview side.
// RedditPlatformBridge looks for this hook when `bridge.payments.purchase(id)`
// is called, so it must be registered before playgama-bridge.js loads.
export function registerDevvitPayments(): void {
    window.__playgama_devvit = {
        purchase: async (sku: string) => {
            const result = await purchase(sku)
            if (result.status === OrderResultStatus.STATUS_SUCCESS) {
                return { id: sku, orderId: result.orderId }
            }

            const error = new Error(result.errorMessage || 'Purchase failed') as Error & { code?: unknown }
            error.code = result.status
            throw error
        },
    }
}

declare global {
    interface Window {
        __playgama_devvit?: {
            purchase: (sku: string) => Promise<{ id: string; orderId?: string }>
        }
    }
}

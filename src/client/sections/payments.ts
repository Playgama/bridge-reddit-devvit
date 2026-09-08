import { el, pretty, setText } from '../util'

interface StoreProduct {
    id: string
    title?: string
    description?: string
    price?: string | number
}

export function bindPaymentsSection(bridge: PlaygamaBridge): void {
    const p = bridge.payments
    setText('pay-supported', p.isSupported)

    const out = el('pay-output')
    const store = el('pay-store')
    const idInput = el<HTMLInputElement>('pay-id')

    const purchaseProduct = async (id: string): Promise<void> => {
        try {
            out.textContent = `purchase ${id}: ${pretty(await p.purchase(id))}`
        } catch (error) {
            out.textContent = `purchase ${id} failed: ${(error as Error).message ?? error}`
        }
    }

    // Renders the catalog as a list of products with a Buy button each — the
    // quickest way to exercise the Reddit purchase flow end to end.
    const renderStore = (products: StoreProduct[]): void => {
        store.replaceChildren()
        if (products.length === 0) {
            store.textContent = 'Catalog is empty — add products to products.json and playgama-bridge-config.json.'
            return
        }

        products.forEach((product) => {
            const row = document.createElement('div')
            row.className = 'store__item'

            const info = document.createElement('div')
            info.className = 'store__info'
            const title = document.createElement('div')
            title.className = 'store__title'
            title.textContent = `${product.title ?? product.id} — ${product.price ?? '?'}`
            const description = document.createElement('div')
            description.className = 'muted'
            description.textContent = product.description ?? product.id
            info.append(title, description)

            const buy = document.createElement('button')
            buy.className = 'btn'
            buy.textContent = 'Buy'
            buy.addEventListener('click', () => {
                idInput.value = product.id
                purchaseProduct(product.id)
            })

            row.append(info, buy)
            store.append(row)
        })
    }

    el<HTMLButtonElement>('pay-load-store-btn').addEventListener('click', async () => {
        try {
            const catalog = (await p.getCatalog()) as StoreProduct[]
            renderStore(catalog)
            out.textContent = pretty(catalog)
        } catch (error) {
            out.textContent = `getCatalog failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('pay-get-purchases-btn').addEventListener('click', async () => {
        try {
            out.textContent = pretty(await p.getPurchases())
        } catch (error) {
            out.textContent = `getPurchases failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('pay-get-catalog-btn').addEventListener('click', async () => {
        try {
            out.textContent = pretty(await p.getCatalog())
        } catch (error) {
            out.textContent = `getCatalog failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('pay-purchase-btn').addEventListener('click', () => purchaseProduct(idInput.value))

    el<HTMLButtonElement>('pay-consume-btn').addEventListener('click', async () => {
        try {
            out.textContent = pretty(await p.consumePurchase(idInput.value))
        } catch (error) {
            out.textContent = `consumePurchase failed: ${(error as Error).message ?? error}`
        }
    })
}

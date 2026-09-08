import { el, formatValue, parseJsonLoose, pretty } from '../util'

interface Row {
    keyEl: HTMLInputElement
    valueEl: HTMLInputElement
    container: HTMLDivElement
}

export function bindStorageSection(bridge: PlaygamaBridge): void {
    const s = bridge.storage

    const out = el('storage-output')

    const tryParseEl = el<HTMLInputElement>('storage-try-parse-json')
    const rowsRoot = el<HTMLDivElement>('storage-rows')
    const rows: Row[] = []

    const updateRemoveButtons = (): void => {
        const onlyOne = rows.length <= 1
        for (const row of rows) {
            const btn = row.container.querySelector<HTMLButtonElement>('.storage-row__remove')
            if (btn) btn.disabled = onlyOne
        }
    }

    const addRow = (key = '', value = ''): Row => {
        const container = document.createElement('div')
        container.className = 'storage-row'

        const keyEl = document.createElement('input')
        keyEl.type = 'text'
        keyEl.placeholder = 'key'
        keyEl.value = key

        const valueEl = document.createElement('input')
        valueEl.type = 'text'
        valueEl.placeholder = 'value (string or JSON)'
        valueEl.value = value

        const removeBtn = document.createElement('button')
        removeBtn.type = 'button'
        removeBtn.className = 'storage-row__remove'
        removeBtn.title = 'Remove row'
        removeBtn.textContent = '×'
        removeBtn.addEventListener('click', () => {
            if (rows.length <= 1) return
            const idx = rows.indexOf(row)
            if (idx >= 0) rows.splice(idx, 1)
            container.remove()
            updateRemoveButtons()
        })

        container.append(keyEl, valueEl, removeBtn)
        rowsRoot.appendChild(container)

        const row: Row = { keyEl, valueEl, container }
        rows.push(row)
        updateRemoveButtons()
        return row
    }

    addRow('coins')
    addRow('level')

    el<HTMLButtonElement>('storage-add-row-btn').addEventListener('click', () => {
        addRow()
    })

    const collectKeys = (): { keys: string[]; rowsByKey: Map<string, Row[]> } => {
        const keys: string[] = []
        const rowsByKey = new Map<string, Row[]>()
        for (const row of rows) {
            const key = row.keyEl.value.trim()
            if (!key) continue
            keys.push(key)
            const list = rowsByKey.get(key) ?? []
            list.push(row)
            rowsByKey.set(key, list)
        }
        return { keys, rowsByKey }
    }

    el<HTMLButtonElement>('storage-get-btn').addEventListener('click', async () => {
        const { keys, rowsByKey } = collectKeys()
        if (keys.length === 0) {
            out.textContent = 'no keys to get — add a row with a non-empty key'
            return
        }
        try {
            const data = await s.get(keys, tryParseEl.checked)
            const arr = Array.isArray(data) ? data : [data]
            keys.forEach((key, i) => {
                const value = arr[i]
                const matches = rowsByKey.get(key)
                if (!matches) return
                for (const row of matches) row.valueEl.value = formatForInput(value)
            })
            out.textContent = pretty(data)
        } catch (error) {
            out.textContent = `get failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('storage-set-btn').addEventListener('click', async () => {
        const keys: string[] = []
        const values: unknown[] = []
        for (const row of rows) {
            const key = row.keyEl.value.trim()
            if (!key) continue
            keys.push(key)
            values.push(parseJsonLoose(row.valueEl.value))
        }
        if (keys.length === 0) {
            out.textContent = 'no keys to set — add a row with a non-empty key'
            return
        }
        try {
            await s.set(keys, values)
            out.textContent = `set: ok\n${pretty(Object.fromEntries(keys.map((k, i) => [k, values[i]])))}`
        } catch (error) {
            out.textContent = `set failed: ${(error as Error).message ?? error}`
        }
    })

    el<HTMLButtonElement>('storage-delete-btn').addEventListener('click', async () => {
        const { keys, rowsByKey } = collectKeys()
        if (keys.length === 0) {
            out.textContent = 'no keys to delete — add a row with a non-empty key'
            return
        }
        try {
            await s.delete(keys)
            for (const matches of rowsByKey.values()) {
                for (const row of matches) row.valueEl.value = ''
            }
            out.textContent = `delete: ok (${keys.join(', ')})`
        } catch (error) {
            out.textContent = `delete failed: ${(error as Error).message ?? error}`
        }
    })
}

function formatForInput(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try {
        return JSON.stringify(value)
    } catch {
        return formatValue(value)
    }
}

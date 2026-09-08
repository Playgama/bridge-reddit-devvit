export function el<T extends HTMLElement = HTMLElement>(id: string): T {
    const node = document.getElementById(id)
    if (!node) {
        throw new Error(`Missing DOM element: #${id}`)
    }
    return node as T
}

export function setText(id: string, value: unknown): void {
    el(id).textContent = formatValue(value)
}

export function setStatus(id: string, value: string, kind: 'ok' | 'err' | '' = ''): void {
    const node = el(id)
    node.textContent = value
    node.className = kind ? `status ${kind}` : 'status'
}

export function pretty(value: unknown): string {
    try {
        return JSON.stringify(value, replaceCircular(), 2)
    } catch {
        return String(value)
    }
}

export function formatValue(value: unknown): string {
    if (value === null) return 'null'
    if (value === undefined) return '—'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return value.length === 0 ? '[]' : value.join(', ')
    return pretty(value)
}

function replaceCircular(): (k: string, v: unknown) => unknown {
    const seen = new WeakSet<object>()
    return (_key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value as object)) return '[Circular]'
            seen.add(value as object)
        }
        return value
    }
}

export function parseJsonLoose(input: string): unknown {
    const trimmed = input.trim()
    if (!trimmed) return undefined
    try {
        return JSON.parse(trimmed)
    } catch {
        return trimmed
    }
}

export function appendLog(target: HTMLElement, line: string, max = 200): void {
    const lines = target.textContent ? target.textContent.split('\n') : []
    lines.push(`[${timestamp()}] ${line}`)
    while (lines.length > max) lines.shift()
    target.textContent = lines.join('\n')
    target.scrollTop = target.scrollHeight
}

function timestamp(): string {
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${ms}`
}

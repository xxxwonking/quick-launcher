import type {
  ClipboardTransformOperation,
  LauncherItem,
  SystemActionOperation,
} from '../../../shared/launcher-item'

const DATA_UNITS = { b: 0, kb: 1, mb: 2, gb: 3, tb: 4 } as const

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const hasUnsafeControl = Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
    })
    return (url.protocol === 'http:' || url.protocol === 'https:') && !hasUnsafeControl
  } catch {
    return false
  }
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || value.startsWith('~/') || /^[A-Za-z]:[\\/]/u.test(value)
}

class ArithmeticParser {
  private index = 0

  constructor(private readonly source: string) {}

  parse(): number | undefined {
    const value = this.expression()
    this.space()
    return this.index === this.source.length && Number.isFinite(value) ? value : undefined
  }

  private expression(): number {
    let value = this.term()
    while (true) {
      this.space()
      const operator = this.source[this.index]
      if (operator !== '+' && operator !== '-') return value
      this.index += 1
      const right = this.term()
      value = operator === '+' ? value + right : value - right
    }
  }

  private term(): number {
    let value = this.unary()
    while (true) {
      this.space()
      const operator = this.source[this.index]
      if (operator !== '*' && operator !== '/' && operator !== '%') return value
      this.index += 1
      const right = this.unary()
      value = operator === '*' ? value * right : operator === '/' ? value / right : value % right
    }
  }

  private unary(): number {
    this.space()
    if (this.source[this.index] === '+') {
      this.index += 1
      return this.unary()
    }
    if (this.source[this.index] === '-') {
      this.index += 1
      return -this.unary()
    }
    return this.primary()
  }

  private primary(): number {
    this.space()
    if (this.source[this.index] === '(') {
      this.index += 1
      const value = this.expression()
      this.space()
      if (this.source[this.index] !== ')') return Number.NaN
      this.index += 1
      return value
    }
    const match = this.source.slice(this.index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/u)
    if (!match) return Number.NaN
    this.index += match[0].length
    return Number(match[0])
  }

  private space(): void {
    while (/\s/u.test(this.source[this.index] ?? '')) this.index += 1
  }
}

function formattedNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(12)))
}

function resultItem(id: string, title: string, subtitle: string, text: string): LauncherItem {
  return {
    id,
    title,
    subtitle,
    aliases: [],
    icon: 'clipboard',
    kind: 'command',
    action: { type: 'copy-text', text },
  }
}

const CLIPBOARD_COMMANDS: ReadonlyArray<{
  prefixes: readonly string[]
  operation: ClipboardTransformOperation
  title: string
}> = [
  { prefixes: ['json', 'json格式化'], operation: 'format-json', title: '格式化 JSON' },
  { prefixes: ['url编码'], operation: 'url-encode', title: 'URL 编码' },
  { prefixes: ['url解码'], operation: 'url-decode', title: 'URL 解码' },
  { prefixes: ['base64'], operation: 'base64-encode', title: 'Base64 编码' },
  { prefixes: ['base64解码'], operation: 'base64-decode', title: 'Base64 解码' },
  { prefixes: ['大写'], operation: 'uppercase', title: '转换为大写' },
  { prefixes: ['小写'], operation: 'lowercase', title: '转换为小写' },
]

const SYSTEM_COMMANDS: ReadonlyArray<{ aliases: readonly string[]; operation: SystemActionOperation; title: string }> = [
  { aliases: ['锁屏', 'lock'], operation: 'lock-screen', title: '锁定屏幕' },
  { aliases: ['睡眠', 'sleep'], operation: 'sleep', title: '让电脑进入睡眠' },
  { aliases: ['截图', 'screenshot'], operation: 'screenshot', title: '打开系统截图' },
  { aliases: ['系统设置', 'system settings'], operation: 'open-system-settings', title: '打开系统设置' },
]

export function productivityCommand(rawQuery: string): LauncherItem | undefined {
  const query = rawQuery.trim()
  if (!query) return undefined

  if (isSafeUrl(query)) {
    return { id: 'productivity:url', title: '打开网址', subtitle: query, aliases: [], icon: 'globe', kind: 'web', action: { type: 'open-url', url: query } }
  }
  if (isAbsolutePath(query)) {
    return { id: 'productivity:path', title: '打开文件或文件夹', subtitle: query, aliases: [], icon: 'folder', kind: 'command', action: { type: 'open-path', path: query } }
  }

  const applicationMatch = query.match(/^(vscode|terminal|终端)\s+(.+)$/iu)
  if (applicationMatch) {
    const path = applicationMatch[2]?.trim() ?? ''
    if (isAbsolutePath(path)) {
      const application = applicationMatch[1]?.toLocaleLowerCase() === 'vscode' ? 'vscode' : 'terminal'
      return {
        id: `productivity:application:${application}`,
        title: application === 'vscode' ? '使用 VS Code 打开' : '在终端中打开',
        subtitle: path,
        aliases: [],
        icon: application === 'vscode' ? 'code' : 'terminal',
        kind: 'command',
        action: { type: 'application-argument', application, path },
      }
    }
  }

  const unitMatch = query.match(/^(-?\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)\s+(?:to|转|到)\s*(b|kb|mb|gb|tb)$/iu)
  if (unitMatch) {
    const value = Number(unitMatch[1])
    const from = unitMatch[2]?.toLocaleLowerCase() as keyof typeof DATA_UNITS
    const to = unitMatch[3]?.toLocaleLowerCase() as keyof typeof DATA_UNITS
    const converted = value * (1024 ** (DATA_UNITS[from] - DATA_UNITS[to]))
    if (Number.isFinite(converted)) {
      const result = `${formattedNumber(converted)} ${to.toLocaleUpperCase()}`
      return resultItem('productivity:unit', result, `${query} · Enter 复制`, result)
    }
  }

  const timestampMatch = query.match(/^(?:timestamp|时间戳)\s+(\d{1,13})$/iu)
  if (timestampMatch) {
    const rawTimestamp = timestampMatch[1] ?? ''
    const milliseconds = Number(rawTimestamp) * (rawTimestamp.length <= 10 ? 1000 : 1)
    const date = new Date(milliseconds)
    if (!Number.isNaN(date.getTime())) {
      const result = date.toISOString()
      return resultItem('productivity:timestamp', result, 'UTC 时间 · Enter 复制', result)
    }
  }

  if (query.length <= 128 && /[+\-*/%]/u.test(query) && /^[\d+\-*/%().\s]+$/u.test(query)) {
    const result = new ArithmeticParser(query).parse()
    if (result !== undefined) {
      const text = formattedNumber(result)
      return resultItem('productivity:calculation', text, `${query} · Enter 复制`, text)
    }
  }

  for (const command of CLIPBOARD_COMMANDS) {
    for (const prefix of command.prefixes) {
      if (query.toLocaleLowerCase() !== prefix.toLocaleLowerCase() && !query.toLocaleLowerCase().startsWith(`${prefix.toLocaleLowerCase()} `)) continue
      const input = query.length > prefix.length ? query.slice(prefix.length).trim() : undefined
      return {
        id: `productivity:clipboard:${command.operation}`,
        title: command.title,
        subtitle: input ? '处理输入内容并复制结果' : '处理当前剪贴板并复制结果',
        aliases: [],
        icon: 'clipboard',
        kind: 'command',
        action: { type: 'clipboard-transform', operation: command.operation, ...(input ? { input } : {}) },
      }
    }
  }

  const systemCommand = SYSTEM_COMMANDS.find((command) => command.aliases.some((alias) => alias.toLocaleLowerCase() === query.toLocaleLowerCase()))
  if (systemCommand) {
    return {
      id: `productivity:system:${systemCommand.operation}`,
      title: systemCommand.title,
      subtitle: '安全的系统内置操作',
      aliases: [...systemCommand.aliases],
      icon: systemCommand.operation === 'open-system-settings' ? 'settings' : 'terminal',
      kind: 'builtin',
      action: { type: 'system-action', operation: systemCommand.operation },
    }
  }

  return undefined
}

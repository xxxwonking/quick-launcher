import { describe, expect, it } from 'vitest'
import { productivityCommand } from './productivity-commands'

describe('productivity commands', () => {
  it('recognizes pasted HTTP(S) URLs and absolute macOS or Windows paths', () => {
    expect(productivityCommand('https://example.com/docs?q=1')?.action).toEqual({
      type: 'open-url', url: 'https://example.com/docs?q=1',
    })
    expect(productivityCommand('/Users/alice/Projects/demo')?.action).toEqual({
      type: 'open-path', path: '/Users/alice/Projects/demo',
    })
    expect(productivityCommand('C:\\Users\\alice\\Projects\\demo')?.action).toEqual({
      type: 'open-path', path: 'C:\\Users\\alice\\Projects\\demo',
    })
  })

  it('calculates arithmetic without evaluating JavaScript', () => {
    expect(productivityCommand('1024*8')).toMatchObject({
      title: '8192',
      action: { type: 'copy-text', text: '8192' },
    })
    expect(productivityCommand('2*(3+4)')).toMatchObject({ title: '14' })
    expect(productivityCommand('process.exit()')).toBeUndefined()
  })

  it('converts binary data units and Unix timestamps', () => {
    expect(productivityCommand('10gb to mb')).toMatchObject({
      title: '10240 MB',
      action: { type: 'copy-text', text: '10240 MB' },
    })
    expect(productivityCommand('timestamp 0')).toMatchObject({
      title: '1970-01-01T00:00:00.000Z',
    })
  })

  it.each([
    ['json {"name":"quick"}', 'format-json'],
    ['url编码 海贼王', 'url-encode'],
    ['url解码 %E6%B5%B7%E8%B4%BC%E7%8E%8B', 'url-decode'],
    ['base64 hello', 'base64-encode'],
    ['base64解码 aGVsbG8=', 'base64-decode'],
    ['大写 hello', 'uppercase'],
    ['小写 HELLO', 'lowercase'],
  ] as const)('creates a clipboard transformation for %s', (query, operation) => {
    expect(productivityCommand(query)?.action).toEqual({ type: 'clipboard-transform', operation, input: query.slice(query.indexOf(' ') + 1) })
  })

  it('uses the current clipboard when a transform command has no argument', () => {
    expect(productivityCommand('json')?.action).toEqual({ type: 'clipboard-transform', operation: 'format-json' })
  })

  it('parses application path arguments and fixed system operations', () => {
    expect(productivityCommand('vscode /Users/alice/Projects/demo')?.action).toEqual({
      type: 'application-argument', application: 'vscode', path: '/Users/alice/Projects/demo',
    })
    expect(productivityCommand('terminal C:\\Projects\\demo')?.action).toEqual({
      type: 'application-argument', application: 'terminal', path: 'C:\\Projects\\demo',
    })
    expect(productivityCommand('锁屏')?.action).toEqual({ type: 'system-action', operation: 'lock-screen' })
    expect(productivityCommand('睡眠')?.action).toEqual({ type: 'system-action', operation: 'sleep' })
    expect(productivityCommand('截图')?.action).toEqual({ type: 'system-action', operation: 'screenshot' })
    expect(productivityCommand('系统设置')?.action).toEqual({ type: 'system-action', operation: 'open-system-settings' })
  })
})

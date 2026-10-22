// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as source from './token'
import * as esm from '../dist/index.js'

const jar = { cookie: '' }
const implementations: [string, Pick<typeof source, 'cookieDict' | 'readTokenCookie'>][] = [
  ['source', source], ['ESM', esm],
]
for (const path of ['../dist/browser.js', '../dist/wapi.js',
  '../../marketing/web10-social/public/wapi.js', '../../marketing/marketing-ui/public/docs/wapi.js']) {
  const window = {} as { web10: typeof source }
  runInNewContext(readFileSync(new URL(path, import.meta.url), 'utf8'), { window, document: jar })
  implementations.push([path, window.web10])
}
beforeEach(() => { jar.cookie = ''; vi.stubGlobal('document', jar) })
afterEach(() => vi.unstubAllGlobals())

describe.each(implementations)('%s cookie integrity', (_name, api) => {
  it('stores __proto__ as own data without adopting an inherited token', () => {
    jar.cookie = '__proto__=' + encodeURIComponent('{"token":"SYNTHETIC-INHERITED"}')
    const cookies = api.cookieDict()
    expect(Object.hasOwn(cookies, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(cookies)).not.toHaveProperty('token')
    expect(Object.getOwnPropertyDescriptor(cookies, '__proto__')).toMatchObject({
      value: { token: 'SYNTHETIC-INHERITED' }, enumerable: true, writable: true, configurable: true,
    })
    expect(api.readTokenCookie()).toBeNull()
    expect(Object.hasOwn(Object.prototype, 'token')).toBe(false)
  })

  it('rejects an ambient inherited token independently of safe cookie writes', () => {
    const prototype = Object.getPrototypeOf(api.cookieDict())
    let result: string | null
    Object.defineProperty(prototype, 'token', { value: 'SYNTHETIC-INHERITED', configurable: true })
    try { result = api.readTokenCookie() }
    finally { Reflect.deleteProperty(prototype, 'token') }
    expect(result).toBeNull()
  })

  it('keeps own tokens regardless of __proto__ cookie order', () => {
    const hostile = '__proto__=' + encodeURIComponent('{"token":"SYNTHETIC-INHERITED"}')
    for (const cookie of [`${hostile}; token=SYNTHETIC-OWN`, `token=SYNTHETIC-OWN; ${hostile}`]) {
      jar.cookie = cookie
      expect(api.readTokenCookie()).toBe('SYNTHETIC-OWN')
    }
  })

  it('preserves ordinary objects, JSON/URI values, first equals and last duplicate', () => {
    jar.cookie = ' missing ; raw=a=b; json=%7B%22x%22%3A1%7D; token=%22old%22; token=%22SYNTHETIC-OWN%22'
    const cookies = api.cookieDict()
    expect(Object.getPrototypeOf(cookies)).not.toBeNull()
    expect(typeof cookies.hasOwnProperty).toBe('function')
    expect(cookies).toMatchObject({ raw: 'a=b', json: { x: 1 }, token: 'SYNTHETIC-OWN' })
    expect(api.readTokenCookie()).toBe('SYNTHETIC-OWN')
    cookies.raw = 'changed'
    expect(cookies.raw).toBe('changed')
    expect(delete cookies.raw).toBe(true)
  })

  it('retains reserved names as enumerable data, without trusting their methods', () => {
    jar.cookie = 'constructor=plain; hasOwnProperty=shadow; __proto__=null; token=42'
    expect(Object.keys(api.cookieDict())).toEqual(['constructor', 'hasOwnProperty', '__proto__', 'token'])
    expect(api.readTokenCookie()).toBe('42')
  })

  it('preserves falsy tokens and malformed URI behavior', () => {
    for (const value of ['', 'null', 'false', '0']) {
      jar.cookie = `token=${value}`
      expect(api.readTokenCookie()).toBeNull()
    }
    jar.cookie = 'unrelated=%'
    expect(() => api.cookieDict()).toThrow()
  })
})

it('preserves SSR empty ordinary dictionary and absent token', () => {
  vi.stubGlobal('document', undefined)
  expect(source.cookieDict()).toEqual({})
  expect(Object.getPrototypeOf(source.cookieDict())).toBe(Object.prototype)
  expect(source.readTokenCookie()).toBeNull()
})

import { describe, expect, it } from 'vitest'
import { posthogOptions } from '@web10/telemetry'

const options = () => posthogOptions('https://us.i.posthog.com', true)
const text = (id: number, textContent: string) => ({ id, type: 3, textContent })
const element = (id: number, attributes: Record<string, string>, childNodes: any[], tagName = 'div') => ({ id, type: 2, tagName, attributes, childNodes })
const full = (node: any) => ({ type: 2, data: { node } })
const mutation = (data: any) => ({ type: 3, data: { source: 0, ...data } })
const sender = () => {
  const send = options().before_send as (event: any) => any
  return (events: any[]) => send({ uuid: 'fixture', event: '$snapshot', properties: { $snapshot_data: events } }).properties.$snapshot_data
}

describe('D107 visible by default, sensitive regions masked', () => {
  it('shows arbitrary UI/public text without markers, not sensitive descendants or values', () => {
    const mask = options().session_recording!.maskTextFn!
    const root = document.createElement('div')
    root.innerHTML = '<nav>A new button not in any dictionary</nav><section><p>Public title</p><textarea>SECRET</textarea><span contenteditable>SECRET</span><div data-replay-private>Done</div><div class="ph-mask">SECRET</div></section>'
    expect(mask('A new button not in any dictionary', root.querySelector('nav')!)).toBe('A new button not in any dictionary')
    expect(mask('Public title', root.querySelector('p')!)).toBe('Public title')
    for (const selector of ['textarea', '[contenteditable]', '[data-replay-private]', '.ph-mask']) {
      expect(mask('SECRET', root.querySelector(selector)!)).toBe('[masked]')
    }
    expect(options().session_recording!.maskInputFn!('SECRET', root as any)).toBe('[masked]')
  })

  it('preserves ordinary text without annotations but not sensitive content or credentials', () => {
    const send = sender()
    const result = send([full(element(1, {}, [
      element(2, { title: 'SECRET' }, [text(3, 'Public title'), text(4, 'Public caption')]),
      element(5, { 'data-replay-private': '' }, [text(6, 'SECRET')]), text(7, 'A new button'),
    ]))])
    const wire = JSON.stringify(result)
    expect(wire).toContain('Public title')
    expect(wire).toContain('Public caption')
    expect(wire).toContain('A new button')
    expect(wire).not.toMatch(/SECRET|data-replay-private/)
  })

  it('tracks text changes and added descendants across separate batches, denying unknown IDs and inputs', () => {
    const send = sender()
    send([full(element(1, {}, [element(2, { 'data-replay-public': 'post' }, [text(3, 'Public title')])]))])
    const result = send([mutation({ adds: [{ parentId: 2, node: element(4, {}, [text(5, 'New public caption')]) }], texts: [{ id: 3, value: 'Updated public title' }, { id: 99, value: 'SECRET' }] }),
      { type: 3, data: { source: 5, id: 3, text: 'SECRET' } }])
    expect(JSON.stringify(result)).toContain('New public caption')
    expect(JSON.stringify(result)).toContain('Updated public title')
    expect(JSON.stringify(result)).not.toContain('SECRET')
  })

  it.each(['data-replay-private', 'contenteditable', 'class'])('masks descendants when %s becomes sensitive', (attr) => {
    const send = sender()
    send([full(element(1, {}, [element(2, { 'data-replay-public': 'post' }, [text(3, 'Public title')])]))])
    const result = send([mutation({ attributes: [{ id: 2, attributes: { [attr]: attr === 'class' ? 'ph-mask' : '' } }], texts: [{ id: 3, value: 'SECRET' }] })])
    expect(JSON.stringify(result)).not.toContain('SECRET')
  })

  it('recovers visible text when sensitivity is removed without overriding a different private reason', () => {
    const send = sender()
    send([full(element(1, {}, [element(2, { 'data-replay-private': '', contenteditable: '' }, [text(3, 'SECRET')])]))])
    expect(JSON.stringify(send([mutation({ attributes: [{ id: 2, attributes: { 'data-replay-private': null } }], texts: [{ id: 3, value: 'SECRET' }] })]))).not.toContain('SECRET')
    expect(JSON.stringify(send([mutation({ attributes: [{ id: 2, attributes: { contenteditable: null } }], texts: [{ id: 3, value: 'Public again' }] })]))).toContain('Public again')
  })

  it('captures inline image pixels but never source capabilities or private pixels', () => {
    const send = sender()
    const pixels = 'data:image/png;base64,aGVsbG8='
    const result = send([full(element(1, {}, [element(2, { src: 'https://cdn.invalid/?token=SECRET', rr_dataURL: pixels }, [], 'img'), element(3, { 'data-replay-private': '' }, [element(4, { rr_dataURL: 'data:image/png;base64,c2VjcmV0' }, [], 'img')])]))])
    expect(JSON.stringify(result)).toContain(pixels)
    expect(JSON.stringify(result)).not.toMatch(/SECRET|c2VjcmV0/)
  })

  it('denies private descendants, removed ancestors, reused IDs and new full-snapshot IDs', () => {
    const send = sender()
    const privateChildren = ['textarea', 'input', 'script'].map((tag, i) => element(10 + i, {}, [text(20 + i, 'SECRET')], tag))
    expect(JSON.stringify(send([full(element(1, { 'data-replay-public': 'post' }, privateChildren))]))).not.toContain('SECRET')
    send([full(element(1, {}, [element(2, { 'data-replay-public': 'post' }, [text(3, 'Public title')])]))])
    expect(JSON.stringify(send([mutation({ removes: [{ id: 2 }], texts: [{ id: 3, value: 'SECRET' }] })]))).not.toContain('SECRET')
    expect(JSON.stringify(send([mutation({ adds: [{ parentId: 1, node: element(2, { 'data-replay-private': '' }, [text(3, 'SECRET')]) }] })]))).not.toContain('SECRET')
    expect(JSON.stringify(send([full(element(1, { 'data-replay-private': '' }, [text(3, 'SECRET')]))]))).not.toContain('SECRET')
  })
})

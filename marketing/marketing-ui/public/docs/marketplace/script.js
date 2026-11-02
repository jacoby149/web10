const { el, object, identity, prepare, profiles, session } = window.interop
const $ = id => document.getElementById(id)
let app = null, request = 0, publishing = false
// Encode every character as hex, not an interpolated SQL string literal.
const literal = text => `unhex('${Array.from(new TextEncoder().encode(text), byte => byte.toString(16).padStart(2,'0')).join('')}')`
function query(listing) {
  return `WITH latest_profiles AS (${profiles})
SELECT l.doc_id AS doc_id, l.author_key AS author_key, l.body AS body,
  l.created_at AS created_at, p.body AS profile_body
FROM marketplace_listings l LEFT JOIN latest_profiles p ON l.author_key = p.author_key
${listing ? `WHERE l.doc_id = ${literal(listing)}` : ''}
ORDER BY l.created_at DESC, l.author_key ASC, l.doc_id ASC LIMIT ${listing ? 1 : 50}`
}
function navigate(listing) {
  const url = new URL(location.href)
  if (listing) url.searchParams.set('listing', listing); else url.searchParams.delete('listing')
  history.pushState(null, '', url); load()
}
function render(row, detail) {
  const body = object(row.body), card = el('article', undefined, detail ? 'marketplace-detail' : 'marketplace-listing')
  const title = typeof body.title === 'string' ? body.title : 'Untitled listing'
  card.append(el('h3', title, 'listing-title'))
  const price = typeof body.price === 'number' && Number.isFinite(body.price) && body.price >= 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(body.price) : 'Price unavailable'
  card.append(el('p', price, 'listing-price'), identity(row))
  const description = el('p', typeof body.description === 'string' ? body.description : '', 'listing-description'); description.className = 'description'
  card.append(description)
  if (!detail) {
    const url = new URL(location.href); url.searchParams.set('listing', row.doc_id)
    const link = el('a', 'View listing', 'listing-open'); link.href = url.href
    link.onclick = event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); navigate(row.doc_id) } }
    card.append(link)
  }
  return card
}
async function load() {
  const current = app; if (!current) return
  if (!current.valid()) return
  const valid = current.ticket(), serial = ++request
  const listing = new URL(location.href).searchParams.get('listing')
  $('back').hidden = !listing; $('refresh').disabled = true; $('listings').replaceChildren()
  current.state('loading', listing ? 'Loading this listing and seller...' : 'Loading readable listings and sellers...')
  try {
    const { rows } = await current.w.query(query(listing), { prepare })
    if (!valid() || serial !== request) return
    rows.forEach(row => $('listings').append(render(row, Boolean(listing))))
    if (!rows.length) $('listings').append(el('p', listing ? 'Listing not found or not readable.' : 'No listings yet. Publish something worth passing on.', 'marketplace-empty'))
    current.state(rows.length ? 'success' : 'empty', rows.length ? 'Listings loaded.' : listing ? 'Listing unavailable.' : 'No readable listings yet.')
  } catch (error) { if (valid() && serial === request) current.failure(error) }
  finally { if (valid() && serial === request) $('refresh').disabled = false }
}
$('listingForm').onsubmit = async event => {
  event.preventDefault(); if (!app || publishing || !$('listingForm').reportValidity()) return
  const title = $('title').value.trim(), description = $('description').value.trim(), price = Number($('price').value)
  if (!title || !description || !Number.isFinite(price) || price < 0 || price > 999999999) { app.state('error', 'Enter a title, description and valid non-negative price.'); return }
  const current = app, valid = current.ticket()
  if (!current.valid()) return
  publishing = true; $('fields').disabled = true; current.state('loading', 'Publishing your listing...')
  try {
    const document = await current.w.create('marketplace_listings', { title, price: Math.round(price*100)/100, currency: 'USD', description }, { groups: [current.group] })
    if (!valid()) return
    $('listingForm').reset(); current.state('success', 'Listing published. Open or refresh listings to see it.')
    // Do not assume ClickHouse read-after-write visibility; retain explicit saved state.
    const link = el('a', 'Open published listing', 'marketplace-published')
    const url = new URL(location.href); url.searchParams.set('listing', document.doc_id); link.href = url.href
    $('listings').prepend(link)
  } catch (error) { if (valid()) current.failure(error) }
  finally { if (valid()) { publishing = false; $('fields').disabled = false } }
}
$('refresh').onclick = load; $('back').onclick = () => navigate(null)
window.addEventListener('popstate', load)
session('marketplace_listings', async context => { app = context; $('fields').disabled = false; await load() }, () => {
  app = null; request++; publishing = false; $('fields').disabled = true; $('refresh').disabled = true
  $('listingForm').reset(); $('listings').replaceChildren(); $('back').hidden = true
})

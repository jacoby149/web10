/* Real local gameplay; only the completed run's earned score can be submitted. */
const { el, identity, prepare, profiles, session } = window.interop
const $ = id => document.getElementById(id)
const board = $('board'), ctx = board.getContext('2d')
let app = null, timer = null, snake = [], food = null, direction = [1, 0], next = [1, 0]
let mode = 'ready', score = 0, run = null, saving = false, request = 0
const vectors = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] }
const SQL = `WITH latest_profiles AS (${profiles}), best_scores AS (
  SELECT doc_id, author_key, body, created_at FROM snake_scores
  QUALIFY row_number() OVER (PARTITION BY author_key ORDER BY JSONExtractInt(body, 'score') DESC, created_at DESC, doc_id DESC) = 1
)
SELECT s.doc_id AS doc_id, s.author_key AS author_key, s.body AS body,
  JSONExtractInt(s.body, 'score') AS score, p.body AS profile_body
FROM best_scores s LEFT JOIN latest_profiles p ON s.author_key = p.author_key
ORDER BY score DESC, s.author_key ASC, s.doc_id ASC LIMIT 50`

function draw() {
  const css = getComputedStyle(document.documentElement)
  ctx.fillStyle = css.getPropertyValue('--color-background'); ctx.fillRect(0,0,400,400)
  ctx.fillStyle = css.getPropertyValue('--color-brand-300')
  for (const [x,y] of snake) ctx.fillRect(x*20+2,y*20+2,16,16)
  if (food) { ctx.fillStyle = css.getPropertyValue('--color-brand'); ctx.beginPath(); ctx.arc(food[0]*20+10,food[1]*20+10,6,0,Math.PI*2); ctx.fill() }
}
function placeFood() {
  const free = []
  for (let y=0;y<20;y++) for (let x=0;x<20;x++) if (!snake.some(p => p[0]===x && p[1]===y)) free.push([x,y])
  food = free.length ? free[Math.floor(Math.random()*free.length)] : null
}
function controls() {
  $('score').textContent = String(score)
  $('pause').disabled = !['playing','paused'].includes(mode)
  $('pause').textContent = mode === 'paused' ? 'Resume' : 'Pause'
  $('start').disabled = mode === 'playing' || mode === 'paused' || saving
  $('submit').disabled = !app || mode !== 'over' || !run || run.saved || saving
  $('gameState').textContent = mode === 'over' ? `Game over. You earned ${score} points.` : mode === 'playing' ? 'Playing.' : mode === 'paused' ? 'Paused.' : 'Ready to play.'
}
function end() { clearInterval(timer); mode = 'over'; controls() }
function tick() {
  if (mode !== 'playing') return
  direction = next
  const head = [snake[0][0]+direction[0],snake[0][1]+direction[1]]
  const eating = food && head[0]===food[0] && head[1]===food[1]
  const occupied = eating ? snake : snake.slice(0,-1)
  if (head.some(v => v<0 || v>=20) || occupied.some(p => p[0]===head[0] && p[1]===head[1])) { end(); return }
  snake.unshift(head)
  if (eating) { score += 10; placeFood() } else snake.pop()
  draw(); controls(); if (!food) end()
}
function turn(name) {
  const v = vectors[name]
  if (mode !== 'playing' || !v || v[0]===-direction[0] && v[1]===-direction[1]) return
  next = v
}
$('start').onclick = () => {
  clearInterval(timer); snake = [[6,10],[5,10],[4,10]]; direction = next = [1,0]; score = 0
  run = { saved: false }; mode = 'playing'; placeFood(); draw(); controls(); board.focus(); timer = setInterval(tick,140)
}
$('pause').onclick = () => { if (mode === 'playing') mode = 'paused'; else if (mode === 'paused') mode = 'playing'; controls() }
document.querySelectorAll('[data-direction]').forEach(button => { button.onclick = () => turn(button.dataset.direction) })
board.addEventListener('keydown', event => {
  const key = { ArrowUp:'up',w:'up',ArrowDown:'down',s:'down',ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right' }[event.key]
  if (key) { event.preventDefault(); turn(key) }
  if (event.code === 'Space') { event.preventDefault(); $('pause').click() }
})
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') { mode = 'paused'; controls() } })
async function load() {
  const current = app; if (!current) return
  if (!current.valid()) return
  const valid = current.ticket(), serial = ++request; $('refresh').disabled = true; $('leaders').replaceChildren()
  current.state('loading', 'Loading readable scores and profiles...')
  try {
    const { rows } = await current.w.query(SQL, { prepare })
    if (!valid() || serial !== request) return
    for (const row of rows) {
      const card = el('article', undefined, 'snake-leaderboard-row')
      card.append(identity(row), el('p', `${row.score} points`, 'snake-leaderboard-score')); $('leaders').append(card)
    }
    if (!rows.length) $('leaders').append(el('p', 'No scores yet. Complete a run and save the first one.', 'snake-empty'))
    current.state(rows.length ? 'success' : 'empty', rows.length ? 'Leaderboard loaded.' : 'No readable scores yet.')
  } catch (error) { if (valid() && serial === request) current.failure(error) }
  finally { if (valid() && serial === request) $('refresh').disabled = false }
}
$('submit').onclick = async () => {
  if (!app || mode !== 'over' || !run || run.saved || saving) return
  const current = app, valid = current.ticket(), earned = score, completed = run
  if (!current.valid()) return
  saving = true; controls(); current.state('loading', 'Saving your completed run...')
  try {
    await current.w.create('snake_scores', { game: 'snake', score: earned, ts: new Date().toISOString() }, { groups: [current.group] })
    if (!valid()) return
    completed.saved = true; current.state('success', 'Earned score saved. Refresh the leaderboard to see it.')
  } catch (error) { if (valid()) current.failure(error) }
  finally { if (valid()) { saving = false; controls() } }
}
$('refresh').onclick = load
session('snake_scores', async context => { app = context; controls(); await load() }, () => {
  app = null; request++; clearInterval(timer); mode = 'ready'; run = null; saving = false; score = 0; snake = []; food = null
  $('leaders').replaceChildren(); $('refresh').disabled = true; draw(); controls()
})

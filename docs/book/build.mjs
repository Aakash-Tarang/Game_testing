// Build the book: chapters/*.md → docs/REPORT.md + docs/book.html (self-contained, KaTeX-rendered)
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import katex from 'katex'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..') // repo root
const chaptersDir = path.join(here, 'chapters')

const order = [
  '00-preface.md',
  '01-part1.md',
  '02-part2.md',
  '03-part3.md',
  '04-part4.md',
  '05-part5.md',
  '06-part6.md',
  '07-part7.md',
  '08-part8.md',
  '09-appendices.md',
]

const parts = order.map(f => fs.readFileSync(path.join(chaptersDir, f), 'utf8'))
const fullMd = parts.join('\n\n---\n\n')

/* ---------- 1. plain markdown version ---------- */
fs.writeFileSync(path.join(root, 'docs', 'REPORT.md'), fullMd)
console.log('docs/REPORT.md written', (fullMd.length / 1024).toFixed(0) + ' KB')

/* ---------- 2. math tokenization ---------- */
// extract $$...$$ (display) and $...$ (inline) BEFORE markdown, restore after
const mathTokens = []
function protectMath(md) {
  // display math first ($$ at line starts, possibly multiline)
  let out = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    mathTokens.push({ tex: tex.trim(), display: true })
    return `%%MATH${mathTokens.length - 1}%%`
  })
  // inline math: $...$ not spanning a newline; avoid $$ and prices like "$5"
  out = out.replace(/(?<![\w$])\$([^$\n]+?)\$(?![\w$])/g, (_, tex) => {
    mathTokens.push({ tex: tex.trim(), display: false })
    return `%%MATH${mathTokens.length - 1}%%`
  })
  return out
}
function restoreMath(html) {
  return html.replace(/%%MATH(\d+)%%/g, (_, i) => {
    const t = mathTokens[Number(i)]
    try {
      return katex.renderToString(t.tex, { displayMode: t.display, throwOnError: false, strict: false, output: 'html' })
    } catch (e) {
      console.error('KATEX ERROR:', t.tex.slice(0, 60), e.message)
      return `<code style="color:#ff6b6b">${t.tex}</code>`
    }
  })
}

/* ---------- 3. markdown → html ---------- */
marked.setOptions({ mangle: false, headerIds: false })
const bodyMd = protectMath(fullMd)
let bodyHtml = marked.parse(bodyMd)
bodyHtml = restoreMath(bodyHtml)

/* ---------- 4. TOC ---------- */
const toc = []
const headings = [...bodyHtml.matchAll(/<h([12]) id="(h-([^"]+))">(.*?)<\/h\1>/g)]
// marked without headerIds: generate our own ids
let idc = 0
bodyHtml = bodyHtml.replace(/<h([12])>([\s\S]*?)<\/h\1>/g, (_, lvl, inner) => {
  const id = 'sec-' + (++idc)
  const text = inner.replace(/<[^>]+>/g, '')
  if (lvl === '1') toc.push({ level: 1, id, text })
  else toc.push({ level: 2, id, text })
  return `<h${lvl} id="${id}">${inner}</h${lvl}>`
})
const tocHtml = toc.map(t =>
  `<a class="toc-${t.level}" href="#${t.id}">${t.text}</a>`).join('')

/* ---------- 5. figures (inline SVG, generated) ---------- */
const figs = {}
{
  // (a) mispricing decay 0.75^t
  const pts = Array.from({ length: 13 }, (_, t) => `${20 + t * 38},${190 - 160 * Math.pow(0.75, t)}`).join(' ')
  figs.decay = `<svg viewBox="0 0 500 220" class="fig"><rect x="0" y="0" width="500" height="220" fill="none"/>
    <text x="250" y="16" class="fig-t">injected mispricing decays: m·0.75^t  (t in ticks)</text>
    ${[1, .75, .5625, .4219, .3164, .2373, .178].map((v, i) => `<line x1="20" y1="${190 - 160 * v}" x2="480" y2="${190 - 160 * v}" class="grid"/><text x="0" y="${194 - 160 * v}" class="fig-l">${v}</text>`).join('')}
    <polyline points="${pts}" class="ln"/>
    ${Array.from({ length: 13 }, (_, t) => `<circle cx="${20 + t * 38}" cy="${190 - 160 * Math.pow(0.75, t)}" r="3" class="dot"/>`).join('')}
    ${Array.from({ length: 13 }, (_, t) => `<text x="${20 + t * 38 - 4}" y="208" class="fig-l">${t}</text>`).join('')}
  </svg>`
  // (b) 2d6 pmf
  const bars = Array.from({ length: 11 }, (_, i) => {
    const k = i + 2
    const p = (k <= 7 ? k - 1 : 13 - k) / 36
    return `<rect x="${30 + i * 40}" y="${190 - 320 * p}" width="30" height="${320 * p}" class="bar"/><text x="${40 + i * 40}" y="206" class="fig-l">${k}</text><text x="${36 + i * 40}" y="${182 - 320 * p}" class="fig-l">${p.toFixed(3)}</text>`
  }).join('')
  figs.dice = `<svg viewBox="0 0 500 220" class="fig"><text x="250" y="16" class="fig-t">P(S = k) for the sum of two dice — the triangular law</text>${bars}</svg>`
  // (c) EWMA path
  const scores = [42, 61, 55, 78, 66, 80, 71, 85]
  const ewma = []; let e = scores[0]
  scores.forEach((s, i) => { if (i) e = 0.75 * e + 0.25 * s; ewma.push(e) })
  const sx = i => 30 + i * 58, sy = v => 195 - (v / 100) * 165
  figs.ewma = `<svg viewBox="0 0 500 220" class="fig"><text x="250" y="16" class="fig-t">session scores vs EWMA(α=0.25) — the displayed skill level</text>
    ${[0, 25, 50, 75, 100].map(v => `<line x1="30" y1="${sy(v)}" x2="470" y2="${sy(v)}" class="grid"/><text x="2" y="${sy(v) + 4}" class="fig-l">${v}</text>`).join('')}
    <polyline points="${scores.map((s, i) => `${sx(i)},${sy(s)}`).join(' ')}" class="ln2"/>
    ${scores.map((s, i) => `<circle cx="${sx(i)}" cy="${sy(s)}" r="3" class="dot2"/>`).join('')}
    <polyline points="${ewma.map((s, i) => `${sx(i)},${sy(s)}`).join(' ')}" class="ln3"/>
    ${ewma.map((s, i) => `<circle cx="${sx(i)}" cy="${sy(s)}" r="3" class="dot3"/>`).join('')}
    ${scores.map((s, i) => `<text x="${sx(i) - 4}" y="212" class="fig-l">${i + 1}</text>`).join('')}
  </svg>`
  // (d) MC standard error  σ/√M
  const sig = 63.72
  const mx = M => 30 + (Math.log(M) / Math.log(2000)) * 440
  const my = v => 190 - (v / 12) * 160
  const curve = []
  for (let M = 10; M <= 2000; M += 5) curve.push(`${mx(M)},${my(sig / Math.sqrt(M))}`)
  const marks = [25, 100, 200, 800].map(M => `<circle cx="${mx(M)}" cy="${my(sig / Math.sqrt(M))}" r="3.5" class="dot"/><text x="${mx(M) - 10}" y="${my(sig / Math.sqrt(M)) - 8}" class="fig-l">M=${M}: ${-(sig / Math.sqrt(M)).toFixed(2)}</text>`).join('')
  figs.mcse = `<svg viewBox="0 0 500 220" class="fig"><text x="250" y="16" class="fig-t">Monte Carlo standard error σ/√M  (σ(q₁₀) = 63.72 measured)</text>
    ${[0, 4, 8, 12].map(v => `<line x1="30" y1="${my(v)}" x2="470" y2="${my(v)}" class="grid"/><text x="2" y="${my(v) + 4}" class="fig-l">${v}</text>`).join('')}
    <polyline points="${curve.join(' ')}" class="ln"/>${marks}
    <text x="240" y="212" class="fig-l">M (trials, log scale): 10 → 2000</text>
  </svg>`
}

/* ---------- 6. KaTeX CSS with inlined fonts ---------- */
const katexCss = fs.readFileSync(path.join(here, 'node_modules/katex/dist/katex.min.css'), 'utf8')
  .replace(/url\(([^)]+)\)/g, (_, u) => {
    const p = path.join(here, 'node_modules/katex/dist', u.replace(/^['"]|['"]$/g, ''))
    if (fs.existsSync(p)) {
      const b64 = fs.readFileSync(p).toString('base64')
      return `url(data:font/${p.endsWith('.woff2') ? 'woff2' : p.endsWith('.woff') ? 'woff' : 'ttf'};base64,${b64})`
    }
    return _
  })

/* ---------- 7. page ---------- */
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>QUANT_SIM — The Book: Theory, Build, and Proof</title>
<style>${katexCss}</style>
<style>
:root{--bg:#0b0e14;--panel:#11151f;--ink:#d7dce6;--dim:#8a93a6;--acc:#00ff88;--acc2:#ffaa00;--bad:#ff0055;--line:#232a3a}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 Georgia,'Times New Roman',serif}
.wrap{max-width:880px;margin:0 auto;padding:32px 28px 120px}
header.book{text-align:center;padding:70px 0 40px;border-bottom:1px solid var(--line);margin-bottom:34px}
header.book .mono{font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.35em;color:var(--acc)}
header.book h1{font-size:44px;margin:18px 0 10px;line-height:1.15}
header.book .sub{color:var(--dim);font-style:italic;max-width:560px;margin:0 auto}
header.book .meta{margin-top:22px;color:var(--dim);font:12.5px/1.6 ui-monospace,Menlo,monospace}
nav.toc{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px 26px;margin:0 0 46px}
nav.toc h2{margin:0 0 12px;font-size:15px;font-family:ui-monospace,Menlo,monospace;letter-spacing:.2em;color:var(--acc)}
nav.toc a{display:block;color:var(--ink);text-decoration:none;padding:2.5px 0;font-size:14.5px}
nav.toc a:hover{color:var(--acc)}
nav.toc a.toc-1{font-weight:700;margin-top:9px}
nav.toc a.toc-2{padding-left:22px;color:var(--dim)}
h1{font-size:31px;line-height:1.25;margin:64px 0 20px;padding-top:24px;border-top:1px solid var(--line)}
h1:first-of-type{border-top:none}
h2{font-size:20.5px;margin:38px 0 12px;color:#fff}
h3{font-size:16.5px;margin:28px 0 8px;color:#c9d2e3}
p{margin:12px 0;text-align:justify}
strong{color:#fff}
em{color:#e8ecf4}
a{color:var(--acc)}
code{font:13.5px/1.55 ui-monospace,'Cascadia Code',Menlo,monospace;background:#161b28;border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:#9fe8c0}
pre{background:#0d1119;border:1px solid var(--line);border-radius:10px;padding:16px 18px;overflow-x:auto}
pre code{background:none;border:none;padding:0;color:#c4cee0}
blockquote{margin:20px 0;padding:14px 20px;border-left:3px solid var(--acc);background:#0f1622;border-radius:0 10px 10px 0;color:#e6ecf5}
blockquote p{text-align:left}
table{border-collapse:collapse;width:100%;margin:20px 0;font-size:14.5px}
th{font:600 12px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--acc2);border-bottom:1.5px solid var(--line);padding:8px 10px;text-align:left}
td{border-bottom:1px solid #1a2130;padding:7.5px 10px;vertical-align:top}
tr:hover td{background:#121826}
hr{border:none;border-top:1px solid var(--line);margin:56px 0}
.katex{font-size:1.06em}
.katex-display{margin:20px 0;overflow-x:auto;overflow-y:hidden;padding:4px 0}
.katex-display>.katex{color:#eef4ff}
.fig{width:100%;max-width:640px;display:block;margin:26px auto;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px}
.fig .fig-t{fill:#aab4c8;font:italic 13.5px Georgia,serif;text-anchor:middle}
.fig .fig-l{fill:#7f8aa0;font:11px ui-monospace,Menlo,monospace}
.fig .grid{stroke:#1c2432;stroke-width:1}
.fig .ln{fill:none;stroke:var(--acc);stroke-width:2.5}
.fig .dot{fill:var(--acc)}
.fig .ln2{fill:none;stroke:#5b6778;stroke-width:2}
.fig .dot2{fill:#5b6778}
.fig .ln3{fill:none;stroke:var(--acc2);stroke-width:2.5}
.fig .dot3{fill:var(--acc2)}
.fig .bar{fill:#1f3b2f;stroke:var(--acc);stroke-width:1.4}
.figbox{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 22px;margin:26px 0}
.figbox .cap{color:var(--dim);font-size:13.5px;margin-top:8px;font-style:italic}
@media print{body{background:#fff;color:#111}.wrap{max-width:100%}pre,code,nav.toc,blockquote{background:#f5f5f5;color:#111}}
</style></head>
<body><div class="wrap">
<header class="book">
  <div class="mono">QUANT_SIM // GAME_TESTING</div>
  <h1>The Book</h1>
  <div class="sub">Theory, build, and proof: a from-first-principles account of the quant-interview
  training platform — every distribution, every PRNG line, every fair value, every experiment.</div>
  <div class="meta">Phase 0–1 record · repo: Game_testing · compiled ${new Date().toISOString().slice(0, 10)} ·
  all numbers reproducible (Appendix C)</div>
</header>
<nav class="toc"><h2>CONTENTS</h2>${tocHtml}</nav>
${bodyHtml}
${''}
</div></body></html>`

fs.writeFileSync(path.join(root, 'docs', 'book.html'), html)
console.log('docs/book.html written', (html.length / 1024).toFixed(0) + ' KB')

// inject figures after specific sections (simple anchor replacements)
let html2 = fs.readFileSync(path.join(root, 'docs', 'book.html'), 'utf8')
const inject = (anchor, fig, cap) => {
  const i = html2.indexOf(anchor)
  if (i < 0) { console.error('anchor not found:', anchor); return }
  const box = `<div class="figbox">${fig}<div class="cap">${cap}</div></div>`
  html2 = html2.slice(0, i) + box + html2.slice(i)
}
// place figures at the end of the paragraph containing the anchor text
inject('waiting three ticks costs', figs.decay, 'Figure 1 — the wasting edge: injected mispricing multiplies by 0.75 each tick; 87% of the edge is gone within five ticks (§7.5).')
inject('the same triangle the library', figs.dice, 'Figure 2 — the triangular law of two dice; the shape behind the planned Dice Market-Making contract (§2.1, §17.3).')
inject('The EWMA lags the improving scores', figs.ewma, 'Figure 3 — session scores (grey) vs the EWMA skill level (amber): a level, not a snapshot (§9.5).')
inject('its standard error is', figs.mcse, 'Figure 4 — Monte Carlo standard error falls as σ/√M: measured points at M = 25/100/200/800 with σ(q₁₀) = 63.72 (§5.3, §14.4).')
fs.writeFileSync(path.join(root, 'docs', 'book.html'), html2)
console.log('figures injected')

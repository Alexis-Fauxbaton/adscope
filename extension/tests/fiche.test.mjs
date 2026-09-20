import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { card, detail, open, signals } from './popup-dom.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const html = () => readFileSync(join(here, '../popup/popup.html'), 'utf8')

// Le résumé : l'âge en toutes lettres, puis ce que la page ne montre pas —
// depuis quand ce prix-là tient. Rouge sur le `held` de popup/fiche.js, qui
// remonte la série tant que le prix ne bouge pas : sans lui, la date affichée
// serait celle de la dernière vérification, c'est-à-dire avant-hier.
//
// Les dates du relevé sont écrites en clair : aucune horloge n'est lue, et
// l'âge vient de `onlineDays`, que le content script a compté sur la page.
const HELD = [
  { at: '2026-09-05T09:00:00.000Z', price: 12900, confirmation: false },
  { at: '2026-09-12T09:00:00.000Z', price: 12900, confirmation: true },
  { at: '2026-09-19T09:00:00.000Z', price: 12900, confirmation: true },
]

test('sur une fiche, la fenêtre résume l’âge et la tenue du prix', async () => {
  const { nodes } = await open({
    status: detail({ card: card({ onlineDays: 15, publishedAt: HELD[0].at }) }),
    cached: signals({ price_delta_since_first: 0, first_seen: HELD[0].at, price_history: HELD }),
  })
  assert.equal(nodes.fiche.hidden, false)
  assert.equal(nodes['fiche-line'].text, '15 jours en ligne · prix inchangé depuis le 5 sept.')
})

// Et quand le prix a bougé avant de se fixer, c'est la date de la marche
// courante qui se dit — pas celle de la première observation. Rouge sur le
// `let at = h[h.length - 1].at` de `held` : parti du début, il daterait la
// tenue du prix d'une valeur que l'annonce ne porte plus.
test('la tenue du prix se date de la marche en cours, pas du premier relevé', async () => {
  const { nodes } = await open({
    status: detail({ card: card({ onlineDays: 15, publishedAt: '2026-09-05T09:00:00.000Z' }) }),
    // Une hausse : la fenêtre ne la commente pas, mais le prix actuel tient
    // depuis le 12, pas depuis le 5.
    cached: signals({
      price_delta_since_first: 1000,
      first_seen: '2026-09-05T09:00:00.000Z',
      price_history: [
        { at: '2026-09-05T09:00:00.000Z', price: 11900, confirmation: false },
        { at: '2026-09-12T09:00:00.000Z', price: 12900, confirmation: false },
        { at: '2026-09-19T09:00:00.000Z', price: 12900, confirmation: true },
      ],
    }),
  })
  assert.equal(nodes['fiche-line'].text, '15 jours en ligne · prix inchangé depuis le 12 sept.')

  // Et quand la dernière observation *est* le changement, c'est elle qui date
  // la tenue : rien à remonter, et le point de départ de `held` est tout.
  const fresh = await open({
    status: detail({ card: card({ onlineDays: 15, publishedAt: '2026-09-05T09:00:00.000Z' }) }),
    cached: signals({
      price_delta_since_first: 1000,
      first_seen: '2026-09-05T09:00:00.000Z',
      price_history: [
        { at: '2026-09-05T09:00:00.000Z', price: 11900, confirmation: false },
        { at: '2026-09-19T09:00:00.000Z', price: 12900, confirmation: false },
      ],
    }),
  })
  assert.equal(fresh.nodes['fiche-line'].text, '15 jours en ligne · prix inchangé depuis le 19 sept.')
})

// Une baisse constatée se dit avec son montant et la date d'où on la compte :
// c'est l'argument de négociation, et aucune page ne l'affiche. Rouge sur le
// `r.price_delta_since_first < 0` de `price` dans popup/fiche.js.
test('une baisse relevée se dit avec son montant', async () => {
  const { nodes } = await open({
    status: detail({ card: card({ onlineDays: 118, publishedAt: '2026-05-11T09:00:00.000Z' }) }),
    cached: signals({
      first_seen: '2026-05-11T09:00:00.000Z',
      price_delta_since_first: -2000,
      price_history: [
        { at: '2026-05-11T09:00:00.000Z', price: 14900, confirmation: false },
        { at: '2026-07-20T09:00:00.000Z', price: 12900, confirmation: false },
      ],
    }),
  })
  assert.equal(nodes['fiche-line'].text, '3 mois en ligne · prix baissé de 2\u202f000\u00a0€ depuis le 11 mai')
})

// Sans relevé, aucune stabilité n'est affirmée : on ne l'a pas observée.
// Rouge sur le `if (!r) return null` de `price`.
test('sans relevé mutualisé, la fenêtre ne parle pas du prix', async () => {
  const { nodes } = await open({ status: detail(), cached: null })
  assert.equal(nodes['fiche-line'].text, '3 mois en ligne')
})

// Le défaut le plus grave de l'ancienne fenêtre : `publishedAt` nul comptait
// comme l'époque Unix, et le sujet annonçait « 56 ans 8 mois ». Rouge sur le
// `card.onlineDays == null` de `age` dans popup/fiche.js.
test("sans date de mise en ligne, la fenêtre n'énonce aucun âge", async () => {
  const { nodes } = await open({
    status: detail({ card: card({ onlineDays: null, publishedAt: null }) }),
    cached: signals(),
  })
  assert.match(nodes['fiche-line'].text, /^date absente de la page/)
  assert.doesNotMatch(nodes['fiche-line'].text.split('·')[0], /\d/)
})

// La fenêtre ne nomme aucun site : elle demande au registre celui que le
// diagnostic désigne.
test('le nom du site vient du registre', async () => {
  const { nodes } = await open({ status: detail(), cached: signals() })
  assert.equal(nodes.site.textContent, 'leboncoin')
  const other = await open({ status: detail({ site: 'lc' }), cached: signals() })
  assert.equal(other.nodes.site.textContent, 'La Centrale')
})

// Le suivi : même geste que dans le panneau, même route — le service worker.
// Rouge sur le `ask({ type: 'follow', ... })` de `showFiche` dans popup.js.
test('le bouton Suivre passe par le service worker, avec la fiche ouverte', async () => {
  const { nodes, messages } = await open({ status: detail(), cached: signals() })
  assert.equal(nodes.follow.textContent, 'Suivre')
  await nodes.follow.onclick()
  assert.deepEqual(messages.filter((m) => m.type === 'follow'), [{ type: 'follow', site: 'lbc', siteId: '1' }])
  assert.equal(nodes.follow.textContent, 'Suivie')
})

// Un suivi refusé ne se dit pas pris. Rouge sur le `if (res && res.ok)` du même
// `showFiche` : sans lui, le bouton mentirait sur un serveur muet.
test('un suivi refusé laisse le bouton sur « Suivre »', async () => {
  const { nodes } = await open({ status: detail(), cached: signals(), followed: { ok: false } })
  await nodes.follow.onclick()
  assert.equal(nodes.follow.textContent, 'Suivre')
})

// Une annonce déjà suivie le dit d'emblée, et son bouton ne fait plus rien.
test('une annonce déjà suivie ouvre la fenêtre sur « Suivie »', async () => {
  const { nodes, messages } = await open({ status: detail(), cached: signals({ followed: true }) })
  assert.equal(nodes.follow.textContent, 'Suivie')
  assert.equal(nodes.follow.onclick, null)
  assert.deepEqual(messages.filter((m) => m.type === 'follow'), [])
})

// Le diagnostic reste accessible, mais sous deux replis : c'est un outil de
// dépannage, pas le produit.
test('le diagnostic quitte le premier plan, sous les réglages', () => {
  const page = html()
  const tools = page.slice(page.indexOf('<details'))
  for (const id of ['id="state"', 'id="cache"', 'id="key"', 'id="api"']) {
    assert.ok(tools.includes(id), `${id} devrait vivre sous le repli de dépannage`)
  }
  assert.ok(page.indexOf('id="fiche"') < page.indexOf('<details'))
  // Et le diagnostic est replié dans les réglages, pas à côté d'eux.
  assert.ok(page.indexOf('id="diag"') > page.indexOf('id="tools"'))
  assert.ok(page.indexOf('id="state"') > page.indexOf('id="diag"'))
})

// Une extension ne va pas chercher de fonte au dehors, et n'émet aucune requête
// hors API : rouge sur la déclaration `font:` de popup/popup.css.
test('la fenêtre ne charge rien depuis le dehors', () => {
  const page = html()
  const css = readFileSync(join(here, '../popup/popup.css'), 'utf8')
  assert.doesNotMatch(page + css, /fonts\.googleapis|fonts\.gstatic|https?:\/\/(?!localhost)/)
  assert.match(css, /-apple-system/)
})

// Pas d'`innerHTML` : la fenêtre compose des nœuds, elle n'injecte pas de
// balisage — et elle affiche du texte tiré de pages tierces.
const scripts = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? scripts(p) : p.endsWith('.js') ? [p] : []
  })

test("aucun module ne construit son affichage par balisage", () => {
  const found = [...scripts(join(here, '../popup')), ...scripts(join(here, '../src'))]
  assert.ok(found.length > 10)
  for (const f of found) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /innerHTML|outerHTML|insertAdjacentHTML/, f)
  }
})

// Rien d'orphelin : ce que popup.html charge existe, et ce qui vit dans
// popup/ est chargé. Rouge sur toute suppression à moitié faite.
test('la fenêtre charge exactement les modules qui existent', () => {
  const declared = [...html().matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
  for (const s of declared) assert.ok(statSync(join(here, '../popup', s)).isFile(), s)
  const own = declared.filter((s) => !s.startsWith('../')).map((s) => s.replace('./', ''))
  const files = readdirSync(join(here, '../popup')).filter((f) => f.endsWith('.js'))
  assert.deepEqual([...own].sort(), files.sort())
})

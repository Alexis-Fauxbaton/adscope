import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { ago, card, detail, open, signals } from './popup-dom.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const html = () => readFileSync(join(here, '../popup/popup.html'), 'utf8')

const kinds = (nodes) =>
  nodes.plot.all.filter((n) => n.tag === 'circle' && n.getAttribute('data-point'))

// La popup devient la surface principale sur les fiches : l'annonce, son
// ancienneté réelle, sa courbe. Le sujet est la durée, pas le diagnostic.
test("sur une fiche, la fenêtre met l'annonce et son ancienneté réelle en sujet", async () => {
  const { nodes } = await open({ status: detail(), cached: signals() })
  assert.equal(nodes.fiche.hidden, false)
  assert.match(nodes['fiche-title'].text, /Peugeot 208 phase 2/)
  assert.match(nodes['fiche-specs'].text, /12 900 €/)
  assert.match(nodes['fiche-specs'].text, /3 574 km/)
  assert.match(nodes['fiche-specs'].text, /2020/)
  // L'ancienneté réelle en gros, le compte de jours exact à côté.
  assert.match(nodes['age-main'].text, /3 mois/)
  assert.match(nodes['age-days'].text, /118 j/)
})

// Décision de revue : sous 31 jours, la popup disait « N j », le panneau
// « N jours » — deux mots pour le même nombre. `ADS.format.spell`, partagé
// par les deux surfaces, épelle désormais « jours » partout.
test('sous 31 jours, la fenêtre épelle « jours », jamais l’abréviation', async () => {
  const { nodes } = await open({
    status: detail({ card: card({ onlineDays: 5, publishedAt: ago(5) }) }),
  })
  assert.equal(nodes['age-main'].text, '5 jours')
})

// Le défaut le plus grave du lot : `publishedAt` nul comptait comme l'époque
// Unix, et le sujet de la fenêtre annonçait « 56 ans 8 mois · 20 702 j » en
// 27 pixels — pendant que l'axe de la même fenêtre disait « 6 sept. → auj. ».
// La courbe se dégrade honnêtement ; le titre doit en faire autant.
test("sans date de mise en ligne, la fenêtre n'énonce aucun âge", async () => {
  const { nodes } = await open({
    status: detail({ card: card({ onlineDays: null, publishedAt: null }) }),
    cached: signals(),
  })
  assert.equal(nodes.fiche.hidden, false)
  assert.match(nodes['age-main'].text, /absente/)
  assert.doesNotMatch(nodes['age-main'].text, /\d/)
  assert.equal(nodes['age-days'].text, '')
  assert.equal(nodes['age-days'].hidden, true)
  // L'axe part de la première observation, jamais d'un jour inventé : replié sur
  // aujourd'hui, il écraserait les cinq observations sur un seul point.
  const abscissas = new Set(kinds(nodes).map((p) => p.getAttribute('cx')))
  assert.equal(abscissas.size, 5, [...abscissas].join(' '))
  assert.match(nodes['axis-start'].text, /\d{4}/)
})

// La fenêtre ne nomme aucun site : elle demande au registre celui que le
// diagnostic désigne.
test('le nom du site vient du registre', async () => {
  const { nodes } = await open({ status: detail(), cached: signals() })
  assert.equal(nodes.site.textContent, 'leboncoin')
  const other = await open({ status: detail({ site: 'lc' }), cached: signals() })
  assert.equal(other.nodes.site.textContent, 'La Centrale')
})

test('la courbe distingue les changements de prix des vérifications', async () => {
  const { nodes } = await open({ status: detail(), cached: signals() })
  const points = kinds(nodes)
  assert.equal(points.filter((p) => p.getAttribute('data-point') === 'change').length, 3)
  assert.equal(points.filter((p) => p.getAttribute('data-point') === 'check').length, 2)
  // Le gros point et le petit ne se confondent pas à l'œil.
  const big = Number(points.find((p) => p.getAttribute('data-point') === 'change').getAttribute('r'))
  const small = Number(points.find((p) => p.getAttribute('data-point') === 'check').getAttribute('r'))
  assert.ok(big >= small * 2, `${big} contre ${small}`)
})

// L'exigence : jamais un mot seul. La hachure dit à partir de quand on regarde,
// et elle le dit sous l'axe — la seule ligne où aucun montant ne passe.
test('la hachure porte une date explicite, sous l’axe', async () => {
  const { nodes } = await open({
    status: detail({ card: card({ onlineDays: 1810, publishedAt: ago(1810), notable: true }) }),
  })
  assert.equal(nodes.hatch.hidden, false)
  assert.match(nodes.hatch.text, /aucune observation avant le \d+ \p{L}+/u)
})

test("la hachure reste lisible même quand la période aveugle est étroite", async () => {
  const { nodes } = await open({ status: detail(), cached: signals({
    first_seen: ago(110),
    price_history: [{ at: ago(110), price: 12900, confirmation: false }],
  }) })
  assert.equal(nodes.hatch.hidden, false)
  assert.match(nodes.hatch.text, /aucune observation avant le \d+ \p{L}+/u)
})

// Ce que le tracé cède quand la place manque, le relevé le porte : un montant
// retiré du dessin ne disparaît pas de la fenêtre.
test('le montant qui cède sa place se retrouve au relevé', async () => {
  const { nodes } = await open({
    status: detail({ card: card({ onlineDays: 1810, publishedAt: ago(1810) }) }),
    cached: signals({
      price_history: [
        { at: ago(118), price: 22900, confirmation: false },
        { at: ago(60), price: 21500, confirmation: false },
        { at: ago(2), price: 22700, confirmation: false },
      ],
    }),
  })
  const drawn = nodes.plot.all.filter((n) => n.tag === 'text' && n.getAttribute('class'))
  assert.equal(drawn.length, 1, drawn.map((n) => n.textContent).join(' | '))
  assert.match(drawn[0].textContent, /22\u202f700/)
  assert.match(nodes['points-rows'].text, /22\u202f900\u00a0€/)
})

// Un seul usage pour la bande rouge : ce que le site montre de son côté.
test('la bande rouge et la contradiction du site vont ensemble', async () => {
  const claim = { label: 'La Centrale affiche', says: 'Publiée il y a 60 jours', note: 'compteur plafonné à 60 jours', days: 60 }
  const { nodes } = await open({
    status: detail({ site: 'lc', card: card({ onlineDays: 1810, publishedAt: ago(1810), notable: true, claim }) }),
  })
  assert.equal(nodes.claim.hidden, false)
  assert.match(nodes.claim.text, /Publiée il y a 60 jours/)
  assert.match(nodes.claim.text, /compteur plafonné à 60 jours/)
  const band = nodes.plot.all.find((n) => n.getAttribute('data-band'))
  assert.ok(band, 'la bande rouge est tracée')
  // Dix pixels sur trois cents : soixante jours sur mille huit cent dix.
  assert.ok(Number(band.getAttribute('width')) < 20, band.getAttribute('width'))
})

test("sans contradiction, ni bande rouge ni bloc", async () => {
  const { nodes } = await open({ status: detail(), cached: signals() })
  assert.equal(nodes.claim.hidden, true)
  assert.equal(nodes.plot.all.find((n) => n.getAttribute('data-band')), undefined)
})

// Un dessin sans nom n'existe pas pour qui ne le voit pas, et le survol est une
// affaire de souris : au clavier, aucun point n'était atteignable.
test('la courbe porte un nom accessible et son relevé de valeurs', async () => {
  const { nodes } = await open({ status: detail(), cached: signals() })
  const svg = nodes.plot.children[0]
  assert.equal(svg.getAttribute('role'), 'img')
  const title = svg.children.find((n) => n.tag === 'title')
  assert.ok(title, 'la courbe porte un titre')
  assert.equal(svg.getAttribute('aria-labelledby'), title.getAttribute('id'))
  assert.match(title.textContent, /Prix observé/)
  assert.match(title.textContent, /5 observations/)

  // Les mêmes valeurs en toutes lettres, sous un repli que la tabulation ouvre.
  assert.equal(nodes.points.hidden, false)
  assert.equal(nodes['points-rows'].children.length, 5)
  assert.match(nodes['points-rows'].text, /12\u202f900\u00a0€/)
  assert.match(nodes['points-rows'].text, /vérification/)
  assert.match(nodes['points-rows'].text, /changement/)
})

test("sans observation, le relevé ne s'ouvre pas sur du vide", async () => {
  const { nodes } = await open({
    status: detail({ card: card({ price: null }) }),
    cached: null,
  })
  assert.equal(nodes.points.hidden, true)
  assert.equal(nodes['points-rows'].children.length, 0)
})

// Le suivi mutualisé se lit avec sa date de dernière vérification : « stable
// depuis deux mois » ne vaut que ce que valent les observations qui l'ont vu.
test('le suivi mutualisé porte sa date de dernière vérification', async () => {
  const { nodes } = await open({ status: detail(), cached: signals() })
  assert.match(nodes.tracking.text, /Suivie depuis/)
  assert.match(nodes.tracking.text, /Dernière vérification/)
  assert.match(nodes.tracking.text, /\d+ \p{L}+/u)
})

test("sans suivi, la fenêtre montre la courbe sans prétendre à un historique", async () => {
  const { nodes } = await open({ status: detail(), cached: null })
  assert.equal(nodes.fiche.hidden, false)
  assert.equal(kinds(nodes).length, 1)
  assert.equal(nodes.tracking.text, '')
})

// Le correctif obtenu de haute lutte : la portée se lit avant les chiffres,
// jamais reléguée après eux.
test('la portée des statistiques vendeur précède les chiffres', async () => {
  const { nodes } = await open({ status: detail(), cached: signals() })
  const scope = nodes.seller.children.findIndex((n) => /catalogue réel nous est inconnu/.test(n.text))
  const first = nodes.seller.children.findIndex((n) => /Médiane d'ancienneté/.test(n.text))
  assert.ok(scope >= 0 && first >= 0)
  assert.ok(scope < first, 'la portée est reléguée après les chiffres')
})

// Le diagnostic reste accessible, mais c'est un outil de dépannage.
test('le diagnostic quitte le premier plan', async () => {
  const page = html()
  const tools = page.slice(page.indexOf('<details'))
  for (const id of ['id="state"', 'id="cache"', 'id="key"', 'id="api"']) {
    assert.ok(tools.includes(id), `${id} devrait vivre sous le repli de dépannage`)
  }
  assert.ok(page.indexOf('id="fiche"') < page.indexOf('<details'))
})

// Sur une page de résultats, le résumé — et rien de la fiche.
test("sur des résultats, la fenêtre résume la page lue", async () => {
  const { nodes } = await open({
    status: { kind: 'listing', site: 'lc', url: '/listing', payload: true, listings: 23, pro: 21, badges: 23, sent: 23, old: 9, alerts: 4 },
  })
  assert.equal(nodes.fiche.hidden, true)
  assert.equal(nodes.summary.hidden, false)
  assert.match(nodes['summary-rows'].text, /23/)
  assert.match(nodes['summary-rows'].text, /9/)
  assert.match(nodes['summary-rows'].text, /4/)
})

// La fenêtre sait énumérer les sites pris en charge : elle le demande au
// registre au lieu de l'ignorer.
test('sans page analysée, la fenêtre nomme les sites pris en charge', async () => {
  const { nodes } = await open({ status: undefined })
  assert.equal(nodes.empty.hidden, false)
  assert.match(nodes.empty.text, /leboncoin/)
  assert.match(nodes.empty.text, /La Centrale/)
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

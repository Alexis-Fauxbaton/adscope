process.env.TZ = 'Europe/Paris'

import test from 'node:test'
import assert from 'node:assert/strict'
import { crossedIn, feed, market, revisits } from '../js/fixtures.js'
import { factsOf } from '../js/facts.js'
import { marketQuery } from '../js/query.js'

// Rouge sur le `t > start` de `crossedIn` dans js/fixtures.js : avec `>=`, une
// annonce déjà à 60 jours au début de la fenêtre le « franchirait » encore, et
// le marchand verrait tous les matins le même seuil.
test('un seuil n’est franchi que s’il ne l’était pas au début de la fenêtre', () => {
  assert.equal(crossedIn(92, 7), 90)
  assert.equal(crossedIn(67, 7), null)
  assert.equal(crossedIn(61, 7), 60)
  assert.equal(crossedIn(30, 7), 30)
  assert.equal(crossedIn(29, 7), null)
})

// Rouge sur le `crossed[crossed.length - 1]` de js/fixtures.js : le contrat
// demande **le plus haut** seuil franchi pendant la fenêtre.
test('deux seuils franchis dans la fenêtre rendent le plus haut', () => {
  assert.equal(crossedIn(62, 40), 60)
  assert.equal(crossedIn(95, 70), 90)
})

// Rouge sur le `filter(([daysAgo]) => daysAgo <= sinceDays)` de js/fixtures.js :
// sans la fenêtre, la bascule 24 h / 7 jours montrerait deux fois la même chose.
test('la fenêtre de 24 heures montre moins que celle de 7 jours', () => {
  const bouges = (jours) => feed({ since_days: jours }).items
    .filter((i) => factsOf(i).length)
  assert.equal(bouges(1).length, 2)
  assert.equal(bouges(7).length, 4)
  // La Polo a baissé deux fois, il y a cinq jours et hier : sur 24 heures, une
  // seule des deux baisses est dedans, et le cumul affiché n'est pas le même.
  const polo = (jours) => factsOf(bouges(jours).find((i) => i.model === 'Polo'))[0].text
  assert.equal(polo(1), '−400 € le 17 sept.')
  assert.equal(polo(7), '−900 € en 2 baisses, le dernier le 17 sept.')
})

// Rouge sur `movedRank` dans js/fixtures.js : le contrat trie « ce qui a bougé
// d'abord », et une disparition passe devant une baisse.
test('le fil est trié : ce qui a bougé d’abord', () => {
  const kinds = feed({ since_days: 7 }).items
    .map((i) => factsOf(i)[0] && factsOf(i)[0].kind)
  assert.deepEqual(kinds.slice(0, 4), ['disappeared', 'dropped', 'dropped', 'crossed'])
  assert.deepEqual(kinds.slice(4), [undefined, undefined, undefined, undefined])
})

// Règle produit : l'identité d'un vendeur n'est servie que s'il est
// professionnel. Rouge sur les `null` de la colonne `seller_name` des lignes
// `'private'` de MARKET_ROWS, dans js/fixtures-data.js — y poser un nom, comme
// une fixture bâclée le ferait, fait afficher à l'écran ce que l'API ne sert
// pas.
test('un particulier n’a pas de nom', () => {
  const { items } = market(marketQuery({ sellerType: 'private' }, { limit: 100 }))
  assert.ok(items.length > 0)
  for (const item of items) assert.equal(item.seller_name, null)
  const pros = market(marketQuery({ sellerType: 'pro' }, { limit: 100 })).items
  for (const item of pros) assert.ok(item.seller_name)
})

test('les fixtures du marché tiennent le contrat demandé', () => {
  const { total, items } = market(marketQuery({}, { limit: 100 }))
  assert.equal(total, 31)
  assert.equal(items.length, 31)
  for (const item of items) {
    assert.ok(item.url.startsWith('https://'))
    assert.ok(item.price_delta_since_first <= 0)
    assert.equal(item.disappeared_at, null)
    assert.ok(item.label)
  }
  // Rouge sur le `model === 'Autres'` et le `startsWith` de `demoLabel` dans
  // js/fixtures-search.js : sans eux, le marchand lirait « Corvette Autres
  // C3 Stingray 5.7 V8 » et « Mini Cooper Cooper S III Chili » sur la carte.
  assert.equal(items.find((i) => i.brand === 'Corvette').label, 'Corvette C3 Stingray 5.7 V8')
  assert.equal(items.find((i) => i.brand === 'Mini').label, 'Mini Cooper S III Chili')
})

// Rouge sur le `mots.every(...)` de `matchesQuery` (js/fixtures-search.js) :
// une recherche par famille (« land rover », « citroën c3 ») que l'ancien
// champ coupait en marque/modèle ne rendait jamais rien (2026-09-18 :
// `ferrari` → 0, `Ferrari` → 390).
test('la recherche q est tolérante à la casse, aux accents, à l’ordre des mots', () => {
  const casse = market(marketQuery({ q: 'CORVETTE' }, { limit: 100 }))
  assert.equal(casse.total, 1)
  const accents = market(marketQuery({ q: 'citroen c3' }, { limit: 100 }))
  assert.equal(accents.total, 2)
  const ordre = market(marketQuery({ q: 'c3 citroën' }, { limit: 100 }))
  assert.equal(ordre.total, 2)
  const chaqueMot = market(marketQuery({ q: 'corvette cabriolet' }, { limit: 100 }))
  assert.equal(chaqueMot.total, 0)
})

// Rouge sur le `!== model.toLowerCase()` de `matches` dans js/fixtures.js :
// avec un `.includes(...)`, chercher le modèle « C3 » rendrait aussi les
// annonces dont la version le mentionne en passant.
test('le filtre model est exact, pas un sous-texte', () => {
  const exact = market(marketQuery({ brand: 'Corvette', model: 'Autres' }, { limit: 100 }))
  assert.equal(exact.total, 1)
  const trop = market(marketQuery({ brand: 'Corvette', model: 'C3' }, { limit: 100 }))
  assert.equal(trop.total, 0)
})

// Rouge sur les comparateurs de `ORDERS` dans js/fixtures.js.
test('chaque tri ordonne ce qu’il annonce', () => {
  const page = (sort) => market(marketQuery({ sort }, { limit: 100 })).items
  const anciennes = page('age_desc')
  assert.equal(anciennes[0].age_days, 592)
  assert.equal(page('recent')[0].age_days, 29)
  assert.equal(page('drop_desc')[0].price_delta_since_first, -2600)
})

// Rouge sur le `item.age_days < minAge` et le `dropped` de `matches` dans
// js/fixtures.js : le mode démo doit filtrer comme l'API, sinon la capture
// montre un écran qui n'existera pas.
test('les filtres du mode démo mordent vraiment', () => {
  const vieilles = market(marketQuery({ minAgeDays: 90 }, { limit: 100 })).items
  assert.ok(vieilles.length < 31 && vieilles.length > 0)
  for (const item of vieilles) assert.ok(item.age_days >= 90)
  const baissees = market(marketQuery({ dropped: true }, { limit: 100 })).items
  for (const item of baissees) assert.ok(item.price_delta_since_first < 0)
  const clios = market(marketQuery({ brand: 'renault', model: 'clio' }, { limit: 100 }))
  assert.equal(clios.total, 3)
})

// Rouge sur le `Math.min(limit, REVISIT_IDS.length)` de `revisits` dans
// js/fixtures.js : la file factice doit respecter `limit` comme la vraie
// route, sinon la capture d'écran ment sur ce que l'API rend.
test('la file de revisite factice respecte la limite demandée', () => {
  assert.equal(revisits({ limit: 2 }).length, 2)
  assert.ok(revisits({ limit: 999 }).length <= 5)
  for (const item of revisits({ limit: 40 })) {
    assert.deepEqual(Object.keys(item).sort(), ['site', 'site_id', 'url'])
    assert.equal(item.site, 'lbc')
  }
})

// Rouge sur le `slice(offset, offset + limit)` de js/fixtures.js : « Voir
// plus » redemanderait la même page.
test('la pagination avance sans redonner la même page', () => {
  const un = market(marketQuery({}, { limit: 20, offset: 0 }))
  const deux = market(marketQuery({}, { limit: 20, offset: 20 }))
  assert.equal(un.items.length, 20)
  assert.equal(deux.items.length, 11)
  assert.equal(un.total, deux.total)
  const ids = new Set(un.items.map((i) => i.site_id))
  for (const item of deux.items) assert.ok(!ids.has(item.site_id))
})

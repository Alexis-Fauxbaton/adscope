import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const src = (f) => join(here, '../src/', f)

// Le registre se charge seul ; les modules de site s'y déclarent en se chargeant.
const sites = require(src('sites.js'))
require(src('sites/read.js'))
require(src('sites/leboncoin.js'))
require(src('sites/lacentrale.js'))

const LBC = 'https://www.leboncoin.fr'
const LC = 'https://www.lacentrale.fr'

test("le site courant se résout par l'origine de la page", () => {
  assert.equal(sites.at(LBC).id, 'lbc')
  assert.equal(sites.at(LC).id, 'lc')
  // Une origine voisine n'est pas le site : rien ne se devine par ressemblance.
  assert.equal(sites.at('https://www.leboncoin.fr.evil.tld'), null)
  assert.equal(sites.at('https://www.autoscout24.fr'), null)
  assert.equal(sites.at(undefined), null)

  globalThis.location = { origin: LC }
  assert.equal(sites.current().id, 'lc')
  globalThis.location = { origin: LBC }
  assert.equal(sites.current().id, 'lbc')
  globalThis.location = { origin: 'https://example.com' }
  assert.equal(sites.current(), null)
})

test("chaque site couvre l'origine qu'il déclare, et une seule fois", () => {
  const ids = sites.all().map((s) => s.id)
  assert.deepEqual([...ids].sort(), ['lbc', 'lc'])
  const origins = sites.all().flatMap((s) => s.origins)
  assert.equal(new Set(origins).size, origins.length)
})

// L'identifiant d'une annonce ne s'écrit pas de la même façon d'un site à
// l'autre : six chiffres au moins ici, une référence alphanumérique là.
test("l'identifiant d'annonce est lu selon le site", () => {
  assert.equal(sites.at(LBC).urlId('/ad/voitures/3254194817'), '3254194817')
  assert.equal(sites.at(LBC).urlId('/voitures/occasions'), null)

  assert.equal(sites.at(LC).urlId('/auto-occasion-annonce-87103538172.html'), 'W103538172')
  assert.equal(sites.at(LC).urlId('/auto-occasion-annonce-66101733515.html'), 'B101733515')
  assert.equal(sites.at(LC).urlId('/listing?makesModelsCommercialNames=PEUGEOT'), null)
})

// La lecture de leboncoin appliquée à une adresse La Centrale rendrait un
// nombre qui n'est l'identifiant de personne : c'est ce que le registre évite.
test("la référence La Centrale n'est pas une suite de chiffres", () => {
  const path = '/auto-occasion-annonce-87103538172.html'
  assert.notEqual(sites.at(LC).urlId(path), sites.at(LBC).urlId(path))
  assert.match(sites.at(LC).urlId(path), /^[A-Z]\d+$/)
})

const ago = (days) => new Date(Date.now() - days * 86400000)
const lbcAd = (online, bumped) => ({ site: 'lbc', publishedAt: ago(online), bumpedAt: ago(bumped) })
const lcAd = (online, bumped) => ({ site: 'lc', publishedAt: ago(online), bumpedAt: bumped == null ? null : ago(bumped) })

// Les bornes de leboncoin ont été mesurées sur ses données ; La Centrale a les
// siennes, et l'alerte n'y repose pas sur les mêmes faits.
test('les seuils qui déclenchent l\'alerte sont propres à chaque site', () => {
  const now = new Date()
  // Ancienne et poussée : l'alerte de leboncoin. La Centrale ne la reprend pas —
  // sa marque de mise à jour ne distingue rien.
  assert.equal(sites.at(LBC).signals(lbcAd(400, 2), now).notable, true)
  assert.equal(sites.at(LC).signals(lcAd(40, 2), now).notable, false)

  // Le plafond du compteur : l'alerte de La Centrale, et elle seule y suffit.
  assert.equal(sites.at(LC).signals(lcAd(1810, null), now).notable, true)
  assert.equal(sites.at(LC).signals(lcAd(1810, null), now).capped, true)
  // Sans réactualisation, la même ancienneté ne met pas leboncoin en alerte :
  // sa page affiche déjà l'âge.
  assert.equal(sites.at(LBC).signals({ ...lbcAd(1810, 1810) }, now).notable, false)
  assert.equal(sites.at(LBC).signals({ ...lbcAd(1810, 1810) }, now).dormant, true)

  // `capped` n'existe que là où un compteur plafonne.
  assert.equal(sites.at(LBC).signals(lbcAd(1810, 2), now).capped, undefined)
})

test('chaque site nomme lui-même ce que sa date de mise à jour atteste', () => {
  const s = { onlineDays: 400, bumped: true, bumpedDaysAgo: 2, notable: false, dormant: false }
  const lbc = sites.at(LBC)
  const lc = sites.at(LC)
  assert.match(lbc.words.bump(s), /réactualisée/)
  assert.equal(lbc.words.bumpLabel, 'Réactualisée')
  // La Centrale ne dit pas pourquoi l'annonce a bougé : remontée payée ou
  // correction de prix. Le mot de leboncoin y affirmerait une cause.
  assert.doesNotMatch(lc.words.bump(s), /réactualis/i)
  assert.doesNotMatch(lc.words.bumpLabel, /Réactualis/i)
})

test('chaque site nomme lui-même la contradiction que sa page affiche', () => {
  const bumped = { bumped: true, capped: false }
  const capped = { bumped: false, capped: true }
  const lbc = sites.at(LBC).claim(bumped, "aujourd'hui à 21:14")
  assert.equal(lbc.label, 'leboncoin affiche')
  assert.match(lbc.note, /réactualisation/)

  const lc = sites.at(LC).claim(capped, 'Publiée il y a 60 jours')
  assert.match(lc.label, /La Centrale/)
  assert.match(lc.note, /60/)
  // Chaque site ne montre que la contradiction que sa page produit.
  assert.equal(sites.at(LC).claim(bumped, 'Publiée il y a 12 jours'), null)
  assert.equal(sites.at(LBC).claim(capped, "aujourd'hui à 21:14"), null)
})

// La promesse de l'architecture : ajouter un site, c'est ajouter un fichier.
// Elle ne tient que si le code partagé n'en nomme aucun. La garde ne balayait
// que le premier niveau de `src/` : ni la fenêtre, ni les sous-dossiers — et
// c'est là qu'un commentaire devenu faux avait survécu.
const scripts = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return scripts(path)
    return e.name.endsWith('.js') ? [path] : []
  })

// Qui est partagé et qui appartient à un site, le manifeste le dit déjà : un
// fichier que tous les blocs de content scripts chargent sert les deux sites ;
// celui qu'un seul charge est le module d'un site. Rien à tenir à jour ici.
const OWNERS = (() => {
  const cs = JSON.parse(readFileSync(join(here, '../manifest.json'), 'utf8')).content_scripts
  const sites = new Set(cs.flatMap((b) => b.matches))
  const by = {}
  for (const b of cs) for (const f of b.js) (by[f] ||= new Set()).add(b.matches.join())
  return { by, count: sites.size }
})()

const own = (path) => {
  const rel = path.slice(path.indexOf('/extension/') + '/extension/'.length)
  return OWNERS.by[rel] && OWNERS.by[rel].size < OWNERS.count
}

test('aucun module partagé ne nomme un site', () => {
  const NAMED = /leboncoin|lacentrale|la\s*centrale|\blbc\b|\blc\b/i
  const found = [...scripts(src('.')), ...scripts(join(here, '../popup'))]
  const shared = found.filter((f) => !own(f))
  const names = shared.map((f) => f.split('/').pop())
  // La garde couvre les trois surfaces : le tronc, la fenêtre, et l'outil de
  // lecture qui vit parmi les modules de site sans en nommer aucun.
  for (const f of ['sites.js', 'view.js', 'popup.js', 'seller.js', 'read.js', 'sw.js']) {
    assert.ok(names.includes(f), `${f} échappe à la garde`)
  }
  for (const f of shared) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), NAMED, `${f} nomme un site`)
  }
  // Et tout ce qui en nomme un est bien un module de site, déclaré comme tel.
  for (const f of found.filter(own)) assert.match(f, /\/sites\/[\w-]+\.js$/)
})

// Le pire défaut possible pour ce produit : un nombre faux énoncé avec autorité.
// Une charge peut porter la clé de date sans valeur ; comptée en millisecondes,
// `null` rend l'époque Unix — « 56 ans 8 mois · 20 702 j », et le badge au rouge.
// La règle est la même partout : sans date, aucun âge, et rien qui en dépende.
test("sans date de mise en ligne, aucun site n'énonce d'âge", () => {
  const now = new Date()
  for (const site of sites.all()) {
    const s = site.signals({ site: site.id, publishedAt: null, bumpedAt: new Date() }, now)
    assert.equal(s.onlineDays, null, `${site.id} énonce un âge sans date`)
    for (const flag of ['notable', 'old', 'dormant', 'bumped']) {
      assert.equal(s[flag], false, `${site.id}.${flag} sans date`)
    }
    assert.equal(s.bumpedDaysAgo, null, site.id)
    assert.notEqual(s.capped, true, site.id)
  }
})

// La sonde de charge vivait dans le code partagé et n'y nommait aucun site — elle
// en décrivait pourtant la structure : « Données trouvées : non » s'affichait sur
// La Centrale, qui n'est pas une application Next, au-dessus d'un panneau qui
// montrait 23 annonces lues. Chaque site sait, lui, comment voir sa charge.
test('chaque site constate lui-même que sa charge est présente', () => {
  for (const s of sites.all()) assert.equal(typeof s.payload, 'function', `${s.id} sans sonde`)
  const empty = { getElementById: () => null, querySelectorAll: () => [] }
  for (const s of sites.all()) assert.equal(s.payload(empty), false, `${s.id} sur une page vide`)
})

// Le nom lisible d'un site est du vocabulaire de site : la fenêtre l'affiche
// sans le connaître, elle le demande au registre.
test('chaque site déclare son nom lisible', () => {
  assert.equal(sites.at(LBC).name, 'leboncoin')
  assert.equal(sites.at(LC).name, 'La Centrale')
  for (const s of sites.all()) assert.equal(typeof s.name, 'string')
})

// Le résumé d'une page de résultats compte les annonces qui dépassent le seuil
// d'ancienneté du site. Chaque site pose le sien, aucun ne l'emprunte.
test("chaque site dit lui-même quelle annonce dépasse son seuil d'ancienneté", () => {
  const now = new Date()
  assert.equal(sites.at(LBC).signals(lbcAd(40, 40), now).old, true)
  assert.equal(sites.at(LBC).signals(lbcAd(20, 20), now).old, false)
  assert.equal(sites.at(LC).signals(lcAd(40, null), now).old, true)
  assert.equal(sites.at(LC).signals(lcAd(20, null), now).old, false)
  // Le plafond est franchi bien après le seuil : une annonce en alerte est
  // toujours une annonce qui dépasse.
  assert.equal(sites.at(LC).signals(lcAd(1810, null), now).old, true)
})

// La bande rouge de la courbe montre ce que le site affiche de son côté : sa
// durée est du vocabulaire de site, pas une constante de la fenêtre.
test('la contradiction porte la durée que le site montre', () => {
  const capped = { bumped: false, capped: true }
  assert.equal(sites.at(LC).claim(capped, 'Publiée il y a 60 jours').days, 60)
  const bumped = { bumped: true, capped: false, bumpedDaysAgo: 3 }
  assert.equal(sites.at(LBC).claim(bumped, "il y a 3 jours à 15:36").days, 3)
})

test('le manifeste déclare les deux sites avec leurs content scripts', () => {
  const manifest = JSON.parse(readFileSync(join(here, '../manifest.json'), 'utf8'))
  const byMatch = {}
  for (const cs of manifest.content_scripts) for (const m of cs.matches) (byMatch[m] ||= []).push(cs)
  assert.deepEqual(Object.keys(byMatch).sort(), ['https://www.lacentrale.fr/*', 'https://www.leboncoin.fr/*'])

  for (const [match, scripts] of Object.entries(byMatch)) {
    const main = scripts.find((cs) => cs.world !== 'MAIN')
    assert.ok(main, `${match} sans content script isolé`)
    // Le registre précède les modules de site, qui précèdent le code partagé
    // qui les résout : c'est l'ordre que le chargement impose.
    const site = main.js.filter((f) => f.startsWith('src/sites/'))
    assert.ok(site.length, `${match} ne charge aucun module de site`)
    assert.ok(main.js.indexOf('src/sites.js') < main.js.indexOf(site[0]))
    for (const f of ['src/context.js', 'src/listing.js', 'src/detail.js']) assert.ok(main.js.includes(f))
    assert.ok(main.js.every((f) => existsIn(f)), `${match} déclare un fichier absent`)
  }
})

const existsIn = (f) => {
  try { readFileSync(join(here, '..', f)); return true } catch { return false }
}

// Le mode démo de `/app/ecarts.html` : la même forme que `GET /v1/divergences`,
// sans réseau. Trois clés, huit écarts, les six `field` du journal, un délai
// en minutes, un en heures, un en jours, une clé suspendue et une clé sans
// compte — ce que la capture doit montrer (docs/roadmap.md § Lot Corpus).

import { DEMO_NOW, isoDaysBefore } from './fixtures-data.js'

function minus(iso, seconds) {
  return new Date(new Date(iso).getTime() - seconds * 1000).toISOString()
}

const LICENSES = {
  A: {
    license_key_hash: '9f2c1a8b3d4e5f60', label: 'Garage Leclerc',
    email: 'contact@garageleclerc.example.test', active: true,
  },
  B: {
    license_key_hash: '4b7e2f1c9a6d3058', label: 'Auto Sélection 34',
    email: 'flotte@autoselection34.example.test', active: true,
  },
  // Suspendue et sans compte : les deux pastilles que la capture doit
  // montrer, sur la même clé plutôt que sur une quatrième (le plan tient à
  // trois clés).
  C: {
    license_key_hash: '1d8f6a3c9b2e7054', label: 'Occaz Rapide 91',
    email: null, active: false,
  },
}

// listing_id, site_id, label, field, merchant_value, robot_value, delta_pct,
// jours écoulés depuis la vérification du robot, délai en secondes, clé.
const ROWS = [
  [41822, '2963188104', 'Peugeot 208 II PureTech 100 Allure', 'price', '9900', '12900', 30.3, 2, 7200, 'A'],
  [41830, '2963177230', 'Renault Clio V 1.0 TCe 90 Evolution', 'bump', '2026-09-16T08:00:00Z', 'aucune', null, 3, 2700, 'A'],
  [41841, '2963165592', 'Volkswagen Polo VI 1.0 TSI 95 Life', 'vehicle', 'Volkswagen Polo 2021 · 34900 km', 'Volkswagen Polo 2021 · 36300 km', null, 4, 86400, 'A'],
  [41852, '2963154881', 'Citroën C3 III PureTech 83 Shine', 'absence', 'absente', 'présente', null, 5, 10800, 'A'],
  [41863, '2963142016', 'Dacia Duster II Blue dCi 115 Prestige', 'published', '2026-08-01', '2026-07-20', null, 6, 518400, 'B'],
  [41874, '2963130522', 'Toyota Yaris IV 116h Design', 'price', '12900', '15900', 23.3, 7, 1800, 'B'],
  [41885, '2963119087', 'Ford Puma 1.0 EcoBoost 125 Titanium', 'unknown_listing', 'créée', 'absente', null, 8, 43200, 'B'],
  [41896, '2963107654', 'Opel Corsa V 1.4 90 Enjoy', 'vehicle', 'Opel Corsa 2015 · 128900 km', 'Opel Corsa 2015 · 130200 km', null, 9, 172800, 'C'],
]

// Aucun marqueur en attente n'est jamais résolu par la démo : c'est la sonde
// que la page affiche même quand la liste des écarts est vide (§5.1 du plan).
const PENDING = 6

function item([listingId, siteId, label, field, merchantValue, robotValue, deltaPct, ageDays, delaySeconds]) {
  const verifiedAt = isoDaysBefore(ageDays)
  return {
    listing_id: listingId, site: 'lbc', site_id: siteId, label,
    source_url: `https://www.leboncoin.fr/ad/voitures/${siteId}`,
    adscope_url: `/v1/listings/lbc/${siteId}`,
    field, merchant_value: merchantValue, robot_value: robotValue, delta_pct: deltaPct,
    delay_seconds: delaySeconds, observed_at: minus(verifiedAt, delaySeconds), verified_at: verifiedAt,
  }
}

function grouped(rows) {
  const byKey = new Map()
  for (const row of rows) {
    const keyId = row[9]
    if (!byKey.has(keyId)) byKey.set(keyId, [])
    byKey.get(keyId).push(item(row))
  }
  return [...byKey.entries()].map(([keyId, items]) => {
    items.sort((a, b) => new Date(b.verified_at) - new Date(a.verified_at))
    return {
      ...LICENSES[keyId], count: items.length,
      min_delay_seconds: Math.min(...items.map((i) => i.delay_seconds)), items,
    }
  })
}

// `?demo=1&days=1` : aucun écart n'est vérifié depuis moins de deux jours —
// l'état vide qui rassure, atteignable sans toucher à une vraie base.
export function divergences(days = 30) {
  const rows = ROWS.filter((row) => row[7] <= days)
  const licenses = grouped(rows)
  return {
    since: isoDaysBefore(days, DEMO_NOW), total: rows.length,
    keys: licenses.length, repeat_keys: licenses.filter((l) => l.count >= 3).length,
    truncated: false, pending: PENDING, licenses,
  }
}

// Les boutons de suspension en démo (`?demo=1`) basculent cet état local,
// sans réseau — ce qui permet la capture des deux états sur la même clé
// (`.superpowers/disparition-plan.md` §6.3).
function bascule(keyHash, active) {
  const lic = Object.values(LICENSES).find((l) => l.license_key_hash === keyHash)
  if (lic) lic.active = active
  return { key_hash: keyHash, label: lic ? lic.label : 'clé supprimée', active }
}

export function suspend(keyHash) {
  return bascule(keyHash, false)
}

export function restore(keyHash) {
  return bascule(keyHash, true)
}

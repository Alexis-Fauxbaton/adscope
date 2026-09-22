// Le mode démo des alertes : les mêmes formes que `/v1/searches`,
// `/v1/alerts/settings` et `/v1/digests`, sans réseau. Séparé de
// `fixtures.js` (149 lignes, au plafond) — `api-alerts.js` importe ce fichier
// directement.
//
// `?demo=1&vide=1` : le compte du premier jour — aucune recherche, aucun
// email envoyé. Un second drapeau, pas un second fichier : c'est la même
// page, un autre compte, utile pour la capture de l'état vide.

import { DEMO_NOW, isoDaysBefore } from './fixtures-data.js'

function videDemande() {
  return new URLSearchParams(location.search).get('vide') === '1'
}

// Les trois premières recherches correspondent à de vraies lignes de
// `fixtures-rows.js` : un compte à zéro sur la carte vedette de la démo se
// lirait comme une panne du compteur. `coverage_24h`/`seen_total`/
// `sweep_status` (lot F2) : la quatrième, sans marque ni modèle, est hors
// balayage — le seul des trois états que les trois premières ne montraient pas.
let searchesStore = [
  {
    id: 1, name: 'Clio diesel', query: 'brand=Renault&fuel=diesel&model=Clio',
    notify_drops: true, notify_new: false, min_age_days: 30, min_drop_pct: 3,
    paused: false, created_at: isoDaysBefore(21), coverage_24h: 0.82, seen_total: 341, sweep_status: 'ok',
  },
  {
    id: 2, name: '208 essence Hauts-de-Seine', query: 'brand=Peugeot&department=92&fuel=essence&model=208',
    notify_drops: true, notify_new: true, min_age_days: 15, min_drop_pct: 5,
    paused: false, created_at: isoDaysBefore(9), coverage_24h: null, seen_total: 0, sweep_status: 'ok',
  },
  {
    id: 3, name: 'Dacia Duster', query: 'brand=Dacia&model=Duster',
    notify_drops: true, notify_new: false, min_age_days: 30, min_drop_pct: 3,
    paused: true, created_at: isoDaysBefore(40), coverage_24h: 0.55, seen_total: 96, sweep_status: 'ok',
  },
  {
    id: 4, name: 'Familiales à moins de 15 000 €', query: 'price_max=15000',
    notify_drops: true, notify_new: false, min_age_days: 30, min_drop_pct: 3,
    paused: false, created_at: isoDaysBefore(3), coverage_24h: 0.4, seen_total: 812, sweep_status: 'trop_large',
  },
]

let settingsStore = { digest_enabled: true, include_follows: true }

export function searches() {
  return videDemande() ? [] : searchesStore.map((s) => ({ ...s }))
}

export function createSearch(payload) {
  const id = Math.max(0, ...searchesStore.map((s) => s.id)) + 1
  const row = { id, created_at: DEMO_NOW, ...payload }
  searchesStore = [...searchesStore, row]
  return { ...row }
}

export function updateSearch(id, payload) {
  searchesStore = searchesStore.map((s) => (s.id === id ? { id, created_at: s.created_at, ...payload } : s))
  return { ...searchesStore.find((s) => s.id === id) }
}

export function deleteSearch(id) {
  searchesStore = searchesStore.filter((s) => s.id !== id)
  return null
}

export function alertSettings() {
  return { ...settingsStore }
}

export function putAlertSettings(payload) {
  settingsStore = { ...settingsStore, ...payload }
  return { ...settingsStore }
}

// Registre aligné sur `api/adscope_api/digest_html.py` : chaque `<a>` porte
// sa propre police (un client mail n'hérite rien sur un lien), et le prix
// tient sa propre ligne sombre quand la carte en a un — les faits restent
// en gris, sans le répéter.
const FONT = "font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
const LIEN = (href, texte, couleur = '#4F46E5') => `<a href="${href}" style="${FONT};color:${couleur};text-decoration:none">${texte}</a>`

const CARD = (label, priceLine, facts, dept, sourceUrl) => `
    <tr><td style="padding:8px 0">
      <table role="presentation" width="100%" style="background:#fff;border-radius:22px;
        box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <tr><td style="padding:20px 24px">
          <div style="${FONT};font-size:16px;font-weight:700;color:#111">${label}</div>
          ${priceLine ? `<div style="${FONT};font-size:15px;font-weight:700;color:#111;margin-top:4px">${priceLine}</div>` : ''}
          <div style="${FONT};font-size:14px;color:#555;margin-top:4px">${facts} · ${dept}</div>
          <div style="font-size:13px;margin-top:10px">
            ${LIEN(sourceUrl, "Voir l'annonce")} &nbsp;·&nbsp; ${LIEN('/app/?d=demo#/marche', 'Voir sur adscope')}
          </div>
        </td></tr>
      </table>
    </td></tr>`

const DIGEST_HTML = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F4F5F7">
<table role="presentation" width="100%" style="background:#F4F5F7">
<tr><td align="center">
<table role="presentation" width="600" style="max-width:600px;width:100%;padding:24px 16px">
  <tr><td style="${FONT};font-size:20px;font-weight:800;color:#111;padding:0 8px 8px">adscope</td></tr>
  ${CARD('Peugeot 208 II PureTech 100 Allure', '23 900 € → 22 700 €', '−1 200 € depuis le premier prix · en ligne depuis 412 jours · constatée entre le 14 et le 17 sept.', 'Hauts-de-Seine (92)', 'https://www.lacentrale.fr/auto-occasion-annonce-C6123456.html')}
  ${CARD('Renault Clio V 1.0 TCe 90 Evolution', '15 900 € → 15 300 €', '−600 € depuis le premier prix · en ligne depuis 71 jours · constatée entre le 16 et le 18 sept.', 'Nord (59)', 'https://www.lacentrale.fr/auto-occasion-annonce-C6123457.html')}
  ${CARD('Volkswagen Polo VI 1.0 TSI 95 Life', '', 'passe 90 jours en ligne', 'Bas-Rhin (67)', 'https://www.lacentrale.fr/auto-occasion-annonce-C6123458.html')}
  <tr><td style="${FONT};font-size:12px;color:#999;padding:24px 8px 0;line-height:1.7">
    Vous recevez cet email parce que vous avez enregistré une recherche ou suivez des
    annonces sur adscope.<br>
    ${LIEN('/app/?d=demo#/alertes', 'Gérer mes alertes')} &nbsp;·&nbsp; ${LIEN('/app/desabonnement.html?t=demo', 'Me désabonner', '#999')}
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

const DIGEST_TEXT = 'Peugeot 208 II PureTech 100 Allure — 23 900 € → 22 700 € · '
  + '−1 200 € depuis le premier prix · en ligne depuis 412 jours · '
  + "constatée entre le 14 et le 17 sept. — Hauts-de-Seine (92)\n…\n\n"
  + 'Tout voir : /app/?d=demo#/alertes\n'

const DIGESTS = [
  {
    id: 3, day: '2026-09-18', subject: 'adscope — 2 baisses et 1 mouvement ce matin',
    created_at: isoDaysBefore(0), visits: 2, first_visit_at: isoDaysBefore(0),
    text: DIGEST_TEXT, html: DIGEST_HTML,
  },
  {
    id: 2, day: '2026-09-17', subject: 'adscope — 1 baisse ce matin',
    created_at: isoDaysBefore(1), visits: 1, first_visit_at: isoDaysBefore(1),
    text: DIGEST_TEXT, html: DIGEST_HTML,
  },
  {
    id: 1, day: '2026-09-16', subject: 'adscope — 1 mouvement ce matin',
    created_at: isoDaysBefore(2), visits: 0, first_visit_at: null,
    text: DIGEST_TEXT, html: DIGEST_HTML,
  },
]

export function digests() {
  return videDemande() ? [] : DIGESTS.map(({ text, html, ...rest }) => rest)
}

export function digest(id) {
  return DIGESTS.find((d) => d.id === id)
}

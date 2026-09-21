// L'email du matin — une carte : l'interrupteur principal, l'adresse et le
// prochain envoi, puis l'inclusion des suivis et ce qu'elle ajoute. Coupé,
// la carte le dit elle-même plutôt que de laisser deviner pourquoi rien
// n'est jamais arrivé.

import { clear, el } from './dom.js'
import { renderSwitch } from './switch.js'

const FOLLOWS_SENTENCE = 'Ajoute, sur les annonces que vous suivez : baisses, seuils de 30, '
  + '60 et 90 jours franchis, disparitions.'
const OFF_NOTICE = "L'email est coupé : vos recherches restent enregistrées, mais rien ne partira."

export function renderDigestCard(root, settings, email, api) {
  function dessiner() {
    clear(root).append(el('section', { class: 'carte' }, [
      el('h2', { class: 'alerts-h', text: "L'email du matin" }),
      renderSwitch({
        id: 'alerts-digest-on',
        checked: settings.digest_enabled,
        onChange: async (value) => {
          await api.putAlertSettings({ ...settings, digest_enabled: value })
          settings.digest_enabled = value
          dessiner()
        },
        content: [el('span', { class: 'switch-titre', text: "Recevoir l'email du matin" })],
      }),
      settings.digest_enabled
        ? el('p', { class: 'ed-info', text: `Envoyé à ${email} — prochain envoi demain matin.` })
        : el('p', { class: 'ed-info ed-off', text: OFF_NOTICE }),
      renderSwitch({
        id: 'alerts-digest-follows',
        checked: settings.include_follows,
        onChange: async (value) => {
          await api.putAlertSettings({ ...settings, include_follows: value })
          settings.include_follows = value
        },
        content: [
          el('span', { class: 'switch-titre', text: 'Inclure mes annonces suivies' }),
          el('span', { class: 'switch-phrase', text: FOLLOWS_SENTENCE }),
        ],
      }),
    ]))
  }
  dessiner()
}

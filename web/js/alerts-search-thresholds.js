// Les deux menus de seuils de la règle de baisse — « prévenu plus tôt ou
// plus tard », « pour toute baisse ou seulement les franches » — c'est ce
// que Karim règle en arrivant de l'email « gérer mes alertes ». Un menu
// natif (`<select>`, le registre du site), pas un champ à remplir : un
// changement s'applique tout de suite, et revient en arrière si l'API
// refuse — même principe que `switch.js`, pour un contrôle qui n'est pas
// binaire.

import { el } from './dom.js'
import { AGE_CHOICES, DROP_CHOICES, withCurrent } from './alerts-search-rules.js'

function menu(id, value, choices, onChange, ariaLabel) {
  // `actuel` suit le dernier choix qui a tenu — pas celui du premier rendu de
  // la carte — sinon un second changement raté reviendrait deux crans en
  // arrière plutôt qu'à ce qui est vraiment enregistré.
  let actuel = value
  const select = el('select', { id, class: 'select as-select', 'aria-label': ariaLabel }, withCurrent(choices, value).map(
    ([v, label]) => el('option', { value: String(v), text: label, selected: v === value ? true : null }),
  ))
  select.addEventListener('change', async () => {
    const next = Number(select.value)
    select.disabled = true
    try { await onChange(next); actuel = next } catch { select.value = String(actuel) } finally { select.disabled = false }
  })
  return select
}

// « Une annonce en ligne depuis plus de [30 jours] : [une baisse de 3 % ou
// plus]. » — deux menus, une seule phrase, qui reste grammaticale quel que
// soit le choix (« dès la moindre baisse » compris).
export function renderThresholds(search, onPatch) {
  return el('p', { class: 'switch-phrase as-seuils' }, [
    el('span', { text: 'Une annonce en ligne depuis plus de ' }),
    menu(`as-age-${search.id}`, search.min_age_days, AGE_CHOICES,
      (v) => onPatch(search.id, { min_age_days: v }), "Ancienneté minimale avant qu'une baisse alerte"),
    el('span', { text: ' : ' }),
    menu(`as-pct-${search.id}`, search.min_drop_pct, DROP_CHOICES,
      (v) => onPatch(search.id, { min_drop_pct: v }), 'Seuil de baisse qui alerte'),
    el('span', { text: '.' }),
  ])
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyLabel, summarize, timeLabel } from '../js/digest-runs.js'

// Rouge sur `ran > 0 ? ... retard maximal ... : ...` de `summarize` : sans
// la branche, la phrase de la consigne ne se composerait pas telle quelle.
test('la phrase résume les jours, les envois, les manqués et le retard maximal', () => {
  const phrase = summarize({ days: 14, ran: 13, missed: 1, max_delay_seconds: 120 })
  assert.equal(phrase, '14 jours : 13 envois, 1 manqué, retard maximal 2 min.')
})

// Rouge sur `if (!missedDays.length) return withDelay` (ou l'appel à
// `missedDaysLabel` juste après) : la phrase nomme les jours manqués, pas
// seulement leur nombre — Alexis n'a plus besoin de descendre à la liste
// pour savoir lesquels.
test('la phrase nomme les jours manqués quand il y en a', () => {
  const phrase = summarize({
    days: 14, ran: 12, missed: 2, max_delay_seconds: 120,
    missed_days: ['2026-09-23', '2026-09-25'],
  })
  assert.equal(
    phrase,
    '14 jours : 12 envois, 2 manqués, retard maximal 2 min. Manqué le 23 et le 25 sept.',
  )
})

// Rouge sur l'accord singulier de `plural` (`n === 1 ? '' : 's'`) : un seul
// jour, un seul envoi, aucun manqué ne prennent pas de « s ».
test('la phrase accorde le singulier', () => {
  const phrase = summarize({ days: 1, ran: 1, missed: 0, max_delay_seconds: 30 })
  assert.equal(phrase, '1 jour : 1 envoi, 0 manqués, retard maximal 1 min.')
})

// Rouge sur `ran > 0 ? ... : base` : sans aucun envoi réussi, un retard ne
// veut rien dire — la phrase ne prétend pas mesurer ce qui n'a pas eu lieu.
test('sans aucun envoi réussi, la phrase ne parle pas de retard', () => {
  const phrase = summarize({ days: 3, ran: 0, missed: 3, max_delay_seconds: 0 })
  assert.equal(phrase, '3 jours : 0 envois, 3 manqués.')
})

// Rouge sur `iso.slice(11, 16)` : l'heure de Paris déjà écrite par l'API se
// lit telle quelle, jamais reconstruite par un `Date` qui retomberait sur
// le fuseau du navigateur qui capture l'écran.
test('l’heure se lit directement dans le texte ISO, jamais via Date', () => {
  assert.equal(timeLabel('2026-09-18T07:02:15+02:00'), '07:02')
  assert.equal(timeLabel('2026-09-18T23:59:00+01:00'), '23:59')
})

// Rouge sur le texte de `emptyLabel` : l'état vide honnête d'une carte qui
// n'a jamais encore tourné, jamais confondu avec « 14 jours manqués ».
test('l’état vide annonce la prochaine heure cible, jamais une alarme', () => {
  assert.match(emptyLabel(), /aucune exécution encore/i)
  assert.match(emptyLabel(), /07:00/)
})

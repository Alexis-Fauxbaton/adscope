// Les données du mode démo. Elles n'ont aucune autorité : elles servent à
// dessiner l'écran avant que l'API ne réponde, et à le capturer sans exposer le
// stock réel d'un marchand.

// L'instant de référence est posé, jamais lu à l'horloge : une capture prise
// demain doit montrer les mêmes jours que celle d'hier.
export const DEMO_NOW = '2026-09-18T09:00:00Z'

const DAY = 86400000

export function isoDaysBefore(days, now = DEMO_NOW) {
  return new Date(new Date(now).getTime() - days * DAY).toISOString()
}

// brand, model, version, year, mileage, price, seller_type, seller_name,
// age_days, delta, followed_days_ago, changes [[days_ago, from, to]],
// gone_days_ago — le seuil d'ancienneté franchi se déduit de `age_days`
export const FOLLOW_ROWS = [
  ['Renault', 'Clio', 'V 1.0 TCe 90 Evolution', 2021, 28410, 15900, 'pro', 'Sud Automobiles', 71, 0, 34, [], 3],
  ['Peugeot', '208', 'II 1.2 PureTech 100 Allure', 2020, 3574, 22700, 'pro', 'Borgese Auto', 412, -1200, 58, [[1, 23900, 22700]], null],
  ['Volkswagen', 'Polo', 'VI 1.0 TSI 95 Life', 2021, 34900, 17250, 'pro', 'Rhin Motors', 121, -900, 47, [[5, 18150, 17650], [1, 17650, 17250]], null],
  ['Citroën', 'C3', 'III PureTech 83 Shine', 2019, 61240, 11450, 'pro', 'Borgese Auto', 92, -450, 63, [], null],
  ['Dacia', 'Duster', 'II Blue dCi 115 Prestige', 2019, 78200, 15700, 'pro', 'Auto Sélection 34', 84, -300, 22, [], null],
  ['Toyota', 'Yaris', 'IV 116h Design', 2021, 29800, 18600, 'pro', 'Borgese Auto', 67, 0, 19, [], null],
  ['Ford', 'Puma', '1.0 EcoBoost 125 Titanium', 2020, 43900, 19400, 'pro', 'Rhin Motors', 51, 0, 15, [], null],
  ['Opel', 'Corsa', 'V 1.4 90 Enjoy', 2015, 128900, 6300, 'private', null, 592, -1500, 90, [], null],
]

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
// age_days, price_delta_since_first
export const MARKET_ROWS = [
  ['Peugeot', '208', 'II 1.2 PureTech 100 Allure', 2020, 3574, 22700, 'pro', 'Borgese Auto', 412, -1200],
  ['Peugeot', '208', '1.2 VTi 82 Active 5p', 2013, 118420, 6990, 'private', null, 187, -500],
  ['Peugeot', '208', 'II 1.5 BlueHDi 100 Active', 2021, 62310, 15450, 'pro', 'Garage du Vallon', 96, 0],
  ['Peugeot', '2008', 'II 1.2 PureTech 130 GT Line', 2020, 48900, 21900, 'pro', 'Borgese Auto', 341, -2300],
  ['Peugeot', '2008', 'I 1.6 e-HDi 92 Allure', 2015, 142700, 7450, 'private', null, 62, 0],
  ['Peugeot', '308', 'II 1.2 PureTech 130 Allure', 2018, 88150, 13200, 'pro', 'Auto Sélection 34', 128, -800],
  ['Renault', 'Clio', 'V 1.0 TCe 90 Evolution', 2021, 28410, 15900, 'pro', 'Sud Automobiles', 71, 0],
  ['Renault', 'Clio', 'IV 0.9 TCe 90 Limited', 2017, 96300, 8490, 'private', null, 234, -1100],
  ['Renault', 'Clio', 'IV 1.5 dCi 90 Business', 2016, 174500, 5990, 'pro', 'Garage du Vallon', 518, -1400],
  ['Renault', 'Captur', 'II 1.3 TCe 140 Intens', 2020, 51200, 18400, 'pro', 'Sud Automobiles', 44, 0],
  ['Renault', 'Captur', 'I 1.5 dCi 90 Zen', 2017, 108900, 9750, 'private', null, 301, -600],
  ['Renault', 'Megane', 'IV 1.5 Blue dCi 115 Intens', 2019, 97400, 14300, 'pro', 'Auto Sélection 34', 156, -900],
  ['Citroën', 'C3', 'III PureTech 83 Shine', 2019, 61240, 11450, 'pro', 'Borgese Auto', 92, -450],
  ['Citroën', 'C3', 'III BlueHDi 100 Feel', 2018, 119800, 8950, 'private', null, 388, 0],
  ['Citroën', 'C4', 'III PureTech 130 Feel Pack', 2021, 37600, 19800, 'pro', 'Garage du Vallon', 58, 0],
  ['Volkswagen', 'Polo', 'VI 1.0 TSI 95 Life', 2021, 34900, 17250, 'pro', 'Rhin Motors', 121, -900],
  ['Volkswagen', 'Polo', 'V 1.2 TSI 90 Confortline', 2016, 102300, 8200, 'private', null, 275, -350],
  ['Volkswagen', 'Golf', 'VII 1.6 TDI 115 Confortline', 2018, 133700, 14950, 'pro', 'Rhin Motors', 463, -2600],
  ['Volkswagen', 'T-Roc', '1.5 TSI 150 Style', 2020, 56800, 22400, 'pro', 'Rhin Motors', 37, 0],
  ['Dacia', 'Sandero', 'III TCe 90 Expression', 2022, 21400, 13900, 'pro', 'Sud Automobiles', 29, 0],
  ['Dacia', 'Sandero', 'II Stepway dCi 90 Prestige', 2017, 87600, 8450, 'private', null, 203, -700],
  ['Dacia', 'Duster', 'II Blue dCi 115 Prestige', 2019, 78200, 15700, 'pro', 'Auto Sélection 34', 84, -300],
  ['Toyota', 'Yaris', 'IV 116h Design', 2021, 29800, 18600, 'pro', 'Borgese Auto', 67, 0],
  ['Toyota', 'Yaris', 'III 100h France', 2016, 112400, 9300, 'private', null, 341, -1000],
  ['Ford', 'Fiesta', 'VII 1.0 EcoBoost 100 Titanium', 2019, 64100, 11200, 'pro', 'Garage du Vallon', 174, -550],
  ['Ford', 'Puma', '1.0 EcoBoost 125 Titanium', 2020, 43900, 19400, 'pro', 'Rhin Motors', 51, 0],
  ['Opel', 'Corsa', 'VI 1.2 75 Edition', 2021, 32700, 13750, 'pro', 'Sud Automobiles', 108, -400],
  ['Opel', 'Corsa', 'V 1.4 90 Enjoy', 2015, 128900, 6300, 'private', null, 592, -1500],
  ['Fiat', '500', '1.2 69 Lounge', 2018, 54300, 9850, 'private', null, 246, 0],
  ['Mini', 'Cooper', 'III 1.5 136 Chili', 2017, 71500, 15200, 'pro', 'Auto Sélection 34', 398, -1800],
]

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

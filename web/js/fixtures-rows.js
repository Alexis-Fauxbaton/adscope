// Les annonces du mode démo. Elles n'ont aucune autorité : elles servent à
// dessiner l'écran avant que l'API ne réponde, et à le capturer sans exposer
// le stock réel d'un marchand.
//
// brand, model, version, year, mileage, price, seller_type, seller_name,
// age_days, price_delta_since_first, fuel, gearbox, department
//
// Les trois derniers sont `null` sur la plupart des lignes, et c'est le point
// du lot : carburant, boîte et lieu ne sont remplis que sur les annonces
// revues depuis le 2026-09-19. Neuf lignes sur cinquante-quatre — environ
// 17 %, l'ordre de grandeur mesuré sur la vraie base. L'écran doit le dire
// plutôt que de laisser croire qu'un filtre carburant a tout vu.
export const MARKET_ROWS = [
  ['Peugeot', '208', 'II 1.2 PureTech 100 Allure', 2020, 3574, 22700, 'pro', 'Borgese Auto', 412, -1200, 'essence', 'automatique', '92'],
  ['Peugeot', '208', '1.2 VTi 82 Active 5p', 2013, 118420, 6990, 'private', null, 187, -500, null, null, null],
  ['Peugeot', '208', 'II 1.5 BlueHDi 100 Active', 2021, 62310, 15450, 'pro', 'Garage du Vallon', 96, 0, null, null, null],
  ['Peugeot', '2008', 'II 1.2 PureTech 130 GT Line', 2020, 48900, 21900, 'pro', 'Borgese Auto', 341, -2300, null, null, null],
  ['Peugeot', '2008', 'I 1.6 e-HDi 92 Allure', 2015, 142700, 7450, 'private', null, 62, 0, null, null, null],
  ['Peugeot', '308', 'II 1.2 PureTech 130 Allure', 2018, 88150, 13200, 'pro', 'Auto Sélection 34', 128, -800, 'essence', 'manuelle', '34'],
  // Trois annonces Peugeot dont le site n'a jamais donné le modèle : autant
  // que la 208, la plus fournie. Sans la règle qui les renvoie en queue,
  // « Modèle non précisé » se lirait en haut de la liste des modèles.
  ['Peugeot', 'Autres', 'Boxer L2H2 2.2 BlueHDi 140', 2019, 96800, 17900, 'pro', 'Garage du Vallon', 233, -600, null, null, null],
  ['Peugeot', 'Autres', 'Partner 1.5 BlueHDi 100 Premium', 2019, 112400, 13900, 'pro', 'Auto Sélection 34', 167, -400, null, null, null],
  ['Peugeot', 'Autres', 'Rifter 1.5 BlueHDi 100 Active', 2020, 74300, 16800, 'private', null, 121, 0, null, null, null],
  ['Renault', 'Clio', 'V 1.0 TCe 90 Evolution', 2021, 28410, 15900, 'pro', 'Sud Automobiles', 71, 0, null, null, null],
  ['Renault', 'Clio', 'IV 0.9 TCe 90 Limited', 2017, 96300, 8490, 'private', null, 234, -1100, null, null, null],
  ['Renault', 'Clio', 'IV 1.5 dCi 90 Business', 2016, 174500, 5990, 'pro', 'Garage du Vallon', 518, -1400, 'diesel', 'manuelle', '69'],
  ['Renault', 'Captur', 'II 1.3 TCe 140 Intens', 2020, 51200, 18400, 'pro', 'Sud Automobiles', 44, 0, null, null, null],
  ['Renault', 'Captur', 'I 1.5 dCi 90 Zen', 2017, 108900, 9750, 'private', null, 301, -600, null, null, null],
  ['Renault', 'Megane', 'IV 1.5 Blue dCi 115 Intens', 2019, 97400, 14300, 'pro', 'Auto Sélection 34', 156, -900, null, null, null],
  ['Renault', 'Zoe', 'R135 Intens', 2020, 41200, 12400, 'pro', 'Sud Automobiles', 119, -1500, 'electrique', 'automatique', '13'],
  ['Citroën', 'C3', 'III PureTech 83 Shine', 2019, 61240, 11450, 'pro', 'Borgese Auto', 92, -450, null, null, null],
  ['Citroën', 'C3', 'III BlueHDi 100 Feel', 2018, 119800, 8950, 'private', null, 388, 0, null, null, null],
  ['Citroën', 'C4', 'III PureTech 130 Feel Pack', 2021, 37600, 19800, 'pro', 'Garage du Vallon', 58, 0, null, null, null],
  ['Citroën', 'C5 Aircross', 'Hybride 225 Shine Pack', 2021, 44800, 26900, 'pro', 'Borgese Auto', 76, -1100, 'hybride_rechargeable', 'automatique', '75'],
  ['Volkswagen', 'Polo', 'VI 1.0 TSI 95 Life', 2021, 34900, 17250, 'pro', 'Rhin Motors', 121, -900, null, null, null],
  ['Volkswagen', 'Polo', 'V 1.2 TSI 90 Confortline', 2016, 102300, 8200, 'private', null, 275, -350, null, null, null],
  ['Volkswagen', 'Golf', 'VII 1.6 TDI 115 Confortline', 2018, 133700, 14950, 'pro', 'Rhin Motors', 463, -2600, 'diesel', 'manuelle', '67'],
  ['Volkswagen', 'T-Roc', '1.5 TSI 150 Style', 2020, 56800, 22400, 'pro', 'Rhin Motors', 37, 0, null, null, null],
  ['Dacia', 'Sandero', 'III TCe 90 Expression', 2022, 21400, 13900, 'pro', 'Sud Automobiles', 29, 0, null, null, null],
  ['Dacia', 'Sandero', 'II Stepway dCi 90 Prestige', 2017, 87600, 8450, 'private', null, 203, -700, null, null, null],
  ['Dacia', 'Duster', 'II Blue dCi 115 Prestige', 2019, 78200, 15700, 'pro', 'Auto Sélection 34', 84, -300, null, null, null],
  ['Toyota', 'Yaris', 'IV 116h Design', 2021, 29800, 18600, 'pro', 'Borgese Auto', 67, 0, 'hybride', 'automatique', '44'],
  ['Toyota', 'Yaris', 'III 100h France', 2016, 112400, 9300, 'private', null, 341, -1000, null, null, null],
  ['Toyota', 'C-HR', '1.8 Hybride 122 Edition', 2019, 68300, 19900, 'pro', 'Sud Automobiles', 172, -800, null, null, null],
  ['Ford', 'Fiesta', 'VII 1.0 EcoBoost 100 Titanium', 2019, 64100, 11200, 'pro', 'Garage du Vallon', 174, -550, null, null, null],
  ['Ford', 'Puma', '1.0 EcoBoost 125 Titanium', 2020, 43900, 19400, 'pro', 'Rhin Motors', 51, 0, null, null, null],
  ['Opel', 'Corsa', 'VI 1.2 75 Edition', 2021, 32700, 13750, 'pro', 'Sud Automobiles', 108, -400, null, null, null],
  ['Opel', 'Corsa', 'V 1.4 90 Enjoy', 2015, 128900, 6300, 'private', null, 592, -1500, null, null, null],
  ['Fiat', '500', '1.2 69 Lounge', 2018, 54300, 9850, 'private', null, 246, 0, null, null, null],
  ['Audi', 'A3', 'III Sportback 1.6 TDI 110 Ambition', 2017, 121400, 15900, 'pro', 'Rhin Motors', 268, -1300, null, null, null],
  ['Audi', 'Q3', 'II 35 TDI 150 S line', 2020, 64700, 31400, 'pro', 'Borgese Auto', 93, -2100, 'diesel', 'automatique', '33'],
  ['BMW', 'Serie 1', 'F40 118i 140 Lounge', 2020, 46200, 24300, 'pro', 'Rhin Motors', 137, -1000, null, null, null],
  ['BMW', 'X1', 'F48 sDrive18d 150 xLine', 2018, 103500, 21600, 'private', null, 421, -1700, null, null, null],
  ['Mercedes', 'Classe A', 'IV 180 d 116 Style Line', 2019, 89400, 22800, 'pro', 'Auto Sélection 34', 205, -1400, null, null, null],
  ['Mercedes', 'GLA', 'II 200 d 150 Progressive', 2021, 52100, 35900, 'pro', 'Borgese Auto', 48, 0, null, null, null],
  ['Nissan', 'Qashqai', 'II 1.5 dCi 110 Tekna', 2017, 134900, 12900, 'private', null, 356, -800, null, null, null],
  ['Nissan', 'Juke', 'II 1.0 DIG-T 117 N-Connecta', 2020, 47800, 17400, 'pro', 'Sud Automobiles', 88, -400, null, null, null],
  ['Kia', 'Sportage', 'IV 1.6 CRDi 115 Active', 2019, 92600, 17800, 'pro', 'Garage du Vallon', 261, -1200, null, null, null],
  ['Hyundai', 'Tucson', 'III 1.6 CRDi 136 Creative', 2018, 118200, 15300, 'private', null, 312, -900, null, null, null],
  ['Seat', 'Ibiza', 'V 1.0 TSI 95 Style', 2020, 39800, 14200, 'pro', 'Rhin Motors', 64, 0, null, null, null],
  ['Skoda', 'Octavia', 'III Combi 2.0 TDI 150 Style', 2019, 141300, 16400, 'pro', 'Auto Sélection 34', 189, -1100, null, null, null],
  ['Tesla', 'Model 3', 'Standard Plus Autonomie', 2021, 58400, 28900, 'private', null, 73, -2400, 'electrique', 'automatique', '75'],
  ['Volvo', 'XC40', 'T3 163 Momentum', 2020, 51700, 29400, 'pro', 'Borgese Auto', 115, -1600, null, null, null],
  ['Suzuki', 'Vitara', 'II 1.4 Boosterjet Privilège', 2019, 74900, 16200, 'pro', 'Sud Automobiles', 224, -700, null, null, null],
  ['Mazda', 'CX-5', 'II 2.2 Skyactiv-D 150 Dynamique', 2018, 127600, 18700, 'private', null, 297, -1300, null, null, null],
  ['Alfa Romeo', 'Giulietta', '1.6 JTDm 120 Super', 2017, 108400, 10900, 'private', null, 378, -600, null, null, null],
  // La version répète le modèle, comme sur 89 % des annonces (constat du
  // 2026-09-18) : `label` doit dire « Mini Cooper S Chili », jamais
  // « Mini Cooper Cooper S Chili ».
  ['Mini', 'Cooper', 'Cooper S III Chili', 2017, 71500, 15200, 'pro', 'Auto Sélection 34', 398, -1800, null, null, null],
  // Le modèle « Autres » (9 % de la base) ne doit jamais fuiter dans le nom
  // affiché : `label` doit dire « Corvette C3 Stingray 5.7 V8 », jamais
  // « Corvette Autres C3 Stingray 5.7 V8 ».
  ['Corvette', 'Autres', 'C3 Stingray 5.7 V8', 1969, 88000, 42000, 'pro', 'Classic Cars 06', 145, -900, null, null, null],
]

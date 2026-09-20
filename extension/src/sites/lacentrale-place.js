globalThis.ADS = globalThis.ADS || {}

// Où le panneau se pose sur une fiche de La Centrale — un fichier à part, comme
// la signature d'absence de l'autre site : c'est une étude de DOM dont la
// conclusion s'écrit une fois, pas une lecture de charge.
//
// RELEVÉ le 2026-09-18 sur les deux fiches sauvegardées (208 de 2013, Hauts-de-
// Seine ; 208 II de 2020, Vendée), lues scripts désactivés — sous JavaScript
// elles se réhydratent à vide. Les deux portent exactement la même ossature.
// La fiche tient en trois zones sœurs, sous `<main>` :
//
//   `.carousel-area`  la galerie, en haut ;
//   `.side-area`      la colonne de droite : `#summary-information` — titre,
//                     prix, vendeur, boutons de contact — puis la publicité ;
//   `.main-area`      la colonne large : `<section>` qui porte
//                     `#classified-main-infos-v2` (points forts, informations
//                     générales, équipements) puis `#classified-more-infos-v2`
//                     (description, budget, garantie, assurance, historique,
//                     entretien, PUIS `#pavePrix`, puis le vendeur, etc.).
//
// C'est là qu'était le défaut : `#pavePrix` — l'ancre d'avant ce lot — n'est pas
// en haut de la colonne, il arrive **après six autres pavés**. D'où « j'ai
// l'impression qu'il se trouve super bas ». Le libellé d'ancienneté, lui, est
// pire encore : il ferme la page dans `#container-references-info`.
//
// Aucune ancre n'est une classe de CSS-Modules — `SummaryInformation_header__6rt5E`
// est régénérée à chaque build du site. Ne sont retenus que des identifiants et
// des classes de zone que La Centrale écrit à la main.
ADS.lacentrale.spots = (() => {
  // A — RETENU. En tête de `.main-area`, juste sous la galerie et le titre :
  // colonne large (≈ 660 px à 1440 de viewport), donc courbe lisible. Le bloc
  // que le site nomme d'abord, sinon la zone elle-même — le « -v2 » de cet
  // identifiant dit assez qu'il peut devenir « -v3 ».
  const a = (doc) =>
    ADS.read.before(doc.querySelector('#classified-main-infos-v2')) ||
    ADS.read.head(doc.querySelector('.main-area'))

  // Écarté par Alexis le 2026-09-20 : la colonne de droite, sous
  // `[data-page-zone="syntheseAnnonce"]`. Visible sans défiler, mais ≈ 320 px de
  // large — la courbe y perd ses dates — et planté au milieu du bloc de contact
  // du site, entre le prix et « N° téléphone ». Capture : docs/panneau-lc-placement-b.png.

  // Le repli, qui est l'ancre d'avant ce lot : si A manque, le panneau descend
  // sous le pavé du prix. Jamais pas de panneau.
  const under = (doc) => ADS.read.after(doc.querySelector('#pavePrix'))

  return { a, under }
})()

ADS.lacentrale.mount = (doc) => ADS.lacentrale.spots.a(doc) || ADS.lacentrale.spots.under(doc)

if (typeof module !== 'undefined') module.exports = ADS.lacentrale.spots

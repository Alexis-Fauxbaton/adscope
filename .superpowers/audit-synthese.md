# Audit de sécurité adscope — synthèse pour décision

*2026-09-24. Sept rapports d'audit (`audit-acces`, `audit-auth`, `audit-injection`,
`audit-extension`, `audit-donnees`, `audit-config`, `audit-abus`), 63 trouvailles
confirmées par sonde ou par lecture, deux lots de correctifs déjà commités.*

---

## 1. Verdict

**Non, pas en l'état.** Les portes ouvertes les plus graves sont fermées (une clé de
marchand n'ouvre plus les files du robot, les jetons d'email ne se retournent plus
contre leur destinataire, un inconnu ne peut plus faire tomber le service avec une
seule requête), mais il reste **deux verrous de mise en ligne** qui ne sont pas du
code : la configuration de lancement derrière le proxy Render (sans quoi 30 requêtes
anonymes bloquent la connexion de tous les marchands) et l'adresse publique en
`https` (sans quoi le cookie de session de 90 jours voyage en clair).

**Hébergeable dès que ces deux points sont réglés**, avec dix minutes de ménage
(polices Google, fichiers de test du site, `.gitignore`) — c'est-à-dire pour toi
seul, en conditions réelles.

**Ouvrable aux marchands seulement après** : quota d'écriture sur le corpus
mutualisé (aujourd'hui un client peut fabriquer des milliers de fausses annonces,
réécrire celles des autres ou les faire disparaître), suppression de compte, et
durées de conservation écrites. Le Chrome Web Store, lui, est bloqué tant qu'il
n'existe pas de politique de confidentialité.

---

## 2. Ce qui est déjà corrigé (7 commits, tests verts)

| # | Ce qui était possible | Gravité | État |
|---|---|---|---|
| A1/AUTH-01/A4 | N'importe quelle clé de marchand ouvrait les files « réservées au robot » : périmètre commercial de tous les concurrents lisible, file de revisite assèchable | critique | fermé (clé « automatisée » exigée) |
| A1 (abus) | 400 Mo envoyés sans aucun compte portaient le service à 1,7 Go et le tuaient | critique | fermé (corps plafonné) |
| A3 (abus) | Une date de publication forgée (an 1000) rendait une annonce irréparable et championne de tous les tris | critique | fermé (dates bornées) |
| AUTH-02 | Un tiers posait un lien de vérification qui survivait à tout et réinstallait son mot de passe sur ton compte | haute | fermé |
| AUTH-03 | Cinq demandes d'un tiers saturaient ta boîte et t'empêchaient de recevoir ton propre lien, la route répondant « envoyé » | haute | fermé |
| AUTH-04 | Le changement de mot de passe n'avait aucun plafond : essais illimités et surcharge du serveur | haute | fermé |
| AUTH-05 | Dix mauvais mots de passe sur l'adresse d'un marchand le verrouillaient hors de son compte | haute | fermé (partiel) |
| INJ-1 / A6 | La documentation technique de l'API était publique et chargeait un script depuis un CDN sur l'origine qui porte la session | haute | fermé (docs fermées) |
| A7/A8 (abus) | 100 000 familles en un appel, suivis illimités, une lecture rendant 15 Mo — file de revisite accaparée | haute | fermé (plafonds + pagination) |
| C-3 / D3 | Les liens de vérification et de réinitialisation restaient en clair en base, sans fin | haute | fermé (partiel : purge posée) |
| D5 | Une annonce retirée était encore servie par certaines routes | haute | fermé (partiel) |
| T1 | Une page leboncoin piégée faisait écrire en base une annonce entièrement inventée au nom du marchand | haute | fermé (partiel : repli retiré, taille bornée, vrai clic exigé) |
| T2 | Une adresse d'API déguisée (`api.adscope.fr@evil.example`) était acceptée | haute | fermé (partiel : parsing corrigé) |
| T4 | Le code postal complet d'un particulier partait vers le serveur | haute | fermé côté extension |

Vérification : `935/935` tests serveur, `434/434` tests extension. Chaque correctif a
été vérifié rouge avant, puis vert après.

---

## 3. Ce qui reste ouvert

### 3.1 Avant hébergement (toi seul, en ligne)

| # | Gravité | Ce que ça permet |
|---|---|---|
| AUTH-06 / C-1 / A6 | **critique** | Derrière le proxy Render, le plafond « par IP » devient commun à tout le monde : 30 requêtes anonymes interdisent la connexion à tous les marchands, indéfiniment. Mal corrigé (`*`), c'est l'inverse : plus aucun plafond. Se règle par la commande de lancement du service, pas par du code. |
| C-2 / AUTH-08 | haute | Si l'adresse publique n'est pas en `https`, le cookie de session de 90 jours part sans protection (interceptable) et les liens des emails pointent vers `localhost` — donc nulle part. Rien dans le code ne le signale. |
| C-6 | moyenne | Sans la variable de base de données, n'importe quel script écrit dans la **vraie** base sans le dire ; l'adresse fournie par Render, collée telle quelle, empêche le service de démarrer avec un message incompréhensible. |
| C-5 | moyenne | Rien dans le dépôt ne fixe la commande de démarrage ni les versions installées : ce qui partira en ligne n'est pas ce qui a été audité. |
| A10 | moyenne | Les compteurs anti-abus vivent en mémoire : un redémarrage les remet à zéro, deux instances doublent tous les plafonds. Décision : une seule instance, écrite noir sur blanc. |
| C-7 / INJ-2 | moyenne | Aucun en-tête de sécurité sur le site, et les 29 fichiers de test du site seraient servis en ligne (ils décrivent le contrat de chaque route). |
| D10 | moyenne | Les quatre pages du site chargent les polices chez Google : l'adresse IP du marchand part hors UE sans base légale, y compris depuis un lien d'email. Dix minutes de travail. |
| D13 / C-8 | basse | `crawler/.license` (une clé en clair) n'est pas ignoré par git : un `git add -A` la publierait définitivement. **Une ligne à ajouter.** |
| C-9 | basse | Un espace en trop dans l'adresse d'opérateur te retire silencieusement l'accès à tes propres files. |
| C-10 | basse | Le fichier de service committé documente une porte dérobée qui n'existe plus ; recopié vers Render, il emporte le commentaire et la mauvaise adresse. |

### 3.2 Avant d'ouvrir à des marchands

| # | Gravité | Ce que ça permet |
|---|---|---|
| A2 (abus) | **critique** | Un client, avec sa propre clé, fabrique ~3,5 millions de fausses annonces par heure : elles entrent dans le marché et dans l'email du matin de tous les autres. Aucun quota, aucun plafond de débit. |
| D1 | **critique** | Aucune suppression de compte. Un effacement manuel laisse l'adresse email en base (dans le libellé de la licence) et tout le profil du résilié. Obligation légale. |
| A2 (accès) / D4 | haute | Un client réécrit marque, modèle et prix de l'annonce d'un concurrent, efface l'identité d'un vendeur pro, et déclenche une fausse « baisse de prix » dans l'email des autres. Le statut « pro » est cru sur parole : un prénom de particulier peut entrer en base. |
| A3 (accès) | haute | Deux appels du même compte, à six heures d'écart, font disparaître l'annonce d'un concurrent du marché de tous. |
| D2 | haute | L'adresse email est recopiée dans le libellé de la licence, affichée par l'extension, imprimée par les relevés d'usage, et survit à la suppression du compte. |
| T4 (volet serveur) | haute | Le serveur écrit encore le code postal complet des particuliers (l'extension ne l'envoie plus, mais les anciennes versions et le robot, oui) ; une migration doit effacer l'existant. |
| D5 (reste) | haute | Annonces de particuliers conservées sans limite de durée, code postal complet compris : ré-identification possible. |
| A5 (abus) | haute | Un seul appel de lecture coûte 11 s et 2 000 requêtes à la base ; vingt appels simultanés rendent le produit inutilisable pour tout le monde (×188 sur les temps de réponse). |
| A5 (accès) | moyenne | Suivis et périmètre sont rattachés à la clé, pas au compte : rattacher une clé machine fait disparaître les suivis d'un marchand sans aucune erreur. |
| A9 | moyenne | 120 emails de réinitialisation par jour vers une même boîte : harcèlement, et réputation d'envoi brûlée chez le futur fournisseur — donc l'email du matin qui n'arrive plus. |
| A11 / AUTH-09 | moyenne | L'inscription dit à un concurrent si telle adresse est cliente d'adscope, et crée un compte + une licence à chaque tentative. |
| A12 / INJ-3 | moyenne | Deux écritures publiques sans plafond : le compteur de lecture des emails (seule mesure d'usage du produit) est falsifiable à volonté. |
| INJ-4 / D9 / C-4 | moyenne | Le lien de désabonnement voyage dans l'adresse (donc dans les journaux du proxy) et ne périme jamais : qui lit un journal coupe l'email du matin d'un marchand, sans trace. |
| D6 | moyenne | Sessions expirées et jetons consommés ne sont jamais effacés : journal daté de chaque connexion, sans durée. |
| AUTH-07 | moyenne | Le corps des emails reste en base avec son jeton pendant la fenêtre de purge ; à revoir au branchement du fournisseur d'email. |
| D7 / D11 / D8 | moyenne | Relevé d'activité quotidien par marchand, historique de tout ce qui lui a été signalé, copie intégrale de ses emails : tout conservé sans durée écrite. |
| D12 | basse | Aucun export des données du compte (droit d'accès et de portabilité). |
| AUTH-10 | basse | Le contrôle « email vérifié » annoncé dans le code n'existe pas ; il tient aujourd'hui par coïncidence. |

### 3.3 Avant publication sur le Chrome Web Store

| # | Gravité | Ce que ça permet |
|---|---|---|
| T1 (reste) | haute | Le canal entre la page du site et l'extension n'est toujours pas authentifié : un script tiers présent sur leboncoin peut lui parler. Les trois garde-fous posés réduisent la surface prouvée, ils ne ferment pas le canal (décision d'architecture). |
| T2 (reste) | haute | Le champ « adresse de l'API » reste libre : un marchand à qui on dicte une adresse envoie sa clé de licence chez un tiers et se fait hameçonner son mot de passe. À épingler dès que le domaine existe. |
| T3 | moyenne | L'extension rediffuse les réponses de leboncoin à tous les scripts de la page (régie, mesure d'audience) : on donne à des tiers une donnée que seul leboncoin détenait. |
| T5 | moyenne | L'extension distribuée pointe par défaut sur `localhost` : inerte chez le marchand, ou bavarde vers un service local. |
| T6 | moyenne | La permission « tous les sites » demandée par l'extension est injustifiable en revue Store. |
| D15 | basse | Aucune politique de confidentialité dans le dépôt : la publication est bloquée, et trois catégories doivent être déclarées (authentification, historique web, activité). |

### 3.4 Plus tard (hygiène, aucun risque immédiat)

`A13` et `A14` (lectures coûteuses et champs sans longueur maximale), `AUTH-11` et
`AUTH-12` (fuites de temps de réponse, petite course dans le compteur de jetons),
`INJ-5` (une lecture qui écrit en base), `INJ-6` et `INJ-7` (deux défauts d'hygiène
d'affichage), `T7` (reste : la mention « reconnectez-vous » obéit encore à un clic
simulé).

---

## 4. Les décisions qui te reviennent

1. **Domaine de production**, et les trois variables à poser sur Render (adresse
   publique en `https`, ton adresse d'opérateur, base de données). Débloque
   AUTH-06/C-1, C-2, C-6 — et l'épinglage de l'extension (T2, T5).
2. **Une seule instance Render**, ou bien on porte les compteurs anti-abus en base
   (une demi-journée). Débloque A10.
3. **Qui a le droit d'écrire quoi dans le corpus mutualisé.** C'est la décision
   centrale, elle débloque quatre trouvailles (A2 accès et abus, A3, D4). Trois
   options, non exclusives : ne laisser créer une annonce inconnue qu'au robot ;
   exiger deux émetteurs distincts pour réécrire un prix, une marque ou déclarer une
   disparition ; plafonner ce qu'une clé peut écrire par jour. Aujourd'hui la seule
   chose qui protège le corpus est la bonne foi des clients.
4. **Le chiffre du quota** d'observations par marchand et par jour (combien
   d'annonces un marchand honnête consulte-t-il en une journée chargée ?).
5. **Suppression de compte** : ce qui s'efface, et ce qui reste. Ma recommandation :
   tout ce qui est nominatif s'efface, l'historique de marché reste mais le lien avec
   la personne est rompu.
6. **Ce que l'extension affiche** à la place de l'email dans « Licence valide —
   … » (aujourd'hui l'email est recopié dans le libellé de la licence, D2).
7. **Les durées de conservation**, à trancher une fois puis à écrire dans le code et
   dans la politique : sessions expirées (30 jours ?), liens d'email (7 jours après
   péremption ?), copie des emails du matin (90 jours ?), relevé d'usage quotidien
   (13 mois ?), historique des alertes envoyées (?), journaux serveur (?).
8. **Code postal des particuliers** : département seul + purge de l'existant, ou on
   l'assume et on l'écrit dans la politique. Aujourd'hui la règle affichée est fausse.
9. **Fournisseur d'email** : lequel, et ce qu'on lui confie (à écrire en phrase 11).
10. **Politique de confidentialité** : raison sociale, adresse, adresse de contact,
    région d'hébergement Render. Plus une adresse où un particulier peut demander
    l'effacement des données liées à son annonce — ce qui suppose un petit script
    d'effacement par annonce, qui n'existe pas.

---

## 5. Les mesures de sécurité en place (réutilisable dans le dossier Store)

- Les mots de passe ne sont jamais enregistrés : seule une empreinte Argon2id, le
  standard actuel, est conservée.
- La session tient dans un cookie inaccessible au JavaScript, limité à notre site,
  marqué « transport chiffré uniquement » dès que le site est servi en https.
- Toute opération qui modifie quelque chose exige un en-tête que seules nos propres
  pages posent : un autre site ne peut pas agir au nom d'un marchand connecté.
- Le changement de mot de passe exige la session du navigateur ; une clé machine ne
  suffit pas.
- Les tentatives de connexion, d'inscription, de réinitialisation et de changement de
  mot de passe sont plafonnées.
- Les liens envoyés par email périment, ne servent qu'une fois, et annulent les
  autres liens en attente sur le même compte.
- Les files de travail réservées au robot n'acceptent qu'une clé explicitement
  marquée « automatisée ».
- Tout ce qu'on nous envoie est plafonné : taille de la requête, nombre d'annonces
  par lot, nombre de familles suivies, longueur de chaque champ.
- La documentation technique de l'API n'est pas publique.
- L'email du matin ne contient ni pixel espion, ni image de suivi, ni outil de mesure
  tiers : seul un clic sur un lien est compté.
- L'aperçu d'un email dans l'application s'affiche dans un cadre privé de tout droit
  d'exécution.
- L'extension ne lit que leboncoin.fr et lacentrale.fr, et n'y lit que les
  caractéristiques des véhicules — jamais les identifiants, les messages ou les pages
  de compte de l'utilisateur.
- Aucun nom, prénom, téléphone, adresse ni texte d'annonce de particulier n'est
  enregistré. Le code postal complet n'est plus transmis pour une annonce de
  particulier : seul le département l'est.
- Le bouton « Suivre » de l'extension n'obéit qu'à un vrai clic humain.
- Ce que l'extension garde sur le poste (signaux des annonces vues, trente jours au
  plus) ne quitte pas l'ordinateur et se vide en un clic.
- Aucune donnée n'est vendue, cédée, ni transmise à un tiers à des fins publicitaires
  ou statistiques.
- 935 tests automatisés côté serveur et 434 côté extension sont joués à chaque
  changement.

---

## 6. Les phrases que la politique de confidentialité devra contenir

Rédaction prête à relire dans `audit-donnees.md`, section 3. Les crochets sont les
chiffres à trancher (point 7 ci-dessus) ; **une durée non écrite n'est pas une
durée**. Trois de ces phrases seraient fausses aujourd'hui, elles sont marquées.

**Qui traite, et pourquoi** — 1. responsable de traitement, adresse, contact.
2. finalité (mesurer l'ancienneté et les variations de prix des annonces que le
marchand consulte) et base légale (l'exécution du contrat).

**Le compte** — 3. ce qu'on garde (email, empreinte du mot de passe, dates).
4. à quoi sert l'adresse, et qu'elle n'est ni cédée ni exploitée en publicité.
5. le cookie de session, strictement nécessaire, 90 jours, aucun cookie de mesure ni
de publicité. 6. les sessions expirées effacées à [30] jours, les liens d'email à
[7] jours après péremption *(exige D6)*.

**Ce que le marchand enregistre** — 7. recherches enregistrées, annonces suivies,
familles surveillées, supprimables à tout moment.

**Les emails** — 8. copie des emails du matin conservée [90] jours pour relecture.
9. l'ouverture est comptée par un clic, sans pixel ni outil tiers. 10. le
désabonnement par le lien en pied d'email ou depuis l'application. 11. le
fournisseur d'acheminement et ce qu'il reçoit *(à écrire au branchement)*.

**La mesure d'usage** — le point à ne pas taire — 12. relevé quotidien du nombre
d'annonces consultées et de passages, conservé [13] mois puis agrégé.
13. chaque relevé de prix porte l'empreinte de la licence, alimente l'historique de
marché partagé, conservé sans limite, l'empreinte étant détachée à la suppression du
compte. 14. la trace des alertes déjà envoyées, [N] mois.

**L'extension** — 15. ce qu'elle lit et transmet, champ par champ. 16. ce à quoi
elle n'accède pas. 17. ce qu'elle garde sur le poste (trente jours), et le bouton
qui l'efface. 18. la conséquence à assumer : l'activité de consultation sur ces deux
sites est de fait reconstituée, à la maille de l'annonce et du jour.

**Le vendeur observé** — 19. pour un professionnel, identifiant de boutique et
raison commerciale (données d'entreprise). 20. pour un particulier, ni nom, ni
téléphone, ni adresse, ni texte — seulement l'identifiant de l'annonce, [le
département], les caractéristiques du véhicule et l'historique des prix *(fausse
aujourd'hui : c'est le code postal complet — décision 8)*. 21. comment un
particulier demande l'effacement, et sous quel délai *(exige un script d'effacement
par annonce, qui n'existe pas)*.

**Les droits** — 22. obtenir une copie de ses données *(exige D12)*.
23. supprimer son compte, et la liste de ce qui s'efface alors *(exige D1)*.
24. rectification, limitation, opposition, et la saisine de la CNIL.

**Hébergement et transferts** — 25. hébergeur et région des serveurs.
26. aucune transmission à un tiers publicitaire ou statistique, et aucune police,
script ou image tierce chargée par le site *(fausse aujourd'hui : Google Fonts —
D10)*. 27. les journaux techniques gardent l'adresse IP et les adresses appelées
[N] jours. 28. l'adresse IP retenue en mémoire jusqu'à une heure pour limiter les
tentatives répétées.

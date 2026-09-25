"""La file des fiches à rouvrir : laquelle vaut la page, et quand.

Une page de résultats rend une trentaine d'annonces, une fiche en rend une :
vérifier par fiche coûte trente fois plus par annonce, et le crawler mesuré tient
environ sept pages par minute. Les 43 457 annonces de la base ne se revisitent
donc pas toutes ; la file trie, et ce tri est ce qui décide vraiment de ce qu'on
saura.

Ce qu'elle refuse d'abord. Une annonce revue il y a deux heures est vivante — le
balayage l'a dit gratuitement, la fiche n'apprendrait rien : `QUIET` l'écarte, et
c'est ainsi que toute observation, y compris depuis une page de résultats,
repousse l'échéance de revisite sans que rien n'ait à l'écrire. Trois jours,
parce qu'un cycle complet de tranches de prix en prend au moins autant : en deçà,
le balayage répondra tout seul.

Le silence, lui, n'est qu'un ordre de priorité — jamais une conclusion. Une
annonce qu'on ne revoit pas est peut-être partie, peut-être seulement passée dans
une autre tranche de prix : sur six annonces tirées au hasard parmi celles vues
au premier passage et jamais revues, les six étaient vivantes. C'est une raison
d'aller voir, et la page ouverte tranchera.

Ce qu'elle sert en premier :

- ce qu'un marchand a demandé : une annonce qu'il suit, ou une annonce de son
  périmètre. C'est le seul rang qui ne se déduit pas de la base — il vient de
  quelqu'un, et il passe devant tout le reste parce que c'est la seule fiche
  dont on sait qu'elle sera lue. « Un marchand », pas l'appelant : la file est
  commune, le crawler la tire avec sa propre licence.
- le professionnel. Ses annonces n'expirent pas — la base en porte au-delà de
  834 jours quand aucune annonce de particulier ne dépasse 120 —, si bien que sa
  disparition est un retrait et non une échéance administrative. C'est la seule
  population dont la durée de vie se lise sans démêler les deux.
- l'ancienne avant la récente : une annonce publiée hier ne disparaîtra pas
  cette semaine, et la page dépensée pour elle est perdue.

`ADDRESS` est le second garde-fou, aussi important que la signature : une adresse
mal reconstruite rend une page qui n'est pas l'annonce, et cette page-là parle
d'absence. leboncoin ignore le segment de catégorie — mesuré le 2026-09-07,
`/ad/motos/<id d'une voiture>` rend la voiture —, donc l'identifiant suffit, à
condition qu'il ait la forme observée ; ce qui n'a pas cette forme est refusé et
journalisé. La Centrale n'y figure pas : sa signature d'absence n'a pas été
confirmée sur une vraie disparition, et son adresse se déduit d'une règle vérifiée
sur les 23 annonces d'un seul relevé. Un site absent d'ici n'entre jamais dans la
file.
"""

import logging
from datetime import timedelta

from sqlalchemy import and_, case, or_, select

from .corpus_models import Recheck
from .follow_models import Follow, TrackedFamily
from .models import Listing
from .urls import _lbc

log = logging.getLogger("adscope.revisit")

# Le silence en deçà duquel une fiche n'apprendrait rien que le balayage ne
# sache déjà.
QUIET = timedelta(days=3)
# Ce que la file s'accorde entre deux ouvertures de la même fiche. Trois rôles
# d'un seul chiffre : elle tient lieu de bail — une fiche servie que le crawler
# n'ouvre pas ne revient pas en tête à chaque appel —, elle espace deux mesures
# d'une même annonce, et elle freine d'elle-même la nuit où le mur anti-bot
# rend tout illisible.
SPACING = timedelta(days=7)
# Entre les deux constatations d'absence concordantes. C'est `disappearance` qui
# fait la règle sur les horodatages ; ici, c'est le rendez-vous.
CONFIRM_DELAY = timedelta(hours=6)
OLD = timedelta(days=31)


ADDRESS = {"lbc": _lbc}


# Demandée par quelqu'un : suivie par une licence quelconque, ou d'une famille
# que l'une d'elles surveille. La marque nulle ne rejoint aucune famille — la
# comparaison rend NULL, donc faux, et c'est le résultat voulu.
def _wanted():
    followed = select(1).where(Follow.listing_id == Listing.id).exists()
    tracked = (
        select(1)
        .where(TrackedFamily.brand == Listing.brand,
               TrackedFamily.model == Listing.model)
        .exists()
    )
    return or_(followed, tracked)


# Ce que `recheck.mark` a posé et qu'aucun relevé du robot n'a encore levé
# (lot Corpus). Passe outre le silence ET le bail (`due`, ci-dessous) : un
# marchand vient de mettre `last_seen` à jour, donc `QUIET` écarterait
# précisément l'annonce qu'il faut rouvrir.
def _marked():
    return select(1).where(Recheck.listing_id == Listing.id).exists()


def _rank(now):
    old = now - OLD
    return case(
        (_marked(), 0),          # à vérifier : le robot doit trancher, c'est tout
        (_wanted(), 1),
        (Listing.seller_type == "pro", case((Listing.published_at <= old, 2), else_=3)),
        (Listing.published_at <= old, 4),
        else_=5,
    )


def due(session, site: str, limit: int, now) -> list[dict]:
    """Les fiches à rouvrir, les plus utiles d'abord ; les marque comme servies.

    `skip_locked` : deux appels simultanés ne repartent jamais avec la même
    fiche. Le marquage vaut réservation — c'est lui que le garde-fou de flotte
    relit pour savoir combien de revisites la fenêtre a demandées.
    """
    build = ADDRESS.get(site)
    if build is None:
        return []
    rows = session.scalars(
        select(Listing)
        .where(
            Listing.site == site,
            Listing.disappeared_at.is_(None),
            or_(
                _marked(),
                and_(Listing.last_seen <= now - QUIET,
                    or_(Listing.next_detail_crawl.is_(None), Listing.next_detail_crawl <= now)),
            ),
        )
        # Une fiche marquée que le crawler n'ouvre jamais (mur anti-bot,
        # budget épuisé) recule derrière les autres marquées, plutôt que de
        # tenir la tête de la file indéfiniment — un tri, pas un seuil.
        .order_by(_rank(now), Listing.last_revisit_at.nullsfirst(), Listing.last_seen)
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).all()

    served = []
    for listing in rows:
        url = build(listing.site_id)
        if url is None:
            log.warning("revisite refusée : %s/%s, adresse non reconstructible",
                        listing.site, listing.site_id)
            continue
        listing.last_revisit_at = now
        listing.next_detail_crawl = now + SPACING
        served.append({"site": listing.site, "site_id": listing.site_id, "url": url})
    return served

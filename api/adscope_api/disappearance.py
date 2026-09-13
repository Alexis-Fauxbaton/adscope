"""Ce qu'on écrit quand le site dit lui-même qu'une annonce n'est plus là.

Trois règles, et elles sont toutes des refus :

1. Une extraction qui échoue n'est pas une disparition. Seule la preuve
   `absent` — la signature positive que l'extension a constatée sur la page —
   écrit quoi que ce soit. Tout le reste se journalise et ne touche à rien : la
   preuve d'état (`status:sold` et ses voisines) parce que l'énumération vient
   du site mais qu'aucune page n'a encore été vue la portant, l'illisible parce
   qu'une refonte de gabarit ou un mur anti-bot rend précisément des pages
   illisibles, et qu'en conclure la disparition marquerait la base entière en
   une nuit.

2. Deux constatations concordantes, séparées d'au moins `CONFIRM_DELAY`. La
   première ne fait que ramener l'échéance de revisite ; la seconde écrit, et
   elle écrit la date de la première — c'est le premier moment où le site nous
   a dit l'absence. Une page coûte peu, une fausse date ne se retire plus. Deux
   constatations séparées par une observation vivante ne sont pas concordantes :
   `observations.record` efface l'absence en cours, et le compte repart de zéro.

3. Le garde-fou de flotte. Une refonte de gabarit ou une bascule anti-bot se
   voit toujours comme un pic global ; un vrai renouvellement de stock, jamais.
   Au-delà d'une disparition constatée pour trois revisites abouties sur la
   fenêtre, l'écriture s'interrompt et se journalise — les constatations
   continuent d'être prises, elles sont réversibles.

Le journal part en `warning` à dessein : l'API tourne sous uvicorn en
`--log-level warning`, et c'est le seul niveau qui atteigne
`~/Library/Logs/adscope-api.log`.

Le vocabulaire, enfin : une annonce disparaît. Pourquoi, on l'ignore, et ni le
code ni la colonne ne le supposent.
"""

import logging
from datetime import timedelta
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, or_, select

from .models import Listing
from .revisit import CONFIRM_DELAY

log = logging.getLogger("adscope.disappearance")


class AbsenceOut(BaseModel):
    """Ce que la constatation a produit, dit sans détour : `first` a seulement
    posé un rendez-vous, `recorded` a écrit, `held` s'est heurté au garde-fou
    de flotte, `logged` n'a rien conclu."""

    verdict: Literal["unknown", "logged", "already", "first", "too_soon",
                     "held", "recorded"]

# La seule preuve qui écrive.
WRITES = "absent"

GUARD_WINDOW = timedelta(hours=24)
# En dessous, la proportion ne veut rien dire : trois revisites dont une
# disparue sont un lundi ordinaire.
GUARD_MIN = 30
GUARD_SHARE = 1 / 3


def fleet(session, now) -> tuple[int, int]:
    """Sur la fenêtre : combien de revisites ont abouti, combien ont dit absente.

    La population, d'abord : les fiches que la file a servies dans la fenêtre.
    `last_revisit_at` ne sert qu'à ça — c'est un compteur d'ouvertures, et le
    garde-fou compte des fiches. Puis ce qu'on sait de chacune, aujourd'hui :
    `gone`, une absence en cours ; `seen`, une annonce revue vivante dans la
    fenêtre. Celles que le crawler n'a jamais ouvertes ne portent ni l'une ni
    l'autre et ne comptent d'aucun côté : elles gonfleraient le dénominateur, et
    c'est le sens qui endort le garde-fou.

    Comparer `absent_since` à `last_revisit_at` semblait dire la même chose et
    disait l'inverse : `due` rafraîchit `last_revisit_at` à chaque ouverture, si
    bien que la seconde constatation — celle qui écrit — trouvait toujours
    l'absence *derrière* la dernière ouverture. Le numérateur s'effaçait à
    l'instant précis où on le consultait, pour tout le trafic crawler.

    L'asymétrie entre les deux termes est voulue. Une absence est un *état* :
    `observations.record` l'efface dès que l'annonce est revue vivante, donc une
    absence qui subsiste est courante par construction et n'a pas à être bornée
    — la borner la ferait expirer, et la file qui rouvre la fiche une semaine
    plus tard écrirait le pic qu'on venait de retenir. Une vue, elle, est un
    *événement* : `last_seen` est toujours rempli, et sans fenêtre le
    dénominateur avalerait toute la base. Comme `revisit.QUIET` (trois jours)
    dépasse la fenêtre, une fiche servie dont `last_seen` tombe dedans a
    forcément répondu après son ouverture.
    """
    window = now - GUARD_WINDOW
    gone = Listing.absent_since.is_not(None)
    seen = Listing.last_seen >= window
    row = session.execute(
        select(func.count().filter(gone), func.count().filter(or_(gone, seen)))
        .where(Listing.last_revisit_at >= window)
    ).one()
    return int(row[0]), int(row[1])


def observe(session, site: str, site_id: str, evidence: str, now) -> str:
    """Une constatation d'absence, portée par la page elle-même."""
    listing = session.scalar(
        select(Listing)
        .where(Listing.site == site, Listing.site_id == site_id)
        .with_for_update()
    )
    if listing is None:
        return "unknown"
    if evidence != WRITES:
        log.warning("constatation non concluante: %s/%s, preuve %s",
                    site, site_id, evidence)
        return "logged"
    if listing.disappeared_at is not None:
        return "already"
    if listing.absent_since is None:
        listing.absent_since = now
        listing.next_detail_crawl = now + CONFIRM_DELAY
        return "first"
    if now - listing.absent_since < CONFIRM_DELAY:
        return "too_soon"

    gone, settled = fleet(session, now)
    if settled >= GUARD_MIN and gone > settled * GUARD_SHARE:
        log.warning("écriture suspendue: %d disparitions pour %d revisites abouties"
                    " sur %s — gabarit ou mur anti-bot avant renouvellement de stock",
                    gone, settled, GUARD_WINDOW)
        return "held"

    listing.disappeared_at = listing.absent_since
    return "recorded"

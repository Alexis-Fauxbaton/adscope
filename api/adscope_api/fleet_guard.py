"""Le garde-fou de flotte : au-delà d'une part de disparitions sur la fenêtre,
l'écriture s'interrompt et se journalise (`disappearance.py`, règle 3).

Déménagé mot pour mot de `disappearance.py`, que ce lot fait grossir avec la
disparition probable — même manœuvre que `fleet_guard`/`absence_scope` sortis
pour tenir sous 150 lignes. Aucune constante ne bouge, aucun test de flotte
n'a dû changer d'un caractère hors l'import.
"""

import logging
from datetime import timedelta

from sqlalchemy import func, or_, select

from .models import Listing

log = logging.getLogger("adscope.disappearance")

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

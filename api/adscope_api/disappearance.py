"""Ce qu'on écrit quand le site dit lui-même qu'une annonce n'est plus là.

Quatre règles, et les trois premières sont des refus :

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

3. Le garde-fou de flotte (`fleet_guard.py`). Une refonte de gabarit ou une
   bascule anti-bot se voit toujours comme un pic global ; un vrai
   renouvellement de stock, jamais. Au-delà d'une disparition constatée pour
   trois revisites abouties sur la fenêtre, l'écriture s'interrompt et se
   journalise — les constatations continuent d'être prises, elles sont
   réversibles.

4. Deux voix distinctes pour un fait de marché (`.superpowers/disparition-plan.md`
   §1-§3) : une disparition ferme exige deux comptes concordants — le robot
   compte comme un compte, deux clés du même compte n'en comptent qu'un. Une
   seule voix ne pose qu'un doute (`probably_gone_at`), réversible et propre à
   son déclarant (`market_query`, `alert_rules`). Entorse tranchée au texte de
   la décision : le robot confirme seul (`AUTOMATED_CONFIRMS_ALONE`), sinon
   `disappeared_at` ne s'écrirait presque plus jamais.

Le journal part en `warning` à dessein : l'API tourne sous uvicorn en
`--log-level warning`, et c'est le seul niveau qui atteigne
`~/Library/Logs/adscope-api.log`.

Le vocabulaire, enfin : une annonce disparaît. Pourquoi, on l'ignore, et ni le
code ni la colonne ne le supposent.
"""

import logging
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import select

from .models import Listing
from . import absence_scope, divergence, fleet_guard, recheck
from .revisit import CONFIRM_DELAY

log = logging.getLogger("adscope.disappearance")


class AbsenceOut(BaseModel):
    """Ce que la constatation a produit, dit sans détour : `first` a seulement
    posé un rendez-vous, `probable` n'a qu'une voix, `recorded` a écrit,
    `held` s'est heurté au garde-fou de flotte, `logged` n'a rien conclu."""

    verdict: Literal["unknown", "logged", "already", "first", "too_soon",
                     "held", "probable", "recorded"]

# La seule preuve qui écrive.
WRITES = "absent"

# Le robot confirme seul (docs/roadmap.md § Lot Corpus : « le robot fait
# foi »). À `False`, il lui faut une seconde voix comme à un marchand — et la
# base n'écrit alors presque plus de disparition ferme
# (.superpowers/disparition-plan.md §2.4).
AUTOMATED_CONFIRMS_ALONE = True


def observe(session, site: str, site_id: str, evidence: str, now, license_=None) -> str:
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
    # Le marchand déclare l'absence : la fiche est marquée « à vérifier »,
    # quel que soit le verdict ci-dessous — c'est le robot qui tranchera
    # (lot Corpus, docs/roadmap.md § Lot Corpus).
    if license_ is not None and not license_.automated:
        recheck.mark_absence(session, listing, license_, evidence, now)
    # Enregistré avant tout refus : un deuxième déclarant sur une annonce
    # déjà ferme doit compter comme une voix, sinon la levée (`revival.py`)
    # le prendrait pour un tiers.
    actors = absence_scope.report(session, listing, license_, evidence, now)
    if listing.disappeared_at is not None:
        return "already"
    if listing.absent_since is None:
        listing.absent_since = now
        listing.next_detail_crawl = now + CONFIRM_DELAY
        return "first"
    if now - listing.absent_since < CONFIRM_DELAY:
        return "too_soon"

    gone, settled = fleet_guard.fleet(session, now)
    if settled >= fleet_guard.GUARD_MIN and gone > settled * fleet_guard.GUARD_SHARE:
        log.warning("écriture suspendue: %d disparitions pour %d revisites abouties"
                    " sur %s — gabarit ou mur anti-bot avant renouvellement de stock",
                    gone, settled, fleet_guard.GUARD_WINDOW)
        return "held"

    automated = license_ is None or license_.automated
    if actors < 2 and not (automated and AUTOMATED_CONFIRMS_ALONE):
        # Un seul déclarant : un doute, pas encore un fait — voir §1 du plan.
        listing.probably_gone_at = listing.absent_since
        return "probable"

    # Le robot confirme la disparition : la seule réclamation qu'il
    # contredit est `unknown_listing` (lot Corpus, docs/roadmap.md § Lot
    # Corpus) — deux relevés automated ne produisent jamais de ligne.
    if license_ is not None and license_.automated:
        divergence.on_absence(session, listing, now)
    listing.disappeared_at = listing.absent_since
    return "recorded"

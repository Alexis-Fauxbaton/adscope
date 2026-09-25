"""La levée d'une disparition : une observation vivante contredit ce qu'un
acteur avait constaté (`.superpowers/disparition-plan.md` §1 et §5.5).

Le robot n'est jamais jugé (docs/roadmap.md § Lot Corpus) : sa propre voix
n'écrit jamais de ligne du journal. `divergence._verify` a perdu sa branche
`absence` — sinon la même contradiction produirait deux lignes dans la même
transaction, l'une ici et l'une là.

Une annonce republiée à l'identique n'est pas une résurrection : la
republication (`publication.apply`, lot E) porte sur le même `site_id`
observé de nouveau ; celle-ci, sur une annonce qu'on croyait partie. Les deux
peuvent survenir ensemble et restent indépendantes — ce module ne lit ni
n'écrit `bumped_at` ni `site_published_*`.
"""

from . import absence_scope, recheck
from .corpus_models import Divergence


def apply(session, listing, license_, now) -> None:
    """Sort immédiatement, sans requête, si l'annonce n'a jamais eu de doute
    — le chemin chaud des observations quotidiennes."""
    if (listing.absent_since is None and listing.disappeared_at is None
            and listing.probably_gone_at is None):
        return

    reports = absence_scope.reports_of(session, listing.id)
    declarants = {r.actor for r in reports}
    if listing.disappeared_at is not None and declarants:
        # Le déclarant qui se contredit lui-même ne lève rien : sa propre
        # constatation reste, une autre voix tranchera (§5.5 du plan). Les
        # fermes écrites avant ce lot n'ont aucun déclarant : n'importe
        # quelle voix les lève, comme aujourd'hui.
        if absence_scope.actor_of(license_) in declarants:
            return

    revived_by_human = license_ is not None and not license_.automated
    for report in reports:
        if report.automated:
            continue
        robot_value = "présente" if license_ is not None and license_.automated else "revue en ligne"
        session.add(Divergence(
            listing_id=listing.id, license_key_hash=report.license_key_hash,
            field="absence", merchant_value=report.evidence, robot_value=robot_value,
            observed_at=report.first_at, verified_at=now,
            delay_seconds=int((now - report.first_at).total_seconds()),
        ))

    listing.disappeared_at = listing.absent_since = listing.probably_gone_at = None
    absence_scope.clear(session, listing.id)
    if revived_by_human:
        # Sinon un marchand pourrait ressusciter en boucle l'annonce vendue
        # d'un concurrent pour qu'elle ne quitte jamais le marché — le robot
        # jugera, comme pour toute autre réclamation.
        recheck.mark_revival(session, listing, license_, now)

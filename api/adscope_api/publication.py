"""Les bornes de publication qu'une observation fait avancer.

Extrait d'`observations.record`, qui tenait pile 150 lignes avant les trois
champs du lot « champs manquants ». Un horodatage exact (`published_at`,
`bumped_at`) fait autorité et ne recule ni n'avance à rebours ;
`published_days_ago` n'infère des bornes que pour les sites qui ne donnent
qu'un libellé relatif.
"""

from datetime import timedelta


def apply(listing, observation, now) -> None:
    if observation.published_at is not None:
        listing.published_at = (
            observation.published_at
            if listing.published_at is None
            else min(listing.published_at, observation.published_at)
        )
    if observation.bumped_at is not None:
        listing.bumped_at = (
            observation.bumped_at
            if listing.bumped_at is None
            else max(listing.bumped_at, observation.bumped_at)
        )
    if observation.published_days_ago is not None:
        published = (now - timedelta(days=observation.published_days_ago)).date()
        first, last = listing.site_published_first, listing.site_published_last
        listing.site_published_first = published if first is None else min(first, published)
        if observation.published_precision == "day":
            listing.site_published_last = published if last is None else max(last, published)

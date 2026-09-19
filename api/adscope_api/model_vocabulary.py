"""Les modèles connus d'une marque, bâtis sur ce que les sites classent
eux-mêmes — et tenus en mémoire, parce qu'`observations.record` les demande à
chaque écriture.

**Pas d'auto-renforcement** : le vocabulaire ne se bâtit que sur les annonces
dont le modèle vient du site (`listings.model` renseigné et différent
d'« Autres »), jamais sur un modèle déduit. Un modèle déduit ne peut donc
jamais en autoriser un autre, et rejouer la déduction n'élargit rien.

**Un effectif minimal** écarte les fautes de saisie et les seaux d'une
annonce. Mesuré : à une annonce, « Golf Plus » et « Kangoo Express » entrent
dans le vocabulaire et raflent 22 déductions à « Golf » et « Kangoo » ; à
trois, la précision remonte de 99,45 % à 99,62 % pour 55 déductions de moins
sur 13 551. Trois est le premier palier où le bruit disparaît.

Le cache : une requête par observation rejouerait un agrégat sur 53 000
lignes sept mille fois par jour. Le vocabulaire bouge de quelques modèles par
semaine — dix minutes suffisent. **L'instant se passe en argument** ; rien ici
ne lit l'horloge.
"""

from collections import Counter, defaultdict
from datetime import timedelta

from sqlalchemy import select

from .inference import KnownModels, head, span
from .models import Listing
from .spelling import fold
from .taxonomy import UNKNOWN, key

MIN_LISTINGS = 3
# Un mot qui suit au moins quatre couples (marque, modèle) différents décrit
# une carrosserie ou une motorisation, pas un modèle. À trois, « sport »
# entrait — et 69 Range Rover Sport devenaient des Range Rover.
MIN_QUALIFIER_MODELS = 4
TTL = timedelta(minutes=10)


def vocabulary(rows, *, min_listings=MIN_LISTINGS,
               min_qualifier_models=MIN_QUALIFIER_MODELS) -> KnownModels:
    """`rows` : (clé de marque, clé de modèle, version), modèle du site."""
    rows = list(rows)
    counted = Counter((brand, model) for brand, model, _ in rows)
    kept = {pair for pair, n in counted.items() if n >= min_listings}
    by_brand = defaultdict(set)
    for brand, model in kept:
        by_brand[brand].add(model)
    followers = defaultdict(set)
    for brand, model, version in rows:
        if (brand, model) not in kept:
            continue
        words, start = head(version)
        length = span(words, start, model.replace(" ", ""))
        if length and start + length < len(words):
            followers[words[start + length]].add((brand, model))
    return KnownModels(
        by_brand={brand: frozenset(models) for brand, models in by_brand.items()},
        qualifiers=frozenset(
            word for word, pairs in followers.items()
            if len(pairs) >= min_qualifier_models
        ),
    )


def load(session) -> KnownModels:
    """Le vocabulaire lu en base, sur les seules annonces classées par le site.

    Tout part des colonnes **observées**, et les clés se recalculent ici. Lire
    `canon_model` serait plus court et faux deux fois : cette colonne porte
    aussi les modèles déduits — nos propres déductions reviendraient élargir
    le vocabulaire, une erreur en engendrerait d'autres — et elle est vide
    tant que `recanonize.py` n'est pas passé, si bien que le premier
    rattrapage d'une base neuve ne déduirait jamais rien.
    """
    rows = session.execute(
        select(Listing.brand, Listing.model, Listing.version)
        .where(Listing.brand.isnot(None), Listing.model.isnot(None))
    ).all()
    unknown = fold(UNKNOWN)
    triples = []
    for brand, model, version in rows:
        if fold(model) == unknown:
            continue
        brand_key, model_key = key(brand, model)
        if brand_key and model_key:
            triples.append((brand_key, model_key, version))
    return vocabulary(triples)


class Cache:
    """Le vocabulaire gardé en mémoire, rechargé au plus toutes les `ttl`.

    Une instance par processus (`CACHE`), une neuve par test — l'état ne se
    partage pas entre deux scénarios. `now` est toujours donné : un test pose
    l'instant à la main et vérifie que le rechargement arrive à la minute
    attendue, jamais après une vraie attente.
    """

    def __init__(self, ttl=TTL):
        self._ttl = ttl
        self._known = None
        self._loaded_at = None

    def forget(self) -> None:
        """Oublie ce qu'on avait lu — la base a changé sous nos pieds.

        En production, jamais : le vocabulaire se périme tout seul. Les tests
        refont la base à chaque scénario, et un cache qui leur survivrait
        servirait le vocabulaire du test précédent.
        """
        self._known = self._loaded_at = None

    def get(self, session, now) -> KnownModels:
        if self._known is None or now - self._loaded_at >= self._ttl:
            self._known = load(session)
            self._loaded_at = now
        return self._known


CACHE = Cache()

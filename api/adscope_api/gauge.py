"""Le gabarit des champs reçus, appliqué sans faire tomber les voisines.

Les observations arrivent par lots de cent, extraites d'une page tierce qui
choisit ce qu'elle y met. Un champ hors gabarit faisait répondre 422 — ou 500
quand la colonne était plus étroite que le schéma — pour le lot entier : cent
annonces perdues à cause d'une, et rien n'est rejoué côté extension.

Trois traitements, selon ce que le champ est :

- une prose (marque, modèle, version, raison commerciale) est tronquée à la
  largeur de sa colonne : deux cents caractères ne sont pas un modèle, mais ce
  qu'ils ont de bon y tient et le reste de l'observation est intact ;
- un code ou un identifiant hors gabarit est ignoré : tronqué, `seller_id`
  désignerait un autre marchand et mêlerait deux stocks — mieux vaut une annonce
  sans vendeur qu'une annonce mal attribuée. `postal_code` de même : rogné, il
  désigne une autre commune ;
- un nombre hors des bornes du plausible est ignoré : il ne doit ni fabriquer un
  point de prix faux, ni déborder la colonne.

L'identité de l'annonce — `site` et `site_id` — ne se rattrape pas : tronquée,
l'observation s'attacherait à une autre annonce. Celle-là seule est refusée.

Les largeurs viennent des colonnes elles-mêmes : le gabarit ne peut pas
diverger du schéma qui le porte.
"""

from .models import Listing

# Les bornes du plausible, pour les nombres qu'une page tierce nous tend.
BOUNDS = {
    # Un véhicule sous les dix millions d'euros ; au-delà, la colonne entière
    # déborde avant que le chiffre veuille dire quelque chose.
    "price": (0, 10_000_000),
    "year": (1900, 2100),
    "mileage": (0, 2_000_000),
    # Dix ans : au-delà, ce n'est plus une annonce en ligne.
    "published_days_ago": (0, 3650),
}


def width(field: str) -> int:
    """La largeur de la colonne qui recevra ce champ."""
    return Listing.__table__.c[field].type.length


def prose(value, field):
    """Tronqué au gabarit : ce que la chaîne a de bon y tient."""
    if not isinstance(value, str):
        return None
    return value[: width(field)]


def code(value, field):
    """Ignoré hors gabarit : un identifiant rogné en désigne un autre."""
    if not isinstance(value, str) or len(value) > width(field):
        return None
    return value


def number(value, field):
    low, high = BOUNDS[field]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value) if low <= value <= high else None


def identified(item) -> bool:
    """Cette observation désigne-t-elle une annonce qu'on saura retrouver."""
    if not isinstance(item, dict):
        return True
    return all(
        isinstance(item.get(f), str) and 0 < len(item[f]) <= width(f)
        for f in ("site", "site_id")
    )

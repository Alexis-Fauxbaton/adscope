"""L'adresse de la fiche sur le site source, à un seul endroit.

Une adresse mal reconstruite rend une page qui n'est pas l'annonce, et cette
page-là parle d'absence (voir `revisit`) ou pointe le marchand ailleurs (voir
`market`). Les deux la prennent d'ici, jamais chacun de son côté.
"""


def _lbc(site_id: str) -> str | None:
    if site_id.isdigit() and len(site_id) >= 6:
        return f"https://www.leboncoin.fr/ad/voitures/{site_id}"
    return None


# La Centrale remplace la lettre de tête de sa référence par son code ASCII
# (W103538172 → 87103538172) : `extension/src/sites/lacentrale.js` construit
# la même adresse côté page, vérifié sur les 23 annonces d'un relevé. `site_id`
# en base porte la référence telle quelle, lettre comprise (`E119119489`,
# `W103331993`…) — substituer `site_id` tel quel dans le gabarit numérique
# rendrait une page qui n'existe pas.
def _lacentrale(site_id: str) -> str | None:
    if not site_id or not site_id[0].isalpha():
        return None
    return f"https://www.lacentrale.fr/auto-occasion-annonce-{ord(site_id[0])}{site_id[1:]}.html"


BUILDERS = {"lbc": _lbc, "lc": _lacentrale}


def build(site: str, site_id: str) -> str | None:
    builder = BUILDERS.get(site)
    return builder(site_id) if builder else None

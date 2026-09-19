"""La région, dérivée du département — jamais une donnée observée, jamais une
colonne. Le découpage officiel en vigueur depuis le 1er janvier 2016 : treize
régions de métropole (Corse comprise) et les cinq départements et régions
d'outre-mer, chacun des 101 départements de `department.py` (96 de métropole,
2A/2B compris, plus 971/972/973/974/976) rangé dans exactement une des dix-huit.

Les noms sont l'orthographe officielle. Les identifiants (clés de `REGIONS`)
sont une forme ASCII minuscule stable pour l'URL — choisie une fois ici,
listée dans `.superpowers/recherche-lot2-api.md`, jamais recalculée du nom à
la volée pour ne pas bouger sous un accent corrigé.
"""

# identifiant -> (nom officiel, départements)
REGIONS: dict[str, tuple[str, tuple[str, ...]]] = {
    "auvergne-rhone-alpes": ("Auvergne-Rhône-Alpes", (
        "01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74",
    )),
    "bourgogne-franche-comte": ("Bourgogne-Franche-Comté", (
        "21", "25", "39", "58", "70", "71", "89", "90",
    )),
    "bretagne": ("Bretagne", ("22", "29", "35", "56")),
    "centre-val-de-loire": ("Centre-Val de Loire", ("18", "28", "36", "37", "41", "45")),
    "corse": ("Corse", ("2A", "2B")),
    "grand-est": ("Grand Est", (
        "08", "10", "51", "52", "54", "55", "57", "67", "68", "88",
    )),
    "hauts-de-france": ("Hauts-de-France", ("02", "59", "60", "62", "80")),
    "ile-de-france": ("Île-de-France", (
        "75", "77", "78", "91", "92", "93", "94", "95",
    )),
    "normandie": ("Normandie", ("14", "27", "50", "61", "76")),
    "nouvelle-aquitaine": ("Nouvelle-Aquitaine", (
        "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
    )),
    "occitanie": ("Occitanie", (
        "09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82",
    )),
    "pays-de-la-loire": ("Pays de la Loire", ("44", "49", "53", "72", "85")),
    "paca": ("Provence-Alpes-Côte d'Azur", ("04", "05", "06", "13", "83", "84")),
    "guadeloupe": ("Guadeloupe", ("971",)),
    "martinique": ("Martinique", ("972",)),
    "guyane": ("Guyane", ("973",)),
    "la-reunion": ("La Réunion", ("974",)),
    "mayotte": ("Mayotte", ("976",)),
}

DEPARTMENT_TO_REGION: dict[str, str] = {
    department: name for name, departments in REGIONS.values() for department in departments
}


def of_department(department) -> str | None:
    """Le nom de région officiel d'un département déjà normalisé
    (`department.normalize`/`department.of_postal_code`). `None` quand le
    département manque ou n'est reconnu d'aucune région."""
    return DEPARTMENT_TO_REGION.get(department)


def departments_of(region_id) -> tuple[str, ...] | None:
    """Les départements d'un identifiant de région. `None` si l'identifiant
    n'est pas reconnu — à un appelant HTTP d'en faire un 422, jamais un filtre
    muet qui ne rend jamais rien (voir `market._region_departments`)."""
    entry = REGIONS.get(region_id)
    return entry[1] if entry else None

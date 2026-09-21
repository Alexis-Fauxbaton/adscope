"""L'email du matin : sélection des candidats, dédoublonnage, ordre, quinze
lignes au plus, le sujet. Rien de nouveau n'est calculé sur le marché — tout
vient de `alert_rules.py` (recherches) et `alert_follows.py` (suivis), déjà
filtré et daté.
"""

from sqlalchemy import select

from .alert_follows import follows_for
from .alert_journal import unseen
from .alert_models import SavedSearch
from .alert_rules import drops_for, new_for

MAX_LINES = 15
# Suivis d'abord, dans l'ordre du feed : disparition, baisse, seuil.
_FOLLOW_ORDER = {"gone": 0, "drop": 1, "crossed": 2}


def _dedupe(candidates: list[dict]) -> list[dict]:
    """La première occurrence gagne — les suivis, construits en premier,
    l'emportent sur une recherche qui retrouve la même annonce (même `ref` :
    voir `alert_journal.ref_at`)."""
    seen, kept = set(), []
    for c in candidates:
        key = (c["kind"], c["listing_id"], c["ref"])
        if key in seen:
            continue
        seen.add(key)
        kept.append(c)
    return kept


def _searches_of(session, account_id):
    return session.scalars(
        select(SavedSearch).where(
            SavedSearch.account_id == account_id, SavedSearch.paused.is_(False)
        ).order_by(SavedSearch.created_at, SavedSearch.id)
    ).all()


def _drop_sort_key(c):
    # La plus forte baisse cumulée d'abord (la valeur la plus négative), puis
    # la plus vieille annonce, puis un ordre stable entre deux constructions.
    return (c["price_delta_since_first"] or 0, -(c["age_days"] or 0), c["site"], c["site_id"])


def _subject(lines: list[dict]) -> str:
    drops = sum(1 for l in lines if l["kind"] == "drop")
    moved = sum(1 for l in lines if l["kind"] in ("crossed", "gone", "new"))
    parts = []
    if drops:
        parts.append(f"{drops} baisse{'s' if drops > 1 else ''}")
    if moved:
        parts.append(f"{moved} mouvement{'s' if moved > 1 else ''}")
    return "adscope — " + " et ".join(parts) + " ce matin"


def candidates_for(session, account_id, license_, now, include_follows) -> list[dict]:
    """Tous les candidats non encore dits (`alert_journal.unseen`), dans
    l'ordre d'affichage — avant la coupe à `MAX_LINES`."""
    follow_candidates = []
    if include_follows:
        follow_candidates = sorted(
            follows_for(session, account_id, now), key=lambda c: _FOLLOW_ORDER[c["kind"]]
        )
    for c in follow_candidates:
        c["source"] = "follow"

    search_drops, search_new = [], []
    if license_ is not None:
        for search in _searches_of(session, account_id):
            if search.notify_drops:
                search_drops += drops_for(session, search, license_, now)
            search_new += new_for(session, search, license_, now)
    for c in search_drops + search_new:
        c["source"] = "search"
    search_drops.sort(key=_drop_sort_key)

    ordered = _dedupe(follow_candidates + search_drops + search_new)
    return unseen(session, account_id, ordered)


def build(session, account_id, license_, now, include_follows) -> dict | None:
    """`None` si rien à dire : rien à dire, pas d'email — c'est cette règle
    qui décide si le produit est supportable."""
    lines = candidates_for(session, account_id, license_, now, include_follows)[:MAX_LINES]
    if not lines:
        return None
    return {"subject": _subject(lines), "lines": lines}

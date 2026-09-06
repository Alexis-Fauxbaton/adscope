"""Mesure d'usage : combien de pages par jour, et pendant combien de jours.

Deux questions, deux tables. Le compteur monte à chaque observation reçue — pas
aux seuls changements de prix, qui ne mesuraient que le marché.

Le grain (licence, jour, annonce) ne sert qu'à dédoublonner les annonces tant
que la journée dure : 5 615 lignes et 3,2 Mo pour une seule, contre 3,7 Mo pour
tout l'historique de prix. Close, la journée est résumée en une ligne par
licence — les deux questions s'y répondent aussi bien — et ses lignes fines
sont effacées. Le résumé, lui, se garde sans borne.
"""

from datetime import datetime, timedelta, timezone
from itertools import chain

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from .models import License, UsageDay, UsageSummary

# Ce qu'on garde au grain fin. La journée en cours en a besoin ; les deux
# suivantes absorbent une horloge décalée et une observation en retard.
RETENTION_DAYS = 3


def bump(session, license_, listing_id, day) -> None:
    """Une observation de plus pour cette licence, ce jour, cette annonce."""
    if license_ is None:
        return
    row = insert(UsageDay).values(
        license_key_hash=license_.key_hash, day=day, listing_id=listing_id,
        observations=1,
    )
    session.execute(row.on_conflict_do_update(
        index_elements=["license_key_hash", "day", "listing_id"],
        set_={"observations": UsageDay.observations + 1},
    ))


def _human(query, model, since):
    """Les licences automatiques sont écartées à la lecture, pas à l'écriture :
    leur volume reste consultable sans se mêler à l'usage humain.
    """
    query = query.join(License, License.key_hash == model.license_key_hash).where(
        License.automated.is_(False)
    )
    return query if since is None else query.where(model.day >= since)


def by_day(session, since=None) -> list[dict]:
    """Par licence et par jour : annonces distinctes et pages vues.

    Deux tables, une lecture : les journées récentes au grain fin, les plus
    anciennes déjà résumées. Une journée peut se trouver dans les deux — une
    observation en retard sur un jour déjà fermé — et les comptes s'ajoutent.
    """
    fine = _human(
        select(UsageDay.license_key_hash, License.label, UsageDay.day,
               func.count(), func.sum(UsageDay.observations))
        .group_by(UsageDay.license_key_hash, License.label, UsageDay.day),
        UsageDay, since,
    )
    closed = _human(
        select(UsageSummary.license_key_hash, License.label, UsageSummary.day,
               UsageSummary.listings, UsageSummary.observations),
        UsageSummary, since,
    )
    merged: dict[tuple, dict] = {}
    for key, label, day, listings, observations in chain(
        session.execute(fine), session.execute(closed)
    ):
        row = merged.setdefault(
            (key, day),
            {"license_key_hash": key, "label": label, "day": day,
             "listings": 0, "observations": 0},
        )
        row["listings"] += listings
        row["observations"] += int(observations)
    return sorted(merged.values(), key=lambda r: (r["day"], r["label"], r["license_key_hash"]))


def compact(session, now=None) -> int:
    """Ferme les journées passées ; rend le nombre de journées résumées.

    Idempotente : une journée fermée n'a plus de ligne fine, et une observation
    en retard sur elle s'ajoute à son résumé.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    limit = now.date() - timedelta(days=RETENTION_DAYS - 1)
    closed = session.execute(
        select(UsageDay.license_key_hash, UsageDay.day, func.count(),
               func.sum(UsageDay.observations))
        .where(UsageDay.day < limit)
        .group_by(UsageDay.license_key_hash, UsageDay.day)
    ).all()
    for key, day, listings, observations in closed:
        row = insert(UsageSummary).values(
            license_key_hash=key, day=day, listings=listings,
            observations=int(observations),
        )
        session.execute(row.on_conflict_do_update(
            index_elements=["license_key_hash", "day"],
            set_={"listings": UsageSummary.listings + listings,
                  "observations": UsageSummary.observations + int(observations)},
        ))
    session.execute(delete(UsageDay).where(UsageDay.day < limit))
    return len(closed)


# Le jour où ce processus a déjà fermé les journées passées. Rien à lancer à la
# main : le premier lot du jour s'en charge, comme le cache de l'extension se
# purge au premier passage.
_closed_on = None


def compact_daily(session, now=None) -> int:
    global _closed_on
    day = (now or datetime.now(timezone.utc)).date()
    if _closed_on == day:
        return 0
    _closed_on = day
    return compact(session, now)


def by_license(rows) -> list[dict]:
    """Le même relevé, regroupé par licence : qui, quels jours, et jusqu'à quand.

    Deux licences peuvent porter le même libellé — la base en a deux : le
    regroupement se fait sur l'empreinte de la clé. `active_days` contre
    `span_days` dit s'il a décroché au bout de trois jours.
    """
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["license_key_hash"], []).append(row)
    out = []
    for key, days in grouped.items():
        first, last = days[0]["day"], days[-1]["day"]
        out.append({
            "license_key_hash": key,
            "label": days[0]["label"],
            "days": days,
            "active_days": len(days),
            "span_days": (last - first).days + 1,
            "first": first,
            "last": last,
            "listings": sum(day["listings"] for day in days),
            "observations": sum(day["observations"] for day in days),
        })
    return sorted(out, key=lambda lic: (lic["label"], lic["license_key_hash"]))

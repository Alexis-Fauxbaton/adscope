"""Le quota journalier par licence (lot Corpus, docs/roadmap.md § Lot Corpus) :
une digue contre l'inondation, pas une comptabilité exacte.

`usage_days` compte déjà les observations acceptées par licence et par jour
UTC (`usage.bump`, une ligne par annonce) : le quota lit cette somme, il
n'ouvre pas de second compteur. Les licences automated n'en ont pas — le robot
est la source de presque tout le trafic.

Le garde lit avant le lot : un lot de cent observations peut franchir le
plafond de quelques dizaines, et deux lots simultanés de la même clé ne
s'attendent pas. Un verrou consultatif coûterait une sérialisation à chaque
lot pour rien contre une digue.
"""

from fastapi import HTTPException
from sqlalchemy import func, select

from .config import observations_per_day
from .models import UsageDay


def guard(session, license_, now) -> None:
    if license_ is None or license_.automated:
        return
    limit = observations_per_day()
    used = session.scalar(
        select(func.coalesce(func.sum(UsageDay.observations), 0))
        .where(UsageDay.license_key_hash == license_.key_hash, UsageDay.day == now.date())
    )
    if used >= limit:
        raise HTTPException(status_code=429, detail=(
            f"Quota journalier atteint : {limit} observations par clé et par jour. "
            "Il repart à minuit UTC."
        ))

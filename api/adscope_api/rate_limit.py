"""Le limiteur de débit : une fenêtre glissante, en mémoire, une instance.

`Limiter.hit` tranche avant tout hachage — Argon2id coûte ~60 ms en
production, une route qui compte après avoir haché est un amplificateur de
charge (voir `passwords.py`, D4 du plan). L'horloge est un paramètre, jamais
`datetime.now()` : aucun test de ce module ne lit l'horloge réelle.

Un `dict[(bucket, key), list[datetime]]`, purgé de ce qui sort de la fenêtre
à chaque appel — pas de tâche de fond, pas de `Redis` : une seule instance du
service, et le compte repart à zéro à chaque redémarrage (accepté, noté au
rapport).
"""

from datetime import datetime, timedelta

from fastapi import HTTPException

from .config import trusted_proxy

RATE_LIMITED = "Trop de tentatives. Réessayez dans quelques minutes."

# (par email, par IP, fenêtre)
LIMITS = {
    "login": (10, 30, timedelta(minutes=15)),
    "signup": (5, 10, timedelta(minutes=60)),
    "forgot": (5, 10, timedelta(minutes=60)),
    "resend": (5, 10, timedelta(minutes=60)),
    "verify": (None, 30, timedelta(minutes=15)),
    "reset": (None, 30, timedelta(minutes=15)),
    # `/v1/auth/password` vérifie un mot de passe (Argon2id, ~60 ms en
    # production) et n'appelait `guard` nulle part : une session volée
    # devinait le mot de passe courant en essais illimités (AUTH-04, audit
    # auth). La clé n'est pas une adresse mais un compte (`f"account:{id}"`),
    # posée par la route — même plafond que `login`, qui vérifie le même
    # genre de secret.
    "password": (10, 30, timedelta(minutes=15)),
}

# La plus large fenêtre posée (`signup`, `forgot`, `resend` : une heure) :
# passé ce délai, une entrée n'a plus aucune chance d'entrer dans le calcul
# d'un `hit`, quel que soit son bucket — elle peut être oubliée sans risque.
MAX_WINDOW = max(window for *_, window in LIMITS.values())

_hits: dict[tuple[str, str], list[datetime]] = {}


class Limiter:
    def hit(self, bucket: str, key: str, limit: int, now: datetime, window: timedelta) -> bool:
        """Enregistre un essai ; rend `False` si le plafond est déjà atteint.

        Une adresse ou une IP jamais revue n'appelle plus jamais `hit` pour sa
        propre clé — rien ne la purgerait. Le balayage porte donc sur tout
        `_hits`, à chaque appel : gratuit ici (une IP par requête), et une clé
        morte ne survit jamais plus d'un appel d'écart (revue de code).
        """
        for dead in [k for k, seen in _hits.items() if now - seen[-1] >= MAX_WINDOW]:
            del _hits[dead]
        entry = (bucket, key)
        recent = [seen for seen in _hits.get(entry, []) if now - seen < window]
        if len(recent) >= limit:
            _hits[entry] = recent
            return False
        recent.append(now)
        _hits[entry] = recent
        return True

    def reset(self) -> None:
        _hits.clear()

    def clear(self, bucket: str, key: str) -> None:
        _hits.pop((bucket, key), None)


limiter = Limiter()


def client_ip(request) -> str:
    """L'IP qui compte pour le plafond.

    Sans `ADSCOPE_TRUSTED_PROXY` (le défaut), `X-Forwarded-For` est une
    donnée du CLIENT : le lire le rendrait forgeable, un en-tête suffirait à
    contourner le plafond de qui l'envoie. Avec la variable posée — sur
    Render, derrière `--forwarded-allow-ips` (`api/DEPLOY.md`), qui restreint
    déjà quel pair a le droit de poser l'en-tête — c'est le DERNIER élément
    qui compte : celui que le proxy de confiance a ajouté en dernier, jamais
    le premier, que le client contrôle (AUTH-06/C-1, audit-config).
    """
    if trusted_proxy():
        forwarded = request.headers.get("x-forwarded-for", "")
        last = forwarded.rsplit(",", 1)[-1].strip()
        if last:
            return last
    return request.client.host if request.client else "inconnu"


def guard(bucket: str, email: str, request, now: datetime) -> None:
    """Lève 429 si l'email ou l'IP dépasse son plafond pour ce bucket."""
    per_email, per_ip, window = LIMITS[bucket]
    ip = client_ip(request)
    if per_email is not None and not limiter.hit(bucket, f"email:{email}", per_email, now, window):
        raise HTTPException(status_code=429, detail=RATE_LIMITED)
    if not limiter.hit(bucket, f"ip:{ip}", per_ip, now, window):
        raise HTTPException(status_code=429, detail=RATE_LIMITED)

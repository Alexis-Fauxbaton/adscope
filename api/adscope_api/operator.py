"""La porte des files de machine (`GET /v1/sweep`, `POST /v1/revisits`) :
elles rendent le périmètre de tous les marchands — marque, modèle, prix,
département — et `auth.require_license` laissait passer le cookie de session
de n'importe quel compte connecté. `require_operator` referme cette porte-là :
la clé de licence du crawler passe toujours, un cookie de session ne passe
plus que pour le compte opérateur (`config.operator_email`).

Voisin d'`auth.py`, pas dedans : `require_license` y tient déjà 123 lignes,
et cette porte réutilise ses briques (`resolve`, `of_account`) plutôt que de
les dupliquer.

La branche `Bearer` rendait toute licence active, celle d'un marchand comme
celle du crawler : sa clé, lue dans `extension/popup/account.js` ou frappée
par `accounts.signup:54` à chaque inscription, ouvrait le périmètre de tous
les concurrents et la file de revisite de la flotte entière (A1/AUTH-01/A4,
audits d'accès et d'abus). Seule une licence `automated` — celle que
`mint_license.py --automated` ou `mark_automated.py` posent, jamais
l'inscription d'un compte — porte maintenant cette porte-là.
"""

from fastapi import Depends, Header, HTTPException, Request

from . import sessions
from .auth import of_account, resolve
from .config import operator_email
from .db import get_session
from .models import Account, License


def _is_operator(email: str) -> bool:
    """Casse repliée : un compte ne choisit pas celle qu'il a tapée à
    l'inscription. Variable vide → jamais vrai, comme le dit
    `config.operator_email`."""
    target = operator_email()
    return bool(target) and email.casefold() == target.casefold()


def require_operator(request: Request, authorization: str = Header(default=""),
                     session=Depends(get_session), now=Depends(sessions.now_utc)) -> License:
    scheme, _, key = authorization.partition(" ")
    if scheme.lower() == "bearer" and key:
        license_ = resolve(session, key, now)
        if license_ is None:
            raise HTTPException(status_code=401, detail="licence invalide")
        if not license_.automated:
            raise HTTPException(status_code=403, detail="réservé à l'opérateur")
        return license_
    row = sessions.resolve(session, request.cookies.get(sessions.COOKIE, ""), now)
    if row is None:
        raise HTTPException(status_code=401, detail="licence invalide")
    sessions.check_csrf(request)
    account = session.get(Account, row.account_id)
    if account is None or not _is_operator(account.email):
        raise HTTPException(status_code=403, detail="réservé à l'opérateur")
    license_ = of_account(session, row.account_id, now)
    if license_ is None:
        raise HTTPException(status_code=401, detail="licence invalide")
    if sessions.touch(row, now):
        session.commit()
    return license_

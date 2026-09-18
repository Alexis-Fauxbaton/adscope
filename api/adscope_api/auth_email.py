"""La connexion par email : un lien, pas de mot de passe, pas de clé.

Un marchand ne colle pas une clé dans un champ. Il donne son adresse, reçoit un
lien, et son navigateur garde une session. Les machines — le crawl, la file de
revisite — gardent la clé : rien de ce qui suit ne les concerne.

Les routes seules sont ici ; ce qu'elles font tient dans `login_tokens` (le
lien) et `sessions` (le cookie), avec les raisons.
"""

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from . import login_tokens, sessions
from .auth import require_license
from .auth_models import Account
from .db import get_session
from .login_tokens import consume, dev_login, enroll, mint, open_signup
from .sessions import now_utc

# Pas de `Referer` vers le site : l'URL de vérification porte le jeton, et la
# page d'arrivée n'a pas à le connaître.
NO_REFERRER = {"Referrer-Policy": "no-referrer"}

router = APIRouter()


class LoginIn(BaseModel):
    email: str = Field(max_length=254)


@router.post("/v1/auth/login", status_code=202)
def post_login(payload: LoginIn, request: Request,
               session=Depends(get_session), now=Depends(now_utc)):
    email = payload.email.strip().lower()
    account = session.scalar(select(Account).where(Account.email == email))
    if account is None and open_signup():
        account = enroll(session, email)
    raw = mint(session, account.id, now) if account is not None else None
    body = {"sent": True}
    if raw is not None:
        link = f"{request.url_for('verify_login')}?token={raw}"
        # Par le module : le transport se remplace à un seul endroit.
        login_tokens.send_login_link(email, link)
        if dev_login():
            body["dev_link"] = link
    session.commit()
    return body


@router.get("/v1/auth/verify", name="verify_login")
def get_verify(request: Request, token: str = "",
               session=Depends(get_session), now=Depends(now_utc)):
    row = consume(session, token, now)
    if row is None:
        session.commit()
        return RedirectResponse("/app/?login=expired", status_code=303,
                                headers=NO_REFERRER)
    raw = sessions.create(session, row.account_id, now)
    response = RedirectResponse("/app/", status_code=303, headers=NO_REFERRER)
    sessions.set_cookie(response, raw, sessions.is_secure(request))
    session.commit()
    return response


@router.post("/v1/auth/logout", status_code=204)
def post_logout(request: Request, session=Depends(get_session)):
    sessions.check_csrf(request)
    sessions.drop(session, request.cookies.get(sessions.COOKIE, ""))
    session.commit()
    response = Response(status_code=204)
    sessions.clear_cookie(response, sessions.is_secure(request))
    return response


# Qui est là : l'adresse pour un humain, rien pour une clé de machine — elle
# n'appartient à personne.
@router.get("/v1/me")
def get_me(license_=Depends(require_license)):
    return {"email": license_.account.email if license_.account else None,
            "label": license_.label, "expires_at": license_.expires_at}


login_tokens.announce_dev_login()

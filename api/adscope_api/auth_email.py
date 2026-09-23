"""La connexion par mot de passe : ce qu'elle répond, ce qu'elle ouvre.

Le lien magique a disparu (voir `auth_signup.py` pour ce qui reste de sa
mécanique — vérification, réinitialisation). Un marchand tape son adresse et
son mot de passe, comme sur n'importe quel site ; son navigateur garde une
session, une clé de machine continue de porter la licence en clair.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from . import accounts, sessions
from .auth import require_account_by_cookie, require_license
from .auth_signup import PASSWORD_FIELD_MAX
from .db import get_session
from .passwords import policy_error
from .rate_limit import guard
from .sessions import check_csrf, is_secure, now_utc, set_cookie

router = APIRouter()


class LoginIn(BaseModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(max_length=PASSWORD_FIELD_MAX)


class ChangeIn(BaseModel):
    current: str = Field(max_length=PASSWORD_FIELD_MAX)
    password: str = Field(max_length=PASSWORD_FIELD_MAX)


@router.post("/v1/auth/login", status_code=204)
def post_login(payload: LoginIn, request: Request, session=Depends(get_session),
              now=Depends(now_utc)):
    check_csrf(request)
    email = payload.email.strip().lower()
    guard("login", email, request, now)
    raw = accounts.login(session, email, payload.password, now)
    session.commit()
    response = Response(status_code=204)
    set_cookie(response, raw, is_secure())
    return response


@router.post("/v1/auth/logout", status_code=204)
def post_logout(request: Request, session=Depends(get_session)):
    check_csrf(request)
    sessions.drop(session, request.cookies.get(sessions.COOKIE, ""))
    session.commit()
    response = Response(status_code=204)
    sessions.clear_cookie(response, is_secure())
    return response


@router.post("/v1/auth/password", status_code=204)
def post_change_password(payload: ChangeIn, request: Request, session=Depends(get_session),
                         now=Depends(now_utc), account_id=Depends(require_account_by_cookie)):
    # `require_account_by_cookie`, jamais `require_account` : changer un mot
    # de passe est un geste humain, une clé de machine n'y a pas sa place
    # (revue de code) — et il fait déjà le CSRF pour la session cookie.
    #
    # Seule route à vérifier un mot de passe sans jamais appeler `guard` :
    # une session volée devinait le mot de passe courant en essais illimités
    # (AUTH-04, audit auth). Par compte, pas par adresse — la route n'en
    # reçoit pas — avant tout hachage, comme partout ailleurs.
    guard("password", f"account:{account_id}", request, now)
    error = policy_error(payload.password)
    if error:
        raise HTTPException(status_code=422, detail=error)
    keep = sessions.hash_token(request.cookies.get(sessions.COOKIE, ""))
    accounts.change_password(session, account_id, payload.current, payload.password, keep, now)
    session.commit()
    return Response(status_code=204)


# Qui est là : l'adresse pour un humain, rien pour une clé de machine — elle
# n'appartient à personne.
@router.get("/v1/me")
def get_me(license_=Depends(require_license)):
    return {"email": license_.account.email if license_.account else None,
            "label": license_.label, "expires_at": license_.expires_at}

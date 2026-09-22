"""Les routes de l'inscription : créer un compte, le vérifier, le renvoyer,
oublier son mot de passe, en choisir un nouveau.

Chaque route suit le même ordre — CSRF, limiteur, politique du mot de passe
s'il y en a un, domaine (`accounts.py`), commit — dans cet ordre parce
qu'Argon2id coûte ~60 ms : le limiteur doit trancher avant le premier hachage
(D4 du plan), sans quoi la route devient un amplificateur de charge.

Les deux liens (vérification, réinitialisation) pointent vers le site avec le
jeton dans le *fragment* (`#/verification?token=…`), jamais en requête : un
antivirus de messagerie qui précharge les `GET` d'un email brûlerait l'usage
unique avant que Karim clique. La page qui les reçoit POSTe ici.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from . import accounts
from .db import get_session
from .passwords import policy_error
from .rate_limit import guard
from .sessions import check_csrf, is_secure, now_utc, set_cookie

router = APIRouter()

# 256, pas 128 : `policy_error` refuse déjà au-delà de 128 avec le message
# français (`TOO_LONG`) — un plafond pydantic identique le court-circuitait
# avec un message générique, jamais vu par Karim (revue de code). Le plafond
# pydantic reste une borne dure, plus large, contre un corps énorme avant
# même d'atteindre `policy_error`.
PASSWORD_FIELD_MAX = 256


class EmailIn(BaseModel):
    email: EmailStr = Field(max_length=254)


class SignupIn(EmailIn):
    password: str = Field(max_length=PASSWORD_FIELD_MAX)


class TokenIn(BaseModel):
    token: str


class ResetIn(TokenIn):
    password: str = Field(max_length=PASSWORD_FIELD_MAX)


def _cookie_response(raw: str) -> Response:
    response = Response(status_code=204)
    set_cookie(response, raw, is_secure())
    return response


@router.post("/v1/auth/signup", status_code=202)
def post_signup(payload: SignupIn, request: Request, session=Depends(get_session),
                now=Depends(now_utc)):
    check_csrf(request)
    email = payload.email.strip().lower()
    guard("signup", email, request, now)
    error = policy_error(payload.password)
    if error:
        raise HTTPException(status_code=422, detail=error)
    accounts.signup(session, email, payload.password, now)
    session.commit()
    return {"sent": True}


@router.post("/v1/auth/verify", status_code=204)
def post_verify(payload: TokenIn, request: Request, session=Depends(get_session),
                now=Depends(now_utc)):
    check_csrf(request)
    guard("verify", "", request, now)
    raw = accounts.verify(session, payload.token, now)
    session.commit()
    return _cookie_response(raw)


@router.post("/v1/auth/resend", status_code=202)
def post_resend(payload: EmailIn, request: Request, session=Depends(get_session),
                now=Depends(now_utc)):
    check_csrf(request)
    email = payload.email.strip().lower()
    guard("resend", email, request, now)
    accounts.resend(session, email, now)
    session.commit()
    return {"sent": True}


@router.post("/v1/auth/forgot", status_code=202)
def post_forgot(payload: EmailIn, request: Request, session=Depends(get_session),
                now=Depends(now_utc)):
    check_csrf(request)
    email = payload.email.strip().lower()
    guard("forgot", email, request, now)
    accounts.forgot(session, email, now)
    session.commit()
    return {"sent": True}


@router.post("/v1/auth/password/reset", status_code=204)
def post_password_reset(payload: ResetIn, request: Request, session=Depends(get_session),
                        now=Depends(now_utc)):
    check_csrf(request)
    guard("reset", "", request, now)
    error = policy_error(payload.password)
    if error:
        raise HTTPException(status_code=422, detail=error)
    raw = accounts.reset_password(session, payload.token, payload.password, now)
    session.commit()
    return _cookie_response(raw)

"""Le domaine du compte avec mot de passe : inscription, vérification,
connexion, oubli, réinitialisation, changement — aucune route ici, les
messages d'erreur (mot pour mot) et la mécanique qui les entoure.

Chaque fonction est appelée par une route de `auth_signup.py` ou
`auth_email.py`, après que le limiteur (`rate_limit.guard`, avant tout
hachage) et le CSRF (`sessions.check_csrf`) ont tranché. Les erreurs sortent
en `HTTPException`, comme `auth.require_license` le fait déjà pour la licence.
"""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from . import login_tokens, mail_outbox, passwords, sessions
from .auth import hash_key, new_key
from .auth_models import Account
from .config import public_url
from .models import License

ALREADY_EXISTS = "Un compte existe déjà avec cet email. Connectez-vous."
BAD_CREDENTIALS = "Email ou mot de passe incorrect."
NOT_VERIFIED = "Vérifiez votre email : un lien vous attend dans votre boîte."
BAD_TOKEN = "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau."
BAD_CURRENT_PASSWORD = "Mot de passe actuel incorrect."


def _link(kind: str, token: str) -> str:
    page = "verification" if kind == "verification" else "nouveau-mdp"
    return f"{public_url()}/app/#/{page}?token={token}"


def _send(session, account_id: int, purpose: str, kind: str, subject: str, now: datetime) -> None:
    token = login_tokens.mint(session, account_id, purpose, now)
    if token is None:
        return  # plafond de jetons en vol atteint (login_tokens.MAX_PENDING)
    text = f"Bonjour,\n\nSuivez ce lien : {_link(kind, token)}\n\nL'équipe adscope."
    mail_outbox.post(session, account_id, kind, subject, text, now)


# Fait rougir `INSERT ... ON CONFLICT (email) DO NOTHING RETURNING id` : deux
# inscriptions simultanées sur la même adresse lèveraient sinon la contrainte
# `UNIQUE(email)` et rendraient un 500 (piège 4 du plan).
def signup(session, email: str, password: str, now: datetime) -> None:
    hashed = passwords.hash_password(password)
    created_id = session.execute(
        insert(Account).values(email=email)
        .on_conflict_do_nothing(index_elements=["email"]).returning(Account.id)
    ).scalar()
    if created_id is not None:
        session.add(License(key_hash=hash_key(new_key()), label=email[:64],
                            account_id=created_id))
    account = session.scalar(select(Account).where(Account.email == email))
    if account.password_hash is not None:
        raise HTTPException(status_code=409, detail=ALREADY_EXISTS)
    # Le mot de passe reste en attente : seul le clic du lien l'active (D2) —
    # sinon connaître une adresse suffirait à en prendre le compte.
    account.pending_password_hash = hashed
    _send(session, account.id, "verify", "verification", "Vérifiez votre email", now)


def resend(session, email: str, now: datetime) -> None:
    account = session.scalar(select(Account).where(Account.email == email))
    if account is not None and account.email_verified_at is None and account.pending_password_hash:
        _send(session, account.id, "verify", "verification", "Vérifiez votre email", now)


def verify(session, token: str, now: datetime) -> str:
    """Consomme le jeton, promeut le mot de passe en attente, ouvre une
    session ; rend le secret de session (jamais rendu par HTTP ailleurs)."""
    account_id = login_tokens.consume(session, token, "verify", now)
    if account_id is None:
        raise HTTPException(status_code=400, detail=BAD_TOKEN)
    account = session.get(Account, account_id)
    if account.pending_password_hash is not None:
        account.password_hash = account.pending_password_hash
        account.pending_password_hash = None
    account.email_verified_at = now
    return sessions.create(session, account_id, now)


def login(session, email: str, password: str, now: datetime) -> str:
    account = session.scalar(select(Account).where(Account.email == email))
    # Le mot de passe à vérifier est celui qui est vrai *pour Karim en ce
    # moment* : actif s'il l'a déjà activé, en attente sinon — un seul des
    # deux est jamais posé à la fois (D2). Sans quoi un compte fraîchement
    # inscrit répondrait « mot de passe incorrect » au bon mot de passe.
    candidate = (account.password_hash or account.pending_password_hash) if account else None
    if candidate is None:
        passwords.waste_time()
        raise HTTPException(status_code=401, detail=BAD_CREDENTIALS)
    if not passwords.verify_password(candidate, password):
        raise HTTPException(status_code=401, detail=BAD_CREDENTIALS)
    # Rendu seulement après vérification du mot de passe : sinon ce 403
    # apprendrait à un tiers qu'une adresse est cliente (D3/#4 du plan).
    if account.email_verified_at is None:
        raise HTTPException(status_code=403, detail=NOT_VERIFIED)
    return sessions.create(session, account.id, now)


def forgot(session, email: str, now: datetime) -> None:
    account = session.scalar(select(Account).where(Account.email == email))
    if account is not None and account.password_hash is not None:
        _send(session, account.id, "reset", "reinitialisation",
             "Réinitialisez votre mot de passe", now)


def reset_password(session, token: str, password: str, now: datetime) -> str:
    account_id = login_tokens.consume(session, token, "reset", now)
    if account_id is None:
        raise HTTPException(status_code=400, detail=BAD_TOKEN)
    account = session.get(Account, account_id)
    account.password_hash = passwords.hash_password(password)
    sessions.close_all(session, account_id)
    return sessions.create(session, account_id, now)


def change_password(session, account_id: int, current: str, password: str,
                    keep_token_hash: str) -> None:
    account = session.get(Account, account_id)
    if account is None or account.password_hash is None or not passwords.verify_password(
        account.password_hash, current
    ):
        raise HTTPException(status_code=401, detail=BAD_CURRENT_PASSWORD)
    account.password_hash = passwords.hash_password(password)
    sessions.close_others(session, account_id, keep_token_hash)

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


def _send(session, account_id: int, purpose: str, kind: str, subject: str, now: datetime,
         pending_password_hash: str | None = None) -> None:
    token = login_tokens.mint(session, account_id, purpose, now, pending_password_hash)
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
    # Le mot de passe voyage sur le jeton qu'on envoie, pas sur une case du
    # compte (D2, revue de code) : seul le clic du lien qui le porte promeut
    # CE mot de passe — jamais celui d'une inscription concurrente sur la
    # même adresse, qui aurait écrasé une case partagée.
    _send(session, account.id, "verify", "verification", "Vérifiez votre email", now,
         pending_password_hash=hashed)


def resend(session, email: str, now: datetime) -> None:
    account = session.scalar(select(Account).where(Account.email == email))
    if account is None or account.password_hash is not None:
        return
    pending = login_tokens.latest_pending_password(session, account.id, "verify", now)
    if pending is not None:
        _send(session, account.id, "verify", "verification", "Vérifiez votre email", now,
             pending_password_hash=pending)


def verify(session, token: str, now: datetime) -> str:
    """Consomme le jeton, promeut le mot de passe qu'IL portait, ouvre une
    session ; rend le secret de session (jamais rendu par HTTP ailleurs)."""
    consumed = login_tokens.consume(session, token, "verify", now)
    if consumed is None:
        raise HTTPException(status_code=400, detail=BAD_TOKEN)
    account_id, pending_password_hash = consumed
    account = session.get(Account, account_id)
    if pending_password_hash is not None:
        account.password_hash = pending_password_hash
    account.email_verified_at = now
    return sessions.create(session, account_id, now)


def login(session, email: str, password: str, now: datetime) -> str:
    account = session.scalar(select(Account).where(Account.email == email))
    if account is not None and account.password_hash is not None:
        if passwords.verify_password(account.password_hash, password):
            return sessions.create(session, account.id, now)
        raise HTTPException(status_code=401, detail=BAD_CREDENTIALS)
    # Pas de mot de passe actif : jamais de session sur la seule foi d'un mot
    # de passe en attente (D2/revue de code — un mot de passe en attente
    # n'est prouvé par aucun clic). Le vérifier ici ne fait que choisir le
    # message, sans jamais rendre de session : un tiers qui devine le mot de
    # passe en attente apprend seulement ce qu'il savait déjà en le devinant.
    pending = (login_tokens.latest_pending_password(session, account.id, "verify", now)
              if account is not None else None)
    if pending is not None:
        if passwords.verify_password(pending, password):
            raise HTTPException(status_code=403, detail=NOT_VERIFIED)
        raise HTTPException(status_code=401, detail=BAD_CREDENTIALS)
    passwords.waste_time()
    raise HTTPException(status_code=401, detail=BAD_CREDENTIALS)


def forgot(session, email: str, now: datetime) -> None:
    account = session.scalar(select(Account).where(Account.email == email))
    if account is not None and account.password_hash is not None:
        _send(session, account.id, "reset", "reinitialisation",
             "Réinitialisez votre mot de passe", now)


def reset_password(session, token: str, password: str, now: datetime) -> str:
    consumed = login_tokens.consume(session, token, "reset", now)
    if consumed is None:
        raise HTTPException(status_code=400, detail=BAD_TOKEN)
    account_id, _ = consumed
    account = session.get(Account, account_id)
    account.password_hash = passwords.hash_password(password)
    login_tokens.invalidate_pending(session, account_id, "reset", now)
    sessions.close_all(session, account_id)
    return sessions.create(session, account_id, now)


def change_password(session, account_id: int, current: str, password: str,
                    keep_token_hash: str, now: datetime) -> None:
    account = session.get(Account, account_id)
    if account is None or account.password_hash is None or not passwords.verify_password(
        account.password_hash, current
    ):
        raise HTTPException(status_code=401, detail=BAD_CURRENT_PASSWORD)
    account.password_hash = passwords.hash_password(password)
    login_tokens.invalidate_pending(session, account_id, "reset", now)
    sessions.close_others(session, account_id, keep_token_hash)

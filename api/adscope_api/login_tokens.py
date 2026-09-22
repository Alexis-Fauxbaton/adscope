"""Le jeton à usage unique : frapper, brûler, jamais rejouer.

Sert deux usages — vérifier un email, réinitialiser un mot de passe —
distingués par `purpose`, avec chacun sa durée et son propre plafond de
jetons en vol. `accounts.py` orchestre ; ce module ne connaît que la table.
"""

from datetime import datetime, timedelta

from sqlalchemy import func, select, text

from .auth_models import LoginToken
from .sessions import hash_token, new_token

# Vérification : Karim passe du garage au téléphone, une heure est confortable.
# Réinitialisation : le plus dangereux des deux liens, une demi-heure suffit.
LIFETIMES = {"verify": timedelta(minutes=60), "reset": timedelta(minutes=30)}

# Cinq jetons en vol par compte et par usage : au-delà, la boîte du marchand
# sert de mégaphone à qui connaît son adresse.
MAX_PENDING = 5


def mint(session, account_id: int, purpose: str, now: datetime,
        pending_password_hash: str | None = None) -> str | None:
    """Frappe un jeton pour ce compte et cet usage ; rien si le plafond est
    atteint.

    Le plafond compte les jetons encore valables pour ce `purpose` : pas de
    colonne de date de création à tenir, la durée de vie suffit.

    `pending_password_hash` voyage sur CE jeton (un `verify` d'inscription) :
    c'est lui, et lui seul, que `consume` rend à qui le brûle — jamais une
    case du compte, que plusieurs jetons en vol se disputeraient (revue de
    code, prise de compte).
    """
    pending = session.scalar(
        select(func.count()).select_from(LoginToken)
        .where(LoginToken.account_id == account_id, LoginToken.purpose == purpose,
              LoginToken.expires_at > now)
    )
    if pending >= MAX_PENDING:
        return None
    raw = new_token()
    session.add(LoginToken(token_hash=hash_token(raw), account_id=account_id,
                           expires_at=now + LIFETIMES[purpose], purpose=purpose,
                           pending_password_hash=pending_password_hash))
    return raw


def consume(session, raw: str, purpose: str, now: datetime) -> tuple[int, str | None] | None:
    """Brûle le jeton et rend `(compte, mot de passe en attente)` ; rien s'il
    est inconnu, usé, périmé, ou posé pour un autre usage.

    Lire puis écrire laisserait une fenêtre : plusieurs requêtes simultanées
    sur le même lien liraient chacune un jeton encore valable avant qu'aucune
    ne l'ait marqué. `UPDATE ... RETURNING` marque et lit en une seule
    instruction ; Postgres sérialise les écritures concurrentes sur la même
    ligne, si bien qu'une seule les trouve encore `used_at IS NULL`.
    """
    if not raw:
        return None
    row = session.execute(
        text("UPDATE login_tokens SET used_at = :now WHERE token_hash = :hash"
             " AND used_at IS NULL AND expires_at > :now AND purpose = :purpose"
             " RETURNING account_id, pending_password_hash"),
        {"now": now, "hash": hash_token(raw), "purpose": purpose},
    ).first()
    return (row.account_id, row.pending_password_hash) if row is not None else None


def latest_pending_password(session, account_id: int, purpose: str, now: datetime) -> str | None:
    """Le mot de passe du jeton le plus récent encore en vol, ou rien.

    Sert `resend` (redonner le même jeton sans redemander le mot de passe,
    que la route de renvoi ne reçoit pas) et `login` (choisir entre « email
    ou mot de passe incorrect » et « vérifiez votre email » sans jamais
    ouvrir de session sur cette seule foi — voir `accounts.login`).
    """
    return session.scalar(
        select(LoginToken.pending_password_hash)
        .where(LoginToken.account_id == account_id, LoginToken.purpose == purpose,
              LoginToken.used_at.is_(None), LoginToken.expires_at > now,
              LoginToken.pending_password_hash.isnot(None))
        .order_by(LoginToken.expires_at.desc())
        .limit(1)
    )


def invalidate_pending(session, account_id: int, purpose: str, now: datetime) -> None:
    """Périme tout jeton encore en vol pour ce compte et cet usage.

    Un changement de mot de passe (réinitialisé ou changé à la main) rend
    caduque toute demande de réinitialisation encore dans une boîte : sans
    ça, un lien oublié y reste vivant jusqu'à sa demi-heure alors que Karim a
    déjà repris la main (revue de code).
    """
    session.execute(
        text("UPDATE login_tokens SET used_at = :now WHERE account_id = :account_id"
             " AND purpose = :purpose AND used_at IS NULL AND expires_at > :now"),
        {"now": now, "account_id": account_id, "purpose": purpose},
    )

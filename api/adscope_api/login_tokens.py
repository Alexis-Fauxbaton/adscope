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


def mint(session, account_id: int, purpose: str, now: datetime) -> str | None:
    """Frappe un jeton pour ce compte et cet usage ; rien si le plafond est
    atteint.

    Le plafond compte les jetons encore valables pour ce `purpose` : pas de
    colonne de date de création à tenir, la durée de vie suffit.
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
                           expires_at=now + LIFETIMES[purpose], purpose=purpose))
    return raw


def consume(session, raw: str, purpose: str, now: datetime) -> int | None:
    """Brûle le jeton et rend le compte qu'il ouvre ; rien s'il est inconnu,
    usé, périmé, ou posé pour un autre usage.

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
             " RETURNING account_id"),
        {"now": now, "hash": hash_token(raw), "purpose": purpose},
    ).first()
    return row.account_id if row is not None else None

"""Le lien magique : frapper le jeton, l'envoyer, le brûler.

Trois choses tiennent ce dossier, et `auth_email` les sert :

- **Aucune énumération.** La réponse de la route est la même, à la virgule près,
  que le compte existe ou non, que le plafond soit atteint ou non. Sans cela
  elle répondrait à la question « cette adresse est-elle cliente ? », posée par
  n'importe qui, autant de fois qu'on veut. D'où `mint` qui rend `None` au lieu
  de lever : le refus ne remonte pas jusqu'au corps de la réponse.
- **L'inscription est fermée.** Une adresse inconnue ne crée rien. `adscope`
  n'est pas un service en libre-service ; les comptes se posent à la main
  (`scripts/attach_account.py`) jusqu'à la facturation.
- **Le mode local est un aveu.** `ADSCOPE_DEV_LOGIN=1` remet le lien dans la
  réponse HTTP : qui peut appeler l'API entre alors dans n'importe quel compte.
  D'où l'avertissement au démarrage, et le silence absolu sans la variable —
  l'oubli qui fuiterait serait un lien rendu « au cas où ».
"""

import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import func, select, text

from .auth import hash_key, new_key
from .auth_models import Account, LoginToken
from .models import License
from .sessions import hash_token, new_token

TOKEN_LIFETIME = timedelta(minutes=15)
# Cinq liens par quart d'heure et par adresse : au-delà, la boîte du marchand
# sert de mégaphone à qui connaît son adresse.
MAX_PENDING = 5

logger = logging.getLogger("adscope.auth")


def dev_login() -> bool:
    return os.environ.get("ADSCOPE_DEV_LOGIN") == "1"


def open_signup() -> bool:
    return os.environ.get("ADSCOPE_OPEN_SIGNUP") == "1"


# Le transport, remplaçable : ici il journalise. `warning` et pas `info` parce
# que le service tourne à `--log-level warning` — un `info` n'atteindrait pas
# `~/Library/Logs/adscope-api.log`, et le lien serait perdu.
def send_login_link(email: str, link: str) -> None:
    logger.warning("lien de connexion pour %s : %s", email, link)


def announce_dev_login(log=logger) -> None:
    if dev_login():
        log.warning("ADSCOPE_DEV_LOGIN=1 : le lien de connexion est rendu dans la"
                    " réponse HTTP — qui peut appeler l'API entre dans n'importe"
                    " quel compte")


def enroll(session, email: str) -> Account:
    """Crée le compte et la licence neuve qui va avec (inscription ouverte).

    La clé est frappée puis oubliée : personne ne la lit, et c'est le propos —
    un humain n'en voit plus jamais. La licence n'existe que comme porte-suivis
    derrière le cookie. Une machine, elle, se frappe sa clé à part.
    """
    account = Account(email=email)
    session.add(account)
    session.flush()
    session.add(License(key_hash=hash_key(new_key()), label=email[:64],
                        account_id=account.id))
    return account


def mint(session, account_id: int, now: datetime) -> str | None:
    """Frappe un jeton pour ce compte ; rien si le plafond est atteint.

    Le plafond compte les jetons encore valables : ils durent un quart d'heure,
    ce sont donc exactement ceux du dernier quart d'heure. Pas de colonne de
    date de création à tenir pour cela.
    """
    pending = session.scalar(
        select(func.count()).select_from(LoginToken)
        .where(LoginToken.account_id == account_id, LoginToken.expires_at > now)
    )
    if pending >= MAX_PENDING:
        return None
    raw = new_token()
    session.add(LoginToken(token_hash=hash_token(raw), account_id=account_id,
                           expires_at=now + TOKEN_LIFETIME))
    return raw


def consume(session, raw: str, now: datetime) -> int | None:
    """Brûle le jeton et rend le compte qu'il ouvre ; rien s'il est inconnu,
    usé ou périmé.

    Lire puis écrire laisserait une fenêtre : huit requêtes simultanées sur le
    même lien liraient chacune un jeton encore valable avant qu'aucune ne l'ait
    marqué, et ouvriraient huit sessions pour un lien qui n'en vaut qu'une.
    `UPDATE ... RETURNING` marque et lit en une seule instruction ; Postgres
    sérialise les écritures concurrentes sur la même ligne, si bien qu'une
    seule les trouve encore `used_at IS NULL` — les autres ne rendent aucune
    ligne, pas une erreur.
    """
    if not raw:
        return None
    row = session.execute(
        text("UPDATE login_tokens SET used_at = :now WHERE token_hash = :hash"
             " AND used_at IS NULL AND expires_at > :now RETURNING account_id"),
        {"now": now, "hash": hash_token(raw)},
    ).first()
    return row.account_id if row is not None else None

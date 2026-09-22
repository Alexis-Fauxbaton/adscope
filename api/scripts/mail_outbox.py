"""Lit la boîte d'envoi locale — les emails que l'API a « écrits » sans
fournisseur branché (vérification, réinitialisation).

    python -m scripts.mail_outbox --tail 5

Le même chemin que l'email du matin (`send_digests.py`) : en développement,
Alexis les relit ici plutôt que dans un journal — aucune route HTTP ne rend
jamais un lien (voir `accounts.py`).
"""

import argparse

from sqlalchemy import select

from adscope_api.auth_models import Account, Mail
from adscope_api.db import SessionLocal


def tail(session, count: int) -> list[dict]:
    rows = session.execute(
        select(Mail, Account.email).join(Account, Account.id == Mail.account_id)
        .order_by(Mail.id.desc()).limit(count)
    ).all()
    return [{"created_at": mail.created_at, "email": email, "kind": mail.kind,
            "subject": mail.subject, "text": mail.text} for mail, email in rows]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tail", type=int, default=5)
    args = parser.parse_args(argv)

    with SessionLocal() as session:
        rows = tail(session, args.tail)
    if not rows:
        print("boîte vide")
    for row in reversed(rows):
        print(f"--- {row['created_at']} · {row['email']} · {row['kind']} ---")
        print(row["subject"])
        print(row["text"])
        print()


if __name__ == "__main__":
    main()

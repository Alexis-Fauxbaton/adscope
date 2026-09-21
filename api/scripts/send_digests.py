"""Pose l'email du matin de chaque compte — dans ce lot, une ligne dans la
boîte d'envoi (`digests`), rien de plus : aucun fournisseur d'email n'est
branché.

    python -m scripts.send_digests [--dry-run] [--now 2026-09-21T07:00:00Z]

Idempotent : rejoué le même jour, ne pose rien de plus
(`UNIQUE(account_id, day)` sur `digests`). `--dry-run` construit tout, résume
sur la sortie standard, ne commite rien. `--now` rejoue une date donnée —
jamais l'horloge réelle, ni ici ni dans les tests.

Pas de planification dans ce lot : une ligne de `launchd` ou de `cron` à 7 h,
posée à la main, appellera cette commande le jour où un fournisseur d'email
sera branché.
"""

import argparse
from datetime import datetime, timezone

from sqlalchemy import select

from adscope_api.auth_models import Account
from adscope_api.digest_send import send_for_account


def run(session_factory, now, dry_run: bool = False) -> list[dict]:
    """Prend une fabrique de sessions en paramètre : jamais la base
    `adscope` depuis un test — celui-ci lui donne `adscope_test`."""
    sent = []
    with session_factory() as session:
        account_ids = session.scalars(select(Account.id).order_by(Account.id)).all()
        for account_id in account_ids:
            result = send_for_account(session, account_id, now, dry_run=dry_run)
            if result is not None:
                sent.append(result)
    return sent


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--now", help="ISO-8601, ex. 2026-09-21T07:00:00Z")
    args = parser.parse_args(argv)
    now = datetime.fromisoformat(args.now) if args.now else datetime.now(timezone.utc)

    from adscope_api.db import SessionLocal  # importé ici : évite de charger le
    # moteur de connexion tant que la commande n'a pas fini de lire ses arguments

    sent = run(SessionLocal, now, dry_run=args.dry_run)
    if not sent:
        print("rien à envoyer")
    for item in sent:
        print(f"compte {item['account_id']} : {item['subject']} ({item['lines']} lignes)")


if __name__ == "__main__":
    main()

"""Pose l'email du matin de chaque compte, et mesure le passage
(`digest_runs`, trigger « script ») — le planificateur interne
(`adscope_api.scheduler`) appelle la même mesure, trigger « scheduler »
(`.superpowers/planificateur.md`).

    python -m scripts.send_digests [--dry-run] [--now 2026-09-21T07:00:00Z]

Idempotent : rejoué le même jour, ne pose rien de plus
(`UNIQUE(account_id, day)` sur `digests`, `day` sur `digest_runs` — au plus
`digest_run.MAX_ATTEMPTS` essais). `--dry-run` construit tout, résume sur la
sortie standard, ne commite rien nulle part — mesure comprise. `--now`
rejoue une date donnée — jamais l'horloge réelle, ni ici ni dans les tests.
"""

import argparse
from datetime import datetime, timezone

from adscope_api.digest_run import record
from adscope_api.digest_send import run


def _print_sent(sent):
    if not sent:
        print("rien à envoyer")
    for item in sent:
        print(f"compte {item['account_id']} : {item['subject']} ({item['lines']} lignes)")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--now", help="ISO-8601, ex. 2026-09-21T07:00:00Z")
    args = parser.parse_args(argv)
    now = datetime.fromisoformat(args.now) if args.now else datetime.now(timezone.utc)

    from adscope_api.db import SessionLocal  # importé ici : évite de charger le
    # moteur de connexion tant que la commande n'a pas fini de lire ses arguments

    if args.dry_run:
        _print_sent(run(SessionLocal, now, dry_run=True))
        return

    result = record(SessionLocal, now, trigger="script")
    if result["already_done"]:
        print(f"déjà traité pour le {result['day']} ({result['sent'] or 0} email(s))")
        return
    if result["error"]:
        print(f"échec : {result['error']}")
    _print_sent(result["sent_list"])


if __name__ == "__main__":
    main()

"""Rattache une licence à un compte, et fusionne sur elle ce qui traînait ailleurs.

    attach_account.py --email <adresse> --license <préfixe> [--merge <préfixe>]...

La licence se désigne par un préfixe de son empreinte, jamais par son libellé :
la base porte deux licences « alexis ». Le compte est créé s'il manque.

`--merge` verse les suivis et le périmètre d'une autre licence sur celle qui est
rattachée, puis la détache. Rien n'est supprimé : ni la licence fusionnée, ni
ses points de prix — c'est de l'historique de marché, et le supprimer effacerait
des observations vraies. Elle cesse seulement d'être une porte d'entrée pour le
compte.

Idempotent : rejouée, la commande ne pose rien de neuf et ne perd aucune date de
mise de côté (`ON CONFLICT DO NOTHING` sur les deux tables).

L'adresse est un argument de ligne de commande, jamais une valeur écrite ici :
c'est de la donnée personnelle, et le dépôt n'est pas un fichier de clients.
"""
import sys

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from adscope_api.auth_models import Account
from adscope_api.db import session_scope
from adscope_api.follow_models import Follow, TrackedFamily
from adscope_api.models import License


def flag(name, args, many=False):
    found = [args[i + 1] for i, a in enumerate(args) if a == name and i + 1 < len(args)]
    return found if many else (found[0] if found else None)


def by_prefix(session, prefix: str) -> License:
    """La licence dont l'empreinte commence par ce préfixe — une seule."""
    found = session.scalars(
        select(License).where(License.key_hash.startswith(prefix))
    ).all()
    if len(found) != 1:
        sys.exit(f"« {prefix} » désigne {len(found)} licences, il en faut une")
    return found[0]


def account_for(session, email: str) -> Account:
    # Abaissée en casse, débarrassée de ses espaces : le lien magique ne
    # connaît le marchand que par cette forme-là (`auth_email.post_login`), et
    # une majuscule collée à la main ne doit pas poser un second compte.
    email = email.strip().lower()
    account = session.scalar(select(Account).where(Account.email == email))
    if account is None:
        account = Account(email=email)
        session.add(account)
        session.flush()
    return account


def merge(session, source: License, target: License) -> tuple[int, int]:
    """Verse les suivis et le périmètre de `source` sur `target`, sans conflit."""
    moved = []
    for model, columns in ((Follow, ("listing_id", "followed_at")),
                           (TrackedFamily, ("brand", "model"))):
        rows = session.execute(
            select(*[model.__table__.c[name] for name in columns])
            .where(model.license_key_hash == source.key_hash)
        ).all()
        values = [dict(zip(columns, row)) | {"license_key_hash": target.key_hash}
                  for row in rows]
        if values:
            session.execute(insert(model).values(values).on_conflict_do_nothing())
        moved.append(len(values))
    source.account_id = None
    return tuple(moved)


def main(argv):
    email, target = flag("--email", argv), flag("--license", argv)
    if not email or not target:
        sys.exit(__doc__)
    with session_scope() as session:
        account = account_for(session, email)
        kept = by_prefix(session, target)
        kept.account_id = account.id
        said = [f"{kept.label} ({kept.key_hash[:4]}…) rattachée à {email}"]
        for prefix in flag("--merge", argv, many=True):
            other = by_prefix(session, prefix)
            follows, families = merge(session, other, kept)
            said.append(f"fusionnée : {other.label} ({other.key_hash[:4]}…) —"
                        f" {follows} suivis, {families} familles")
    print("\n".join(said))


if __name__ == "__main__":
    main(sys.argv[1:])

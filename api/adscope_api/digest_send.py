"""La transaction d'un compte : bâtir l'email du matin, poser la ligne de
boîte d'envoi, marquer le journal — dans cet ordre, pour que l'idempotence
tienne. Marquer avant d'insérer condamnerait des alertes à ne jamais être
dites pour un courrier qui n'a jamais existé.

`run` (tous les comptes) est ce que `scripts/send_digests.py` et le
planificateur (`digest_run.record`) appellent tous les deux — jamais
dupliqué entre les deux : voir `.superpowers/planificateur.md`.
"""

import secrets
from datetime import timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from .alert_journal import mark
from .alert_models import Digest
from .alert_settings import settings_of
from .auth import of_account
from .auth_models import Account
from .digest_build import build
from .digest_html import render as render_html
from .digest_text import render as render_text


def send_for_account(session, account_id: int, now, dry_run: bool = False) -> dict | None:
    """Construit et pose l'email du matin d'un compte ; `None` si rien à
    envoyer (rien à dire, email coupé, ou déjà servi aujourd'hui)."""
    settings = settings_of(session, account_id, now)
    if not settings.digest_enabled:
        session.commit()  # garde la ligne de réglage si elle vient d'être créée
        return None

    license_ = of_account(session, account_id, now)
    built = build(session, account_id, license_, now, settings.include_follows)
    if built is None:
        session.commit()
        return None

    # Frappé en Python, avant l'insertion : les liens de l'email peuvent le
    # porter, et une seule écriture suffit (pas de relecture après coup).
    token = secrets.token_urlsafe(16)
    day = now.astimezone(timezone.utc).date()
    text = render_text(built["lines"], token, settings.unsubscribe_token_hash)
    html = render_html(built["lines"], token, settings.unsubscribe_token_hash)
    row_id = session.execute(
        insert(Digest)
        .values(account_id=account_id, day=day, token=token, subject=built["subject"],
                text=text, html=html, created_at=now)
        .on_conflict_do_nothing(index_elements=["account_id", "day"])
        .returning(Digest.id)
    ).scalar()

    if row_id is None:
        # Déjà servi aujourd'hui : la journée ne se rejoue pas, et le journal
        # d'unicité ne bouge pas pour un courrier qui n'a pas été écrit.
        session.rollback()
        return None
    if dry_run:
        session.rollback()
        return {"account_id": account_id, "subject": built["subject"], "lines": len(built["lines"])}

    mark(session, account_id, built["lines"], now)
    session.commit()
    return {"account_id": account_id, "subject": built["subject"], "lines": len(built["lines"])}


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

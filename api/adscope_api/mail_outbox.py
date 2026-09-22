"""La boîte d'envoi transactionnelle locale : un email « écrit », pas envoyé.

Même chemin que l'email du matin (`digest_send.py`) : en développement, sans
fournisseur branché, un email devient une ligne dans `mails`. Personne ne le
lit en le journalisant — `scripts/mail_outbox.py --tail` le fait, à la
demande, jamais dans une réponse HTTP.

Au go-live 2, `post` est le seul endroit à remplacer par un vrai fournisseur.
"""

from datetime import datetime

from .auth_models import Mail


def post(session, account_id: int, kind: str, subject: str, text: str, now: datetime) -> None:
    session.add(Mail(account_id=account_id, kind=kind, subject=subject,
                     text=text, created_at=now))

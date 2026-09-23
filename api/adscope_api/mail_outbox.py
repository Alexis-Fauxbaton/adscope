"""La boîte d'envoi transactionnelle locale : un email « écrit », pas envoyé.

Même chemin que l'email du matin (`digest_send.py`) : en développement, sans
fournisseur branché, un email devient une ligne dans `mails`. Personne ne le
lit en le journalisant — `scripts/mail_outbox.py --tail` le fait, à la
demande, jamais dans une réponse HTTP.

Au go-live 2, `post` est le seul endroit à remplacer par un vrai fournisseur.
"""

from datetime import datetime, timedelta

from .auth_models import Mail

# `mails.text` porte le jeton en clair (le lien de vérification ou de
# réinitialisation), et rien ne purgeait la table (C-3/D3, audits config et
# données) : un historique nominatif sans borne, jetons compris. Au-delà de
# la plus longue durée de vie d'un jeton (`login_tokens.LIFETIMES`, soixante
# minutes), la ligne n'a plus de valeur opérationnelle — `purge_expired` la
# retire. Ne remplace pas (a), le geste plus profond que le go-live 2 rendra
# sans objet : ne plus écrire le jeton du tout.
RETENTION = timedelta(hours=2)


def post(session, account_id: int, kind: str, subject: str, text: str, now: datetime) -> None:
    session.add(Mail(account_id=account_id, kind=kind, subject=subject,
                     text=text, created_at=now))


def purge_expired(session, now: datetime) -> int:
    return session.query(Mail).filter(Mail.created_at < now - RETENTION).delete()

"""Les tables du compte : un humain, ses jetons de connexion, ses sessions.

La licence reste la porte de l'API — toutes les routes s'authentifient par elle,
et les machines continuent de la porter en clair dans un en-tête. Le compte se
pose à côté : il dit à qui la licence appartient, et c'est lui qu'un navigateur
présente, par cookie, à la place de la clé.

Les deux secrets — jeton de connexion et identifiant de session — ne sont jamais
enregistrés en clair. `sessions.hash_token` les réduit à leur empreinte, comme
`auth.hash_key` le fait des clés, et c'est l'empreinte qui est la clé primaire :
le secret lui-même ne rencontre aucune comparaison.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 254 est la longueur maximale d'une adresse selon la RFC 5321.
    email: Mapped[str] = mapped_column(String(254), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # `NULL` = pas de mot de passe (compte du lot Comptes, dont celui
    # d'Alexis) ; la connexion par mot de passe le refuse simplement.
    password_hash: Mapped[str | None] = mapped_column(String(128), default=None)
    # Posé à l'inscription sur un compte existant sans mot de passe, promu en
    # `password_hash` au seul clic sur le lien de vérification — jamais
    # avant, sinon connaître une adresse suffit à en prendre le compte.
    pending_password_hash: Mapped[str | None] = mapped_column(String(128), default=None)
    # `NULL` = email non vérifié : la connexion par mot de passe le refuse
    # (403) tant que le lien n'a pas été suivi.
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )


class LoginToken(Base):
    """Le jeton à usage unique : un lien de vérification ou de
    réinitialisation, jamais les deux à la fois.

    `used_at` marque la consommation plutôt que de supprimer la ligne : un lien
    rejoué doit être refusé, et une ligne effacée ne refuse rien — elle est
    seulement introuvable, ce qui est le même verdict rendu pour une autre
    raison. L'index sert le plafond, qui compte les jetons encore valables.
    `purpose` (`'verify'` ou `'reset'`) empêche qu'un jeton serve l'autre
    usage — un lien de vérification qui réinitialiserait un mot de passe
    serait une porte que Karim n'a jamais ouverte.
    """

    __tablename__ = "login_tokens"
    __table_args__ = (Index("ix_login_tokens_account", "account_id", "expires_at"),)

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    purpose: Mapped[str] = mapped_column(String(16), default="verify",
                                         server_default="verify")


class Mail(Base):
    """La boîte d'envoi transactionnelle locale : un email « écrit », pas
    envoyé — même chemin que l'email du matin (`digest_send.py`), pour que
    les liens de vérification et de réinitialisation ne dépendent d'aucun
    fournisseur en développement. `api/scripts/mail_outbox.py --tail` les lit.

    Pas de colonne d'adresse : elle se résout à la lecture (`accounts.email`),
    comme `digests` le fait déjà, pour ne jamais garder une copie périmée.
    """

    __tablename__ = "mails"
    __table_args__ = (Index("ix_mails_account", "account_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SessionToken(Base):
    """La session de navigateur : glissante, quatre-vingt-dix jours.

    `last_seen_at` n'est rafraîchi qu'une fois par jour (`sessions.touch`) : le
    rafraîchir à chaque requête ferait de chaque lecture une écriture, et la
    popup en émet plusieurs par fiche ouverte.
    """

    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_account", "account_id"),)

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

"""Le mot de passe : le hacher, le vérifier, dire pourquoi il est refusé.

Argon2id, paramètres explicites plutôt que les défauts tacites d'une
version future de la bibliothèque — un test (`test_production_parameters_
are_the_strong_ones`) les garde. `waste_time` hache un mot de passe bidon :
appelé quand l'adresse n'existe pas, il égalise le temps de réponse de la
connexion sur celui d'un vrai échec de mot de passe.
"""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from .common_passwords import COMMON_PASSWORDS

MIN_LENGTH = 10
MAX_LENGTH = 128

TOO_SHORT = "Choisissez un mot de passe d'au moins 10 caractères."
TOO_COMMON = "Ce mot de passe est trop courant. Choisissez-en un autre."
TOO_LONG = "Mot de passe trop long (128 caractères au maximum)."

# t=3, m=65536 KiB, p=4 : les défauts d'argon2-cffi, écrits en clair plutôt
# que tacites — une évolution de la bibliothèque ne doit pas faire bouger le
# coût de hachage sans qu'on le décide ici.
ARGON2_TIME_COST = 3
ARGON2_MEMORY_COST = 65536
ARGON2_PARALLELISM = 4
_hasher = PasswordHasher(time_cost=ARGON2_TIME_COST, memory_cost=ARGON2_MEMORY_COST,
                         parallelism=ARGON2_PARALLELISM)


def hasher() -> PasswordHasher:
    return _hasher


def policy_error(password: str) -> str | None:
    """La règle enfreinte, en français ; `None` si le mot de passe passe."""
    if len(password) < MIN_LENGTH:
        return TOO_SHORT
    if len(password) > MAX_LENGTH:
        return TOO_LONG
    if password.lower() in COMMON_PASSWORDS:
        return TOO_COMMON
    return None


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    # `InvalidHashError` (pas une sous-classe de `VerifyMismatchError`) sort
    # d'un `hashed` qui n'est pas un encodage Argon2 valide — une colonne
    # corrompue ne doit pas faire un 500 là où un mauvais mot de passe fait
    # un 401 (revue de code).
    try:
        return _hasher.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


# Le mot de passe bidon est fixe : ce n'est pas son contenu qui compte, c'est
# qu'Argon2 hache une fois, au coût configuré — celui du hacheur courant, pas
# celui figé dans un hash précalculé (les tests patchent `_hasher` pour aller
# vite ; un hash précalculé garderait, lui, le coût fort).
_DECOY_PASSWORD = "un-mot-de-passe-bidon-de-longueur-comparable"


def waste_time() -> None:
    _hasher.hash(_DECOY_PASSWORD)

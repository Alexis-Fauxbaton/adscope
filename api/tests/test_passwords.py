"""Le mot de passe : le hacher, le vérifier, dire pourquoi il est refusé."""

from adscope_api import passwords


# Fait rougir `_hasher.hash(password)` redevenu `return password` : un mot de
# passe en clair dans la base est la fuite la plus simple à commettre.
def test_the_hash_does_not_contain_the_clear_password():
    hashed = passwords.hash_password("un-mot-de-passe-solide")
    assert "un-mot-de-passe-solide" not in hashed


def test_verify_accepts_the_right_password():
    hashed = passwords.hash_password("un-mot-de-passe-solide")
    assert passwords.verify_password(hashed, "un-mot-de-passe-solide") is True


def test_verify_refuses_the_wrong_password():
    hashed = passwords.hash_password("un-mot-de-passe-solide")
    assert passwords.verify_password(hashed, "autre-chose-du-tout") is False


# Fait rougir `except (VerifyMismatchError, InvalidHashError)` : une colonne
# corrompue (pas un encodage Argon2 valide) refuse comme un mauvais mot de
# passe, jamais un 500 (revue de code).
def test_a_corrupted_hash_is_refused_not_a_crash():
    assert passwords.verify_password("pas-un-hash-argon2", "peu-importe") is False


# Fait rougir `if len(password) < MIN_LENGTH` : neuf caractères refusés, dix
# acceptés — la limite posée par le lot.
def test_nine_characters_are_refused():
    assert passwords.policy_error("garagepro") == passwords.TOO_SHORT


def test_ten_characters_are_accepted():
    assert passwords.policy_error("garageprod") is None


def test_a_password_over_128_characters_is_refused():
    assert passwords.policy_error("a" * 129) == passwords.TOO_LONG


# Fait rougir `password.lower() in COMMON_PASSWORDS` : un mot de passe courant
# est refusé, casse ignorée.
def test_a_common_password_is_refused():
    assert passwords.policy_error("password123") == passwords.TOO_COMMON


def test_a_common_password_is_refused_regardless_of_case():
    assert passwords.policy_error("PASSWORD123") == passwords.TOO_COMMON


def test_each_error_names_the_rule():
    assert "10 caractères" in passwords.TOO_SHORT
    assert "courant" in passwords.TOO_COMMON


# Fait rougir `_hasher.hash(_DECOY_PASSWORD)` dans `waste_time` : sans lui,
# une adresse inconnue répond plus vite qu'une adresse connue, et le temps de
# réponse trahit ce que le corps de la réponse cache.
def test_waste_time_actually_hashes(monkeypatch):
    calls = []

    class FakeHasher:
        def hash(self, password):
            calls.append(password)
            return "x"

    monkeypatch.setattr(passwords, "_hasher", FakeHasher())
    passwords.waste_time()
    assert calls == [passwords._DECOY_PASSWORD]


# Fait rougir la ligne `PasswordHasher(time_cost=ARGON2_TIME_COST, ...)` : les
# paramètres de production doivent rester les forts, même si un test ailleurs
# patche l'instance `_hasher` pour aller vite (`conftest._cheap_hasher`).
def test_production_parameters_are_the_strong_ones():
    assert passwords.ARGON2_TIME_COST == 3
    assert passwords.ARGON2_MEMORY_COST == 65536
    assert passwords.ARGON2_PARALLELISM == 4

"""Les mots de passe les plus courants : une liste courte, pour refuser les
pires plutôt que pour prétendre couvrir tous les cas.

Une centaine d'entrées, en minuscules — la comparaison ignore la casse
(`passwords.is_common`). Mélange de classiques anglophones (les listes
publiques de mots de passe qui fuient sont dominées par eux) et de variantes
françaises, numériques, ou liées au clavier.
"""

COMMON_PASSWORDS = frozenset({
    "123456789", "1234567890", "password", "password1", "password123",
    "12345678", "123456", "1234567", "qwerty123", "qwertyuiop",
    "azerty123", "azertyuiop", "admin123", "administrator", "letmein123",
    "welcome123", "iloveyou1", "sunshine1", "princess1", "football1",
    "baseball1", "dragon123", "monkey123", "trustno1", "superman1",
    "batman123", "starwars1", "shadow123", "master123", "hunter123",
    "freedom123", "whatever1", "michael123", "jennifer1", "jordan23",
    "cheese123", "summer2024", "summer2025", "winter2024", "winter2025",
    "motdepasse", "motdepasse1", "bonjour123", "bienvenue1", "soleil123",
    "marseille1", "marseille13", "azertyui1", "azerty1234", "pass1234",
    "passer123", "changeme1", "changeme123", "temporaire1", "nouveaupass",
    "abcdefgh1", "abc123456", "a1b2c3d4e5", "qazwsxedc1", "zaq12wsx1",
    "1q2w3e4r5t", "1qaz2wsx3e", "letmein12", "welcome12", "monkeymonkey",
    "chocolate1", "computer1", "internet12", "football12", "basketball1",
    "flower123", "butterfly1", "elephant12", "important1", "protect123",
    "security12", "default123", "guest12345", "test123456", "demo123456",
    "sample1234", "gamer12345", "player1234", "coucoutoi1", "salutsalut",
    "voiture123", "garage1234", "adscope123", "leboncoin1", "occasion12",
    "123123123", "111111111", "000000000", "999999999", "121212121",
    "aaaaaaaaa1", "qwerty12345", "iloveyou12", "sunshine12", "starwars12",
})

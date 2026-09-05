import json
from pathlib import Path

import pytest

from adscope_api.fingerprint import fingerprint, fingerprint_key, normalize

VECTORS = json.loads(
    (Path(__file__).parents[2] / "shared" / "fingerprint-vectors.json").read_text()
)


@pytest.mark.parametrize("v", VECTORS, ids=lambda v: v["fingerprint"])
def test_matches_shared_vectors(v):
    args = (v["brand"], v["model"], v["version"], v["year"], v["mileage"])
    assert fingerprint_key(*args) == v["key"]
    assert fingerprint(*args) == v["fingerprint"]


def test_normalize_strips_accents_and_punctuation():
    assert normalize("Citroën C4  (Picasso)") == "CITROEN C4 PICASSO"


def test_normalize_handles_none():
    assert normalize(None) == ""


def test_fingerprint_is_twelve_hex_chars():
    fp = fingerprint("PEUGEOT", "308", "1.2", 2018, 62686)
    assert len(fp) == 12
    assert all(c in "0123456789abcdef" for c in fp)

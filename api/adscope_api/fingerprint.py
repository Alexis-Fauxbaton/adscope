import hashlib
import re
import unicodedata

_NON_ALNUM = re.compile(r"[^A-Z0-9]+")


def normalize(value) -> str:
    text = "" if value is None else str(value)
    decomposed = unicodedata.normalize("NFD", text)
    without_marks = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return _NON_ALNUM.sub(" ", without_marks.upper()).strip()


def fingerprint_key(brand, model, version, year, mileage) -> str:
    return "|".join([
        normalize(brand),
        normalize(model),
        normalize(version),
        "" if year is None else str(year),
        "" if mileage is None else str(mileage),
    ])


def fingerprint(brand, model, version, year, mileage) -> str:
    key = fingerprint_key(brand, model, version, year, mileage)
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]

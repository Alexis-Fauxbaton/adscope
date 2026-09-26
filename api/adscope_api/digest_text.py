"""La version texte de l'email du matin, et les dates courtes françaises —
`digest_html.py` les importe d'ici, une seule écriture.

Une ligne par candidat (`digest_build.build`), jamais de photo, de nom de
vendeur ni du mot « vendue » — ce que porte un candidat ne le permet déjà pas
(`alert_rules.py`/`alert_follows.py` n'y mettent rien de tel).
"""

from .config import public_url
from .department_labels import label_of as department_label

MONTHS_SHORT = ("janv.", "févr.", "mars", "avr.", "mai", "juin",
                "juil.", "août", "sept.", "oct.", "nov.", "déc.")


def money(n: int) -> str:
    return f"{n:,}".replace(",", " ") + " €"


def short_date(dt) -> str:
    day = dt.day
    return f"{'1er' if day == 1 else day} {MONTHS_SHORT[dt.month - 1]}"


# Publiques : `digest_html.py` les réutilise, pour ne composer ce texte
# qu'à un seul endroit.
def line_url(base: str, token: str, candidate: dict) -> str:
    if candidate["source"] == "follow":
        return f"{base}/app/?d={token}#/suivis"
    return f"{base}/app/?d={token}#/marche?{candidate['search_query']}"


def department_of(candidate: dict) -> str:
    dept = candidate.get("department")
    return f"{department_label(dept)} ({dept})" if dept else ""


def body_of(candidate: dict) -> str:
    kind = candidate["kind"]
    age = f"en ligne depuis {candidate['age_days']} jours" if candidate["age_days"] else ""
    if kind == "drop":
        # La fenêtre honnête : « entre le 14 et le 17 » quand les deux relevés
        # tombent des jours différents, « le 24 » quand c'est le même jour —
        # « entre le 24 et le 24 » se lisait comme une coquille.
        seen_from, seen_to = candidate["window_from"], candidate["window_to"]
        window = f"constatée le {short_date(seen_to)}"
        if seen_from is not None and short_date(seen_from) != short_date(seen_to):
            window = f"constatée entre le {short_date(seen_from)} et le {short_date(seen_to)}"
        delta = candidate["price_delta_since_first"]
        # Signe explicite : `money` ne préfixe que le négatif, un cumul
        # positif (prix remonté avant cette baisse) se lirait comme une baisse.
        sign = "+" if delta is not None and delta > 0 else ""
        cumulative = f"{sign}{money(delta)} depuis le premier prix" if delta is not None else ""
        return " · ".join(p for p in (
            f"{money(candidate['price_before'])} → {money(candidate['price_after'])}",
            cumulative, age, window,
        ) if p)
    if kind == "new":
        price = money(candidate["price_after"]) if candidate["price_after"] is not None else ""
        return " · ".join(p for p in (f"nouvelle annonce{' à ' + price if price else ''}", age) if p)
    if kind == "crossed":
        return f"passe {candidate['crossed']} jours en ligne"
    return "n'est plus en ligne"  # kind == "gone" — jamais « vendue »


def line(candidate: dict, token: str) -> str:
    base = public_url()
    parts = [candidate["label"], body_of(candidate), department_of(candidate)]
    parts = [p for p in parts if p]
    urls = [candidate["url"], line_url(base, token, candidate)]
    parts += [u for u in urls if u]
    return " — ".join(parts)


def render(lines: list[dict], token: str, unsub_token: str) -> str:
    base = public_url()
    body = "\n".join(line(c, token) for c in lines)
    footer = (
        f"\nTout voir : {base}/app/?d={token}#/alertes\n"
        f"Se désabonner de l'email du matin : {base}/app/desabonnement.html?t={unsub_token}\n"
    )
    return body + "\n" + footer

from datetime import datetime, timezone

from adscope_api.digest_html import render
from adscope_api.digest_text import money

NOW = datetime(2026, 9, 18, 9, 0, tzinfo=timezone.utc)
TOKEN = "tok-1234567890"
UNSUB = "unsub-1234567890"


def drop(price_before=23900, price_after=22700, delta=-1200, age_days=412):
    return {
        "kind": "drop", "age_days": age_days, "price_before": price_before, "price_after": price_after,
        "window_from": NOW, "window_to": NOW, "price_delta_since_first": delta,
        "label": "Peugeot 208 II PureTech 100 Allure", "department": "92",
        "url": "https://www.lacentrale.fr/auto-occasion-annonce-C6123456.html",
        "source": "search", "search_query": "brand=Peugeot",
    }


# Fait rougir `_link` appelée sans `FONT` dans son `style` : sans lui, un
# lien sort en Times bleu souligné dans la plupart des clients mail, qui
# n'héritent pas la police du bloc englobant sur un `<a>`.
def test_every_link_carries_its_own_font_family():
    html = render([drop()], TOKEN, UNSUB)
    morceaux = html.split("<a ")[1:]
    assert len(morceaux) >= 4  # « Voir l'annonce », « Voir sur adscope », « Gérer mes alertes », « Me désabonner »
    for morceau in morceaux:
        assert "font-family" in morceau.split(">")[0]


# Fait rougir `_split_price_line` : sans la coupe sur « → », le prix se
# perdrait dans le paragraphe gris des faits au lieu de sa propre ligne,
# sombre et plus grande.
def test_the_price_line_stands_out_from_the_grey_facts():
    html = render([drop()], TOKEN, UNSUB)
    assert "font-size:15px;font-weight:700;color:#111" in html
    prix_bloc = html.split("font-size:15px;font-weight:700;color:#111")[1].split("</div>")[0]
    assert money(23900) in prix_bloc and money(22700) in prix_bloc
    # Le prix ne se répète pas dans la ligne grise des faits.
    faits_bloc = html.split("font-size:14px;color:#555")[1].split("</div>")[0]
    assert money(23900) not in faits_bloc


# Fait rougir le pied : sans lui, l'email ne dirait ni pourquoi il est
# envoyé, ni comment le régler, ni comment s'en désabonner.
def test_the_footer_explains_why_and_links_to_manage_and_unsubscribe():
    html = render([drop()], TOKEN, UNSUB)
    assert "Vous recevez cet email parce que" in html
    assert f"?d={TOKEN}#/alertes" in html
    assert f"desabonnement.html?t={UNSUB}" in html
    assert "Gérer mes alertes" in html
    assert "Me désabonner" in html


# Un candidat sans flèche de prix (`kind == "crossed"`) n'a pas de ligne de
# prix — la carte ne casse pas, elle n'en affiche simplement pas.
def test_a_candidate_without_a_price_arrow_has_no_price_line():
    candidate = {
        "kind": "crossed", "age_days": 90, "crossed": 90, "label": "Renault Clio V",
        "department": "59", "url": None, "source": "search", "search_query": "brand=Renault",
        "price_before": None, "price_after": None, "window_from": None, "window_to": None,
        "price_delta_since_first": None,
    }
    html = render([candidate], TOKEN, UNSUB)
    assert "font-size:15px;font-weight:700;color:#111" not in html

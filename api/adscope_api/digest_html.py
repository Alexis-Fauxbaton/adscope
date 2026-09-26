"""La version HTML de l'email du matin. Styles en ligne uniquement — aucune
feuille externe ne survit à un client de messagerie —, registre du site : sol
`#F4F5F7`, cartes blanches rayon 22, accent `#4F46E5`, Manrope avec repli
système. Une ligne = une carte, une chose par carte. Largeur fixe 600 px,
table de mise en page. Aucune image, donc aucun pixel espion.

Chaque `<a>` porte `FONT` dans son propre `style` : un client de messagerie
n'hérite pas la police du bloc englobant sur un lien, qui sortirait sinon en
Times bleu souligné — la police système, pas celle du texte courant.

Tout texte venu d'une annonce (`label` au premier chef) passe par
`html.escape` : composé à partir de ce que les sites écrivent, un site peut y
mettre `<`.
"""

from html import escape

from .config import public_url
from .digest_text import body_of, department_of, line_url

FONT = "font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
ACCENT = "#4F46E5"
FLOOR = "#F4F5F7"


def _link(href: str, label: str, color: str = ACCENT) -> str:
    return f'<a href="{escape(href)}" style="{FONT};color:{color};text-decoration:none">{label}</a>'


# « 23 900 € → 22 700 € » porte la nouvelle et l'ancienne valeur — c'est ce
# que le marchand lit en premier, avant le cumul, l'ancienneté ou la fenêtre
# de constat. `body_of` compose tout en une phrase ; ce repère (la flèche)
# sépare ce premier segment sans le recomposer une seconde fois.
def _split_price_line(body: str) -> tuple[str, str]:
    parts = body.split(" · ")
    if parts and "→" in parts[0]:
        return parts[0], " · ".join(parts[1:])
    return "", body


def _card(candidate: dict, token: str) -> str:
    base = public_url()
    label = escape(candidate["label"])
    price_line, facts = _split_price_line(body_of(candidate))
    dept = escape(department_of(candidate))
    meta = " · ".join(p for p in (escape(facts), dept) if p)
    href = line_url(base, token, candidate)
    links = _link(href, "Voir sur adscope")
    listing_url = candidate["url"]
    if listing_url:
        listing_link = _link(listing_url, "Voir l'annonce")
        links = f"{listing_link} &nbsp;·&nbsp; {links}"
    price_html = (
        f'<div style="{FONT};font-size:15px;font-weight:700;color:#111;margin-top:4px">'
        f'{escape(price_line)}</div>' if price_line else ""
    )
    return f"""
    <tr><td style="padding:8px 0">
      <table role="presentation" width="100%" style="background:#fff;border-radius:22px;
        box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <tr><td style="padding:20px 24px">
          <div style="{FONT};font-size:16px;font-weight:700;color:#111">{label}</div>
          {price_html}
          <div style="{FONT};font-size:14px;color:#555;margin-top:4px">{meta}</div>
          <div style="{FONT};font-size:13px;margin-top:10px">{links}</div>
        </td></tr>
      </table>
    </td></tr>"""


def render(lines: list[dict], token: str, unsub_token: str) -> str:
    base = public_url()
    cards = "".join(_card(c, token) for c in lines)
    manage_link = f"{base}/app/?d={token}#/alertes"
    unsub_link = f"{base}/app/desabonnement.html?t={unsub_token}"
    footer_links = f'{_link(manage_link, "Gérer mes alertes")} &nbsp;·&nbsp; {_link(unsub_link, "Me désabonner", "#999")}'
    # `<meta charset>` : sans lui, un client ou un navigateur qui rend le corps
    # HTML hors de l'enveloppe MIME devine l'encodage — Safari a rendu
    # « 34â€¯100Â â‚¬ » sur le premier email réel (2026-09-26).
    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>adscope</title></head>
<body style="margin:0;padding:0;background:{FLOOR}">
<table role="presentation" width="100%" style="background:{FLOOR}">
<tr><td align="center">
<table role="presentation" width="600" style="max-width:600px;width:100%;padding:24px 16px">
  <tr><td style="{FONT};font-size:20px;font-weight:800;color:#111;padding:0 8px 8px">adscope</td></tr>
  {cards}
  <tr><td style="{FONT};font-size:12px;color:#999;padding:24px 8px 0;line-height:1.7">
    Vous recevez cet email parce que vous avez enregistré une recherche ou suivez des
    annonces sur adscope.<br>{footer_links}
  </td></tr>
</table>
</td></tr>
</table>
</body></html>"""

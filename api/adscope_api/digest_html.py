"""La version HTML de l'email du matin. Styles en ligne uniquement — aucune
feuille externe ne survit à un client de messagerie —, registre du site : sol
`#F4F5F7`, cartes blanches rayon 22, accent `#4F46E5`, Manrope avec repli
système. Une ligne = une carte, une chose par carte. Largeur fixe 600 px,
table de mise en page. Aucune image, donc aucun pixel espion.

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


def _card(candidate: dict, token: str) -> str:
    base = public_url()
    label = escape(candidate["label"])
    body = escape(body_of(candidate))
    dept = escape(department_of(candidate))
    meta = " · ".join(p for p in (body, dept) if p)
    href = line_url(base, token, candidate)
    links = f'<a href="{escape(href)}" style="color:{ACCENT};text-decoration:none">Voir sur adscope</a>'
    if candidate["url"]:
        links = (
            f'<a href="{escape(candidate["url"])}" style="color:{ACCENT};text-decoration:none">'
            f'Voir l\'annonce</a> &nbsp;·&nbsp; {links}'
        )
    return f"""
    <tr><td style="padding:8px 0">
      <table role="presentation" width="100%" style="background:#fff;border-radius:22px;
        box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <tr><td style="padding:20px 24px">
          <div style="{FONT};font-size:16px;font-weight:700;color:#111">{label}</div>
          <div style="{FONT};font-size:14px;color:#555;margin-top:4px">{meta}</div>
          <div style="{FONT};font-size:13px;margin-top:10px">{links}</div>
        </td></tr>
      </table>
    </td></tr>"""


def render(lines: list[dict], token: str, unsub_token: str) -> str:
    base = public_url()
    cards = "".join(_card(c, token) for c in lines)
    all_link = f"{base}/app/?d={token}#/alertes"
    unsub_link = f"{base}/app/desabonnement.html?t={unsub_token}"
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:{FLOOR}">
<table role="presentation" width="100%" style="background:{FLOOR}">
<tr><td align="center">
<table role="presentation" width="600" style="max-width:600px;width:100%;padding:24px 16px">
  <tr><td style="{FONT};font-size:20px;font-weight:800;color:#111;padding:0 8px 8px">adscope</td></tr>
  {cards}
  <tr><td style="padding:20px 8px 0">
    <a href="{escape(all_link)}" style="{FONT};color:{ACCENT};font-size:14px;text-decoration:none">
      Tout voir sur adscope →</a>
  </td></tr>
  <tr><td style="{FONT};font-size:12px;color:#999;padding:24px 8px 0">
    <a href="{escape(unsub_link)}" style="color:#999">Se désabonner de l'email du matin</a>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>"""

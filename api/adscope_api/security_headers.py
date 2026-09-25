"""En-têtes de sécurité, posés sur toute réponse — API et `/app` partagent
l'origine qui porte le cookie de session, aucune route n'en était pourvue
(C-7/INJ-2, audits config et injection).

`Content-Security-Policy` ne porte que sur `/app` : c'est le seul endroit qui
rend du HTML. Depuis D10, le site ne charge plus aucune police externe
(pile système, `web/css/base.css`) et n'a plus de script en ligne
(`web/js/unsubscribe-page.js`) : `default-src 'self'` suffit, sans domaine
tiers à autoriser.
"""

from .config import public_url

CSP = (
    "default-src 'self'; script-src 'self'; "
    "img-src 'self' data:; base-uri 'self'; frame-ancestors 'none'"
)


class SecurityHeaders:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def with_headers(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append((b"x-content-type-options", b"nosniff"))
                headers.append((b"referrer-policy", b"strict-origin-when-cross-origin"))
                headers.append((b"x-frame-options", b"DENY"))
                if scope["path"].startswith("/app"):
                    headers.append((b"content-security-policy", CSP.encode()))
                # Strict-Transport-Security suit `ADSCOPE_PUBLIC_URL` (`is_secure`,
                # `sessions.py`), jamais l'en-tête `Host` de la requête : le poser
                # sur un poste local en `http` casserait tout accès suivant.
                if public_url().startswith("https://"):
                    headers.append(
                        (b"strict-transport-security", b"max-age=15552000; includeSubDomains")
                    )
            await send(message)

        await self.app(scope, receive, with_headers)

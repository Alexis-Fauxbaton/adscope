"""Le corps d'une requête, jamais lu au-delà d'une limite.

FastAPI met le corps entier en RAM avant de résoudre la moindre dépendance —
`require_license` compris : un corps de 400 Mo, refusé ensuite par un simple
401, avait déjà fait grimper l'instance à 1,7 Go (A1, audit d'abus), sans la
moindre authentification. Ce middleware ASGI pur coupe la lecture avant ce
seuil, sans jamais construire de `Request` ni bufferiser lui-même : un
`Content-Length` déclaré trop grand refuse d'entrer, un corps qui grossit
sans le déclarer (encodage `chunked`) est arrêté pendant sa lecture, au même
seuil.
"""

# Cent observations — le plus gros lot que l'API accepte (`intake.ObservationsIn`)
# — pèsent de l'ordre de 15 Ko. Deux megaoctets laissent une marge large sans
# jamais approcher ce qui fait grimper l'instance.
MAX_BODY_BYTES = 2_000_000


class _BodyTooLarge(Exception):
    pass


class BodySizeLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and int(declared) > MAX_BODY_BYTES:
            await _reject(send)
            return

        seen = 0
        started = False

        async def capped_receive():
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > MAX_BODY_BYTES:
                    raise _BodyTooLarge()
            return message

        async def watching_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, capped_receive, watching_send)
        except _BodyTooLarge:
            if not started:
                await _reject(send)


async def _reject(send) -> None:
    await send({
        "type": "http.response.start", "status": 413,
        "headers": [(b"content-type", b"application/json")],
    })
    await send({"type": "http.response.body", "body": b'{"detail":"corps trop volumineux"}'})

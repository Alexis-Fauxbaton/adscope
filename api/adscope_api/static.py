"""Le site sous `/app` : jamais de cache silencieux, et `tests/` jamais servi.

`StaticFiles` pose déjà `ETag` et `Last-Modified`, mais sans `Cache-Control`
c'est le navigateur seul qui décide de la fraîcheur — et il a servi un
`format.js` de la veille après un déploiement, délogé seulement par un
rechargement forcé. `no-cache` force la revalidation à chaque chargement :
l'ETag posé plus haut fait tout le travail, un fichier inchangé revient en
304 sans retélécharger quoi que ce soit.

`web/tests/*.mjs` décrit le contrat exact de chaque route à qui le lit
(C-7, audit-config) : utile en local, jamais en ligne.
"""

from fastapi import HTTPException
from starlette.staticfiles import StaticFiles


class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        if path == "tests" or path.startswith("tests/"):
            raise HTTPException(status_code=404)
        return await super().get_response(path, scope)

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["cache-control"] = "no-cache"
        return response

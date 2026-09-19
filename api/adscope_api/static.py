"""Le site sous `/app` : jamais de cache silencieux.

`StaticFiles` pose déjà `ETag` et `Last-Modified`, mais sans `Cache-Control`
c'est le navigateur seul qui décide de la fraîcheur — et il a servi un
`format.js` de la veille après un déploiement, délogé seulement par un
rechargement forcé. `no-cache` force la revalidation à chaque chargement :
l'ETag posé plus haut fait tout le travail, un fichier inchangé revient en
304 sans retélécharger quoi que ce soit.
"""

from starlette.staticfiles import StaticFiles


class NoCacheStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["cache-control"] = "no-cache"
        return response

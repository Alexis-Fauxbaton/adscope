from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from .auth import require_license
from .comparables import comparables_for
from .db import get_session
from .disappearance import AbsenceOut, observe
from . import alert_settings, auth_email, digests, families, follows, market, market_facets, saved_searches
from .follows import followed_ids
from .models import Listing
from .observations import record
from .intake import AbsenceIn, ObservationsIn
from .revisit import due
from .schemas import (
    BatchIn, ComparablesOut, RevisitIn, RevisitOut, SellerStatsOut, SignalsOut,
)
from .sellers import stats_for
from .signals import signals_for
from .static import NoCacheStaticFiles
from .usage import compact_daily

app = FastAPI(title="adscope", version="0.1.0")
app.include_router(auth_email.router)
app.include_router(follows.router)
app.include_router(families.router)
app.include_router(market.router)
app.include_router(market_facets.router)
app.include_router(saved_searches.router)
app.include_router(alert_settings.router)
app.include_router(digests.router)

# Le site du marchand : des fichiers statiques, jamais authentifiés — la porte
# reste sur `/v1/*`. `check_dir=False` parce que le dossier peut ne pas encore
# exister au démarrage du service (les trois lots livrent en parallèle) ; sans
# lui `StaticFiles` refuse de se monter et le service entier ne démarre plus.
app.mount(
    "/app", NoCacheStaticFiles(directory=Path(__file__).resolve().parents[2] / "web",
                               html=True, check_dir=False),
    name="app",
)


# Le lot verrouille chaque annonce qu'il touche jusqu'à son commit. Deux lots
# qui portent les deux mêmes annonces en sens inverse s'attendent l'un l'autre
# et Postgres en tue un : un ordre commun à tous les émetteurs ôte le cycle. Le
# tri est stable — deux observations d'une même annonce gardent leur rang.
def ordered(items):
    return sorted(items, key=lambda item: (item.site, item.site_id))


@app.post("/v1/observations")
def post_observations(payload: ObservationsIn, session=Depends(get_session),
                      license_=Depends(require_license)):
    for item in ordered(payload.items):
        record(session, item, source="user", license_=license_)
    # La mesure d'usage ferme ses journées passées au premier lot du jour. Elle
    # trébucherait qu'elle n'emporterait pas les observations : c'est le défaut
    # qu'on vient de fermer.
    try:
        with session.begin_nested():
            compact_daily(session)
    except SQLAlchemyError:
        pass
    session.commit()
    # Ce qui est entré, et ce que le lot portait qu'on ne pouvait pas
    # enregistrer : un refus muet serait la perte silencieuse qu'on ferme ici.
    return {"accepted": len(payload.items), "refused": payload.refused}


@app.post("/v1/listings/batch", response_model=list[SignalsOut])
def post_batch(payload: BatchIn, session=Depends(get_session),
               license_=Depends(require_license)):
    listings = session.scalars(
        select(Listing)
        .where(Listing.site == payload.site, Listing.site_id.in_(payload.ids))
        .options(selectinload(Listing.prices))
    ).all()
    # Une requête pour tout le lot, jamais une par annonce : la page de
    # résultats en porte trente.
    kept = followed_ids(session, license_, [listing.id for listing in listings])
    return [signals_for(listing, followed=listing.id in kept) for listing in listings]


@app.get("/v1/listings/{site}/{site_id}", response_model=SignalsOut)
def get_listing(site: str, site_id: str, session=Depends(get_session),
                license_=Depends(require_license)):
    listing = session.scalar(
        select(Listing).where(Listing.site == site, Listing.site_id == site_id)
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="annonce inconnue")
    return signals_for(listing, followed=bool(followed_ids(session, license_, [listing.id])))


# Le marché autour d'une annonce : le segment auquel elle appartient et le rang
# qu'elle y tient. Le calcul reste dans Postgres — un segment de deux cents
# annonces suivies depuis des mois, ce sont des milliers de points de prix qu'on
# ne remonte pas en mémoire pour en tirer cinq nombres.
@app.get("/v1/listings/{site}/{site_id}/comparables", response_model=ComparablesOut)
def get_comparables(site: str, site_id: str, session=Depends(get_session),
                    _=Depends(require_license)):
    listing = session.scalar(
        select(Listing).where(Listing.site == site, Listing.site_id == site_id)
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="annonce inconnue")
    return comparables_for(session, listing)


# Les statistiques d'un marchand, agrégées à la demande. La popup les demande
# à l'ouverture d'une fiche : l'appel est la mesure d'usage de la
# fonctionnalité, sans un seul événement de télémétrie.
@app.get("/v1/sellers/{site}/{seller_id}", response_model=SellerStatsOut)
def get_seller(site: str, seller_id: str, session=Depends(get_session),
               _=Depends(require_license)):
    stats = stats_for(session, site, seller_id)
    if stats is None:
        raise HTTPException(status_code=404, detail="vendeur inconnu")
    return stats


# La file de revisite, et la constatation qui en revient. Les deux se tiennent
# derrière la même licence que le reste : c'est le crawler local qui prend la
# file, l'extension qui rapporte ce que la page ouverte a dit.
@app.post("/v1/revisits", response_model=list[RevisitOut])
def post_revisits(payload: RevisitIn, session=Depends(get_session),
                  _=Depends(require_license)):
    items = due(session, payload.site, payload.limit, datetime.now(timezone.utc))
    session.commit()
    return items


@app.post("/v1/disappearances", response_model=AbsenceOut)
def post_disappearance(payload: AbsenceIn, session=Depends(get_session),
                       _=Depends(require_license)):
    verdict = observe(session, payload.site, payload.site_id, payload.evidence,
                      datetime.now(timezone.utc))
    session.commit()
    return {"verdict": verdict}

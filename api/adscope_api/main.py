from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from .auth import require_license
from .body_limit import BodySizeLimit
from .comparables import comparables_for
from .config import docs_urls, validate_startup
from .db import get_session
from .disappearance import AbsenceOut, observe
from . import (
    alert_settings, auth_email, auth_signup, digests, families, follows, market,
    market_facets, quota, saved_searches, sweep,
)
from .follows import followed_ids
from .mail_outbox import purge_expired
from .models import Listing
from .observations import ordered, record
from .intake import AbsenceIn, ObservationsIn
from .operator import require_operator
from .revisit import due
from .schemas import (
    BatchIn, ComparablesOut, RevisitIn, RevisitOut, SellerStatsOut, SignalsOut,
)
from .security_headers import SecurityHeaders
from .sellers import stats_for
from .signals import signals_for
from .static import NoCacheStaticFiles
from .usage import compact_daily

validate_startup()  # refuse de démarrer si la config de production est incomplète
# Fermés par défaut (INJ-1) : Swagger/Redoc, CDN sans intégrité, origine du cookie.
_docs_url, _redoc_url, _openapi_url = docs_urls()
app = FastAPI(title="adscope", version="0.1.0", docs_url=_docs_url,
             redoc_url=_redoc_url, openapi_url=_openapi_url)
app.add_middleware(BodySizeLimit)  # A1 : un corps énorme n'entre plus en RAM.
app.add_middleware(SecurityHeaders)  # C-7/INJ-2 : en-têtes sur /app et l'API
app.include_router(auth_email.router)
app.include_router(auth_signup.router)
app.include_router(follows.router)
app.include_router(families.router)
app.include_router(market.router)
app.include_router(market_facets.router)
app.include_router(saved_searches.router)
app.include_router(alert_settings.router)
app.include_router(digests.router)
app.include_router(sweep.router)

# Le site du marchand : fichiers statiques, jamais authentifiés — la porte
# reste sur `/v1/*`. `check_dir=False` : le dossier peut ne pas encore exister.
app.mount(
    "/app", NoCacheStaticFiles(directory=Path(__file__).resolve().parents[2] / "web",
                               html=True, check_dir=False),
    name="app",
)


@app.post("/v1/observations")
def post_observations(payload: ObservationsIn, session=Depends(get_session),
                      license_=Depends(require_license)):
    # La digue du lot Corpus : au-delà du quota, la clé (non automated) est
    # refusée avant toute écriture — l'ordre du lot n'a pas encore d'importance.
    quota.guard(session, license_, datetime.now(timezone.utc))
    for item in ordered(payload.items):
        record(session, item, source="user", license_=license_)
    # La mesure d'usage ferme ses journées passées au premier lot du jour ; la
    # boîte d'envoi purge ses lignes expirées au même geste (C-3/D3).
    try:
        with session.begin_nested():
            compact_daily(session)
            purge_expired(session, datetime.now(timezone.utc))
    except SQLAlchemyError:
        pass
    session.commit()
    return {"accepted": len(payload.items), "refused": payload.refused}


@app.post("/v1/listings/batch", response_model=list[SignalsOut])
def post_batch(payload: BatchIn, session=Depends(get_session),
               license_=Depends(require_license)):
    listings = session.scalars(
        select(Listing)
        .where(Listing.site == payload.site, Listing.site_id.in_(payload.ids),
              Listing.disappeared_at.is_(None))  # jamais servie disparue (D5)
        .options(selectinload(Listing.prices))
    ).all()
    kept = followed_ids(session, license_, [listing.id for listing in listings])  # un seul appel
    return [signals_for(listing, followed=listing.id in kept) for listing in listings]


@app.get("/v1/listings/{site}/{site_id}", response_model=SignalsOut)
def get_listing(site: str, site_id: str, session=Depends(get_session),
                license_=Depends(require_license)):
    listing = session.scalar(
        select(Listing).where(Listing.site == site, Listing.site_id == site_id,
                              Listing.disappeared_at.is_(None))  # jamais disparue (D5)
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="annonce inconnue")
    return signals_for(listing, followed=bool(followed_ids(session, license_, [listing.id])))


# Le marché autour d'une annonce : le segment et le rang qu'elle y tient. Le
# calcul reste dans Postgres, jamais remonté en mémoire pour cinq nombres.
@app.get("/v1/listings/{site}/{site_id}/comparables", response_model=ComparablesOut)
def get_comparables(site: str, site_id: str, session=Depends(get_session),
                    _=Depends(require_license)):
    listing = session.scalar(
        select(Listing).where(Listing.site == site, Listing.site_id == site_id)
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="annonce inconnue")
    return comparables_for(session, listing)


# Les statistiques d'un marchand, agrégées à la demande — l'appel est déjà la
# mesure d'usage, sans télémétrie séparée.
@app.get("/v1/sellers/{site}/{seller_id}", response_model=SellerStatsOut)
def get_seller(site: str, seller_id: str, session=Depends(get_session),
               _=Depends(require_license)):
    stats = stats_for(session, site, seller_id)
    if stats is None:
        raise HTTPException(status_code=404, detail="vendeur inconnu")
    return stats


# La file de revisite, derrière `require_operator` — comme `/v1/sweep`, elle
# rend le périmètre de tous les marchands.
@app.post("/v1/revisits", response_model=list[RevisitOut])
def post_revisits(payload: RevisitIn, session=Depends(get_session),
                  _=Depends(require_operator)):
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

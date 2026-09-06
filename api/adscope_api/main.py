from fastapi import Depends, FastAPI, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .auth import resolve
from .db import get_session
from .models import Listing
from .observations import record
from .intake import ObservationsIn
from .schemas import BatchIn, SellerStatsOut, SignalsOut
from .sellers import stats_for
from .signals import signals_for

app = FastAPI(title="adscope", version="0.1.0")


def require_license(authorization: str = Header(default=""), session=Depends(get_session)):
    scheme, _, key = authorization.partition(" ")
    license_ = resolve(session, key) if scheme.lower() == "bearer" and key else None
    if license_ is None:
        raise HTTPException(status_code=401, detail="licence invalide")
    return license_


@app.post("/v1/observations")
def post_observations(payload: ObservationsIn, session=Depends(get_session),
                      license_=Depends(require_license)):
    for item in payload.items:
        record(session, item, source="user", license_=license_)
    session.commit()
    # Ce qui est entré, et ce que le lot portait qu'on ne pouvait pas
    # enregistrer : un refus muet serait la perte silencieuse qu'on ferme ici.
    return {"accepted": len(payload.items), "refused": payload.refused}


@app.post("/v1/listings/batch", response_model=list[SignalsOut])
def post_batch(payload: BatchIn, session=Depends(get_session), _=Depends(require_license)):
    listings = session.scalars(
        select(Listing)
        .where(Listing.site == payload.site, Listing.site_id.in_(payload.ids))
        .options(selectinload(Listing.prices))
    ).all()
    return [signals_for(listing) for listing in listings]


@app.get("/v1/listings/{site}/{site_id}", response_model=SignalsOut)
def get_listing(site: str, site_id: str, session=Depends(get_session),
                _=Depends(require_license)):
    listing = session.scalar(
        select(Listing).where(Listing.site == site, Listing.site_id == site_id)
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="annonce inconnue")
    return signals_for(listing)


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


@app.get("/v1/me")
def get_me(license_=Depends(require_license)):
    return {"label": license_.label, "expires_at": license_.expires_at}

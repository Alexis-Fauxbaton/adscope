"""Les annonces qu'un marchand met de côté.

Le suivi vise une annonce — le périmètre, son pendant à la maille de la famille
de véhicules, vit dans `families`. L'un et l'autre entrent en rang 0 de la file
de revisite (`revisit._rank`) : c'est la seule chose que le marchand puisse dire
qui change ce que la base saura demain.

Suivre pose `next_detail_crawl = now`, et rien d'autre. Le silence exigé par la
file — trois jours sans nouvelle — tient toujours : suivre ne rouvre pas une
fiche que le balayage vient de montrer vivante, cela lève seulement
l'espacement posé par la dernière revisite.

Suivre est idempotent parce que le bouton l'est : recliquer ne doit ni produire
une erreur, ni perdre la date de mise de côté. `ON CONFLICT DO NOTHING` le tient
même quand deux onglets cliquent ensemble.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from .auth import require_license
from .db import get_session
from .follow_models import Follow
from .models import Listing

# Ni plafond à l'écriture ni pagination à la lecture : cinq cents `POST`
# suffisaient à tout suivre, et chacun tombait en rang 0 de la file de
# revisite commune (A7), tandis que `GET /v1/follows/feed` chargeait tout en
# mémoire à chaque appel de l'email du matin (A8, audits d'abus). Un marchand
# qui en suit deux cents surveille déjà plus que ce qu'il regarde à la main.
MAX_FOLLOWS = 200

router = APIRouter()


class FollowIn(BaseModel):
    site: str = Field(max_length=8)
    site_id: str = Field(max_length=32)


class FollowOut(BaseModel):
    site: str
    site_id: str
    followed_at: datetime


def followed_ids(session, license_, ids) -> set[int]:
    """Parmi ces annonces, celles que la licence appelante suit — elle seule.

    La même annonce suivie par un autre marchand ne s'affiche pas ici ; elle
    pèse en revanche sur la file, qui sert tout le monde à la fois.
    """
    if not ids:
        return set()
    return set(session.scalars(
        select(Follow.listing_id).where(
            Follow.license_key_hash == license_.key_hash, Follow.listing_id.in_(ids)
        )
    ))


@router.post("/v1/follows", response_model=FollowOut, status_code=201)
def post_follow(payload: FollowIn, response: Response, session=Depends(get_session),
                license_=Depends(require_license)):
    listing = session.scalar(
        select(Listing).where(
            Listing.site == payload.site, Listing.site_id == payload.site_id
        )
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="annonce inconnue")
    existing = session.scalar(
        select(Follow.followed_at).where(
            Follow.license_key_hash == license_.key_hash, Follow.listing_id == listing.id,
        )
    )
    if existing is not None:
        # Déjà suivie : la date d'origine est rendue telle quelle, et la file
        # n'est pas rouverte — un second clic n'est pas un second geste, et le
        # plafond ne mord pas ce qui est déjà posé.
        response.status_code = 200
        return {"site": listing.site, "site_id": listing.site_id, "followed_at": existing}
    count = session.scalar(
        select(func.count()).select_from(Follow)
        .where(Follow.license_key_hash == license_.key_hash)
    )
    if count >= MAX_FOLLOWS:
        raise HTTPException(status_code=409, detail="trop d'annonces suivies")
    now = datetime.now(timezone.utc)
    followed_at = session.execute(
        insert(Follow)
        .values(license_key_hash=license_.key_hash, listing_id=listing.id,
                followed_at=now)
        .on_conflict_do_nothing()
        .returning(Follow.followed_at)
    ).scalar()
    if followed_at is None:
        # Course perdue contre un clic simultané sur le même onglet : la ligne
        # existe déjà, sa date fait foi.
        response.status_code = 200
        followed_at = session.scalar(
            select(Follow.followed_at).where(
                Follow.license_key_hash == license_.key_hash,
                Follow.listing_id == listing.id,
            )
        )
    else:
        listing.next_detail_crawl = now
    session.commit()
    return {"site": listing.site, "site_id": listing.site_id, "followed_at": followed_at}


@router.delete("/v1/follows/{site}/{site_id}", status_code=204)
def delete_follow(site: str, site_id: str, session=Depends(get_session),
                  license_=Depends(require_license)):
    session.execute(
        delete(Follow).where(
            Follow.license_key_hash == license_.key_hash,
            Follow.listing_id.in_(
                select(Listing.id).where(Listing.site == site, Listing.site_id == site_id)
            ),
        )
    )
    session.commit()


@router.get("/v1/follows", response_model=list[FollowOut])
def get_follows(session=Depends(get_session), license_=Depends(require_license)):
    rows = session.execute(
        select(Listing.site, Listing.site_id, Follow.followed_at)
        .join(Follow, Follow.listing_id == Listing.id)
        .where(Follow.license_key_hash == license_.key_hash)
        .order_by(Follow.followed_at.desc(), Listing.site, Listing.site_id)
        .limit(MAX_FOLLOWS)
    ).all()
    return [{"site": s, "site_id": i, "followed_at": at} for s, i, at in rows]

"""Le périmètre d'un marchand : les familles de véhicules qu'il surveille.

Un marchand ne regarde pas le marché, il regarde le sien — quinze modèles, pas
quarante-six mille annonces. Dire lesquels est ce qui permet à la file de
revisite de dépenser ses pages là où il les lira (`revisit._rank`, rang 0), et
au crawl de chercher par famille plutôt que par tranche de prix.

La famille est marque + modèle, sans année ni version : le marchand dit « les
Clio », pas « les Clio de 2014 en finition Zen ». Et elle s'écrit comme le site
l'écrit, donc comme `listings` la porte — le périmètre se compare à des
annonces, jamais à un référentiel qu'on n'a pas.

`PUT` remplace : le périmètre est une liste que le marchand tient, pas un
journal auquel on ajoute. Ce qui n'y est plus n'y est plus.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from .auth import require_license
from .db import get_session
from .follow_models import TrackedFamily
from .models import Listing

SEED_COUNT = 10
# Sans plafond, `PUT /v1/families` écrivait ce qu'on lui envoyait — deux mille
# familles en un appel, aussi vite que cinq cents (A7, audit d'abus). Cent
# marques réelles, quinze modèles chacune : deux cents couvre déjà un
# marchand généraliste avec de la marge.
MAX_FAMILIES = 200

router = APIRouter()


class Family(BaseModel):
    brand: str = Field(max_length=64)
    model: str = Field(max_length=128)


def families_of(session, key_hash: str) -> list[dict]:
    rows = session.execute(
        select(TrackedFamily.brand, TrackedFamily.model)
        .where(TrackedFamily.license_key_hash == key_hash)
        .order_by(TrackedFamily.brand, TrackedFamily.model)
    ).all()
    return [{"brand": brand, "model": model} for brand, model in rows]


def replace_families(session, key_hash: str, families) -> list[tuple[str, str]]:
    """Pose le périmètre d'une licence à la place de celui qu'elle avait ; rend
    ce qui est posé.

    Dédoublonné : deux fois la même famille dans un même envoi violerait la clé
    primaire, et rendrait 500 pour une demande qui a pourtant un sens.
    """
    kept = list(dict.fromkeys((f.brand, f.model) for f in families))
    session.execute(
        delete(TrackedFamily).where(TrackedFamily.license_key_hash == key_hash)
    )
    session.add_all([
        TrackedFamily(license_key_hash=key_hash, brand=brand, model=model)
        for brand, model in kept
    ])
    return kept


# La semence du périmètre, le temps que le marchand dise le sien. Ce n'est pas
# le marché : c'est ce que le crawl par tranches de prix a rencontré, et la
# semence ne vaut que ce que vaut cet échantillon. `scripts/seed_families.py`
# la pose ; la vraie liste la remplacera par le même chemin.
def most_present(session, count: int = SEED_COUNT) -> list[Family]:
    rows = session.execute(
        select(Listing.brand, Listing.model)
        .where(Listing.brand.is_not(None), Listing.model.is_not(None))
        .group_by(Listing.brand, Listing.model)
        .order_by(func.count().desc(), Listing.brand, Listing.model)
        .limit(count)
    ).all()
    return [Family(brand=brand, model=model) for brand, model in rows]


@router.get("/v1/families", response_model=list[Family])
def get_families(session=Depends(get_session), license_=Depends(require_license)):
    return families_of(session, license_.key_hash)


@router.put("/v1/families", response_model=list[Family])
def put_families(payload: list[Family], session=Depends(get_session),
                 license_=Depends(require_license)):
    if len(payload) > MAX_FAMILIES:
        raise HTTPException(status_code=409, detail="trop de familles suivies")
    replace_families(session, license_.key_hash, payload)
    session.commit()
    return families_of(session, license_.key_hash)

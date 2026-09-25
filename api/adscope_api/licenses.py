"""Les deux routes de suspension d'une licence — opérateur seulement
(`.superpowers/disparition-plan.md` §6). `key_hash` dans le chemin, jamais
une clé en clair : une clé de licence dans une URL finirait dans les
journaux d'accès et l'historique du navigateur — la page opérateur ne connaît
de toute façon que l'empreinte (`divergences._grouped`).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .db import get_session
from .models import License
from .operator import require_operator

router = APIRouter()


class LicenseStateOut(BaseModel):
    key_hash: str
    label: str
    active: bool


def _out(license_: License) -> dict:
    return {"key_hash": license_.key_hash, "label": license_.label, "active": license_.active}


def _target(session, key_hash: str, actor: License) -> License:
    target = session.get(License, key_hash)
    if target is None:
        raise HTTPException(status_code=404, detail="licence inconnue")
    if target.automated:
        raise HTTPException(status_code=403, detail="licence automatique")
    if target.key_hash == actor.key_hash or (
        target.account_id is not None and target.account_id == actor.account_id
    ):
        raise HTTPException(status_code=403, detail="licence de l'opérateur")
    return target


@router.post("/v1/licenses/{key_hash}/suspend", response_model=LicenseStateOut)
def suspend(key_hash: str, session=Depends(get_session), actor=Depends(require_operator)):
    target = _target(session, key_hash, actor)
    target.active = False
    session.commit()
    return _out(target)


@router.post("/v1/licenses/{key_hash}/restore", response_model=LicenseStateOut)
def restore(key_hash: str, session=Depends(get_session), actor=Depends(require_operator)):
    target = _target(session, key_hash, actor)
    target.active = True
    session.commit()
    return _out(target)

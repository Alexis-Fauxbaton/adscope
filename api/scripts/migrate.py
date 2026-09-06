"""Met le schéma à jour sans détruire la base.

`create_all` pose les tables manquantes, le registre applique les altérations
sur celles qui existent déjà. Les deux sont sans effet sur une base à jour :
la commande se rejoue sans risque.
"""
from adscope_api.db import create_all, engine
from adscope_api.migrations import migrate

create_all()
applied = migrate(engine)
print("\n".join(applied) if applied else "schéma déjà à jour")

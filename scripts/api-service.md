# L'API comme service local

L'API tourne en permanence sur le poste, sans terminal ouvert, via un LaunchAgent.
Postgres est déjà un service Homebrew ; celui-ci lui répond.

## Installation

```sh
sed -e "s|__API__|$PWD/api|g" -e "s|__HOME__|$HOME|g" \
    scripts/fr.adscope.api.plist > ~/Library/LaunchAgents/fr.adscope.api.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/fr.adscope.api.plist
```

Le chemin du dépôt est écrit en dur dans le plist installé : réinstaller après un
déplacement du projet.

## Exploitation

```sh
launchctl print gui/$UID/fr.adscope.api | grep -E 'state|pid'   # état
launchctl kickstart -k gui/$UID/fr.adscope.api                  # redémarrer
launchctl bootout gui/$UID/fr.adscope.api                       # arrêter
tail -f ~/Library/Logs/adscope-api.log                          # journal
```

`KeepAlive` relance le service s'il tombe — vérifié en tuant le processus de force.
`RunAtLoad` le démarre à l'ouverture de session.

## Ce que ce service ne fait pas

Il écoute sur `127.0.0.1` uniquement : rien n'est exposé au réseau. Il ne survit pas à
un changement de chemin du dépôt ni à la suppression du venv. Ce n'est pas un
déploiement : pour que la collecte continue quand le poste est éteint, il faudra un
hébergement distant.

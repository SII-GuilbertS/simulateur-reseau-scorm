# CLAUDE.md

Ce fichier documente l'architecture du projet pour les futures sessions Claude Code.

## Qu'est-ce que c'est

Simulateur réseau IPv4 pédagogique au format SCORM. Un enseignant conçoit une topologie réseau
(appareils, câblage, adressage IP, WiFi, services) dans un outil auteur, définit des objectifs
évalués et des pannes à diagnostiquer, puis exporte un package SCORM 1.2 ou un fichier HTML
standalone utilisable directement dans un navigateur ou via un LMS (Moodle...).

Stack : HTML/JS vanilla (aucune dépendance, aucun build tool côté navigateur), Python pour le
pipeline de build/validation, Node.js pour les tests.

## Fichier principal : `scorm-builder.html`

Fichier HTML standalone (~435k) qui contient à la fois l'outil auteur (enseignant) et le moteur
de simulation embarqué pour l'élève. Il combine trois parties :

1. **Bloc SIM-ENGINE** (`SIM-ENGINE-START` … `SIM-ENGINE-END`, marqué `NE PAS MODIFIER`) —
   copie générée automatiquement du contenu de `sim-engine.js`, utilisée par le JS du builder.
2. **`var STUDENT_TEMPLATE`** — le template élève complet, encodé en base64 inline. Décodé, il
   contient `template-skeleton.html` + `sim-engine.js` + `template-extra.js` combinés (le
   placeholder `/* __JS__ */` dans le skeleton reçoit `sim-engine.js` + `template-extra.js`).
3. **JS du builder lui-même** — `EvalModule` (objectifs pédagogiques, score, pannes) et
   `GenModule` (export SCORM .zip / HTML standalone, génération d'énoncé imprimable,
   import/export de scénarios JSON), plus les surcharges builder (undo/redo, copier/coller,
   drag & drop de la topologie, etc.).

**3 onglets dans l'UI du builder :**

| Onglet | Rôle |
|---|---|
| 1 Réseau | Topologie : appareils, câbles, IP, WiFi, services |
| 2 Évaluation | Objectifs pédagogiques, score, pannes à injecter |
| 3 Générer | Export SCORM/HTML, énoncé imprimable, import/export scénario JSON |

## Règle critique : ne jamais éditer le bloc SIM-ENGINE à la main

Le bloc SIM-ENGINE dans `scorm-builder.html` et le contenu embarqué dans `STUDENT_TEMPLATE` sont
tous les deux **générés automatiquement**. Ne jamais les éditer directement dans
`scorm-builder.html`.

Workflow correct pour modifier le moteur de simulation :

```bash
# 1. Éditer sim-engine.js (et/ou template-extra.js, template-skeleton.html si besoin)
# 2. Régénérer scorm-builder.html
python3 build.py --rebuild
# 3. Vérifier les tests
node sim-tests.js
```

`build.py` sait aussi tourner en mode audit seul (`python3 build.py`, dry-run) ou réparation
ciblée (`--fix`) via une liste de checks codés en dur — mais pour toute modification volontaire
du moteur, `--rebuild` est la bonne commande, pas `--fix`.

`validate.py` est un check pré-commit complémentaire : il extrait le JS du builder et du
template décodé, vérifie leur syntaxe (`node --check`), l'absence de résidus d'anciennes
fonctionnalités (ex. système de badges retiré), et la présence de fonctions critiques attendues
dans chaque partie.

## Tests : `node sim-tests.js` → doit afficher 128/128

Suite de 128 tests unitaires Node.js, exécutée sans navigateur via un sandbox
`vm.createContext()` qui extrait le JS directement de `scorm-builder.html` (pas de `sim-engine.js`
directement — donc **toujours rebuild avant de tester** un changement du moteur).

Couverture : fonctions réseau de base (`ip2n`, `isValidUserIP`, `isValidUserMask`, `sameNet`,
`netAddr`, `isRouter`, `lanSeg`, `cablePath`, `devByIP`...), simulation applicative (`simPing`
LAN/WiFi/routé/internet, `simDNS`, `simHTTP`, `simDHCP`), routage (`getRoutingTable`, `autoRoute`
— RIP simplifié), évaluation (`checkObjectiveStatic` : 10 types statiques,
`checkDynamicObjective` : 4 types dynamiques), mode panne (`applyFaults` : 7 types, formats plat
et imbriqué).

**À lancer après chaque modification du moteur.**

## Scénarios

- `scenarios/` — 3 scénarios JSON clés-en-main, prêts à importer via l'onglet 3 (**Générer →
  Importer un scénario**) :
  - `reseau-maison.json` — panne WiFi, niveau 4e/3e, 10 objectifs
  - `reseau-entreprise.json` — serveur web/DNS en panne, niveau Terminale/BTS, 13 objectifs
  - `reseau-lycee.json` — diagnostic complet couvrant les 14 types d'objectifs, niveau
    Terminale NSI/BTS SIO, 17 objectifs
- `scenario-lycee-pasteur.json` (racine) — scénario historique, 11 appareils, 9 objectifs.
  `scenario-lycee-pasteur-old.json` et `scenario-simple.json` sont des variantes/anciennes
  versions gardées à la racine.

## Documentation

- `doc-prof.pdf` / `.docx` — guide enseignant complet
- `doc-eleve.pdf` / `.docx` — guide élève (interface, commandes terminal, résolution de
  problèmes)
- `README.md` — documentation utilisateur détaillée du projet
- `TODO.md` — backlog des fonctionnalités à venir ; à consulter avant de proposer de nouvelles
  features

### Règle : ne régénérer la doc qu'à la création d'une version stable

**Ne jamais appeler `python3 build.py --docs` (ni `python3 gen_docs.py`) lors de commits
ordinaires**, même si du contenu documentable a changé.

La documentation PDF est régénérée **uniquement** lorsque l'utilisateur demande explicitement
de créer une version stable/release, par exemple :
- « crée une version stable »
- « release v1.x »
- « mets à jour la documentation »
- « génère les PDFs »

Workflow release :
```bash
# 1. S'assurer que les tests passent
node sim-tests.js          # → 128/128

# 2. Mettre à jour gen_docs.py si de nouvelles fonctionnalités méritent d'être documentées
# 3. Régénérer les PDFs
python3 build.py --docs

# 4. Commiter avec un message de version
git add doc-prof.pdf doc-eleve.pdf gen_docs.py
git commit -m "docs: release vX.Y — ..."
```

## Fichiers sources et leur rôle

| Fichier | Rôle |
|---|---|
| `scorm-builder.html` | Application complète, générée en partie — voir règle critique ci-dessus |
| `sim-engine.js` | Source du moteur réseau IPv4 partagé builder + template élève |
| `template-extra.js` | JS spécifique au template élève (SCORM, `applyFaults`, rendu de l'onglet activité) |
| `template-skeleton.html` | Squelette HTML du template élève (sans JS, placeholder `/* __JS__ */`) |
| `build.py` | Pipeline de build : régénère `scorm-builder.html` depuis les sources (`--rebuild`), audite/répare (`--fix`), régénère les docs (`--docs`) |
| `validate.py` | Check pré-commit : syntaxe JS, résidus, fonctions critiques présentes |
| `sim-tests.js` | Suite de 128 tests unitaires Node.js |
| `gen_docs.py` | Génère `doc-prof.pdf` et `doc-eleve.pdf` via reportlab. Appelé par `python3 build.py --docs` |

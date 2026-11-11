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
de simulation embarqué pour l'élève. Il combine quatre parties :

1. **Bloc SIM-ENGINE** (`SIM-ENGINE-START` … `SIM-ENGINE-END`, marqué `NE PAS MODIFIER`) —
   copie générée automatiquement du contenu de `src/sim-engine.js`, utilisée par le JS du builder.
2. **`var STUDENT_TEMPLATE`** — le template élève complet, encodé en base64 inline. Décodé, il
   contient les trois fichiers de `src/` combinés (le placeholder `/* __JS__ */` de
   `template-skeleton.html` reçoit `sim-engine.js` + `template-extra.js`).
3. **JS du builder lui-même** — `EvalModule` (objectifs pédagogiques, score, pannes) et
   `GenModule` (export SCORM .zip / HTML standalone, génération d'énoncé imprimable et de son corrigé,
   import/export de scénarios JSON), plus les surcharges builder (undo/redo, copier/coller,
   drag & drop de la topologie, etc.).
4. **Bloc WIZARD** (`WIZARD-START` … `WIZARD-END`, dans le JS du builder, maintenu à la main) —
   `ActivityWizard` : modèles de l'assistant « ✨ Nouvelle activité » (type × thème × niveau),
   variantes (« 🔀 Variante » : exigence, pannes déplacées, retirées ou ajoutées) et contrôle d'une
   activité (`audit` : score à l'ouverture, sans réparer, objectifs atteignables). Sans interface :
   `tests/sim-tests.js` l'extrait par ses marqueurs. Juste après, `WizardUI` gère les deux fenêtres.
   Un modèle ajouté doit respecter les règles des scénarios (voir plus bas) : les tests le vérifient.

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
# 1. Éditer src/sim-engine.js (et/ou src/template-extra.js, src/template-skeleton.html si besoin)
# 2. Régénérer scorm-builder.html
python3 tools/build.py --rebuild
# 3. Vérifier les tests
node tests/sim-tests.js
```

`tools/build.py` sait aussi tourner en mode audit seul (`python3 tools/build.py`, dry-run) ou
réparation ciblée (`--fix`) via une liste de checks codés en dur — mais pour toute modification
volontaire du moteur, `--rebuild` est la bonne commande, pas `--fix`.

`tools/validate.py` est un check pré-commit complémentaire : il extrait le JS du builder et du
template décodé, vérifie leur syntaxe (`node --check`), l'absence de résidus d'anciennes
fonctionnalités (ex. système de badges retiré), et la présence de fonctions critiques attendues
dans chaque partie.

## Tests : `node tests/sim-tests.js` → doit afficher 381/381

Suite de 381 tests Node.js, exécutée sans navigateur via un sandbox
`vm.createContext()` qui extrait le JS directement de `scorm-builder.html` (pas de
`src/sim-engine.js` directement — donc **toujours rebuild avant de tester** un changement du moteur).

Couverture : fonctions réseau de base (`ip2n`, `isValidUserIP`, `isValidUserMask`, `sameNet`,
`netAddr`, `isRouter`, `lanSeg`, `cablePath`, `devByIP`...), simulation applicative (`simPing`
LAN/WiFi/routé/internet, `simDNS`, `simHTTP`, `simDHCP`), routage (`getRoutingTable`, `autoRoute`
— RIP propagé avec route par défaut ; pont de la box entre WiFi et LAN câblé, WAN exclu ; `simPing` suit les tables à l'aller et au retour, NAT vers
Internet, adresses inconnues privées ou publiques), évaluation (`checkObjectiveStatic` : 10 types statiques, adresses en plage ou
joker, références `{Appareil}`, passerelle cohérente, plan d'adressage (`addressPlan`), `checkDynamicObjective` : 4 types dynamiques, objectifs perdus quand la configuration casse,
contrainte affichée à l'élève), connexion WiFi (SSID et mot de passe du
terminal, `wifiLinkUp`, `wifiProblem`), mode panne (`applyFaults` : 8 types, formats plat
et imbriqué), commandes élève jusqu'à la validation des objectifs, score, SCORM avec un LMS simulé,
sauvegarde et reprise, et pour chaque fichier de `scenarios/` : cohérence, ordre de la liste complet, score de 0 à l'ouverture, score
de 100 une fois le réseau corrigé, score sous le seuil tant que les pannes ne sont pas réparées. Les mêmes règles sont vérifiées sur chaque
modèle de l'assistant « Nouvelle activité » (27 combinaisons, 3 tirages) et sur chaque variante des
4 scénarios. Non couverts : rendu de l'interface et `EvalModule`/`GenModule` du builder (exports).

Les règles d'évaluation sont dans `src/sim-engine.js`, partagées par le builder et l'élève
(`checkObjectiveStatic`, `evaluateObjectives`, `recordDynamicEvent`). Un objectif n'est acquis que
tant que sa condition reste vraie : les objectifs dynamiques gardent la commande qui les a validés
(`ACTIVITY_PROOFS`) et la rejouent à chaque modification du réseau. `checkAllObjectives` et
`checkDynamicObjective` restent définis deux fois, dans `src/template-extra.js` et dans le JS du
builder, mais ne font qu'appeler ces fonctions puis afficher le résultat. Le réseau du builder est le
corrigé : son `checkAllObjectives` ne compte un objectif statique que s'il est vrai pannes appliquées
(`studentStartResults(net, cfg, true)`) ou si le professeur l'a cassé puis rétabli dans le builder
(`BUILDER_TOUCHED`, remis à zéro à l'import, par « Figer » et par 🔄), si bien que le score affiché à
l'import est celui de l'élève à l'ouverture (0) ; les commandes de test et les réparations du
professeur y ajoutent des points.

Le hook local `.git/hooks/pre-commit` (non versionné) exige le nombre exact de tests : si ce nombre
change, mettre à jour le hook en plus de cette documentation.

**À lancer après chaque modification du moteur.**

## Tests navigateur : `npm --prefix tests/e2e test` → 30 tests

Suite Playwright dans `tests/e2e/` (`npm --prefix tests/e2e ci` la première fois), avec le Chrome du
poste. Elle couvre ce que `sim-tests.js` n'exécute pas : import et export depuis l'interface du builder,
score de départ des 4 scénarios, l'objectif `nslookup` validé depuis le terminal du builder,
l'éditeur d'adresse et de contrainte d'un objectif jusqu'à l'affichage chez l'élève, la cible
d'un ping désignée par un appareil et l'alerte quand elle vise une adresse au choix, le plan
d'adressage de l'énoncé et du corrigé enseignant, l'ordre de la liste des objectifs et des pannes
(flèches, glisser-déposer, export, élève), un ping depuis un poste que l'élève doit ajouter,
le pointeur câble et les touches Échap et Suppr, un câble débranché puis rebranché par le professeur (compté seulement au switch indiqué), l'indice d'un objectif (proposé selon l'objectif et sa panne, modifiable, affiché à l'élève), le DHCP depuis la fiche d'un poste, la connexion WiFi (SSID suivi dans le builder, mot de passe
faux puis corrigé chez l'élève), l'assistant
« Nouvelle activité » et la fenêtre Variante jusqu'à l'élève, contenu du ZIP, note, statut et reprise avec un LMS simulé. Toute erreur JavaScript fait
échouer le test en cours. Elle lit `scorm-builder.html` : rebuild d'abord.

Non couverts : vrai Moodle, drag & drop et câblage, le reste de l'énoncé imprimable (seul son plan
d'adressage est vérifié), Firefox. Elle n'est pas dans le
hook pre-commit. Si le barème ou les pannes d'un scénario changent, mettre à jour `SCENARIOS` dans
`builder.spec.js`. À lancer avant chaque push qui touche au builder, aux exports ou aux scénarios.

## Scénarios

- `scenarios/` — 4 scénarios JSON clés-en-main, prêts à importer via l'onglet 3 (**Générer →
  Importer un scénario**) :
  - `reseau-maison.json` — panne WiFi, niveau 4e/3e, 7 objectifs
  - `reseau-entreprise.json` — serveur web/DNS en panne, niveau Terminale/BTS, 7 objectifs
  - `reseau-lycee.json` — diagnostic complet couvrant les 14 types d'objectifs, niveau
    Terminale NSI/BTS SIO, 21 objectifs
  - `reseau-college.json` — adressage IP fixe par salle, salles en encadrés, niveau collège,
    8 objectifs

  Dans chaque scénario, une réparation ou une construction est suivie de son test (objectif dont le
  libellé commence par « Test : »), et `evalOrder` place chaque panne juste avant sa réparation. Garder
  cette règle, et le score de 0 à l'ouverture, en modifiant ou en ajoutant un scénario.

## Documentation

- `docs/doc-prof.pdf` — guide enseignant complet
- `docs/doc-eleve.pdf` — guide élève (interface, commandes terminal, résolution de
  problèmes)
- `README.md` — documentation utilisateur détaillée du projet
- `TODO.md` — backlog des fonctionnalités à venir ; à consulter avant de proposer de nouvelles
  features

### Règle : ne régénérer la doc qu'à la création d'une version stable

**Ne jamais appeler `python3 tools/build.py --docs` (ni `python3 tools/gen_docs.py`) lors de
commits ordinaires**, même si du contenu documentable a changé.

La documentation PDF est régénérée **uniquement** lorsque l'utilisateur demande explicitement
de créer une version stable/release, par exemple :
- « crée une version stable »
- « release v1.x »
- « mets à jour la documentation »
- « génère les PDFs »

Workflow release :
```bash
# 1. S'assurer que les tests passent
node tests/sim-tests.js    # → 381/381

# 2. Mettre à jour tools/gen_docs.py si de nouvelles fonctionnalités méritent d'être documentées
# 3. Régénérer les PDFs
python3 tools/build.py --docs

# 4. Mettre à jour le site : dans site/index.html, remplacer le numéro de version partout
#    (navigation, deux cartes de documentation, pied de page et son lien vers le tag) et le mois,
#    ajuster le texte si des fonctionnalités ont changé, refaire site/assets/ si l'interface a changé
# 5. Régénérer le contenu du site (builder, docs, scénarios, démos)
python3 tools/build_site.py

# 6. Commiter avec un message de version
git add docs/doc-prof.pdf docs/doc-eleve.pdf tools/gen_docs.py site/index.html site/assets
git commit -m "docs: release vX.Y — ..."

# 7. Poser le tag sur ce commit (le lien du pied de page ne marche qu'une fois le tag poussé)
git tag -a vX.Y -m "Version X.Y"
```

Une release n'est terminée que lorsque `site/` affiche la nouvelle version. L'envoi chez OVH reste
manuel : à la fin, rappeler à l'utilisateur d'envoyer le contenu de `site/`.

## Site de présentation : `site/`

Contenu à envoyer chez l'hébergeur (OVH). `site/index.html` et `site/assets/` sont maintenus à la
main ; le reste est généré par `python3 tools/build_site.py` et ignoré par git. Le site n'évolue
qu'à chaque release (voir le workflow release ci-dessus), pas lors des commits ordinaires.

## Licence

Code sous PolyForm Noncommercial 1.0.0 (`LICENSE`), contenus sous CC BY-NC-SA 4.0
(`LICENSE-CONTENU.txt`) ; le détail est dans le README. Garder la ligne `Required Notice:` en tête de
`src/template-skeleton.html` et de `scorm-builder.html` : elle accompagne les activités exportées.

## Fichiers sources et leur rôle

| Fichier | Rôle |
|---|---|
| `scorm-builder.html` | Application complète, générée en partie — voir règle critique ci-dessus |
| `src/sim-engine.js` | Source du moteur réseau IPv4 partagé builder + template élève |
| `src/template-extra.js` | JS spécifique au template élève (SCORM, rendu de l'onglet activité) |
| `src/template-skeleton.html` | Squelette HTML du template élève (sans JS, placeholder `/* __JS__ */`) |
| `tools/build.py` | Pipeline de build : régénère `scorm-builder.html` depuis les sources (`--rebuild`), audite/répare (`--fix`), régénère les docs (`--docs`) |
| `tools/build_site.py` | Met à jour le dossier `site/` : copie builder, docs et scénarios, génère les démos élèves |
| `tools/validate.py` | Check pré-commit : syntaxe JS, résidus, fonctions critiques présentes |
| `tools/push.sh` | Raccourci : ajoute une liste de fichiers, commite et pousse |
| `tests/sim-tests.js` | Suite de 381 tests Node.js |
| `tests/e2e/` | Suite Playwright : builder et exports dans Chrome |
| `tools/gen_docs.py` | Génère `docs/doc-prof.pdf` et `docs/doc-eleve.pdf` via reportlab. Appelé par `python3 tools/build.py --docs` |
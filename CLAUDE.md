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
   copie générée automatiquement de `src/net-core.js` (cœur réseau) puis de `src/sim-ui.js`
   (interface), séparés par le marqueur `NET-CORE-END`, utilisée par le JS du builder.
2. **`var STUDENT_TEMPLATE`** — le template élève complet, encodé en base64 inline. Décodé, il
   contient les trois fichiers de `src/` combinés (le placeholder `/* __JS__ */` de
   `template-skeleton.html` reçoit `net-core.js` + `sim-ui.js` + `template-extra.js`).
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

**Trois vues du schéma (barre d'en-tête du builder)** — `BUILDER_VIEW` : **Corrigé** (réseau qui
fonctionne, seul modifiable ; le bureau d'un appareil s'y ouvre par double-clic, sans terminal ni
navigateur), **Départ élève** (copie du corrigé + pannes, lecture seule, pastilles de panne P1, P2…) et
**Essai** (même copie, le professeur joue l'élève : terminal, réparations, score réel, règles de l'élève).
`setBuilderView` met le corrigé de côté dans `VIEW_SNAP` et le rétablit au retour ; `SimModule.getState()`
renvoie toujours le corrigé, et `ensureCorrige()` ramène au corrigé avant les onglets 2 et 3, l'import,
l'enregistrement et l'assistant : aucun export ne part d'une copie. Le moteur partagé n'a qu'un point
d'accroche (`deskView` dans `src/sim-ui.js`, qui lit `BUILDER_VIEW` ; chez l'élève il vaut toujours « essai »).
`readOnly()` en découle (vue Départ élève) : ni glisser, ni dépôt, ni suppression, fiche aux champs figés
(`propsLock`), palette grisée (`palLock`). Le score « corrigé »
(`BUILDER_TOUCHED`) ne s'applique qu'à la vue Corrigé. L'essai est mis de côté dans `ESSAI_SNAP` quand on
le quitte et repris au retour tant que `essaiKey()` (réseau corrigé normalisé sans positions, objectifs et
pannes) n'a pas changé ; sinon il repart de zéro avec un message, comme avec « Recommencer l'essai ».

**Ouverture et fermeture** — le builder s'ouvre toujours vierge (plus de reprise automatique ; l'ancienne
clé `sim_reseau_v2_builder` du navigateur est effacée) : le travail se reprend par « 📂 Ouvrir ». Un
`beforeunload` prévient si le travail a changé depuis le dernier scénario ouvert ou enregistré
(`hasUnsavedWork()` : empreinte `workFingerprint()` comparée à `SAVED_FP`, posée par `markSaved()` à l'ouverture
d'un fichier et à l'export du scénario ; l'export SCORM, HTML ou énoncé ne compte pas comme enregistrement).

**Pannes notées comme des objectifs** — une panne porte ses points (`points`), un libellé facultatif pour l'élève
(`studentLabel`) et la condition de sa réparation (`goal` : check, params, label, hint), posée par
`syncFaultGoals` (builder, appelé par `getConfig`, vue Corrigé seulement) d'après les valeurs du réseau corrigé
(`repairSpec`). **Aucun objectif n'est ajouté à la liste** : le moteur (`scoredObjectives`, `faultGoal` dans
`src/net-core.js`) tire de chaque panne notée un objectif « virtuel » (id `flt:<id>`) au moment d'évaluer et de noter,
rangé à la place de la panne dans `evalOrder`. Builder et élève passent par `scoredObjectives(cfg)` pour la liste,
le score, SCORM, l'énoncé et le contrôle de l'assistant ; `cfg.objectives` ne contient que les objectifs écrits par
le professeur. Un objectif de réparation écrit à la main (`FAULT_REPAIR_CHECKS` : même type de contrôle, sur un
appareil de la panne) fait foi et la panne n'est pas notée en plus (pas de double comptage) : c'est le cas des
scénarios fournis et de l'assistant. Les tests de validation (ping…) restent manuels. Un scénario sans `points`
sur ses pannes se comporte comme avant.

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
# 1. Éditer src/net-core.js ou src/sim-ui.js (et/ou src/template-extra.js, src/template-skeleton.html si besoin)
# 2. Régénérer scorm-builder.html
python3 tools/build.py --rebuild
# 3. Vérifier les tests
node tests/sim-tests.js
```

### Cœur réseau et interface

Le moteur est en deux fichiers, assemblés dans cet ordre. `src/net-core.js` contient le modèle
(`S`, `mkDev`, `linkCheck`, `applyNetworkData`), la simulation (`simPing`, `simDNS`, `simHTTP`,
`simDHCP`, routage), l'évaluation et les pannes ; il ne touche jamais la page : ni `document`, ni
`window`, ni minuterie, ni `notif`/`addLog`/`render`. `src/sim-ui.js` contient tout le reste. Une
fonction du cœur renvoie un résultat (`{ok, msg}`, message, tableau) et c'est l'interface qui
l'affiche : `addLink` (interface) appelle `linkCheck` (cœur) puis `notif`. La suite « Cœur réseau
isolé » exécute le cœur seul dans un contexte vide, sur les 4 scénarios, et échoue s'il nomme le
navigateur ou une fonction de l'interface. Une nouvelle règle de réseau ou d'évaluation va dans
`net-core.js`.

`tools/build.py` sait aussi tourner en mode audit seul (`python3 tools/build.py`, dry-run) ou
réparation ciblée (`--fix`) via une liste de checks codés en dur — mais pour toute modification
volontaire du moteur, `--rebuild` est la bonne commande, pas `--fix`.

Le JS du builder suit le bloc SIM-ENGINE dans le même `<script>` : une fonction qu'il redéfinit
remplace celle du moteur. Ne jamais y recopier une fonction du moteur. Une surcharge voulue porte,
sur la ligne précédente, le marqueur `/* override builder: nomDeLaFonction */` ; un test échoue sinon,
ou si le builder définit deux fois la même fonction.

`tools/validate.py` est un check pré-commit complémentaire : il extrait le JS du builder et du
template décodé, vérifie leur syntaxe (`node --check`), l'absence de résidus d'anciennes
fonctionnalités (ex. système de badges retiré), et la présence de fonctions critiques attendues
dans chaque partie.

## Tests : `node tests/sim-tests.js` → doit afficher 399/399

Suite de 399 tests Node.js, exécutée sans navigateur via un sandbox
`vm.createContext()` qui extrait le JS directement de `scorm-builder.html` (pas de
`src/` directement — donc **toujours rebuild avant de tester** un changement du moteur).

Couverture : fonctions réseau de base (`ip2n`, `isValidUserIP`, `isValidUserMask`, `sameNet`,
`netAddr`, `isRouter`, `lanSeg`, `cablePath`, `devByIP`...), simulation applicative (`simPing`
LAN/WiFi/routé/internet, `simDNS`, `simHTTP`, `simDHCP`), routage (`getRoutingTable`, `autoRoute`
— RIP propagé avec route par défaut ; pont de la box entre WiFi et LAN câblé, WAN exclu ; `simPing` suit les tables à l'aller et au retour, NAT vers
Internet, adresses inconnues privées ou publiques), évaluation (`checkObjectiveStatic` : 10 types statiques, adresses en plage ou
joker, références `{Appareil}`, passerelle cohérente, plan d'adressage (`addressPlan`), `checkDynamicObjective` : 4 types dynamiques, objectifs perdus quand la configuration casse,
contrainte affichée à l'élève), connexion WiFi (SSID et mot de passe du
terminal, `wifiLinkUp`, `wifiProblem`), mode panne (`applyFaults` : 8 types, formats plat
et imbriqué), commandes élève jusqu'à la validation des objectifs, score, SCORM avec un LMS simulé,
sauvegarde et reprise, fichier ou session abîmés refusés avant de remplacer le réseau (`networkDataProblem`),
sauvegarde refusée par le LMS signalée, cœur réseau exécuté seul sans navigateur (`linkCheck`, scénarios chargés, évalués et mis en panne), et pour chaque fichier de `scenarios/` : cohérence, ordre de la liste complet, score de 0 à l'ouverture, score
de 100 une fois le réseau corrigé, score sous le seuil tant que les pannes ne sont pas réparées. Les mêmes règles sont vérifiées sur chaque
modèle de l'assistant « Nouvelle activité » (27 combinaisons, 3 tirages) et sur chaque variante des
4 scénarios. Non couverts : rendu de l'interface et `EvalModule`/`GenModule` du builder (exports).

Les règles d'évaluation sont dans `src/net-core.js`, partagées par le builder et l'élève
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

## Tests navigateur : `npm --prefix tests/e2e test` → 49 tests

Suite Playwright dans `tests/e2e/` (`npm --prefix tests/e2e ci` la première fois), avec le Chrome du
poste. Elle couvre ce que `sim-tests.js` n'exécute pas : import et export depuis l'interface du builder,
score de départ des 4 scénarios, l'objectif `nslookup` validé depuis le terminal du builder,
l'éditeur d'adresse et de contrainte d'un objectif jusqu'à l'affichage chez l'élève, la cible
d'un ping désignée par un appareil et l'alerte quand elle vise une adresse au choix, le plan
d'adressage de l'énoncé et du corrigé enseignant, l'ordre de la liste des objectifs et des pannes
(flèches, glisser-déposer, export, élève), un ping depuis un poste que l'élève doit ajouter,
le pointeur câble et les touches Échap et Suppr, le contrôle du départ élève (bandeau, pastilles de panne P1/P2 sur le schéma, état des objectifs), le builder vierge à l'ouverture et l'alerte avant fermeture sans enregistrement, un câble débranché puis rebranché par le professeur (compté seulement au switch indiqué), l'indice d'un objectif (proposé selon l'objectif et sa panne, modifiable, affiché à l'élève), le DHCP depuis la fiche d'un poste, le bureau d'un appareil (double-clic ; terminal et
navigateur en fenêtre, une session par appareil, chez l'élève et dans le builder ; services réglés dans le
bureau : Ctrl+Z, état laissé par le professeur reçu par l'élève, panne « service arrêté » réparée et conservée
après rechargement), la connexion WiFi (SSID suivi dans le builder, mot de passe
faux puis corrigé chez l'élève), l'assistant
« Nouvelle activité » et la fenêtre Variante jusqu'à l'élève (choix de pannes combinés), la souris sur le schéma
(suite « Souris sur le schéma » : appareil glissé depuis la palette, déplacement d'un appareil avec ses câbles,
câblage au clic avec aperçu, annulations et refus, liaison WiFi, sélection et suppression d'un câble, double-clic
qui ouvre le bureau sans déplacer l'appareil, glisser suivi d'un clic qui ne l'ouvre pas, même comportement chez
l'élève quel que soit le bouton de mode, lecture seule de la vue Départ élève), contenu du ZIP, note, statut et reprise avec un LMS simulé. Toute erreur JavaScript fait
échouer le test en cours. Elle lit `scorm-builder.html` : rebuild d'abord.

Non couverts : vrai Moodle, déplacement et redimensionnement des cadres et des textes, le reste de l'énoncé imprimable (seul son plan
d'adressage est vérifié), Firefox. Elle n'est pas dans le
hook pre-commit. Si le barème ou les pannes d'un scénario changent, mettre à jour `SCENARIOS` dans
`builder.spec.js`. À lancer avant chaque push qui touche au builder, aux exports ou aux scénarios.

## Bureau des appareils

Un double-clic sur un appareil ouvre son bureau : une fenêtre flottante avec les icônes de ses applications
(`deskApps`) : Invite de commandes, Navigateur et Paramètres réseau sur les postes et serveurs, WiFi sur un poste
relié à une box, Serveur web, Serveur DNS et Serveur DHCP sur un serveur, Administration (WiFi et DHCP) et
Routage sur la box, Routage sur un routeur.

**Où il s'ouvre** : partout, par double-clic (`deskDblCheck` dans `devMD` : deux appuis à moins de 450 ms sur le
même appareil ; un appui qui bouge de moins de 3 px ne déplace rien, et un glisser terminé ne compte pas comme
premier clic). Chez l'élève, toutes les applications ; dans le builder (`deskView`), vue **Corrigé** sans
terminal ni navigateur (`deskApps` les retire hors vue Essai), **Départ élève** en lecture seule (`deskApply`
et `doDHCP` refusent) et **Essai** complet.

**Un seul comportement de clic, une seule fiche** (étape 1 du mode unique) : `devMD` sélectionne, affiche la
fiche, commence un glisser et fait suivre le terminal du bandeau (`setTermDev`), quel que soit `S.mode`. La fiche
est `showProps`, dans `src/sim-ui.js`, la même pour le builder et l'élève (bouton « Dupliquer » si `copyDev`
existe, donc dans le builder seulement) ; `showPropsSimu` et les surcharges builder de `showProps`, `frameMD` et
`textMD` n'existent plus. `S.mode` et `setMode` ne règlent plus que l'affichage du bandeau du bas et la
sauvegarde au passage en simulation.

**Les services (web, DNS, DHCP, WiFi de la box) ne se règlent que dans le bureau** : la fiche affiche
seulement leur état (`deskConfigNote`) et un bouton vers le bureau. Ce que le professeur règle en vue Corrigé part à
l'export, puis les pannes s'appliquent ; ce qu'il règle en Essai reste sur la copie d'essai. Les applications à
formulaire (`DESK_FORMS`) passent par `deskApply` : `snapHistory` (Ctrl+Z), mêmes setters que les fiches
(`setIface`, `setDHCP`, `setBoxWifi`, `setTermWifi`…), `render`, objectifs, `saveToSession` (reprise élève).
L'adresse IP d'un poste reste réglable dans la fiche. Le code est dans `src/sim-ui.js` (bloc `BUREAU DES
APPAREILS`, fonctions `desk*`), partagé par le builder et l'élève ; son CSS est injecté au premier affichage.
Chaque appareil garde sa session (historique, sortie, page). Une commande lancée depuis une fenêtre passe par
`termRun(raw, devId)`, avec `_termOut` pointant vers la sortie de la fenêtre ; le navigateur appelle
`browGo(devId, url, conteneur)`. Le bandeau du bas (Terminal, Navigateur, Journal, Paquets, Activité) est conservé
pour l'instant.

**Évolution en cours** : supprimer le mode Simulation (un seul mode, simulation permanente). Étape 1 faite
(clic et fiche uniques) ; restent les étapes 2 (boutons de mode, bandeau du bas, sauvegarde temporisée) et 3
(`lockTopology`), détaillées dans `TODO.md` (« Mode unique »). Le tag local `avant-mode-unique` marque l'état
d'avant.

## Pour reprendre le travail

- **Le builder s'ouvre vierge** : on reprend un travail par « 📂 Ouvrir » (scénario `.json`). Les exports SCORM,
  HTML et énoncé ne comptent pas comme un enregistrement (alerte à la fermeture, voir plus haut).
- **Hook de commit partagé** : `.git/hooks/pre-commit` (un seul pour tous les dossiers de travail) exige
  exactement 399/399 tests unitaires. Une branche plus ancienne qui n'a pas les tests récents sera refusée
  au commit tant qu'elle n'est pas remise à jour sur `master`.
- **Tests navigateur** : `importScenarioFile` (dans `builder.spec.js`) attend la fin réelle d'un import ; un
  clic sur l'onglet Générer avant la fin est annulé par l'import (cause d'expirations intermittentes d'une minute).
- **Documentation non régénérée** : `docs/*.pdf`, `README.md` et `site/` datent de la v1.9.4 et ne décrivent
  ni les vues du builder, ni les pannes notées, ni le builder vierge. À refaire à la prochaine release
  (voir la règle plus bas).
- **Résultat de la dernière session** : 399 tests unitaires et 42 tests navigateur passent sur `master` (49 sur la branche du mode unique).

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
node tests/sim-tests.js    # → 399/399

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
| `src/net-core.js` | Cœur réseau partagé builder + template élève : modèle, simulation IPv4, évaluation, pannes. Aucun accès au navigateur |
| `src/sim-ui.js` | Interface partagée builder + template élève : affichage, souris et clavier, terminal, SCORM |
| `src/template-extra.js` | JS spécifique au template élève (SCORM, rendu de l'onglet activité) |
| `src/template-skeleton.html` | Squelette HTML du template élève (sans JS, placeholder `/* __JS__ */`) |
| `tools/build.py` | Pipeline de build : régénère `scorm-builder.html` depuis les sources (`--rebuild`), audite/répare (`--fix`), régénère les docs (`--docs`) |
| `tools/build_site.py` | Met à jour le dossier `site/` : copie builder, docs et scénarios, génère les démos élèves |
| `tools/validate.py` | Check pré-commit : syntaxe JS, résidus, fonctions critiques présentes |
| `tools/push.sh` | Raccourci : ajoute une liste de fichiers, commite et pousse |
| `tests/sim-tests.js` | Suite de 399 tests Node.js |
| `tests/e2e/` | Suite Playwright : builder et exports dans Chrome |
| `tools/gen_docs.py` | Génère `docs/doc-prof.pdf` et `docs/doc-eleve.pdf` via reportlab. Appelé par `python3 tools/build.py --docs` |
# Simulateur Réseau IPv4 — SCORM Builder

Outil pédagogique standalone permettant de créer des activités de simulation réseau au format SCORM 1.2. L'enseignant conçoit une topologie réseau (appareils, câblage, adressage IP, WiFi, services), définit des objectifs évalués et des pannes à diagnostiquer, puis exporte un package SCORM ou un fichier HTML utilisable directement dans un navigateur ou via un LMS (Moodle, etc.).

---

## Organisation du dépôt

```
scorm-builder.html   L'application : à ouvrir dans le navigateur
scenarios/           Scénarios prêts à importer
docs/                Guides enseignant et élève (PDF, Word)
site/                Site de présentation à envoyer chez l'hébergeur
src/                 Sources du moteur et du template élève
tools/               Scripts de build, de validation et de génération
tests/               Tests du moteur (sim-tests.js) et tests navigateur (e2e/)
```

---

## Fichiers

### Application principale

#### `scorm-builder.html`
Interface graphique complète du SCORM Builder. Fichier HTML **standalone** (aucune dépendance externe, aucune installation requise) qui embarque à la fois l'outil auteur pour l'enseignant et le moteur de simulation pour l'élève.

**Structure interne :**
- **SIM-ENGINE** — moteur réseau IPv4 (IP, masques, routage RIP, ping, DNS, HTTP, DHCP, WiFi)
- **EvalModule** — gestion des objectifs pédagogiques, du score SCORM et des pannes (mode panne)
- **GenModule** — génération des exports (ZIP SCORM et HTML standalone), import/export de scénarios JSON

**Interface du builder (« Atelier Réseau ») :** une seule barre en haut, le schéma, la fiche de l'appareil à droite
et un bandeau en bas.

| Élément | Rôle |
|---------|------|
| **Menu ☰** | Nouvelle activité, Nouveau, Ouvrir, Enregistrer, Variante, exports SCORM / HTML / énoncé / corrigé, Options d'export, Tester comme élève, plein écran |
| **Vues** | **Conception** (le corrigé), **Départ élève** (lecture seule), **Test** (le professeur joue l'élève) |
| **Pastille d'état** | En Conception : l'état du corrigé. En Départ élève et Test : le score de l'élève |
| **Bandeau du bas** | **Évaluation** (activité, objectifs, pannes), **Contrôle** (contrôle du corrigé), **Journal**, **Paquets** ; se replie d'un clic |

**✨ Nouvelle activité** (menu ☰) : choisir un type (Construction, Dépannage, Découverte, **Réseau Internet**), un thème
et une **difficulté** (1 · Guidé, 2 · Intermédiaire, 3 · Autonome). Le builder propose le réseau, les objectifs, les
pannes, le barème et les consignes, et vérifie l'activité avant de la créer : score de 0 à l'ouverture, seuil
impossible à atteindre sans réparer ni construire, chaque objectif atteignable. La difficulté règle l'exigence :
valeurs données et contraintes affichées en 1, adresse à choisir dans une plage et passerelle à trouver en 2, adresses
libres avec contraintes masquées et deux réseaux routés en 3 (2, 3 puis 4 pannes). En dépannage, 🎲 *Autres
appareils* tire d'autres postes en panne. Dans les modèles « Construction », le poste à ajouter (et la tablette en
WiFi, en Maison) est posé dans le corrigé avec la case « à ajouter par l'élève » : le contrôle du corrigé le vérifie en
entier. Tout reste modifiable ensuite. Dans la salle de classe, l'ENT est hébergé sur Internet (serveur à adresse
publique relié au nœud Internet, nom résolu par le DNS public) ; le réseau de l'établissement a son Serveur-Données
pour les profils des élèves.

**Type « Réseau Internet »** : plusieurs réseaux reliés par des routeurs, le premier relié à Internet, serveur web et
DNS dans le dernier réseau. Thèmes : *Siège et agences*, *Lycée et annexe*, *Client et hébergeur*. Difficulté 1 : deux
réseaux en routage automatique (RIP), pannes « RIP désactivé » et « DNS arrêté » ; 2 : deux réseaux en routes
statiques, pannes « route manquante », « mauvais routeur suivant » (route par défaut) et passerelle d'un poste ;
3 : trois routeurs en chaîne et le DNS arrêté en plus.

**Trois vues du schéma** (boutons de la barre) : **Conception**, le réseau qui fonctionne, où tout se règle ;
**Départ élève**, ce que l'élève trouve à l'ouverture (corrigé avec les pannes, pastilles P1, P2…), en lecture
seule ; **Test**, la même copie où le professeur joue l'élève et obtient le score qu'il aurait (« ↺ Repartir de
zéro » remet le réseau et le score au départ). Les exports partent toujours du corrigé.

**Contrôle du corrigé** : en vue Conception, la pastille de la barre n'affiche pas de score mais l'état du corrigé :
« ✅ Corrigé complet » (tous les objectifs sont vérifiés), « 🧪 N vérifiés · M à vérifier en Test » (ce que l'élève
doit encore construire), « ⚠️ Corrigé non conforme · N non atteignables » ou « ⚠️ Corrigé : N pannes à revoir ». Un
clic ouvre l'onglet **Contrôle** du bandeau, une ligne par objectif : réalisé ou non dans le corrigé (les commandes
ping, nslookup, page web et DHCP sont rejouées automatiquement, avec la raison d'un échec), puis ce qu'il vaut au
départ de l'élève (à faire, déjà acquis, panne qui le casse). Une panne qui ne change rien est signalée.

**Appareil à ajouter par l'élève** : une case sur la fiche d'un appareil, en vue Conception, ou le bouton
« + Appareil à ajouter » du bandeau Évaluation (qui crée aussi l'objectif « Poste ajouté »). L'appareil reste dans le
corrigé, avec ses câbles et ses réglages (pastille verte « + »), et il est retiré du réseau que reçoit l'élève et de
son énoncé.

**Pannes notées** : une panne porte ses points (« Points si l'élève la répare ») ; la réparation est mesurée sur la
valeur du corrigé, sans objectif à créer.

**Bureau des appareils** : un double-clic sur un appareil ouvre son bureau (Invite de commandes, Navigateur,
Paramètres réseau, WiFi, services d'un serveur ou de la box, **Routage** d'un routeur). Il n'y a plus de mode
Configuration ni Simulation : un clic ouvre la fiche, un double-clic le bureau, chez le professeur comme chez
l'élève.

**Routage** : l'application Routage du bureau d'un routeur ou d'une box active ou arrête le routage automatique (RIP),
ajoute une **route statique** (réseau, masque, routeur suivant) et la supprime. Trois pannes de routage : route
manquante, mauvais routeur suivant, RIP désactivé.

**Ouvrir, enregistrer** : le builder s'ouvre vierge. « 📂 Ouvrir » (menu ☰) reprend un scénario `.json`,
« 💾 Enregistrer » le garde ; fermer l'onglet avec un travail non enregistré déclenche une alerte.

**Indices et descriptions** (bandeau Évaluation) : chaque objectif a un champ *Indice*, affiché à l'élève sous l'objectif tant
qu'il n'est pas atteint. Il est pré-rempli selon le type d'objectif, ses paramètres et la panne qu'il répare (« Outil
Liaison : reliez PC-Bureau à Switch-Salon », ou « ipconfig est bon mais rien ne passe ? Regardez les câbles de
PC-Bureau » quand une panne débranche ce câble). L'indice proposé suit l'objectif et les pannes tant qu'il n'est pas
réécrit ; ↺ revient à la proposition, un champ vide supprime l'indice. De même, la *Description de la panne* est
pré-remplie (type et appareil) et modifiable.

**Case DHCP d'un poste** : la cocher met de côté l'adresse, le masque, la passerelle et le DNS saisis (ignorés tant
que le DHCP est coché, sans effet sur la simulation ni sur les objectifs) ; la décocher les remet en place. Cette
configuration mise de côté n'est pas transmise à l'élève.

**🔀 Variante** (menu ☰) : décline l'activité en cours sans toucher au réseau. *Plus guidée* (contraintes affichées,
seuil −10), *plus exigeante* (adresses exactes laissées au choix quand rien d'autre ne les utilise, passerelle
« routeur du réseau », contraintes et indices masqués, seuil +10) ; pannes *sur d'autres appareils* (la
réparation et ses tests suivent, adresses et libellés compris ; sur un petit réseau où chaque poste a déjà sa panne,
deux pannes échangent leurs postes ; un mot de passe WiFi faux passe à un autre terminal de la box), *une de moins*
ou *une de plus* (avec sa réparation et son test). Les choix de pannes se combinent (*autres appareils* et *une de
plus*, par exemple ; *une de moins* et *une de plus* s'excluent). Quand aucun appareil ne convient, la fenêtre le
dit et propose d'ajouter un poste sur le schéma. La fenêtre liste ce qui change et vérifie la variante ; exporter d'abord l'activité
actuelle pour garder les deux versions.

**Types d'appareils disponibles :** PC, Serveur (HTTP/DNS/DHCP), Switch, Routeur, Box WiFi, Internet, Cadre, Annotation texte.

**Utilisation :**
1. Ouvrir `scorm-builder.html` dans Chrome ou Firefox
2. Vue **Conception** : construire la topologie, configurer les IP et les services (ou menu ☰ › Nouvelle activité)
3. Bandeau **Évaluation** : ajouter les objectifs et les pannes ; onglet **Contrôle** pour vérifier le corrigé
4. Menu ☰ : exporter le SCORM (Moodle) ou le HTML (test local) ; vue **Test** pour jouer l'élève

**Raccourcis clavier :** `Ctrl+1/2/3` (replier le bandeau, ouvrir Évaluation, ouvrir Contrôle), `Ctrl+Z` / `Ctrl+Y` (annuler, rétablir, chez l'élève aussi), `Échap` (retour à l'outil Sélection, depuis n'importe quel outil, en annulant un câble en cours), `Suppr` (effacer l'appareil, le câble, le cadre ou le texte sélectionné ; `Ctrl+Z` l'annule dans le builder), `F11` (plein écran). En mode câble, le pointeur prend la forme du câble.

---

### Tests unitaires

#### `tests/sim-tests.js`
Suite de **453 tests** couvrant le moteur de simulation réseau, l'évaluation et les scénarios fournis. S'exécute avec Node.js sans navigateur, via un sandbox `vm.createContext()` qui extrait le code JS du `scorm-builder.html`.

**Suites couvertes :**
- Fonctions réseau de base : `ip2n`, `isValidUserIP`, `isValidUserMask`, `sameNet`, `netAddr`, `isRouter`, `lanSeg`, `cablePath`, `devByIP`
- Simulation applicative : `simPing` (LAN, WiFi, pont WiFi ↔ câble de la box, routé, internet), `simDNS`, `simHTTP`, `simDHCP`
- Routage : `getRoutingTable`, `autoRoute` (RIP propagé, route par défaut), acheminement par les tables, route la plus précise, retour des réponses, boucles, adresses inconnues privées ou publiques
- Évaluation : `checkObjectiveStatic` (10 types statiques, adresses en plage ou joker, références `{Appareil}`, passerelle cohérente), `checkDynamicObjective` (4 types dynamiques), objectifs perdus quand l'élève casse sa configuration, contrainte affichée à l'élève
- Mode panne : `applyFaults` (11 types de pannes dont trois de routage, formats plat et imbriqué)
- Connexion WiFi : SSID et mot de passe du terminal, liaison inactive et messages tant qu'ils ne correspondent pas à la box
- Commandes élève : terminal et navigateur jusqu'à la validation des objectifs
- Score et SCORM : calcul du score, seuil de réussite, échanges avec un LMS simulé
- Session : sauvegarde, reprise, réseau de départ
- Scénarios : pour chaque fichier de `scenarios/`, cohérence, score de 100 une fois le réseau corrigé, et score sous le seuil tant que les pannes ne sont pas réparées
- Assistant et variantes : les mêmes règles pour chaque modèle (3 types × 3 thèmes × 3 difficultés, plus le type Réseau Internet et ses 3 thèmes, 3 tirages) et chaque variante des scénarios fournis

```bash
node tests/sim-tests.js
# ✅ 453/453 tests passés — SUCCÈS
```

#### `tests/e2e/`
Suite Playwright qui pilote le vrai builder dans Chrome : import et export des 4 scénarios, score de départ de chaque activité, réparation d'une panne, terminal du builder, adresse en plage et contrainte affichée à l'élève, cible de ping désignée par un appareil, plan d'adressage de l'énoncé et du corrigé, ordre de la liste des objectifs et des pannes, ping depuis un poste à ajouter par l'élève, câble débranché puis rebranché dans le builder, indice d'un objectif proposé, modifié et affiché à l'élève, assistant « Nouvelle activité » et variante jusqu'au score de l'élève, contenu du ZIP SCORM, note, statut et reprise avec un LMS simulé. Chrome doit être installé ; aucun autre navigateur n'est téléchargé.

```bash
npm --prefix tests/e2e ci     # la première fois
npm --prefix tests/e2e test
```

Ces tests ne remplacent pas un essai sur un vrai Moodle, et ne couvrent ni le drag & drop, ni l'énoncé imprimable en dehors de son plan d'adressage, ni Firefox.

---

### Scénarios prêts à l'emploi (`scenarios/`)

Quatre scénarios JSON complets couvrant les 14 types d'objectifs. À charger via **menu ☰ → 📂 Ouvrir**. Dans `reseau-college` et `reseau-lycee`, le poste à ajouter est posé dans le corrigé avec la case « à ajouter par l'élève ».

Tous démarrent avec un score de **0** : chaque point se gagne en réparant une panne, en construisant ce qui est demandé ou en prouvant par une commande (ping, nslookup, navigateur, dhcp) que le réseau fonctionne. Les tests vérifient ce score de départ pour chaque fichier de `scenarios/`.

Chaque réparation ou construction est **suivie de son test** (ping, ouverture d'un site, nslookup), préfixé « Test : » dans le libellé, et chaque panne est placée dans la liste du builder juste avant l'objectif qui la répare (`evalOrder`).

#### `scenarios/reseau-maison.json`
**Réseau Maison — Panne WiFi** — niveau 4e/3e

Topologie : Box WiFi (DHCP, SSID `WiFi-Maison`), Switch, PC-Bureau (câble), Laptop et Smartphone (WiFi). L'appareil Internet sert le DNS public (8.8.8.8) et le site `www.exemple.fr`.
Panne : mauvaise passerelle sur PC-Bureau (`192.168.99.1` au lieu de `192.168.1.1`).
7 objectifs — 100 points — seuil 60 %. L'élève compare le Laptop (DHCP, ping et site) au PC-Bureau, corrige la passerelle puis le prouve par un ping et l'ouverture du site.

Objectifs couverts : `dhcp_success`, `ping_success`, `http_success`, `gateway_configured`.

---

#### `scenarios/reseau-entreprise.json`
**Réseau Entreprise — Serveur Web et DNS en panne** — niveau Terminale/BTS

Topologie : Routeur, Switch LAN, 3 PC (Alice, Bob, Charlie), Serveur (HTTP + DNS).
Pannes : service DNS désactivé sur le Serveur + mauvaise passerelle sur PC-Bob.
7 objectifs — 100 points — seuil 60 %. Chaque panne est réparée puis vérifiée : résolution du nom et accès au site depuis PC-Alice et PC-Bob après la relance du DNS, accès Internet de PC-Bob après la correction de sa passerelle.

Objectifs couverts : `ping_success`, `service_active`, `dns_success`, `http_success`, `gateway_configured`.

---

#### `scenarios/reseau-lycee.json`
**Réseau Lycée — Diagnostic et réparation** — niveau Terminale NSI/BTS SIO

Topologie : Routeur-Principal, 2 Switches, PC-Salle1, PC-Salle2, Box-WiFi-Élèves (DHCP WiFi), Tablette-Élève, Serveur-DNS, Serveur-Web.
Pannes (7) : câble Internet débranché, SSID incorrect, DHCP de la Box arrêté, liaison WiFi de la tablette coupée, IP incorrecte sur PC-Salle2, adresse de la Box erronée (le routeur perd la route vers le réseau WiFi), service HTTP du Serveur-Web arrêté.
Construction : l'élève ajoute PC-Salle3 (adresse libre entre `.20` et `.49`, passerelle du routeur, DNS du Serveur-DNS) et l'enregistrement `pc-salle3.lycee.local`.
21 objectifs — 100 points — seuil 65 %. Chaque réparation est suivie de son test ; le SSID de la Box, la liaison WiFi et le DHCP de la tablette se prouvent ensemble par la demande DHCP de la tablette. La route rétablie se prouve par un ping de PC-Salle1 vers la tablette : tant que la Box est mal adressée, le routeur n'a pas de route vers le réseau WiFi.

Objectifs couverts : **tous les 14 types** (`cable_exists`, `ssid_configured`, `service_active`, `wifi_link`, `dhcp_success`, `ip_configured`, `route_exists`, `http_success`, `device_added`, `gateway_configured`, `dns_configured`, `ping_success`, `dns_record`, `dns_success`).

---

#### `scenarios/reseau-college.json`
**Réseau du collège — Adressage par salle** — niveau collège (cycle 4)

Topologie : Switch-College, 4 salles encadrées (bâtiments A et B, 2 salles chacun) avec un switch et 2 PC par salle, en IP fixes.
Plan d'adressage : `10.<bâtiment>.<salle>.<poste>`, masque `255.0.0.0` (bâtiment A = 1, B = 2).
Pannes : câble débranché sur A204-P2 + IP incorrecte sur B105-P2. L'élève ajoute aussi le poste B210-P3.
8 objectifs — 100 points — seuil 60 %. Chaque correction et le nouveau poste sont vérifiés par un ping depuis un voisin de salle.

Objectifs couverts : `cable_exists`, `ip_configured`, `device_added`, `ping_success`.

---

### Documentation

#### `docs/doc-prof.pdf`
Guide complet pour les **enseignants** : présentation, interface du builder, assistant « Nouvelle activité » et variantes, 14 types d'objectifs, mode panne, routage, workflow en 7 étapes, import/export de scénarios, raccourcis clavier.

#### `docs/doc-eleve.pdf`
Guide de prise en main pour les **élèves** : interface, fiche et bureau des appareils, commandes du terminal (`ping`, `ipconfig`, `nslookup`, `dhcp`, `traceroute`…), navigateur du bureau pour le web, objectifs et score, exemple guidé, résolution de problèmes.

---

### Sources et outillage

| Fichier | Rôle |
|---------|------|
| `src/net-core.js` | Cœur du moteur réseau IPv4 : modèle, simulation, évaluation, sans accès au navigateur (compilé dans scorm-builder.html) |
| `src/sim-ui.js` | Interface du simulateur : affichage, souris, terminal, SCORM (compilé dans scorm-builder.html) |
| `src/template-skeleton.html` | Squelette HTML du template élève |
| `src/template-extra.js` | JS spécifique au template élève (SCORM, renderActivityTab…) |
| `tools/build.py` | Script de compilation : `python3 tools/build.py --rebuild` |
| `tests/sim-tests.js` | Suite de tests unitaires Node.js |
| `tests/e2e/` | Tests du builder et des exports dans Chrome (Playwright) |
| `tools/validate.py` | Validation des scénarios JSON |

**Modifier le moteur et régénérer :**
```bash
# 1. Éditer src/net-core.js, src/sim-ui.js, src/template-extra.js ou src/template-skeleton.html
# 2. Recompiler
python3 tools/build.py --rebuild
# 3. Vérifier les tests
node tests/sim-tests.js
```

---

## Format JSON des scénarios

```json
{
  "version": 1,
  "createdAt": "2026-06-18T00:00:00.000Z",
  "network": {
    "nid": 8,
    "devs": {
      "d1": { "id":"d1", "type":"pc", "name":"PC-Alice",
              "ifaces":[{"name":"eth0","ip":"192.168.1.10","mask":"255.255.255.0",
                         "gateway":"192.168.1.1","dns":"192.168.1.100"}],
              "staticRoutes":[] }
    },
    "links": {
      "l1": { "id":"l1", "from":"d1", "to":"d2" },
      "l2": { "id":"l2", "from":"d3", "to":"d4", "type":"wifi" }
    }
  },
  "activity": {
    "title": "Réseau local entreprise",
    "level": "Terminale",
    "instructions": "Diagnostiquez les pannes et validez les objectifs.",
    "masteryscore": 60,
    "displayMode": "full",
    "objectives": [
      { "id":1, "label":"PC-Alice peut joindre le Serveur",
        "check":"ping_success", "params":{"from":"PC-Alice","to":"Serveur"},
        "points":10, "hint":"Double-clic sur PC-Alice, Invite de commandes : ping 192.168.1.100" }
    ],
    "faults": [
      { "id":1, "type":"bad_gateway", "dev":"PC-Alice", "badValue":"192.168.99.1" }
    ],
    "evalOrder": ["f:1", "o:1"]
  }
}
```

**14 types d'objectifs disponibles :**

| Type | Catégorie | Paramètres |
|------|-----------|------------|
| `ping_success` | Commande | `from`, `to` |
| `dns_success` | Commande | `from`, `domain` |
| `http_success` | Commande | `from`, `url` |
| `dhcp_success` | Commande | `from` |
| `cable_exists` | Configuration | `devA`, `devB` |
| `wifi_link` | Configuration | `devA`, `devB` |
| `ip_configured` | Configuration | `dev`, `ip`, `mask` |
| `gateway_configured` | Configuration | `dev`, `gateway` |
| `dns_configured` | Configuration | `dev`, `dns` |
| `service_active` | Configuration | `dev`, `service` (`http`/`dns`/`dhcp`) |
| `device_added` | Configuration | `newdev`, `type`, `ip`, `mask`, `gateway` |
| `ssid_configured` | Configuration | `dev`, `ssid` |
| `route_exists` | Configuration | `dev`, `dest`, `mask`, `gw` (routeur suivant, facultatif) |
| `dns_record` | Configuration | `dev`, `domain`, `ip` |

**Adresses au choix.** Dans `ip_configured`, `gateway_configured` et `device_added`, l'adresse
attendue (`ip`, `gateway`) peut être :

| Valeur | Sens |
|--------|------|
| `192.168.1.10` | exacte |
| `192.168.1.10-50` | plage (sur n'importe quel octet) |
| `192.168.1.*` | au choix (joker) |
| `@routeur` | passerelle seulement : l'adresse d'un routeur ou d'une box du même réseau que l'appareil, joignable depuis lui |
| vide | aucune condition |

Pour l'adresse d'un appareil, une plage ou un joker n'accepte qu'une adresse utilisable : ni
l'adresse du réseau, ni la diffusion (calculées avec le masque de l'appareil), ni une adresse déjà
prise par un autre appareil. Dans le builder, un menu devant le champ propose ces quatre niveaux.

**Adresse d'un appareil.** Dans `ping_success` (`to`), `dns_configured` (`dns`) et `dns_record`
(`ip`), la valeur `{Srv-Web}` désigne les adresses actuelles de l'appareil Srv-Web : l'objectif suit
ses changements, par exemple quand l'élève choisit lui-même l'adresse du serveur. Pour un ping, toute
interface de l'appareil compte (un routeur en a plusieurs) ; un nom seul, sans accolades, reste
accepté comme dans les anciens scénarios. Le builder signale un ping, un DNS ou un enregistrement qui
vise en dur une adresse laissée au choix de l'élève.

**`device_added` sans nom** (`newdev` vide) ne compte que les appareils absents du réseau de
départ ; avec un nom, l'appareil de ce nom suffit, même s'il était déjà là.

**Contrainte affichée à l'élève.** Sous le libellé d'un objectif, l'élève peut lire une
contrainte (onglet Activité et énoncé imprimable), par exemple « PC1 : adresse IP au choix entre
192.168.1.10 et 192.168.1.50 (adresse libre) ». Champs facultatifs de l'objectif :

| Champ | Rôle |
|-------|------|
| `showConstraint` | `true` / `false` ; absent : affichée seulement si une adresse est en plage ou en joker, pour ne pas donner la réponse d'une valeur exacte |
| `constraintText` | texte rédigé par l'enseignant, à la place du texte généré (retours à la ligne conservés) |
| `constraintFrom` | texte généré au moment de la rédaction : le builder signale quand les paramètres ont changé depuis |

Le texte est généré pour `ip_configured`, `gateway_configured` et `device_added` ; pour les autres
types, l'enseignant peut en rédiger un. Dans le builder, le bloc « Montrer une contrainte à l'élève »
de chaque objectif propose le texte généré, qui suit les paramètres tant qu'il n'est pas modifié,
et un lien pour y revenir.

**Ordre des objectifs et des pannes.** Dans le bandeau Évaluation, objectifs (pastille bleue numérotée) et
pannes (pastille rouge P1, P2…) forment une seule liste, réordonnable par glisser-déposer (⠿) ou avec
▲ ▼. L'ordre est enregistré dans `evalOrder` (clés `o:<id>` pour un objectif, `f:<id>` pour une panne) ;
les objectifs sont présentés à l'élève dans cet ordre. Sans `evalOrder`, les objectifs viennent
d'abord, puis les pannes. Une panne sans description est désignée par son type et l'appareil visé.

**Postes à ajouter par l'élève.** Dans les listes d'appareils d'un objectif (ping depuis, câble,
IP…), le builder propose aussi, sous « À ajouter par l'élève », les postes nommés par un objectif
« Poste ajouté » placé au-dessus dans la liste. Un nom qui n'existe ni dans le réseau ni dans un tel
objectif reste affiché, marqué « (introuvable) », et l'aperçu de l'objectif le signale. Côté élève, le
nom d'un appareil est reconnu sans tenir compte de la casse ni des espaces, y compris pour l'appareil
d'où part un ping, une résolution DNS, une page web ou une demande DHCP.

**Plan d'adressage.** L'énoncé imprimable contient un tableau construit à partir des
objectifs d'adressage (`ip_configured`, `gateway_configured`, `dns_configured`, `device_added`) : une
ligne par appareil, regroupée par encadré, et seulement les colonnes utilisées (IP, masque,
passerelle, DNS). Chaque case suit le niveau choisi : valeur écrite, contrainte avec une ligne à
compléter (« entre 192.168.1.10 et .50 : ____ », « adresse du routeur : ____ », « adresse de
Srv-DNS : ____ »), ou ligne vide. Une valeur exacte n'est écrite que si la contrainte de l'objectif est
affichée. Un appareil à ajouter rejoint l'encadré de l'appareil auquel un objectif de câblage le relie ;
un appareil cité par « l'adresse de… » sans ligne propre est donné en référence. Une case des options d'export
retire le plan de l'énoncé.

Le bouton **Corrigé enseignant** produit le même document, rempli avec les adresses du réseau actuel
du builder, vérifiées avec les règles d'évaluation ; une case sans solution valide l'indique.

**Acheminement d'un ping.** Le ping (et donc DNS et HTTP) suit les tables de routage, à l'aller puis au
retour :

- même réseau : livraison directe par les câbles et les switchs, ou par la box, qui relie ses clients WiFi et son côté LAN câblé (jamais son port WAN) ;
- sinon, passerelle de l'appareil, puis à chaque routeur la route **la plus précise** de sa table, et
  à défaut la route par défaut (`0.0.0.0/0`) ;
- la réponse doit revenir par le même mécanisme, sauf depuis Internet : le routeur d'accès traduit
  les adresses (NAT) ;
- une adresse privée (10.x, 172.16–31.x, 192.168.x), ou d'un réseau du schéma, que personne ne porte
  est inconnue ; une adresse publique inconnue est sur Internet, joignable seulement par une route ;
- le message d'échec nomme le routeur en cause (« Pas de route vers 192.168.2.100 sur
  Routeur-Principal… », « la réponse ne revient pas… », boucle de routage).

Les routes RIP sont recalculées (à l'ouverture de l'activité, à l'import dans le builder, à chaque
modification d'un routeur) et se propagent de proche en proche ; l'appareil Internet annonce la route
par défaut et n'apprend aucun réseau du schéma. Un routeur dont le routage automatique est décoché
n'apprend rien : il ne communique qu'avec ses réseaux directs et les routes statiques qu'on y écrit (application Routage du bureau).

**Connexion WiFi.** Une liaison WiFi tracée vers une box ne transporte rien tant que le terminal n'a
pas choisi le réseau de la box (SSID) et, pour un réseau protégé, saisi son mot de passe : liaison en
pointillé rouge, `ping` et `dhcp` répondent « Non connecté au WiFi : mot de passe incorrect » ou
« SSID … inconnu ». La fiche du terminal a une section **Connexion WiFi** (état, SSID, mot de passe) ;
`ipconfig` indique l'état. Quand une liaison est tracée, le terminal prend le SSID de la box ; dans le
builder il prend aussi le mot de passe, dans l'activité l'élève le tape (il figure dans la fiche de la
box). Dans le builder, changer le SSID ou le mot de passe d'une box met à jour ses terminaux
connectés ; dans l'activité, ils se déconnectent, comme avec une vraie box. Un terminal d'un scénario
antérieur, sans réglage WiFi (`wifi` absent), reste connecté. L'objectif `wifi_link` exige une liaison
associée.

**Le score suit le réseau.** Un objectif n'est acquis que tant que sa condition reste vraie : si
l'élève casse sa configuration, il perd les points, et le score affiché est la note transmise au
LMS. Un objectif de simulation (ping, DNS, HTTP, DHCP) se valide par une commande réussie, puis cette
commande est rejouée sans affichage à chaque modification du réseau.

**11 types de pannes (`faults`) :**

| Type | Effet | Paramètres |
|------|-------|------------|
| `bad_ip` | IP incorrecte injectée | `dev`, `badValue` |
| `bad_mask` | Masque incorrect | `dev`, `badValue` |
| `bad_gateway` | Passerelle incorrecte | `dev`, `badValue` |
| `bad_dns` | DNS incorrect | `dev`, `badValue` |
| `service_down` | Service désactivé | `dev`, `service` |
| `missing_cable` | Câble débranché | `devA`, `devB` |
| `ssid_wrong` | SSID WiFi incorrect : les terminaux de la box se déconnectent | `dev`, `badValue` |
| `wifi_pass_wrong` | Mot de passe WiFi incorrect sur un terminal | `dev`, `badValue` |
| `route_missing` | Route statique retirée (une route RIP revient seule) | `dev` (routeur), `dest` |
| `bad_route` | Route statique renvoyée vers un mauvais routeur suivant | `dev`, `dest`, `badValue` |
| `routing_off` | Routage automatique (RIP) désactivé, routes apprises perdues | `dev` (routeur) |

---

## Démarrage rapide

```bash
# Ouvrir le builder (double-clic ou :)
open scorm-builder.html          # macOS
start scorm-builder.html         # Windows

# Charger un scénario de démonstration
# → menu ☰ → 📂 Ouvrir → scenarios/reseau-maison.json

# Lancer les tests unitaires
node tests/sim-tests.js

# Recompiler après modification du moteur
python3 tools/build.py --rebuild && node tests/sim-tests.js
```

---

## Licence

Ce projet est réservé aux usages non commerciaux. Son code reste consultable et réutilisable, mais il n'est pas open source au sens strict.

| Éléments | Licence | Texte |
|----------|---------|-------|
| Code : builder, moteur, template élève, scripts, tests et page du site | [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) | [`LICENSE`](LICENSE) |
| Contenus : guides `doc-*`, scénarios JSON fournis et captures de `site/assets/` | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) | [`LICENSE-CONTENU.txt`](LICENSE-CONTENU.txt) |

- **Établissements et enseignants :** l'usage par un établissement d'enseignement ou une institution publique est autorisé par la licence du code.
- **Activités exportées :** elles embarquent le moteur et restent donc soumises à la licence du code. La mention requise y est ajoutée automatiquement ; ne la retirez pas.
- **Vos propres scénarios :** le contenu que vous créez avec l'outil vous appartient. Cette licence ne vous en retire pas les droits.
- **Usage commercial :** il n'est pas couvert. Pour en discuter, contactez sylvain.guilbert1@ac-toulouse.fr.

Seuls les textes officiels en anglais de ces licences font foi.

---

## 🧪 Guide testeur

**Prérequis :** Chrome ou Firefox récent. Aucune installation.

### Étape 1 — Tester le builder (côté enseignant)
1. Ouvrir `scorm-builder.html`
2. Vue **Conception** : ajouter des appareils, les relier, configurer les IP
3. Ouvrir un scénario : menu ☰ › **📂 Ouvrir** → `scenarios/reseau-maison.json`
4. Vérifier que les objectifs apparaissent dans le bandeau **Évaluation**
5. Exporter en HTML : menu ☰ › **Exporter en HTML** et ouvrir le fichier téléchargé

### Étape 2 — Tester l'activité (côté élève)
1. Ouvrir le fichier HTML exporté
2. L'onglet **Activité** du bandeau du bas liste les objectifs à atteindre
3. Double-cliquer sur un poste pour ouvrir son bureau, puis utiliser l'invite de commandes (`ping`, `ipconfig`, `nslookup`, `dhcp`)
4. Corriger les pannes dans la fiche des appareils (clic) ou dans leur bureau (services, WiFi)
5. Vérifier que le score progresse et que les objectifs se valident

### Étape 3 — Signaler vos retours
**E-mail :** sylvain.guilbert1@ac-toulouse.fr
**Objet :** `[TEST SIMULATEUR] Retour - <établissement>`

```
Navigateur / OS :
Fichier testé :

BUG : description, étapes, comportement attendu vs observé
SUGGESTION : fonctionnalité souhaitée
AVIS : note /5, points forts, points à améliorer
```

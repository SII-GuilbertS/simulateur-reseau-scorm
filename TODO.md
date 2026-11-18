# TODO — Simulateur Réseau IPv4 · Idées d'amélioration

> Mis à jour le 15 novembre 2026, à la version 2.0 (mode unique, bureau des appareils, vues Corrigé / Départ élève / Essai, contrôle du corrigé). Ce qui est déjà fait est listé en fin de fichier.

---

## ⭐ Priorité haute

- ✅ **Mode unique : supprimer le mode « Simulation »** — éditer (ajouter, câbler, configurer) et simuler (terminal, navigateur, objectifs) dans le même état, sans basculer. Décidé en principe le 15 novembre 2026 ; à reprendre en trois étapes, chacune livrable seule. Détail ci-dessous.

  **Pourquoi.** Le moteur simule déjà en permanence : chaque `render()` appelle `scheduleObjectiveCheck()`, les objectifs sont réévalués et les objectifs dynamiques rejoués (`ACTIVITY_PROOFS`). Le mode ne fait que filtrer l'interface (`S.mode` : `'config'` ou `'simulation'`). Il ne protège rien (l'élève bascule librement), force des allers-retours « je configure → je teste », et double le code (deux fiches de propriétés, une vingtaine de gardes). Dans le builder, il ne sert déjà plus qu'à la vue Essai.

  **Ce qui reste à toucher** :
  - Documentation (à regénérer seulement à la prochaine release) : `tools/gen_docs.py` (guide élève : « Mode Simulation », « Cliquez sur SIMU », étape 5 du pas-à-pas ; guide enseignant), `README.md`, `CLAUDE.md` (section Bureau des appareils et « Trois vues »).

  **Étape 1 — un seul comportement de clic, une seule fiche** : ✅ faite. `devMD` unique (sélection, fiche, glisser, double-clic vers le bureau), palette toujours active, fiche unique `showProps` dans `src/sim-ui.js`, lecture seule de la vue Départ élève par `readOnly()` / `propsLock()` / `palLock()` (un prédicat plutôt qu'un paramètre de `showProps`, parce que la fiche est rappelée depuis ses propres champs). Le clic sur un appareil ne bascule plus le bandeau sur l'onglet Terminal. La fiche ne liste plus les appareils connectés en WiFi à une box, les enregistrements DNS ni les fichiers d'un serveur : ils se lisent dans les applications du bureau.

  **Étape 2 — boutons de mode retirés, bandeau repliable, sauvegarde temporisée** : ✅ faite. `S.mode`, `setMode` et les boutons de mode de l'élève sont supprimés. Le bandeau du bas ne garde que Journal, Paquets et Activité, et se replie sur ses onglets ; terminal et navigateur ne sont plus que dans le bureau des appareils (les entrées « Table ARP » et « Trames » visent donc un onglet du bandeau ou une application du bureau). La sauvegarde de l'élève part 5 s au plus après une modification, et seulement si le réseau a changé. Builder : terminal et navigateur ouverts en vue Corrigé avec la mention « non comptabilisé », `BUILDER_TOUCHED` supprimé (le Corrigé affiche le score de l'élève à l'ouverture), test du câble rebranché déplacé en vue Essai. Consignes et indices des 4 scénarios et de l'assistant reformulés (plus de « mode Simulation » ni d'« onglet Navigateur »).

  **Constaté à l'étape 2, à décider** : la sauvegarde complète (`suspend_data`) d'un scénario fourni fait de 4 100 à 7 500 caractères en fin d'activité, au-delà des 4 096 garantis par SCORM 1.2. Moodle l'accepte ; un LMS strict la refuse, et la reprise sur un autre poste est alors perdue (l'élève est prévenu). Piste : n'enregistrer que les écarts avec le réseau de départ.

  **Étape 3 — option « Topologie verrouillée »** : abandonnée (15 novembre 2026). Le verrou ne protégeait pas la note (les objectifs visent des appareils et des valeurs précis), était incompatible avec les pannes de câble et les postes à ajouter (deux scénarios sur quatre, une partie de l'assistant), et le désordre se répare autrement : bouton « Recommencer depuis le réseau de départ », et surtout **Ctrl+Z / Ctrl+Y chez l'élève**, fait à la place (mécanisme du builder déplacé dans le moteur, étendu aux ajouts, câbles, adresses et déplacements).

  **Critère d'arrêt de chaque étape** : `node tests/sim-tests.js` et `npm --prefix tests/e2e test` verts, parcours élève complet (construire, câbler, configurer, tester, recharger la page et retrouver son réseau) vérifié dans le navigateur, et un export HTML ouvert directement.

- ✅ **Connexion WiFi réelle côté terminal (SSID + mot de passe)** — fait après la v1.9.2 : section « Connexion WiFi » dans la fiche, liaison en rouge et messages tant que SSID ou mot de passe ne correspondent pas, `ssid_wrong` qui déconnecte, panne `wifi_pass_wrong`, `wifi_link` qui exige l'association, scénarios Maison et Lycée et assistant mis à jour. Plan initial, pour mémoire : aujourd'hui seule la Box a un SSID et un mot de passe : tracer une liaison WiFi suffit à connecter l'appareil, le mot de passe n'est jamais vérifié, et la panne `ssid_wrong` ne coupe rien (elle renomme seulement la Box, cf. `reseau-lycee.json`, dont l'objectif SSID n'a donc pas de test). À faire :
  1. Section « Connexion WiFi » (SSID + mot de passe) dans les propriétés des terminaux capables de WiFi (portable, téléphone, tablette, PC sans modèle, serveur), pas sur le PC fixe.
  2. Liaison WiFi fonctionnelle seulement si SSID identique à celui de la Box et mot de passe correct (sauf réseau ouvert) ; sinon liaison en pointillé rouge, `ping`/`dhcp` répondent « Non connecté au WiFi : SSID inconnu / mot de passe incorrect ».
  3. Pré-remplir SSID et mot de passe de la Box quand l'enseignant trace la liaison ; il les vide ou les fausse pour en faire un exercice.
  4. Compatibilité : un terminal sans ces champs (anciens scénarios, packages déployés) reste connecté.
  5. `ssid_wrong` coupe vraiment les terminaux ; nouvelle panne « Mot de passe WiFi incorrect » sur un terminal ; l'objectif `wifi_link` vérifie aussi l'association.
  6. Pré-remplir les terminaux WiFi de `reseau-maison.json` et `reseau-lycee.json`, revérifier le barème du lycée (sous le seuil avant réparation, 100 après), ajouter un test après la réparation du SSID, mettre à jour `sim-tests.js` et `SCENARIOS` dans `builder.spec.js`.

- [ ] **Indices quand une commande échoue** — le terminal affiche déjà la raison technique renvoyée par `simPing()` / `simDNS()` (« La passerelle … n'est pas dans le sous-réseau de PC-Alice »). Y ajouter un conseil actionnable pour l'élève (« Vérifie la passerelle de PC-Alice avec ipconfig »), désactivable par l'enseignant.

- [ ] **Éditeur de routes statiques** — laisser l'élève saisir les routes d'un routeur dont le routage automatique est décoché. L'objectif `route_exists` existe déjà. Depuis que le ping suit les tables de routage (aller et retour), un tel routeur ne communique qu'avec ses réseaux directs : cet éditeur est le seul moyen de le réparer.

---

## 🎓 Expérience élève

- [ ] **Mode guidé pas-à-pas** — afficher les objectifs un par un, chacun déverrouillé quand le précédent est atteint. Option `displayMode: 'step'` dans le bandeau Évaluation. Bien adapté au collège et à la liste ordonnée (panne → réparation → test).

- [ ] **Historique des tentatives** — panneau qui liste les commandes déjà tapées et leurs résultats ; solution affichée une fois l'activité réussie.

- [ ] **Mode chronomètre** — compteur de temps écoulé côté élève, réglé dans le builder. Utile pour les évaluations en classe.

---

## 🛠️ Expérience enseignant (builder)

- [x] **Refonte de l'interface du builder et de l'en-tête élève** (18 novembre 2026) — une seule barre avec menu ☰ ; évaluation et contrôle du corrigé dans le bandeau du bas (onglets « 🎯 Évaluation » et « ✔ Contrôle », plus de barre orange) ; vues Conception · Départ élève · Test avec « ↺ Repartir de zéro » et le score de l'essai dans la barre de vue ; « + Appareil à ajouter » (poste et objectif) ; outil « Liaison » (câble ou WiFi) ; en-tête élève allégé (menu ☰) ; mode professeur et mot de passe retirés. Détail dans `CLAUDE.md`.
- [x] **Vue Corrigé : contrôle du corrigé à la place du score** (15 novembre 2026) — le mot « score » prêtait à confusion (0 affiché sur un corrigé juste). L'en-tête dit si le corrigé réalise tous les objectifs ; un clic ouvre un tableau : état dans le corrigé (commandes rejouées sans terminal, raison de l'échec) et au départ de l'élève (pannes qui le masquent, objectif acquis d'avance). Calcul dans `ActivityWizard.review`.
- [x] **Appareil « à ajouter par l'élève » posé dans le corrigé** (15 novembre 2026) — case « ➕ À ajouter par l'élève » sur la fiche d'un appareil, vue Corrigé : il reste dans le corrigé (câbles, réglages, tests rejoués depuis lui) et il est retiré du réseau de départ de l'élève, de la vue Essai et de l'énoncé. « Figer le départ » et « Réinitialiser » sont supprimés (ils laissaient croire qu'ils définissaient le départ de l'élève).
- [ ] **Scénarios fournis et assistant : passer à la case « à ajouter par l'élève »** — `reseau-college`, `reseau-lycee` et les modèles « Construction » décrivent encore le poste à ajouter par son seul objectif (poste absent du réseau) : 4 et 8 objectifs y restent « à vérifier en Test ». Les y poser avec la case rendrait leur corrigé vérifiable en entier ; les tests de `sim-tests.js` (`applySolution`) sont à adapter. Constaté le 18 novembre 2026 sur un scénario « Construction » de l'assistant : la pastille affiche « ✅ Corrigé complet · 7 à vérifier en Test » alors qu'aucun des 7 objectifs n'est vérifié (Poste-3 absent du corrigé). À traiter avec la refonte de l'assistant (retrait du niveau, nouveau type « Réseau Internet »), pour ne modifier les modèles qu'une fois ; la pastille est déjà corrigée (18 novembre 2026) : elle compte « N vérifiés · M à vérifier en Test · K non atteignables » au lieu de « Corrigé complet ».
- [ ] **Bandeau Évaluation : aperçu des objectifs à commande** — l'aperçu d'un ping ou d'un nslookup y dit encore « pas encore validé dans votre test » ; il pourrait reprendre le résultat du contrôle du corrigé (`ActivityWizard.review`).

- [ ] **Assistant « Nouvelle activité » : d'autres modèles** — un lycée à deux salles, une construction où l'élève configure le routeur, d'autres thèmes (médiathèque, hôpital…). Chaque modèle passe automatiquement les règles des scénarios dans `sim-tests.js`.

- [ ] **Variante « une panne de plus » sur une Box** — elle vise un poste à adresse fixe, ou à défaut un terminal WiFi d'une box protégée (mot de passe faux) : Maison en bénéficie. Restent le DHCP coupé et le SSID faux sur la Box elle-même.

- [ ] **Aperçu élève côte à côte** — le bouton « Aperçu élève » ouvre déjà l'activité dans un onglet, le bandeau Évaluation signale les objectifs acquis au départ, et les vues Départ élève et Test montrent le réseau de l'élève sur le schéma. Reste un aperçu en direct, **à côté** du schéma du corrigé (deux schémas visibles en même temps), mis à jour à chaque modification.

- [ ] **Bibliothèque de scénarios en ligne** — dépôt partagé (GitHub Pages) où les profs publient et récupèrent des scénarios JSON. Bouton « Parcourir la bibliothèque » dans le menu ☰.

---

## 🌐 Pédagogie réseau (nouvelles fonctionnalités simulées)

- [ ] **Table ARP** — table ARP de chaque appareil construite au fil des pings (requête / réponse ARP), dans un onglet `arp` du panneau bas (ou une application du bureau de l'appareil : voir « Mode unique »).

- [ ] **Capture de trames (Wireshark simplifié)** — panneau `📡 Trames` listant les échanges ARP / ICMP / DNS / HTTP / DHCP au fil des commandes.

- [ ] **VLAN basique** — segmenter un switch en deux VLAN (port d'accès / trunk). Objectif typique BTS SIO. Touche `cablePath`, `lanSeg` et `l2Reach`.

- [ ] **Pare-feu simple** — appareil `Firewall` avec règles autoriser / refuser par port (80, 53…), qui bloque certains `simPing` / `simHTTP`.

- [ ] **Collisions sur un hub (CSMA/CD)** — visualiser les collisions sur un hub, par opposition au switch. Surtout pour la SNT et le collège.

---

## 🔧 Technique et robustesse

- [ ] **Tests navigateur à compléter** — `tests/e2e/` couvre import, exports, SCORM, assistant, variantes, vues du builder et reprise de l'élève. La souris sur le schéma (palette, déplacement, câblage, double-clic), le bandeau du bas, la sauvegarde automatique et Ctrl+Z sont couverts depuis le mode unique. Restent : déplacement et redimensionnement des cadres et des textes, annulation de leurs réglages et d'un fichier chargé, redimensionnement du bandeau, énoncé imprimable hors plan d'adressage, Firefox, vrai Moodle.

- [ ] **Validation des scénarios JSON** — schéma complet (champs manquants, types incorrects, identifiants en double) avec des messages clairs à l'import, et vérifié par `tools/validate.py`.

- [ ] **Version minimale dans les scénarios** — champ `minBuilderVersion` pour avertir à l'import d'un scénario qui exige un builder plus récent.

- [ ] **Export SCORM 2004 / xAPI / H5P** — en plus de SCORM 1.2, pour d'autres plateformes (Canvas, Chamilo…).

---

## ✅ Déjà implémenté (pour mémoire)

| Fonctionnalité | Version |
|---|---|
| Simulation ping / DNS / HTTP / DHCP / WiFi / routage RIP, Box WiFi | avant v1.5 |
| Builder à 3 onglets, export SCORM 1.2 et HTML, énoncé imprimable | avant v1.5 |
| 14 types d'objectifs, 7 types de pannes, mode panne | avant v1.5 |
| Notation des scénarios à pannes | v1.5 |
| Cartes illustrées, score en direct, Figer / Réinitialiser (retirés en novembre 2026) | v1.6 |
| Adresses en plage ou au choix, références `{Appareil}`, passerelle « routeur du réseau », contrainte affichée à l'élève, score qui suit le réseau (objectifs perdus) | v1.7 |
| Plan d'adressage dans l'énoncé et corrigé enseignant ; objectifs et pannes dans une liste ordonnable | v1.7 |
| Scénarios à 0 au départ, chaque réparation suivie de son test | v1.8 |
| Ping par les tables de routage (aller et retour), Échap / Suppr, pointeur câble, icône du routeur, badges retirés, DHCP depuis la fiche du poste | v1.9 |
| Assistant « Nouvelle activité » et variantes, ENT hébergé sur Internet, score du builder égal à celui de l'élève | v1.9.1 |
| Pont WiFi ↔ câble de la Box (WAN exclu) | v1.9.2 |
| TTL selon les routeurs traversés, toutes les interfaces d'un routeur sur sa carte | à venir |
| Connexion WiFi réelle (SSID et mot de passe), panne « mot de passe WiFi incorrect » | à venir |
| Fichier ou session abîmés refusés avant chargement, refus de sauvegarde du LMS signalé, moteur scindé en cœur réseau et interface | v1.9.4 |
| Contrôle du départ élève dans le builder : bandeau « Départ élève », pastilles de panne P1, P2… sur le schéma, état de chaque objectif (corrigé / départ élève / essai) | à venir |
| Vues Corrigé / Départ élève / Essai : bureau utilisable dans le corrigé, essai sur une copie conservée quand on change de vue, exports toujours issus du corrigé | à venir |
| Builder vierge à l'ouverture (« Ouvrir » pour reprendre), alerte avant fermeture sans enregistrement, boutons Ouvrir et Enregistrer dans la barre du haut | à venir |
| 396 tests unitaires (`sim-tests.js`), 40 tests navigateur (`tests/e2e/`) | — |

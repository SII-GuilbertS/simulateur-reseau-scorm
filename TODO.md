# TODO — Simulateur Réseau IPv4 · Idées d'amélioration

> Mis à jour le 15 novembre 2026, après la version 1.9.4 et les vues Corrigé / Départ élève / Essai du builder. Ce qui est déjà fait est listé en fin de fichier.

---

## ⭐ Priorité haute

- [ ] **Mode unique : supprimer le mode « Simulation »** — éditer (ajouter, câbler, configurer) et simuler (terminal, navigateur, objectifs) dans le même état, sans basculer. Décidé en principe le 15 novembre 2026 ; à reprendre en trois étapes, chacune livrable seule. Détail ci-dessous.

  **Pourquoi.** Le moteur simule déjà en permanence : chaque `render()` appelle `scheduleObjectiveCheck()`, les objectifs sont réévalués et les objectifs dynamiques rejoués (`ACTIVITY_PROOFS`). Le mode ne fait que filtrer l'interface (`S.mode` : `'config'` ou `'simulation'`). Il ne protège rien (l'élève bascule librement), force des allers-retours « je configure → je teste », et double le code (deux fiches de propriétés, une vingtaine de gardes). Dans le builder, il ne sert déjà plus qu'à la vue Essai.

  **Où est le code à toucher** (chercher par nom, les numéros de ligne bougent) :
  - `src/sim-ui.js` : gardes `S.mode` dans `palDS`, `cwDrop`, `devMD` (deux branches : simulation / configuration), `devRC`, `linkRC`, `deleteSelection` (`S.mode!=='config'`), `setMode`, `noSel`, `frameMD` et `textMD` (annotations), `deskOn`, `deskConfigNote` / `deskOpenSim`.
  - `src/template-extra.js` : la reprise de session force `S.mode='config'` au chargement ; le rendu de l'onglet Activité teste `S.mode==='simulation'`.
  - `scorm-builder.html` (JS du builder) : `showPropsSimu` (fiche lecture seule) et `showProps` (fiche éditable) ; `setBuilderView` appelle `setMode` ; le bandeau du bas `.bot` est affiché selon le mode.
  - Tests : 19 occurrences de `#btn-sim` / `#btn-cfg` dans `tests/e2e/builder.spec.js` (une dizaine de tests entrent en simulation ; certains valident la configuration puis testent). `sim-tests.js` ne dépend pas du mode.
  - Documentation (à regénérer seulement à la prochaine release) : `tools/gen_docs.py` (guide élève : « Mode Simulation », « Cliquez sur SIMU », étape 5 du pas-à-pas ; guide enseignant), `README.md`, `CLAUDE.md` (section Bureau des appareils et « Trois vues »).

  **Étape 1 — un seul comportement de clic, une seule fiche** (moteur partagé, builder et élève) :
  - Clic simple sur un appareil : le sélectionne et affiche la fiche. Double-clic : ouvre son bureau (détection déjà en place, `deskDblCheck` : deux `mousedown` à moins de 450 ms sur le même appareil). **À régler** : un glisser terminé ne doit pas compter comme premier clic d'un double-clic (ignorer si l'appareil a bougé), et le `mousedown` qui démarre un glisser ne doit pas déplacer l'appareil au double-clic.
  - Les outils Câble et Suppr. restent explicites (palette), Échap revient à la sélection, la touche Suppr. supprime la sélection : plus de garde de mode.
  - Palette et glisser-déposer toujours actifs (retirer `simMode` dans `setMode` : classe `disabled`, `draggable`).
  - Fiche unique, éditable : identification, configuration réseau, connexion WiFi (poste), services (état + bouton « Ouvrir le bureau »), liste des applications en tête (`deskPropsApps`). `showPropsSimu` disparaît ; la vue Départ élève du builder a besoin d'un mode **lecture seule** : le garder comme paramètre de `showProps` (déjà géré pour le bureau par `deskApply` et `doDHCP`).
  - Sélection d'un poste : renseigner `S.termDev` (comme le faisait la branche simulation) pour que le terminal du bas suive.

  **Étape 2 — retirer les boutons de mode et repenser le bandeau du bas** :
  - Supprimer `#btn-cfg` / `#btn-sim` chez l'élève ; le builder garde ses trois boutons de vue (Corrigé / Départ élève / Essai), qui répondent à « quel réseau regarde-t-on ? ».
  - **Décision à prendre** pour le bandeau du bas (Terminal, Navigateur, Journal, Paquets, Activité) : le garder en dock **repliable** (ouvert par défaut avec une activité, car l'onglet Activité y vit : c'est déjà le cas aujourd'hui via `_keepBot`), ou le remplacer par les fenêtres du bureau + un panneau Activité latéral. Recommandation : dock repliable d'abord, plus simple et sans perte de fonction ; les fenêtres du bureau le remplaceront peu à peu. Attention aux entrées du TODO qui parlent du « panneau bas » (Table ARP, Trames).
  - **Sauvegarde élève** : aujourd'hui elle se fait au passage en simulation, à la fermeture de la page, après chaque réglage du bureau (`deskApply`) et au bouton 💾. Sans mode, ajouter une sauvegarde après modification (au bout de `scheduleObjectiveCheck`), **temporisée** (par exemple 5 s) pour ne pas multiplier les `LMSCommit`. Vérifier la limite de `cmi.suspend_data` (4096 caractères en SCORM 1.2) : le test « reprise » mesure déjà sa taille.
  - Au chargement, la reprise ne doit plus forcer `S.mode='config'`.

  **Étape 3 — option « Topologie verrouillée » (par activité)** : remplace la protection qui n'existe pas aujourd'hui, pour les exercices de diagnostic où l'élève ne doit pas recâbler.
  - Champ `lockTopology` (booléen, faux par défaut) dans la configuration de l'activité : case dans l'onglet Évaluation, carte « Paramètres de notation » ; exporté dans `ACTIVITY_CONFIG` et dans le scénario JSON ; absent = faux, donc les anciens scénarios et packages ne changent pas.
  - Effet côté élève : palette, outil Câble, Suppr., déplacement et suppression d'appareils, annotations désactivés, avec un message « Topologie verrouillée par l'enseignant ». **Restent permis** : adresses, services, WiFi, terminal, bureau.
  - **À décider** : l'assistant « Nouvelle activité » coche-t-il la case par défaut pour le type Dépannage (et la laisse-t-il décochée pour Construction et Découverte) ? Les variantes la conservent-elles ? Le scénario du collège (adressage fixe par salle) doit-il être verrouillé ?
  - Tests : `sim-tests.js` (la règle vit dans le moteur : un test sur le refus d'ajout et de suppression quand le verrou est actif), e2e (palette grisée chez l'élève, scénario ancien sans le champ inchangé).

  **Builder, conséquences à décider** :
  - En vue **Corrigé**, autoriser le terminal et le navigateur (aujourd'hui exclus par `deskApps` hors vue Essai) permettrait au prof de vérifier que son corrigé fonctionne (`ping`, `nslookup`) sans passer en Essai. Condition : que ces commandes **ne comptent pas** dans le score du corrigé (ne pas appeler `recordDynamicEvent` dans cette vue) et que l'interface l'indique (« non comptabilisé »).
  - Si le Corrigé ne marque plus de points, la règle `BUILDER_TOUCHED` (réparation faite par le prof dans le corrigé) devient inutile : supprimer le mécanisme, et déplacer le test e2e « câble débranché : le professeur le rebranche » dans la vue Essai.
  - Garder la vue **Départ élève en lecture seule** et l'essai conservé quand on change de vue (`ESSAI_SNAP`) : rien à changer.

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

- [ ] **Mode guidé pas-à-pas** — afficher les objectifs un par un, chacun déverrouillé quand le précédent est atteint. Option `displayMode: 'step'` dans l'onglet Évaluation. Bien adapté au collège et à la liste ordonnée (panne → réparation → test).

- [ ] **Historique des tentatives** — panneau qui liste les commandes déjà tapées et leurs résultats ; solution affichée une fois l'activité réussie.

- [ ] **Mode chronomètre** — compteur de temps écoulé côté élève, réglé dans le builder. Utile pour les évaluations en classe.

---

## 🛠️ Expérience enseignant (builder)

- [ ] **Assistant « Nouvelle activité » : d'autres modèles** — un lycée à deux salles, une construction où l'élève configure le routeur, d'autres thèmes (médiathèque, hôpital…). Chaque modèle passe automatiquement les règles des scénarios dans `sim-tests.js`.

- [ ] **Variante « une panne de plus » sur une Box** — elle vise un poste à adresse fixe, ou à défaut un terminal WiFi d'une box protégée (mot de passe faux) : Maison en bénéficie. Restent le DHCP coupé et le SSID faux sur la Box elle-même.

- [ ] **Aperçu élève côte à côte** — le bouton « Tester comme élève » ouvre déjà l'activité dans un onglet, l'onglet Évaluation signale les objectifs acquis au départ, et les vues Départ élève et Essai montrent le réseau de l'élève sur le schéma. Reste un aperçu en direct, **à côté** du schéma du corrigé (deux schémas visibles en même temps), mis à jour à chaque modification.

- [ ] **Bibliothèque de scénarios en ligne** — dépôt partagé (GitHub Pages) où les profs publient et récupèrent des scénarios JSON. Bouton « Parcourir la bibliothèque » dans l'onglet 3.

---

## 🌐 Pédagogie réseau (nouvelles fonctionnalités simulées)

- [ ] **Table ARP** — table ARP de chaque appareil construite au fil des pings (requête / réponse ARP), dans un onglet `arp` du panneau bas (ou une application du bureau de l'appareil : voir « Mode unique »).

- [ ] **Capture de trames (Wireshark simplifié)** — panneau `📡 Trames` listant les échanges ARP / ICMP / DNS / HTTP / DHCP au fil des commandes.

- [ ] **VLAN basique** — segmenter un switch en deux VLAN (port d'accès / trunk). Objectif typique BTS SIO. Touche `cablePath`, `lanSeg` et `l2Reach`.

- [ ] **Pare-feu simple** — appareil `Firewall` avec règles autoriser / refuser par port (80, 53…), qui bloque certains `simPing` / `simHTTP`.

- [ ] **Collisions sur un hub (CSMA/CD)** — visualiser les collisions sur un hub, par opposition au switch. Surtout pour la SNT et le collège.

---

## 🔧 Technique et robustesse

- [ ] **Tests navigateur à compléter** — `tests/e2e/` couvre import, exports, SCORM, assistant, variantes, vues du builder et reprise de l'élève. Restent : glisser-déposer d'appareils, câblage à la souris (à traiter avant l'étape 1 du mode unique, qui mélange clic, glisser et double-clic), énoncé imprimable hors plan d'adressage, Firefox.

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
| Cartes illustrées, score en direct, Figer / Réinitialiser | v1.6 |
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

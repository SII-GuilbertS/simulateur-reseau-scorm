# TODO — Simulateur Réseau IPv4 · Idées d'amélioration

> Mis à jour le 11 novembre 2026, après la version 1.9.2. Ce qui est déjà fait est listé en fin de fichier.

---

## ⭐ Priorité haute

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

- [ ] **Aperçu élève côte à côte** — le bouton « Tester comme élève » ouvre déjà l'activité dans un onglet, et l'onglet Évaluation signale les objectifs acquis au départ. Reste un aperçu en direct, à côté du canevas, mis à jour à chaque modification.

- [ ] **Bibliothèque de scénarios en ligne** — dépôt partagé (GitHub Pages) où les profs publient et récupèrent des scénarios JSON. Bouton « Parcourir la bibliothèque » dans l'onglet 3.

---

## 🌐 Pédagogie réseau (nouvelles fonctionnalités simulées)

- [ ] **Table ARP** — table ARP de chaque appareil construite au fil des pings (requête / réponse ARP), dans un onglet `arp` du panneau bas.

- [ ] **Capture de trames (Wireshark simplifié)** — panneau `📡 Trames` listant les échanges ARP / ICMP / DNS / HTTP / DHCP au fil des commandes.

- [ ] **VLAN basique** — segmenter un switch en deux VLAN (port d'accès / trunk). Objectif typique BTS SIO. Touche `cablePath`, `lanSeg` et `l2Reach`.

- [ ] **Pare-feu simple** — appareil `Firewall` avec règles autoriser / refuser par port (80, 53…), qui bloque certains `simPing` / `simHTTP`.

- [ ] **Collisions sur un hub (CSMA/CD)** — visualiser les collisions sur un hub, par opposition au switch. Surtout pour la SNT et le collège.

---

## 🔧 Technique et robustesse

- [ ] **Tests navigateur à compléter** — `tests/e2e/` couvre import, exports, SCORM, assistant et variantes. Restent : glisser-déposer d'appareils, câblage à la souris, énoncé imprimable hors plan d'adressage, Firefox.

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
| 381 tests unitaires (`sim-tests.js`), 28 tests navigateur (`tests/e2e/`) | — |

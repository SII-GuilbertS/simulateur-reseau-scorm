# TODO — Simulateur Réseau IPv4 · Idées d'amélioration

> Généré le 23 juin 2026. Les points marqués ✅ sont déjà implémentés.

---

## ⭐ Priorité haute (impact immédiat, peu de code)

- [ ] **Bulles d'aide contextuelles** — quand un ping échoue, afficher un indice ciblé dans le terminal (`"Vérifie la passerelle de PC-Alice"`). Lire la raison retournée par `simPing()` et la traduire en conseil actionnable pour l'élève.

- [ ] **Table ARP animée** — afficher la table ARP de chaque appareil se construire en temps réel lors des pings (échanges ARP request / ARP reply). Ajouter un onglet `arp` dans le panneau bas, mis à jour à chaque `simPing`.

- ✅ **Génération automatique d'énoncé imprimable** — page HTML avec topologie SVG, objectifs et zone élève. Bouton dans l'onglet 3 Générer. *(fait le 23/06/2026)*

---

## 🎓 Expérience élève

- [ ] **Mode guidé pas-à-pas** — afficher les objectifs un par un avec un bouton "étape suivante" qui déverrouille progressivement. Option `displayMode: 'step'` à ajouter dans le builder (onglet Évaluation).

- [ ] **Historique des tentatives** — panneau qui liste les commandes déjà tapées, leurs résultats, et affiche la solution après validation complète de l'activité.

- [ ] **Mode chronomètre** — option dans le builder pour afficher un compteur de temps écoulé côté élève. Utile pour les évaluations en classe avec limite de temps.

---

## 🛠️ Expérience enseignant (builder)

- [ ] **Éditeur de table de routage manuel** — désactiver `autoRoute` pour certains appareils et laisser l'élève saisir les routes statiques lui-même. Objectif pédagogique : `route_exists` déjà disponible.

- [ ] **Aperçu "vue élève" en temps réel** — split-screen dans le builder : le canevas à gauche, le rendu élève (simplifié) à droite, mis à jour en direct.

- [ ] **Bibliothèque de scénarios en ligne** — dépôt partagé (GitHub Pages) où les profs peuvent publier et récupérer des scénarios JSON. Bouton "Parcourir la bibliothèque" dans l'onglet 3.

---

## 🌐 Pédagogie réseau (nouvelles fonctionnalités simulées)

- [ ] **Table ARP animée** *(aussi dans priorité haute)* — voir ci-dessus.

- [ ] **Capture de trames (Wireshark simplifié)** — panneau `📡 Trames` dans le panneau bas, listant les échanges ARP / ICMP / DNS / HTTP en clair au fil des commandes. Très parlant pédagogiquement.

- [ ] **VLAN basique** — segmenter un switch en deux VLANs (access port / trunk). Objectif typique BTS SIO. Nécessite de modifier `cablePath` et `lanSeg`.

- [ ] **Pare-feu simple** — nouvel appareil `Firewall` avec règles allow/deny sur les ports (80, 53, etc.). Bloque certains `simPing` / `simHTTP` selon les règles.

- [ ] **Simulation de collision / CSMA-CD** — visualisation des collisions sur un hub (à distinguer d'un switch). Surtout utile pour les classes SNT/4e.

---

## 🔧 Technique et robustesse

- [ ] **Tests visuels automatisés** — Playwright ou Puppeteer pour tester le builder dans Chrome : drag & drop d'appareils, câblage, export SCORM, import scénario. Complète les 128 tests unitaires Node.

- [ ] **Validation JSON Schema** — schéma JSON Schema complet dans `validate.py` avec messages d'erreur explicites (champs manquants, types incorrects, IDs dupliqués).

- [ ] **Versionning des scénarios** — ajouter `minBuilderVersion` dans le JSON pour détecter les incompatibilités à l'import et avertir l'enseignant.

- [ ] **Export SCORM 2004 / H5P** — en plus de SCORM 1.2, supporter SCORM 2004 (xAPI) ou H5P pour une meilleure compatibilité LMS (Canvas, Chamilo, etc.).

---

## ✅ Déjà implémenté (pour mémoire)

| Fonctionnalité | Date |
|---|---|
| Simulation ping/DNS/HTTP/DHCP/WiFi/routage RIP | mai 2026 |
| Builder SCORM — 3 onglets, export ZIP | mai–juin 2026 |
| 14 types d'objectifs pédagogiques | juin 2026 |
| 7 types de pannes injectables | juin 2026 |
| Box WiFi (wifi_router) + liaisons WiFi | 15 juin 2026 |
| 128 tests unitaires (sim-tests.js) | 16 juin 2026 |
| Pipeline de vérification build.py | 16 juin 2026 |
| Undo/redo, copy/paste, multi-select | 4 juin 2026 |
| 3 scénarios clés-en-main (scenarios/) | 18 juin 2026 |
| Mode panne (applyFaults) | 18 juin 2026 |
| Documentation prof + élève v1.1 | 23 juin 2026 |
| Génération d'énoncé imprimable (PDF/print) | 23 juin 2026 |

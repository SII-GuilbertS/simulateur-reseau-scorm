# Simulateur Réseau IPv4 — SCORM Builder

Outil pédagogique standalone permettant de créer des activités de simulation réseau au format SCORM 1.2. L'enseignant conçoit une topologie réseau (appareils, câblage, adressage IP, WiFi, services), définit des objectifs évalués et des pannes à diagnostiquer, puis exporte un package SCORM ou un fichier HTML utilisable directement dans un navigateur ou via un LMS (Moodle, etc.).

---

## Fichiers

### Application principale

#### `scorm-builder.html`
Interface graphique complète du SCORM Builder. Fichier HTML **standalone** (aucune dépendance externe, aucune installation requise) qui embarque à la fois l'outil auteur pour l'enseignant et le moteur de simulation pour l'élève.

**Structure interne :**
- **SIM-ENGINE** — moteur réseau IPv4 (IP, masques, routage RIP, ping, DNS, HTTP, DHCP, WiFi)
- **EvalModule** — gestion des objectifs pédagogiques, du score SCORM et des pannes (mode panne)
- **GenModule** — génération des exports (ZIP SCORM et HTML standalone), import/export de scénarios JSON

**3 onglets builder :**

| Onglet | Rôle |
|--------|------|
| **1 Réseau** | Construire la topologie : appareils, câbles, adressage IP, WiFi, services |
| **2 Évaluation** | Définir les objectifs pédagogiques, les points, le score de maîtrise et les pannes à injecter |
| **3 Générer** | Exporter en SCORM (.zip) ou HTML standalone, importer/exporter un scénario JSON |

**Types d'appareils disponibles :** PC, Serveur (HTTP/DNS/DHCP), Switch, Routeur, Box WiFi, Internet, Cadre, Annotation texte.

**Utilisation :**
1. Ouvrir `scorm-builder.html` dans Chrome ou Firefox
2. Onglet **Réseau** : construire la topologie, configurer les IP et les services
3. Onglet **Évaluation** : ajouter les objectifs et les pannes
4. Onglet **Générer** : exporter le SCORM (Moodle) ou le HTML (test local)

**Raccourcis clavier :** `Ctrl+1/2/3` (onglets), `Ctrl+S` (sauvegarde session), `Suppr` (supprimer sélection), `F11` (plein écran).

---

### Tests unitaires

#### `sim-tests.js`
Suite de **128 tests unitaires** couvrant le moteur de simulation réseau. S'exécute avec Node.js sans navigateur, via un sandbox `vm.createContext()` qui extrait le code JS du `scorm-builder.html`.

**Suites couvertes :**
- Fonctions réseau de base : `ip2n`, `isValidUserIP`, `isValidUserMask`, `sameNet`, `netAddr`, `isRouter`, `lanSeg`, `cablePath`, `devByIP`
- Simulation applicative : `simPing` (LAN, WiFi, routé, internet), `simDNS`, `simHTTP`, `simDHCP`
- Routage : `getRoutingTable`, `autoRoute` (RIP simplifié)
- Évaluation : `checkObjectiveStatic` (10 types statiques), `checkDynamicObjective` (4 types dynamiques)
- Mode panne : `applyFaults` (7 types de pannes, formats plat et imbriqué)

```bash
node sim-tests.js
# ✅ 128/128 tests passés — SUCCÈS
```

---

### Scénarios prêts à l'emploi (`scenarios/`)

Trois scénarios JSON complets couvrant l'ensemble des 14 types d'objectifs et des 7 types de pannes. À charger via **Onglet 3 Générer → 📂 Importer un scénario**.

#### `scenarios/reseau-maison.json`
**Réseau Maison — Panne WiFi** — niveau 4e/3e

Topologie : Box WiFi (DHCP, SSID `WiFi-Maison`), Switch, PC-Bureau (câble), Laptop et Smartphone (WiFi).
Panne : mauvaise passerelle sur PC-Bureau (`192.168.99.1` au lieu de `192.168.1.1`).
10 objectifs — 100 points — seuil 60 %.

Objectifs couverts : `cable_exists`, `ssid_configured`, `service_active(dhcp)`, `ip_configured`, `gateway_configured`, `dns_configured`, `wifi_link`.

---

#### `scenarios/reseau-entreprise.json`
**Réseau Entreprise — Serveur Web et DNS en panne** — niveau Terminale/BTS

Topologie : Routeur, Switch LAN, 3 PC (Alice, Bob, Charlie), Serveur (HTTP + DNS désactivé).
Pannes : service DNS désactivé sur le Serveur + mauvaise passerelle sur PC-Bob.
13 objectifs — 100 points — seuil 60 %.

Objectifs couverts : `cable_exists`, `device_added`, `ip_configured`, `service_active`, `dns_record`, `gateway_configured`, `dns_configured`, `route_exists`, `ping_success`, `http_success`, `dns_success`.

---

#### `scenarios/reseau-lycee.json`
**Réseau Lycée — Diagnostic et réparation** — niveau Terminale NSI/BTS SIO

Topologie : Routeur-Principal, 2 Switches, PC-Salle1, PC-Salle2, Box-WiFi-Élèves (DHCP WiFi), Tablette-Élève, Serveur-DNS, Serveur-Web.
Pannes : IP incorrecte sur PC-Salle2 + SSID incorrect sur la Box WiFi.
17 objectifs — 100 points — seuil 65 %.

Objectifs couverts : **tous les 14 types** (`cable_exists`, `ssid_configured`, `service_active`, `wifi_link`, `ip_configured`, `gateway_configured`, `dns_configured`, `device_added`, `service_active`, `dns_record`, `route_exists`, `ping_success`, `http_success`, `dns_success`, `dhcp_success`).

---

#### `scenario-lycee-pasteur.json`
Scénario historique — réseau lycée Pasteur, 11 appareils, 9 liens, 9 objectifs, 100 points, seuil 60 %.

---

### Documentation

#### `doc-prof.pdf` / `doc-prof.docx`
Guide complet pour les **enseignants** : présentation, 3 onglets du builder, 14 types d'objectifs, mode panne, workflow en 7 étapes, import/export de scénarios, raccourcis clavier.

#### `doc-eleve.pdf` / `doc-eleve.docx`
Guide de prise en main pour les **élèves** : interface, modes Configuration/Simulation, commandes du terminal (`ping`, `ipconfig`, `nslookup`, `dhcp`, `http`, `traceroute`…), objectifs et score, exemple guidé, résolution de problèmes.

---

### Sources et outillage

| Fichier | Rôle |
|---------|------|
| `sim-engine.js` | Source du moteur réseau IPv4 (compilé dans scorm-builder.html) |
| `template-skeleton.html` | Squelette HTML du template élève |
| `template-extra.js` | JS spécifique au template élève (SCORM, applyFaults, renderActivityTab…) |
| `build.py` | Script de compilation : `python3 build.py --rebuild` |
| `sim-tests.js` | Suite de tests unitaires Node.js |
| `validate.py` | Validation des scénarios JSON |

**Modifier le moteur et régénérer :**
```bash
# 1. Éditer sim-engine.js ou template-extra.js ou template-skeleton.html
# 2. Recompiler
python3 build.py --rebuild
# 3. Vérifier les tests
node sim-tests.js
```

---

## Format JSON des scénarios

```json
{
  "version": 1,
  "createdAt": "2026-06-18T00:00:00.000Z",
  "teacherPwd": "prof",
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
        "points":10, "hint":"En mode Simulation : ping 192.168.1.100" }
    ],
    "faults": [
      { "id":1, "type":"bad_gateway", "dev":"PC-Alice", "badValue":"192.168.99.1" }
    ]
  }
}
```

**14 types d'objectifs disponibles :**

| Type | Catégorie | Paramètres |
|------|-----------|------------|
| `ping_success` | Simulation | `from`, `to` |
| `dns_success` | Simulation | `from`, `domain` |
| `http_success` | Simulation | `from`, `url` |
| `dhcp_success` | Simulation | `from` |
| `cable_exists` | Configuration | `devA`, `devB` |
| `wifi_link` | Configuration | `devA`, `devB` |
| `ip_configured` | Configuration | `dev`, `ip` |
| `gateway_configured` | Configuration | `dev`, `gateway` |
| `dns_configured` | Configuration | `dev`, `dns` |
| `service_active` | Configuration | `dev`, `service` (`http`/`dns`/`dhcp`) |
| `device_added` | Configuration | `newdev`, `type` |
| `ssid_configured` | Configuration | `dev`, `ssid` |
| `route_exists` | Configuration | `dev`, `dest` |
| `dns_record` | Configuration | `dev`, `domain`, `ip` |

**7 types de pannes (`faults`) :**

| Type | Effet | Paramètres |
|------|-------|------------|
| `bad_ip` | IP incorrecte injectée | `dev`, `badValue` |
| `bad_mask` | Masque incorrect | `dev`, `badValue` |
| `bad_gateway` | Passerelle incorrecte | `dev`, `badValue` |
| `bad_dns` | DNS incorrect | `dev`, `badValue` |
| `service_down` | Service désactivé | `dev`, `service` |
| `missing_cable` | Câble débranché | `devA`, `devB` |
| `ssid_wrong` | SSID WiFi incorrect | `dev`, `badValue` |

---

## Démarrage rapide

```bash
# Ouvrir le builder (double-clic ou :)
open scorm-builder.html          # macOS
start scorm-builder.html         # Windows

# Charger un scénario de démonstration
# → Onglet 3 Générer → 📂 Importer un scénario → scenarios/reseau-maison.json

# Lancer les tests unitaires
node sim-tests.js

# Recompiler après modification du moteur
python3 build.py --rebuild && node sim-tests.js
```

---

## 🧪 Guide testeur

**Prérequis :** Chrome ou Firefox récent. Aucune installation.

### Étape 1 — Tester le builder (côté enseignant)
1. Ouvrir `scorm-builder.html`
2. **Onglet Réseau** : ajouter des appareils, les câbler, configurer les IP
3. Importer un scénario : **Onglet 3 Générer → 📂 Importer** → `scenarios/reseau-maison.json`
4. Vérifier que les objectifs apparaissent dans l'**Onglet 2 Évaluation**
5. Exporter en HTML : **🧪 Exporter en HTML** et ouvrir le fichier téléchargé

### Étape 2 — Tester l'activité (côté élève)
1. Ouvrir le fichier HTML exporté
2. L'onglet **📋 Activité** en bas liste les objectifs à atteindre
3. Passer en mode Simulation et utiliser le terminal (`ping`, `ipconfig`, `nslookup`, `dhcp`)
4. Corriger les pannes en repassant en mode Configuration
5. Vérifier que le score progresse et que les objectifs se valident
6. Tester le mode enseignant : mot de passe `prof` (bouton discret en bas à droite)

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

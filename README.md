# Simulateur Réseau — SCORM Builder

Outil pédagogique permettant de créer des activités de simulation réseau au format SCORM 1.2. L'enseignant conçoit un réseau (topologie, adressage IP, services), définit des objectifs évalués, puis exporte un package SCORM ou un fichier HTML standalone utilisable directement par les élèves dans un navigateur ou via un LMS (Moodle, etc.).

---

## Fichiers

### Application principale

#### `scorm-builder.html`
Interface graphique complète du SCORM Builder. Fichier HTML standalone (aucune dépendance externe) qui contient à la fois l'outil auteur pour l'enseignant et le simulateur réseau pour l'élève.

**Structure interne :**
- **SimModule** — moteur de simulation réseau (IP, masques, routage, ping, DNS, HTTP, DHCP)
- **EvalModule** — gestion des objectifs pédagogiques et du score SCORM
- **GenModule** — génération des exports (ZIP SCORM et HTML standalone)
- **UI** — interface en 3 onglets : Réseau (topologie), Terminal (commandes), Activité (objectifs + export)

**Utilisation :**
1. Ouvrir dans un navigateur (double-clic sur le fichier)
2. Construire le réseau dans l'onglet **Réseau**
3. Définir les objectifs dans l'onglet **Activité**
4. Exporter via **📦 Générer le package SCORM** (ZIP pour LMS) ou **🧪 Exporter en HTML** (test local)

---

### Tests unitaires

#### `sim-tests.js`
Suite de 66 tests unitaires couvrant le moteur de simulation réseau. S'exécute avec Node.js, sans navigateur, grâce à un sandbox `vm.createContext()` qui isole le code JS extrait de `scorm-builder.html`.

**Suites de tests :**
- Fonctions réseau de base : `ip2n`, `isValidUserIP`, `isValidUserMask`, `sameNet`, `netAddr`, `isRouter`, `lanSeg`, `cablePath`, `devByIP`
- Simulation applicative : `simPing` (7 cas), `simDNS` (5 cas), `simHTTP` (4 cas), `simDHCP` (4 cas)
- Routage : `getRoutingTable`, `autoRoute`

**Utilisation :**
```bash
node sim-tests.js
```
Sortie attendue : `✅ 66 / 66 tests passed`

> **Prérequis :** le fichier attend `scorm2/index.html` dans le même répertoire. Adapter le chemin `SRC` en tête de fichier si nécessaire.

---

### Scénarios et réseaux de démonstration

#### `scenario-lycee-pasteur.json`
Scénario SCORM complet prêt à l'emploi, représentant le réseau d'un lycée fictif (Lycée Pasteur). Format complet incluant le réseau et l'activité pédagogique.

**Topologie :** 11 appareils, 9 liens
- Salle informatique : 192.168.1.0/24 — 3 PC élèves, Switch, Serveur Intranet (HTTP + DHCP), Serveur DNS
- Administration : 192.168.2.0/24 — PC Admin, PC Direction, Serveur Web, Switch
- Routeur Central reliant les deux sous-réseaux

**Activité :** *Réseau du Lycée Pasteur* (niveau Seconde / BTS SIO)
- 9 objectifs progressifs, 100 points au total, seuil de réussite à 60 %
- Mot de passe enseignant : `prof`
- Objectifs : câblage, DHCP, ping, HTTP, DNS, routage inter-réseaux

**Utilisation :** dans le SCORM Builder → onglet **Activité** → bouton **📂 Importer un scénario**

---

#### `demo-reseau-complet-network.json`
Réseau de démonstration avancé avec 15 appareils et 14 liens. Format réseau seul (sans activité pédagogique), généré en session de travail précédente. Inclut des métadonnées visuelles (positions, badges, annotations textuelles).

**Utilisation :** dans le SCORM Builder → onglet **Réseau** → **📂 Importer**

---

#### `reseau-simple.json`
Réseau de taille intermédiaire avec 11 appareils et 10 liens. Format réseau seul, utilisé comme base de tests lors du développement.

**Utilisation :** dans le SCORM Builder → onglet **Réseau** → **📂 Importer**

---

#### `reseau-2026-04-02.json`
Réseau simple avec 7 appareils et 6 liens, sauvegarde de session du 2 avril 2026. Utile comme point de départ pour une activité légère ou comme exemple minimaliste.

**Utilisation :** dans le SCORM Builder → onglet **Réseau** → **📂 Importer**

---

### Documentation

#### `doc-prof.pdf` / `doc-prof.docx`
Documentation complète destinée aux **enseignants**. Explique l'ensemble des fonctionnalités du SCORM Builder avec mockups d'interface.

**Contenu :**
- Présentation de l'outil et prérequis
- Description détaillée des 3 onglets (Réseau, Terminal, Activité)
- Tableau des 9 types d'objectifs pédagogiques disponibles
- Workflow de création d'une activité en 7 étapes
- Format JSON des scénarios et exemples de configuration
- Raccourcis clavier

**Formats :** PDF (lecture/impression) et DOCX (édition/adaptation)

---

#### `doc-eleve.pdf` / `doc-eleve.docx`
Documentation destinée aux **élèves**. Guide de prise en main du simulateur réseau côté étudiant.

**Contenu :**
- Présentation de l'interface et prise en main rapide
- Référence des 10 commandes du terminal réseau (`ping`, `ipconfig`, `nslookup`, `http`, `dhcp`, etc.)
- Configuration manuelle d'une adresse IP, masque, passerelle, DNS
- Compréhension des objectifs et du score
- Exemple guidé pas-à-pas (7 étapes)
- Résolution des problèmes courants

**Formats :** PDF (distribution aux élèves) et DOCX (personnalisation par l'enseignant)

---

### Plugin

#### `simulateur-reseau-activite.skill`
Fichier de skill Cowork (archive ZIP) permettant à Claude d'utiliser le SCORM Builder comme outil auteur piloté par IA. Contient les instructions, prompts et configurations nécessaires à l'agent.

**Utilisation :** installable directement depuis l'interface Cowork via **Plugins → Installer depuis un fichier**

---

## Formats de fichiers JSON

### Format réseau seul (`devs`, `links`, `nid`)
```json
{
  "version": "1.0",
  "nid": 10,
  "devs": { "d1": { "type": "pc", "label": "PC1", "ip": "192.168.1.10", ... } },
  "links": { "l1": { "a": "d1", "b": "d2" } }
}
```

### Format scénario complet
```json
{
  "version": "1.1",
  "createdAt": "2026-...",
  "teacherPwd": "prof",
  "network": { "devs": {...}, "links": {...}, "nid": 12 },
  "activity": {
    "title": "...", "level": "...", "masteryscore": 60,
    "objectives": [ { "type": "ping_success", "points": 10, ... } ]
  }
}
```

---

## Démarrage rapide

```bash
# 1. Ouvrir l'outil auteur
open scorm-builder.html          # macOS
start scorm-builder.html         # Windows

# 2. Lancer les tests unitaires
node sim-tests.js

# 3. Charger le scénario de démonstration
# → dans le builder : onglet Activité → 📂 Importer → scenario-lycee-pasteur.json
```

---

## 🧪 Guide testeur — Participation aux tests académiques

Merci de prendre le temps de tester cet outil et de remonter vos observations !

**Prérequis :** un navigateur récent suffit (Chrome, Firefox, Edge). Aucune installation requise.

---

### Étape 1 — Tester l'outil auteur (côté enseignant)

1. Ouvrir `scorm-builder.html` dans votre navigateur
2. **Onglet Réseau** : ajouter quelques appareils (PC, switch, routeur), les relier avec des câbles, configurer leurs adresses IP. Vérifier que la topologie s'affiche correctement.
3. **Onglet Terminal** : cliquer sur un appareil et tester les commandes `ipconfig`, `ping <ip>`, `nslookup <domaine>`, `http <ip>`. Vérifier les réponses de la simulation.
4. **Onglet Activité** : charger le scénario de démonstration (**📂 Importer un scénario** → `scenario-lycee-pasteur.json`). Parcourir les objectifs générés. Modifier le mot de passe enseignant.
5. **Export HTML** : cliquer sur **🧪 Exporter en HTML** — ouvrir le fichier `.html` téléchargé dans un nouvel onglet et vérifier que l'activité se lance correctement.
6. *(Optionnel)* **Export SCORM** : cliquer sur **📦 Générer le package SCORM** et vérifier que le ZIP se télécharge.

---

### Étape 2 — Tester l'activité côté élève

1. Depuis le fichier HTML exporté à l'étape précédente, ou depuis `scorm-builder.html` en mode élève :
2. Réaliser les objectifs dans l'ordre (câblage, DHCP, ping, HTTP, DNS, routage inter-réseaux)
3. Vérifier que le score progresse correctement
4. Tester le **mode enseignant** avec le mot de passe `prof` (bouton discret en bas à droite)
5. Vérifier l'affichage sur différentes tailles d'écran (PC fixe, laptop, éventuellement tablette)

---

### Étape 3 — Signaler vos retours par e-mail

Envoyez vos observations à : **sylvain.guilbert1@ac-toulouse.fr**

**Objet du mail :** `[TEST SIMULATEUR] Retour - <votre établissement>`

Merci d'indiquer pour chaque retour :

```
Navigateur utilisé : (ex. Chrome 124, Firefox 126...)
OS : (Windows 10/11, macOS, Linux...)
Fichier testé : (scorm-builder.html / fichier HTML exporté)

--- BUG ---
Description : ce qui s'est passé
Étapes pour reproduire : 1. ... 2. ... 3. ...
Comportement attendu : ...
Comportement observé : ...

--- SUGGESTION ---
Fonctionnalité souhaitée / amélioration :

--- AVIS GÉNÉRAL ---
Note globale (1 à 5) :
Points forts :
Points à améliorer :
```

Toutes les remontées, même courtes, sont précieuses. Merci pour votre contribution !

#!/usr/bin/env python3
"""Génération doc-prof.pdf et doc-eleve.pdf
Usage :
  python3 tools/gen_docs.py         # génère les deux PDFs dans docs/
  python3 tools/build.py --docs     # même chose via le pipeline build.py
"""
import pathlib, sys
sys.stdout.reconfigure(encoding='utf-8')

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (CondPageBreak, 
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

W, H = A4
MARGIN = 2*cm

# ── Couleurs ─────────────────────────────────────────────────────────────────
NAVY   = colors.HexColor('#1a365d')
RED    = colors.HexColor('#e94560')
BLUE   = colors.HexColor('#2b6cb0')
LGRAY  = colors.HexColor('#f0f4f8')
MGRAY  = colors.HexColor('#e2e8f0')
DGRAY  = colors.HexColor('#4a5568')
WHITE  = colors.white
LGREEN = colors.HexColor('#f0fff4')
LRED   = colors.HexColor('#fff5f5')
GREEN  = colors.HexColor('#2f855a')
DGREEN = colors.HexColor('#1a4731')

# ── Styles ────────────────────────────────────────────────────────────────────
SS = getSampleStyleSheet()

def mkstyle(name, **kw):
    base = kw.pop('parent', 'Normal')
    return ParagraphStyle(name, parent=SS[base], **kw)

BODY   = mkstyle('Body',  fontName='Helvetica', fontSize=9.5, leading=14, alignment=TA_JUSTIFY, spaceAfter=6)
BODY_L = mkstyle('BodyL', fontName='Helvetica', fontSize=9.5, leading=14, alignment=TA_LEFT,    spaceAfter=4)
H1     = mkstyle('H1',    fontName='Helvetica-Bold', fontSize=14, leading=18, textColor=NAVY, spaceBefore=16, spaceAfter=8)
H2     = mkstyle('H2',    fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=BLUE, spaceBefore=12, spaceAfter=6)
MONO   = mkstyle('Mono',  fontName='Courier', fontSize=8.5, leading=12, textColor=DGRAY)
CELL   = mkstyle('Cell',  fontName='Helvetica', fontSize=8.8, leading=12)
CELL_B = mkstyle('CellB', fontName='Helvetica-Bold', fontSize=8.8, leading=12)
INFO   = mkstyle('Info',  fontName='Helvetica', fontSize=8.8, leading=13,
                 textColor=colors.HexColor('#2b4c7e'), backColor=colors.HexColor('#ebf4ff'))
WARN   = mkstyle('Warn',  fontName='Helvetica', fontSize=8.8, leading=13,
                 textColor=colors.HexColor('#742a2a'), backColor=LRED)
TIP    = mkstyle('Tip',   fontName='Helvetica', fontSize=8.8, leading=13,
                 textColor=colors.HexColor('#1a4731'), backColor=LGREEN)

CONTENT_W = W - 2*MARGIN

def hr():
    return HRFlowable(width=CONTENT_W, thickness=1.5, color=MGRAY, spaceAfter=6, spaceBefore=4)

def callout(text, style=INFO, icon='ℹ'):
    tbl = Table([[Paragraph(f'<b>{icon}</b> {text}', style)]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0,0),(-1,-1), style.backColor),
        ('BOX',           (0,0),(-1,-1), 1, colors.HexColor('#bee3f8')),
        ('TOPPADDING',    (0,0),(-1,-1), 6),
        ('BOTTOMPADDING', (0,0),(-1,-1), 6),
        ('LEFTPADDING',   (0,0),(-1,-1), 10),
        ('RIGHTPADDING',  (0,0),(-1,-1), 10),
    ]))
    return tbl

def table_obj(rows, col_widths):
    ts = TableStyle([
        ('FONTNAME',      (0,0),(-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',      (0,0),(-1,-1), 8.5),
        ('LEADING',       (0,0),(-1,-1), 12),
        ('BACKGROUND',    (0,0),(-1, 0), NAVY),
        ('TEXTCOLOR',     (0,0),(-1, 0), WHITE),
        ('ROWBACKGROUNDS',(0,1),(-1,-1), [WHITE, LGRAY]),
        ('GRID',          (0,0),(-1,-1), 0.5, MGRAY),
        ('TOPPADDING',    (0,0),(-1,-1), 5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 5),
        ('LEFTPADDING',   (0,0),(-1,-1), 8),
        ('RIGHTPADDING',  (0,0),(-1,-1), 8),
        ('VALIGN',        (0,0),(-1,-1), 'TOP'),
    ])
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(ts)
    return t

def workflow_table(rows):
    ts = TableStyle([
        ('FONTNAME',      (0,0),(0,-1), 'Helvetica-Bold'),
        ('FONTNAME',      (1,0),(1,-1), 'Helvetica-Bold'),
        ('FONTSIZE',      (0,0),(-1,-1), 8.8),
        ('LEADING',       (0,0),(-1,-1), 13),
        ('ROWBACKGROUNDS',(0,0),(-1,-1), [WHITE, LGRAY]),
        ('BOX',           (0,0),(-1,-1), 1, MGRAY),
        ('INNERGRID',     (0,0),(-1,-1), 0.5, MGRAY),
        ('TOPPADDING',    (0,0),(-1,-1), 6),
        ('BOTTOMPADDING', (0,0),(-1,-1), 6),
        ('LEFTPADDING',   (0,0),(-1,-1), 8),
        ('RIGHTPADDING',  (0,0),(-1,-1), 8),
        ('ALIGN',         (0,0),(0,-1), 'CENTER'),
        ('BACKGROUND',    (0,0),(0,-1), NAVY),
        ('TEXTCOLOR',     (0,0),(0,-1), WHITE),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
    ])
    t = Table(rows, colWidths=[22*mm, 55*mm, CONTENT_W-77*mm])
    t.setStyle(ts)
    return t

# ── Templates de page ─────────────────────────────────────────────────────────
def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, H*0.42, W, H*0.58, fill=1, stroke=0)
    canvas.setFillColor(RED)
    canvas.rect(0, H*0.42, W, 4*mm, fill=1, stroke=0)
    canvas.setFillColor(RED)
    canvas.roundRect(W/2-28*mm, H*0.62, 56*mm, 8*mm, 3*mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE); canvas.setFont('Helvetica-Bold', 9)
    canvas.drawCentredString(W/2, H*0.622+1.5*mm, doc._badge)
    canvas.setFillColor(WHITE); canvas.setFont('Helvetica-Bold', 34)
    canvas.drawCentredString(W/2, H*0.55, doc._title)
    canvas.setFont('Helvetica', 14)
    canvas.drawCentredString(W/2, H*0.50, 'SCORM Builder — Simulateur Réseau IPv4')
    canvas.setFillColor(BLUE); canvas.setFont('Helvetica-Oblique', 10.5)
    canvas.drawCentredString(W/2, H*0.455, doc._tagline)
    canvas.setFillColor(colors.HexColor('#f7f9fc'))
    canvas.rect(0, 0, W, H*0.42, fill=1, stroke=0)
    canvas.setStrokeColor(MGRAY); canvas.setLineWidth(1)
    canvas.line(MARGIN, H*0.20, W-MARGIN, H*0.20)
    canvas.setFillColor(DGRAY); canvas.setFont('Helvetica', 9)
    canvas.drawCentredString(W/2, H*0.225, f'Simulateur Réseau IPv4  |  {doc._subtitle}')
    canvas.setFont('Helvetica-Oblique', 8.5)
    canvas.setFillColor(colors.HexColor('#718096'))
    canvas.drawCentredString(W/2, H*0.195, doc._subnote)
    canvas.restoreState()

def page_template(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(doc._hdr_color)
    canvas.rect(0, H-14*mm, W, 14*mm, fill=1, stroke=0)
    canvas.setFillColor(doc._hdr_accent)
    canvas.rect(0, H-14.8*mm, W, 1.2*mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE); canvas.setFont('Helvetica-Bold', 8.5)
    canvas.drawString(MARGIN, H-9.5*mm, '■ Simulateur Réseau IPv4')
    canvas.setFont('Helvetica', 8.5)
    canvas.drawRightString(W-MARGIN, H-9.5*mm, doc._headertitle)
    canvas.setStrokeColor(MGRAY); canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 14*mm, W-MARGIN, 14*mm)
    canvas.setFillColor(colors.HexColor('#718096')); canvas.setFont('Helvetica', 7.5)
    canvas.drawCentredString(W/2, 8*mm, f'Page {doc.page}')
    canvas.restoreState()

# ══════════════════════════════════════════════════════════════════════════════
#  DOC PROF  v1.9.1
# ══════════════════════════════════════════════════════════════════════════════
def build_prof(out_path):
    doc = SimpleDocTemplate(out_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN+5*mm, bottomMargin=MARGIN+3*mm)
    doc._badge       = 'Mode Constructeur'
    doc._title       = 'Guide Enseignant'
    doc._tagline     = 'Créer et déployer des activités réseau sur Moodle'
    doc._subtitle    = 'Documentation v1.9.1'
    doc._subnote     = 'Outil pédagogique pour l\'enseignement des réseaux informatiques'
    doc._headertitle = 'Guide Enseignant'
    doc._hdr_color   = NAVY
    doc._hdr_accent  = RED

    story = [Paragraph(' ', BODY), PageBreak()]

    # 1. Présentation
    story += [
        Paragraph('1. Présentation de l\'outil', H1), hr(),
        Paragraph(
            'Le <b>SCORM Builder</b> est un outil standalone (fichier HTML unique) permettant de '
            'concevoir des activités réseau pour vos élèves, de les configurer avec des objectifs '
            'pédagogiques évalués et des pannes à diagnostiquer, puis de les exporter en package '
            'SCORM 1.2 prêt à être déposé dans Moodle. Il fonctionne entièrement dans votre navigateur, '
            'sans installation ni connexion internet.',
            BODY),
        callout('Ouvrez simplement scorm-builder.html dans Chrome ou Firefox. '
                'Aucune dépendance externe n\'est requise pour construire le réseau et configurer l\'évaluation.'),
        Spacer(1, 8),
    ]

    # 2. Les trois onglets
    story += [Paragraph('2. Les trois onglets du Builder', H1), hr()]

    story += [
        Paragraph('2.1 Onglet 1 — Construire le réseau', H2),
        Paragraph(
            'La palette propose quatre modèles de terminaux — <b>PC fixe</b> (câble), <b>PC portable</b> '
            '(câble et WiFi), <b>Téléphone</b> et <b>Tablette</b> (WiFi uniquement) — ainsi que '
            '<b>Serveur</b>, <b>Switch</b>, <b>Routeur</b>, <b>Box WiFi</b> (routeur WiFi avec DHCP intégré), '
            '<b>Internet</b> et l\'outil <b>Câble</b>. Chaque appareil apparaît sous forme de carte '
            'illustrée. Faites glisser les appareils sur le canevas, puis configurez '
            'leurs propriétés (IP, masque, passerelle, DNS, services HTTP/DNS/DHCP, SSID WiFi) '
            'dans le panneau de droite.',
            BODY),
        callout('<b>Ce réseau devient le réseau de départ de l\'activité élève.</b>', INFO, '■'),
        Paragraph('• Outil <b>Câble</b> : cliquez sur deux appareils pour les relier (le pointeur prend la forme '
                  'du câble). <b>Échap</b> revient à l\'outil Sélection depuis n\'importe quel outil ; <b>Suppr</b> '
                  'efface l\'appareil, le câble, le cadre ou le texte sélectionné.', BODY_L),
        Paragraph('• Liaison WiFi : utilisez la <b>Box WiFi</b> et reliez-la aux PC.', BODY_L),
        Paragraph('• <b>Ctrl+Z / Ctrl+Y</b> : annuler / rétablir. <b>Ctrl+C / Ctrl+V</b> : copier / coller un appareil.', BODY_L),
        Paragraph('• <b>Ctrl+S</b> : sauvegarder la session dans le navigateur.', BODY_L),
        Paragraph('• Le <b>score</b> en haut à droite est <b>celui de l\'élève</b> : le réseau du builder est le '
                  'corrigé, mais les pannes de l\'onglet 2 sont appliquées pour le calcul. Une activité bien '
                  'construite affiche 0 à l\'import ; les commandes de test lancées dans le terminal (ping, '
                  'nslookup, navigateur) ajoutent leurs points.', BODY_L),
        Paragraph('• <b>Figer le départ</b> mémorise le réseau actuel comme état de départ '
                  '(fait automatiquement à l\'import d\'un scénario). <b>Réinitialiser</b> y revient après vos '
                  'essais : appareils et câbles ajoutés supprimés, éléments supprimés remis, configurations '
                  'restaurées, objectifs remis à zéro. Les positions sont conservées ; Ctrl+Z annule.', BODY_L),
        Paragraph('• <b>Routage</b> : le ping suit les tables de routage à l\'aller et au retour, comme sur un vrai '
                  'réseau. Les routes RIP sont recalculées automatiquement (y compris une route par défaut vers '
                  'Internet) ; un routeur dont le routage automatique est décoché n\'apprend aucune route et ne '
                  'communique qu\'avec ses réseaux directs. Une adresse privée que personne ne porte est inconnue.', BODY_L),
        callout('L\'export reprend le réseau affiché : après avoir testé vos corrections, '
                'cliquez sur <b>Réinitialiser</b> avant d\'exporter.', WARN, '⚠'),
        Spacer(1, 6),
    ]

    story += [
        Paragraph('2.2 Onglet 2 — Configurer l\'évaluation', H2),
        Paragraph(
            'Définissez le titre, le niveau scolaire, le score de maîtrise et le mode d\'affichage. '
            'Ajoutez des <b>objectifs</b> (chacun associé à un type de vérification et un nombre de '
            'points) et des <b>pannes</b> à injecter silencieusement dans le réseau de départ.',
            BODY),
        Paragraph('• Objectifs (pastille <b>bleue</b> numérotée) et pannes (pastille <b>rouge</b> P1, P2…) '
                  'forment <b>une seule liste</b>, avec les deux boutons d\'ajout en haut. Réordonnez-la '
                  'en glissant la poignée à gauche de la carte ou avec les flèches <b>▲ ▼</b> : l\'élève voit les objectifs '
                  'dans cet ordre. Une panne sans description est désignée par son type et l\'appareil visé.', BODY_L),
        Paragraph('• Sous chaque objectif, un <b>aperçu</b> indique s\'il est atteint sur le réseau actuel et '
                  'avertit s\'il l\'est déjà dans le réseau remis à l\'élève (points gagnés sans rien faire).', BODY_L),
        Paragraph('• <b>Le score suit le réseau</b> : un objectif n\'est acquis que tant que sa condition reste vraie. '
                  'Si l\'élève casse sa configuration, il perd les points ; un ping, une résolution DNS ou une page '
                  'web réussis sont revérifiés à chaque modification. La note transmise à Moodle est donc '
                  'celle du réseau final.', BODY_L),
        Paragraph('• <b>Postes à ajouter par l\'élève</b> : un objectif « Poste ajouté » nommé rend ce poste '
                  'disponible dans les listes d\'appareils des objectifs placés en dessous (ping depuis ce poste, '
                  'câble, adresse…).', BODY_L),
        Paragraph('<b>14 types d\'objectifs disponibles :</b>', H2),
    ]

    obj_rows = [
        ['Type', 'Libellé', 'Description'],
        ['ping_success',       'Ping réussi',        'Vérifie qu\'un ping entre deux appareils aboutit.'],
        ['dns_success',        'Résolution DNS',      'Vérifie qu\'un nom de domaine est résolu.'],
        ['http_success',       'Accès HTTP',          'Vérifie l\'accès à une page web par IP ou hostname.'],
        ['dhcp_success',       'Attribution DHCP',    'Vérifie qu\'un appareil obtient une IP via DHCP.'],
        ['cable_exists',       'Câble existant',      'Vérifie qu\'un câble relie deux appareils nommés.'],
        ['wifi_link',          'Liaison WiFi',        'Vérifie qu\'une liaison WiFi existe.'],
        ['ip_configured',      'IP configurée',       'Vérifie l\'IP d\'un appareil : exacte, dans une plage ou au choix.'],
        ['gateway_configured', 'Passerelle',          'Vérifie la passerelle : exacte, plage ou routeur du réseau.'],
        ['dns_configured',     'DNS configuré',       'Vérifie le DNS : adresse exacte ou adresse d\'un serveur.'],
        ['service_active',     'Service actif',       'Vérifie qu\'un service HTTP/DNS/DHCP est activé.'],
        ['device_added',       'Poste ajouté',        'Vérifie qu\'un appareil est présent ou a été ajouté, et sa configuration.'],
        ['ssid_configured',    'SSID WiFi',           'Vérifie que la Box WiFi diffuse le bon SSID.'],
        ['route_exists',       'Route existante',     'Vérifie une entrée dans la table de routage.'],
        ['dns_record',         'Enregistrement DNS',  'Vérifie qu\'un nom pointe vers une IP, ou vers l\'adresse d\'un serveur.'],
    ]
    cw = [44*mm, 36*mm, CONTENT_W-80*mm]
    rows_p = [[Paragraph(r[0], MONO if i>0 else CELL_B),
               Paragraph(r[1], CELL_B if i==0 else CELL),
               Paragraph(r[2], CELL)] for i, r in enumerate(obj_rows)]
    story.append(table_obj(rows_p, cw))
    story.append(Spacer(1, 10))

    story += [
        Paragraph('2.2.1 Adresses : niveau d\'exigence', H2),
        Paragraph(
            'Devant chaque champ d\'adresse d\'un objectif, un menu fixe ce qui est accepté. '
            'Pour une construction avec plan d\'adressage, laissez l\'élève choisir dans une plage '
            'plutôt qu\'imposer une adresse unique.',
            BODY),
    ]
    lvl_rows = [
        ['Niveau', 'Exemple', 'Accepté'],
        ['Exacte',            '192.168.1.10',     'Cette adresse seulement.'],
        ['Plage',             '192.168.1.10-50',  'Une adresse libre de la plage : ni adresse du réseau, ni diffusion, ni déjà prise.'],
        ['Au choix (*)',      '192.168.1.*',      'Une adresse libre de ce réseau, mêmes règles.'],
        ['Routeur du réseau', 'passerelle',       'L\'adresse d\'un routeur ou d\'une box du même réseau, joignable.'],
        ['L\'adresse de…',    'Srv-DNS',          'L\'adresse actuelle de cet appareil (ping, DNS, enregistrement DNS).'],
        ['Peu importe',       '—',                'Aucune condition sur ce champ.'],
    ]
    lw = [36*mm, 34*mm, CONTENT_W-70*mm]
    story.append(table_obj([[Paragraph(r[0], CELL_B), Paragraph(r[1], MONO if i>0 else CELL_B),
                             Paragraph(r[2], CELL)] for i, r in enumerate(lvl_rows)], lw))
    story += [
        Spacer(1, 6),
        Paragraph('• Le builder signale un ping, un DNS ou un enregistrement qui vise en dur une adresse '
                  'laissée au choix de l\'élève : choisissez alors « L\'adresse de… ».', BODY_L),
        Paragraph('• <b>Contrainte affichée à l\'élève</b> : sous chaque objectif, une phrase générée à partir '
                  'des paramètres (« PC1 : adresse IP au choix entre 192.168.1.10 et 192.168.1.50 ») apparaît '
                  'dans l\'activité et dans l\'énoncé. Elle est affichée par défaut pour une plage ou une '
                  'adresse au choix, masquée pour une valeur exacte, qui donnerait la réponse. Vous pouvez la '
                  'reformuler ou la compléter : le builder signale si les paramètres changent ensuite.', BODY_L),
        Spacer(1, 6),
    ]

    story += [
        Paragraph('2.2.2 Mode panne — Injecter des erreurs', H2),
        Paragraph(
            'La section <b>Pannes</b> injecte des erreurs silencieuses dans le réseau de départ. '
            'Les élèves doivent les identifier et les corriger pour valider les objectifs.',
            BODY),
    ]
    fault_rows = [
        ['Type', 'Effet', 'Paramètres'],
        ['bad_ip',       'IP incorrecte',      'appareil + valeur incorrecte'],
        ['bad_mask',     'Masque incorrect',   'appareil + valeur incorrecte'],
        ['bad_gateway',  'Passerelle fausse',  'appareil + valeur incorrecte'],
        ['bad_dns',      'DNS incorrect',      'appareil + valeur incorrecte'],
        ['service_down', 'Service désactivé',  'appareil + service (http/dns/dhcp)'],
        ['missing_cable','Câble débranché',    'appareil A + appareil B'],
        ['ssid_wrong',   'SSID incorrect',     'Box WiFi + valeur incorrecte'],
    ]
    fw = [40*mm, 46*mm, CONTENT_W-86*mm]
    frows_p = [[Paragraph(r[0], MONO if i>0 else CELL_B),
                Paragraph(r[1], CELL), Paragraph(r[2], CELL)] for i, r in enumerate(fault_rows)]
    story.append(table_obj(frows_p, fw))
    story.append(Spacer(1, 6))

    story += [
        Paragraph('2.3 Onglet 3 — Générer le package', H2),
        Paragraph(
            'Définissez le <b>mot de passe professeur</b> (déverrouille le mode enseignant côté élève), '
            'puis choisissez votre format d\'export.',
            BODY),
        Paragraph('■ <b>Package SCORM (.zip)</b> — À importer dans Moodle. Remonte la note automatiquement.', BODY_L),
        Paragraph('■ <b>HTML standalone</b> — Fichier .html unique, ouvrable directement dans Chrome/Firefox. '
                  'Une fois en ligne, il peut être ouvert par un lien ou affiché dans une iframe. '
                  'Dans ce cas, la note n\'est pas transmise à la plateforme : utilisez le package SCORM pour cela.', BODY_L),
        Paragraph('■ <b>Énoncé imprimable</b> — Page HTML avec topologie SVG, liste des objectifs et zone élève '
                  '(Nom/Classe/Score). Bouton Imprimer intégré, optimisé A4. Il contient un <b>plan d\'adressage</b> '
                  'à compléter, construit à partir des objectifs d\'adressage : une ligne par appareil, regroupée '
                  'par salle, où chaque case reprend la contrainte de l\'objectif ou reste à remplir. Une case de '
                  'l\'onglet le retire.', BODY_L),
        Paragraph('■ <b>Corrigé enseignant</b> — Le même document, plan d\'adressage rempli avec les adresses du '
                  'réseau du builder, vérifiées avec les règles d\'évaluation. À ne pas distribuer.', BODY_L),
        Paragraph('■ <b>Aperçu élève</b> — Ouvre l\'activité dans un nouvel onglet avec les données actuelles du builder.', BODY_L),
        Spacer(1, 4),
    ]

    story += [
        Paragraph('2.4 Nouvelle activité et variantes', H2),
        Paragraph(
            'Le bouton <b>Nouvelle activité</b>, en haut du builder, crée une activité complète à partir d\'un '
            'modèle : réseau, objectifs, pannes, barème et consignes. Choisissez le type, le thème et le niveau ; '
            'l\'aperçu montre la liste ordonnée et le résultat d\'une vérification automatique. Tout reste '
            'modifiable ensuite dans les onglets 1 et 2.',
            BODY),
    ]
    wz_rows = [
        ['Choix', 'Options', 'Effet'],
        ['Type', 'Construction', 'L\'élève ajoute un poste, le câble, configure IP, passerelle et DNS ; un test suit chaque étape.'],
        ['', 'Dépannage', 'Deux à quatre pannes, chacune suivie de sa réparation puis d\'un objectif « Test : ».'],
        ['', 'Découverte', 'Réseau fonctionnel, exploré avec ping, nslookup, DHCP et le navigateur.'],
        ['Thème', 'Maison', 'Box WiFi, PC fixes, portable et smartphone en WiFi.'],
        ['', 'Entreprise', 'Routeur, postes de bureau, serveur intranet (DNS et web).'],
        ['', 'Salle de classe', 'Routeur, postes élèves, Serveur-Données pour les profils ; l\'ENT est hébergé sur Internet.'],
        ['Niveau', 'Collège', 'Valeurs données, contraintes affichées, seuil 50 %.'],
        ['', 'Lycée', 'Adresse à choisir dans une plage, passerelle « routeur du réseau », seuil 60 %.'],
        ['', 'BTS / Terminale', 'Adresses libres, contraintes masquées, deux réseaux routés, seuil 70 %.'],
    ]
    story.append(table_obj([[Paragraph(r[0], CELL_B), Paragraph(r[1], CELL_B if i == 0 else CELL),
                             Paragraph(r[2], CELL)] for i, r in enumerate(wz_rows)],
                           [24*mm, 34*mm, CONTENT_W-58*mm]))
    story += [
        Spacer(1, 6),
        callout('La vérification contrôle trois points : <b>0 point à l\'ouverture</b>, seuil impossible à atteindre '
                'sans rien réparer ni construire, et chaque objectif atteignable une fois le travail fait. En dépannage, '
                '<b>Autres appareils</b> tire d\'autres postes en panne.', TIP, '💡'),
        Paragraph(
            'Le bouton <b>Variante</b> décline l\'activité en cours (scénario fourni, importé ou créé par '
            'l\'assistant) sans toucher au réseau :',
            BODY),
        Paragraph('• <b>Plus guidée</b> : contraintes affichées sous les objectifs d\'adressage, seuil abaissé de 10 points.', BODY_L),
        Paragraph('• <b>Plus exigeante</b> : adresses exactes laissées au choix quand rien d\'autre ne les utilise, '
                  'passerelle « routeur du réseau », contraintes et indices masqués, seuil relevé de 10 points.', BODY_L),
        Paragraph('• <b>Pannes sur d\'autres appareils</b> : la réparation et ses tests suivent, adresses et libellés compris. '
                  '<b>Une de moins</b> retire la dernière panne avec sa réparation et ses tests ; <b>une de plus</b> en ajoute '
                  'une sur un poste à adresse fixe, avec sa réparation et son test.', BODY_L),
        callout('La variante remplace l\'activité en cours : exportez d\'abord le scénario (bouton de la fenêtre) '
                'pour garder les deux versions. Ce qui ne peut pas changer est signalé.', WARN, '⚠'),
        Spacer(1, 4),
    ]

    # 3. Scénarios
    story += [
        CondPageBreak(60*mm),
        Paragraph('3. Scénarios prêts à l\'emploi', H1), hr(),
        Paragraph(
            'Quatre scénarios JSON complets sont fournis dans le dossier <b>scenarios/</b>. '
            'Chargez-les via <b>Onglet 3 → 📂 Importer un scénario</b>.',
            BODY),
    ]
    sc_rows = [
        ['Fichier', 'Titre', 'Niveau', 'Obj. / Seuil'],
        ['scenarios/reseau-maison.json',    'Réseau Maison — Panne WiFi',           '4e / 3e',       '7 / 60%'],
        ['scenarios/reseau-college.json',   'Réseau du collège — Adressage par salle', 'Collège',    '8 / 60%'],
        ['scenarios/reseau-entreprise.json','Réseau Entreprise — Serveur en panne', 'Term. / BTS',   '7 / 60%'],
        ['scenarios/reseau-lycee.json',     'Réseau Lycée — Diagnostic complet',    'NSI / BTS SIO', '21 / 65%'],
    ]
    sw = [58*mm, 52*mm, 24*mm, CONTENT_W-134*mm]
    srows_p = [[Paragraph(r[0], MONO if i>0 else CELL_B),
                Paragraph(r[1], CELL), Paragraph(r[2], CELL), Paragraph(r[3], CELL)]
               for i, r in enumerate(sc_rows)]
    story.append(table_obj(srows_p, sw))
    story += [
        Spacer(1, 6),
        callout('Tous les scénarios démarrent à 0 : chaque point se gagne en réparant, en construisant ou en le prouvant '
                'par une commande. Chaque réparation est suivie de son test (« Test : » ping, site web ou nslookup), '
                'et chaque panne est placée juste avant sa réparation dans la liste. '
                'reseau-lycee.json couvre les <b>14 types d\'objectifs</b>.', TIP, '💡'),
        Spacer(1, 4),
        Paragraph('Conseil pour vos propres activités : faites suivre chaque objectif de réparation ou de '
                  'construction d\'un objectif de test, pour que l\'élève prouve que sa correction fonctionne.', BODY),
        Spacer(1, 4),
    ]

    # 4. Workflow
    story += [Paragraph('4. Workflow complet', H1), hr()]
    wf_p = [[Paragraph(r[0], CELL_B), Paragraph(r[1], CELL_B), Paragraph(r[2], CELL)] for r in [
        ['1', 'Ouvrir le Builder',        'Double-cliquez sur scorm-builder.html dans Chrome ou Firefox.'],
        ['2', 'Construire le réseau',     'Onglet 1 : appareils, câbles, IP — ou Nouvelle activité pour partir d\'un modèle.'],
        ['3', 'Configurer l\'évaluation', 'Onglet 2 : objectifs, pannes, score de maîtrise.'],
        ['4', 'Générer',                  'Onglet 3 : SCORM, HTML, énoncé imprimable et son corrigé.'],
        ['5', 'Tester',                   'Corriger le réseau puis Réinitialiser, ou bouton "Aperçu élève".'],
        ['6', 'Déployer sur Moodle',      'Importez le .zip SCORM dans votre cours.'],
        ['7', 'Sauvegarder le scénario',  'Onglet 3 → Exporter le scénario (.json) pour réutiliser.'],
    ]]
    story.append(workflow_table(wf_p))
    story.append(Spacer(1, 8))

    # 5. Raccourcis
    story += [Paragraph('5. Raccourcis clavier', H1), hr()]
    kb_rows = [
        ['Raccourci', 'Action'],
        ['Ctrl+1 / 2 / 3', 'Naviguer entre les onglets'],
        ['Ctrl+S',          'Sauvegarder la session'],
        ['Ctrl+Z / Ctrl+Y', 'Annuler / Rétablir'],
        ['Ctrl+C / Ctrl+V', 'Copier / Coller un appareil sélectionné'],
        ['Échap',           'Revenir à l\'outil Sélection (annule un câble en cours)'],
        ['Suppr',           'Supprimer l\'appareil, le câble, le cadre ou le texte sélectionné'],
        ['F11',             'Basculer en plein écran'],
    ]
    kb_p = [[Paragraph(r[0], MONO if i>0 else CELL_B), Paragraph(r[1], CELL)]
            for i, r in enumerate(kb_rows)]
    story.append(table_obj(kb_p, [45*mm, CONTENT_W-45*mm]))
    story.append(Spacer(1, 8))

    # 6. Licence
    story += [
        Paragraph('6. Licence', H1), hr(),
        Paragraph(
            'L\'outil est réservé aux usages non commerciaux. Le code est sous licence '
            '<b>PolyForm Noncommercial 1.0.0</b>, qui autorise l\'usage par les établissements d\'enseignement '
            'et les institutions publiques. Ce guide et les scénarios fournis sont sous licence <b>CC BY-NC-SA 4.0</b>.',
            BODY),
        Paragraph(
            'Les activités exportées embarquent le moteur et restent soumises à la licence du code : '
            'conservez la mention de copyright qu\'elles contiennent. '
            'Le contenu que vous créez avec l\'outil vous appartient.',
            BODY),
    ]

    doc.build(story, onFirstPage=cover_page, onLaterPages=page_template)
    print(f'✓  {out_path}')


# ══════════════════════════════════════════════════════════════════════════════
#  DOC ELEVE  v1.9.1
# ══════════════════════════════════════════════════════════════════════════════
def build_eleve(out_path):
    doc = SimpleDocTemplate(out_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN+5*mm, bottomMargin=MARGIN+3*mm)
    doc._badge       = 'Mode Simulation'
    doc._title       = 'Guide Élève'
    doc._tagline     = 'Apprendre les réseaux en simulant les protocoles TCP/IP'
    doc._subtitle    = 'Guide élève v1.9.1'
    doc._subnote     = 'Activité pédagogique — Lycée'
    doc._headertitle = 'Guide Élève'
    doc._hdr_color   = DGREEN
    doc._hdr_accent  = GREEN

    def cover_eleve(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(DGREEN)
        canvas.rect(0, H*0.42, W, H*0.58, fill=1, stroke=0)
        canvas.setFillColor(GREEN)
        canvas.rect(0, H*0.42, W, 4*mm, fill=1, stroke=0)
        canvas.setFillColor(GREEN)
        canvas.roundRect(W/2-28*mm, H*0.62, 56*mm, 8*mm, 3*mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE); canvas.setFont('Helvetica-Bold', 9)
        canvas.drawCentredString(W/2, H*0.622+1.5*mm, doc._badge)
        canvas.setFillColor(WHITE); canvas.setFont('Helvetica-Bold', 38)
        canvas.drawCentredString(W/2, H*0.545, 'Guide Élève')
        canvas.setFont('Helvetica', 14)
        canvas.drawCentredString(W/2, H*0.50, 'Simulateur Réseau IPv4')
        canvas.setFillColor(GREEN); canvas.setFont('Helvetica-Oblique', 10.5)
        canvas.drawCentredString(W/2, H*0.455, doc._tagline)
        canvas.setFillColor(colors.HexColor('#f7f9fc'))
        canvas.rect(0, 0, W, H*0.42, fill=1, stroke=0)
        canvas.setStrokeColor(MGRAY); canvas.setLineWidth(1)
        canvas.line(MARGIN, H*0.20, W-MARGIN, H*0.20)
        canvas.setFillColor(DGRAY); canvas.setFont('Helvetica', 9)
        canvas.drawCentredString(W/2, H*0.225, f'Simulateur Réseau IPv4  |  {doc._subtitle}')
        canvas.setFont('Helvetica-Oblique', 8.5)
        canvas.setFillColor(colors.HexColor('#718096'))
        canvas.drawCentredString(W/2, H*0.195, doc._subnote)
        canvas.restoreState()

    story = [Paragraph(' ', BODY), PageBreak()]

    # 1. Prise en main
    story += [
        Paragraph('1. Prise en main du simulateur', H1), hr(),
        Paragraph(
            'L\'interface se compose de trois zones : le <b>canevas réseau</b> (centre) avec les '
            'appareils et les câbles, le <b>panneau de propriétés</b> (droite, en mode Configuration) '
            'pour configurer les appareils, et l\'<b>onglet 📋 Activité</b> (bas, toujours visible) '
            'qui affiche vos objectifs et votre score.',
            BODY),
        Paragraph('<b>Les deux modes :</b>', H2),
        Paragraph('• <b>Mode Configuration</b> — Modifiez le réseau : appareils, câbles, adresses IP.', BODY_L),
        Paragraph('• <b>Mode Simulation</b> — Appareils sous tension. Cliquez pour ouvrir le terminal.', BODY_L),
        callout('En mode Simulation, vous ne pouvez plus modifier le réseau. '
                'Repassez en Configuration pour câbler ou reconfigurer.', WARN, '⚠'),
        Spacer(1, 6),
    ]

    # 2. Terminal
    story += [
        Paragraph('2. Le terminal — commandes disponibles', H1), hr(),
        Paragraph(
            'En mode Simulation, cliquez sur un PC ou Serveur pour ouvrir son terminal. '
            'Tapez la commande et appuyez sur <b>Entrée</b>. Utilisez ↑ / ↓ pour l\'historique.',
            BODY),
    ]
    cmd_rows = [
        ['Commande', 'Description', 'Exemple'],
        ['ping',       'Ping vers une IP ou un nom.',               'ping 192.168.1.1'],
        ['nslookup',   'Résout un nom de domaine en IP.',            'nslookup web.ecole.fr'],
        ['dhcp',       'Demande une IP automatique.',                'dhcp'],
        ['traceroute', 'Affiche le chemin réseau.',                  'traceroute 8.8.8.8'],
        ['ifconfig',   'Affiche la configuration IP.',              'ifconfig'],
        ['route',      'Affiche la table de routage.',              'route'],
        ['arp',        'Affiche la table ARP (IP ↔ MAC).',         'arp'],
        ['clear',      'Efface le terminal.',                        'clear'],
        ['help',       'Liste toutes les commandes.',               'help'],
    ]
    cw_cmd = [25*mm, 70*mm, CONTENT_W-95*mm]
    cmd_p = [[Paragraph(r[0], MONO if i>0 else CELL_B),
              Paragraph(r[1], CELL),
              Paragraph(r[2], MONO if i>0 else CELL_B)] for i, r in enumerate(cmd_rows)]
    story.append(table_obj(cmd_p, cw_cmd))
    story.append(Spacer(1, 4))
    story.append(Paragraph('Pour accéder à une page web, utilisez l\'onglet <b>Navigateur</b> du panneau du bas.', BODY))
    story.append(Spacer(1, 8))

    # 3. Configurer les IP
    story += [
        Paragraph('3. Configurer les adresses IP', H1), hr(),
        Paragraph(
            'En <b>mode Configuration</b>, cliquez sur un appareil pour afficher ses propriétés '
            'dans le panneau de droite :',
            BODY),
    ]
    ip_rows = [
        ['Champ', 'Exemple', 'Description'],
        ['Adresse IP',           '192.168.1.10',  'Identifiant unique de l\'appareil sur le réseau.'],
        ['Masque de sous-réseau','255.255.255.0',  'Délimite la partie réseau et la partie hôte.'],
        ['Passerelle (Gateway)', '192.168.1.254',  'Adresse du routeur pour sortir du réseau local.'],
        ['DNS',                  '192.168.1.1',    'Serveur qui traduit les noms de domaine en IP.'],
    ]
    ip_p = [[Paragraph(r[0], CELL_B if i==0 else CELL_B),
             Paragraph(r[1], CELL_B if i==0 else MONO),
             Paragraph(r[2], CELL_B if i==0 else CELL)] for i, r in enumerate(ip_rows)]
    story.append(table_obj(ip_p, [40*mm, 36*mm, CONTENT_W-76*mm]))
    story += [
        callout('Pour obtenir une IP automatiquement (si un serveur DHCP est présent sur le réseau) : cochez '
                '« Obtenir l\'adresse IP automatiquement (DHCP) » dans la fiche du poste, cliquez sur '
                '<b>Demander une adresse (DHCP)</b>, ou tapez la commande <b>dhcp</b> dans le terminal.', INFO, '■'),
        Spacer(1, 8),
    ]

    # 4. Objectifs
    story += [
        Paragraph('4. Les objectifs et le score', H1), hr(),
        Paragraph(
            'L\'onglet <b>📋 Activité</b> en bas liste vos tâches. Il est <b>toujours visible</b>, '
            'quel que soit le mode. Chaque objectif validé ajoute des points à votre score.',
            BODY),
        Paragraph('• ✅ <b>Objectif validé</b> — condition remplie, points attribués.', BODY_L),
        Paragraph('• ⭕ <b>Non validé</b> — vérifiez câblage et configuration IP.', BODY_L),
        Paragraph('• 📐 Sous certains objectifs, une <b>contrainte</b> précise ce qui est attendu, par exemple '
                  'une adresse à choisir dans une plage.', BODY_L),
        callout('Un objectif reste validé tant que le réseau le permet : si vous modifiez ensuite '
                'un réglage qui le casse, vous perdez ses points (message « Objectif perdu »). '
                'Votre note est celle du réseau à la fin de l\'activité.', WARN, '⚠'),
        Spacer(1, 4),
        Paragraph('Si votre énoncé contient un <b>plan d\'adressage</b>, complétez-le avant de configurer '
                  'les appareils : il vous sert de référence pendant la réalisation.', BODY),
        callout('Le score est automatiquement transmis à Moodle à la fermeture de l\'activité.', INFO, '■'),
        Spacer(1, 8),
    ]

    # 5. Exemple guidé
    story += [
        Paragraph('5. Exemple guidé : configurer un réseau simple', H1), hr(),
    ]
    ex_p = [[Paragraph(r[0], CELL_B), Paragraph(r[1], CELL_B), Paragraph(r[2], CELL)] for r in [
        ['Étape 1', 'Mode Configuration',   'Cliquez sur CONFIG en haut à droite.'],
        ['Étape 2', 'Vérifier le câblage',  'PC → Switch → Serveur.'],
        ['Étape 3', 'Configurer le Serveur','IP : 192.168.1.1 / Masque : 255.255.255.0'],
        ['Étape 4', 'Configurer le PC',     'IP : 192.168.1.10 / Masque : 255.255.255.0'],
        ['Étape 5', 'Mode Simulation',      'Cliquez sur SIMU en haut à droite.'],
        ['Étape 6', 'Tester',               'Ouvrez le terminal du PC : ping 192.168.1.1'],
        ['Étape 7', 'Vérifier',             '✅ apparaît dans l\'onglet Activité si le ping réussit.'],
    ]]
    story.append(workflow_table(ex_p))
    story.append(Spacer(1, 8))

    # 6. Dépannage
    story += [Paragraph('6. En cas de problème', H1), hr()]
    for title, desc in [
        ('Le ping échoue',
         'Lisez la cause affichée sous le ping. <b>Hôte inconnu</b> : aucun appareil n\'a cette adresse. '
         '<b>Pas de route vers… sur un routeur</b> : ce routeur ne connaît pas le réseau visé (vérifiez les '
         'adresses des routeurs et la commande route). <b>La réponse ne revient pas</b> : l\'aller arrive, mais '
         'l\'appareil visé ne sait pas répondre (sa passerelle, ou une route manquante au retour). Sinon, vérifiez '
         'que les deux appareils sont dans le même sous-réseau, ou qu\'une passerelle est configurée pour sortir '
         'du réseau local. La commande traceroute montre le chemin suivi.'),
        ('DNS ne résout pas',
         'Vérifiez que l\'adresse DNS du PC pointe vers un Serveur ayant le service DNS activé '
         'et que l\'enregistrement du domaine est configuré.'),
        ('DHCP échoue',
         'Assurez-vous qu\'une Box WiFi ou un Serveur sur le même segment LAN a le service DHCP activé.'),
        ('WiFi non connecté',
         'Vérifiez que le SSID de la Box WiFi est correct et qu\'une liaison WiFi relie votre appareil.'),
        ('L\'objectif ne se valide pas',
         'Relisez l\'intitulé et vérifiez chaque paramètre (IP, masque, passerelle, DNS). '
         'Pour les objectifs de simulation, lancez la commande dans le terminal (ping, nslookup, dhcp) '
         'ou ouvrez le site dans l\'onglet Navigateur (HTTP).'),
    ]:
        p = story[-1] if False else Paragraph(f'<font color="#2b6cb0"><b>■ {title}</b></font>', H2)
        story.append(p)
        story.append(Paragraph(desc, BODY))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        'Ce guide est sous licence CC BY-NC-SA 4.0 et le simulateur sous licence PolyForm Noncommercial 1.0.0.',
        BODY))

    doc.build(story, onFirstPage=cover_eleve, onLaterPages=page_template)
    print(f'✓  {out_path}')


# ══════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    docs = pathlib.Path(__file__).resolve().parent.parent / 'docs'
    build_prof(str(docs / 'doc-prof.pdf'))
    build_eleve(str(docs / 'doc-eleve.pdf'))
    print('Docs générés.')

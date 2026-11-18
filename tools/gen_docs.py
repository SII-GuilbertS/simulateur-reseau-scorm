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
CELL_HW = mkstyle('CellHW', fontName='Helvetica-Bold', fontSize=8.8, leading=12, textColor=WHITE)
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

def on_navy(cell):
    # Une cellule sur fond bleu marine : TEXTCOLOR du tableau ne s'applique pas aux Paragraph.
    return Paragraph(cell.text, CELL_HW) if isinstance(cell, Paragraph) else cell

def table_obj(rows, col_widths):
    rows = [[on_navy(c) for c in rows[0]]] + list(rows[1:])
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
    rows = [[on_navy(r[0])] + list(r[1:]) for r in rows]
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
#  DOC PROF  v2.1
# ══════════════════════════════════════════════════════════════════════════════
def build_prof(out_path):
    doc = SimpleDocTemplate(out_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN+5*mm, bottomMargin=MARGIN+3*mm)
    doc._badge       = 'Mode Constructeur'
    doc._title       = 'Guide Enseignant'
    doc._tagline     = 'Créer et déployer des activités réseau sur Moodle'
    doc._subtitle    = 'Documentation v2.1'
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

    # 2. L'interface
    story += [Paragraph('2. L\'interface du Builder', H1), hr()]

    story += [
        Paragraph(
            'Le builder (« Atelier Réseau ») tient dans une seule fenêtre : une <b>barre</b> en haut, le <b>schéma</b> '
            'au centre, la <b>fiche</b> de l\'appareil sélectionné à droite et un <b>bandeau</b> en bas.',
            BODY),
        Paragraph('• La barre porte le bouton <b>Menu</b> (Nouvelle activité, Nouveau, Ouvrir, Enregistrer, Variante, les exports, '
                  'les options d\'export, Tester comme élève, plein écran), les boutons <b>Annuler</b> et <b>Rétablir</b>, '
                  'les trois <b>vues</b> du schéma (Conception, Départ élève, Test) et une <b>pastille d\'état</b>.', BODY_L),
        Paragraph('• Le bandeau du bas se replie d\'un clic. En vue Conception, il a quatre onglets : <b>Évaluation</b> '
                  '(l\'activité, les objectifs et les pannes), <b>Contrôle</b> (le contrôle du corrigé), <b>Journal</b> et '
                  '<b>Paquets</b>.', BODY_L),
        Paragraph('2.1 Construire le réseau (vue Conception)', H2),
        Paragraph(
            'La palette propose quatre modèles de terminaux — <b>PC fixe</b> (câble), <b>PC portable</b> '
            '(câble et WiFi), <b>Téléphone</b> et <b>Tablette</b> (WiFi uniquement) — ainsi que '
            '<b>Serveur</b>, <b>Switch</b>, <b>Routeur</b>, <b>Box WiFi</b> (routeur WiFi avec DHCP intégré), '
            '<b>Internet</b>, et en tête l\'outil <b>Liaison</b>. Chaque appareil apparaît sous forme de carte '
            'illustrée. Faites glisser les appareils sur le schéma, puis configurez '
            'leurs propriétés (nom, adresse IP, masque, passerelle, DNS) '
            'dans la fiche, à droite.',
            BODY),
        callout("<b>Ce réseau est le corrigé : le réseau qui fonctionne.</b> L'élève le reçoit avec les pannes du "
                "bandeau Évaluation, et sans les appareils que vous marquez « à ajouter par l'élève ».", INFO, '■'),
        Paragraph("• <b>Clic</b> sur un appareil : sa fiche s'ouvre à droite (nom, adresse IP, masque, passerelle, DNS). "
                  "<b>Double-clic</b> : son <b>bureau</b> s'ouvre dans une fenêtre, avec ses applications : Invite de "
                  "commandes, Navigateur, Paramètres réseau, WiFi, et selon l'appareil Serveur web, Serveur DNS, "
                  "Serveur DHCP, Administration de la box, Routage. Les services (web, DNS, DHCP, WiFi de la box) se "
                  "règlent dans le bureau ; la fiche en affiche seulement l'état.", BODY_L),
        Paragraph('• Outil <b>Liaison</b> : cliquez sur deux appareils pour les relier ; l\'outil crée un câble ou une '
                  'liaison WiFi selon les appareils (le pointeur prend la forme du câble). <b>Échap</b> revient à l\'outil '
                  'Sélection depuis n\'importe quel outil ; <b>Suppr</b> efface l\'appareil, la liaison, le cadre ou le texte '
                  'sélectionné.', BODY_L),
        Paragraph('• Liaison WiFi : utilisez la <b>Box WiFi</b> et reliez-la aux PC. Comme une vraie box, elle relie '
                  'ses clients WiFi et les postes câblés de son côté LAN (switch compris) ; son port WAN reste séparé.', BODY_L),
        Paragraph('• <b>Connexion WiFi</b> : la fiche d\'un terminal relié en WiFi a une section « Connexion WiFi » '
                  '(réseau choisi et mot de passe). La liaison ne transporte rien, en pointillé rouge, tant que le SSID '
                  'n\'est pas celui de la box ou que le mot de passe est faux ; ping, dhcp et ipconfig l\'expliquent. '
                  'Dans le builder, une liaison tracée reçoit le SSID et le mot de passe de la box, et changer ceux de la '
                  'box met à jour ses terminaux. Chez l\'élève, le mot de passe est à saisir (il figure dans la fiche de la box).', BODY_L),
        Paragraph('• <b>Case DHCP d\'un poste</b> : la cocher met de côté l\'adresse, le masque, la passerelle et le DNS '
                  'saisis (ignorés tant que le DHCP est coché) ; la décocher les remet en place. Ce qui est mis de côté '
                  'n\'est pas transmis à l\'élève.', BODY_L),
        Paragraph('• <b>Ctrl+Z / Ctrl+Y</b> : annuler / rétablir. <b>Ctrl+C / Ctrl+V</b> : copier / coller un appareil.', BODY_L),
        Paragraph("• <b>À ajouter par l'élève</b> : cochez cette case sur la fiche d'un appareil pour que l'élève ait à "
                  "l'ajouter lui-même. L'appareil reste dans votre corrigé, avec ses câbles et ses réglages (pastille "
                  "verte « + » sur le schéma), mais il est retiré du réseau que reçoit l'élève et de son énoncé.", BODY_L),
        Paragraph('• <b>Routage</b> : le ping suit les tables de routage à l\'aller et au retour, comme sur un vrai '
                  'réseau. Voir le paragraphe 2.5 sur les routes RIP et les routes statiques. Une adresse privée que '
                  'personne ne porte est inconnue.', BODY_L),
        Paragraph('• <b>Fichiers vérifiés</b> : un scénario abîmé ou incomplet est refusé à l\'import, avec la '
                  'raison ; le réseau en cours est conservé. Côté élève, si la plateforme refuse d\'enregistrer '
                  'le réseau, un message l\'en avertit et le travail reste gardé sur le poste.', BODY_L),
        Paragraph('• <b>Ouverture et fermeture</b> : le builder s\'ouvre toujours <b>vierge</b>. Un travail se reprend avec '
                  '<b>Ouvrir</b> (fichier scénario .json) et se garde avec <b>Enregistrer</b>, dans le bouton Menu. Si vous fermez '
                  'l\'onglet sans avoir enregistré vos dernières modifications, le navigateur vous prévient. Les exports '
                  'SCORM, HTML et énoncé ne remplacent pas cet enregistrement.', BODY_L),
        Paragraph('2.1.1 Trois vues du schéma', H2),
        Paragraph("Trois boutons, dans la barre, montrent le même réseau sous trois angles. Les exports partent "
                  "toujours du corrigé, quelle que soit la vue affichée.", BODY),
    ]
    view_rows = [
        ['Vue', 'Ce que vous voyez', 'Ce que vous y faites'],
        ['Conception', 'Le réseau qui fonctionne (le corrigé).',
         "Tout se règle ici. Le terminal et le navigateur servent à vérifier le réseau ; aucun point ne s'y gagne."],
        ['Départ élève', "Ce que l'élève trouve à l'ouverture : le corrigé avec les pannes (pastilles rouges P1, P2…), "
         "sans les appareils à ajouter.", 'Lecture seule : vous contrôlez le point de départ.'],
        ['Test', 'La même copie de départ.',
         "Vous jouez l'élève : diagnostic, réparations, tests. Le score (barre verte) est celui qu'il obtiendrait ; "
         "« Repartir de zéro » remet le réseau et le score au départ. Le test est conservé quand vous changez de vue, "
         "tant que l'activité n'a pas changé."],
    ]
    story.append(table_obj([[Paragraph(r[0], CELL_B), Paragraph(r[1], CELL_B if i == 0 else CELL),
                             Paragraph(r[2], CELL_B if i == 0 else CELL)] for i, r in enumerate(view_rows)],
                           [26*mm, 62*mm, CONTENT_W-88*mm]))
    story += [
        Spacer(1, 6),
        Paragraph('2.1.2 Contrôle du corrigé', H2),
        Paragraph("En vue Conception, la pastille de la barre n'affiche pas de score mais l'état de votre corrigé : "
                  "<b>Corrigé complet</b> (tous les objectifs sont vérifiés), <b>N vérifiés · M à vérifier en Test</b> "
                  "(ce que l'élève doit encore construire), <b>N non atteignables</b> ou <b>N pannes à revoir</b>. Un clic "
                  "ouvre l'onglet <b>Contrôle</b> du bandeau, une ligne par objectif :", BODY),
        Paragraph("• <b>Dans le corrigé</b> : l'objectif est-il réalisé dans votre réseau ? Les objectifs à commande "
                  "(ping, nslookup, page web, DHCP) sont rejoués automatiquement ; en cas d'échec, la raison est "
                  "indiquée. Le bouton « Voir dans le terminal » rejoue la commande dans le bureau du poste.", BODY_L),
        Paragraph("• <b>Au départ élève</b> : « à faire (panne P1) » quand une panne le casse, « déjà acquis à "
                  "l'ouverture » quand l'élève gagnerait les points sans rien faire, « réussit déjà » pour une "
                  "commande qui passe sans réparation.", BODY_L),
        Paragraph("• <b>Pannes à revoir</b> : une panne qui ne change rien (valeur identique au corrigé, service "
                  "déjà arrêté, câble absent, appareil inconnu ou à ajouter par l'élève) est signalée.", BODY_L),
        callout("Le contrôle résume le départ de l'élève : points acquis à l'ouverture (0 pour une activité bien "
                "construite), objectifs atteignables, seuil qui ne doit pas être atteint sans rien réparer.", TIP, '💡'),
        Spacer(1, 6),
    ]

    story += [
        Paragraph('2.2 Configurer l\'évaluation (bandeau Évaluation)', H2),
        Paragraph(
            'L\'onglet <b>Évaluation</b> du bandeau (vue Conception, raccourci <b>Ctrl+2</b>) définit le titre, la '
            'description du public visé, le score de maîtrise et le mode d\'affichage. '
            'Ajoutez des <b>objectifs</b> (chacun associé à un type de vérification et un nombre de '
            'points) et des <b>pannes</b> à injecter silencieusement dans le réseau de départ. '
            'La colonne « Activité » se redimensionne à la souris.',
            BODY),
        Paragraph('• Objectifs (pastille <b>bleue</b> numérotée) et pannes (pastille <b>rouge</b> P1, P2…) '
                  'forment <b>une seule liste</b>, avec les deux boutons d\'ajout en haut. Réordonnez-la '
                  'en glissant la poignée à gauche de la carte ou avec les flèches <b>▲ ▼</b> : l\'élève voit les objectifs '
                  'dans cet ordre. La description d\'une panne est pré-remplie (type et appareil visé) et modifiable.', BODY_L),
        Paragraph('• <b>Indice</b> : chaque objectif a un indice, affiché à l\'élève sous l\'objectif tant qu\'il n\'est '
                  'pas atteint. Il est proposé selon le type d\'objectif, ses appareils et la panne qu\'il répare '
                  '(« Outil Liaison : reliez PC-Bureau à Switch-Salon », ou « ipconfig est bon mais rien ne passe ? '
                  'Regardez les câbles de PC-Bureau » quand une panne débranche ce câble). Il suit l\'objectif et les '
                  'pannes tant que vous ne le réécrivez pas ; le bouton à droite du champ revient à la proposition, un champ vide supprime l\'indice.', BODY_L),
        Paragraph('• Sous chaque objectif, un <b>aperçu</b> indique s\'il est atteint sur le réseau actuel et '
                  'avertit s\'il l\'est déjà dans le réseau remis à l\'élève (points gagnés sans rien faire).', BODY_L),
        Paragraph('• <b>Le score suit le réseau</b> : un objectif n\'est acquis que tant que sa condition reste vraie. '
                  'Si l\'élève casse sa configuration, il perd les points ; un ping, une résolution DNS ou une page '
                  'web réussis sont revérifiés à chaque modification. La note transmise à Moodle est donc '
                  'celle du réseau final.', BODY_L),
        Paragraph("• <b>Postes à ajouter par l'élève</b> : le bouton « + Appareil à ajouter » pose un poste marqué à "
                  "ajouter (annulable) et crée l'objectif « Poste ajouté » à son nom. Vous pouvez aussi cocher « À ajouter "
                  "par l'élève » sur la fiche d'un appareil existant. Les objectifs placés en dessous peuvent s'appuyer sur "
                  "lui (ping depuis ce poste, câble, adresse…), et le contrôle du corrigé les vérifie. Sans la case, le "
                  "poste est donné à l'élève : le contrôle le signale.", BODY_L),
        Paragraph('<b>14 types d\'objectifs disponibles :</b>', H2),
    ]

    obj_rows = [
        ['Type', 'Libellé', 'Description'],
        ['ping_success',       'Ping réussi',        'Vérifie qu\'un ping entre deux appareils aboutit.'],
        ['dns_success',        'Résolution DNS',      'Vérifie qu\'un nom de domaine est résolu.'],
        ['http_success',       'Accès HTTP',          'Vérifie l\'accès à une page web par IP ou hostname.'],
        ['dhcp_success',       'Attribution DHCP',    'Vérifie qu\'un appareil obtient une IP via DHCP.'],
        ['cable_exists',       'Câble existant',      'Vérifie qu\'un câble relie deux appareils nommés.'],
        ['wifi_link',          'Liaison WiFi',        'Vérifie qu\'une liaison WiFi relie deux appareils et que le terminal est connecté (SSID et mot de passe).'],
        ['ip_configured',      'IP configurée',       'Vérifie l\'IP d\'un appareil : exacte, dans une plage ou au choix.'],
        ['gateway_configured', 'Passerelle',          'Vérifie la passerelle : exacte, plage ou routeur du réseau.'],
        ['dns_configured',     'DNS configuré',       'Vérifie le DNS : adresse exacte ou adresse d\'un serveur.'],
        ['service_active',     'Service actif',       'Vérifie qu\'un service HTTP/DNS/DHCP est activé.'],
        ['device_added',       'Poste ajouté',        'Vérifie qu\'un appareil est présent ou a été ajouté, et sa configuration.'],
        ['ssid_configured',    'SSID WiFi',           'Vérifie que la Box WiFi diffuse le bon SSID.'],
        ['route_exists',       'Route existante',     'Vérifie une entrée dans la table de routage d\'un routeur, et son routeur suivant si demandé.'],
        ['dns_record',         'Enregistrement DNS',  'Vérifie qu\'un nom pointe vers une IP, ou vers l\'adresse d\'un serveur.'],
    ]
    cw = [44*mm, 36*mm, CONTENT_W-80*mm]
    rows_p = [[Paragraph(r[0], MONO if i>0 else CELL_B),
               Paragraph(r[1], CELL_B if i==0 else CELL),
               Paragraph(r[2], CELL)] for i, r in enumerate(obj_rows)]
    story.append(table_obj(rows_p, cw))
    story.append(Spacer(1, 10))

    story += [
        CondPageBreak(75*mm),
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
        Paragraph("• <b>Points si l'élève la répare</b> : une panne se note comme un objectif. Donnez-lui des points "
                  "et, si vous le souhaitez, un libellé affiché à l'élève ; la réparation est mesurée sur la valeur du "
                  "corrigé (sur un poste en DHCP, sur son réseau). Aucun objectif n'est à créer pour cela. Si vous "
                  "avez déjà écrit un objectif de réparation pour cette panne, c'est lui qui compte.", BODY_L),
        Paragraph("• Pour faire prouver la réparation, ajoutez après la panne un objectif de test (ping, page web, "
                  "nslookup).", BODY_L),
    ]
    fault_rows = [
        ['Type', 'Effet', 'Paramètres'],
        ['bad_ip',       'IP incorrecte',      'appareil + valeur incorrecte'],
        ['bad_mask',     'Masque incorrect',   'appareil + valeur incorrecte'],
        ['bad_gateway',  'Passerelle fausse',  'appareil + valeur incorrecte'],
        ['bad_dns',      'DNS incorrect',      'appareil + valeur incorrecte'],
        ['service_down', 'Service désactivé',  'appareil + service (http/dns/dhcp)'],
        ['missing_cable','Câble débranché',    'appareil A + appareil B'],
        ['ssid_wrong',   'SSID incorrect',     'Box WiFi + valeur incorrecte (ses terminaux se déconnectent)'],
        ['wifi_pass_wrong','Mot de passe WiFi faux','terminal WiFi + valeur incorrecte'],
        ['route_missing','Route manquante',   'routeur + réseau de la route (route statique retirée)'],
        ['bad_route',    'Mauvais routeur suivant', 'routeur + réseau + valeur incorrecte (route statique)'],
        ['routing_off',  'RIP désactivé',      'routeur (calcul automatique arrêté, routes apprises perdues)'],
    ]
    fw = [40*mm, 46*mm, CONTENT_W-86*mm]
    frows_p = [[Paragraph(r[0], MONO if i>0 else CELL_B),
                Paragraph(r[1], CELL), Paragraph(r[2], CELL)] for i, r in enumerate(fault_rows)]
    story.append(table_obj(frows_p, fw))
    story.append(Spacer(1, 6))

    story += [
        CondPageBreak(55*mm),
        Paragraph('2.3 Exporter (bouton Menu)', H2),
        Paragraph(
            'Les exports sont dans le bouton Menu ; la fenêtre <b>Options d\'export</b> résume l\'activité '
            'et règle le plan d\'adressage de l\'énoncé. Quel que soit le format, l\'export part du réseau corrigé.',
            BODY),
        Paragraph('■ <b>Package SCORM (.zip)</b> — À importer dans Moodle. Remonte la note automatiquement.', BODY_L),
        Paragraph('■ <b>HTML standalone</b> — Fichier .html unique, ouvrable directement dans Chrome/Firefox. '
                  'Une fois en ligne, il peut être ouvert par un lien ou affiché dans une iframe. '
                  'Dans ce cas, la note n\'est pas transmise à la plateforme : utilisez le package SCORM pour cela.', BODY_L),
        Paragraph('■ <b>Énoncé imprimable</b> — Page HTML avec topologie SVG, liste des objectifs et zone élève '
                  '(Nom/Classe/Score). Bouton Imprimer intégré, optimisé A4. Il contient un <b>plan d\'adressage</b> '
                  'à compléter, construit à partir des objectifs d\'adressage : une ligne par appareil, regroupée '
                  'par salle, où chaque case reprend la contrainte de l\'objectif ou reste à remplir. Une case des '
                  'options d\'export le retire.', BODY_L),
        Paragraph('■ <b>Corrigé enseignant</b> — Le même document, plan d\'adressage rempli avec les adresses du '
                  'réseau du builder, vérifiées avec les règles d\'évaluation. À ne pas distribuer.', BODY_L),
        Paragraph('■ <b>Tester comme élève</b> — Ouvre l\'activité dans un nouvel onglet avec les données actuelles du builder '
                  '(la vue Test joue l\'élève sans quitter le builder).', BODY_L),
        Paragraph('Le bouton Menu enregistre et rouvre le scénario (.json). La page élève n\'a plus de mode enseignant ni de '
                  'mot de passe : le scénario seul porte l\'activité.', BODY_L),
        Spacer(1, 4),
    ]

    story += [
        CondPageBreak(95*mm),
        Paragraph('2.4 Nouvelle activité et variantes', H2),
        Paragraph(
            'Le bouton Menu propose <b>Nouvelle activité</b> : elle crée une activité complète à partir d\'un '
            'modèle (réseau, objectifs, pannes, barème et consignes). Choisissez le type, le thème et la difficulté ; '
            'l\'aperçu montre la liste ordonnée et le résultat d\'une vérification automatique. Tout reste '
            'modifiable ensuite sur le schéma et dans le bandeau Évaluation.',
            BODY),
    ]
    wz_rows = [
        ['Choix', 'Options', 'Effet'],
        ['Type', 'Construction', 'L\'élève ajoute un poste (et, en Maison, une tablette en WiFi), le câble, configure IP, passerelle et DNS ; un test suit chaque étape. Le poste est posé dans le corrigé, coché « à ajouter ».'],
        ['', 'Dépannage', 'Deux à quatre pannes, chacune suivie de sa réparation puis d\'un objectif « Test : ».'],
        ['', 'Découverte', 'Réseau fonctionnel, exploré avec ping, nslookup, DHCP et le navigateur.'],
        ['', 'Réseau Internet', 'Plusieurs réseaux reliés par des routeurs, serveur web et DNS au bout : routage RIP ou statique, pannes de routage.'],
        ['Thème', 'Maison', 'Box WiFi, PC fixes, portable et smartphone en WiFi.'],
        ['', 'Entreprise', 'Routeur, postes de bureau, serveur intranet (DNS et web).'],
        ['', 'Salle de classe', 'Routeur, postes élèves, Serveur-Données pour les profils ; l\'ENT est hébergé sur Internet.'],
        ['', 'Réseau Internet : Siège et agences, Lycée et annexe, Client et hébergeur', 'Thèmes propres à ce type : deux ou trois sites, un routeur par site.'],
        ['Difficulté', '1 · Guidé', 'Valeurs données, contraintes affichées, réseau simple, 2 pannes, seuil 50 %.'],
        ['', '2 · Intermédiaire', 'Adresse à choisir dans une plage, passerelle « routeur du réseau », 3 pannes, seuil 60 %.'],
        ['', '3 · Autonome', 'Adresses libres, contraintes masquées, deux réseaux, 4 pannes, seuil 70 %.'],
    ]
    story.append(table_obj([[Paragraph(r[0], CELL_B), Paragraph(r[1], CELL_B if i == 0 else CELL),
                             Paragraph(r[2], CELL)] for i, r in enumerate(wz_rows)],
                           [24*mm, 40*mm, CONTENT_W-64*mm]))
    story += [
        Spacer(1, 6),
        Paragraph('<b>Réseau Internet</b> : la difficulté 1 utilise le routage automatique (RIP) sur deux réseaux, avec les pannes '
                  '« RIP désactivé » et « DNS arrêté » ; la difficulté 2 utilise des routes statiques sur deux réseaux (route '
                  'manquante, route par défaut vers un mauvais routeur, passerelle d\'un poste) ; la difficulté 3 ajoute un '
                  'troisième routeur en chaîne et le DNS arrêté. Le premier routeur est relié à Internet, le serveur web et DNS '
                  'est dans le dernier réseau. Chaque panne est vérifiée sur un chemin qu\'aucune autre panne ne coupe.', BODY),
        callout('La vérification contrôle trois points : <b>0 point à l\'ouverture</b>, seuil impossible à atteindre '
                'sans rien réparer ni construire, et chaque objectif atteignable une fois le travail fait. En dépannage, '
                '<b>Autres appareils</b> tire d\'autres postes en panne.', TIP, '💡'),
        CondPageBreak(40*mm),
        Paragraph(
            'Le bouton Menu propose aussi <b>Variante</b> : elle décline l\'activité en cours (scénario fourni, importé ou créé par '
            'l\'assistant) sans toucher au réseau. La difficulté 1, 2 ou 3 règle le niveau de départ ; la variante l\'ajuste '
            'à l\'intérieur d\'un niveau :',
            BODY),
        Paragraph('• <b>Plus guidée</b> : contraintes affichées sous les objectifs d\'adressage, seuil abaissé de 10 points.', BODY_L),
        Paragraph('• <b>Plus exigeante</b> : adresses exactes laissées au choix quand rien d\'autre ne les utilise, '
                  'passerelle « routeur du réseau », contraintes et indices masqués, seuil relevé de 10 points.', BODY_L),
        Paragraph('• <b>Pannes sur d\'autres appareils</b> : la réparation et ses tests suivent, adresses et libellés compris. '
                  'Sur un petit réseau où chaque poste a déjà sa panne, deux pannes échangent leurs postes ; un mot de passe '
                  'WiFi faux passe à un autre terminal de la box. <b>Une de moins</b> retire la dernière panne avec sa réparation '
                  'et ses tests ; <b>une de plus</b> en ajoute une sur un poste à adresse fixe (à défaut, un mot de passe WiFi '
                  'faux sur un terminal), avec sa réparation et son test.', BODY_L),
        Paragraph('• Les choix de pannes <b>se combinent</b> : autres appareils et une de plus, par exemple. Une de moins '
                  'et une de plus s\'excluent. Quand aucun appareil ne convient, la fenêtre propose d\'ajouter un poste '
                  'sur le schéma.', BODY_L),
        callout('La variante remplace l\'activité en cours : exportez d\'abord le scénario (bouton de la fenêtre) '
                'pour garder les deux versions. Ce qui ne peut pas changer est signalé.', WARN, '⚠'),
        Spacer(1, 4),
        Paragraph('2.5 Routage : RIP et routes statiques', H2),
        Paragraph('Un routeur remplit sa <b>table de routage</b> de deux façons. Avec le <b>routage automatique (RIP)</b>, '
                  'chaque routeur apprend les réseaux de ses voisins de proche en proche : rien à saisir, et les routes suivent '
                  'les changements du réseau. Avec des <b>routes statiques</b>, chaque route est écrite à la main '
                  '(réseau, masque, routeur suivant) : plus de contrôle, mais une route oubliée ou fausse coupe la communication. '
                  'Une route statique reste prioritaire sur ce que RIP apprendrait pour le même réseau.', BODY),
        Paragraph('• Dans le bureau d\'un routeur ou d\'une box, l\'application <b>Routage</b> active ou arrête RIP, '
                  'ajoute une route statique (le réseau doit être une vraie adresse de réseau et le routeur suivant doit être '
                  'relié directement) et la supprime d\'une croix. L\'élève dispose du même outil.', BODY_L),
        Paragraph('• Trois pannes de routage : <b>route manquante</b>, <b>mauvais routeur suivant</b> et <b>routage '
                  'automatique désactivé</b>. Une route apprise par RIP revient d\'elle-même : seule une route statique peut '
                  'manquer ou être fausse, et le contrôle du corrigé signale une panne qui n\'a aucun effet.', BODY_L),
        Paragraph('• L\'objectif « Route existante » vérifie la route d\'un routeur vers un réseau, et peut imposer le routeur '
                  'suivant (une adresse ou « l\'adresse de… »).', BODY_L),
        Spacer(1, 4),
    ]

    # 3. Scénarios
    story += [
        CondPageBreak(95*mm),
        Paragraph('3. Scénarios prêts à l\'emploi', H1), hr(),
        Paragraph(
            'Quatre scénarios JSON complets sont fournis dans le dossier <b>scenarios/</b>. '
            'Chargez-les avec <b>Ouvrir</b>, dans le bouton Menu du builder.',
            BODY),
    ]
    sc_rows = [
        ['Fichier', 'Titre', 'Public', 'Obj. / Seuil'],
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
    story += [CondPageBreak(105*mm), Paragraph('4. Workflow complet', H1), hr()]
    wf_p = [[Paragraph(r[0], CELL_B), Paragraph(r[1], CELL_B), Paragraph(r[2], CELL)] for r in [
        ['1', 'Ouvrir le Builder',        'Double-cliquez sur scorm-builder.html dans Chrome ou Firefox.'],
        ['2', 'Construire le réseau',     'Vue Conception : appareils, liaisons, IP — ou Menu, Nouvelle activité pour partir d\'un modèle.'],
        ['3', 'Configurer l\'évaluation', 'Bandeau Évaluation : objectifs, pannes, score de maîtrise.'],
        ['4', 'Tester',                   "Onglet Contrôle (corrigé complet ?), puis vue Test pour jouer l'élève, ou Tester comme élève."],
        ['5', 'Exporter',                 'Menu : SCORM, HTML, énoncé imprimable et son corrigé.'],
        ['6', 'Déployer sur Moodle',      'Importez le .zip SCORM dans votre cours.'],
        ['7', 'Enregistrer le scénario',  'Menu, Enregistrer (fichier .json), à rouvrir avec Ouvrir.'],
    ]]
    story.append(workflow_table(wf_p))
    story.append(Spacer(1, 8))

    # 5. Raccourcis
    story += [Paragraph('5. Raccourcis clavier', H1), hr()]
    kb_rows = [
        ['Raccourci', 'Action'],
        ['Ctrl+1 / 2 / 3', 'Replier le bandeau / ouvrir Évaluation / ouvrir Contrôle'],
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
#  DOC ELEVE  v2.1
# ══════════════════════════════════════════════════════════════════════════════
def build_eleve(out_path):
    doc = SimpleDocTemplate(out_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN+5*mm, bottomMargin=MARGIN+3*mm)
    doc._badge       = 'Activité élève'
    doc._title       = 'Guide Élève'
    doc._tagline     = 'Apprendre les réseaux en simulant les protocoles TCP/IP'
    doc._subtitle    = 'Guide élève v2.1'
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
            "L'interface se compose de trois zones : le <b>schéma du réseau</b> (au centre) avec les appareils et "
            "les câbles, la <b>fiche de l'appareil</b> (à droite) et le <b>bandeau du bas</b> avec les onglets "
            "Journal, Paquets et <b>Activité</b>, qui affiche vos objectifs et votre score.",
            BODY),
        Paragraph('<b>Deux gestes à retenir :</b>', H2),
        Paragraph("• <b>Clic</b> sur un appareil : sa fiche s'ouvre à droite (nom, adresse IP, masque, passerelle, DNS). "
                  "Vous pouvez aussi le déplacer en le faisant glisser.", BODY_L),
        Paragraph("• <b>Double-clic</b> sur un appareil : son <b>bureau</b> s'ouvre dans une fenêtre, avec ses "
                  "applications : Invite de commandes, Navigateur, Paramètres réseau, WiFi et, sur un serveur ou une "
                  "box, les réglages de ses services.", BODY_L),
        Paragraph("• Pour <b>ajouter</b> un appareil, faites-le glisser depuis la palette de gauche. Pour <b>câbler</b>, "
                  "choisissez l'outil Liaison puis cliquez sur les deux appareils (câble ou liaison WiFi, selon les appareils). <b>Suppr</b> efface l'élément "
                  "sélectionné.", BODY_L),
        callout("Une erreur ? <b>Ctrl+Z</b> annule votre dernière action, <b>Ctrl+Y</b> la rétablit (boutons Annuler et "
                "Rétablir, en haut). Dans le menu <b>Menu</b>, « Repartir de zéro » remet le réseau de départ ; "
                "<b>Terminer</b> envoie votre note quand vous avez fini.", TIP, '💡'),
        Spacer(1, 6),
    ]

    # 2. Terminal
    story += [
        Paragraph('2. Le terminal — commandes disponibles', H1), hr(),
        Paragraph(
            "Double-cliquez sur un poste ou un serveur, puis ouvrez <b>Invite de commandes</b>. "
            "Tapez la commande et appuyez sur <b>Entrée</b>. Utilisez ↑ / ↓ pour l'historique. Chaque appareil "
            "garde son propre terminal.",
            BODY),
    ]
    cmd_rows = [
        ['Commande', 'Description', 'Exemple'],
        ['ping',       'Ping vers une IP ou un nom.',               'ping 192.168.1.1'],
        ['nslookup',   'Résout un nom de domaine en IP.',            'nslookup web.ecole.fr'],
        ['dhcp',       'Demande une IP automatique.',                'dhcp'],
        ['traceroute', 'Affiche le chemin réseau.',                  'traceroute 8.8.8.8'],
        ['ipconfig',   'Affiche la configuration IP.',              'ipconfig'],
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
    story.append(Paragraph("Pour accéder à une page web, ouvrez l'application <b>Navigateur</b> du bureau du poste "
                           "et saisissez l'adresse du site.", BODY))
    story.append(Spacer(1, 8))

    # 3. Configurer les IP
    story += [
        CondPageBreak(75*mm),
        Paragraph('3. Configurer les adresses IP', H1), hr(),
        Paragraph(
            'Cliquez sur un appareil pour afficher sa fiche dans le panneau de droite :',
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
                '<b>Demander une adresse (DHCP)</b>, ou tapez la commande <b>dhcp</b> dans le terminal. Si vous décochez '
                'la case, l\'adresse fixe saisie avant revient.', INFO, '■'),
        Paragraph("<b>Se connecter au WiFi :</b> reliez le portable, le téléphone ou la tablette à la Box WiFi avec "
                  "l'outil Liaison, puis ouvrez son bureau, application <b>WiFi</b> : vérifiez le réseau (SSID) et tapez "
                  "le mot de passe de la box. Tant qu'ils ne correspondent pas, la liaison reste en pointillé rouge "
                  "et l'appareil ne joint rien.", BODY),
        Paragraph("<b>Routeurs et plusieurs réseaux</b> : un poste joint un autre réseau par sa passerelle, qui est l'adresse "
                  "du routeur de son réseau. Le routeur choisit ensuite la route d'après sa <b>table de routage</b> "
                  "(commande <b>route</b>, ou bureau du routeur, application <b>Routage</b>). Elle peut être remplie "
                  "automatiquement (<b>RIP</b>) ou à la main : l'application Routage permet d'ajouter une <b>route "
                  "statique</b> (réseau, masque, routeur suivant) et de la supprimer.", BODY),
        Paragraph("<b>Services d'un serveur ou de la box</b> (web, DNS, DHCP, WiFi) : ils se règlent dans le bureau "
                  "de l'appareil, pas dans sa fiche.", BODY),
        Spacer(1, 8),
    ]

    # 4. Objectifs
    story += [
        Paragraph('4. Les objectifs et le score', H1), hr(),
        Paragraph(
            "L'onglet <b>Activité</b>, dans le bandeau du bas, liste vos tâches. Le bandeau se replie et se "
            "déplie d'un clic sur un onglet. Chaque objectif validé ajoute des points à votre score.",
            BODY),
        Paragraph('• <b>Objectif validé</b> (coche verte) — condition remplie, points attribués.', BODY_L),
        Paragraph('• <b>Non validé</b> (cercle) — vérifiez câblage et configuration IP.', BODY_L),
        Paragraph('• Sous certains objectifs, une <b>contrainte</b> précise ce qui est attendu, par exemple '
                  'une adresse à choisir dans une plage.', BODY_L),
        Paragraph('• Un <b>indice</b> peut vous mettre sur la piste ; il disparaît une fois l\'objectif validé.', BODY_L),
        callout('Un objectif reste validé tant que le réseau le permet : si vous modifiez ensuite '
                'un réglage qui le casse, vous perdez ses points (message « Objectif perdu »). '
                'Votre note est celle du réseau à la fin de l\'activité.', WARN, '⚠'),
        Spacer(1, 4),
        Paragraph('Si votre énoncé contient un <b>plan d\'adressage</b>, complétez-le avant de configurer '
                  'les appareils : il vous sert de référence pendant la réalisation.', BODY),
        callout("Votre travail est enregistré automatiquement quelques secondes après chaque modification, et le "
                "score est transmis à Moodle à la fermeture de l'activité.", INFO, '■'),
        Spacer(1, 8),
    ]

    # 5. Exemple guidé
    story += [
        CondPageBreak(85*mm),
        Paragraph('5. Exemple guidé : configurer un réseau simple', H1), hr(),
    ]
    ex_p = [[Paragraph(r[0], CELL_B), Paragraph(r[1], CELL_B), Paragraph(r[2], CELL)] for r in [
        ['Étape 1', 'Vérifier le câblage',  'PC → Switch → Serveur.'],
        ['Étape 2', 'Configurer le Serveur','Clic sur le serveur. IP : 192.168.1.1 / Masque : 255.255.255.0'],
        ['Étape 3', 'Configurer le PC',     'Clic sur le PC. IP : 192.168.1.10 / Masque : 255.255.255.0'],
        ['Étape 4', 'Ouvrir le terminal',   'Double-clic sur le PC, puis Invite de commandes.'],
        ['Étape 5', 'Tester',               'Tapez : ping 192.168.1.1'],
        ['Étape 6', 'Vérifier',             "L'objectif est coché dans l'onglet Activité si le ping réussit."],
    ]]
    story.append(workflow_table(ex_p))
    story.append(Spacer(1, 2))

    # 6. Dépannage
    story += [CondPageBreak(70*mm), Paragraph('6. En cas de problème', H1), hr()]
    for title, desc in [
        ('Le ping échoue',
         'Lisez la cause affichée sous le ping. <b>Hôte inconnu</b> : aucun appareil n\'a cette adresse. '
         '<b>Pas de route vers… sur un routeur</b> : ce routeur ne connaît pas le réseau visé (vérifiez les '
         'adresses des routeurs et la commande route). <b>La réponse ne revient pas</b> : l\'aller arrive, mais '
         'l\'appareil visé ne sait pas répondre (sa passerelle, ou une route manquante au retour). Sinon, vérifiez '
         'que les deux appareils sont dans le même sous-réseau, ou qu\'une passerelle est configurée pour sortir '
         'du réseau local.'),
        ('Un autre réseau reste injoignable',
         'Faites un <b>traceroute</b> : le dernier routeur affiché est celui qui ne sait pas continuer. Ouvrez son bureau, '
         'application <b>Routage</b> : y a-t-il une route vers le réseau visé, avec le bon routeur suivant ? Le routage '
         'automatique (RIP) est-il activé ? Pensez au retour : le réseau visé doit aussi connaître une route vers votre réseau.'),
        ('DNS ne résout pas',
         'Vérifiez que l\'adresse DNS du PC pointe vers un Serveur ayant le service DNS activé '
         'et que l\'enregistrement du domaine est configuré.'),
        ('DHCP échoue',
         'Assurez-vous qu\'une Box WiFi ou un Serveur sur le même segment LAN a le service DHCP activé.'),
        ('WiFi non connecté',
         'Le message « Non connecté au WiFi » dit pourquoi : <b>mot de passe incorrect</b> (comparez-le avec celui '
         'de la fiche de la box), <b>SSID inconnu</b> (le nom du réseau choisi dans la fiche de l\'appareil doit être '
         'celui de la box) ou aucun réseau choisi.'),
        ('« La plateforme a refusé la sauvegarde »',
         'Votre réseau n\'a pas pu être enregistré sur Moodle : il n\'est gardé que sur ce poste. '
         'Continuez à travailler et terminez l\'activité sur le même poste, avec le même navigateur, '
         'puis prévenez votre professeur.'),
        ('« Chargement impossible »',
         'Le fichier choisi est abîmé ou n\'est pas un réseau du simulateur. Le réseau en cours est conservé.'),
        ('L\'objectif ne se valide pas',
         'Relisez l\'intitulé et vérifiez chaque paramètre (IP, masque, passerelle, DNS). Pour un objectif à '
         'commande, lancez-la depuis le bon poste : terminal ou Navigateur de son bureau.'),
    ]:
        p = story[-1] if False else Paragraph(f'<font color="#2b6cb0"><b>■ {title}</b></font>', H2)
        story.append(p)
        story.append(Paragraph(desc, BODY))
    story.append(Spacer(1, 1))
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

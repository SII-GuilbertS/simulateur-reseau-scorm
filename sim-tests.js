/**
 * sim-tests.js — Tests de non-régression du moteur de simulation réseau
 * Usage : node sim-tests.js
 *
 * Source testée : STUDENT_TEMPLATE (b64) extrait de scorm-builder.html
 * Le template est la version déployée aux élèves — c'est elle qu'on valide.
 */
'use strict';

const fs  = require('fs');
const path = require('path');
const vm  = require('vm');

/* ─────────────────────────────────────────────────────
   1. EXTRACTION DU JS SIMULATEUR DEPUIS LE STUDENT_TEMPLATE
───────────────────────────────────────────────────── */
const SRC = path.join(__dirname, 'scorm-builder.html');
const html = fs.readFileSync(SRC, 'utf-8');

// Décoder le STUDENT_TEMPLATE b64
const b64Match = html.match(/var STUDENT_TEMPLATE\s*=\s*\(function\(\)\{\s*var b64\s*=\s*"([A-Za-z0-9+/=]+)"/);
if (!b64Match) { console.error('FATAL: STUDENT_TEMPLATE non trouvé'); process.exit(1); }
const tplHtml = Buffer.from(b64Match[1], 'base64').toString('utf-8');

// Extraire le bloc <script> principal
const scriptStart = tplHtml.indexOf('<script>') + '<script>'.length;
const scriptEnd   = tplHtml.lastIndexOf('</script>');
if (scriptStart < 8 || scriptEnd < 0) { console.error('FATAL: <script> non trouvé dans le template'); process.exit(1); }
let simJs = tplHtml.slice(scriptStart, scriptEnd);

// Supprimer le bloc d'init DOM (window.addEventListener('load',...))
const initMarker = "window.addEventListener('load',function(){";
const initIdx    = simJs.indexOf(initMarker);
if (initIdx !== -1) simJs = simJs.slice(0, initIdx);

/* ─────────────────────────────────────────────────────
   2. SANDBOX DOM (stubs minimalistes)
───────────────────────────────────────────────────── */
function makeElem(tag) {
  return {
    tagName: (tag||'div').toUpperCase(),
    innerHTML: '', textContent: '', value: '',
    style: {}, className: '',
    children: [], dataset: {},
    classList: { add:function(){}, remove:function(){}, toggle:function(){}, contains:function(){return false;} },
    _handlers: {},
    addEventListener:    function(ev, fn) { this._handlers[ev] = fn; },
    removeEventListener: function() {},
    querySelector:       function()  { return makeElem('div'); },
    querySelectorAll:    function()  { return []; },
    getAttribute:        function()  { return null; },
    setAttribute:        function()  {},
    closest:             function()  { return null; },
    getBoundingClientRect: function(){ return {left:0,top:0,width:800,height:600}; },
    focus:function(){}, blur:function(){}, click:function(){},
    appendChild:  function(c){ this.children.push(c); return c; },
    insertBefore: function(c){ this.children.push(c); return c; },
    remove:       function(){},
    contains:     function(){ return false; },
    setAttributeNS: function(){},
  };
}

const _docElements = {};
const sandbox = {
  /* Globals JS */
  console,
  setTimeout:            function(fn, ms) { return 0; },
  clearTimeout:          function() {},
  setInterval:           function() { return 0; },
  clearInterval:         function() {},
  requestAnimationFrame: function() { return 0; },
  cancelAnimationFrame:  function() {},
  localStorage:  { getItem:function(){return null;}, setItem:function(){}, removeItem:function(){} },
  sessionStorage:{ getItem:function(){return null;}, setItem:function(){}, removeItem:function(){} },
  JSON, Math, Date, Set, Map, Promise, Array, Object, String, Number, Boolean,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  atob: function(s) { return Buffer.from(s, 'base64').toString('utf-8'); },
  btoa: function(s) { return Buffer.from(s, 'utf-8').toString('base64'); },
  Symbol,

  /* DOM */
  document: {
    getElementById:  function(id) { if(!_docElements[id]) _docElements[id]=makeElem('div'); return _docElements[id]; },
    querySelector:   function()   { return makeElem('div'); },
    querySelectorAll:function()   { return []; },
    createElement:   function(tag){ return makeElem(tag); },
    createElementNS: function(ns,tag){ return makeElem(tag); },
    createTextNode:  function(t)  { return makeElem('text'); },
    body: makeElem('body'),
    head: makeElem('head'),
    addEventListener:    function() {},
    removeEventListener: function() {},
  },
  window: {
    addEventListener:    function() {},
    removeEventListener: function() {},
    innerWidth: 1280, innerHeight: 800,
    location: { href:'', search:'', hash:'', hostname:'localhost' },
    history:  { pushState: function(){} },
    scrollY: 0,
  },
  navigator: { userAgent: 'Node.js test runner' },
  location:  { href:'', search:'', hash:'', hostname:'localhost' },

  /* ACTIVITY_CONFIG : injecté par le builder à l'export — ici un mock de base */
  ACTIVITY_CONFIG: {
    title: 'Test', instructions: '',
    masteryscore: 75,
    objectives: [],
  },
  STARTER_NETWORK: null,

  /* SCORM stubs */
  scormInit: function() {},
  sSet: function() {},
  sGet: function() { return ''; },
  sCom: function() {},
  sEnd: function() {},

  /* Fonctions UI appelées depuis le moteur */
  notif:            function() {},
  addLog:           function() {},
  addPacket:        function() {},
  unlock:           function() {},
  render:           function() {},
  renderLinks:      function() {},
  renderDevs:       function() {},
  showProps:        function() {},
  checkBadges:      function() {},
  updSelects:       function() {},
  tpr:              function() {},
  setTermDev:       function() {},
  showTab:          function() {},
  hidePrev:         function() {},
  noSel:            function() {},
  saveToSession:    function() { return true; },
  renderActivityTab:function() {},
  updScore:         function() {},

  /* JSZip stub */
  JSZip: function() {
    this.file = function() {};
    this.generateAsync = function() { return Promise.resolve(new Uint8Array()); };
  },
};
sandbox.self = sandbox.window;

vm.createContext(sandbox);
try {
  vm.runInContext(simJs, sandbox);
} catch(e) {
  console.error('FATAL: erreur lors de l\'exécution du JS template :', e.message);
  process.exit(1);
}

// Le template définit "var ACTIVITY_CONFIG = null" (valeur injectée à l'export).
// On le réinitialise APRÈS runInContext pour que les fonctions d'évaluation aient
// un objet valide à lire pendant les tests.
sandbox.ACTIVITY_CONFIG = {
  title: 'Test', instructions: '',
  masteryscore: 75,
  objectives: [],
};

/* Extraire les fonctions du sandbox */
const {
  S,
  ip2n, isValidUserIP, isValidUserMask, sameNet, netAddr,
  isRouter, lanSeg, cablePath, devByIP, devByName, mainIface,
  simPing, simDNS, simHTTP, simDHCP,
  getRoutingTable, autoRoute,
  mkDev, addLink, delDev,
  checkObjectiveStatic, checkDynamicObjective, checkAllObjectives,
  ipMatchesPattern,
} = sandbox;

/* ─────────────────────────────────────────────────────
   3. HARNAIS DE TEST
───────────────────────────────────────────────────── */
let _passed = 0, _failed = 0, _suite = '';
const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m',
      CYAN  = '\x1b[36m', BOLD  = '\x1b[1m', DIM = '\x1b[2m';

function suite(name) {
  _suite = name;
  console.log('\n' + CYAN + BOLD + '▶ ' + name + RESET);
}

function test(label, fn) {
  try {
    fn();
    console.log('  ' + GREEN + '✅' + RESET + ' ' + label);
    _passed++;
  } catch(err) {
    console.log('  ' + RED + '❌' + RESET + ' ' + label);
    console.log('     ' + DIM + err.message + RESET);
    _failed++;
  }
}

function assert(cond, msg) { if(!cond) throw new Error(msg||'assertion échouée'); }
function eq(a, b) {
  if(a !== b) throw new Error('attendu '+JSON.stringify(b)+' obtenu '+JSON.stringify(a));
}
function ok(v)    { assert(!!v,  'attendu truthy, obtenu '+JSON.stringify(v)); }
function notOk(v) { assert(!v,   'attendu falsy, obtenu '+JSON.stringify(v)); }

/* ─────────────────────────────────────────────────────
   4. HELPERS RÉSEAU
───────────────────────────────────────────────────── */
function resetNet() {
  Object.keys(S.devs).forEach(function(k) { delete S.devs[k]; });
  Object.keys(S.links).forEach(function(k) { delete S.links[k]; });
  S.nid = 1;
  // Réinitialiser ACTIVITY_CONFIG (le template l'a mis à null, on le remplace)
  sandbox.ACTIVITY_CONFIG = { title:'Test', instructions:'', masteryscore:75, objectives:[] };
  S.score = 0;
}

function mkPC(ip, mask, gw, dns, name) {
  var id = mkDev('pc', 10, 10);
  var d = S.devs[id];
  if(name) d.name = name;
  d.ifaces[0].ip      = ip   || '';
  d.ifaces[0].mask    = mask || '255.255.255.0';
  d.ifaces[0].gateway = gw   || '';
  d.ifaces[0].dns     = dns  || '';
  return id;
}

function mkServer(ip, mask, gw, dns) {
  var id = mkDev('server', 10, 10);
  var d = S.devs[id];
  d.ifaces[0].ip      = ip   || '';
  d.ifaces[0].mask    = mask || '255.255.255.0';
  d.ifaces[0].gateway = gw   || '';
  d.ifaces[0].dns     = dns  || '';
  return id;
}

function mkSwitch() { return mkDev('switch', 10, 10); }

function mkRouter(eth0ip, eth0mask, eth1ip, eth1mask) {
  var id = mkDev('router', 10, 10);
  var d = S.devs[id];
  d.ifaces[0].ip   = eth0ip   || '';
  d.ifaces[0].mask = eth0mask || '255.255.255.0';
  d.ifaces[1].ip   = eth1ip   || '';
  d.ifaces[1].mask = eth1mask || '255.255.255.0';
  return id;
}

function mkWifiRouter(wanIP, wanMask, wanGW, ssid) {
  var id = mkDev('wifi_router', 10, 10);
  var d = S.devs[id];
  d.ifaces[0].ip      = wanIP  || '';
  d.ifaces[0].mask    = wanMask|| '255.255.255.0';
  d.ifaces[0].gateway = wanGW  || '';
  d.ssid = ssid || 'TestWiFi';
  // Le réseau WiFi interne est 10.0.0.x par convention dans l'UI
  // mais pour les tests on laisse le moteur gérer
  return id;
}

function mkInternet() {
  return mkDev('internet', 10, 10);
}

function link(a, b) {
  var id = 'l' + (S.nid++);
  S.links[id] = { id:id, from:a, to:b };
  return id;
}

function wifiLink(deviceId, routerId) {
  var id = 'l' + (S.nid++);
  S.links[id] = { id:id, from:deviceId, to:routerId, type:'wifi' };
  return id;
}

/* ─────────────────────────────────────────────────────
   5. SUITES DE TESTS
───────────────────────────────────────────────────── */

/* ── ip2n ── */
suite('ip2n — conversion IP → entier 32 bits');

test('192.168.1.1 → 3232235777', function() { eq(ip2n('192.168.1.1'), 3232235777); });
test('0.0.0.0 → 0',              function() { eq(ip2n('0.0.0.0'), 0); });
test('255.255.255.255 → 4294967295', function() { eq(ip2n('255.255.255.255'), 4294967295); });
test('10.0.0.1 → 167772161',     function() { eq(ip2n('10.0.0.1'), 167772161); });
test('chaîne vide → -1',         function() { eq(ip2n(''), -1); });
test('"abc" → -1',               function() { eq(ip2n('abc'), -1); });
test('"1.2.3" → -1',             function() { eq(ip2n('1.2.3'), -1); });
test('"192.168.1.300" → -1',     function() { eq(ip2n('192.168.1.300'), -1); });

/* ── isValidUserIP ── */
suite('isValidUserIP — validation saisie utilisateur');

test('vide → true (non configuré accepté)', function() { ok(isValidUserIP('')); });
test('192.168.1.1 → true',                 function() { ok(isValidUserIP('192.168.1.1')); });
test('0.0.0.0 → false (tout-zéro interdit)', function() { notOk(isValidUserIP('0.0.0.0')); });
test('192.168.01.1 → false (zéro en tête)', function() { notOk(isValidUserIP('192.168.01.1')); });
test('192.168.1.300 → false (> 255)',       function() { notOk(isValidUserIP('192.168.1.300')); });
test('abc.def.ghi.jkl → false',            function() { notOk(isValidUserIP('abc.def.ghi.jkl')); });
test('255.255.255.255 → true',             function() { ok(isValidUserIP('255.255.255.255')); });

/* ── isValidUserMask ── */
suite('isValidUserMask — validation masque sous-réseau');

test('vide → true',               function() { ok(isValidUserMask('')); });
test('255.255.255.0 → true',      function() { ok(isValidUserMask('255.255.255.0')); });
test('255.255.0.0 → true',        function() { ok(isValidUserMask('255.255.0.0')); });
test('255.255.255.128 → true',    function() { ok(isValidUserMask('255.255.255.128')); });
test('255.0.255.0 → false (bits non contigus)', function() { notOk(isValidUserMask('255.0.255.0')); });
test('255.255.255.3 → false (bits non contigus)', function() { notOk(isValidUserMask('255.255.255.3')); });
test('0.0.0.0 → true (masque hôte)',function() { ok(isValidUserMask('0.0.0.0')); });

/* ── sameNet ── */
suite('sameNet — appartenance au même sous-réseau');

test('192.168.1.1 et 192.168.1.50 /24 → même réseau', function() {
  ok(sameNet('192.168.1.1', '255.255.255.0', '192.168.1.50'));
});
test('192.168.1.1 et 192.168.2.1 /24 → réseaux différents', function() {
  notOk(sameNet('192.168.1.1', '255.255.255.0', '192.168.2.1'));
});
test('10.0.0.1 et 10.0.0.2 /8 → même réseau', function() {
  ok(sameNet('10.0.0.1', '255.0.0.0', '10.0.0.2'));
});
test('IP invalide → false', function() {
  notOk(sameNet('', '255.255.255.0', '192.168.1.1'));
});

/* ── netAddr ── */
suite('netAddr — adresse réseau');

test('192.168.1.42 /24 → 192.168.1.0', function() { eq(netAddr('192.168.1.42','255.255.255.0'), '192.168.1.0'); });
test('10.1.2.3 /8 → 10.0.0.0',         function() { eq(netAddr('10.1.2.3','255.0.0.0'), '10.0.0.0'); });
test('172.16.5.200 /16 → 172.16.0.0',  function() { eq(netAddr('172.16.5.200','255.255.0.0'), '172.16.0.0'); });

/* ── isRouter — y compris wifi_router ── */
suite('isRouter — détection routeur/internet/wifi_router');

test('type router → true',      function() { ok(isRouter({type:'router'})); });
test('type internet → true',    function() { ok(isRouter({type:'internet'})); });
test('type wifi_router → true', function() { ok(isRouter({type:'wifi_router'})); });
test('type pc → false',         function() { notOk(isRouter({type:'pc'})); });
test('type switch → false',     function() { notOk(isRouter({type:'switch'})); });
test('null → false',            function() { notOk(isRouter(null)); });
test('type server → false',     function() { notOk(isRouter({type:'server'})); });

/* ── lanSeg & cablePath ── */
suite('lanSeg — segment LAN via BFS switch');

test('PC seul → segment contient lui-même', function() {
  resetNet();
  var pc = mkPC('192.168.1.1');
  var seg = lanSeg(pc);
  ok(seg.indexOf(pc) !== -1);
  eq(seg.length, 1);
});

test('PC — switch — serveur : segment contient les 3', function() {
  resetNet();
  var pc = mkPC('192.168.1.1'), sw = mkSwitch(), srv = mkServer('192.168.1.2');
  link(pc,sw); link(sw,srv);
  var seg = lanSeg(pc);
  ok(seg.indexOf(pc) !== -1);
  ok(seg.indexOf(sw) !== -1);
  ok(seg.indexOf(srv) !== -1);
});

test('PC isolé ne voit pas un autre PC sans câble', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1'), pc2 = mkPC('192.168.1.2');
  var seg = lanSeg(pc1);
  assert(seg.indexOf(pc2) === -1, 'pc2 ne devrait pas être dans le segment de pc1');
});

test('wifi_router ne propage pas le segment LAN (il est routeur, pas switch)', function() {
  resetNet();
  var pc1 = mkPC('10.0.0.2', '255.255.255.0');
  var wr  = mkWifiRouter('192.168.1.1', '255.255.255.0');
  var pc2 = mkPC('10.0.0.3', '255.255.255.0');
  wifiLink(pc1, wr); wifiLink(pc2, wr);
  var seg = lanSeg(pc1);
  // pc2 n'est PAS dans le même segment LAN (wifi_router est un routeur, pas un switch)
  assert(seg.indexOf(pc2) === -1, 'pc2 ne devrait pas être dans le segment LAN de pc1 via wifi_router');
});

suite('cablePath — chemin physique entre deux appareils');

test('PC → switch → serveur : chemin de 2 liens', function() {
  resetNet();
  var pc = mkPC('192.168.1.1'), sw = mkSwitch(), srv = mkServer('192.168.1.2');
  var l1 = link(pc,sw), l2 = link(sw,srv);
  var p = cablePath(pc, srv);
  eq(p.length, 2);
  ok(p.indexOf(l1) !== -1);
  ok(p.indexOf(l2) !== -1);
});

test('aucun câble → chemin vide', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1'), pc2 = mkPC('192.168.1.2');
  eq(cablePath(pc1, pc2).length, 0);
});

/* ── devByIP ── */
suite('devByIP — trouver un appareil par IP');

test('IP existante → retourne le device', function() {
  resetNet();
  var pc = mkPC('10.0.0.5');
  var d = devByIP('10.0.0.5');
  ok(d); eq(d.id, pc);
});

test('IP inconnue → null', function() {
  resetNet();
  mkPC('10.0.0.5');
  eq(devByIP('10.0.0.99'), null);
});

/* ── devByName — avec normalisation de casse ── */
suite('devByName — recherche par nom (insensible à la casse)');

test('nom exact → retourne le device', function() {
  resetNet();
  var id = mkPC('10.0.0.1', '255.255.255.0', '', '', 'PC1');
  var d = devByName('PC1');
  ok(d); eq(d.id, id);
});

test('nom en minuscules → trouve malgré la casse différente', function() {
  resetNet();
  var id = mkPC('10.0.0.1', '255.255.255.0', '', '', 'PC-Eleve');
  var d = devByName('pc-eleve');
  ok(d, 'devByName doit être insensible à la casse'); eq(d.id, id);
});

test('nom en MAJUSCULES → trouve malgré la casse différente', function() {
  resetNet();
  var id = mkPC('10.0.0.1', '255.255.255.0', '', '', 'serveur web');
  var d = devByName('SERVEUR WEB');
  ok(d, 'devByName doit être insensible à la casse'); eq(d.id, id);
});

test('nom avec espaces superflus → trouve quand même', function() {
  resetNet();
  var id = mkPC('10.0.0.1', '255.255.255.0', '', '', 'Switch1');
  var d = devByName('  Switch1  ');
  ok(d, 'devByName doit ignorer les espaces en début/fin'); eq(d.id, id);
});

test('nom inconnu → null', function() {
  resetNet();
  mkPC('10.0.0.1', '255.255.255.0', '', '', 'PC1');
  eq(devByName('PC99'), null);
});

test('null → null', function() {
  resetNet();
  eq(devByName(null), null);
});

/* ── simPing ── */
suite('simPing — scénarios de ping classiques');

test('ping vers sa propre IP → ok, latence 0', function() {
  resetNet();
  var pc = mkPC('192.168.1.10');
  var r = simPing(pc, '192.168.1.10');
  ok(r.ok); eq(r.lat, 0);
});

test('ping entre 2 PCs même sous-réseau câblés → ok', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1'), pc2 = mkPC('192.168.1.2');
  link(pc1, pc2);
  var r = simPing(pc1, '192.168.1.2');
  ok(r.ok); eq(r.lat, 1);
});

test('ping même sous-réseau sans câble → échec', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1'), pc2 = mkPC('192.168.1.2');
  var r = simPing(pc1, '192.168.1.2');
  notOk(r.ok); ok(r.reason);
});

test('ping via routeur 1 saut → ok, router=true', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.10','255.255.255.0','192.168.1.254');
  var rtr = mkRouter('192.168.1.254','255.255.255.0','192.168.2.254','255.255.255.0');
  var pc2 = mkPC('192.168.2.10','255.255.255.0','192.168.2.254');
  link(pc1,rtr); link(rtr,pc2);
  var r = simPing(pc1, '192.168.2.10');
  ok(r.ok); ok(r.router);
});

test('ping via routeur sans passerelle → échec', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.10','255.255.255.0','');
  var rtr = mkRouter('192.168.1.254','255.255.255.0','192.168.2.254','255.255.255.0');
  var pc2 = mkPC('192.168.2.10','255.255.255.0','192.168.2.254');
  link(pc1,rtr); link(rtr,pc2);
  var r = simPing(pc1, '192.168.2.10');
  notOk(r.ok);
  ok(r.reason && (r.reason.indexOf('passerelle') !== -1 || r.reason.indexOf('Gateway') !== -1));
});

test('ping destination inconnue → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.1');
  notOk(simPing(pc, '10.99.99.99').ok);
});

test('ping multi-hop (2 routeurs) → ok', function() {
  resetNet();
  var pc1 = mkPC('10.0.1.10','255.255.255.0','10.0.1.1');
  var r1  = mkRouter('10.0.1.1','255.255.255.0','10.0.12.1','255.255.255.0');
  var r2  = mkRouter('10.0.12.2','255.255.255.0','10.0.2.1','255.255.255.0');
  var pc2 = mkPC('10.0.2.10','255.255.255.0','10.0.2.1');
  link(pc1,r1); link(r1,r2); link(r2,pc2);
  var res = simPing(pc1, '10.0.2.10');
  ok(res.ok); ok(res.router);
});

/* ── simPing — pont WiFi ── */
suite('simPing — pont WiFi (clients sur même wifi_router)');

test('deux clients WiFi du même wifi_router → ping ok, wifi=true', function() {
  resetNet();
  var wr  = mkWifiRouter('192.168.1.1','255.255.255.0','','TestWiFi');
  var pc1 = mkPC('10.0.0.2','255.255.255.0');
  var pc2 = mkPC('10.0.0.3','255.255.255.0');
  wifiLink(pc1, wr); wifiLink(pc2, wr);
  var r = simPing(pc1, '10.0.0.3');
  ok(r.ok, 'le ping doit réussir via le pont WiFi');
  ok(r.wifi, 'r.wifi doit être true');
});

test('chemin WiFi contient l\'ID du wifi_router', function() {
  resetNet();
  var wr  = mkWifiRouter('192.168.1.1','255.255.255.0');
  var pc1 = mkPC('10.0.0.2','255.255.255.0');
  var pc2 = mkPC('10.0.0.3','255.255.255.0');
  wifiLink(pc1, wr); wifiLink(pc2, wr);
  var r = simPing(pc1, '10.0.0.3');
  ok(r.ok);
  assert(r.path && r.path.indexOf(wr) !== -1, 'le chemin doit passer par le wifi_router');
});

test('chemin WiFi contient des IDs (pas des noms)', function() {
  resetNet();
  var wr  = mkWifiRouter();
  S.devs[wr].name = 'Box WiFi';
  var pc1 = mkPC('10.0.0.2','255.255.255.0');
  var pc2 = mkPC('10.0.0.3','255.255.255.0');
  wifiLink(pc1, wr); wifiLink(pc2, wr);
  var r = simPing(pc1, '10.0.0.3');
  ok(r.ok);
  // Les éléments du path doivent être des IDs de devices (ex: 'd1')
  r.path.forEach(function(elem) {
    assert(S.devs[elem] !== undefined, 'path doit contenir des IDs, pas "'+elem+'"');
  });
});

test('client WiFi seul sur wifi_router ne peut pas pinguer un autre réseau WiFi', function() {
  resetNet();
  var wr1 = mkWifiRouter('192.168.1.1','255.255.255.0');
  var wr2 = mkWifiRouter('192.168.2.1','255.255.255.0');
  var pc1 = mkPC('10.0.0.2','255.255.255.0');
  var pc2 = mkPC('10.0.0.3','255.255.255.0');
  wifiLink(pc1, wr1); wifiLink(pc2, wr2);  // chacun sur son propre wifi_router
  var r = simPing(pc1, '10.0.0.3');
  notOk(r.ok, 'ne doit pas fonctionner si les clients sont sur des wifi_routers différents');
});

/* ── simDHCP ── */
suite('simDHCP — attribution d\'adresse DHCP');

test('attribution via serveur → ok + adresse IP dans la plage', function() {
  resetNet();
  var sw = mkSwitch(), pc = mkPC(''), srv = mkServer('192.168.1.1');
  S.devs[srv].dhcp = {on:true,start:'192.168.1.100',end:'192.168.1.200',mask:'255.255.255.0',gateway:'192.168.1.1',dns:''};
  link(pc,sw); link(sw,srv);
  var r = simDHCP(pc);
  ok(r.ok); ok(r.ip);
  var last = parseInt(r.ip.split('.')[3], 10);
  ok(last >= 100 && last <= 200);
});

test('DHCP via wifi_router → ok + adresse IP attribuée', function() {
  resetNet();
  var wr = mkWifiRouter('192.168.1.1','255.255.255.0');
  S.devs[wr].dhcp = {on:true,start:'10.0.0.10',end:'10.0.0.50',mask:'255.255.255.0',gateway:'10.0.0.1',dns:''};
  var pc = mkPC('');
  wifiLink(pc, wr);
  var r = simDHCP(pc);
  ok(r.ok, 'DHCP doit fonctionner via wifi_router');
  ok(r.ip, 'une IP doit être attribuée');
});

test('plage DHCP du wifi_router respectée', function() {
  resetNet();
  var wr = mkWifiRouter('192.168.1.1','255.255.255.0');
  S.devs[wr].dhcp = {on:true,start:'10.0.0.100',end:'10.0.0.110',mask:'255.255.255.0',gateway:'10.0.0.1',dns:''};
  var pc = mkPC('');
  wifiLink(pc, wr);
  var r = simDHCP(pc);
  ok(r.ok);
  var last = parseInt(r.ip.split('.')[3], 10);
  ok(last >= 100 && last <= 110, 'IP hors plage: ' + r.ip);
});

test('DHCP désactivé sur wifi_router → échec', function() {
  resetNet();
  var wr = mkWifiRouter('192.168.1.1','255.255.255.0');
  S.devs[wr].dhcp = {on:false};
  var pc = mkPC('');
  wifiLink(pc, wr);
  var r = simDHCP(pc);
  notOk(r.ok, 'DHCP désactivé doit échouer');
});

test('aucun serveur DHCP → échec', function() {
  resetNet();
  var pc = mkPC('');
  notOk(simDHCP(pc).ok);
});

test('routeur ne peut pas faire de demande DHCP → échec', function() {
  resetNet();
  var rtr = mkRouter('192.168.1.254','255.255.255.0');
  var r = simDHCP(rtr);
  notOk(r.ok);
  ok(r.reason.indexOf('PC') !== -1 || r.reason.indexOf('Serveur') !== -1);
});

test('plage DHCP épuisée → échec', function() {
  resetNet();
  var sw = mkSwitch(), srv = mkServer('192.168.1.1');
  S.devs[srv].dhcp = {on:true,start:'192.168.1.10',end:'192.168.1.10',mask:'255.255.255.0',gateway:'',dns:''};
  var pc_occ = mkPC('192.168.1.10'), pc_new = mkPC('');
  link(pc_occ,sw); link(pc_new,sw); link(sw,srv);
  notOk(simDHCP(pc_new).ok);
});

/* ── simDNS ── */
suite('simDNS — résolution DNS');

test('résolution réussie → ok + ip retournée', function() {
  resetNet();
  var pc = mkPC('192.168.1.10','255.255.255.0','','192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = true;
  S.devs[dns].dns.records['example.com'] = '192.168.1.100';
  mkServer('192.168.1.100');
  link(pc,dns);
  var r = simDNS(pc, 'example.com');
  ok(r.ok); eq(r.ip, '192.168.1.100');
});

test('aucun DNS configuré sur le PC → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.10','255.255.255.0','','');
  notOk(simDNS(pc,'example.com').ok);
});

test('serveur DNS inaccessible (pas de câble) → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.10','255.255.255.0','','192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = true;
  S.devs[dns].dns.records['example.com'] = '192.168.1.100';
  notOk(simDNS(pc,'example.com').ok);
});

test('domaine inconnu → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.10','255.255.255.0','','192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = true;
  link(pc,dns);
  var r = simDNS(pc,'inconnu.com');
  notOk(r.ok);
  ok(r.reason.indexOf('inconnu.com') !== -1 || r.reason.indexOf('non trouvé') !== -1);
});

test('service DNS désactivé → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.10','255.255.255.0','','192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = false;
  link(pc,dns);
  notOk(simDNS(pc,'example.com').ok);
});

/* ── simHTTP ── */
suite('simHTTP — accès HTTP');

test('accès HTTP par IP directe → ok', function() {
  resetNet();
  var pc = mkPC('192.168.1.10'), srv = mkServer('192.168.1.20');
  S.devs[srv].http.on = true; S.devs[srv].http.title = 'Test';
  link(pc,srv);
  var r = simHTTP(pc,'http://192.168.1.20');
  ok(r.ok); eq(r.title,'Test');
});

test('service HTTP désactivé → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.10'), srv = mkServer('192.168.1.20');
  S.devs[srv].http.on = false;
  link(pc,srv);
  notOk(simHTTP(pc,'http://192.168.1.20').ok);
});

test('accès HTTP par hostname (DNS) → ok', function() {
  resetNet();
  var pc = mkPC('192.168.1.10','255.255.255.0','','192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = true; S.devs[dns].dns.records['web.local'] = '192.168.1.20';
  var srv = mkServer('192.168.1.20');
  S.devs[srv].http.on = true; S.devs[srv].http.title = 'Accueil';
  link(pc,dns); link(pc,srv);
  var r = simHTTP(pc,'http://web.local');
  ok(r.ok); eq(r.title,'Accueil'); eq(r.domain,'web.local');
});

test('serveur HTTP introuvable → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.10');
  notOk(simHTTP(pc,'http://192.168.9.99').ok);
});

/* ── getRoutingTable ── */
suite('getRoutingTable — table de routage');

test('routeur 2 interfaces → 2+ routes directes', function() {
  resetNet();
  var rtr = mkRouter('192.168.1.1','255.255.255.0','10.0.0.1','255.0.0.0');
  var rt = getRoutingTable(rtr);
  ok(rt.length >= 2);
  var dests = rt.map(function(r){return r.dest;});
  ok(dests.indexOf('192.168.1.0') !== -1);
  ok(dests.indexOf('10.0.0.0') !== -1);
});

test('non-routeur → table vide', function() {
  resetNet();
  var pc = mkPC('192.168.1.1');
  eq(getRoutingTable(pc).length, 0);
});

/* ── autoRoute ── */
suite('autoRoute — RIP simplifié');

test('deux routeurs voisins → routes échangées', function() {
  resetNet();
  var r1 = mkRouter('192.168.1.1','255.255.255.0','10.0.0.1','255.255.255.0');
  var r2 = mkRouter('10.0.0.2','255.255.255.0','172.16.0.1','255.255.0.0');
  link(r1,r2); autoRoute();
  var dests1 = getRoutingTable(r1).map(function(r){return r.dest;});
  ok(dests1.indexOf('172.16.0.0') !== -1);
  var dests2 = getRoutingTable(r2).map(function(r){return r.dest;});
  ok(dests2.indexOf('192.168.1.0') !== -1);
});

test('autoRoute sur réseau sans routeurs → aucune erreur', function() {
  resetNet();
  mkPC('192.168.1.1'); mkPC('192.168.1.2');
  autoRoute(); ok(true);
});

/* ── checkObjectiveStatic ── */
// API réelle : {check: 'type', params: {champ: valeur, ...}}
// (découverte en lisant le code du template)
suite('checkObjectiveStatic — objectifs statiques');

test('cable_exists : câble entre deux appareils → validé', function() {
  resetNet();
  var pc = mkPC('192.168.1.1','255.255.255.0','','','PC1');
  var srv = mkServer('192.168.1.2');
  S.devs[srv].name = 'Serveur';
  link(pc, srv);
  ok(checkObjectiveStatic({check:'cable_exists', params:{devA:'PC1', devB:'Serveur'}}),
    'cable_exists doit être validé quand les appareils sont câblés');
});

test('cable_exists : pas de câble → non validé', function() {
  resetNet();
  mkPC('192.168.1.1','255.255.255.0','','','PC1');
  var srv = mkServer('192.168.1.2');
  S.devs[srv].name = 'Serveur';
  notOk(checkObjectiveStatic({check:'cable_exists', params:{devA:'PC1', devB:'Serveur'}}));
});

test('ip_configured : IP correcte → validé', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','','PC-Test');
  ok(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC-Test', ip:'192.168.1.10'}}));
});

test('ip_configured : IP incorrecte → non validé', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','','PC-Test');
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC-Test', ip:'192.168.1.99'}}));
});

test('ip_configured : IP non renseignée dans critère → validé dès qu\'une IP existe', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','','PC-Test');
  ok(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC-Test', ip:''}}));
});

test('gateway_configured : passerelle correcte → validé', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','192.168.1.1','','PC-Test');
  ok(checkObjectiveStatic({check:'gateway_configured', params:{dev:'PC-Test', gateway:'192.168.1.1'}}));
});

test('gateway_configured : mauvaise passerelle → non validé', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','192.168.1.254','','PC-Test');
  notOk(checkObjectiveStatic({check:'gateway_configured', params:{dev:'PC-Test', gateway:'192.168.1.1'}}));
});

test('dns_configured : DNS correct → validé', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','8.8.8.8','PC-Test');
  ok(checkObjectiveStatic({check:'dns_configured', params:{dev:'PC-Test', dns:'8.8.8.8'}}));
});

test('dns_configured : DNS incorrect → non validé', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','1.1.1.1','PC-Test');
  notOk(checkObjectiveStatic({check:'dns_configured', params:{dev:'PC-Test', dns:'8.8.8.8'}}));
});

test('dns_configured : critère sans DNS spécifié → validé dès qu\'un DNS existe (Bug4 fix)', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','8.8.8.8','PC-Test');
  // p.dns = '' → doit valider dès qu'un DNS quelconque est configuré
  ok(checkObjectiveStatic({check:'dns_configured', params:{dev:'PC-Test', dns:''}}),
    'Bug4 : dns_configured avec p.dns="" doit valider si un DNS est présent');
});

test('dns_configured : critère sans DNS, PC sans DNS → non validé', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','','PC-Test');  // pas de DNS
  notOk(checkObjectiveStatic({check:'dns_configured', params:{dev:'PC-Test', dns:''}}));
});

test('service_active : HTTP activé → validé', function() {
  resetNet();
  var srv = mkServer('192.168.1.1');
  S.devs[srv].name = 'WebSrv'; S.devs[srv].http.on = true;
  ok(checkObjectiveStatic({check:'service_active', params:{dev:'WebSrv', service:'http'}}));
});

test('service_active : HTTP désactivé → non validé', function() {
  resetNet();
  var srv = mkServer('192.168.1.1');
  S.devs[srv].name = 'WebSrv'; S.devs[srv].http.on = false;
  notOk(checkObjectiveStatic({check:'service_active', params:{dev:'WebSrv', service:'http'}}));
});

test('device_added : appareil présent → validé', function() {
  resetNet();
  mkPC('10.0.0.1','255.255.255.0','','','MonPC');
  ok(checkObjectiveStatic({check:'device_added', params:{newdev:'MonPC'}}));
});

test('device_added : appareil absent → non validé', function() {
  resetNet();
  notOk(checkObjectiveStatic({check:'device_added', params:{newdev:'MonPC'}}));
});

test('device_added : insensible à la casse (Bug3 fix)', function() {
  resetNet();
  mkPC('10.0.0.1','255.255.255.0','','','PC Eleve');
  ok(checkObjectiveStatic({check:'device_added', params:{newdev:'pc eleve'}}),
    'Bug3 : device_added doit être insensible à la casse');
});

/* ── mkDev wifi_router ── */
suite('mkDev — initialisation du wifi_router');

test('wifi_router créé avec un ssid par défaut', function() {
  resetNet();
  var id = mkDev('wifi_router', 10, 10);
  var d = S.devs[id];
  ok(d.ssid, 'ssid doit être initialisé');
  assert(typeof d.ssid === 'string', 'ssid doit être une chaîne');
});

test('wifi_router créé avec dhcp initialisé', function() {
  resetNet();
  var id = mkDev('wifi_router', 10, 10);
  var d = S.devs[id];
  ok(d.dhcp, 'dhcp doit être initialisé');
  assert(typeof d.dhcp.on === 'boolean', 'dhcp.on doit être un booléen');
});

test('isRouter reconnaît le wifi_router créé par mkDev', function() {
  resetNet();
  var id = mkDev('wifi_router', 10, 10);
  ok(isRouter(S.devs[id]), 'isRouter doit retourner true pour un wifi_router');
});

/* ── checkObjectiveStatic — nouveaux types (point 7) ── */
suite('checkObjectiveStatic — wifi_link');

test('wifi_link : lien WiFi présent → validé', function() {
  resetNet();
  var wr = mkWifiRouter('192.168.0.1','255.255.255.0','','TestSSID');
  var d = S.devs[wr]; d.name = 'BoxWiFi';
  var pc = mkPC('192.168.0.10','255.255.255.0','192.168.0.1','','MonPC');
  wifiLink(pc, wr);
  ok(checkObjectiveStatic({check:'wifi_link', params:{devA:'BoxWiFi', devB:'MonPC'}}),
    'wifi_link doit être validé quand le lien WiFi existe');
});

test('wifi_link : lien WiFi absent → non validé', function() {
  resetNet();
  var wr = mkWifiRouter('192.168.0.1','255.255.255.0','','TestSSID');
  var d = S.devs[wr]; d.name = 'BoxWiFi';
  mkPC('192.168.0.10','255.255.255.0','192.168.0.1','','MonPC');
  notOk(checkObjectiveStatic({check:'wifi_link', params:{devA:'BoxWiFi', devB:'MonPC'}}),
    'wifi_link doit échouer sans lien WiFi');
});

test('wifi_link : câble filaire ne compte pas', function() {
  resetNet();
  var wr = mkWifiRouter('192.168.0.1','255.255.255.0','','TestSSID');
  var d = S.devs[wr]; d.name = 'BoxWiFi';
  var pc = mkPC('192.168.0.10','255.255.255.0','192.168.0.1','','MonPC');
  link(pc, wr); // lien filaire (pas wifi)
  notOk(checkObjectiveStatic({check:'wifi_link', params:{devA:'BoxWiFi', devB:'MonPC'}}),
    'wifi_link doit échouer pour un câble ordinaire');
});

suite('checkObjectiveStatic — route_exists');

test('route_exists : route directe présente → validé', function() {
  resetNet();
  var r = mkRouter('192.168.1.1','255.255.255.0','192.168.2.1','255.255.255.0');
  var d = S.devs[r]; d.name = 'R1';
  ok(checkObjectiveStatic({check:'route_exists', params:{dev:'R1', dest:'192.168.1.0'}}),
    'route_exists doit trouver une route directe sur 192.168.1.0');
});

test('route_exists : réseau inexistant → non validé', function() {
  resetNet();
  var r = mkRouter('192.168.1.1','255.255.255.0','192.168.2.1','255.255.255.0');
  var d = S.devs[r]; d.name = 'R1';
  notOk(checkObjectiveStatic({check:'route_exists', params:{dev:'R1', dest:'10.0.0.0'}}),
    'route_exists doit échouer pour un réseau non configuré');
});

test('route_exists : router sans IP → non validé', function() {
  resetNet();
  var r = mkDev('router', 10, 10);
  S.devs[r].name = 'R1';
  notOk(checkObjectiveStatic({check:'route_exists', params:{dev:'R1', dest:'192.168.1.0'}}));
});

suite('checkObjectiveStatic — dns_record');

test('dns_record : enregistrement correct → validé', function() {
  resetNet();
  var srv = mkServer('192.168.1.1');
  var d = S.devs[srv]; d.name = 'DNSSrv';
  d.dns.on = true;
  d.dns.records = {'www.lycee.fr': '192.168.1.10'};
  ok(checkObjectiveStatic({check:'dns_record', params:{dev:'DNSSrv', domain:'www.lycee.fr', ip:'192.168.1.10'}}),
    'dns_record doit valider quand domaine et IP correspondent');
});

test('dns_record : domaine absent → non validé', function() {
  resetNet();
  var srv = mkServer('192.168.1.1');
  var d = S.devs[srv]; d.name = 'DNSSrv';
  d.dns.on = true;
  d.dns.records = {};
  notOk(checkObjectiveStatic({check:'dns_record', params:{dev:'DNSSrv', domain:'www.lycee.fr'}}));
});

test('dns_record : mauvaise IP → non validé', function() {
  resetNet();
  var srv = mkServer('192.168.1.1');
  var d = S.devs[srv]; d.name = 'DNSSrv';
  d.dns.on = true;
  d.dns.records = {'www.lycee.fr': '192.168.1.99'};
  notOk(checkObjectiveStatic({check:'dns_record', params:{dev:'DNSSrv', domain:'www.lycee.fr', ip:'192.168.1.10'}}),
    'dns_record doit échouer si IP ne correspond pas');
});

test('dns_record : DNS inactif → non validé', function() {
  resetNet();
  var srv = mkServer('192.168.1.1');
  var d = S.devs[srv]; d.name = 'DNSSrv';
  d.dns.on = false;
  d.dns.records = {'www.lycee.fr': '192.168.1.10'};
  notOk(checkObjectiveStatic({check:'dns_record', params:{dev:'DNSSrv', domain:'www.lycee.fr'}}),
    'dns_record doit échouer si le service DNS est inactif');
});

suite('checkObjectiveStatic — ssid_configured');

test('ssid_configured : SSID attendu présent → validé', function() {
  resetNet();
  var wr = mkWifiRouter('','','','WiFi-Lycee');
  var d = S.devs[wr]; d.name = 'BoxWiFi';
  ok(checkObjectiveStatic({check:'ssid_configured', params:{dev:'BoxWiFi', ssid:'WiFi-Lycee'}}),
    'ssid_configured doit valider quand le SSID correspond');
});

test('ssid_configured : SSID différent → non validé', function() {
  resetNet();
  var wr = mkWifiRouter('','','','MonWiFi');
  var d = S.devs[wr]; d.name = 'BoxWiFi';
  notOk(checkObjectiveStatic({check:'ssid_configured', params:{dev:'BoxWiFi', ssid:'AutreSSID'}}),
    'ssid_configured doit échouer si le SSID ne correspond pas');
});

test('ssid_configured : sans SSID → valide si un SSID quelconque est défini', function() {
  resetNet();
  var wr = mkWifiRouter('','','','MonWiFi');
  var d = S.devs[wr]; d.name = 'BoxWiFi';
  ok(checkObjectiveStatic({check:'ssid_configured', params:{dev:'BoxWiFi'}}),
    'ssid_configured sans param ssid doit valider si SSID non vide');
});

test('ssid_configured : SSID vide → non validé', function() {
  resetNet();
  var wr = mkWifiRouter('','','','');
  var d = S.devs[wr]; d.name = 'BoxWiFi'; d.ssid = '';
  notOk(checkObjectiveStatic({check:'ssid_configured', params:{dev:'BoxWiFi'}}),
    'ssid_configured doit échouer si le SSID est vide');
});

test('ssid_configured : appareil non-wifi_router → non validé', function() {
  resetNet();
  var pc = mkPC('192.168.1.1','255.255.255.0','','','MonPC');
  notOk(checkObjectiveStatic({check:'ssid_configured', params:{dev:'MonPC'}}),
    'ssid_configured doit échouer sur un PC');
});

/* ─────────────────────────────────────────────────────
   6. BILAN
───────────────────────────────────────────────────── */
var total = _passed + _failed;
console.log('\n' + BOLD + '─'.repeat(55) + RESET);
if (_failed === 0) {
  console.log(GREEN + BOLD + '✅ ' + _passed + '/' + total + ' tests passés — SUCCÈS' + RESET);
} else {
  console.log(RED + BOLD + '❌ ' + _failed + ' échec(s) / ' + total + ' tests' + RESET);
  process.exitCode = 1;
}
console.log('');

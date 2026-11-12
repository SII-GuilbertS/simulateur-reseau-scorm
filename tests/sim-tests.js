/**
 * sim-tests.js — Tests de non-régression du moteur de simulation réseau
 * Usage : node tests/sim-tests.js
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
const SRC = path.join(__dirname, '..', 'scorm-builder.html');
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
  render:           function() {},
  renderLinks:      function() {},
  renderDevs:       function() {},
  showProps:        function() {},
  updSelects:       function() {},
  tpr:              function() {},
  setTermDev:       function() {},
  showTab:          function() {},
  hidePrev:         function() {},
  noSel:            function() {},
  saveToSession:    function() { return true; },
  renderActivityTab:function() {},
  updScore:         function() {},
  alert:            function(msg) { sandbox._lastAlert = msg; },

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

// Assistant « Nouvelle activité » et variantes : bloc du builder, sans interface
const wzMatch = html.match(/\/\* WIZARD-START[\s\S]*?\/\* WIZARD-END \*\//);
if (!wzMatch) { console.error('FATAL: bloc WIZARD non trouvé dans le builder'); process.exit(1); }
try {
  vm.runInContext(wzMatch[0], sandbox);
} catch(e) {
  console.error('FATAL: erreur dans le bloc WIZARD :', e.message);
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
  applyFaults,
  ipMatchesPattern,
} = sandbox;

/* ─────────────────────────────────────────────────────
   3. HARNAIS DE TEST
───────────────────────────────────────────────────── */
let _passed = 0, _failed = 0, _suite = '';
const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m',
      CYAN = '\x1b[36m', BOLD  = '\x1b[1m', DIM = '\x1b[2m';

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

test('ping multi-hop (2 routeurs), routes RIP calculées → ok', function() {
  resetNet();
  var pc1 = mkPC('10.0.1.10','255.255.255.0','10.0.1.1');
  var r1  = mkRouter('10.0.1.1','255.255.255.0','10.0.12.1','255.255.255.0');
  var r2  = mkRouter('10.0.12.2','255.255.255.0','10.0.2.1','255.255.255.0');
  var pc2 = mkPC('10.0.2.10','255.255.255.0','10.0.2.1');
  link(pc1,r1); link(r1,r2); link(r2,pc2);
  sandbox.autoRoute();
  var res = simPing(pc1, '10.0.2.10');
  ok(res.ok); ok(res.router);
});

/* ── Acheminement par les tables de routage ── */
suite('Acheminement — tables de routage, retour, adresses inconnues');

/* pc1 (10.0.1.0/24) — R1 — 10.0.12.0/24 — R2 — pc2 (10.0.2.0/24) */
function twoRouters() {
  var pc1 = mkPC('10.0.1.10','255.255.255.0','10.0.1.1');
  var r1  = mkRouter('10.0.1.1','255.255.255.0','10.0.12.1','255.255.255.0');
  var r2  = mkRouter('10.0.12.2','255.255.255.0','10.0.2.1','255.255.255.0');
  var pc2 = mkPC('10.0.2.10','255.255.255.0','10.0.2.1');
  link(pc1,r1); link(r1,r2); link(r2,pc2);
  return { pc1:pc1, r1:r1, r2:r2, pc2:pc2 };
}
/* Internet — R (WAN 203.0.113.0/24) — LAN 192.168.1.0/24 */
function withInternet() {
  var inet = mkInternet();
  S.devs[inet].ifaces = [{name:'eth0', ip:'203.0.113.1', mask:'255.255.255.0'},
                         {name:'eth1', ip:'8.8.8.8', mask:'255.0.0.0'}];
  var r  = mkRouter('203.0.113.2','255.255.255.0','192.168.1.1','255.255.255.0');
  var pc = mkPC('192.168.1.10','255.255.255.0','192.168.1.1');
  link(inet, r); link(r, pc);
  return { inet:inet, r:r, pc:pc };
}

test('deux routeurs sans routes calculées → échec « pas de route »', function() {
  resetNet();
  var n = twoRouters();
  var res = simPing(n.pc1, '10.0.2.10');
  notOk(res.ok);
  ok(res.reason.indexOf('Pas de route') >= 0, res.reason);
});

test('chaîne de trois routeurs : RIP propage les réseaux de proche en proche', function() {
  resetNet();
  var n = twoRouters();
  var r3  = mkRouter('10.0.2.254','255.255.255.0','10.0.3.1','255.255.255.0');
  var pc3 = mkPC('10.0.3.10','255.255.255.0','10.0.3.1');
  S.devs[n.pc2].ifaces[0].gateway = '10.0.2.1';
  var sw = mkSwitch(); delete S.links[Object.keys(S.links).find(function(k){ var l = S.links[k]; return l.from === n.r2 && l.to === n.pc2; })];
  link(n.r2, sw); link(n.pc2, sw); link(r3, sw); link(r3, pc3);
  sandbox.autoRoute();
  var dests = getRoutingTable(n.r1).map(function(r){ return r.dest; });
  ok(dests.indexOf('10.0.3.0') >= 0, 'R1 apprend le réseau de R3 via R2');
  var res = simPing(n.pc1, '10.0.3.10');
  ok(res.ok, res.reason);
  eq(res.path.join(','), [n.pc1, n.r1, n.r2, r3, pc3].join(','), 'traceroute : le chemin suit les routeurs');
});

test('route la plus précise préférée à une route plus large', function() {
  resetNet();
  var n = twoRouters();
  // R1 : 10.0.0.0/8 vers un routeur inexistant, 10.0.2.0/24 vers R2
  S.devs[n.r1].staticRoutes = [
    {dest:'10.0.0.0', mask:'255.0.0.0', gw:'10.0.12.99', iface:'eth1', type:'static'},
    {dest:'10.0.2.0', mask:'255.255.255.0', gw:'10.0.12.2', iface:'eth1', type:'static'}];
  S.devs[n.r2].staticRoutes = [{dest:'10.0.1.0', mask:'255.255.255.0', gw:'10.0.12.1', iface:'eth0', type:'static'}];
  ok(simPing(n.pc1, '10.0.2.10').ok);
});

test('l\'aller arrive mais le retour échoue → échec expliqué', function() {
  resetNet();
  var n = twoRouters();
  S.devs[n.r1].staticRoutes = [{dest:'10.0.2.0', mask:'255.255.255.0', gw:'10.0.12.2', iface:'eth1', type:'static'}];
  var res = simPing(n.pc1, '10.0.2.10');
  notOk(res.ok);
  ok(res.reason.indexOf('la réponse ne revient pas') >= 0, res.reason);
});

test('boucle de routage détectée', function() {
  resetNet();
  var n = twoRouters();
  S.devs[n.r1].staticRoutes = [{dest:'10.0.9.0', mask:'255.255.255.0', gw:'10.0.12.2', iface:'eth1', type:'static'}];
  S.devs[n.r2].staticRoutes = [{dest:'10.0.9.0', mask:'255.255.255.0', gw:'10.0.12.1', iface:'eth0', type:'static'}];
  var pc9 = mkPC('10.0.9.10');
  var res = simPing(n.pc1, '10.0.9.10');
  notOk(res.ok);
  ok(res.reason.indexOf('Boucle') >= 0, res.reason);
});

test('routage automatique décoché : le routeur n\'apprend rien', function() {
  resetNet();
  var n = twoRouters();
  S.devs[n.r1].autoRouteEnabled = false;
  sandbox.computeRoutes(true);
  notOk(simPing(n.pc1, '10.0.2.10').ok);
  S.devs[n.r1].autoRouteEnabled = true;
  sandbox.computeRoutes(true);
  ok(simPing(n.pc1, '10.0.2.10').ok);
});

test('routes RIP recalculées : une route devenue fausse disparaît', function() {
  resetNet();
  var n = twoRouters();
  sandbox.autoRoute();
  ok(simPing(n.pc1, '10.0.2.10').ok);
  S.devs[n.r2].ifaces[0].ip = '10.0.99.2';     // R2 n'est plus sur le réseau de transit
  sandbox.autoRoute();
  notOk(getRoutingTable(n.r1).some(function(r){ return r.dest === '10.0.2.0'; }));
  notOk(simPing(n.pc1, '10.0.2.10').ok);
});

test('route par défaut : une adresse publique quelconque est joignable via Internet', function() {
  resetNet();
  var n = withInternet();
  sandbox.autoRoute();
  ok(getRoutingTable(n.r).some(function(r){ return r.dest === '0.0.0.0' && r.mask === '0.0.0.0'; }), 'route par défaut apprise');
  var res = simPing(n.pc, '1.1.1.1');
  ok(res.ok, res.reason); ok(res.internet);
  ok(simPing(n.pc, '8.8.8.8').ok, 'adresse de l\'appareil Internet');
});

test('réponse depuis Internet : pas de route retour nécessaire (NAT)', function() {
  resetNet();
  var n = withInternet();
  sandbox.autoRoute();
  S.devs[n.inet].staticRoutes = [];   // Internet ne connaît pas le réseau privé
  ok(simPing(n.pc, '8.8.8.8').ok);
});

test('réseau privé absent de la table : la route par défaut l\'envoie vers Internet, qui le refuse', function() {
  resetNet();
  var n = withInternet();
  var r2 = mkRouter('192.168.1.2','255.255.255.0','192.168.5.1','255.255.255.0');
  var far = mkPC('192.168.5.10','255.255.255.0','192.168.5.1');
  link(r2, n.pc); link(r2, far);
  S.devs[r2].autoRouteEnabled = false;
  sandbox.computeRoutes(true);
  S.devs[n.r].staticRoutes = S.devs[n.r].staticRoutes.filter(function(r){ return r.dest !== '192.168.5.0'; });
  var res = simPing(n.pc, '192.168.5.10');
  notOk(res.ok);
  ok(res.reason.indexOf('Internet n\'achemine pas les adresses privées') >= 0, res.reason);
});

test('adresse publique sans accès à Internet → échec', function() {
  resetNet();
  var n = twoRouters();
  sandbox.autoRoute();
  var res = simPing(n.pc1, '1.1.1.1');
  notOk(res.ok);
  ok(res.reason.indexOf('Internet') >= 0, res.reason);
});

test('adresse privée que personne ne porte → hôte inconnu, même avec Internet', function() {
  resetNet();
  var n = withInternet();
  sandbox.autoRoute();
  var res = simPing(n.pc, '192.168.1.77');
  notOk(res.ok); ok(res.reason.indexOf('inconnu') >= 0, res.reason);
  notOk(simPing(n.pc, '10.99.99.2').ok, 'adresse privée hors du schéma');
});

test('adresse publique d\'un réseau du schéma que personne ne porte → hôte inconnu', function() {
  resetNet();
  var n = withInternet();
  sandbox.autoRoute();
  notOk(simPing(n.pc, '203.0.113.50').ok);
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
  ok(r.ok); eq(r.title,'Accueil'); eq(r.domain,'web.local'); eq(r.ip,'192.168.1.20');
  // Sans affichage : la résolution reste dans le résultat, même en cas d'échec, pour l'appelant
  eq(simHTTP.toString().indexOf('addLog'), -1);
  S.devs[srv].http.on = false;
  r = simHTTP(pc,'http://web.local');
  notOk(r.ok); eq(r.domain,'web.local'); eq(r.ip,'192.168.1.20');
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
suite('Adresses au choix — plages et joker');

test('ipMatchesPattern : exacte, joker, plage et plage sur plusieurs octets', function() {
  ok(ipMatchesPattern('192.168.1.10','192.168.1.10'));
  notOk(ipMatchesPattern('192.168.1.11','192.168.1.10'));
  ok(ipMatchesPattern('192.168.1.77','192.168.1.*'));
  notOk(ipMatchesPattern('192.168.2.77','192.168.1.*'));
  ok(ipMatchesPattern('192.168.1.10','192.168.1.10-50'));
  ok(ipMatchesPattern('192.168.1.50','192.168.1.10-50'));
  notOk(ipMatchesPattern('192.168.1.51','192.168.1.10-50'));
  notOk(ipMatchesPattern('192.168.1.9','192.168.1.10-50'));
  ok(ipMatchesPattern('10.3.0.5','10.1-4.*.*'));
  notOk(ipMatchesPattern('10.5.0.5','10.1-4.*.*'));
});

test('ipMatchesPattern : adresse vide ou mal formée → refusée', function() {
  notOk(ipMatchesPattern('','192.168.1.*'));
  notOk(ipMatchesPattern('192.168.1','192.168.1.*'));
  notOk(ipMatchesPattern('192.168.1.abc','192.168.1.*'));
  notOk(ipMatchesPattern('192.168.1.300','192.168.1.*'));
});

test('ip_configured joker : adresse hôte libre du réseau → validé', function() {
  resetNet();
  mkPC('192.168.1.42','255.255.255.0','','','PC1');
  ok(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.*'}}));
});

test('ip_configured joker : adresse du réseau ou de diffusion → non validé', function() {
  resetNet();
  var pc = mkPC('192.168.1.0','255.255.255.0','','','PC1');
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.*'}}), 'adresse du réseau');
  S.devs[pc].ifaces[0].ip = '192.168.1.255';
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.*'}}), 'diffusion');
});

test('ip_configured joker : la diffusion dépend du masque de l\'appareil (/26)', function() {
  resetNet();
  var pc = mkPC('192.168.1.63','255.255.255.192','','','PC1');
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.*'}}), '.63 est la diffusion en /26');
  S.devs[pc].ifaces[0].ip = '192.168.1.64';
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.*'}}), '.64 est une adresse de réseau en /26');
  S.devs[pc].ifaces[0].ip = '192.168.1.65';
  ok(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.*'}}));
});

test('ip_configured joker : adresse déjà prise par un autre appareil → non validé', function() {
  resetNet();
  mkPC('192.168.1.42','255.255.255.0','','','PC1');
  var srv = mkServer('192.168.1.42');
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.*'}}));
  S.devs[srv].ifaces[0].ip = '192.168.1.43';
  ok(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.*'}}));
});

test('ip_configured plage : dans la plage → validé, hors plage → non validé', function() {
  resetNet();
  var pc = mkPC('192.168.1.30','255.255.255.0','','','PC1');
  ok(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.10-50'}}));
  S.devs[pc].ifaces[0].ip = '192.168.1.60';
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.10-50'}}));
});

test('ip_configured plage + masque imposé : mauvais masque → non validé', function() {
  resetNet();
  mkPC('192.168.1.30','255.255.0.0','','','PC1');
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC1', ip:'192.168.1.10-50', mask:'255.255.255.0'}}));
});

test('gateway_configured plage : passerelle dans la plage → validé', function() {
  resetNet();
  mkPC('192.168.1.30','255.255.255.0','192.168.1.254','','PC1');
  ok(checkObjectiveStatic({check:'gateway_configured', params:{dev:'PC1', gateway:'192.168.1.250-254'}}));
  notOk(checkObjectiveStatic({check:'gateway_configured', params:{dev:'PC1', gateway:'192.168.1.1-9'}}));
});

test('device_added sans nom : un appareil du réseau de départ ne compte pas', function() {
  resetNet();
  var old = mkPC('192.168.1.10','255.255.255.0','','','PC-Depart');
  sandbox.START_DEV_IDS = [old];
  try {
    notOk(checkObjectiveStatic({check:'device_added', params:{type:'pc', ip:'192.168.1.*'}}));
    mkPC('192.168.1.11','255.255.255.0','','','PC-Nouveau');
    ok(checkObjectiveStatic({check:'device_added', params:{type:'pc', ip:'192.168.1.*'}}));
  } finally { sandbox.START_DEV_IDS = null; }
});

test('device_added sans nom : sans réseau de départ connu, tout appareil compte', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','','PC1');
  ok(checkObjectiveStatic({check:'device_added', params:{type:'pc'}}));
});

test('device_added avec nom : un appareil du départ reste « présent »', function() {
  resetNet();
  var old = mkServer('192.168.1.100'); S.devs[old].name = 'Serveur';
  sandbox.START_DEV_IDS = [old];
  try {
    ok(checkObjectiveStatic({check:'device_added', params:{newdev:'Serveur', type:'server'}}));
  } finally { sandbox.START_DEV_IDS = null; }
});

test('device_added sans nom : réseau de départ lu dans STARTER_NETWORK', function() {
  resetNet();
  var old = mkPC('192.168.1.10','255.255.255.0','','','PC-Depart');
  sandbox.STARTER_NETWORK = { devs:{}, links:{} };
  sandbox.STARTER_NETWORK.devs[old] = S.devs[old];
  try {
    notOk(checkObjectiveStatic({check:'device_added', params:{type:'pc'}}));
  } finally { sandbox.STARTER_NETWORK = null; }
});

test('device_added : IP au choix doit être utilisable, passerelle en joker', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','','PC-A');
  var nw = mkPC('192.168.1.10','255.255.255.0','192.168.1.1','','PC-B');
  sandbox.START_DEV_IDS = Object.keys(S.devs).filter(function(id){ return id !== nw; });
  try {
    notOk(checkObjectiveStatic({check:'device_added', params:{ip:'192.168.1.*'}}), 'IP en doublon');
    S.devs[nw].ifaces[0].ip = '192.168.1.20';
    ok(checkObjectiveStatic({check:'device_added', params:{ip:'192.168.1.*', gateway:'192.168.1.*'}}));
    notOk(checkObjectiveStatic({check:'device_added', params:{ip:'192.168.1.*', gateway:'10.0.0.*'}}));
  } finally { sandbox.START_DEV_IDS = null; }
});

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

/* ── Modèles de terminaux (d.kind) ── */
suite('Modèles de terminaux — connexions imposées par le modèle');

function linkCount(id, wifi) {
  return Object.values(S.links).filter(function(l) {
    return (l.from === id || l.to === id) && ((l.type === 'wifi') === !!wifi);
  }).length;
}

test('mkDev pc avec kind : modèle, nom et icône', function() {
  resetNet();
  var id = mkDev('pc', 10, 10, 'phone');
  eq(S.devs[id].kind, 'phone');
  eq(S.devs[id].name, 'Téléphone 1');
  eq(sandbox.devIcon(S.devs[id]), '📱');
  eq(S.devs[id].type, 'pc');
});
test('mkDev ignore un kind inconnu ou sur un autre type', function() {
  resetNet();
  notOk(S.devs[mkDev('pc', 10, 10, 'grille-pain')].kind);
  notOk(S.devs[mkDev('server', 10, 10, 'laptop')].kind);
});
test('PC fixe : câble vers un switch accepté', function() {
  resetNet();
  var pc = mkDev('pc', 10, 10, 'desktop'), sw = mkSwitch();
  ok(addLink(pc, sw));
});
test('PC fixe → Box WiFi : liaison par câble, pas en WiFi', function() {
  resetNet();
  var pc = mkDev('pc', 10, 10, 'desktop'), box = mkWifiRouter();
  var lid = addLink(pc, box);
  ok(lid);
  notOk(S.links[lid].type === 'wifi');
});
test('Téléphone : câble vers un switch refusé', function() {
  resetNet();
  var ph = mkDev('pc', 10, 10, 'phone'), sw = mkSwitch();
  eq(addLink(ph, sw), null);
  eq(Object.keys(S.links).length, 0);
});
test('Tablette → Box WiFi : liaison WiFi acceptée', function() {
  resetNet();
  var tb = mkDev('pc', 10, 10, 'tablet'), box = mkWifiRouter();
  var lid = addLink(box, tb);
  ok(lid);
  eq(S.links[lid].type, 'wifi');
});
test('PC portable : 1 câble + 1 WiFi', function() {
  resetNet();
  var lp = mkDev('pc', 10, 10, 'laptop'), sw = mkSwitch(), box = mkWifiRouter();
  ok(addLink(lp, sw));
  ok(addLink(lp, box));
  eq(linkCount(lp, false), 1);
  eq(linkCount(lp, true), 1);
});
test('PC sans modèle (ancien scénario) : comportement historique', function() {
  resetNet();
  var pc = mkDev('pc', 10, 10), sw = mkSwitch(), box = mkWifiRouter();
  notOk(S.devs[pc].kind);
  ok(addLink(pc, sw));
  var lid = addLink(pc, box);
  eq(S.links[lid].type, 'wifi');
});
test('setPcKind : passer en téléphone supprime le câble', function() {
  resetNet();
  var pc = mkDev('pc', 10, 10, 'laptop'), sw = mkSwitch(), box = mkWifiRouter();
  addLink(pc, sw); addLink(pc, box);
  ok(sandbox.setPcKind(pc, 'phone'));
  eq(S.devs[pc].kind, 'phone');
  eq(linkCount(pc, false), 0);
  eq(linkCount(pc, true), 1);
});
test('setPcKind : passer en PC fixe supprime le WiFi', function() {
  resetNet();
  var pc = mkDev('pc', 10, 10, 'phone'), box = mkWifiRouter();
  addLink(pc, box);
  ok(sandbox.setPcKind(pc, 'desktop'));
  eq(linkCount(pc, true), 0);
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

/* ── applyFaults — mode panne ── */
suite('applyFaults — injection de pannes dans le réseau');

test('bad_ip : modifie l\'IP principale du PC', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','192.168.1.1','192.168.1.254','MonPC');
  sandbox.applyFaults([{type:'bad_ip', dev:'MonPC', badValue:'192.168.99.99'}]);
  var d = Object.values(S.devs).find(function(x){return x.name==='MonPC';});
  eq(d.ifaces[0].ip, '192.168.99.99', 'bad_ip doit remplacer l\'IP');
});

test('bad_mask : modifie le masque du PC', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','192.168.1.1','','MonPC');
  sandbox.applyFaults([{type:'bad_mask', dev:'MonPC', badValue:'255.255.0.0'}]);
  var d = Object.values(S.devs).find(function(x){return x.name==='MonPC';});
  eq(d.ifaces[0].mask, '255.255.0.0', 'bad_mask doit remplacer le masque');
});

test('bad_gateway : modifie la passerelle du PC', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','192.168.1.1','','MonPC');
  sandbox.applyFaults([{type:'bad_gateway', dev:'MonPC', badValue:'10.0.0.1'}]);
  var d = Object.values(S.devs).find(function(x){return x.name==='MonPC';});
  eq(d.ifaces[0].gateway, '10.0.0.1', 'bad_gateway doit remplacer la passerelle');
});

test('bad_dns : modifie le serveur DNS du PC', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','192.168.1.1','192.168.1.254','MonPC');
  sandbox.applyFaults([{type:'bad_dns', dev:'MonPC', badValue:'8.8.8.8'}]);
  var d = Object.values(S.devs).find(function(x){return x.name==='MonPC';});
  eq(d.ifaces[0].dns, '8.8.8.8', 'bad_dns doit remplacer le DNS');
});

test('service_down : désactive le service HTTP', function() {
  resetNet();
  var srv = mkServer('192.168.1.1'); S.devs[srv].name='Web'; S.devs[srv].http.on=true;
  sandbox.applyFaults([{type:'service_down', dev:'Web', service:'http'}]);
  ok(!S.devs[srv].http.on, 'service_down http doit désactiver HTTP');
});

test('service_down : désactive le service DNS', function() {
  resetNet();
  var srv = mkServer('192.168.1.1'); S.devs[srv].name='DNS'; S.devs[srv].dns.on=true;
  sandbox.applyFaults([{type:'service_down', dev:'DNS', service:'dns'}]);
  ok(!S.devs[srv].dns.on, 'service_down dns doit désactiver DNS');
});

test('service_down : désactive le service DHCP', function() {
  resetNet();
  var srv = mkServer('192.168.1.1'); S.devs[srv].name='SrvDHCP'; S.devs[srv].dhcp.on=true;
  sandbox.applyFaults([{type:'service_down', dev:'SrvDHCP', service:'dhcp'}]);
  ok(!S.devs[srv].dhcp.on, 'service_down dhcp doit désactiver DHCP');
});

test('missing_cable : supprime le câble entre deux appareils', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1','255.255.255.0','','','PC1');
  var pc2 = mkPC('192.168.1.2','255.255.255.0','','','PC2');
  link(pc1, pc2);
  assert(Object.keys(S.links).length === 1, 'setup: un câble doit exister');
  sandbox.applyFaults([{type:'missing_cable', devA:'PC1', devB:'PC2'}]);
  eq(Object.keys(S.links).length, 0, 'missing_cable doit supprimer le câble');
});

test('missing_cable : câble inexistant → pas d\'erreur', function() {
  resetNet();
  mkPC('192.168.1.1','255.255.255.0','','','PC1');
  mkPC('192.168.1.2','255.255.255.0','','','PC2');
  // pas de câble entre eux
  sandbox.applyFaults([{type:'missing_cable', devA:'PC1', devB:'PC2'}]);
  ok(true, 'missing_cable sans câble ne doit pas lever d\'erreur');
});

test('ssid_wrong : modifie le SSID de la Box WiFi', function() {
  resetNet();
  var wr = mkWifiRouter('','','','BonSSID'); S.devs[wr].name='Box';
  sandbox.applyFaults([{type:'ssid_wrong', dev:'Box', badValue:'MauvaisSSID'}]);
  eq(S.devs[wr].ssid, 'MauvaisSSID', 'ssid_wrong doit remplacer le SSID');
});

test('applyFaults : appareil inconnu → ignoré sans erreur', function() {
  resetNet();
  sandbox.applyFaults([{type:'bad_ip', dev:'AppAreilInexistant', badValue:'1.2.3.4'}]);
  ok(true, 'une panne sur un appareil inconnu doit être ignorée silencieusement');
});

test('applyFaults : plusieurs pannes appliquées ensemble', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','192.168.1.1','192.168.1.254','PC1');
  var srv = mkServer('192.168.1.100'); S.devs[srv].name='Srv1'; S.devs[srv].http.on=true;
  sandbox.applyFaults([
    {type:'bad_ip',       dev:'PC1',  badValue:'10.10.10.10'},
    {type:'service_down', dev:'Srv1', service:'http'}
  ]);
  var pc = Object.values(S.devs).find(function(x){return x.name==='PC1';});
  eq(pc.ifaces[0].ip, '10.10.10.10', 'première panne appliquée');
  ok(!S.devs[srv].http.on, 'deuxième panne appliquée');
});

test('applyFaults : correction détectable via checkObjectiveStatic', function() {
  // Scenario complet : panne bad_ip → élève fixe → objectif validé
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','192.168.1.1','192.168.1.254','PC-Eleve');
  // 1. Appliquer la panne
  sandbox.applyFaults([{type:'bad_ip', dev:'PC-Eleve', badValue:'192.168.99.99'}]);
  // 2. Vérifier que l'objectif de correction échoue encore
  notOk(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC-Eleve', ip:'192.168.1.10'}}),
    'avant correction : objectif ne doit pas être validé');
  // 3. L\'élève corrige l\'IP
  var d = Object.values(S.devs).find(function(x){return x.name==='PC-Eleve';});
  d.ifaces[0].ip = '192.168.1.10';
  // 4. Objectif maintenant validé
  ok(checkObjectiveStatic({check:'ip_configured', params:{dev:'PC-Eleve', ip:'192.168.1.10'}}),
    'après correction : objectif doit être validé');
});

/* ── Helpers : activité, terminal et LMS ── */
function setupActivity(objectives, masteryscore) {
  resetNet();
  sandbox.ACTIVITY_CONFIG = {
    title:'Test', instructions:'',
    masteryscore: masteryscore === undefined ? 60 : masteryscore,
    objectives: objectives,
  };
  sandbox.ACTIVITY_RESULTS = {};
  sandbox.ACTIVITY_PROOFS = {};
  sandbox.START_DEV_IDS = null;
}

function objective(id, check, params, points) {
  return { id:id, label:'Objectif '+id, check:check, params:params||{},
           points: points === undefined ? 10 : points };
}

function done(id) { return !!sandbox.ACTIVITY_RESULTS[id]; }

function term(devId, command) {
  S.termDev = devId;
  sandbox.document.getElementById('tinput').value = command;
  sandbox.termExec();
}

function browse(devId, url) {
  sandbox.document.getElementById('bd-sel').value = devId;
  sandbox.document.getElementById('burl').value = url;
  sandbox.browGo();
}

/* PC-Alice, un serveur DNS et un serveur web sur le même switch. */
function makeLan() {
  var sw = mkSwitch();
  var pc = mkPC('192.168.1.10','255.255.255.0','','192.168.1.53','PC-Alice');
  var dns = mkServer('192.168.1.53'); S.devs[dns].name = 'Srv-DNS';
  S.devs[dns].dns.on = true;
  S.devs[dns].dns.records['lycee.local'] = '192.168.1.20';
  var web = mkServer('192.168.1.20'); S.devs[web].name = 'Srv-Web';
  S.devs[web].http.on = true;
  link(pc,sw); link(dns,sw); link(web,sw);
  return { pc:pc, dns:dns, web:web, sw:sw };
}

function makeLMS(initial, initResult) {
  var api = {
    data: Object.assign({}, initial),
    commits: 0, finishes: 0, sets: 0,
    LMSInitialize: function() { return initResult === undefined ? 'true' : initResult; },
    LMSGetValue:   function(k) { return api.data[k] || ''; },
    LMSSetValue:   function(k, v) { api.data[k] = v; api.sets++; return 'true'; },
    LMSCommit:     function() { api.commits++; return 'true'; },
    LMSFinish:     function() { api.finishes++; return 'true'; },
  };
  return api;
}

function withLMS(api, fn) {
  sandbox.window.API = api;
  sandbox.window.parent = sandbox.window;
  try {
    sandbox.scormInit();
    fn(api);
  } finally {
    delete sandbox.window.API;
    delete sandbox.window.parent;
    sandbox._api = null;
    sandbox._apiOk = false;
  }
}

function withStorage(fn) {
  var store = {}, original = sandbox.localStorage;
  sandbox.localStorage = {
    getItem:    function(k) { return k in store ? store[k] : null; },
    setItem:    function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
  };
  try { fn(store); } finally { sandbox.localStorage = original; }
}

/* ── checkDynamicObjective — règles de validation ── */
suite('checkDynamicObjective — règles de validation');

test('ping_success : source et cible (IP) correctes → validé', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'192.168.1.20'})]);
  checkDynamicObjective('ping_success',{from:'PC-Alice',to:'192.168.1.20'});
  ok(done(1));
});

test('ping_success : cible donnée par nom d\'appareil → comparée à son IP', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'Srv-Web'})]);
  var web = mkServer('192.168.1.20'); S.devs[web].name = 'Srv-Web';
  checkDynamicObjective('ping_success',{from:'PC-Alice',to:'192.168.1.20'});
  ok(done(1));
});

test('ping_success : mauvaise source → non validé', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'192.168.1.20'})]);
  checkDynamicObjective('ping_success',{from:'PC-Bob',to:'192.168.1.20'});
  notOk(done(1));
});

test('ping_success : mauvaise cible → non validé', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'192.168.1.20'})]);
  checkDynamicObjective('ping_success',{from:'PC-Alice',to:'192.168.1.99'});
  notOk(done(1));
});

test('ping_success : sans paramètre → tout ping réussi valide', function() {
  setupActivity([objective(1,'ping_success',{})]);
  checkDynamicObjective('ping_success',{from:'PC-Bob',to:'10.0.0.1'});
  ok(done(1));
});

test('dns_success : domaine attendu → validé', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice',domain:'lycee.local'})]);
  checkDynamicObjective('dns_success',{from:'PC-Alice',domain:'lycee.local'});
  ok(done(1));
});

test('dns_success : autre domaine → non validé', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice',domain:'lycee.local'})]);
  checkDynamicObjective('dns_success',{from:'PC-Alice',domain:'autre.local'});
  notOk(done(1));
});

test('http_success : URL normalisée (http://, casse, / final)', function() {
  setupActivity([objective(1,'http_success',{from:'PC-Alice',url:'www.lycee.fr'})]);
  checkDynamicObjective('http_success',{from:'PC-Alice',url:'HTTP://WWW.Lycee.fr/'});
  ok(done(1));
});

test('http_success : autre URL → non validé', function() {
  setupActivity([objective(1,'http_success',{from:'PC-Alice',url:'www.lycee.fr'})]);
  checkDynamicObjective('http_success',{from:'PC-Alice',url:'www.autre.fr'});
  notOk(done(1));
});

test('dhcp_success : bon appareil → validé, autre appareil → non validé', function() {
  setupActivity([objective(1,'dhcp_success',{from:'PC-Alice'}), objective(2,'dhcp_success',{from:'PC-Bob'})]);
  checkDynamicObjective('dhcp_success',{from:'PC-Alice',ip:'192.168.1.100'});
  ok(done(1)); notOk(done(2));
});

test('un événement ne valide pas un objectif d\'un autre type', function() {
  setupActivity([objective(1,'dns_success',{}), objective(2,'http_success',{})]);
  checkDynamicObjective('ping_success',{from:'PC-Alice',to:'192.168.1.20'});
  notOk(done(1)); notOk(done(2));
});

test('validation → score mis à jour', function() {
  setupActivity([objective(1,'ping_success',{},25), objective(2,'dns_success',{},75)]);
  checkDynamicObjective('ping_success',{from:'PC-Alice',to:'192.168.1.20'});
  eq(S.score, 25);
});

test('sans ACTIVITY_CONFIG → aucune erreur', function() {
  resetNet();
  sandbox.ACTIVITY_CONFIG = null;
  checkDynamicObjective('ping_success',{from:'PC-Alice',to:'192.168.1.20'});
  sandbox.checkAllObjectives();
  ok(true);
});

/* ── Du terminal et du navigateur jusqu'à l'objectif ── */
suite('Commandes élève → validation des objectifs');

test('ping réussi au terminal → ping_success validé', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'Srv-Web'})]);
  var n = makeLan();
  term(n.pc,'ping 192.168.1.20');
  ok(done(1));
});

test('ping échoué au terminal → ping_success non validé', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'192.168.1.99'})]);
  var n = makeLan();
  term(n.pc,'ping 192.168.1.99');
  notOk(done(1));
});

test('ping par nom de domaine → dns_success et ping_success validés', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice',domain:'lycee.local'}),
                 objective(2,'ping_success',{from:'PC-Alice',to:'Srv-Web'})]);
  var n = makeLan();
  term(n.pc,'ping lycee.local');
  ok(done(1)); ok(done(2));
});

test('nslookup réussi → dns_success validé', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice',domain:'lycee.local'})]);
  var n = makeLan();
  term(n.pc,'nslookup lycee.local');
  ok(done(1));
});

test('nslookup sur serveur DNS arrêté → dns_success non validé', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice',domain:'lycee.local'})]);
  var n = makeLan();
  S.devs[n.dns].dns.on = false;
  term(n.pc,'nslookup lycee.local');
  notOk(done(1));
});

test('nslookup en majuscules → dns_success validé', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice',domain:'lycee.local'})]);
  var n = makeLan();
  term(n.pc,'nslookup LYCEE.LOCAL');
  ok(done(1));
});

test('ping en majuscules → dns_success validé, domaine de l\'objectif en majuscules accepté', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice',domain:'Lycee.Local'})]);
  var n = makeLan();
  term(n.pc,'ping LYCEE.LOCAL');
  ok(done(1));
});

test('dhcp au terminal → dhcp_success validé et IP appliquée', function() {
  setupActivity([objective(1,'dhcp_success',{from:'PC-Alice'})]);
  var sw = mkSwitch(), pc = mkPC('','255.255.255.0','','','PC-Alice');
  var srv = mkServer('192.168.1.1');
  S.devs[srv].dhcp = {on:true,start:'192.168.1.100',end:'192.168.1.200',mask:'255.255.255.0',gateway:'192.168.1.1',dns:''};
  link(pc,sw); link(srv,sw);
  term(pc,'dhcp');
  ok(done(1));
  ok(S.devs[pc].ifaces[0].ip.indexOf('192.168.1.') === 0);
});

test('dhcp sans serveur → dhcp_success non validé', function() {
  setupActivity([objective(1,'dhcp_success',{from:'PC-Alice'})]);
  var pc = mkPC('','255.255.255.0','','','PC-Alice');
  term(pc,'dhcp');
  notOk(done(1));
});

test('navigateur : page atteinte → http_success et dns_success validés', function() {
  setupActivity([objective(1,'http_success',{from:'PC-Alice',url:'lycee.local'}),
                 objective(2,'dns_success',{from:'PC-Alice',domain:'lycee.local'})]);
  var n = makeLan();
  browse(n.pc,'http://lycee.local/');
  ok(done(1)); ok(done(2));
});

test('navigateur : service HTTP arrêté → http_success non validé', function() {
  setupActivity([objective(1,'http_success',{from:'PC-Alice',url:'lycee.local'})]);
  var n = makeLan();
  S.devs[n.web].http.on = false;
  browse(n.pc,'lycee.local');
  notOk(done(1));
});

/* ── Score ── */
suite('Score de l\'activité');

test('score proportionnel aux points et arrondi', function() {
  setupActivity([objective(1,'ping_success',{},1), objective(2,'dns_success',{},2)]);
  sandbox.ACTIVITY_RESULTS[2] = true;
  sandbox.updateActivityScore();
  eq(S.score, 67);
});

test('tous les objectifs atteints → 100', function() {
  setupActivity([objective(1,'ping_success',{},30), objective(2,'dns_success',{},70)]);
  sandbox.ACTIVITY_RESULTS[1] = true; sandbox.ACTIVITY_RESULTS[2] = true;
  sandbox.updateActivityScore();
  eq(S.score, 100);
});

test('aucun point défini → score 0 et non NaN', function() {
  setupActivity([{id:1,label:'Sans points',check:'ping_success',params:{}}]);
  sandbox.ACTIVITY_RESULTS[1] = true;
  sandbox.updateActivityScore();
  eq(S.score, 0);
});

test('checkAllObjectives valide les statiques et calcule le score', function() {
  setupActivity([objective(1,'ip_configured',{dev:'PC1',ip:'192.168.1.10'},40),
                 objective(2,'ip_configured',{dev:'PC1',ip:'10.0.0.1'},60)]);
  mkPC('192.168.1.10','255.255.255.0','','','PC1');
  sandbox.checkAllObjectives();
  ok(done(1)); notOk(done(2));
  eq(S.score, 40);
});

test('checkAllObjectives ne valide jamais un objectif dynamique', function() {
  setupActivity([objective(1,'ping_success',{}), objective(2,'dhcp_success',{})]);
  mkPC('192.168.1.10');
  sandbox.checkAllObjectives();
  notOk(done(1)); notOk(done(2));
});

/* ── Le score suit l'état du réseau ── */
suite('Objectifs perdus quand l\'élève casse sa configuration');

test('statique : configuration cassée → objectif perdu et score baissé', function() {
  setupActivity([objective(1,'ip_configured',{dev:'PC1',ip:'192.168.1.10'},100)]);
  var pc = mkPC('192.168.1.10','255.255.255.0','','','PC1');
  sandbox.checkAllObjectives();
  ok(done(1)); eq(S.score, 100);
  S.devs[pc].ifaces[0].ip = '10.0.0.1';
  sandbox.checkAllObjectives();
  notOk(done(1));
  eq(S.score, 0);
});

test('statique : configuration réparée → objectif regagné', function() {
  setupActivity([objective(1,'ip_configured',{dev:'PC1',ip:'192.168.1.*'},100)]);
  var pc = mkPC('192.168.1.10','255.255.255.0','','','PC1');
  sandbox.checkAllObjectives();
  S.devs[pc].ifaces[0].ip = '192.168.1.0';
  sandbox.checkAllObjectives();
  notOk(done(1));
  S.devs[pc].ifaces[0].ip = '192.168.1.12';
  sandbox.checkAllObjectives();
  ok(done(1)); eq(S.score, 100);
});

test('ping : câble retiré → objectif perdu, câble remis → regagné sans retaper la commande', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'Srv-Web'},100)]);
  var n = makeLan();
  term(n.pc,'ping 192.168.1.20');
  ok(done(1));
  var lid = Object.keys(S.links).find(function(k){ return S.links[k].from === n.web || S.links[k].to === n.web; });
  delete S.links[lid];
  sandbox.checkAllObjectives();
  notOk(done(1)); eq(S.score, 0);
  link(n.web, n.sw);
  sandbox.checkAllObjectives();
  ok(done(1)); eq(S.score, 100);
});

test('ping sans paramètre : la commande réussie est rejouée', function() {
  setupActivity([objective(1,'ping_success',{},100)]);
  var n = makeLan();
  term(n.pc,'ping 192.168.1.20');
  ok(done(1));
  S.devs[n.pc].ifaces[0].ip = '10.0.0.10';
  sandbox.checkAllObjectives();
  notOk(done(1));
});

test('ping vers un appareil nommé : suit son changement d\'adresse', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'Srv-Web'},100)]);
  var n = makeLan();
  term(n.pc,'ping 192.168.1.20');
  S.devs[n.web].ifaces[0].ip = '192.168.1.21';
  sandbox.checkAllObjectives();
  ok(done(1), 'le serveur reste joignable à sa nouvelle adresse');
});

test('DNS : service arrêté après validation → objectif perdu', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice',domain:'lycee.local'},100)]);
  var n = makeLan();
  term(n.pc,'nslookup lycee.local');
  ok(done(1));
  S.devs[n.dns].dns.on = false;
  sandbox.checkAllObjectives();
  notOk(done(1));
});

test('HTTP : serveur web arrêté après validation → objectif perdu', function() {
  setupActivity([objective(1,'http_success',{from:'PC-Alice',url:'lycee.local'},100)]);
  var n = makeLan();
  browse(n.pc,'lycee.local');
  ok(done(1));
  S.devs[n.web].http.on = false;
  sandbox.checkAllObjectives();
  notOk(done(1));
});

test('DHCP : adresse reçue remplacée à la main → objectif perdu', function() {
  setupActivity([objective(1,'dhcp_success',{from:'PC-Alice'},100)]);
  var sw = mkSwitch();
  var pc = mkPC('','255.255.255.0','','','PC-Alice');
  var srv = mkServer('192.168.1.1'); S.devs[srv].dhcp.on = true;
  link(pc,sw); link(srv,sw);
  term(pc,'dhcp');
  ok(done(1));
  sandbox.checkAllObjectives();
  ok(done(1), 'toujours valide juste après');
  S.devs[pc].ifaces[0].ip = '192.168.1.250';
  sandbox.checkAllObjectives();
  notOk(done(1));
});

test('objectif dynamique validé sans preuve (ancienne sauvegarde) → conservé', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'192.168.1.20'},100)]);
  sandbox.ACTIVITY_RESULTS[1] = true;
  sandbox.checkAllObjectives();
  ok(done(1));
});

test('objectif perdu → score transmis au LMS mis à jour', function() {
  setupActivity([objective(1,'ip_configured',{dev:'PC1',ip:'192.168.1.10'},100)]);
  withLMS(makeLMS({}), function(api) {
    var pc = mkPC('192.168.1.10','255.255.255.0','','','PC1');
    sandbox.checkAllObjectives();
    eq(api.data['cmi.core.score.raw'], '100');
    S.devs[pc].ifaces[0].ip = '10.0.0.1';
    sandbox.checkAllObjectives();
    eq(api.data['cmi.core.score.raw'], '0');
  });
});

test('Terminer après une régression : la note est celle du réseau final', function() {
  setupActivity([objective(1,'ip_configured',{dev:'PC1',ip:'192.168.1.10'},100)], 60);
  withLMS(makeLMS({}), function(api) {
    var pc = mkPC('192.168.1.10','255.255.255.0','','','PC1');
    sandbox.checkAllObjectives();
    S.devs[pc].ifaces[0].ip = '10.0.0.1';
    sandbox.checkAllObjectives();
    sandbox.finishActivity();
    eq(api.data['cmi.core.score.raw'], '0');
    eq(api.data['cmi.core.lesson_status'], 'failed');
  });
});

test('reprise : les preuves sont sauvegardées et l\'objectif reste revérifié', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice',to:'Srv-Web'},100)]);
  withStorage(function() {
    var n = makeLan();
    term(n.pc,'ping 192.168.1.20');
    ok(sandbox.saveToSession());
    sandbox.ACTIVITY_RESULTS = {}; sandbox.ACTIVITY_PROOFS = {};
    eq(sandbox.loadFromSession(), true);
    ok(done(1));
    S.devs[devByName('Srv-Web').id].ifaces[0].ip = '10.9.9.9';
    sandbox.checkAllObjectives();
    notOk(done(1));
  });
});

/* ── Contrainte affichée à l'élève ── */
suite('Contrainte affichée à l\'élève');

function cons(check, params, extra) {
  return Object.assign({ id:1, label:'Objectif', check:check, params:params, points:10 }, extra||{});
}

test('texte automatique : plage d\'adresses et masque', function() {
  eq(sandbox.autoConstraintText(cons('ip_configured',{dev:'PC1', ip:'192.168.1.10-50', mask:'255.255.255.0'})),
     'PC1 : adresse IP au choix entre 192.168.1.10 et 192.168.1.50 (adresse libre), masque 255.255.255.0');
});

test('texte automatique : joker et plage sur plusieurs octets', function() {
  eq(sandbox.autoConstraintText(cons('ip_configured',{dev:'PC1', ip:'192.168.1.*'})),
     'PC1 : adresse IP au choix, de la forme 192.168.1.x (adresse libre)');
  eq(sandbox.autoConstraintText(cons('ip_configured',{dev:'PC1', ip:'10.1-4.*.*'})),
     'PC1 : adresse IP au choix, de la forme 10.[1 à 4].x.x (adresse libre)');
});

test('texte automatique : passerelle et nouveau poste', function() {
  eq(sandbox.autoConstraintText(cons('gateway_configured',{dev:'PC1', gateway:'192.168.1.250-254'})),
     'PC1 : passerelle au choix entre 192.168.1.250 et 192.168.1.254');
  eq(sandbox.autoConstraintText(cons('device_added',{newdev:'B210-P3', ip:'10.2.210.*', gateway:'10.2.210.254'})),
     'Nouveau poste « B210-P3 » : adresse IP au choix, de la forme 10.2.210.x (adresse libre), passerelle 10.2.210.254');
  eq(sandbox.autoConstraintText(cons('device_added',{})), '');
});

test('texte automatique : rien pour les autres types d\'objectifs', function() {
  eq(sandbox.autoConstraintText(cons('ping_success',{from:'PC1', to:'Srv'})), '');
});

test('affichage par défaut : seulement si une adresse est au choix', function() {
  eq(sandbox.objectiveConstraint(cons('ip_configured',{dev:'PC1', ip:'192.168.1.10'})), '', 'valeur exacte : on ne donne pas la réponse');
  ok(sandbox.objectiveConstraint(cons('ip_configured',{dev:'PC1', ip:'192.168.1.*'})));
});

test('l\'enseignant peut forcer ou masquer l\'affichage', function() {
  ok(sandbox.objectiveConstraint(cons('ip_configured',{dev:'PC1', ip:'192.168.1.10'}, {showConstraint:true})).indexOf('192.168.1.10') >= 0);
  eq(sandbox.objectiveConstraint(cons('ip_configured',{dev:'PC1', ip:'192.168.1.*'}, {showConstraint:false})), '');
});

test('texte rédigé à la main : remplace le texte automatique', function() {
  var o = cons('ip_configured',{dev:'PC1', ip:'192.168.1.*'}, {constraintText:'  Choisissez une adresse libre de la salle B.  '});
  eq(sandbox.objectiveConstraint(o), 'Choisissez une adresse libre de la salle B.');
});

test('texte rédigé à la main pour un objectif sans texte automatique', function() {
  var o = cons('cable_exists',{devA:'PC1', devB:'SW1'}, {showConstraint:true, constraintText:'Utilisez le port libre du switch.'});
  eq(sandbox.objectiveConstraint(o), 'Utilisez le port libre du switch.');
});

test('onglet Activité : contrainte affichée sous l\'objectif, échappée, retours à la ligne', function() {
  setupActivity([cons('ip_configured',{dev:'PC1', ip:'192.168.1.*'}, {constraintText:'Ligne 1 <b>\nLigne 2'})]);
  sandbox.renderActivityTab();
  var html = sandbox.document.getElementById('activ-pane').innerHTML;
  ok(html.indexOf('ao-constraint') >= 0);
  ok(html.indexOf('Ligne 1 &lt;b&gt;<br>Ligne 2') >= 0, html);
});

test('onglet Activité : contrainte masquée → absente', function() {
  setupActivity([cons('ip_configured',{dev:'PC1', ip:'192.168.1.10'})]);
  sandbox.renderActivityTab();
  ok(sandbox.document.getElementById('activ-pane').innerHTML.indexOf('ao-constraint') < 0);
});

/* ── Références {Appareil} et passerelle cohérente ── */
suite('Références à un appareil — {Appareil}');

test('valueMatchesRef : exacte, référence, appareil absent', function() {
  resetNet();
  var srv = mkServer('192.168.1.53'); S.devs[srv].name = 'Srv-DNS';
  ok(sandbox.valueMatchesRef('192.168.1.53','192.168.1.53'));
  notOk(sandbox.valueMatchesRef('192.168.1.54','192.168.1.53'));
  ok(sandbox.valueMatchesRef('192.168.1.53','{Srv-DNS}'));
  ok(sandbox.valueMatchesRef('192.168.1.53','{ srv-dns }'), 'nom insensible à la casse et aux espaces');
  notOk(sandbox.valueMatchesRef('192.168.1.54','{Srv-DNS}'));
  notOk(sandbox.valueMatchesRef('192.168.1.53','{Inconnu}'));
});

test('dns_configured {Srv-DNS} : suit l\'adresse du serveur', function() {
  resetNet();
  var srv = mkServer('192.168.1.53'); S.devs[srv].name = 'Srv-DNS';
  var pc = mkPC('192.168.1.10','255.255.255.0','','192.168.1.53','PC1');
  var o = {check:'dns_configured', params:{dev:'PC1', dns:'{Srv-DNS}'}};
  ok(checkObjectiveStatic(o));
  S.devs[srv].ifaces[0].ip = '192.168.1.60';
  notOk(checkObjectiveStatic(o), 'le PC pointe encore vers l\'ancienne adresse');
  S.devs[pc].ifaces[0].dns = '192.168.1.60';
  ok(checkObjectiveStatic(o));
});

test('dns_record {Srv-Web} : l\'enregistrement doit donner l\'adresse actuelle du serveur', function() {
  resetNet();
  var dns = mkServer('192.168.1.53'); S.devs[dns].name = 'Srv-DNS';
  S.devs[dns].dns.on = true; S.devs[dns].dns.records['www.lycee.fr'] = '192.168.1.20';
  var web = mkServer('192.168.1.20'); S.devs[web].name = 'Srv-Web';
  var o = {check:'dns_record', params:{dev:'Srv-DNS', domain:'www.lycee.fr', ip:'{Srv-Web}'}};
  ok(checkObjectiveStatic(o));
  S.devs[web].ifaces[0].ip = '192.168.1.25';
  notOk(checkObjectiveStatic(o));
});

test('ping {Srv-Web} : validé par un ping vers son adresse actuelle', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice', to:'{Srv-Web}'},100)]);
  var n = makeLan();
  S.devs[n.web].ifaces[0].ip = '192.168.1.33';
  term(n.pc,'ping 192.168.1.20');
  notOk(done(1), 'l\'ancienne adresse ne répond plus');
  term(n.pc,'ping 192.168.1.33');
  ok(done(1));
});

test('ping {Routeur} : toute interface du routeur compte', function() {
  setupActivity([objective(1,'ping_success',{from:'PC1', to:'{R1}'},100)]);
  var sw = mkSwitch();
  var pc = mkPC('192.168.1.10','255.255.255.0','192.168.1.1','','PC1');
  var r = mkRouter('192.168.1.1','255.255.255.0','10.0.0.1','255.255.255.0'); S.devs[r].name = 'R1';
  link(pc,sw); link(r,sw);
  term(pc,'ping 10.0.0.1');
  ok(done(1));
  sandbox.checkAllObjectives();
  ok(done(1), 'revérifié sur l\'interface effectivement visée');
});

test('ping vers un appareil désigné : objectif perdu puis regagné quand son adresse change', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice', to:'{Srv-Web}'},100)]);
  var n = makeLan();
  term(n.pc,'ping 192.168.1.20');
  ok(done(1));
  S.devs[n.web].ifaces[0].ip = '10.9.9.9';
  sandbox.checkAllObjectives();
  notOk(done(1), 'serveur hors du réseau du PC');
  S.devs[n.web].ifaces[0].ip = '192.168.1.40';
  sandbox.checkAllObjectives();
  ok(done(1), 'joignable à sa nouvelle adresse');
});

test('ping {Inconnu} : jamais validé', function() {
  setupActivity([objective(1,'ping_success',{from:'PC-Alice', to:'{Inconnu}'},100)]);
  var n = makeLan();
  term(n.pc,'ping 192.168.1.20');
  notOk(done(1));
});

suite('Passerelle cohérente — routeur du réseau');

function gwLan() {
  var sw = mkSwitch();
  var pc = mkPC('192.168.1.10','255.255.255.0','192.168.1.1','','PC1');
  var r = mkRouter('192.168.1.1','255.255.255.0','10.0.0.1','255.255.255.0'); S.devs[r].name = 'R1';
  link(pc,sw); var l = link(r,sw);
  return { pc:pc, r:r, sw:sw, l:l };
}
var GW = {check:'gateway_configured', params:{dev:'PC1', gateway:'@routeur'}};

test('passerelle = interface du routeur du même réseau, câblé → validé', function() {
  resetNet(); gwLan();
  ok(checkObjectiveStatic(GW));
});

test('passerelle = interface du routeur d\'un autre réseau → non validé', function() {
  resetNet(); var n = gwLan();
  S.devs[n.pc].ifaces[0].gateway = '10.0.0.1';
  notOk(checkObjectiveStatic(GW));
});

test('passerelle = un PC du réseau → non validé', function() {
  resetNet(); var n = gwLan();
  mkPC('192.168.1.20','255.255.255.0','','','PC2');
  S.devs[n.pc].ifaces[0].gateway = '192.168.1.20';
  notOk(checkObjectiveStatic(GW));
});

test('routeur débranché → non validé ; passerelle vide → non validé', function() {
  resetNet(); var n = gwLan();
  delete S.links[n.l];
  notOk(checkObjectiveStatic(GW), 'routeur injoignable');
  link(n.r, n.sw);
  S.devs[n.pc].ifaces[0].gateway = '';
  notOk(checkObjectiveStatic(GW));
});

test('Box WiFi reliée en WiFi → passerelle cohérente', function() {
  resetNet();
  var box = mkDev('wifi_router', 10, 10); S.devs[box].name = 'Box';
  S.devs[box].ifaces[1].ip = '192.168.1.1'; S.devs[box].ifaces[1].mask = '255.255.255.0';
  var tel = mkPC('192.168.1.30','255.255.255.0','192.168.1.1','','PC1');
  wifiLink(tel, box);
  ok(checkObjectiveStatic(GW));
});

test('device_added : passerelle cohérente exigée sur le nouveau poste', function() {
  resetNet(); var n = gwLan();
  sandbox.START_DEV_IDS = Object.keys(S.devs);
  try {
    var o = {check:'device_added', params:{ip:'192.168.1.*', gateway:'@routeur'}};
    var nw = mkPC('192.168.1.50','255.255.255.0','192.168.1.99','','PC-New'); link(nw, n.sw);
    notOk(checkObjectiveStatic(o));
    S.devs[nw].ifaces[0].gateway = '192.168.1.1';
    ok(checkObjectiveStatic(o));
  } finally { sandbox.START_DEV_IDS = null; }
});

test('contrainte : passerelle cohérente décrite sans donner l\'adresse', function() {
  eq(sandbox.autoConstraintText({check:'gateway_configured', params:{dev:'PC1', gateway:'@routeur'}}),
     'PC1 : passerelle vers le routeur de son réseau');
  eq(sandbox.objectiveConstraint({check:'gateway_configured', params:{dev:'PC1', gateway:'@routeur'}}), '',
     'masquée par défaut');
});

/* ── Plan d'adressage (énoncé et corrigé) ── */
suite('Plan d\'adressage — énoncé et corrigé');

function plan(objs) { return sandbox.addressPlan(objs); }
function rowsOf(p) { return p.groups.reduce(function(a,g){ return a.concat(g.rows); }, []); }
function rowNamed(p, n) { return rowsOf(p).find(function(r){ return r.name === n; }); }
function O(check, params, extra) { return Object.assign({ id: Math.random(), check:check, params:params }, extra||{}); }
function planNet() { resetNet(); S.frames = {}; sandbox.START_DEV_IDS = null; }

test('valeurs exactes : cases à compléter, la réponse n\'est pas donnée', function() {
  planNet();
  var p = plan([O('ip_configured',{dev:'PC1', ip:'192.168.1.10', mask:'255.255.255.0'})]);
  eq(p.cols.join(','), 'ip,mask');
  var r = rowNamed(p,'PC1');
  eq(r.cells.ip.kind, 'fill'); eq(r.cells.ip.label, '');
  eq(r.cells.mask.kind, 'fill');
});

test('plage : contrainte écrite, masque donné', function() {
  planNet();
  var r = rowNamed(plan([O('ip_configured',{dev:'PC1', ip:'192.168.1.10-50', mask:'255.255.255.0'})]),'PC1');
  eq(r.cells.ip.kind, 'fill'); eq(r.cells.ip.label, 'entre 192.168.1.10 et .50');
  eq(r.cells.mask.kind, 'fixed'); eq(r.cells.mask.value, '255.255.255.0');
});

test('joker sur le dernier octet : début de l\'adresse écrit', function() {
  planNet();
  var r = rowNamed(plan([O('ip_configured',{dev:'PC1', ip:'192.168.1.*'})]),'PC1');
  eq(r.cells.ip.prefix, '192.168.1.');
});

test('case « montrer la contrainte » : force ou masque la valeur', function() {
  planNet();
  var shown = rowNamed(plan([O('ip_configured',{dev:'PC1', ip:'192.168.1.10'},{showConstraint:true})]),'PC1');
  eq(shown.cells.ip.kind, 'fixed'); eq(shown.cells.ip.value, '192.168.1.10');
  var hidden = rowNamed(plan([O('ip_configured',{dev:'PC1', ip:'192.168.1.10-50'},{showConstraint:false})]),'PC1');
  eq(hidden.cells.ip.kind, 'fill'); eq(hidden.cells.ip.label, '');
});

test('plusieurs objectifs sur un appareil : une seule ligne, colonnes utilisées seulement', function() {
  planNet();
  var p = plan([O('ip_configured',{dev:'PC1', ip:'192.168.1.*'}),
                O('gateway_configured',{dev:'pc1', gateway:'@routeur'})]);
  eq(rowsOf(p).length, 1);
  eq(p.cols.join(','), 'ip,gateway');
  eq(rowNamed(p,'PC1').cells.gateway.label, 'adresse du routeur');
});

test('DNS « l\'adresse de… » : appareil cité ajouté en référence', function() {
  planNet();
  var srv = mkServer('192.168.1.53'); S.devs[srv].name = 'Srv-DNS';
  var p = plan([O('dns_configured',{dev:'PC1', dns:'{Srv-DNS}'})]);
  eq(rowNamed(p,'PC1').cells.dns.label, 'adresse de Srv-DNS');
  var ref = rowNamed(p,'Srv-DNS');
  ok(ref && ref.ref, 'ligne de référence');
  eq(ref.cells.dns.kind, 'none', 'le serveur n\'a pas de DNS configuré');
});

test('appareil cité qui a déjà sa ligne : pas de doublon en référence', function() {
  planNet();
  mkServer('192.168.1.53');
  var p = plan([O('dns_configured',{dev:'PC1', dns:'{Srv}'}), O('ip_configured',{dev:'Srv', ip:'192.168.1.*'})]);
  eq(rowsOf(p).filter(function(r){ return r.name.toLowerCase() === 'srv'; }).length, 1);
});

test('poste à ajouter, appareil du départ, postes sans nom numérotés', function() {
  planNet();
  var srv = mkServer('192.168.1.100'); S.devs[srv].name = 'Serveur';
  sandbox.START_DEV_IDS = [srv];
  try {
    var p = plan([O('device_added',{newdev:'Serveur', type:'server'}),
                  O('device_added',{newdev:'PC-New', ip:'192.168.1.*'}),
                  O('device_added',{ip:'10.0.0.*'}), O('device_added',{ip:'10.0.1.*'})]);
    notOk(rowNamed(p,'Serveur').toAdd, 'objectif de présence');
    ok(rowNamed(p,'PC-New').toAdd);
    ok(rowNamed(p,'Nouveau poste 1') && rowNamed(p,'Nouveau poste 2'));
  } finally { sandbox.START_DEV_IDS = null; }
});

test('encadrés : lignes regroupées par salle, de haut en bas', function() {
  planNet();
  S.frames = { fB:{id:'fB', x:0, y:400, w:400, h:300, label:'Salle B'},
               fA:{id:'fA', x:0, y:0,   w:400, h:300, label:'Salle A'} };
  var a = mkPC('192.168.1.10'); S.devs[a].name = 'PC-A'; S.devs[a].x = 50;  S.devs[a].y = 50;
  var b = mkPC('192.168.2.10'); S.devs[b].name = 'PC-B'; S.devs[b].x = 50;  S.devs[b].y = 450;
  var sw = mkSwitch(); S.devs[sw].name = 'SW-B'; S.devs[sw].x = 200; S.devs[sw].y = 450;
  var p = plan([O('ip_configured',{dev:'PC-B', ip:'192.168.2.*'}),
                O('ip_configured',{dev:'PC-A', ip:'192.168.1.*'}),
                O('ip_configured',{dev:'PC-C', ip:'192.168.2.*'}),
                O('cable_exists',{devA:'PC-C', devB:'SW-B'})]);
  eq(p.groups.map(function(g){ return g.label; }).join(','), 'Salle A,Salle B');
  eq(p.groups[1].rows.map(function(r){ return r.name; }).join(','), 'PC-B,PC-C',
     'le poste à ajouter rejoint la salle de son switch');
});

test('corrigé : solutions lues dans le réseau et vérifiées', function() {
  planNet();
  var sw = mkSwitch();
  var pc = mkPC('192.168.1.30','255.255.255.0','192.168.1.1','192.168.1.53','PC1');
  var r1 = mkRouter('192.168.1.1','255.255.255.0','10.0.0.1','255.255.255.0'); S.devs[r1].name = 'R1';
  var dns = mkServer('192.168.1.53'); S.devs[dns].name = 'Srv-DNS';
  link(pc,sw); link(r1,sw); link(dns,sw);
  var p = plan([O('ip_configured',{dev:'PC1', ip:'192.168.1.10-50', mask:'255.255.255.0'}),
                O('gateway_configured',{dev:'PC1', gateway:'@routeur'}),
                O('dns_configured',{dev:'PC1', dns:'{Srv-DNS}'})]);
  var c = rowNamed(p,'PC1').cells;
  eq(c.ip.solution.value, '192.168.1.30'); ok(c.ip.solution.possible, 'une réponse possible parmi d\'autres');
  eq(c.mask.solution.value, '255.255.255.0');
  eq(c.gateway.solution.value, '192.168.1.1');
  eq(c.dns.solution.value, '192.168.1.53');
});

test('corrigé : pas de solution si le réseau ne respecte pas l\'objectif ou si l\'appareil manque', function() {
  planNet();
  mkPC('192.168.1.60','255.255.255.0','','','PC1');
  var p = plan([O('ip_configured',{dev:'PC1', ip:'192.168.1.10-50'}),
                O('ip_configured',{dev:'PC-Absent', ip:'192.168.1.*'}),
                O('ip_configured',{dev:'PC-Fixe', ip:'192.168.1.99'})]);
  ok(rowNamed(p,'PC1').cells.ip.solution.missing, 'hors de la plage');
  ok(rowNamed(p,'PC-Absent').cells.ip.solution.missing);
  eq(rowNamed(p,'PC-Fixe').cells.ip.solution.value, '192.168.1.99', 'valeur exacte connue même sans appareil');
});

test('nouveau poste sans nom : la solution est le poste ajouté qui remplit l\'objectif', function() {
  planNet();
  var old = mkPC('192.168.1.10','255.255.255.0','','','PC-Depart');
  sandbox.START_DEV_IDS = [old];
  try {
    mkPC('192.168.1.42','255.255.255.0','','','PC-Ajoute');
    var r = rowNamed(plan([O('device_added',{ip:'192.168.1.*'})]),'Nouveau poste');
    eq(r.cells.ip.solution.value, '192.168.1.42');
  } finally { sandbox.START_DEV_IDS = null; }
});

test('aucun objectif d\'adressage : plan vide', function() {
  planNet();
  var p = plan([O('ping_success',{from:'PC1', to:'{Srv}'})]);
  eq(p.cols.length, 0); eq(p.groups.length, 0);
});

/* ── Nom de l'appareil source : casse et espaces ignorés ── */
suite('Appareil source d\'une commande — nom sans casse');

test('ping : appareil nommé « b210-p3 » par l\'élève, « B210-P3 » attendu → validé', function() {
  setupActivity([objective(1,'ping_success',{from:'B210-P3', to:'192.168.1.20'})]);
  checkDynamicObjective('ping_success',{from:'b210-p3 ', to:'192.168.1.20'});
  ok(done(1));
});

test('DNS, HTTP et DHCP : même règle', function() {
  setupActivity([objective(1,'dns_success',{from:'PC-Alice', domain:'lycee.local'}),
                 objective(2,'http_success',{from:'PC-Alice', url:'lycee.local'}),
                 objective(3,'dhcp_success',{from:'PC-Alice'})]);
  checkDynamicObjective('dns_success',{from:'pc-alice', domain:'lycee.local'});
  checkDynamicObjective('http_success',{from:' PC-ALICE', url:'lycee.local'});
  checkDynamicObjective('dhcp_success',{from:'Pc-Alice', ip:'192.168.1.100'});
  ok(done(1)); ok(done(2)); ok(done(3));
});

test('autre appareil → toujours refusé', function() {
  setupActivity([objective(1,'ping_success',{from:'B210-P3'})]);
  checkDynamicObjective('ping_success',{from:'B210-P30', to:'192.168.1.20'});
  notOk(done(1));
});

test('poste ajouté et nommé en minuscules : ping au terminal validé puis revérifié', function() {
  setupActivity([objective(1,'ping_success',{from:'B210-P3', to:'{Srv-Web}'},100)]);
  var n = makeLan();
  var pc = mkPC('192.168.1.33','255.255.255.0','','','b210-p3');
  link(pc, n.sw);
  term(pc,'ping 192.168.1.20');
  ok(done(1));
  sandbox.checkAllObjectives();
  ok(done(1), 'toujours valide après revérification');
});

/* ── Touche Suppr : effacer la sélection ── */
suite('Suppr — effacer l\'élément sélectionné');

test('appareil sélectionné : effacé avec ses câbles', function() {
  resetNet(); S.mode = 'config';
  var pc = mkPC('192.168.1.10'), sw = mkSwitch(); link(pc, sw);
  S.sel = pc;
  ok(sandbox.deleteSelection());
  notOk(S.devs[pc]); eq(Object.keys(S.links).length, 0); eq(S.sel, null);
});

test('câble sélectionné : seul le câble est effacé', function() {
  resetNet(); S.mode = 'config';
  var pc = mkPC('192.168.1.10'), sw = mkSwitch(), l = link(pc, sw);
  S.sel = l;
  ok(sandbox.deleteSelection());
  notOk(S.links[l]); ok(S.devs[pc]); ok(S.devs[sw]);
});

test('cadre et texte sélectionnés : effacés', function() {
  resetNet(); S.mode = 'config';
  S.frames = { f9: { id:'f9', x:0, y:0, w:100, h:100, label:'Salle' } };
  S.texts  = { t9: { id:'t9', x:0, y:0, text:'Note' } };
  S.sel = 'f9'; ok(sandbox.deleteSelection()); notOk(S.frames.f9);
  S.sel = 't9'; ok(sandbox.deleteSelection()); notOk(S.texts.t9);
  S.frames = {}; S.texts = {};
});

test('mode Simulation ou rien de sélectionné : rien n\'est effacé', function() {
  resetNet();
  var pc = mkPC('192.168.1.10');
  S.sel = pc; S.mode = 'simulation';
  notOk(sandbox.deleteSelection()); ok(S.devs[pc]);
  S.mode = 'config'; S.sel = null;
  notOk(sandbox.deleteSelection()); ok(S.devs[pc]);
});

/* ── SCORM ── */
suite('SCORM — échanges avec le LMS');

test('scormInit : première ouverture → statut incomplete', function() {
  withLMS(makeLMS({'cmi.core.lesson_status':'not attempted'}), function(api) {
    eq(api.data['cmi.core.lesson_status'], 'incomplete');
  });
});

test('scormInit : activité déjà réussie → statut passed conservé', function() {
  withLMS(makeLMS({'cmi.core.lesson_status':'passed'}), function(api) {
    eq(api.data['cmi.core.lesson_status'], 'passed');
  });
});

test('scormInit : initialisation refusée → aucune écriture', function() {
  withLMS(makeLMS({}, 'false'), function(api) {
    sandbox.sSet('cmi.core.score.raw','50');
    eq(api.sets, 0);
  });
});

test('sans LMS : les appels SCORM sont sans effet et sans erreur', function() {
  sandbox._api = null; sandbox._apiOk = false;
  sandbox.sSet('cmi.core.score.raw','50');
  sandbox.sCom();
  sandbox.sEnd(50,true);
  eq(sandbox.sGet('cmi.core.score.raw'), '');
});

test('LMS d\'une page parente : API trouvée en remontant les fenêtres', function() {
  var api = makeLMS({});
  var top = { API:api }; top.parent = top;
  var original = sandbox.window;
  var child = { parent:top };
  sandbox.window = child;
  try {
    sandbox.scormInit();
    eq(sandbox._api, api);
  } finally {
    sandbox.window = original;
    sandbox._api = null; sandbox._apiOk = false;
  }
});

test('page parente d\'un autre domaine (accès refusé) → pas d\'erreur', function() {
  var original = sandbox.window;
  var child = {};
  Object.defineProperty(child,'parent',{ get:function(){ throw new Error('SecurityError'); } });
  sandbox.window = child;
  try {
    sandbox.scormInit();
    eq(sandbox._api, null);
  } finally {
    sandbox.window = original;
    sandbox._api = null; sandbox._apiOk = false;
  }
});

test('objectif atteint → score transmis et enregistré au LMS', function() {
  setupActivity([objective(1,'ping_success',{},25), objective(2,'dns_success',{},75)]);
  withLMS(makeLMS({}), function(api) {
    checkDynamicObjective('ping_success',{from:'PC-Alice',to:'192.168.1.20'});
    eq(api.data['cmi.core.score.raw'], '25');
    eq(api.data['cmi.core.score.min'], '0');
    eq(api.data['cmi.core.score.max'], '100');
    ok(api.commits > 0);
  });
});

test('Terminer : score égal au seuil → passed et session fermée', function() {
  setupActivity([objective(1,'ping_success',{},60), objective(2,'dns_success',{},40)], 60);
  withLMS(makeLMS({}), function(api) {
    sandbox.ACTIVITY_RESULTS[1] = true;
    sandbox.updateActivityScore();
    sandbox.finishActivity();
    eq(api.data['cmi.core.lesson_status'], 'passed');
    eq(api.data['cmi.core.score.raw'], '60');
    eq(api.finishes, 1);
  });
});

test('Terminer : score sous le seuil → failed', function() {
  setupActivity([objective(1,'ping_success',{},59), objective(2,'dns_success',{},41)], 60);
  withLMS(makeLMS({}), function(api) {
    sandbox.ACTIVITY_RESULTS[1] = true;
    sandbox.updateActivityScore();
    sandbox.finishActivity();
    eq(api.data['cmi.core.lesson_status'], 'failed');
  });
});

test('Terminer : le seuil de l\'activité remplace le seuil par défaut', function() {
  setupActivity([objective(1,'ping_success',{},70), objective(2,'dns_success',{},30)], 80);
  withLMS(makeLMS({}), function(api) {
    sandbox.ACTIVITY_RESULTS[1] = true;
    sandbox.updateActivityScore();
    sandbox.finishActivity();
    eq(api.data['cmi.core.lesson_status'], 'failed');
  });
});

test('Terminer : seuil absent → 60 par défaut', function() {
  setupActivity([objective(1,'ping_success',{},60), objective(2,'dns_success',{},40)]);
  delete sandbox.ACTIVITY_CONFIG.masteryscore;
  withLMS(makeLMS({}), function(api) {
    sandbox.ACTIVITY_RESULTS[1] = true;
    sandbox.updateActivityScore();
    sandbox.finishActivity();
    eq(api.data['cmi.core.lesson_status'], 'passed');
  });
});

test('après Terminer : plus aucune écriture ni double fermeture', function() {
  setupActivity([objective(1,'ping_success',{},100)]);
  withLMS(makeLMS({}), function(api) {
    sandbox.finishActivity();
    var sets = api.sets;
    sandbox.sSet('cmi.core.score.raw','99');
    sandbox.sEnd(99,true);
    eq(api.sets, sets);
    eq(api.finishes, 1);
  });
});

test('Terminer : le bilan affiché liste les objectifs et le résultat', function() {
  setupActivity([objective(1,'ping_success',{},100)]);
  sandbox.ACTIVITY_RESULTS[1] = true;
  sandbox.updateActivityScore();
  sandbox.finishActivity();
  ok(sandbox._lastAlert.indexOf('Objectif 1') >= 0);
  ok(sandbox._lastAlert.indexOf('RÉUSSI') >= 0);
});

test('Terminer sans aucun point défini : le bilan affiche 0 % et non NaN', function() {
  setupActivity([]);
  sandbox.finishActivity();
  ok(sandbox._lastAlert.indexOf('NaN') < 0);
  ok(sandbox._lastAlert.indexOf('0%') >= 0);
});

/* ── Sauvegarde et reprise ── */
suite('Sauvegarde et reprise de session');

test('LMS disponible : sauvegarde dans suspend_data puis reprise', function() {
  setupActivity([objective(1,'ping_success',{},100)]);
  withLMS(makeLMS({}), function(api) {
    mkPC('192.168.1.10','255.255.255.0','','','PC-Sauve');
    sandbox.ACTIVITY_RESULTS[1] = true;
    S.score = 100;
    ok(sandbox.saveToSession());
    ok(api.data['cmi.suspend_data'].indexOf('PC-Sauve') >= 0);
    resetNet();
    sandbox.ACTIVITY_RESULTS = {};
    eq(sandbox.loadFromSession(), true);
    ok(devByName('PC-Sauve'));
    ok(done(1));
    eq(S.score, 100);
  });
});

test('sans LMS : sauvegarde et reprise via localStorage', function() {
  setupActivity([objective(1,'ping_success',{},100)]);
  withStorage(function() {
    mkPC('192.168.1.10','255.255.255.0','','','PC-Local');
    ok(sandbox.saveToSession());
    resetNet();
    eq(sandbox.loadFromSession(), true);
    ok(devByName('PC-Local'));
  });
});

test('première ouverture : réseau de départ chargé et pannes injectées', function() {
  setupActivity([]);
  var starter = { devs:{}, links:{}, nid:5 };
  starter.devs.d1 = { id:'d1', type:'pc', name:'PC-Depart', x:0, y:0,
    ifaces:[{name:'eth0',ip:'192.168.1.10',mask:'255.255.255.0',gateway:'',dns:''}] };
  sandbox.STARTER_NETWORK = starter;
  sandbox.ACTIVITY_CONFIG.faults = [{type:'bad_ip',dev:'PC-Depart',badValue:'10.9.9.9'}];
  try {
    withStorage(function() {
      eq(sandbox.loadFromSession(), 'starter');
      eq(mainIface(devByName('PC-Depart')).ip, '10.9.9.9');
      eq(starter.devs.d1.ifaces[0].ip, '192.168.1.10');
    });
  } finally { sandbox.STARTER_NETWORK = null; }
});

test('reprise : les pannes ne sont pas réinjectées sur le travail de l\'élève', function() {
  setupActivity([]);
  withStorage(function() {
    mkPC('192.168.1.10','255.255.255.0','','','PC-Corrige');
    sandbox.saveToSession();
    resetNet();
    sandbox.ACTIVITY_CONFIG = { objectives:[], faults:[{type:'bad_ip',dev:'PC-Corrige',badValue:'10.9.9.9'}] };
    eq(sandbox.loadFromSession(), true);
    eq(mainIface(devByName('PC-Corrige')).ip, '192.168.1.10');
  });
});

test('sauvegarde illisible → false, sans erreur', function() {
  setupActivity([]);
  withStorage(function(store) {
    store[sandbox.SESSION_KEY] = '{pas du json';
    eq(sandbox.loadFromSession(), false);
  });
});

/* ── Scénarios fournis ── */
const SCENARIOS_DIR = path.join(__dirname, '..', 'scenarios');
const OBJECTIVE_TYPES = ['cable_exists','ip_configured','gateway_configured','dns_configured',
  'service_active','device_added','wifi_link','route_exists','dns_record','ssid_configured',
  'ping_success','dns_success','http_success','dhcp_success'];
const FAULT_TYPES = ['bad_ip','bad_mask','bad_gateway','bad_dns','service_down','missing_cable','ssid_wrong','wifi_pass_wrong'];
const IPV4 = /^[0-9]+[.][0-9]+[.][0-9]+[.][0-9]+$/;

function readScenario(file) {
  return JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, file), 'utf-8'));
}

/* Ouvre le scénario comme le ferait un élève : réseau de départ, puis pannes éventuelles. */
function openScenario(data, withFaults) {
  setupActivity(JSON.parse(JSON.stringify(data.activity.objectives)), data.activity.masteryscore);
  sandbox.ACTIVITY_CONFIG.faults = withFaults ? JSON.parse(JSON.stringify(data.activity.faults)) : [];
  sandbox.STARTER_NETWORK = JSON.parse(JSON.stringify(data.network));
  try {
    withStorage(function() { eq(sandbox.loadFromSession(), 'starter'); });
  } finally { sandbox.STARTER_NETWORK = null; }
}

/* Réalise les actions de l'élève qu'exige chaque objectif dynamique :
   les demandes DHCP d'abord, puisqu'un appareil sans adresse ne peut rien tester. */
function playObjectives(objectives) {
  sandbox.checkAllObjectives();
  var dhcpFirst = objectives.filter(function(o) { return o.check === 'dhcp_success'; })
    .concat(objectives.filter(function(o) { return o.check !== 'dhcp_success'; }));
  dhcpFirst.forEach(function(o) {
    var p = o.params || {};
    var from = devByName(p.from);
    if(!from) return;
    if(o.check === 'ping_success') term(from.id, 'ping ' + (sandbox.pingTargetIP(p.to) || p.to));
    if(o.check === 'dns_success')  term(from.id, 'nslookup ' + p.domain);
    if(o.check === 'dhcp_success') term(from.id, 'dhcp');
    if(o.check === 'http_success') browse(from.id, p.url);
  });
}

/* Première adresse qui convient à un motif d'objectif (exacte, plage ou joker). */
function firstUsableIP(devId, pattern, mask) {
  if(!sandbox.ipPatternIsFlexible(pattern)) return pattern;
  var seg = pattern.split('.');
  var r = /^(\d+)-(\d+)$/.exec(seg[3]), lo = r ? +r[1] : 1, hi = r ? +r[2] : 254;
  for(var n = lo; n <= hi; n++) {
    var ip = seg.slice(0, 3).join('.') + '.' + n;
    if(sandbox.ipMatchesPattern(ip, pattern) && sandbox.ipUsableBy(devId, ip, mask)) return ip;
  }
  return '';
}
/* Valeur concrète d'une adresse attendue : « {Appareil} » ou passerelle « @routeur ». */
function concreteAddr(spec, dev) {
  if(!spec) return '';
  var n = sandbox.refName(spec);
  if(n !== null) return mainIface(devByName(n)).ip;
  if(spec === '@routeur') {
    var fi = mainIface(dev), gw = '';
    Object.values(S.devs).forEach(function(r) {
      if(!gw && sandbox.isRouter(r)) r.ifaces.forEach(function(f) {
        if(!gw && f.ip && sandbox.sameNet(fi.ip, fi.mask, f.ip)) gw = f.ip;
      });
    });
    return gw;
  }
  return spec;
}

/* Le réseau du scénario sert de corrigé. Restent à faire : relancer les services
   coupés et construire ce que l'élève doit ajouter (poste, câble, adresses, DNS). */
function applySolution(data) {
  data.activity.faults.forEach(function(f) {
    var p = f.params || f;
    if(f.type === 'service_down') devByName(p.dev)[p.service].on = true;
  });
  var objs = data.activity.objectives, created = {};
  objs.forEach(function(o) {
    var p = o.params || {};
    if(o.check === 'device_added' && p.newdev && !devByName(p.newdev)) {
      var id = mkDev(p.type || 'pc', 10, 10);
      S.devs[id].name = p.newdev;
      created[p.newdev] = id;
      var fi = mainIface(S.devs[id]);
      fi.mask = p.mask || '255.255.255.0';
      if(p.ip) fi.ip = firstUsableIP(id, p.ip, fi.mask);
    }
  });
  objs.forEach(function(o) {
    var p = o.params || {};
    if(o.check === 'ip_configured' && created[p.dev] && !mainIface(S.devs[created[p.dev]]).ip)
      mainIface(S.devs[created[p.dev]]).ip = firstUsableIP(created[p.dev], p.ip, '255.255.255.0');
  });
  objs.forEach(function(o) {
    var p = o.params || {};
    if(o.check === 'cable_exists' && (created[p.devA] || created[p.devB]))
      link(devByName(p.devA).id, devByName(p.devB).id);
  });
  objs.forEach(function(o) {
    var p = o.params || {};
    if(o.check === 'wifi_link' && (created[p.devA] || created[p.devB])) {
      var lid = 'l' + (S.nid++);
      S.links[lid] = {id: lid, from: devByName(p.devA).id, to: devByName(p.devB).id, type: 'wifi'};
      // L'élève choisit le réseau de la box et tape son mot de passe
      var t = created[p.devA] ? devByName(p.devA) : devByName(p.devB), box = created[p.devA] ? devByName(p.devB) : devByName(p.devA);
      t.wifi = {ssid: box.ssid || '', pass: box.wifiPass || ''};
    }
  });
  // Poste ajouté sans câble demandé : relié au switch d'un appareil du même réseau.
  Object.keys(created).forEach(function(name) {
    var id = created[name], fi = mainIface(S.devs[id]);
    if(Object.values(S.links).some(function(l) { return l.from === id || l.to === id; })) return;
    var peer = Object.values(S.devs).find(function(d) {
      var f = mainIface(d);
      return d.id !== id && f && f.ip && sandbox.sameNet(fi.ip, fi.mask, f.ip) && !sandbox.isRouter(d);
    });
    var sw = peer && sandbox.nbrs(peer.id).map(function(n) { return S.devs[n]; })
      .find(function(d) { return d && d.type === 'switch'; });
    if(sw) link(id, sw.id);
  });
  objs.forEach(function(o) {
    var p = o.params || {}, d = created[p.dev] && S.devs[created[p.dev]];
    var a = o.check === 'device_added' && created[p.newdev] && S.devs[created[p.newdev]];
    if(a && p.gateway) mainIface(a).gateway = concreteAddr(p.gateway, a);
    if(d && o.check === 'gateway_configured') mainIface(d).gateway = concreteAddr(p.gateway, d);
    if(d && o.check === 'dns_configured') mainIface(d).dns = concreteAddr(p.dns, d);
  });
  objs.forEach(function(o) {
    var p = o.params || {};
    if(o.check === 'dns_record' && p.domain) {
      var srv = devByName(p.dev), dom = p.domain.toLowerCase().trim();
      if(!srv.dns.records[dom]) srv.dns.records[dom] = concreteAddr(p.ip, null);
    }
  });
  sandbox.autoRoute();
}

/* ── DHCP activé depuis la fiche du poste ── */
suite('DHCP — case de la fiche et objectif');

test('cocher DHCP demande une adresse et valide l\'objectif (scénario Maison)', function() {
  var data = readScenario('reseau-maison.json');
  openScenario(data, true);
  var lap = devByName('Laptop');
  notOk(done(1), 'pas validé à l\'ouverture');
  sandbox.toggleDHCPMode(lap.id, false);
  sandbox.toggleDHCPMode(lap.id, true);
  ok(mainIface(lap).ip, 'adresse reçue');
  ok(done(1), 'objectif « Le Laptop obtient une adresse IP par DHCP »');
  sandbox.checkAllObjectives();
  ok(done(1), 'toujours valide après revérification');
});

test('cocher DHCP sans serveur joignable : pas d\'adresse, pas d\'objectif, pas d\'erreur', function() {
  setupActivity([objective(1,'dhcp_success',{from:'PC1'},100)]);
  var pc = mkPC('192.168.1.10','255.255.255.0','','','PC1');
  sandbox.toggleDHCPMode(pc, true);
  eq(mainIface(S.devs[pc]).ip, '');
  notOk(done(1));
});

test('cocher puis décocher DHCP : la configuration fixe revient, ignorée tant que DHCP est coché', function() {
  setupActivity([objective(1,'ip_configured',{dev:'PC1', ip:'192.168.1.10'},50),
                 objective(2,'gateway_configured',{dev:'PC1', gateway:'192.168.1.1'},50)]);
  var pc = mkPC('192.168.1.10','255.255.255.0','192.168.1.1','8.8.8.8','PC1');
  sandbox.toggleDHCPMode(pc, true);
  var fi = mainIface(S.devs[pc]);
  eq([fi.ip, fi.mask, fi.gateway, fi.dns].join('|'), '|||', 'champs vidés en DHCP');
  eq(sandbox.devByIP('192.168.1.10'), null, 'l\'ancienne adresse n\'est plus celle du poste');
  sandbox.checkAllObjectives();
  notOk(done(1), 'adresse fixe mise de côté : non comptée');
  notOk(done(2), 'passerelle mise de côté : non comptée');
  sandbox.toggleDHCPMode(pc, false);
  fi = mainIface(S.devs[pc]);
  eq([fi.ip, fi.mask, fi.gateway, fi.dns].join('|'), '192.168.1.10|255.255.255.0|192.168.1.1|8.8.8.8');
  eq(fi.staticCfg, undefined);
  sandbox.checkAllObjectives();
  ok(done(1) && done(2), 'comptés de nouveau une fois rétablis');
});

test('activité élève : la configuration fixe mise de côté par le professeur n\'est pas transmise', function() {
  resetNet();
  var pc = mkPC('', '255.255.255.0', '', '', 'PC1');
  mainIface(S.devs[pc]).dhcpMode = true;
  mainIface(S.devs[pc]).staticCfg = { ip:'192.168.1.10', mask:'255.255.255.0', gateway:'192.168.1.1', dns:'' };
  var net = JSON.parse(JSON.stringify({ devs:S.devs, links:S.links, nid:S.nid }));
  openScenario({ network: net, activity: { objectives: [objective(1,'dhcp_success',{from:'PC1'},100)], faults: [] } }, false);
  var p1 = devByName('PC1');
  eq(mainIface(p1).staticCfg, undefined);
  sandbox.toggleDHCPMode(p1.id, false);
  eq(mainIface(p1).ip, '', 'décocher ne révèle rien');
});

/* ── Pont de la box entre WiFi et câble ── */
suite('Box WiFi — pont entre clients WiFi et côté LAN câblé');

test('un client WiFi joint un poste câblé au switch de la box, et inversement', function() {
  openScenario(readScenario('reseau-maison.json'), false);
  var lap = devByName('Laptop'), pc = devByName('PC-Bureau'), ph = devByName('Smartphone');
  term(lap.id, 'dhcp'); term(ph.id, 'dhcp');
  var go = simPing(lap.id, mainIface(pc).ip);
  ok(go.ok, go.reason);
  eq(go.path.map(function(id) { return S.devs[id].name; }).join(' > '), 'Laptop > Box-WiFi > PC-Bureau');
  ok(go.wifi && !go.router, 'livraison locale par la box, sans routage');
  ok(simPing(pc.id, mainIface(lap).ip).ok, 'retour du poste câblé vers le WiFi');
  ok(simPing(ph.id, mainIface(lap).ip).ok, 'WiFi vers WiFi, comme avant');
});

test('le port WAN de la box n\'est jamais ponté', function() {
  openScenario(readScenario('reseau-lycee.json'), false);
  var tab = devByName('Tablette-Eleve'), fi = mainIface(tab);
  // Tablette mise à la main dans le réseau du WAN de la box (192.168.1.0/24)
  fi.ip = '192.168.1.60'; fi.mask = '255.255.255.0'; fi.gateway = '';
  var r = simPing(tab.id, '192.168.1.10');
  notOk(r.ok, 'PC-Salle1 est derrière le WAN de la box');
  eq(r.reason, 'Même sous-réseau mais appareils non reliés physiquement');
  // Maison : un client WiFi dans le réseau du WAN n'atteint pas Internet sans routage
  openScenario(readScenario('reseau-maison.json'), false);
  var lap = mainIface(devByName('Laptop'));
  lap.ip = '10.0.0.50'; lap.mask = '255.255.255.0'; lap.gateway = '';
  notOk(simPing(devByName('Laptop').id, '10.0.0.1').ok, 'Internet est côté WAN');
});

test('box sans WAN configuré : ses câbles vers un switch restent côté LAN', function() {
  var box = mkDev('wifi_router', 0, 0), sw = mkDev('switch', 0, 0);
  S.devs[box].ifaces[1].ip = '192.168.5.1';
  var pc = mkPC('192.168.5.10', '255.255.255.0', '', '', 'PC-Câble');
  var lap = mkPC('192.168.5.20', '255.255.255.0', '', '', 'PC-WiFi');
  addLink(box, sw); addLink(sw, pc);
  var lid = 'l' + (S.nid++);
  S.links[lid] = {id: lid, from: lap, to: box, type: 'wifi'};
  ok(simPing(lap, '192.168.5.10').ok);
});

/* ── TTL des réponses au ping et interfaces sur la carte d'un routeur ── */
suite('Ping — TTL selon les routeurs traversés ; carte du routeur');

test('TTL : 64 sur le même réseau (box comprise), moins 1 par routeur traversé', function() {
  openScenario(readScenario('reseau-maison.json'), false);
  var pc = devByName('PC-Bureau'), lap = devByName('Laptop');
  term(lap.id, 'dhcp');
  eq(sandbox.pingTTL(simPing(pc.id, '192.168.1.1')), 64, 'la box elle-même');
  eq(sandbox.pingTTL(simPing(lap.id, mainIface(pc).ip)), 64, 'pont WiFi ↔ câble de la box');
  eq(sandbox.pingTTL(simPing(pc.id, '8.8.8.8')), 63, 'Internet, derrière la box');
  var sc = sandbox.ActivityWizard.build({type: 'decouverte', theme: 'entreprise', level: 'bts'});
  openScenario(sc, false);
  eq(sandbox.pingTTL(simPing(devByName('PC-Accueil').id, '192.168.2.100')), 63, 'serveur derrière le routeur');
});

test('carte d\'un routeur : ses trois interfaces sont affichées', function() {
  var sc = sandbox.ActivityWizard.build({type: 'decouverte', theme: 'classe', level: 'bts'});
  openScenario(sc, false);
  sandbox.renderDevs();
  var r = devByName('Routeur'), svg = _docElements['layer-devs'].innerHTML;
  var card = svg.slice(svg.indexOf('id="gd' + r.id + '"'));
  card = card.slice(0, card.indexOf('</g>'));
  ['eth0: 10.0.0.2', 'eth1: 192.168.10.1', 'eth2: 192.168.20.1'].forEach(function(t) {
    ok(card.indexOf(t) >= 0, 'manque « ' + t + ' »');
  });
  r.ifaces.push({name: 'eth3', ip: '192.168.30.1', mask: '255.255.255.0'});
  sandbox.renderDevs();
  svg = _docElements['layer-devs'].innerHTML;
  card = svg.slice(svg.indexOf('id="gd' + r.id + '"'));
  ok(card.indexOf('+ 2 interfaces') >= 0, 'au-delà de trois, le reste est résumé');
});

/* ── Connexion WiFi : SSID et mot de passe du terminal ── */
suite('Connexion WiFi — SSID et mot de passe sur le terminal');

test('mot de passe faux : pas d\'adresse DHCP, liaison en rouge, objectif WiFi perdu ; corrigé, tout repart', function() {
  var wdata = readScenario('reseau-maison.json');
  wdata.activity.objectives = [objective(1, 'wifi_link', {devA: 'Laptop', devB: 'Box-WiFi'}, 100)];
  openScenario(wdata, false);
  var lap = devByName('Laptop');
  sandbox.checkAllObjectives();
  ok(done(1), 'connecté au départ');
  sandbox.setTermWifi(lap.id, 'pass', 'maison000');
  var r = simDHCP(lap.id);
  notOk(r.ok);
  eq(r.reason, 'Non connecté au WiFi : mot de passe incorrect pour « WiFi-Maison »');
  eq(simPing(lap.id, '192.168.1.1').reason, 'Non connecté au WiFi : mot de passe incorrect pour « WiFi-Maison »');
  sandbox.renderLinks();
  ok(_docElements['layer-links'].innerHTML.indexOf('#e53e3e') >= 0, 'liaison non associée en rouge');
  sandbox.checkAllObjectives();
  notOk(done(1), 'wifi_link exige l\'association');
  sandbox.setTermWifi(lap.id, 'pass', 'maison123');
  ok(simDHCP(lap.id).ok);
  sandbox.checkAllObjectives();
  ok(done(1));
});

test('SSID de la box changé (panne ssid_wrong) : la tablette du lycée se déconnecte', function() {
  var data = readScenario('reseau-lycee.json');
  openScenario(data, false);
  var tab = devByName('Tablette-Eleve'), box = devByName('Box-WiFi-Eleves');
  ok(simDHCP(tab.id).ok, 'connectée sans la panne');
  box.ssid = 'WiFi-Invite';
  var r = simDHCP(tab.id);
  notOk(r.ok);
  ok(/SSID « WiFi-Lycee » inconnu/.test(r.reason), r.reason);
  ok(simPing(devByName('PC-Salle1').id, mainIface(tab).ip).reason.indexOf('n\'est pas connecté au WiFi') >= 0,
    'la destination signale aussi la déconnexion');
  box.ssid = 'WiFi-Lycee';
  ok(simDHCP(tab.id).ok, 'reconnectée une fois le SSID rétabli');
});

test('liaison tracée par l\'élève : SSID choisi, mot de passe à saisir sur un réseau protégé', function() {
  openScenario(readScenario('reseau-maison.json'), false);
  var box = devByName('Box-WiFi');
  var tab = mkDev('pc', 10, 10, 'tablet');
  S.devs[tab].name = 'Tablette';
  S.devs[tab].ifaces[0].dhcpMode = true;
  ok(addLink(tab, box.id), 'liaison WiFi créée');
  eq(S.devs[tab].wifi.ssid, 'WiFi-Maison');
  eq(S.devs[tab].wifi.pass, '');
  notOk(simDHCP(tab).ok, 'pas de mot de passe');
  sandbox.setTermWifi(tab, 'pass', 'maison123');
  ok(simDHCP(tab).ok);
  ok(sandbox.wifiPropsHTML(tab, true).indexOf('Connecté à « WiFi-Maison »') >= 0, 'fiche : connecté');
});

test('réseau ouvert : seul le SSID compte ; terminal sans réglage WiFi (ancien scénario) connecté', function() {
  openScenario(readScenario('reseau-lycee.json'), false);
  var tab = devByName('Tablette-Eleve');
  tab.wifi = {ssid: 'WiFi-Lycee', pass: 'nimporte'};
  ok(simDHCP(tab.id).ok, 'mot de passe ignoré sur un réseau ouvert');
  delete tab.wifi;
  ok(simDHCP(tab.id).ok, 'sans champ wifi : connecté');
});

test('dans l\'activité, changer le mot de passe de la box déconnecte ses clients', function() {
  openScenario(readScenario('reseau-maison.json'), false);
  var box = devByName('Box-WiFi'), lap = devByName('Laptop');
  sandbox.setBoxWifi(box.id, 'pass', 'nouveau');
  eq(box.wifiPass, 'nouveau');
  eq(lap.wifi.pass, 'maison123', 'le terminal garde l\'ancien mot de passe');
  notOk(simDHCP(lap.id).ok);
});

test('panne « mot de passe WiFi incorrect » : injectée sur le terminal, réparée par l\'élève', function() {
  var data = readScenario('reseau-maison.json');
  data.activity.faults = [{id: 1, type: 'wifi_pass_wrong', dev: 'Laptop', badValue: 'maison321'}];
  openScenario(data, true);
  var lap = devByName('Laptop');
  eq(lap.wifi.pass, 'maison321');
  eq(lap.wifi.ssid, 'WiFi-Maison');
  notOk(simDHCP(lap.id).ok);
  term(lap.id, 'ipconfig');
});

const allScenarios = fs.readdirSync(SCENARIOS_DIR).filter(function(f) { return f.endsWith('.json'); });

allScenarios.forEach(function(file) {
  const data = readScenario(file);
  const activity = data.activity, net = data.network;

  suite('Scénario ' + file + ' — cohérence du fichier');

  test('points : total 100, seuil de réussite entre 1 et 100', function() {
    eq(activity.objectives.reduce(function(s,o) { return s + o.points; }, 0), 100);
    ok(activity.masteryscore >= 1 && activity.masteryscore <= 100);
  });

  test('identifiants d\'objectifs uniques, types d\'objectifs et de pannes connus', function() {
    var ids = activity.objectives.map(function(o) { return String(o.id); });
    eq(new Set(ids).size, ids.length);
    activity.objectives.forEach(function(o) {
      ok(OBJECTIVE_TYPES.indexOf(o.check) >= 0, 'type inconnu : ' + o.check);
    });
    activity.faults.forEach(function(f) {
      assert(FAULT_TYPES.indexOf(f.type) >= 0, 'panne inconnue : ' + f.type);
    });
  });

  test('topologie : noms uniques, câbles entre appareils existants', function() {
    var names = Object.values(net.devs).map(function(d) { return d.name; });
    eq(new Set(names).size, names.length);
    Object.values(net.links).forEach(function(l) {
      assert(net.devs[l.from] && net.devs[l.to], 'câble orphelin : ' + l.id);
    });
  });

  test('ordre de la liste : chaque objectif et chaque panne y figurent une fois', function() {
    if(!activity.evalOrder) return;
    var keys = activity.objectives.map(function(o) { return 'o:' + o.id; })
      .concat(activity.faults.map(function(f) { return 'f:' + f.id; }));
    eq(activity.evalOrder.slice().sort().join(','), keys.sort().join(','));
    // Les objectifs du fichier sont dans le même ordre : c'est celui que voit l'élève.
    eq(activity.objectives.map(function(o) { return 'o:' + o.id; }).join(','),
       activity.evalOrder.filter(function(k) { return k[0] === 'o'; }).join(','));
  });

  test('objectifs et pannes ne citent que des appareils existants ou à ajouter', function() {
    var known = new Set(Object.values(net.devs).map(function(d) { return d.name; }));
    activity.objectives.forEach(function(o) {
      if(o.check === 'device_added' && o.params.newdev) known.add(o.params.newdev);
    });
    function check(params, where) {
      ['dev','devA','devB','from'].forEach(function(k) {
        if(params[k]) assert(known.has(params[k]), where + ' : appareil inconnu « ' + params[k] + ' »');
      });
      if(params.to && !IPV4.test(params.to)) {
        var target = sandbox.refName(params.to) !== null ? sandbox.refName(params.to) : params.to;
        assert(known.has(target), where + ' : cible inconnue « ' + params.to + ' »');
      }
      // Adresses désignées par un appareil : « {Nom} »
      ['ip','dns','gateway'].forEach(function(k) {
        var n = params[k] && sandbox.refName(params[k]);
        if(n) assert(known.has(n), where + ' : appareil inconnu « ' + params[k] + ' »');
      });
    }
    activity.objectives.forEach(function(o) { check(o.params || {}, 'objectif ' + o.id); });
    activity.faults.forEach(function(f) { check(f.params || f, 'panne ' + f.id); });
  });

  test('ouverture avec pannes : chargement et évaluation sans erreur', function() {
    openScenario(data, true);
    sandbox.checkAllObjectives();
    ok(S.score >= 0 && S.score <= 100);
  });
});

allScenarios.forEach(function(file) {
  const data = readScenario(file);

  suite('Scénario ' + file + ' — parcours de l\'élève');

  test('une fois le réseau corrigé, tous les objectifs sont atteignables (score 100)', function() {
    openScenario(data, false);
    applySolution(data);
    playObjectives(data.activity.objectives);
    var missing = data.activity.objectives.filter(function(o) { return !done(o.id); })
      .map(function(o) { return '#' + o.id + ' ' + o.check; });
    eq(missing.join(', '), '');
    eq(S.score, 100);
  });

  test('les pannes modifient réellement le réseau de départ', function() {
    openScenario(data, false);
    sandbox.autoRoute(); // applyFaults le lance aussi : seules les pannes doivent différer
    var before = JSON.stringify([S.devs, S.links]);
    openScenario(data, true);
    assert(JSON.stringify([S.devs, S.links]) !== before, 'réseau identique avec et sans pannes');
  });

  test('à l\'ouverture, aucun point n\'est acquis (score 0)', function() {
    openScenario(data, true);
    sandbox.checkAllObjectives();
    var free = data.activity.objectives.filter(function(o) { return done(o.id); })
      .map(function(o) { return '#' + o.id + ' ' + o.check; });
    eq(free.join(', '), '');
    eq(S.score, 0);
  });

  test('sans corriger les pannes, l\'élève reste sous le seuil', function() {
    openScenario(data, true);
    playObjectives(data.activity.objectives);
    assert(S.score < data.activity.masteryscore,
      'score ' + S.score + ' sans corriger de panne, pour un seuil de ' + data.activity.masteryscore);
  });
});

/* ─────────────────────────────────────────────────────
   ASSISTANT « NOUVELLE ACTIVITÉ » ET VARIANTES (bloc WIZARD du builder)
───────────────────────────────────────────────────── */
const AW = sandbox.ActivityWizard;

/* Les règles des scénarios fournis, pour un scénario produit par l'assistant ou une variante. */
function scenarioBattery(data, where) {
  var a = data.activity, net = data.network;
  function fail(msg) { throw new Error(where + ' : ' + msg); }
  if(a.objectives.reduce(function(s,o) { return s + o.points; }, 0) !== 100) fail('total des points différent de 100');
  if(!(a.masteryscore >= 1 && a.masteryscore <= 100)) fail('seuil invalide');
  var ids = a.objectives.map(function(o) { return String(o.id); });
  if(new Set(ids).size !== ids.length) fail('identifiants d\'objectifs en double');
  a.objectives.forEach(function(o) { if(OBJECTIVE_TYPES.indexOf(o.check) < 0) fail('type inconnu ' + o.check); });
  a.faults.forEach(function(f) { if(FAULT_TYPES.indexOf(f.type) < 0) fail('panne inconnue ' + f.type); });
  var names = Object.values(net.devs).map(function(d) { return d.name; });
  if(new Set(names).size !== names.length) fail('noms d\'appareils en double');
  Object.values(net.links).forEach(function(l) { if(!net.devs[l.from] || !net.devs[l.to]) fail('câble orphelin ' + l.id); });
  var keys = a.objectives.map(function(o) { return 'o:' + o.id; }).concat(a.faults.map(function(f) { return 'f:' + f.id; }));
  if(a.evalOrder.slice().sort().join(',') !== keys.slice().sort().join(',')) fail('ordre de la liste incomplet');
  if(a.objectives.map(function(o) { return 'o:' + o.id; }).join(',') !==
     a.evalOrder.filter(function(k) { return k[0] === 'o'; }).join(',')) fail('objectifs hors de l\'ordre de la liste');
  var known = new Set(names);
  a.objectives.forEach(function(o) { if(o.check === 'device_added' && o.params.newdev) known.add(o.params.newdev); });
  a.objectives.concat(a.faults).forEach(function(x) {
    var p = x.params || x;
    ['dev','devA','devB','from'].forEach(function(k) { if(p[k] && !known.has(p[k])) fail('appareil inconnu ' + p[k]); });
    ['to','ip','dns','gateway'].forEach(function(k) {
      var n = p[k] && sandbox.refName(p[k]);
      if(n && !known.has(n)) fail('référence inconnue ' + p[k]);
    });
  });
  // Ouverture : aucun point
  openScenario(data, true);
  sandbox.checkAllObjectives();
  if(S.score !== 0) fail('score ' + S.score + ' à l\'ouverture');
  // Réseau corrigé et construit : 100
  openScenario(data, false);
  applySolution(data);
  playObjectives(a.objectives);
  var missing = a.objectives.filter(function(o) { return !done(o.id); }).map(function(o) { return '#' + o.id + ' ' + o.label; });
  if(missing.length) fail('non atteints une fois corrigé : ' + missing.join(' ; '));
  // Sans réparer ni construire : sous le seuil
  if(a.faults.length || a.objectives.some(function(o) { return o.check === 'device_added'; })) {
    openScenario(data, true);
    playObjectives(a.objectives);
    if(S.score >= a.masteryscore) fail('score ' + S.score + ' sans rien réparer, seuil ' + a.masteryscore);
  }
  // Le contrôle de l'assistant arrive à la même conclusion
  var au = AW.audit(data);
  if(!au.ok) fail('audit : ' + au.problems.join(' ; '));
}

suite('Assistant « Nouvelle activité » — chaque modèle est une activité valide');

AW.TYPES.forEach(function(t) {
  AW.THEMES.forEach(function(th) {
    AW.LEVELS.forEach(function(lv) {
      test(t.label + ' · ' + th.label + ' · ' + lv.label + ' (3 tirages)', function() {
        for(var seed = 0; seed < 3; seed++) {
          var sc = AW.build({type: t.id, theme: th.id, level: lv.id, seed: seed});
          scenarioBattery(JSON.parse(JSON.stringify(sc)), 'tirage ' + seed);
          if(t.id === 'depannage') ok(sc.activity.faults.length >= 2, 'au moins deux pannes');
          else eq(sc.activity.faults.length, 0);
        }
      });
    });
  });
});

suite('Assistant « Nouvelle activité » — niveau, tirage, consignes');

test('l\'exigence suit le niveau : adresse exacte, plage, puis libre et contrainte masquée', function() {
  function added(level) {
    return AW.build({type: 'construction', theme: 'entreprise', level: level}).activity.objectives
      .filter(function(o) { return o.check === 'device_added'; })[0];
  }
  eq(added('college').params.ip, '192.168.1.20');
  eq(added('college').showConstraint, true);
  eq(added('lycee').params.ip, '192.168.1.20-49');
  eq(added('bts').params.ip, '192.168.1.*');
  eq(added('bts').showConstraint, false);
  var gw = AW.build({type: 'construction', theme: 'classe', level: 'lycee'}).activity.objectives
    .filter(function(o) { return o.check === 'gateway_configured'; })[0];
  eq(gw.params.gateway, '@routeur');
});

test('un autre tirage met les pannes sur d\'autres postes', function() {
  function targets(seed) {
    return AW.build({type: 'depannage', theme: 'classe', level: 'lycee', seed: seed}).activity.faults
      .map(function(f) { return f.dev || f.devA; }).join(',');
  }
  assert(targets(0) !== targets(1), 'mêmes appareils : ' + targets(0));
});

test('chaque panne est suivie de sa réparation puis d\'un « Test : »', function() {
  var a = AW.build({type: 'depannage', theme: 'entreprise', level: 'bts'}).activity;
  a.evalOrder.forEach(function(k, i) {
    if(k[0] !== 'f') return;
    var rep = a.objectives.filter(function(o) { return 'o:' + o.id === a.evalOrder[i + 1]; })[0];
    var tst = a.objectives.filter(function(o) { return 'o:' + o.id === a.evalOrder[i + 2]; })[0];
    ok(rep && sandbox.STATIC_OBJ_TYPES.indexOf(rep.check) >= 0, 'réparation après ' + k);
    ok(tst && /^Test : /.test(tst.label), 'test après la réparation de ' + k);
  });
});

test('salle de classe : ENT hébergé sur Internet, serveur de données dans l\'établissement', function() {
  ['college', 'lycee', 'bts'].forEach(function(level) {
    var net = AW.build({type: 'decouverte', theme: 'classe', level: level}).network;
    var devs = Object.values(net.devs), by = function(n) { return devs.find(function(d) { return d.name === n; }); };
    var ent = by('Serveur-ENT'), inet = by('Internet'), data = by('Serveur-Données');
    ok(ent && data, 'deux serveurs');
    ok(Object.values(net.links).some(function(l) {
      return (l.from === ent.id && l.to === inet.id) || (l.from === inet.id && l.to === ent.id);
    }), 'ENT relié à Internet');
    notOk(sandbox.isPrivateIP(ent.ifaces[0].ip), 'adresse publique pour l\'ENT');
    ok(sandbox.isPrivateIP(data.ifaces[0].ip), 'serveur de données dans le réseau privé');
    eq(inet.dns.records['ent.etablissement.fr'], ent.ifaces[0].ip);
    devs.filter(function(d) { return d.type === 'pc'; }).forEach(function(d) { eq(d.ifaces[0].dns, '8.8.8.8'); });
  });
  var a = AW.build({type: 'depannage', theme: 'classe', level: 'bts'}).activity;
  ok(a.faults.every(function(f) { return f.dev !== 'Serveur-ENT'; }), 'aucune panne sur l\'ENT, hors de l\'établissement');
  ok(/hébergé sur Internet/.test(a.instructions));
});

test('titre, niveau et consignes renseignés', function() {
  var a = AW.build({type: 'decouverte', theme: 'maison', level: 'college'}).activity;
  eq(a.title, 'Réseau de la maison — Découverte');
  eq(a.level, 'Collège (4e / 3e)');
  ok(/dhcp/i.test(a.instructions), 'la consigne parle du DHCP du Laptop');
});

test('répartition des points : total exact, au moins 1 point chacun', function() {
  var p = AW.distribute([3, 2, 2, 3, 2, 3, 2], 100);
  eq(p.reduce(function(s, x) { return s + x; }, 0), 100);
  ok(p.every(function(x) { return x >= 1; }));
  eq(AW.distribute([1, 1, 1], 100).join(','), '34,33,33');
  eq(AW.distribute([3, 2, 2, 3], 100, 5).join(','), '30,20,20,30');
  ok(AW.build({type: 'construction', theme: 'classe', level: 'bts'}).activity.objectives
    .every(function(o) { return o.points % 5 === 0; }), 'barème des modèles par pas de 5');
});

test('le contrôle signale une activité trop facile', function() {
  var sc = AW.build({type: 'depannage', theme: 'maison', level: 'college'});
  sc.activity.faults = [];
  var au = AW.audit(sc);
  notOk(au.ok);
  ok(au.start > 0, 'les réparations sont acquises dès l\'ouverture sans pannes');
});

suite('Variantes d\'une activité');

const VARIANTS = [
  {label: 'plus guidée',            opts: {exigence: 'guided'}},
  {label: 'plus exigeante',         opts: {exigence: 'demanding'}},
  {label: 'pannes sur d\'autres appareils', opts: {faults: 'move'}},
  {label: 'une panne de moins',     opts: {faults: 'remove'}},
  {label: 'une panne de plus',      opts: {faults: 'add'}},
];

allScenarios.forEach(function(file) {
  VARIANTS.forEach(function(v) {
    test(file + ' — ' + v.label, function() {
      var src = readScenario(file), before = JSON.stringify(src);
      var r = AW.makeVariant(src, v.opts);
      eq(JSON.stringify(src), before, 'le scénario d\'origine n\'est pas modifié');
      var a = r.scenario.activity, n = src.activity.faults.length;
      scenarioBattery(r.scenario, 'variante');
      if(v.opts.exigence === 'guided') {
        eq(a.masteryscore, Math.max(30, src.activity.masteryscore - 10));
        a.objectives.forEach(function(o) {
          if(sandbox.CONSTRAINT_TYPES.indexOf(o.check) >= 0) eq(o.showConstraint, true);
        });
      }
      if(v.opts.exigence === 'demanding') {
        eq(a.masteryscore, Math.min(90, src.activity.masteryscore + 10));
        ok(a.objectives.every(function(o) { return !o.hint; }), 'indices retirés');
      }
      if(v.opts.faults === 'remove') eq(a.faults.length, n >= 2 ? n - 1 : n);
      if(v.opts.faults === 'add') eq(a.faults.length, r.changed ? n + 1 : n);
      if(v.opts.faults === 'move' && r.changed) {
        assert(JSON.stringify(a.faults) !== JSON.stringify(src.activity.faults), 'pannes identiques');
      }
      eq(r.changed, r.report.length > 0 && /—/.test(a.title));
    });
  });
});

test('les pannes bougent bien dans au moins deux scénarios fournis', function() {
  var moved = allScenarios.filter(function(file) {
    return AW.makeVariant(readScenario(file), {faults: 'move'}).changed;
  });
  ok(moved.length >= 2, 'déplacées seulement dans : ' + moved.join(', '));
});

test('une panne de plus s\'ajoute dans au moins deux scénarios fournis', function() {
  var added = allScenarios.filter(function(file) {
    return AW.makeVariant(readScenario(file), {faults: 'add'}).changed;
  });
  ok(added.length >= 2, 'ajoutée seulement dans : ' + added.join(', '));
});

test('variantes combinées d\'une activité de l\'assistant (exigeante + une panne de plus)', function() {
  for(var seed = 0; seed < 3; seed++) {
    var base = AW.build({type: 'depannage', theme: 'classe', level: 'lycee', seed: seed});
    var r = AW.makeVariant(base, {exigence: 'demanding', faults: 'add', seed: seed});
    ok(r.changed);
    scenarioBattery(r.scenario, 'tirage ' + seed);
    r = AW.makeVariant(base, {exigence: 'guided', faults: 'move', seed: seed});
    scenarioBattery(r.scenario, 'guidée, tirage ' + seed);
  }
});

test('autres appareils sur un petit réseau : deux pannes échangent leurs postes', function() {
  var base = AW.build({type: 'depannage', theme: 'maison', level: 'lycee', seed: 0});
  var r = AW.makeVariant(base, {exigence: 'same', faults: ['move']});
  ok(r.changed, r.warnings.join(' ; '));
  ok(r.report.some(function(t) { return /échangée/.test(t); }), r.report.join(' ; '));
  var host = function(sc, type) {
    var f = sc.activity.faults.filter(function(x) { return x.type === type; })[0];
    return (f.params || f).dev;
  };
  eq(host(r.scenario, 'bad_ip'), host(base, 'bad_dns'));
  eq(host(r.scenario, 'bad_dns'), host(base, 'bad_ip'));
  scenarioBattery(r.scenario, 'échange');
});

test('choix combinés : autres appareils et une panne de plus (reseau-maison)', function() {
  var src = readScenario('reseau-maison.json'), n = src.activity.faults.length;
  ok(!AW.makeVariant(src, {faults: ['move']}).changed, 'seul poste fixe : rien ne bouge');
  ok(AW.makeVariant(src, {faults: ['move']}).warnings.some(function(t) { return /Ajoutez-en un/.test(t); }));
  var r = AW.makeVariant(src, {faults: ['move', 'add']});
  ok(r.changed, r.warnings.join(' ; '));
  eq(r.scenario.activity.faults.length, n + 1);
  scenarioBattery(r.scenario, 'combinée');
});

test('mot de passe WiFi incorrect : déplacé vers un autre terminal de la box', function() {
  var base = AW.makeVariant(readScenario('reseau-maison.json'), {faults: ['add']}).scenario;
  var wf = base.activity.faults.filter(function(f) { return f.type === 'wifi_pass_wrong'; })[0];
  ok(wf, 'panne WiFi ajoutée');
  var from = (wf.params || wf).dev;
  var r = AW.makeVariant(base, {faults: ['move']});
  var nf = r.scenario.activity.faults.filter(function(f) { return f.type === 'wifi_pass_wrong'; })[0];
  ok((nf.params || nf).dev !== from, 'déplacée de ' + from);
  scenarioBattery(r.scenario, 'WiFi déplacé');
});

test('variante d\'une activité au format du builder (ids obj_N, pannes avec params)', function() {
  var sc = readScenario('reseau-entreprise.json'), a = sc.activity, map = {};
  a.objectives.forEach(function(o) { map['o:' + o.id] = 'o:obj_' + o.id; o.id = 'obj_' + o.id; });
  a.faults = a.faults.map(function(f) {
    map['f:' + f.id] = 'f:flt_' + f.id;
    var p = Object.assign({}, f); delete p.id; delete p.type;
    return {id: 'flt_' + f.id, type: f.type, label: '', params: p};
  });
  a.evalOrder = a.evalOrder.map(function(k) { return map[k]; });
  var r = AW.makeVariant(sc, {faults: 'add'});
  ok(r.changed, r.warnings.join(' ; '));
  ok(r.scenario.activity.faults.some(function(f) { return /^flt_\d+$/.test(f.id) && f.id !== 'flt_1' && f.id !== 'flt_2'; }));
  ok(r.scenario.activity.objectives.every(function(o) { return /^obj_\d+$/.test(String(o.id)); }));
  eq(r.scenario.activity.objectives.reduce(function(s, o) { return s + o.points; }, 0), 100);
});

/* ── Fichiers et sessions abîmés, LMS qui refuse ── */
suite('Robustesse : fichier vérifié avant chargement, sauvegarde refusée');

function goodNet() {
  return { nid: 4, links: { l3: {id:'l3', from:'d1', to:'d2'} }, devs: {
    d1: {id:'d1', type:'pc', name:'PC-Fichier', x:0, y:0, ifaces:[{name:'eth0',ip:'192.168.1.10',mask:'255.255.255.0',gateway:'',dns:''}]},
    d2: {id:'d2', type:'switch', name:'SW', x:50, y:0, ifaces:[]} } };
}
/* Fait lire un contenu à loadTopology, comme si l'élève choisissait un fichier. */
function loadFile(content) {
  var original = sandbox.FileReader;
  sandbox.FileReader = function() { this.readAsText = function(f) { this.onload({target:{result:f.content}}); }; };
  try { sandbox.loadTopology({target:{files:[{content:content}], value:''}}); }
  finally { sandbox.FileReader = original; }
}

test('réseau des 4 scénarios et des modèles de l\'assistant : accepté', function() {
  var problem = sandbox.networkDataProblem;
  fs.readdirSync(SCENARIOS_DIR).forEach(function(f) { eq(problem(readScenario(f).network), ''); });
  AW.TYPES.forEach(function(t) { AW.THEMES.forEach(function(th) { AW.LEVELS.forEach(function(lv) {
    eq(problem(AW.build({type: t.id, theme: th.id, level: lv.id, seed: 1}).network), '');
  }); }); });
  eq(problem(goodNet()), '');
});

test('réseau abîmé : refusé, avec la raison', function() {
  var problem = sandbox.networkDataProblem;
  function broken(change) { var n = goodNet(); change(n); return problem(n); }
  [null, 'texte', [], {}, {devs:{}}, {devs:[], links:{}}].forEach(function(v) { ok(problem(v)); });
  ok(/type inconnu/.test(broken(function(n) { n.devs.d1.type = 'grille-pain'; })));
  ok(/type inconnu/.test(broken(function(n) { n.devs.d1.type = 'constructor'; })));
  ok(/identifiant/.test(broken(function(n) { n.devs.d1.id = 'd9'; })));
  ok(/interfaces/.test(broken(function(n) { n.devs.d1.ifaces = 'eth0'; })));
  ok(/interfaces/.test(broken(function(n) { delete n.devs.d1.ifaces; })));
  ok(/interfaces/.test(broken(function(n) { n.devs.d1.ifaces = [null]; })));
  ok(/DNS/.test(broken(function(n) { n.devs.d1.dns = {on:true}; })));
  ok(/services/.test(broken(function(n) { n.devs.d1.dhcp = 'oui'; })));
  ok(/routes/.test(broken(function(n) { n.devs.d1.staticRoutes = {}; })));
  ok(/illisible/.test(broken(function(n) { n.devs.d2 = null; })));
  ok(/appareil absent/.test(broken(function(n) { n.links.l3.to = 'd7'; })));
  ok(/cadres/.test(broken(function(n) { n.frames = []; })));
  // Un routeur sans interfaces (ancien fichier) reste accepté : elles sont recréées au chargement
  eq(broken(function(n) { n.devs.d2 = {id:'d2', type:'router', name:'R'}; }), '');
});

test('fichier choisi par l\'élève : abîmé → réseau en cours conservé ; valide → remplacé', function() {
  resetNet();
  mkPC('192.168.1.10','255.255.255.0','','','PC-EnCours');
  var devs = S.devs, nid = S.nid;
  var bad = goodNet(); bad.links.l3.to = 'd7';
  ['{pas du json', 'null', '{"devs":{}}', JSON.stringify(bad)].forEach(function(content) {
    loadFile(content);
    ok(S.devs === devs && devByName('PC-EnCours'), 'réseau remplacé par : ' + content.slice(0, 30));
    eq(S.nid, nid);
  });
  loadFile(JSON.stringify(goodNet()));
  ok(devByName('PC-Fichier')); notOk(devByName('PC-EnCours'));
  // Scénario exporté par le builder (version 2) : son réseau est chargé
  resetNet();
  loadFile(JSON.stringify({version: 2, network: goodNet(), activity: {}}));
  ok(devByName('PC-Fichier'));
});

test('numéro suivant absent ou trop bas dans le fichier : un nouvel appareil ne remplace rien', function() {
  [undefined, 1, 'x'].forEach(function(nid) {
    resetNet();
    var n = goodNet(); n.nid = nid;
    sandbox.applyNetworkData(n);
    eq(S.nid, 4);
    var id = mkDev('pc', 0, 0);
    eq(id, 'd4'); eq(Object.keys(S.devs).length, 3);
  });
  resetNet();
  var big = goodNet(); big.nid = 40;
  sandbox.applyNetworkData(big);
  eq(S.nid, 40);
});

test('LMS qui refuse suspend_data (trop long) : signalé, réseau gardé sur le poste', function() {
  setupActivity([]);
  var api = makeLMS({});
  api.LMSSetValue = function(k, v) {
    if(k === 'cmi.suspend_data' && String(v).length > 300) return 'false';
    api.data[k] = v; return 'true';
  };
  withStorage(function(store) {
    withLMS(api, function() {
      eq(sandbox.sSet('cmi.core.score.raw', '10'), true);
      ok(sandbox.saveToSession()); eq(sandbox._lmsSaveRefused, false);
      for(var i = 0; i < 6; i++) mkPC('192.168.1.' + (10 + i), '255.255.255.0', '', '', 'PC-Long-' + i);
      ok(sandbox.saveToSession(), 'gardé dans localStorage');
      eq(sandbox._lmsSaveRefused, true);
      ok(store[sandbox.SESSION_KEY].indexOf('PC-Long-5') >= 0);
      notOk(String(api.data['cmi.suspend_data']).indexOf('PC-Long-5') >= 0);
    });
  });
  // Sans localStorage non plus : la sauvegarde est annoncée comme échouée
  var original = sandbox.localStorage;
  sandbox.localStorage = { getItem: function() { return null; }, setItem: function() { throw new Error('plein'); } };
  try { withLMS(api, function() { notOk(sandbox.saveToSession()); }); }
  finally { sandbox.localStorage = original; }
});

test('session abîmée : l\'élève repart du réseau de départ, pannes comprises', function() {
  setupActivity([]);
  sandbox.STARTER_NETWORK = goodNet();
  sandbox.ACTIVITY_CONFIG.faults = [{type:'bad_ip', dev:'PC-Fichier', badValue:'10.9.9.9'}];
  var bad = goodNet(); bad.devs.d1.type = 'inconnu';
  try {
    ['{pas du json', '[]', JSON.stringify(bad)].forEach(function(json) {
      withStorage(function(store) {
        resetNet();
        sandbox.ACTIVITY_CONFIG.faults = [{type:'bad_ip', dev:'PC-Fichier', badValue:'10.9.9.9'}];
        store[sandbox.SESSION_KEY] = json;
        eq(sandbox.loadFromSession(), 'starter');
        eq(mainIface(devByName('PC-Fichier')).ip, '10.9.9.9');
      });
    });
  } finally { sandbox.STARTER_NETWORK = null; }
});

/* ── Isolation du moteur dans le builder ──
   Le JS du builder suit le bloc SIM-ENGINE dans le même <script> : une fonction qu'il redéfinit
   remplace celle du moteur. Une copie oubliée y vieillit sans que rien ne le signale (anciens
   simDHCP et autoRoute). Une surcharge voulue porte le marqueur « override builder: nom » sur
   la ligne précédente. */
suite('Builder : le moteur n\'est pas redéfini');

test('aucune fonction du moteur redéfinie sans marqueur, aucune fonction définie deux fois', function() {
  var L = html.split(/\r?\n/);
  var s = L.findIndex(function(l) { return l.indexOf('SIM-ENGINE-START') !== -1; });
  var e = L.findIndex(function(l) { return l.indexOf('/* SIM-ENGINE-END') === 0; });
  ok(s > 0 && e > s);
  function topFns(a, b) {
    var out = [];
    for (var i = a; i < b; i++) {
      var m = L[i].match(/^function\s+([\w$]+)\s*\(/);
      if (m) out.push({name: m[1], line: i + 1, marked: L[i - 1].indexOf('override builder: ' + m[1] + ' ') !== -1});
    }
    return out;
  }
  var engine = {}, seen = {}, unmarked = [], twice = [];
  topFns(s, e).forEach(function(f) { engine[f.name] = true; });
  ok(engine.simPing && engine.simDHCP && engine.autoRoute);
  topFns(e, L.length).forEach(function(f) {
    if (engine[f.name] && !f.marked) unmarked.push(f.name + ' (l.' + f.line + ')');
    if (seen[f.name]) twice.push(f.name + ' (l.' + seen[f.name] + ' et l.' + f.line + ')');
    seen[f.name] = f.line;
  });
  assert(!unmarked.length, 'fonctions du moteur redéfinies dans le builder sans marqueur : ' + unmarked.join(', '));
  assert(!twice.length, 'fonctions définies deux fois dans le builder : ' + twice.join(', '));
});

/* ── Cœur réseau isolé ──
   Le moteur est assemblé à partir de src/net-core.js (modèle, simulation, évaluation) puis de
   src/sim-ui.js (affichage, souris, terminal, SCORM), séparés par le marqueur NET-CORE-END.
   Le cœur doit fonctionner sans navigateur : il est exécuté ici seul, dans un contexte vide. */
suite('Cœur réseau isolé : sans navigateur ni interface');

var coreJs = (function() {
  var a = html.indexOf('SIM-ENGINE-START'), b = html.indexOf('/* NET-CORE-END');
  assert(a > 0 && b > a, 'marqueur NET-CORE-END introuvable dans le bloc SIM-ENGINE');
  return html.slice(html.indexOf('*/', a) + 2, b);
})();
var uiJs = html.slice(html.indexOf('/* NET-CORE-END'), html.indexOf('/* SIM-ENGINE-END'));

function bareCore() {
  var ctx = vm.createContext({});
  vm.runInContext(coreJs, ctx, {filename: 'net-core.js'});
  return ctx;
}

test('le cœur ne nomme ni le navigateur ni une fonction de l\'interface', function() {
  var code = coreJs.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  var found = [];
  ['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'console', 'location'].forEach(function(n) {
    if (new RegExp('(^|[^.\\w$\'"])' + n + '\\s*[.\\[(]', 'm').test(code)) found.push(n);
  });
  var calls = ['setTimeout', 'clearTimeout', 'setInterval', 'requestAnimationFrame', 'alert', 'confirm', 'prompt'];
  function fnNames(src) {
    var out = [], re = /^function\s+([\w$]+)\s*\(/gm, m;
    while ((m = re.exec(src))) out.push(m[1]);
    return out;
  }
  var uiFns = fnNames(uiJs.replace(/\r/g, ''));
  ok(uiFns.indexOf('render') !== -1 && uiFns.indexOf('addLog') !== -1 && uiFns.indexOf('notif') !== -1);
  var coreFns = fnNames(coreJs.replace(/\r/g, ''));
  ok(coreFns.indexOf('simPing') !== -1 && coreFns.indexOf('evaluateObjectives') !== -1 && coreFns.indexOf('applyFaults') !== -1);
  calls.concat(uiFns, fnNames(extraJsForCore()), ['checkAllObjectives', 'checkDynamicObjective', 'showProps']).forEach(function(n) {
    if (coreFns.indexOf(n) !== -1) return;
    if (new RegExp('(^|[^.\\w$\'"])' + n.replace(/\$/g, '\\$') + '\\s*\\(', 'm').test(code)) found.push(n + '()');
  });
  assert(!found.length, 'le cœur réseau utilise : ' + found.join(', '));
});
function extraJsForCore() {
  // partie du template élève qui suit le moteur (src/template-extra.js)
  var i = simJs.indexOf('/* NET-CORE-END');
  var j = simJs.indexOf('function renderActivityTab');
  return i !== -1 && j > i ? simJs.slice(j).replace(/\r/g, '') : '';
}

test('le cœur se charge seul et simule un réseau construit à la main', function() {
  var c = bareCore();
  eq(typeof c.document, 'undefined');
  eq(typeof c.render, 'undefined');
  var p1 = c.mkDev('pc', 0, 0), p2 = c.mkDev('pc', 100, 0), sw = c.mkDev('switch', 50, 50);
  c.S.devs[p1].ifaces[0].ip = '192.168.1.10'; c.S.devs[p1].ifaces[0].mask = '255.255.255.0';
  c.S.devs[p2].ifaces[0].ip = '192.168.1.20'; c.S.devs[p2].ifaces[0].mask = '255.255.255.0';
  [[p1, sw], [p2, sw]].forEach(function(l) {
    var chk = c.linkCheck(l[0], l[1]);
    ok(chk.ok); notOk(chk.wifi);
    var id = 'l' + (c.S.nid++); c.S.links[id] = {id: id, from: l[0], to: l[1]};
  });
  ok(c.simPing(p1, '192.168.1.20').ok);
  notOk(c.simPing(p1, '192.168.1.99').ok);
  // règles de câblage : doublon et second câble refusés, sans affichage
  notOk(c.linkCheck(p1, sw).ok); eq(c.linkCheck(p1, sw).msg, '');
  ok(/déjà un câble/.test(c.linkCheck(p1, p2).msg));
  eq(c.checkObjectiveStatic({check: 'ip_configured', params: {dev: c.S.devs[p1].name, ip: '192.168.1.10'}}), true);
});

test('chaque scénario est chargé, évalué, mis en panne et parcouru par le cœur seul', function() {
  var IP = /^\d+\.\d+\.\d+\.\d+$/;
  var files = fs.readdirSync(SCENARIOS_DIR).filter(function(f) { return /\.json$/.test(f); });
  ok(files.length >= 4);
  files.forEach(function(file) {
    var data = readScenario(file), c = bareCore(), objs = data.activity.objectives;
    function exercise() {
      var devs = Object.keys(c.S.devs).map(function(k) { return c.S.devs[k]; }), okPings = 0;
      devs.forEach(function(d) {
        if (c.isRouter(d)) c.getRoutingTable(d.id);
        if (d.type !== 'pc' && d.type !== 'server') return;
        c.wifiProblem(d.id);
        devs.forEach(function(o) {
          var fi = c.mainIface(o);
          if (o !== d && fi && IP.test(fi.ip || '') && c.simPing(d.id, fi.ip).ok) okPings++;
        });
        c.simPing(d.id, '8.8.8.8');
      });
      objs.forEach(function(o) {
        var from = c.devByName(o.params && o.params.from);
        if (!from) return;
        if (o.check === 'http_success') c.simHTTP(from.id, o.params.url || '');
        if (o.check === 'dns_success') c.simDNS(from.id, o.params.domain || o.params.name || '');
      });
      c.evaluateObjectives(objs);
      c.addressPlan(objs);
      return okPings;
    }
    eq(c.networkDataProblem(data.network), '');
    c.applyNetworkData(JSON.parse(JSON.stringify(data.network)));
    c.START_DEV_IDS = Object.keys(c.S.devs);
    assert(exercise() > 0, file + ' : aucun ping ne passe dans le corrigé');
    var statics = objs.filter(function(o) { return c.STATIC_OBJ_TYPES.indexOf(o.check) !== -1 && o.check !== 'device_added'; });
    assert(statics.some(function(o) { return c.checkObjectiveStatic(o) === true; }), file + ' : aucun objectif statique vrai dans le réseau fourni');
    // pannes, DHCP et routes recalculées : toujours sans navigateur
    c.applyFaults(JSON.parse(JSON.stringify(data.activity.faults || [])));
    exercise();
    objs.forEach(function(o) {
      var from = c.devByName(o.params && o.params.from);
      if (o.check === 'dhcp_success' && from) c.simDHCP(from.id);
    });
    c.computeRoutes(true);
    exercise();
  });
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

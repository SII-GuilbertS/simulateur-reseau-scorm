
'use strict';
/* stub overridé par le builder */
function snapHistory(){}


/* ─────────────────────────────────────────────────────
   RÉSEAU DE DÉPART (intégré par le professeur)
   La ligne suivante est remplacée lors de la génération
───────────────────────────────────────────────────── */
var STARTER_NETWORK = null; /* __STARTER__ */
var TEACHER_PWD = 'prof'; /* __TEACHER_PWD__ */

/* ── Activité personnalisée ── */
var ACTIVITY_CONFIG = null; /* __ACTIVITY__ */
var ACTIVITY_RESULTS = {};  // {objectiveId: true} quand atteint

/* ─────────────────────────────────────────────────────
   MOTEUR D'ACTIVITÉ
───────────────────────────────────────────────────── */
function devByName(name){
  if(!name)return null;
  var n=name.trim().toLowerCase();
  return Object.values(S.devs).find(function(d){return d.name&&d.name.trim().toLowerCase()===n;})||null;
}

function ipMatchesPattern(ip,pattern){
  if(!pattern||!ip)return !pattern;
  if(pattern.indexOf('*')<0)return ip===pattern;
  var pp=pattern.split('.'),ip4=ip.split('.');
  if(pp.length!==4||ip4.length!==4)return false;
  return pp.every(function(seg,i){return seg==='*'||seg===ip4[i];});
}








function toggleScoreDetails(){
  var panel=document.getElementById('score-details');
  if(!panel)return;
  renderScoreDetails();
  panel.classList.toggle('open');
}
document.addEventListener('click',function(e){
  var panel=document.getElementById('score-details');
  var badge=document.getElementById('hdr-score');
  if(panel&&panel.classList.contains('open')&&!panel.contains(e.target)&&e.target!==badge){
    panel.classList.remove('open');
  }
});




/* ─────────────────────────────────────────────────────
   SCORM 1.2  (cherche l'API dans parents + opener)
───────────────────────────────────────────────────── */
var _api=null,_apiOk=false;
var SESSION_KEY='sim_reseau_v2'; // clé localStorage fallback

function scormInit(){
  function findIn(w){var n=0;while(!w.API&&w.parent!==w&&n++<12)w=w.parent;return w.API||null;}
  _api=findIn(window);
  if(!_api&&window.opener){try{_api=findIn(window.opener);}catch(e){}}
  if(_api){
    var r=_api.LMSInitialize('');_apiOk=(r==='true'||r===true);
    // Marquer l'activité comme "en cours" si pas encore réussie
    if(_apiOk){
      var st=_api.LMSGetValue('cmi.core.lesson_status');
      if(st!=='passed'&&st!=='failed')sSet('cmi.core.lesson_status','incomplete');
    }
  }
}
function sSet(k,v){if(_api&&_apiOk)_api.LMSSetValue(k,String(v));}
function sGet(k){if(_api&&_apiOk)return _api.LMSGetValue(k);return '';}
function sCom(){if(_api&&_apiOk)_api.LMSCommit('');}
function sEnd(sc,ok){
  if(!_api||!_apiOk)return;
  sSet('cmi.core.score.min','0');sSet('cmi.core.score.max','100');sSet('cmi.core.score.raw',String(sc));
  sSet('cmi.core.lesson_status',ok?'passed':'failed');sCom();_api.LMSFinish('');_apiOk=false;
}

/* ─── Sauvegarde session (SCORM suspend_data + localStorage fallback) ─── */


/* ─── Restauration session ─── */


function applyNetworkData(data){
  S.devs=data.devs||{};S.links=data.links||{};S.nid=data.nid||1;
  S.activeLinks=new Set();S.animPhase=null;
  Object.values(S.devs).forEach(function(d){
    if(!d.dhcp)d.dhcp={on:false,start:'192.168.1.100',end:'192.168.1.200',mask:'255.255.255.0',gateway:'',dns:''};
    else if(!d.dhcp.end)d.dhcp.end='192.168.1.200';
    if(!d.staticRoutes)d.staticRoutes=[];
    if((d.type==='router'||d.type==='internet'||d.type==='wifi_router')&&d.autoRouteEnabled===undefined)d.autoRouteEnabled=true;
    if((d.type==='router'||d.type==='internet'||d.type==='wifi_router')&&(!d.ifaces||d.ifaces.length===0))
      d.ifaces=[{name:'eth0',ip:'',mask:'255.255.255.0'},{name:'eth1',ip:'',mask:'255.255.255.0'}];
    if(d.type==='wifi_router'&&!d.ssid)d.ssid='MonWiFi';
    if(d.type==='wifi_router'&&d.wifiPass===undefined)d.wifiPass='';
    if(!d.http)d.http={on:false,title:'Ma page web',content:'',htmlMode:false};
    if(d.http&&d.http.htmlMode===undefined)d.http.htmlMode=false;
    if(!d.dns)d.dns={on:false,records:{}};
    if(d.type==='server'&&!d.serverFiles)d.serverFiles={};
  });
}

/* ─────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────── */
var DW=126,DH=80;
var DT={
  pc:      {label:'PC',       icon:'🖥️',bg:'#ebf8ff',bd:'#4299e1',tc:'#2b6cb0'},
  server:  {label:'Serveur',  icon:'🖧', bg:'#f0fff4',bd:'#48bb78',tc:'#276749'},
  switch:  {label:'Switch',   icon:'🔀',bg:'#fffbeb',bd:'#ed8936',tc:'#c05621'},
  router:  {label:'Routeur',  icon:'📡',bg:'#faf5ff',bd:'#9f7aea',tc:'#553c9a'},
  wifi_router:{label:'Box WiFi',icon:'📶',bg:'#f0f4ff',bd:'#667eea',tc:'#4c51bf'},
  internet:{label:'Internet', icon:'🌐',bg:'#e0f2fe',bd:'#0ea5e9',tc:'#0369a1'}
};
var VMASKS=['255.255.255.0','255.255.0.0','255.0.0.0',
  '255.255.255.128','255.255.255.192','255.255.255.224',
  '255.255.255.240','255.255.255.248','255.255.255.252'];

/* ─────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────── */
var S={
  devs:{},links:{},frames:{},texts:{},nid:1,
  tool:'select',mode:'config',
  sel:null,cableFrom:null,drag:null,
  termDev:null,
  score:0,
  activeLinks:new Set(),  // câbles animés
  animPhase:null,         // 'fwd'|'ret'|null
  packets:[]              // sniffer de paquets
};

/* ── Historique terminal (flèches ↑ ↓) ── */
var _termHistory=[];var _termHistIdx=-1;var _termDraft='';
function termKey(e){
  var inp=document.getElementById('tinput');
  if(e.key==='Enter'){termExec();e.preventDefault();return;}
  if(e.key==='ArrowUp'){
    e.preventDefault();
    if(!_termHistory.length)return;
    if(_termHistIdx===-1)_termDraft=inp.value;
    if(_termHistIdx<_termHistory.length-1){
      _termHistIdx++;
      inp.value=_termHistory[_termHistory.length-1-_termHistIdx];
      setTimeout(function(){inp.selectionStart=inp.selectionEnd=inp.value.length;},0);
    }
    return;
  }
  if(e.key==='ArrowDown'){
    e.preventDefault();
    if(_termHistIdx===-1)return;
    _termHistIdx--;
    inp.value=_termHistIdx===-1?_termDraft:_termHistory[_termHistory.length-1-_termHistIdx];
    setTimeout(function(){inp.selectionStart=inp.selectionEnd=inp.value.length;},0);
    return;
  }
}

/* ─────────────────────────────────────────────────────
   IP UTILS
───────────────────────────────────────────────────── */
function ip2n(ip){
  if(!ip)return -1;var p=ip.trim().split('.');if(p.length!==4)return -1;
  var n=0;for(var i=0;i<4;i++){var x=parseInt(p[i],10);if(isNaN(x)||x<0||x>255)return -1;n=n*256+x;}
  return n>>>0;
}
function vIP(ip){return ip2n(ip)>=0;}
function vMask(m){return m&&VMASKS.indexOf(m.trim())!==-1;}

/* ── Validation stricte saisie utilisateur ── */
function isValidUserIP(ip){
  var v=(ip||'').trim();
  if(v==='')return true;
  var p=v.split('.');
  if(p.length!==4)return false;
  for(var i=0;i<4;i++){
    var s=p[i];
    if(!/^\d+$/.test(s))return false;
    if(s.length>1&&s[0]==='0')return false;
    var n=parseInt(s,10);
    if(n<0||n>255)return false;
  }
  if(v==='0.0.0.0')return false;
  return true;
}
function isValidUserMask(mask){
  var v=(mask||'').trim();
  if(v==='')return true;
  var p=v.split('.');
  if(p.length!==4)return false;
  var n32=0;
  for(var i=0;i<4;i++){
    var s=p[i];
    if(!/^\d+$/.test(s))return false;
    var n=parseInt(s,10);
    if(n<0||n>255)return false;
    n32=(n32<<8)|n;
  }
  n32=n32>>>0;
  var inv=(~n32)>>>0;
  return (inv&(inv+1))===0;
}
function chkIP(el){
  var ok=isValidUserIP(el.value);
  el.style.borderColor=ok?'':'#fc8181';
  el.style.background=ok?'':'#fff5f5';
}
function chkMask(el){
  var ok=isValidUserMask(el.value);
  el.style.borderColor=ok?'':'#fc8181';
  el.style.background=ok?'':'#fff5f5';
}
function sameNet(ip1,mask,ip2){
  var a=ip2n(ip1),m=ip2n(mask),b=ip2n(ip2);
  if(a<0||m<0||b<0)return false;return((a&m)>>>0)===((b&m)>>>0);
}
function macOf(id){
  var n=parseInt(id.replace(/\D/g,''),10)||0;
  return 'AA:BB:CC:00:'+('0'+Math.floor(n/256).toString(16)).slice(-2).toUpperCase()+':'+('0'+(n%256).toString(16)).slice(-2).toUpperCase();
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ─────────────────────────────────────────────────────
   DEVICE / LINK MANAGEMENT
───────────────────────────────────────────────────── */
function mkDev(type,x,y){
  var id='d'+(S.nid++);
  var cnt={};Object.values(S.devs).forEach(function(d){cnt[d.type]=(cnt[d.type]||0)+1;});
  var num=(cnt[type]||0)+1;
  var ifaces=[];
  if(type==='router'||type==='internet'||type==='wifi_router'){
    ifaces=type==='wifi_router'?
      [{name:'WAN',ip:'',mask:'255.255.255.0'},{name:'WiFi',ip:'',mask:'255.255.255.0'}]:
      [{name:'eth0',ip:'',mask:'255.255.255.0'},{name:'eth1',ip:'',mask:'255.255.255.0'}];
  } else if(type==='switch'){
    ifaces=[];
  } else {
    ifaces=[{name:'eth0',ip:'',mask:'255.255.255.0',gateway:'',dns:''}];
  }
  S.devs[id]={id:id,type:type,name:DT[type].label+' '+num,x:x,y:y,
    mac:macOf(id),ifaces:ifaces,
    http:{on:false,title:'Ma page web',content:'Bienvenue sur ce serveur !',htmlMode:false},
    dns:{on:false,records:{}},
    serverFiles:{},
    dhcp:{on:false,start:'192.168.1.100',end:'192.168.1.200',mask:'255.255.255.0',gateway:'',dns:''},
    staticRoutes:[],
    autoRouteEnabled:((type==='router'||type==='internet'||type==='wifi_router')?true:undefined),
    ssid:(type==='wifi_router'?'MonWiFi':undefined),
    wifiPass:(type==='wifi_router'?'':undefined)};
  return id;
}

function delDev(id){
  Object.keys(S.links).forEach(function(lid){var l=S.links[lid];if(l.from===id||l.to===id)delete S.links[lid];});
  delete S.devs[id];
  if(S.sel===id)S.sel=null;if(S.cableFrom===id)S.cableFrom=null;if(S.termDev===id)S.termDev=null;
}

function addLink(a,b){
  if(a===b)return null;
  // Pas de doublon
  var dup=Object.values(S.links).find(function(l){return(l.from===a&&l.to===b)||(l.from===b&&l.to===a);});
  if(dup)return null;
  // PC/Serveur : 1 câble + 1 WiFi ; auto-tag liaison WiFi
  var da=S.devs[a],db=S.devs[b];
  var isWifi=(da&&da.type==='wifi_router'&&db&&(db.type==='pc'||db.type==='server'))
            ||(db&&db.type==='wifi_router'&&da&&(da.type==='pc'||da.type==='server'));
  function cableCount(id){return Object.values(S.links).filter(function(l){return (l.from===id||l.to===id)&&l.type!=='wifi';}).length;}
  function wifiCount(id){return Object.values(S.links).filter(function(l){return (l.from===id||l.to===id)&&l.type==='wifi';}).length;}
  if(isWifi){
    if(da&&(da.type==='pc'||da.type==='server')&&wifiCount(a)>=1){notif('⚠️ '+da.name+' est déjà connecté en WiFi','err');return null;}
    if(db&&(db.type==='pc'||db.type==='server')&&wifiCount(b)>=1){notif('⚠️ '+db.name+' est déjà connecté en WiFi','err');return null;}
  } else {
    if(da&&(da.type==='pc'||da.type==='server')&&cableCount(a)>=1){notif('⚠️ '+da.name+' a déjà un câble — connexion unique autorisée','err');return null;}
    if(db&&(db.type==='pc'||db.type==='server')&&cableCount(b)>=1){notif('⚠️ '+db.name+' a déjà un câble — connexion unique autorisée','err');return null;}
  }
  var id='l'+(S.nid++);S.links[id]={id:id,from:a,to:b};
  setTimeout(function(){checkAllObjectives();},50);
  if(isWifi)S.links[id].type='wifi';
  return id;
}

function nbrs(devId){
  var r=[];
  Object.values(S.links).forEach(function(l){if(l.from===devId)r.push(l.to);else if(l.to===devId)r.push(l.from);});
  return r;
}

// BFS LAN segment (traverse through switches)
function lanSeg(startId){
  var vis=new Set(),q=[startId],res=new Set();
  while(q.length){var id=q.shift();if(vis.has(id))continue;vis.add(id);res.add(id);
    nbrs(id).forEach(function(nid){res.add(nid);if(!vis.has(nid)&&S.devs[nid]&&S.devs[nid].type==='switch')q.push(nid);});}
  return Array.from(res);
}

// BFS cable path (returns link ID list between two devices, through switches)
function cablePath(fromId,toId){
  if(fromId===toId)return[];
  var vis=new Set();
  var q=[{id:fromId,path:[]}];
  while(q.length){
    var cur=q.shift();
    if(vis.has(cur.id))continue;
    vis.add(cur.id);
    var links=Object.values(S.links).filter(function(l){return l.from===cur.id||l.to===cur.id;});
    for(var i=0;i<links.length;i++){
      var l=links[i];
      var nid=(l.from===cur.id)?l.to:l.from;
      var np=cur.path.concat(l.id);
      if(nid===toId)return np;          // ← chemin trouvé
      if(!vis.has(nid))q.push({id:nid,path:np});
    }
  }
  return[];                             // ← aucun chemin physique
}

function devByIP(ip){
  return Object.values(S.devs).find(function(d){
    return d.ifaces&&d.ifaces.some(function(f){return f.ip&&f.ip.trim()===ip.trim();});
  })||null;
}
function mainIface(d){return d.ifaces&&d.ifaces[0]?d.ifaces[0]:null;}

/* ─────────────────────────────────────────────────────
   CABLE PATH ANIMATION
───────────────────────────────────────────────────── */
var _animT1=null,_animT2=null;

function animPath(devIdPath){
  if(!devIdPath||devIdPath.length<2){S.activeLinks=new Set();S.animPhase=null;renderLinks();return;}
  // Chemin fourni directement en IDs (plus d'ambiguïté de nom)
  var ids=devIdPath.filter(function(id){return id&&S.devs[id];});
  if(_animT1)clearTimeout(_animT1);if(_animT2)clearTimeout(_animT2);
  if(ids.length<2){S.activeLinks=new Set();S.animPhase=null;renderLinks();return;}
  // Trouver tous les câbles du chemin (y compris via les switches intermédiaires)
  var linkIds=new Set();
  for(var i=0;i<ids.length-1;i++){
    var cp=cablePath(ids[i],ids[i+1]);
    cp.forEach(function(lid){linkIds.add(lid);});
  }
  S.activeLinks=linkIds;
  // Phase 1 : aller (vert)
  S.animPhase='fwd';renderLinks();
  // Phase 2 : retour (bleu) après 1.4s
  _animT1=setTimeout(function(){S.animPhase='ret';renderLinks();},1400);
  // Fin après 2.8s
  _animT2=setTimeout(function(){S.activeLinks=new Set();S.animPhase=null;renderLinks();},2800);
}

/* ─────────────────────────────────────────────────────
   SIMULATION ENGINE
───────────────────────────────────────────────────── */
function isRouter(d){return d&&(d.type==='router'||d.type==='internet'||d.type==='wifi_router');}

function simPing(srcId,destIP){
  var src=S.devs[srcId];if(!src)return{ok:false,reason:'Appareil introuvable'};
  if(src.type==='switch')return{ok:false,reason:'Un switch n\'a pas d\'adresse IP'};
  var si=mainIface(src);
  if(!si||!si.ip)return{ok:false,reason:'Adresse IP non configurée sur '+src.name};
  destIP=destIP.trim();
  if(si.ip.trim()===destIP)return{ok:true,path:[src.id],lat:0};
  var dst=devByIP(destIP);
  if(!dst){
    var _ir=routesToInternet(srcId);
    if(_ir)return{ok:true,path:[src.id,_ir.router.id,_ir.inet.id],lat:32,internet:true};
    return{ok:false,reason:'Hôte '+destIP+' inconnu (aucun appareil n\'a cette IP)'};
  }
  // Même réseau direct
  if(sameNet(si.ip,si.mask,destIP)){
    var seg=lanSeg(srcId);
    if(seg.indexOf(dst.id)!==-1)return{ok:true,path:[src.id,dst.id],lat:1};
    // Pont WiFi : src et dst reliés au même wifi_router via WiFi
    var sharedWifi=null;
    Object.values(S.links).forEach(function(la){
      if(la.type!=='wifi'||sharedWifi)return;
      var rId=(la.from===srcId)?la.to:(la.to===srcId?la.from:null);
      if(!rId)return;
      var rd=S.devs[rId];if(!rd||rd.type!=='wifi_router')return;
      Object.values(S.links).forEach(function(lb){
        if(lb.type!=='wifi')return;
        if((lb.from===rId&&lb.to===dst.id)||(lb.to===rId&&lb.from===dst.id))sharedWifi=rId;
      });
    });
    if(sharedWifi)return{ok:true,path:[src.id,sharedWifi,dst.id],lat:1,wifi:true};
    return{ok:false,reason:'Même sous-réseau mais appareils non reliés physiquement'};
  }
  // Via passerelle
  var gw=(si.gateway||'').trim();
  if(!gw)return{ok:false,reason:'Aucune passerelle configurée sur '+src.name+' (champ Gateway)'};
  if(!sameNet(si.ip,si.mask,gw))
    return{ok:false,reason:'La passerelle '+gw+' n\'est pas dans le sous-réseau de '+src.name};
  var gwDev=devByIP(gw);
  if(!gwDev)return{ok:false,reason:'Passerelle '+gw+' introuvable'};
  if(!isRouter(gwDev))return{ok:false,reason:gw+' n\'est pas un routeur'};
  var srcSeg=lanSeg(srcId);
  if(srcSeg.indexOf(gwDev.id)===-1)return{ok:false,reason:'Pas de liaison physique vers le routeur '+gwDev.name};
  // Vérifier que le routeur peut atteindre destIP via l'une de ses interfaces
  var found=false,rpath=null;
  gwDev.ifaces.forEach(function(ri){
    if(!ri.ip||found)return;
    if(sameNet(ri.ip,ri.mask,destIP)){
      var rSeg=lanSeg(gwDev.id);
      if(rSeg.indexOf(dst.id)!==-1){found=true;rpath=[src.id,gwDev.id,dst.id];}
    }
  });
  if(found)return{ok:true,path:rpath,lat:2,router:true};
  // Multi-hop : BFS sur les routeurs physiquement voisins (routage RIP implicite)
  var _q=[{r:gwDev,p:[src.id,gwDev.id]}],_vis=new Set([gwDev.id]),_mfound=false,_mpath=null;
  for(var _qi=0;_qi<_q.length&&_qi<10&&!_mfound;_qi++){
    var _cur=_q[_qi],_cr=_cur.r;
    lanSeg(_cr.id).forEach(function(nid){
      if(_mfound||_vis.has(nid))return;
      var nd=S.devs[nid];if(!nd||!isRouter(nd))return;
      _vis.add(nid);
      var _hf=false;
      nd.ifaces.forEach(function(ri){if(!ri.ip||_hf)return;if(sameNet(ri.ip,ri.mask,destIP)&&lanSeg(nd.id).indexOf(dst.id)!==-1)_hf=true;});
      if(_hf){_mfound=true;_mpath=_cur.p.concat([nd.id,dst.id]);}
      else _q.push({r:nd,p:_cur.p.concat([nd.id])});
    });
  }
  if(_mfound)return{ok:true,path:_mpath,lat:_mpath.length-1,router:true};
  return{ok:false,reason:'Pas de route vers '+destIP+' depuis '+gwDev.name+'. Vérifiez les interfaces des routeurs intermédiaires.'};
}

function simDNS(srcId,domain){
  var src=S.devs[srcId];if(!src)return{ok:false,reason:'Appareil introuvable'};
  var si=mainIface(src);
  if(!si||!si.dns)return{ok:false,reason:'Pas de DNS configuré dans la config IP de '+src.name};
  var dip=si.dns.trim();
  // DNS local
  var ddev=devByIP(dip);if(!ddev)return{ok:false,reason:'Serveur DNS '+dip+' introuvable'};
  var pr=simPing(srcId,dip);if(!pr.ok)return{ok:false,reason:'DNS inaccessible : '+pr.reason};
  if(!ddev.dns||!ddev.dns.on)return{ok:false,reason:ddev.name+' n\'a pas le service DNS activé'};
  var ip=ddev.dns.records[(domain||'').toLowerCase().trim()];
  if(!ip)return{ok:false,reason:'Domaine "'+domain+'" non trouvé dans le DNS de '+ddev.name};
  return{ok:true,ip:ip,server:ddev.name};
}

function simHTTP(srcId,rawURL){
  var url=rawURL.trim().replace(/^https?:\/\//i,'');
  var he=url.search(/[/?#]/);var host=he>0?url.substring(0,he):url;
  var destIP,domain=null;
  if(/^\d+\.\d+\.\d+\.\d+$/.test(host)){destIP=host;}
  else{
    domain=host;var dr=simDNS(srcId,domain);
    if(!dr.ok)return{ok:false,reason:'DNS : '+dr.reason};
    destIP=dr.ip;addLog('DNS '+domain+' → '+destIP,'info');
  }
  var srv=devByIP(destIP);
  if(!srv)return{ok:false,reason:'Serveur '+destIP+' introuvable'};
  if(!srv.http||!srv.http.on)return{ok:false,reason:srv.name+' n\'a pas de service HTTP activé'};
  var pr=simPing(srcId,destIP);if(!pr.ok)return{ok:false,reason:'Serveur inaccessible : '+pr.reason};
  return{ok:true,title:srv.http.title||'Sans titre',content:srv.http.content||'',
    htmlMode:!!(srv.http.htmlMode),serverFiles:srv.serverFiles||{},
    ip:destIP,domain:domain,server:srv.name,path:pr.path};
}

/* ─────────────────────────────────────────────────────
   SVG RENDERING
───────────────────────────────────────────────────── */
function render(){renderFrames();renderLinks();renderDevs();renderTexts();renderHint();updSelects();}

function renderLinks(){
  var h='';
  Object.values(S.links).forEach(function(l){
    var a=S.devs[l.from],b=S.devs[l.to];if(!a||!b)return;
    var x1=a.x+DW/2,y1=a.y+DH/2,x2=b.x+DW/2,y2=b.y+DH/2;
    var isSel=(S.sel===l.id);
    var isAnim=S.activeLinks.has(l.id);
    var cls='';
    if(isSel)cls='cable-sel';
    else if(isAnim&&S.animPhase==='fwd')cls='cable-fwd';
    else if(isAnim&&S.animPhase==='ret')cls='cable-ret';
    // base color by connectivity
    var ai=mainIface(a),bi=mainIface(b);
    var isWifiLink=(l.type==='wifi');
    var baseColor=isWifiLink?'#a78bfa':((ai&&bi&&ai.ip&&bi.ip)?'#7abfff':'#b0bec5');
    var midFill=isAnim?(S.animPhase==='fwd'?'#48bb78':'#63b3ed'):(isWifiLink?'#7c3aed':(ai&&bi&&ai.ip&&bi.ip?'#4299e1':'#a0aec0'));
    h+='<line id="'+l.id+'" class="'+cls+'"'+
      ' x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"'+
      (isAnim?'':' stroke="'+baseColor+'"')+
      (isAnim?'':' stroke-width="2.5"')+
      (isWifiLink?' stroke-dasharray="8,5"':'')+
      ' stroke-linecap="round"'+
      ' onclick="selLink(\''+l.id+'\')" oncontextmenu="linkRC(event,\''+l.id+'\')" style="cursor:pointer"/>'+
      // Indicateur milieu
      '<circle cx="'+((x1+x2)/2)+'" cy="'+((y1+y2)/2)+'" r="'+(isAnim?6:4)+'"'+
      ' fill="'+midFill+'"'+
      ' stroke="#fff" stroke-width="1.5" pointer-events="none"'+
      (isAnim?' filter="url(#glow-'+(S.animPhase==='fwd'?'green':'blue')+')"':'')+
      '/>';
  });
  document.getElementById('layer-links').innerHTML=h;
}

function renderInternetSVG(d,isSel,isCF){
  var cx=d.x+DW/2, cy=d.y+30;
  var bd=isCF?'#fbd38d':(isSel?'#2b6cb0':'#0369a1');
  var sw=isSel||isCF?3.5:2;
  var h='<g id="gd'+d.id+'" onmousedown="devMD(event,\''+d.id+'\')" oncontextmenu="devRC(event,\''+d.id+'\')" style="cursor:pointer">';
  h+='<rect x="'+d.x+'" y="'+d.y+'" width="'+DW+'" height="'+DH+'" fill="transparent" stroke="none"/>';
  // Halo
  h+='<circle cx="'+cx+'" cy="'+cy+'" r="31" fill="#e0f2fe" opacity="0.55"/>';
  // Corps planète
  h+='<circle cx="'+cx+'" cy="'+cy+'" r="22" fill="#38bdf8" stroke="'+bd+'" stroke-width="'+sw+'" filter="url(#sh)"/>';
  // Continents (blobs)
  h+='<circle cx="'+(cx-6)+'" cy="'+(cy-5)+'" r="7" fill="#0ea5e9" opacity="0.45"/>';
  h+='<circle cx="'+(cx+9)+'" cy="'+(cy+7)+'" r="5" fill="#0ea5e9" opacity="0.35"/>';
  h+='<circle cx="'+(cx-11)+'" cy="'+(cy+9)+'" r="4" fill="#0ea5e9" opacity="0.3"/>';
  // Lignes latitude
  h+='<ellipse cx="'+cx+'" cy="'+cy+'" rx="22" ry="7" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>';
  h+='<ellipse cx="'+cx+'" cy="'+(cy-9)+'" rx="17" ry="4.5" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>';
  // Méridien
  h+='<ellipse cx="'+cx+'" cy="'+cy+'" rx="7.5" ry="22" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>';
  // Anneau orbital
  h+='<ellipse cx="'+cx+'" cy="'+cy+'" rx="32" ry="9" fill="none" stroke="'+bd+'" stroke-width="'+sw+'" transform="rotate(-22 '+cx+' '+cy+')" opacity="0.88"/>';
  // Étoiles décoratives
  h+='<circle cx="'+(d.x+7)+'"  cy="'+(d.y+9)+'"  r="2"   fill="#7dd3fc" opacity="0.7"/>';
  h+='<circle cx="'+(d.x+17)+'" cy="'+(d.y+4)+'"  r="1.5" fill="#bae6fd" opacity="0.55"/>';
  h+='<circle cx="'+(d.x+DW-9)+'" cy="'+(d.y+7)+'"  r="2"   fill="#7dd3fc" opacity="0.65"/>';
  h+='<circle cx="'+(d.x+DW-19)+'" cy="'+(d.y+13)+'" r="1.2" fill="#bae6fd" opacity="0.5"/>';
  // Nom
  h+='<text x="'+cx+'" y="'+(d.y+64)+'" text-anchor="middle" font-size="12" font-weight="700" fill="'+bd+'" font-family="Segoe UI,Arial">'+esc(d.name)+'</text>';
  // IPs des interfaces
  var _ips=(d.ifaces||[]).filter(function(fi){return fi.ip;}).map(function(fi){return fi.ip;});
  if(_ips.length)h+='<text x="'+cx+'" y="'+(d.y+75)+'" text-anchor="middle" font-size="7.5" fill="#0369a1" font-family="Courier New,monospace">'+esc(_ips.join(' / '))+'</text>';
  // Ring câble mode
  if(isCF)h+='<circle cx="'+cx+'" cy="'+cy+'" r="29" fill="none" stroke="#fbd38d" stroke-width="2.5" stroke-dasharray="5,3" opacity=".7"/>';
  h+='</g>';
  return h;
}

function truncSVG(s,n){return s&&s.length>n?s.slice(0,n-1)+'…':(s||'');}
function renderDevs(){
  var h='';
  Object.values(S.devs).forEach(function(d){
    var isSel=(S.sel===d.id),isCF=(S.cableFrom===d.id);
    if(d.type==='internet'){h+=renderInternetSVG(d,isSel,isCF);return;}
    var dt=DT[d.type];
    var bd=isCF?'#fbd38d':(isSel?'#2b6cb0':dt.bd);
    var sw=isSel||isCF?3.5:2;
    var dot='#a0aec0';
    if(d.type==='switch')dot='#ed8936';
    else{var fi=mainIface(d);if(fi&&fi.dhcpMode&&!fi.ip)dot='#ed8936';else if(fi&&fi.ip&&vIP(fi.ip))dot='#48bb78';}
    var subLines=[],subFull='';
    if(d.type==='router'||d.type==='wifi_router'){
      var ifs=d.ifaces.filter(function(f){return f.ip;});
      subFull=ifs.map(function(f){return f.name+':'+f.ip;}).join(' | ')||'non configuré';
      subLines=ifs.length?ifs.slice(0,2).map(function(f){return truncSVG(f.name+': '+f.ip,20);}):['non configuré'];
    } else if(d.type!=='switch'){
      var fi=mainIface(d);
      if(fi&&fi.dhcpMode&&!fi.ip){subFull='DHCP…';subLines=['DHCP…'];}
      else{subFull=fi&&fi.ip?fi.ip:'non configuré';subLines=[truncSVG(subFull,22)];}
    } else {
      subFull='commutateur L2 ('+nbrs(d.id).length+' ports)';
      subLines=[truncSVG(subFull,22)];
    }
    var svc='';if(d.type==='server'){if(d.http&&d.http.on)svc+='HTTP ';if(d.dns&&d.dns.on)svc+='DNS ';}
    if(d.type==='wifi_router'&&d.ssid)svc='📶 '+d.ssid;
    var subH='';
    subLines.forEach(function(sl,si){
      var yy=d.y+(subLines.length>1?37+si*13:41);
      subH+='<text x="'+(d.x+DW/2)+'" y="'+yy+'" text-anchor="middle" font-size="9"'+
        ' fill="'+dt.tc+'" font-family="Courier New,monospace">'+esc(sl)+'</text>';
    });
    h+=
      '<g id="gd'+d.id+'" onmousedown="devMD(event,\''+d.id+'\')" oncontextmenu="devRC(event,\''+d.id+'\')" style="cursor:pointer">'+
      '<title>'+esc(d.name)+'&#10;'+esc(subFull)+'</title>'+
      '<rect x="'+(d.x+2)+'" y="'+(d.y+3)+'" width="'+DW+'" height="'+DH+'" rx="10" fill="rgba(0,0,0,.07)"/>'+
      '<rect x="'+d.x+'" y="'+d.y+'" width="'+DW+'" height="'+DH+'" rx="10"'+
        ' fill="'+dt.bg+'" stroke="'+bd+'" stroke-width="'+sw+'" filter="url(#sh)"/>'+
      '<text x="'+(d.x+14)+'" y="'+(d.y+30)+'" font-size="19" font-family="Segoe UI">'+dt.icon+'</text>'+
      '<text x="'+(d.x+DW/2+5)+'" y="'+(d.y+23)+'" text-anchor="middle" font-size="12" font-weight="700"'+
        ' fill="'+dt.tc+'" font-family="Segoe UI,Arial">'+esc(truncSVG(d.name,14))+'</text>'+
      subH+
      (svc?'<text x="'+(d.x+DW/2)+'" y="'+(d.y+(subLines.length>1?65:57))+'" text-anchor="middle" font-size="9"'+
        ' fill="#48bb78" font-family="Segoe UI,Arial">'+svc.trim()+'</text>':'')+
      '<circle cx="'+(d.x+DW-10)+'" cy="'+(d.y+13)+'" r="7" fill="'+dot+'" stroke="#fff" stroke-width="1.5"/>'+
      (isCF?'<circle cx="'+(d.x+DW/2)+'" cy="'+(d.y+DH/2)+'" r="28" fill="none" stroke="#fbd38d" stroke-width="2.5" stroke-dasharray="5,3" opacity=".6"/>':'')+
      '</g>';
  });
  document.getElementById('layer-devs').innerHTML=h;
}

function renderHint(){document.getElementById('cv-hint').style.display=Object.keys(S.devs).length?'none':'block';}

/* ─────────────────────────────────────────────────────
   PALETTE DRAG & DROP
───────────────────────────────────────────────────── */
function palDS(e,type){if(S.mode==='simulation'){e.preventDefault();return;}e.dataTransfer.setData('dvtype',type);}
function cwDrop(e){
  e.preventDefault();if(S.mode==='simulation')return;
  var type=e.dataTransfer.getData('dvtype');if(!type)return;
  var r=document.getElementById('canvas').getBoundingClientRect();
  var x=e.clientX-r.left,y=e.clientY-r.top;
  if(type==='frame'){
    var id=mkFrame(Math.max(4,x-150),Math.max(4,y-80));
    S.sel=id;render();showProps(id);return;
  }
  if(type==='anntext'){
    var id=mkAnnotText(Math.max(4,x-40),Math.max(4,y+6));
    S.sel=id;render();showProps(id);return;
  }
  var id=mkDev(type,Math.max(4,x-DW/2),Math.max(4,y-DH/2));
  S.sel=id;render();showProps(id);
  setTimeout(function(){checkAllObjectives();},50);
}

/* ─────────────────────────────────────────────────────
   CANVAS MOUSE EVENTS
───────────────────────────────────────────────────── */
function svgPt(e){var r=document.getElementById('canvas').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}

function devMD(e,id){
  e.stopPropagation();
  if(S.mode==='simulation'){
    var _d=S.devs[id];
    if(_d.type!=='switch'){S.termDev=id;setTermDev(id);showTab('term');}
    S.sel=id;render();showPropsSimu(id);
    if(!_propsVisible)toggleProps();
    return;
  }
  if(S.tool==='delete'){delDev(id);render();noSel();return;}
  if(S.tool==='link'){
    if(!S.cableFrom){S.cableFrom=id;render();}
    else{if(S.cableFrom!==id){addLink(S.cableFrom,id);}S.cableFrom=null;hidePrev();render();}
    return;
  }
  var pt=svgPt(e);
  S.sel=id;S.drag={id:id,ox:pt.x-S.devs[id].x,oy:pt.y-S.devs[id].y};render();showProps(id);
  if(!_propsVisible)toggleProps();
}

function devRC(e,id){
  e.preventDefault();e.stopPropagation();
  // Clic droit : sélectionner sans supprimer
  if(S.mode==='config'){S.sel=id;render();showProps(id);}
}
function linkRC(e,id){
  e.preventDefault();e.stopPropagation();
  // Clic droit : sélectionner le câble sans le supprimer
  if(S.mode==='config'){S.sel=id;render();}
}

function cvMD(e){
  if(S.tool==='link'&&S.cableFrom){S.cableFrom=null;hidePrev();render();}
  var t=e.target;var inG=t.closest&&t.closest('g[id^="gd"]');
  if(S.tool==='select'&&!inG){S.sel=null;render();noSel();}
}

function cvMM(e){
  var pt=svgPt(e);
  if(S.drag&&S.tool==='select'){
    if(S.drag.type==='frame'){
      var f=S.frames[S.drag.id];if(f){f.x=Math.max(0,pt.x-S.drag.ox);f.y=Math.max(0,pt.y-S.drag.oy);renderFrames();}
    } else if(S.drag.type==='frame-resize'){
      var f=S.frames[S.drag.id];if(f){f.w=Math.max(80,S.drag.sw+(pt.x-S.drag.sx));f.h=Math.max(50,S.drag.sh+(pt.y-S.drag.sy));renderFrames();}
    } else if(S.drag.type==='anntext'){
      var t=S.texts[S.drag.id];if(t){t.x=Math.max(4,pt.x-S.drag.ox);t.y=Math.max(10,pt.y-S.drag.oy);renderTexts();}
    } else if(S.drag.id&&S.devs[S.drag.id]){
      S.devs[S.drag.id].x=Math.max(4,pt.x-S.drag.ox);S.devs[S.drag.id].y=Math.max(4,pt.y-S.drag.oy);renderLinks();renderDevs();
    }
  }
  if(S.tool==='link'&&S.cableFrom){
    var f=S.devs[S.cableFrom];if(!f)return;
    var pl=document.getElementById('prev-line');
    pl.setAttribute('x1',f.x+DW/2);pl.setAttribute('y1',f.y+DH/2);
    pl.setAttribute('x2',pt.x);pl.setAttribute('y2',pt.y);pl.setAttribute('display','block');
  }
}
function cvMU(){S.drag=null;}
function hidePrev(){var pl=document.getElementById('prev-line');pl.setAttribute('display','none');}

function selLink(id){
  if(S.tool==='delete'){delete S.links[id];render();noSel();return;}
  S.sel=id;render();
  var l=S.links[id];if(!l){noSel();return;}
  var a=S.devs[l.from],b=S.devs[l.to];
  document.getElementById('props-body').innerHTML=
    '<div class="psection">Câble réseau</div>'+
    '<div class="pr"><label>De</label><div class="mono">'+esc(a?a.name:'?')+'</div></div>'+
    '<div class="pr"><label>Vers</label><div class="mono">'+esc(b?b.name:'?')+'</div></div>'+
    '<button class="pb pb-red" onclick="delete S.links[\''+id+'\'];S.sel=null;render();noSel()">🗑️ Supprimer ce câble</button>';
}

/* ─────────────────────────────────────────────────────
   TOOLS & MODE
───────────────────────────────────────────────────── */
function setTool(t){
  S.tool=t;S.cableFrom=null;hidePrev();
  ['select','link','delete','clear'].forEach(function(x){var b=document.getElementById('t-'+x);if(b)b.classList.toggle('active',x===t);});
  ['sel','link','del'].forEach(function(x){var b=document.getElementById('pi-'+x);if(b)b.classList.toggle('active',x==='sel'?t==='select':x==='link'?t==='link':t==='delete');});
  document.getElementById('cw').style.cursor=(t==='link'?'crosshair':'default');
  render();
}

document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&S.mode==='config'){setTool('select');}
});

function setMode(m){
  S.mode=m;
  document.getElementById('btn-cfg').classList.toggle('active',m==='config');
  document.getElementById('btn-sim').classList.toggle('active',m==='simulation');
  var simMode=(m==='simulation');
  ['pc','server','switch','router','wifi_router','internet','frame','anntext'].forEach(function(t){
    var el=document.getElementById('pi-'+t);
    if(el){el.classList.toggle('disabled',simMode);el.draggable=!simMode;}
  });
  ['t-link','t-delete','t-clear'].forEach(function(id){
    var b=document.getElementById(id);if(b)b.classList.toggle('disabled',simMode);
  });
  // Afficher le panneau bas en simulation — ou toujours si une activité est configurée
  var _keepBot=typeof ACTIVITY_CONFIG!=='undefined'&&ACTIVITY_CONFIG&&ACTIVITY_CONFIG.objectives&&ACTIVITY_CONFIG.objectives.length;
  document.querySelector('.bot').style.display=(simMode||_keepBot)?'flex':'none';
  if(simMode){
    setTool('select');
    saveToSession(); // auto-save à chaque passage en simulation
    tpr('Mode Simulation activé — cliquez sur un appareil ou sélectionnez-le ci-dessus.','info');
  }
}

var _propsSavedW=275,_propsVisible=true;




/* ─────────────────────────────────────────────────────
   PROPERTIES PANEL
───────────────────────────────────────────────────── */
function noSel(){
  var msg=S.mode==='simulation'
    ?'<div class="nosel"><div class="ico">🖱️</div>Cliquez sur un appareil<br>pour voir ses propriétés</div>'
    :'<div class="nosel"><div class="ico">🖱️</div>Cliquez sur un appareil<br>pour configurer</div>';
  document.getElementById('props-body').innerHTML=msg;
}

/* ── Vue lecture seule (mode simulation) ─────────────────── */




function prow(devId,idx,label,field,val,ph){
  var oi='';
  if(field==='ip'||field==='gateway'||field==='dns')oi=' oninput="chkIP(this)"';
  else if(field==='mask')oi=' oninput="chkMask(this)"';
  return '<div class="pr"><label>'+label+'</label><input value="'+esc(val||'')+'" placeholder="'+ph+'"'+
    oi+' onchange="setIface(\''+devId+'\','+idx+',\''+field+'\',this.value)"/></div>';
}


function toggleDHCPMode(devId, enabled){
  var d=S.devs[devId];if(!d||!d.ifaces[0])return;
  d.ifaces[0].dhcpMode=enabled;
  if(enabled){d.ifaces[0].ip='';d.ifaces[0].mask='';d.ifaces[0].gateway='';d.ifaces[0].dns='';}
  render();showProps(devId);
  setTimeout(function(){checkAllObjectives();},50);
}
function setIface(devId,idx,field,val){
  if(!S.devs[devId]||!S.devs[devId].ifaces[idx])return;
  var v=val.trim();
  if((field==='ip'||field==='gateway'||field==='dns')&&!isValidUserIP(v)){
    notif('⚠️ Adresse IP invalide : "'+v+'"','err');showProps(devId);return;
  }
  if(field==='mask'&&!isValidUserMask(v)){
    notif('⚠️ Masque invalide : "'+v+'"','err');showProps(devId);return;
  }
  S.devs[devId].ifaces[idx][field]=v;
  // Recalcul automatique si c'est un routeur avec la case cochée
  if(isRouter(S.devs[devId])&&S.devs[devId].autoRouteEnabled!==false){
    autoRoute();
    if(S.sel===devId)showProps(devId);
  }
  render();checkAllObjectives();
}

function setDHCP(devId,field,val){
  if(!S.devs[devId])return;
  var v=val.trim();
  if((field==='start'||field==='end'||field==='gateway'||field==='dns')&&!isValidUserIP(v)){
    notif('⚠️ Adresse IP invalide : "'+v+'"','err');showProps(devId);return;
  }
  if(field==='mask'&&!isValidUserMask(v)){
    notif('⚠️ Masque invalide : "'+v+'"','err');showProps(devId);return;
  }
  S.devs[devId].dhcp[field]=v;
}

function addIface(devId){
  var d=S.devs[devId];if(!d||d.type!=='router')return;
  var n=d.ifaces.length;
  d.ifaces.push({name:'eth'+n,ip:'',mask:'255.255.255.0'});
  showProps(devId);render();
}

function removeIface(devId,idx){
  var d=S.devs[devId];if(!d||d.ifaces.length<=2)return;
  d.ifaces.splice(idx,1);
  // Renommer eth0, eth1, ...
  d.ifaces.forEach(function(f,i){f.name='eth'+i;});
  showProps(devId);render();
}

/* ─────────────────────────────────────────────────────
   SYSTÈME DE FICHIERS SERVEUR
───────────────────────────────────────────────────── */
function uploadServerFiles(devId,input){
  var files=Array.from(input.files);if(!files.length)return;
  var d=S.devs[devId];if(!d.serverFiles)d.serverFiles={};
  var done=0;
  files.forEach(function(file){
    if(file.size>900*1024){notif('⚠️ '+file.name+' : trop volumineux (max 900Ko)','err');done++;if(done===files.length)showProps(devId);return;}
    var reader=new FileReader();
    reader.onload=function(e){
      d.serverFiles[file.name]={name:file.name,type:file.type,data:e.target.result,size:file.size};
      done++;
      if(done===files.length){notif('✅ '+done+' fichier(s) uploadé(s)','ok');showProps(devId);}
    };
    reader.readAsDataURL(file);
  });
  input.value='';
}
function deleteServerFile(devId,filename){
  var d=S.devs[devId];if(d.serverFiles)delete d.serverFiles[filename];
  showProps(devId);
}
function insertFileRef(devId,filename){
  var ta=document.getElementById('hcontent-'+devId);if(!ta)return;
  var ext=(filename.split('.').pop()||'').toLowerCase();
  var tag=['png','jpg','jpeg','gif','svg','webp','bmp'].indexOf(ext)>=0
    ?'<img src="files/'+filename+'" alt="'+filename+'" style="max-width:100%">'
    :'<a href="files/'+filename+'">'+filename+'</a>';
  var p=ta.selectionStart||ta.value.length;
  ta.value=ta.value.slice(0,p)+tag+ta.value.slice(ta.selectionEnd||p);
  S.devs[devId].http.content=ta.value;
  ta.selectionStart=ta.selectionEnd=p+tag.length;ta.focus();
}
function resolveFileRefs(content,serverFiles){
  if(!serverFiles)return content;
  return content.replace(/(src|href)="files\/([^"]+)"/g,function(m,attr,fn){
    var f=serverFiles[fn];return f?attr+'="'+f.data+'"':m;
  });
}

function parseDNS(devId,text){
  var r={};text.split('\n').forEach(function(line){
    var m=line.match(/^\s*([^\s=]+)\s*=\s*(\S+)\s*$/);if(m)r[m[1].toLowerCase()]=m[2];
  });
  S.devs[devId].dns.records=r;
}

/* ─────────────────────────────────────────────────────
   TERMINAL
───────────────────────────────────────────────────── */
function updSelects(){
  var all=Object.values(S.devs).filter(function(d){return d.type!=='switch';});
  var pcs=all.filter(function(d){return d.type==='pc'||d.type==='server';});
  var ts=document.getElementById('td-sel'),cur=S.termDev;
  ts.innerHTML='<option value="">— Choisir —</option>';
  all.forEach(function(d){ts.innerHTML+='<option value="'+d.id+'"'+(d.id===cur?' selected':'')+'>'+esc(d.name)+'</option>';});
  var bs=document.getElementById('bd-sel'),bc=bs.value;
  bs.innerHTML='<option value="">— Choisir —</option>';
  pcs.forEach(function(d){bs.innerHTML+='<option value="'+d.id+'"'+(d.id===bc?' selected':'')+'>'+esc(d.name)+'</option>';});
  updPrompt();
}

function setTermDev(id){
  S.termDev=id;document.getElementById('td-sel').value=id||'';updPrompt();
  var fi=id&&S.devs[id]?mainIface(S.devs[id]):null;
  document.getElementById('td-ip').textContent=fi&&fi.ip?'['+fi.ip+']':'';
}

function updPrompt(){
  var d=S.termDev?S.devs[S.termDev]:null;
  document.getElementById('tprompt').textContent=(d?d.name.toLowerCase().replace(/\s+/g,'-'):'guest')+'@réseau > ';
}

function tpr(txt,cls){
  var o=document.getElementById('tout');
  var div=document.createElement('div');div.className='tl '+(cls||'');div.textContent=txt;
  o.appendChild(div);o.scrollTop=o.scrollHeight;
}
function termClr(){document.getElementById('tout').innerHTML='';}

function termExec(){
  var inp=document.getElementById('tinput');var raw=inp.value.trim();inp.value='';
  _termHistIdx=-1;_termDraft='';
  if(!raw)return;
  if(!_termHistory.length||_termHistory[_termHistory.length-1]!==raw){
    _termHistory.push(raw);if(_termHistory.length>50)_termHistory.shift();
  }
  tpr('> '+raw,'cmd');
  if(!S.termDev){tpr('⚠️  Aucun appareil sélectionné — choisissez-en un ci-dessus.','err');return;}
  var d=S.devs[S.termDev];if(!d){tpr('⚠️  Appareil introuvable','err');return;}
  var parts=raw.split(/\s+/),cmd=parts[0].toLowerCase();
  switch(cmd){
    case 'ping':
      if(!parts[1]){tpr('Usage : ping <IP ou domaine>','err');break;}
      doPing(S.termDev,parts[1]);break;
    case 'ipconfig':case 'ifconfig':doIPCfg(S.termDev);break;
    case 'nslookup':
      if(!parts[1]){tpr('Usage : nslookup <domaine>','err');break;}
      doNSL(S.termDev,parts[1]);break;
    case 'traceroute':case 'tracert':
      if(!parts[1]){tpr('Usage : traceroute <IP ou domaine>','err');break;}
      doTrace(S.termDev,parts[1]);break;
    case 'arp':doARP(S.termDev);break;
    case 'netstat':doNetstat(S.termDev);break;
    case 'dhcp':doDHCP(S.termDev);break;
    case 'route':doRoute(S.termDev);break;
    case 'clear':case 'cls':termClr();break;
    case 'help':doHelp();break;
    default:tpr('Commande inconnue : "'+parts[0]+'". Tapez help.','err');
  }
}

function doPing(devId,target){
  var hostname=null;
  // Résolution DNS si la cible n'est pas une adresse IP
  if(!vIP(target)){
    hostname=target;
    tpr('');
    tpr('Résolution DNS de '+hostname+' …','info');
    var dr=simDNS(devId,hostname);
    if(!dr.ok){
      tpr('Échec de la résolution : '+dr.reason,'err');
      addLog('PING '+hostname+' — DNS ÉCHEC : '+dr.reason,'err');
      return;
    }
    tpr(hostname+' a une adresse IP : '+dr.ip+' (via '+dr.server+')','ok');
    addLog('DNS '+hostname+' → '+dr.ip,'info');
    
    var srcDNS=(mainIface(S.devs[devId])||{}).dns||'?';
    addPacket('DNS Query',srcDNS,(mainIface(S.devs[devId])||{}).ip||'?',hostname+' → '+dr.ip,true);
    var dpath=simPing(devId,srcDNS);if(dpath.ok)animPath(dpath.path);
    checkDynamicObjective('dns_success',{from:S.devs[devId].name,domain:hostname});
    target=dr.ip;
  }
  var res=simPing(devId,target);tpr('');
  var srcIP=(mainIface(S.devs[devId])||{}).ip||S.devs[devId].name;
  var disp=hostname?hostname+'['+target+']':target;
  if(res.ok){
    tpr('Ping de '+disp+' avec 32 octets de données :','info');
    for(var i=0;i<4;i++)tpr('Réponse de '+disp+' : octets=32 durée='+(res.lat+i%2)+'ms TTL='+(64-res.path.length+1),'ok');
    tpr('');tpr('Statistiques : Envoyés=4, Reçus=4, Perdus=0 (0%)','ok');
    var pathNames=res.path.map(function(id){return S.devs[id]?S.devs[id].name:id;});
    if(res.path.length>1)tpr('Chemin : '+pathNames.join(' → '),'info');
    addLog('PING '+(hostname||target)+' depuis '+S.devs[devId].name+' — OK ('+pathNames.join('→')+')','ok');
    addPacket('ICMP Echo',srcIP,target,'4 réponses — '+pathNames.join('→'),true);
    animPath(res.path);
    checkDynamicObjective('ping_success',{from:S.devs[devId].name,to:target});
  } else {
    tpr('Ping de '+disp+' :','info');
    for(var i=0;i<4;i++)tpr('Délai d\'attente de la demande dépassé.','err');
    tpr('');tpr('Statistiques : Envoyés=4, Reçus=0, Perdus=4 (100%)','err');
    tpr('Cause : '+res.reason,'warn');
    addLog('PING '+(hostname||target)+' depuis '+S.devs[devId].name+' — ÉCHEC : '+res.reason,'err');
    addPacket('ICMP Echo',srcIP,target,'Timeout — '+res.reason,false);
    animPath([]);
  }
}
function doIPCfg(devId){
  var d=S.devs[devId];tpr('');tpr('Configuration IP de '+d.name+' :','info');
  if(isRouter(d)){
    if(d.type==='wifi_router'&&d.ssid)tpr('Réseau WiFi : '+d.ssid+(d.wifiPass?' (protégé)':' (ouvert)'),'info');
    d.ifaces.forEach(function(fi){
      tpr('Interface '+fi.name+' :','info');
      tpr('   Adresse IP : '+(fi.ip||'non configurée'),fi.ip?'ok':'warn');
      tpr('   Masque     : '+(fi.mask||'—'),'');
    });
    if(d.type==='wifi_router'&&d.dhcp&&d.dhcp.on)
      tpr('Service DHCP : actif ('+d.dhcp.start+' — '+d.dhcp.end+')','ok');
  } else {
    var fi=mainIface(d)||{};
    if(fi.dhcpMode)tpr('Mode        : DHCP automatique','info');
    tpr('Adresse IP  : '+(fi.ip||'non configurée'),fi.ip?'ok':'warn');
    tpr('Masque      : '+(fi.mask||'—'),'');
    tpr('Passerelle  : '+(fi.gateway||'—'),'');
    tpr('Serveur DNS : '+(fi.dns||'—'),'');
    tpr('Adresse MAC : '+(d.mac||'—'),'');
    if(d.type==='server'){
      var svcs=[d.http&&d.http.on?'HTTP':null,d.dns&&d.dns.on?'DNS':null,d.dhcp&&d.dhcp.on?'DHCP':null].filter(Boolean);
      tpr('Services    : '+(svcs.length?svcs.join(', '):'(aucun)'),'info');
    }
  }
}

function doNSL(devId,domain){
  var res=simDNS(devId,domain);tpr('');
  var srcDNS=(mainIface(S.devs[devId])||{}).dns||'?';
  if(res.ok){
    tpr('Serveur DNS : '+res.server,'info');
    tpr('Nom     : '+domain,'');tpr('Adresse : '+res.ip,'ok');
    addLog('DNS '+domain+' → '+res.ip,'ok');
    addPacket('DNS Query',srcDNS,(mainIface(S.devs[devId])||{}).ip||'?',domain+' → '+res.ip,true);
    checkDynamicObjective('dns_success',{from:S.devs[devId].name,domain:domain});
    // animer le chemin vers le DNS
    var src=S.devs[devId];var si=mainIface(src);
    if(si&&si.dns){var r=simPing(devId,si.dns);if(r.ok)animPath(r.path);}
  } else {
    tpr('*** '+domain+' : '+res.reason,'err');addLog('DNS '+domain+' ÉCHEC : '+res.reason,'err');
    addPacket('DNS Query',(mainIface(S.devs[devId])||{}).ip||'?',srcDNS,res.reason,false);
  }
}

function doTrace(devId,target){
  var res=simPing(devId,target);tpr('');tpr('Traceroute vers '+target+' :','info');
  if(res.ok){
    res.path.forEach(function(id,i){
      var dv=S.devs[id];
      var label=dv?dv.name:id;
      var ip=dv?(mainIface(dv)?mainIface(dv).ip:target):target;
      tpr((i+1)+'  '+(res.lat*(i+1))+' ms  '+label+' ('+ip+')','ok');
    });
    tpr('Traceroute terminé.','info');animPath(res.path);
  } else {tpr('1  *  *  *','warn');tpr('Destination inaccessible : '+res.reason,'err');}
}

function doARP(devId){
  var d=S.devs[devId];var fi=mainIface(d);
  tpr('');tpr('Table ARP de '+d.name+' :','info');
  if(!fi||!fi.ip){tpr('(pas d\'IP configurée)','warn');return;}
  var seg=lanSeg(devId);var found=false;
  seg.forEach(function(nid){
    if(nid===devId)return;var nd=S.devs[nid];if(!nd)return;
    var ni=mainIface(nd);
    if(ni&&ni.ip&&sameNet(fi.ip,fi.mask,ni.ip)){tpr('  '+ni.ip.padEnd(18)+nd.mac+'  dynamique','ok');found=true;}
  });
  if(!found)tpr('  (table ARP vide)','warn');
}

function doNetstat(devId){
  var d=S.devs[devId];tpr('');tpr('Services réseau actifs de '+d.name+' :','info');
  var hasSvc=false;
  if(d.http&&d.http.on){tpr('  TCP  0.0.0.0:80    LISTENING   HTTP','ok');hasSvc=true;}
  if(d.dns&&d.dns.on) {tpr('  UDP  0.0.0.0:53    LISTENING   DNS','ok');hasSvc=true;}
  if(d.dhcp&&d.dhcp.on){tpr('  UDP  0.0.0.0:67    LISTENING   DHCP','ok');hasSvc=true;}
  if(!hasSvc)tpr('  (aucun service actif)','warn');
}

function doHelp(){
  tpr('');tpr('Commandes disponibles :','info');
  [['ping <IP ou domaine>',   'Tester la connectivité (+ résolution DNS)'],
   ['ipconfig',               'Afficher la configuration réseau'],
   ['nslookup <domaine>',     'Résoudre un nom de domaine (DNS)'],
   ['traceroute <IP ou domaine>','Tracer le chemin vers une destination'],
   ['arp',                    'Afficher la table ARP (adresses MAC)'],
   ['netstat',                'Afficher les services réseau actifs'],
   ['dhcp',                   'Demander une adresse IP au serveur DHCP'],
   ['route',                  'Afficher la table de routage'],
   ['clear',                  'Effacer le terminal'],
   ['help',                   'Afficher cette aide']].forEach(function(c){
    tpr('  '+c[0].padEnd(28)+c[1],'');
  });
}

/* ─────────────────────────────────────────────────────
   NAVIGATEUR WEB
───────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────
   JOURNAL
───────────────────────────────────────────────────── */
function addLog(msg,cls){
  var o=document.getElementById('lout');
  var t=new Date();var ts='['+('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2)+':'+('0'+t.getSeconds()).slice(-2)+'] ';
  var d=document.createElement('div');d.className='ll '+(cls||'');d.textContent=ts+msg;
  o.appendChild(d);o.scrollTop=o.scrollHeight;
}

/* ─────────────────────────────────────────────────────
   SCORE
───────────────────────────────────────────────────── */




/* ─────────────────────────────────────────────────────
   SNIFFER DE PAQUETS
───────────────────────────────────────────────────── */
function addPacket(type,srcIP,dstIP,info,ok){
  var t=new Date();
  var ts=('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2)+':'+('0'+t.getSeconds()).slice(-2);
  S.packets.push({n:S.packets.length+1,ts:ts,type:type,src:srcIP||'?',dst:dstIP||'?',info:info,ok:ok});
  if(S.packets.length>300)S.packets.shift();
  renderPackets();
}

function renderPackets(){
  var tbody=document.getElementById('pkt-body');if(!tbody)return;
  tbody.innerHTML=S.packets.map(function(p){
    var cls=p.ok===true?'pok':(p.ok===false?'perr':'pinfo');
    return '<tr class="'+cls+'">'+
      '<td>'+p.n+'</td>'+
      '<td>'+esc(p.ts)+'</td>'+
      '<td>'+esc(p.type)+'</td>'+
      '<td>'+esc(p.src)+'</td>'+
      '<td>'+esc(p.dst)+'</td>'+
      '<td>'+esc(p.info)+'</td>'+
      '<td>'+(p.ok===true?'✅ OK':(p.ok===false?'❌ ÉCHEC':'ℹ️'))+'</td>'+
      '</tr>';
  }).join('');
  var sout=document.getElementById('sout');if(sout)sout.scrollTop=sout.scrollHeight;
}

/* ─────────────────────────────────────────────────────
   DHCP
───────────────────────────────────────────────────── */
function simDHCP(srcId){
  var src=S.devs[srcId];if(!src)return{ok:false,reason:'Appareil introuvable'};
  if(src.type==='switch'||isRouter(src))return{ok:false,reason:'Seuls PC et Serveur peuvent faire une demande DHCP'};
  var seg=lanSeg(srcId);
  var dhcpSrv=null;
  seg.forEach(function(nid){
    if(dhcpSrv)return;
    var d=S.devs[nid];
    if(d&&(d.type==='server'||d.type==='wifi_router')&&d.dhcp&&d.dhcp.on)dhcpSrv=d;
  });
  if(!dhcpSrv)return{ok:false,reason:'Aucun serveur DHCP trouvé sur ce segment LAN'};
  var start=ip2n(dhcpSrv.dhcp.start||'192.168.1.100');
  var end=ip2n(dhcpSrv.dhcp.end||'192.168.1.200');
  if(start<0)return{ok:false,reason:'IP de départ DHCP invalide dans '+dhcpSrv.name};
  if(end<0)return{ok:false,reason:'IP de fin DHCP invalide dans '+dhcpSrv.name};
  if(end<start)return{ok:false,reason:'IP de fin inférieure à l\'IP de départ dans '+dhcpSrv.name};
  var used=new Set(Object.values(S.devs).map(function(d){
    return d.ifaces&&d.ifaces[0]?ip2n(d.ifaces[0].ip||''):-1;
  }));
  var assigned=-1;
  for(var cand=start;cand<=end;cand++){if(!used.has(cand>>>0)){assigned=cand>>>0;break;}}
  if(assigned<0)return{ok:false,reason:'Plage DHCP épuisée ('+dhcpSrv.dhcp.start+' → '+dhcpSrv.dhcp.end+')'};
  var aIP=[(assigned>>>24)&255,(assigned>>>16)&255,(assigned>>>8)&255,assigned&255].join('.');
  src.ifaces[0].ip=aIP;
  src.ifaces[0].mask=dhcpSrv.dhcp.mask||'255.255.255.0';
  src.ifaces[0].gateway=dhcpSrv.dhcp.gateway||'';
  src.ifaces[0].dns=dhcpSrv.dhcp.dns||'';
  return{ok:true,ip:aIP,mask:src.ifaces[0].mask,gw:src.ifaces[0].gateway,dns:src.ifaces[0].dns,server:dhcpSrv.name};
}

function doDHCP(devId){
  var d=S.devs[devId];tpr('');
  tpr('Envoi requête DHCP Discover…','info');
  var res=simDHCP(devId);
  if(res.ok){
    tpr('DHCP Offer reçu de '+res.server+' :','ok');
    tpr('  Adresse IP  : '+res.ip,'ok');
    tpr('  Masque      : '+res.mask,'');
    tpr('  Passerelle  : '+(res.gw||'(non fournie)'),'');
    tpr('  DNS         : '+(res.dns||'(non fourni)'),'');
    tpr('Configuration IP appliquée automatiquement.','ok');
    addLog('DHCP '+d.name+' → '+res.ip+' (via '+res.server+')','ok');
    addPacket('DHCP','0.0.0.0',res.ip,'Adresse attribuée par '+res.server,true);
    render();if(S.termDev)showProps(S.termDev);if(S.sel===devId)showProps(devId);
    checkDynamicObjective('dhcp_success',{from:d.name,ip:res.ip});
  } else {
    tpr('DHCP Request échoué : '+res.reason,'err');
    addLog('DHCP '+d.name+' ÉCHEC : '+res.reason,'err');
    addPacket('DHCP','0.0.0.0','255.255.255.255',res.reason,false);
  }
}

/* ─────────────────────────────────────────────────────
   TABLE DE ROUTAGE
───────────────────────────────────────────────────── */
function netAddr(ip,mask){
  var a=ip2n(ip),m=ip2n(mask);
  if(a<0||m<0)return ip;
  var n=(a&m)>>>0;
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join('.');
}

function getRoutingTable(routerId){
  var d=S.devs[routerId];if(!d||!isRouter(d))return[];
  var routes=[];
  d.ifaces.forEach(function(fi){
    if(!fi.ip||!fi.mask)return;
    routes.push({dest:netAddr(fi.ip,fi.mask),mask:fi.mask,gw:'',iface:fi.name,type:'direct'});
  });
  if(d.staticRoutes){d.staticRoutes.forEach(function(r){routes.push(r);});}
  return routes;
}

function doRoute(devId){
  var d=S.devs[devId];tpr('');tpr('Table de routage de '+d.name+' :','info');
  var hdr='Réseau dest.       Masque              Passerelle          Interface';
  tpr(hdr,'info');tpr('─'.repeat(hdr.length),'');
  if(isRouter(d)){
    var rt=getRoutingTable(devId);
    if(rt.length===0){tpr('  (table vide — configurez les interfaces ou lancez RIP auto)','warn');return;}
    rt.forEach(function(r){
      tpr('  '+r.dest.padEnd(20)+r.mask.padEnd(20)+(r.gw||'direct').padEnd(20)+r.iface+(r.type==='rip'?' [RIP]':''),'ok');
    });
  } else {
    var fi=mainIface(d)||{};
    if(fi.ip&&fi.mask)tpr('  '+netAddr(fi.ip,fi.mask).padEnd(20)+fi.mask.padEnd(20)+'direct              eth0','ok');
    if(fi.gateway)tpr('  0.0.0.0            0.0.0.0             '+fi.gateway.padEnd(20)+'eth0  [défaut]','ok');
    if(!fi.ip&&!fi.gateway)tpr('  (aucune route configurée)','warn');
  }
}

/* ─────────────────────────────────────────────────────
   ROUTAGE AUTOMATIQUE (RIP simplifié)
───────────────────────────────────────────────────── */
function autoRoute(){
  var routers=Object.values(S.devs).filter(function(d){return isRouter(d);});
  routers.forEach(function(r){r.staticRoutes=r.staticRoutes||[];});
  var added=0;
  routers.forEach(function(r1){
    r1.ifaces.forEach(function(fi1){
      if(!fi1.ip||!fi1.mask)return;
      routers.forEach(function(r2){
        if(r1.id===r2.id)return;
        r2.ifaces.forEach(function(fi2){
          if(!fi2.ip||!fi2.mask)return;
          if(!sameNet(fi1.ip,fi1.mask,fi2.ip))return;
          // r1 et r2 sont voisins via fi1/fi2 — partager les réseaux de r2 vers r1
          r2.ifaces.forEach(function(fi2b){
            if(!fi2b.ip||!fi2b.mask)return;
            var net2b=netAddr(fi2b.ip,fi2b.mask);
            var net1=netAddr(fi1.ip,fi1.mask);
            if(net2b===net1)return;
            var existing=r1.staticRoutes.find(function(sr){return sr.dest===net2b&&sr.mask===fi2b.mask;});
            if(!existing){r1.staticRoutes.push({dest:net2b,mask:fi2b.mask,gw:fi2.ip,iface:fi1.name,type:'rip'});added++;}
          });
        });
      });
    });
  });
  notif('⚡ RIP : '+added+' route(s) calculée(s) automatiquement','ok');
  addLog('RIP auto : '+added+' route(s) ajoutée(s)','ok');
  render();
  if(S.sel&&S.devs[S.sel]&&S.devs[S.sel].type==='router')showProps(S.sel);
}

/* ─────────────────────────────────────────────────────
   SAUVEGARDE / CHARGEMENT TOPOLOGIE
───────────────────────────────────────────────────── */
function manualSave(){
  var ok=saveToSession();
  if(ok)notif('💾 Réseau sauvegardé — vous pourrez reprendre où vous en étiez','ok');
  else notif('⚠️ Impossible de sauvegarder (ni SCORM ni localStorage disponible)','err');
}





/* ─────────────────────────────────────────────────────
   INTERNET
───────────────────────────────────────────────────── */
function findInternetDev(){
  return Object.values(S.devs).find(function(d){return d.type==='internet';})||null;
}
function routesToInternet(srcId){
  var inet=findInternetDev();if(!inet)return null;
  var src=S.devs[srcId];if(!src||src.type==='switch')return null;
  var si=mainIface(src);if(!si||!si.ip||!si.gateway)return null;
  var gwDev=devByIP(si.gateway.trim());
  if(!gwDev||!isRouter(gwDev))return null;
  if(lanSeg(srcId).indexOf(gwDev.id)===-1)return null;
  if(nbrs(gwDev.id).indexOf(inet.id)===-1)return null;
  return{router:gwDev,inet:inet};
}
function parseExtSites(devId,text){
  var sites=[];
  text.split('\n').forEach(function(line){
    var m=line.match(/^\s*([^\s=|]+)\s*=\s*([0-9.]+)(?:\s*\|\s*(.*))?$/);
    if(m)sites.push({domain:m[1].toLowerCase().trim(),ip:m[2].trim(),title:m[3]?m[3].trim():'Page '+m[1],content:''});
  });
  S.devs[devId].extSites=sites;
}

/* ─────────────────────────────────────────────────────
   CADRES & TEXTES D'ANNOTATION
───────────────────────────────────────────────────── */
var FRAME_COLORS=[
  {bg:'#fffbeb',bd:'#d97706'},{bg:'#f0fdf4',bd:'#16a34a'},{bg:'#eff6ff',bd:'#2563eb'},
  {bg:'#fdf4ff',bd:'#9333ea'},{bg:'#fff1f2',bd:'#e11d48'},{bg:'#f0fdfa',bd:'#0d9488'}
];
var _frameColorIdx=0;

function mkFrame(x,y){
  var id='f'+(S.nid++);
  var col=FRAME_COLORS[_frameColorIdx%FRAME_COLORS.length];_frameColorIdx++;
  S.frames[id]={id:id,x:x,y:y,w:300,h:200,label:'Zone',bg:col.bg,border:col.bd};
  return id;
}
function mkAnnotText(x,y){
  var id='ta'+(S.nid++); // commence par 't' mais 'ta' pour éviter conflit avec 't' seul
  S.texts[id]={id:id,x:x,y:y,text:'Texte',size:16,color:'#1e293b'};
  return id;
}

function renderFrames(){
  var h='';
  Object.values(S.frames).forEach(function(f){
    var isSel=(S.sel===f.id);
    var bg=f.bg||'#fffbeb',bd=f.border||'#d97706';
    h+='<g id="gf'+f.id+'" onmousedown="frameMD(event,\''+f.id+'\')" style="cursor:move">';
    h+='<rect x="'+f.x+'" y="'+f.y+'" width="'+f.w+'" height="'+f.h+'" rx="8"'+
       ' fill="'+bg+'" fill-opacity="0.55" stroke="'+bd+'" stroke-width="'+(isSel?3:1.5)+'"'+
       ' stroke-dasharray="'+(isSel?'none':'10,5')+'"/>';
    // Barre label
    h+='<rect x="'+f.x+'" y="'+f.y+'" width="'+f.w+'" height="26" rx="8" fill="'+bd+'" opacity="0.22"/>';
    h+='<text x="'+(f.x+10)+'" y="'+(f.y+17)+'" font-size="13" font-weight="700" fill="'+bd+'" font-family="Segoe UI,Arial" pointer-events="none">'+esc(f.label||'Zone')+'</text>';
    // Poignée redimensionnement (coin bas-droite)
    if(isSel||S.mode==='config'){
      h+='<polygon points="'+(f.x+f.w-14)+','+(f.y+f.h)+' '+(f.x+f.w)+','+(f.y+f.h-14)+' '+(f.x+f.w)+','+(f.y+f.h)+'"'+
         ' fill="'+bd+'" opacity="0.6" style="cursor:nwse-resize"'+
         ' onmousedown="frameResizeMD(event,\''+f.id+'\')"/>';
    }
    h+='</g>';
  });
  var el=document.getElementById('layer-frames');if(el)el.innerHTML=h;
}

function renderTexts(){
  var h='';
  Object.values(S.texts).forEach(function(t){
    var isSel=(S.sel===t.id);
    var sz=t.size||16,col=t.color||'#1e293b';
    var tw=Math.max(40,t.text.length*sz*0.62);
    h+='<g id="g'+t.id+'" onmousedown="textMD(event,\''+t.id+'\')" style="cursor:move">';
    if(isSel)h+='<rect x="'+(t.x-5)+'" y="'+(t.y-sz-2)+'" width="'+(tw+10)+'" height="'+(sz+10)+'"'+
      ' fill="none" stroke="#4299e1" stroke-width="1.5" stroke-dasharray="4,3" rx="3"/>';
    h+='<text x="'+t.x+'" y="'+t.y+'" font-size="'+sz+'" fill="'+col+'" font-weight="700" font-family="Segoe UI,Arial">'+esc(t.text)+'</text>';
    h+='</g>';
  });
  var el=document.getElementById('layer-texts');if(el)el.innerHTML=h;
}

function frameMD(e,id){
  e.stopPropagation();
  if(S.mode==='simulation')return;
  if(S.tool==='delete'){delete S.frames[id];if(S.sel===id)S.sel=null;renderFrames();noSel();return;}
  S.sel=id;
  var pt=svgPt(e);
  S.drag={id:id,type:'frame',ox:pt.x-S.frames[id].x,oy:pt.y-S.frames[id].y};
  renderFrames();showProps(id);
}
function frameResizeMD(e,id){
  e.stopPropagation();
  if(S.mode==='simulation')return;
  var pt=svgPt(e);var f=S.frames[id];if(!f)return;
  S.drag={id:id,type:'frame-resize',sx:pt.x,sy:pt.y,sw:f.w,sh:f.h};
}
function textMD(e,id){
  e.stopPropagation();
  if(S.mode==='simulation')return;
  if(S.tool==='delete'){delete S.texts[id];if(S.sel===id)S.sel=null;renderTexts();noSel();return;}
  S.sel=id;
  var pt=svgPt(e);var t=S.texts[id];if(!t)return;
  S.drag={id:id,type:'anntext',ox:pt.x-t.x,oy:pt.y-t.y};
  renderTexts();showProps(id);
}

function colorToHex(c){return(c&&c.charAt(0)==='#'&&(c.length===4||c.length===7))?c:'#718096';}

function showFrameProps(id){
  var f=S.frames[id];if(!f){noSel();return;}
  var h='<div class="devbadge" style="background:'+f.bg+';color:'+f.border+';border:1.5px solid '+f.border+'">▭ Cadre</div>';
  h+='<div class="psection">Étiquette</div>';
  h+='<div class="pr"><label>Texte</label><input value="'+esc(f.label||'')+'" placeholder="Zone réseau"'+
    ' onchange="S.frames[\''+id+'\'].label=this.value;renderFrames()"/></div>';
  h+='<div class="psection">Couleur</div>';
  h+='<div class="pr"><label>Fond</label><input type="color" value="'+colorToHex(f.bg||'#fffbeb')+'"'+
    ' onchange="S.frames[\''+id+'\'].bg=this.value;renderFrames()"/></div>';
  h+='<div class="pr"><label>Bordure & titre</label><input type="color" value="'+colorToHex(f.border||'#d97706')+'"'+
    ' onchange="S.frames[\''+id+'\'].border=this.value;renderFrames()"/></div>';
  h+='<div class="psection">Dimensions</div>';
  h+='<div class="pr"><label>Largeur (px)</label><input type="number" min="80" value="'+(f.w||300)+'"'+
    ' onchange="S.frames[\''+id+'\'].w=Math.max(80,parseInt(this.value)||300);renderFrames()"/></div>';
  h+='<div class="pr"><label>Hauteur (px)</label><input type="number" min="50" value="'+(f.h||200)+'"'+
    ' onchange="S.frames[\''+id+'\'].h=Math.max(50,parseInt(this.value)||200);renderFrames()"/></div>';
  h+='<div class="psection"></div>';
  h+='<button class="pb pb-red" onclick="delete S.frames[\''+id+'\'];S.sel=null;renderFrames();noSel()">🗑️ Supprimer ce cadre</button>';
  document.getElementById('props-body').innerHTML=h;
}

function showTextProps(id){
  var t=S.texts[id];if(!t){noSel();return;}
  var h='<div class="devbadge" style="background:#f1f5f9;color:#1e293b;border:1.5px solid #64748b">𝐓 Texte</div>';
  h+='<div class="psection">Contenu</div>';
  h+='<div class="pr"><label>Texte</label><input value="'+esc(t.text||'')+'"'+
    ' onchange="S.texts[\''+id+'\'].text=this.value;renderTexts()"/></div>';
  h+='<div class="psection">Style</div>';
  h+='<div class="pr"><label>Taille (px)</label><input type="number" min="8" max="72" value="'+(t.size||16)+'"'+
    ' onchange="S.texts[\''+id+'\'].size=Math.max(8,Math.min(72,parseInt(this.value)||16));renderTexts()"/></div>';
  h+='<div class="pr"><label>Couleur</label><input type="color" value="'+colorToHex(t.color||'#1e293b')+'"'+
    ' onchange="S.texts[\''+id+'\'].color=this.value;renderTexts()"/></div>';
  h+='<div class="psection"></div>';
  h+='<button class="pb pb-red" onclick="delete S.texts[\''+id+'\'];S.sel=null;renderTexts();noSel()">🗑️ Supprimer ce texte</button>';
  document.getElementById('props-body').innerHTML=h;
}

/* ─────────────────────────────────────────────────────
   MODE PROFESSEUR & GÉNÉRATION SCORM
───────────────────────────────────────────────────── */
var _teacherMode=false;
var _htmlSource='';

var MANIFEST_XML='<?xml version="1.0" encoding="UTF-8"?>\n'+
'<manifest identifier="simulateur-reseau-filius-js-v2"\n'+
'          version="2.0"\n'+
'          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"\n'+
'          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"\n'+
'          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'+
'          xsi:schemaLocation="\n'+
'            http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd\n'+
'            http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd\n'+
'            http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">\n'+
'  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>\n'+
'  <organizations default="org-filius">\n'+
'    <organization identifier="org-filius">\n'+
'      <title>Simulateur Réseau IPv4 — Style Filius (4ème / SNT)</title>\n'+
'      <item identifier="item-sim" identifierref="res-index">\n'+
'        <title>Simulateur réseau interactif : configuration et simulation IPv4</title>\n'+
'        <adlcp:masteryscore>75</adlcp:masteryscore>\n'+
'      </item>\n'+
'    </organization>\n'+
'  </organizations>\n'+
'  <resources>\n'+
'    <resource identifier="res-index" type="webcontent" adlcp:scormtype="sco" href="index.html">\n'+
'      <file href="index.html"/>\n'+
'    </resource>\n'+
'  </resources>\n'+
'</manifest>';

function toggleTeacherMode(){
  if(!_teacherMode){
    var pwd=prompt('Mot de passe professeur :');
    if(pwd===null)return;
    if(pwd!==TEACHER_PWD){notif('❌ Mot de passe incorrect','err');return;}
  }
  _teacherMode=!_teacherMode;
  document.getElementById('teacher-bar').style.display=_teacherMode?'flex':'none';
  if(_teacherMode)notif('🎓 Mode Professeur activé — construisez le réseau de départ puis générez le SCORM','ok');
}

function changeTeacherPwd(){
  var n=prompt('Nouveau mot de passe professeur (actuel : "'+TEACHER_PWD+'") :');
  if(!n||!n.trim())return;
  TEACHER_PWD=n.trim();
  notif('🔑 Mot de passe mis à jour — il sera intégré dans le prochain SCORM généré','ok');
}

function _doGenerateScorm(networkData){
  if(typeof JSZip==='undefined'){notif('❌ JSZip non chargé (connexion internet requise pour la première utilisation)','err');return;}
  if(!_htmlSource){notif('❌ Source HTML non disponible — réessayez dans quelques secondes','err');return;}

  var starterJson=networkData?JSON.stringify(networkData):'null';
  // Remplacer le réseau de départ et le mot de passe dans le source
  var newHtml=_htmlSource
    .replace(/var STARTER_NETWORK = null; \/\* __STARTER__ \*\//,
             'var STARTER_NETWORK = '+starterJson+'; /* __STARTER__ */')
    .replace(/var TEACHER_PWD = '[^']*'; \/\* __TEACHER_PWD__ \*\//,
             'var TEACHER_PWD = \''+TEACHER_PWD.replace(/'/g,"\\'")+'\''+'; /* __TEACHER_PWD__ */');

  var zip=new JSZip();
  zip.file('index.html',newHtml);
  zip.file('imsmanifest.xml',MANIFEST_XML);
  zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}).then(function(blob){
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;
    a.download='activite-reseau-'+(new Date().toISOString().slice(0,10))+'.zip';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notif('📦 SCORM généré avec succès — importez-le dans Moodle','ok');
  }).catch(function(e){notif('❌ Erreur génération : '+e.message,'err');});
}

function generateScorm(){
  var nd={devs:S.devs,links:S.links,nid:S.nid};
  var nb=Object.keys(S.devs).length;
  if(nb===0&&!confirm('Le canvas est vide. Générer un SCORM sans réseau de départ ?'))return;
  _doGenerateScorm(nb>0?nd:null);
}

function clearStarterAndGenerate(){
  if(!confirm('Générer un SCORM sans réseau de départ ?\n(Les élèves partiront d\'un canvas vide)'))return;
  _doGenerateScorm(null);
}

/* ─────────────────────────────────────────────────────
   TABS
───────────────────────────────────────────────────── */
function showTab(id){
  document.querySelectorAll('.tp').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.bt').forEach(function(b){b.classList.remove('active');});
  var pane=document.getElementById('tp-'+id);if(pane)pane.classList.add('active');
  var tabs=['term','brow','log','bdg','pkt','activ'];
  var idx=tabs.indexOf(id);
  var bts=document.querySelectorAll('.bt');if(bts[idx])bts[idx].classList.add('active');
  if(id==='brow'&&S.termDev){
    var bs=document.getElementById('bd-sel');
    if(bs&&bs.querySelector('option[value="'+S.termDev+'"]'))bs.value=S.termDev;
  }
}

/* ─────────────────────────────────────────────────────
   NOTIFICATIONS
───────────────────────────────────────────────────── */
function notif(msg,type){
  var old=document.querySelector('.notif');if(old)old.remove();
  var n=document.createElement('div');n.className='notif n'+(type||'info');
  n.textContent=msg;document.body.appendChild(n);
  setTimeout(function(){n.style.transition='opacity .4s';n.style.opacity='0';setTimeout(function(){n.remove();},420);},3600);
}

/* ─────────────────────────────────────────────────────
   FENÊTRE SÉPARÉE & PLEIN ÉCRAN
───────────────────────────────────────────────────── */
function openPopup(){
  var html=document.documentElement.outerHTML;
  if(html.indexOf('<!DOCTYPE')<0&&html.indexOf('<!doctype')<0)html='<!DOCTYPE html>\n'+html;
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var w=window.open(url,'sim_popup',
    'width=1440,height=940,resizable=yes,scrollbars=no,menubar=no,toolbar=no,location=no,status=no');
  if(!w||w.closed||typeof w.closed==='undefined'){
    URL.revokeObjectURL(url);
    alert('Le navigateur a bloqué la fenêtre popup.\nAutorisez les popups pour ce site, puis réessayez.');
    return;
  }
  setTimeout(function(){URL.revokeObjectURL(url);},15000);
  notif('↗ Simulateur ouvert dans une nouvelle fenêtre','info');
}

function toggleFullscreen(){
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(function(){});
  } else {
    if(document.exitFullscreen)document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange',function(){
  var b=document.getElementById('btn-fs');
  if(b)b.textContent=document.fullscreenElement?'⤡ Fenêtre':'⤢ Plein écran';
});

/* ─────────────────────────────────────────────────────
   FINISH
───────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────── */

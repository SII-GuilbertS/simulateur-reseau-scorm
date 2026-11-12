/* ─────────────────────────────────────────────────────
   INTERFACE DU SIMULATEUR — affichage, souris et clavier, terminal, SCORM
   S'appuie sur net-core.js, chargé juste avant. Tout ce qui touche la page, les minuteries ou
   le LMS est ici ; une règle de réseau ou d'évaluation va dans net-core.js.
───────────────────────────────────────────────────── */
/* stub overridé par le builder */
function snapHistory(){}

/* Mot de passe du mode professeur : la ligne suivante est remplacée lors de la génération */
var TEACHER_PWD = 'prof'; /* __TEACHER_PWD__ */

/* ─────────────────────────────────────────────────────
   MOTEUR D'ACTIVITÉ
───────────────────────────────────────────────────── */
/* Toute modification redessine le réseau : les objectifs sont alors revérifiés. */
var _objCheckT=null;
function scheduleObjectiveCheck(){
  if(_objCheckT)return;
  _objCheckT=setTimeout(function(){
    _objCheckT=null;
    if(typeof checkAllObjectives==='function')checkAllObjectives();
  },0);
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
  // Page hôte d'un autre domaine (iframe) : lecture interdite, donc pas d'API SCORM accessible.
  function findIn(w){try{var n=0;while(!w.API&&w.parent!==w&&n++<12)w=w.parent;return w.API||null;}catch(e){return null;}}
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
/* sSet et sCom renvoient false quand le LMS refuse (valeur trop longue, session fermée…). */
function sSet(k,v){if(!_api||!_apiOk)return false;var r=_api.LMSSetValue(k,String(v));return r==='true'||r===true;}
function sGet(k){if(_api&&_apiOk)return _api.LMSGetValue(k);return '';}
function sCom(){if(!_api||!_apiOk)return false;var r=_api.LMSCommit('');return r==='true'||r===true;}
function sEnd(sc,ok){
  if(!_api||!_apiOk)return;
  sSet('cmi.core.score.min','0');sSet('cmi.core.score.max','100');sSet('cmi.core.score.raw',String(sc));
  sSet('cmi.core.lesson_status',ok?'passed':'failed');sCom();_api.LMSFinish('');_apiOk=false;
}

/* ─────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────── */
function devIcon(d){var k=pcKind(d);return k?k.icon:(DT[d.type]?DT[d.type].icon:'');}
// Icônes des appareils (WebP 72x72, fond transparent) : cartes du schéma, palette, fiches
var DEV_IMG={
  desktop:'data:image/webp;base64,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',
  laptop:'data:image/webp;base64,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',
  phone:'data:image/webp;base64,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',
  tablet:'data:image/webp;base64,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',
  server:'data:image/webp;base64,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',
  switch:'data:image/webp;base64,UklGRswFAABXRUJQVlA4WAoAAAAQAAAARwAARwAAQUxQSPIBAAABAcZtJClSTS3mnzIf/CP6PwH8f3JNwLUI1bQxvNSNILOqNjZPAG9hCEgI/i+XAxGRFCcARfr/PyImIOlY27ZIi+7n/XB3d0jd3d1dQovZgy2ADTksgcMGyB1Gerq+J6iqr+vvSieIiAmQYRXqxt1ld6OoGPvIXUTF8oPLlLGzDa4qwlXOeUjKtl1ZxnbOlgkG8+hQsPDJ40WM+ZdjpFEmwfH7ixgAFmA1yKjBNdUEGATkNx+qKAux7MpaBkk1ALkmCk2zqLvpwGeKFY5bZxmGwJR3ggAj6oFKUsWuG0twYDpUiykyoBpRIOUZT/cxCBBjqiK1pYrrTzdXiHEXzW6QWXJnM8OwAfeiOXPuIP8lSYx9i5tWXl8NIdqNsDAgcJtqbhC4KGdAX9cwED00iGYD4d07/k3Rhw5nOOihUYldq8RECzySEaWh2iR66SIPXRNSD0o13PySSQ19n3RxcRVA7lvEclN3z/LkV6hhZOEWgSdMnrSBYEQ1iDJwidwBHMFqst3QqgKEmWCxclamXZVzR+3qzstmZrX982kenbvB1F3gmsFauQbRqp+nXiwiQookslIyISkSIUFAgLDaCv/aRKkx0ywFEchEgiRSmhQRQhKBJsGUqFKKgDQpQpOSHnzEJRA2/fzC6OpCHWg0nEf6P0ZWUDggtAMAALASAJ0BKkgASAA+PRqLQ6IhoRXJzYAgA8SzgGqSpx3bPW3Y1z5nsSzIH65ju/3jtAOAX/dck4+a/4zwUv47jGNPN/nPSOzzPQX66fAZ/Kv6b/rft95Gn9mT/pLaSHfK6JXVNpkLmX8jrU99ZxXbEh/27qqrKgT0oDblwPMV0XAC8itjRL/aG6Xe5HV6CIrIpFoT/y1IXyJS2ipqSWrgAP7+pTYHwAqO3RAL1MdCyhlEjk+G5hBn/GFKZ6OpW4KS8NYjx7+9mUPe1pI+4bYonXC3cTbWCT8nHecxfwgaaW2L20gXpmTJfgAZs/44+thnPJA57MFeIc8SUAl0gEvRMsy8h/H/gMvueBe2Js3LbVyQjZoIIfS855ukh8NMb8S/Giu/xMb3AnuiBIhHkL+ubWDqSgc9rfb+opS/rO1188c+jwtna7hfXqlaNzVkzqX/S3zMN3XBzQrd+eraNadFi74y15TKaBWRF7qS4OlL+e4+i1mE98vFD3F5i0BzCW8r9OdHnQEdHHTu9+6/8/fvp/xfvOaoimOWxXbGc++o4jFnDOpms4XOTpdthEGCcIJhHN3iXIk50YNvGWjI0giueFjGzhRM7Av6LaHjA22FrQjw4Z5jCXn/f55G/C+s55fT+nVh8a+97aCthazuizQk3bmx/jQR9LUI8nSyUu1LCvU7SB54qfjX/0om8FcNV617kS3KN9dQZv7m+kercIIf+MX16qTSJnFp1BHSbbmQ+ajHl4fmNxutHe6+kyD1Sb/878hyp4Yh4hq98Vx1L2bOGovoe+FX6T/08Bc2wITy96VedaOEAfyTbA4kxCTogz+4tWuLhi1v9zHsXwiPkh+ou02GfRLc+EGC7v5iGn58cnW9qzrRh3ScIiout6PzWg6U0GXwVibpZzNFG/kLI72h8aBS8Mp6OgaHFHA4tQwfQCioAZTurDEEoKM1gCqold8EnHoR/V3Fo2bVbgfKZj93iUPtqTBPfJeeqb//IvLf/mA3aC3XRV1lMaBuUR/4u0SPI45hZ5OM7Mx8YVTZeBX96l69o34AuDKUv0BSd/OD5MxRNMhUw/vb473Iu6ZcWVmXuIsv2KCHNsI7wAiJ60oYwVJjazXnVWT5zCvKROqDGIHyRll1f2hcRP/uB8a5hVvx4ctcIYBfO35psAH+s1+SyvDwLcfBs+hQjDWga3/z/JsO3GlL8rkNfSnP0e86c5pmjQWvndEn7aposeO1JBioTBG7tV8je+aZQsVYMtjRXyEoBgAAAA==',
  router:'data:image/webp;base64,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',
  wifi_router:'data:image/webp;base64,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'
};
function devImgKey(d){if(!d)return '';if(d.type==='pc')return d.kind&&DEV_IMG[d.kind]?d.kind:'desktop';return DEV_IMG[d.type]?d.type:'';}
function devImg(d){return DEV_IMG[devImgKey(d)]||'';}
// Icône en HTML (fiches, badges) : image si disponible, sinon l'emoji historique
function devIconHTML(d,sz){var u=devImg(d);sz=sz||18;
  return u?'<img src="'+u+'" alt="" width="'+sz+'" height="'+sz+'" style="vertical-align:middle;object-fit:contain">':devIcon(d);}
// Remplace les emojis de la palette par les icônes
function palIcons(){
  if(typeof document==='undefined'||!document.querySelector)return;
  var m={'pi-pc-desktop':'desktop','pi-pc-laptop':'laptop','pi-pc-phone':'phone','pi-pc-tablet':'tablet',
    'pi-server':'server','pi-switch':'switch','pi-router':'router','pi-wifi_router':'wifi_router'};
  Object.keys(m).forEach(function(id){
    var el=document.querySelector('#'+id+' .pi-icon');
    if(el&&el.innerHTML!==undefined)el.innerHTML='<img src="'+DEV_IMG[m[id]]+'" alt="" width="44" height="44" draggable="false" style="display:block;object-fit:contain">';
  });
}
// Tout changement dans la fiche Propriétés (SSID, DHCP, HTTP, DNS...) relance la vérification des objectifs
function propsChangeHook(){
  var pb=document.getElementById('props-body');
  if(!pb||!pb.addEventListener||pb._objHook)return;pb._objHook=true;
  pb.addEventListener('change',function(){
    setTimeout(function(){if(typeof checkAllObjectives==='function')checkAllObjectives();},0);
  });
}
function engineDomInit(){palIcons();propsChangeHook();}
try{if(typeof document!=='undefined'&&document.addEventListener){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',engineDomInit);else engineDomInit();}}catch(e){}
// Ligne « Modèle » du panneau de propriétés d'un PC (mode configuration)
function pcKindRowHTML(id){
  var d=S.devs[id];if(!d||d.type!=='pc')return '';
  var h='<div class="pr"><label>Modèle</label><select onchange="onPcKindChange(\''+id+'\',this.value)">';
  if(!d.kind)h+='<option value="" selected>🖥️ PC (câble + WiFi)</option>';
  Object.keys(PC_KINDS).forEach(function(k){
    var p=PC_KINDS[k];
    h+='<option value="'+k+'"'+(d.kind===k?' selected':'')+'>'+p.icon+' '+p.label+
      ' ('+(p.cable&&p.wifi?'câble + WiFi':p.cable?'câble':'WiFi')+')</option>';
  });
  return h+'</select></div>';
}
function onPcKindChange(id,kind){
  if(typeof snapHistory==='function')snapHistory();
  setPcKind(id,kind);
  render();showProps(id);
  setTimeout(function(){checkAllObjectives();},50);
}
function setPcKind(id,kind){
  var d=S.devs[id];if(!d||d.type!=='pc')return false;
  var old=d.kind;
  if(kind)d.kind=kind;else delete d.kind;
  var bad=forbiddenLinks(id);
  if(bad.length){
    var msg=d.name+' ('+devLabel(d)+') ne peut pas garder '+(bad.length>1?'ses '+bad.length+' liaisons actuelles':'sa liaison actuelle')+
      ' ('+(canWifi(d)?'câble':'WiFi')+' non autorisé). Supprimer '+(bad.length>1?'ces liaisons':'cette liaison')+' ?';
    if(typeof confirm==='function'&&!confirm(msg)){if(old)d.kind=old;else delete d.kind;return false;}
    bad.forEach(function(lid){delete S.links[lid];});
  }
  return true;
}

/* ─────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────── */

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
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ─────────────────────────────────────────────────────
   DEVICE / LINK MANAGEMENT
───────────────────────────────────────────────────── */
function addLink(a,b){
  var c=linkCheck(a,b);
  if(!c.ok){if(c.msg)notif('⚠️ '+c.msg,'err');return null;}
  var da=S.devs[a],db=S.devs[b];
  var id='l'+(S.nid++);S.links[id]={id:id,from:a,to:b};
  setTimeout(function(){checkAllObjectives();},50);
  if(c.wifi){S.links[id].type='wifi';wifiPrefill(da.type==='wifi_router'?db:da,da.type==='wifi_router'?da:db);}
  return id;
}

function isBuilderApp(){return typeof EvalModule!=='undefined';}
/* Liaison tracée : le terminal choisit le réseau de la box. Dans le builder, le mot de passe est
   aussi saisi ; dans l'activité, l'élève le tape lui-même (il figure dans la fiche de la box). */
function wifiPrefill(t,b){
  if(!t||!b||t.type==='wifi_router')return;
  if(t.wifi&&(t.wifi.ssid||'').trim())return;
  t.wifi={ssid:b.ssid||'',pass:isBuilderApp()?(b.wifiPass||''):''};
}
function setTermWifi(id,field,value){
  var d=S.devs[id];if(!d)return;
  if(!d.wifi){var b=wifiBoxOf(d);d.wifi={ssid:b?b.ssid||'':'',pass:b?b.wifiPass||'':''};}
  d.wifi[field]=value;
  render();showProps(id);
}
/* Box : dans le builder, les terminaux qui étaient connectés suivent le nouveau SSID ou mot de
   passe ; dans l'activité, ils se déconnectent, comme avec une vraie box. */
function setBoxWifi(id,field,value){
  var b=S.devs[id];if(!b)return;
  var key=field==='ssid'?'ssid':'pass',old=field==='ssid'?b.ssid||'':b.wifiPass||'';
  if(isBuilderApp())Object.values(S.links).forEach(function(l){
    if(l.type!=='wifi'||(l.from!==id&&l.to!==id))return;
    var t=S.devs[l.from===id?l.to:l.from];
    if(t&&t.wifi&&(t.wifi[key]||'')===old)t.wifi[key]=value;
  });
  if(field==='ssid')b.ssid=value;else b.wifiPass=value;
  render();showProps(id);
}
/* Section « Connexion WiFi » de la fiche d'un terminal relié en WiFi à une box. */
function wifiPropsHTML(id,editable){
  var d=S.devs[id],b=wifiBoxOf(d);
  if(!d||!b||(d.type!=='pc'&&d.type!=='server'))return '';
  var w=d.wifi||{ssid:b.ssid||'',pass:b.wifiPass||''},st=wifiAssoc(d,b);
  var h='<div class="psection">Connexion WiFi</div>';
  h+='<div class="pr" style="font-size:.8em;font-weight:700;color:'+(st.ok?'#276749':'#c53030')+'">'+
    (st.ok?'✅ Connecté à « '+esc(b.ssid||'')+' » ('+esc(b.name)+')'
      :'❌ '+esc(wifiProblem(id)||'Non connecté au WiFi').replace('Non connecté au WiFi : ','Non connecté : '))+'</div>';
  if(editable){
    h+='<div class="pr"><label>Réseau WiFi (SSID)</label><input value="'+esc(w.ssid||'')+'" placeholder="'+esc(b.ssid||'')+'"'+
      ' onchange="setTermWifi(\''+id+'\',\'ssid\',this.value)"/></div>';
    h+='<div class="pr"><label>Mot de passe WiFi</label><input type="text" value="'+esc(w.pass||'')+'"'+
      ' placeholder="'+(b.wifiPass?'mot de passe de la box':'(réseau ouvert)')+'"'+
      ' onchange="setTermWifi(\''+id+'\',\'pass\',this.value)"/></div>';
  } else {
    h+='<div class="pr"><label>Réseau WiFi (SSID)</label><div class="mono">'+esc(w.ssid||'—')+'</div></div>';
  }
  return h;
}

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
   SVG RENDERING
───────────────────────────────────────────────────── */
function render(){renderFrames();renderLinks();renderDevs();renderTexts();renderHint();updSelects();scheduleObjectiveCheck();}

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
    var isWifiLink=(l.type==='wifi'),wifiDown=isWifiLink&&!wifiLinkUp(l);
    var baseColor=wifiDown?'#e53e3e':isWifiLink?'#a78bfa':((ai&&bi&&ai.ip&&bi.ip)?'#7abfff':'#b0bec5');
    var midFill=isAnim?(S.animPhase==='fwd'?'#48bb78':'#63b3ed'):(wifiDown?'#c53030':isWifiLink?'#7c3aed':(ai&&bi&&ai.ip&&bi.ip?'#4299e1':'#a0aec0'));
    // Zone de clic invisible épaisse (12px) pour faciliter la sélection
    h+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"'+
      ' stroke="transparent" stroke-width="12" stroke-linecap="round"'+
      ' onmousedown="event.stopPropagation();selLink(\''+l.id+'\')" oncontextmenu="linkRC(event,\''+l.id+'\')" style="cursor:pointer"/>'+
    // Ligne visible
      '<line id="'+l.id+'" class="'+cls+'"'+
      ' x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"'+
      (isAnim?'':' stroke="'+baseColor+'"')+
      (isAnim?'':' stroke-width="2.5"')+
      (isWifiLink?' stroke-dasharray="8,5"':'')+
      ' stroke-linecap="round" pointer-events="none"/>'+
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
  var cx=d.x+DW/2, cy=d.y+40;
  var bd=isCF?'#fbd38d':(isSel?'#2b6cb0':'#0369a1');
  var sw=isSel||isCF?3.5:2;
  var h='<g id="gd'+d.id+'" onmousedown="devMD(event,\''+d.id+'\')" oncontextmenu="devRC(event,\''+d.id+'\')" style="cursor:pointer">';
  h+='<rect x="'+d.x+'" y="'+d.y+'" width="'+DW+'" height="'+DH+'" fill="transparent" stroke="none"/>';
  h+='<g transform="translate('+cx+' '+cy+') scale(1.3) translate('+(-cx)+' '+(-cy)+')">';
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
  h+='</g>';
  // Étoiles décoratives
  h+='<circle cx="'+(d.x+7)+'"  cy="'+(d.y+9)+'"  r="2"   fill="#7dd3fc" opacity="0.7"/>';
  h+='<circle cx="'+(d.x+17)+'" cy="'+(d.y+4)+'"  r="1.5" fill="#bae6fd" opacity="0.55"/>';
  h+='<circle cx="'+(d.x+DW-9)+'" cy="'+(d.y+7)+'"  r="2"   fill="#7dd3fc" opacity="0.65"/>';
  h+='<circle cx="'+(d.x+DW-19)+'" cy="'+(d.y+13)+'" r="1.2" fill="#bae6fd" opacity="0.5"/>';
  // Nom
  h+='<text x="'+cx+'" y="'+(d.y+92)+'" text-anchor="middle" font-size="12.5" font-weight="700" fill="'+bd+'" font-family="Segoe UI,Arial">'+esc(d.name)+'</text>';
  // IPs des interfaces
  var _ips=(d.ifaces||[]).filter(function(fi){return fi.ip;}).map(function(fi){return fi.ip;});
  if(_ips.length)h+='<text x="'+cx+'" y="'+(d.y+104)+'" text-anchor="middle" font-size="8.5" fill="#0369a1" font-family="Courier New,monospace">'+esc(_ips.join(' / '))+'</text>';
  // Ring câble mode
  if(isCF)h+='<circle cx="'+cx+'" cy="'+cy+'" r="40" fill="none" stroke="#fbd38d" stroke-width="2.5" stroke-dasharray="5,3" opacity=".7"/>';
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
      // Toutes les interfaces tiennent sur la carte jusqu'à 3 lignes (2 sous le SSID d'une box) ;
      // au-delà, la dernière ligne résume le reste (détail complet dans l'infobulle).
      var maxL=(d.type==='wifi_router'&&d.ssid)?2:3;
      subLines=ifs.map(function(f){return truncSVG(f.name+': '+f.ip,20);});
      if(subLines.length>maxL)subLines=subLines.slice(0,maxL-1).concat(['+ '+(ifs.length-maxL+1)+' interfaces']);
      if(!subLines.length)subLines=['non configuré'];
    } else if(d.type!=='switch'){
      var fi=mainIface(d);
      if(fi&&fi.dhcpMode&&!fi.ip){subFull='DHCP…';subLines=['DHCP…'];}
      else{subFull=fi&&fi.ip?fi.ip:'non configuré';subLines=[truncSVG(subFull,22)];}
    } else {
      subFull='commutateur L2 ('+nbrs(d.id).length+' ports)';
      subLines=[nbrs(d.id).length+' ports'];
    }
    var svc='';if(d.type==='server'){if(d.http&&d.http.on)svc+='HTTP ';if(d.dns&&d.dns.on)svc+='DNS ';}
    if(d.type==='wifi_router'&&d.ssid)svc='📶 '+d.ssid;
    // Carte "flat" verticale : grande icône en haut, nom, puis adresses et services
    var nL=subLines.length,nB=nL+(svc?1:0),y0=83+(3-nB)*5.5;
    var subH='';
    subLines.forEach(function(sl,si){
      subH+='<text x="'+(d.x+DW/2)+'" y="'+(d.y+y0+si*11)+'" text-anchor="middle" font-size="9"'+
        ' fill="'+dt.tc+'" font-family="Courier New,monospace">'+esc(sl)+'</text>';
    });
    var img=devImg(d),cx=d.x+DW/2;
    h+=
      '<g id="gd'+d.id+'" onmousedown="devMD(event,\''+d.id+'\')" oncontextmenu="devRC(event,\''+d.id+'\')" style="cursor:pointer">'+
      '<title>'+esc(devLabel(d))+' — '+esc(d.name)+'&#10;'+esc(subFull)+'</title>'+
      '<rect x="'+d.x+'" y="'+(d.y+3)+'" width="'+DW+'" height="'+DH+'" rx="16" fill="'+dt.bd+'" opacity=".22"/>'+
      '<rect x="'+d.x+'" y="'+d.y+'" width="'+DW+'" height="'+DH+'" rx="16"'+
        ' fill="#fff" stroke="'+bd+'" stroke-width="'+(isSel||isCF?3:1.5)+'"/>'+
      '<rect x="'+(cx-29)+'" y="'+(d.y+6)+'" width="58" height="52" rx="14" fill="'+dt.bg+'"/>'+
      (img?'<image href="'+img+'" x="'+(cx-24)+'" y="'+(d.y+8)+'" width="48" height="48" preserveAspectRatio="xMidYMid meet" pointer-events="none"/>'
          :'<text x="'+cx+'" y="'+(d.y+44)+'" text-anchor="middle" font-size="30" font-family="Segoe UI">'+devIcon(d)+'</text>')+
      '<text x="'+cx+'" y="'+(d.y+71)+'" text-anchor="middle" font-size="12.5" font-weight="700"'+
        (d.name.length>15?' textLength="112" lengthAdjust="spacingAndGlyphs"':'')+
        ' fill="'+dt.tc+'" font-family="Segoe UI,Arial">'+esc(truncSVG(d.name,19))+'</text>'+
      subH+
      (svc?'<text x="'+cx+'" y="'+(d.y+y0+nL*11)+'" text-anchor="middle" font-size="9" font-weight="600"'+
        ' fill="#38a169" font-family="Segoe UI,Arial">'+esc(truncSVG(svc.trim(),22))+'</text>':'')+
      '<circle cx="'+(d.x+DW-12)+'" cy="'+(d.y+12)+'" r="5.5" fill="'+dot+'" stroke="#fff" stroke-width="1.5"/>'+
      (isCF?'<rect x="'+(d.x-5)+'" y="'+(d.y-5)+'" width="'+(DW+10)+'" height="'+(DH+10)+'" rx="20" fill="none" stroke="#f6ad55" stroke-width="2.5" stroke-dasharray="6,4"/>':'')+
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
  var kind;if(type.indexOf(':')>0){kind=type.split(':')[1];type=type.split(':')[0];}
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
  var id=mkDev(type,Math.max(4,x-DW/2),Math.max(4,y-DH/2),kind);
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
  // Si clic sur un câble (zone transparente épaisse), selLink a déjà
  // stoppé la propagation — on n'arrive ici que si ce n'est pas un câble.
  // Sécurité supplémentaire : ne pas désélectionner si target est un link connu.
  var isLink=(t.id&&S.links&&S.links[t.id]);
  if(S.tool==='select'&&!inG&&!isLink){S.sel=null;render();noSel();}
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
  var cw=document.getElementById('cw');
  if(cw){cw.style.cursor='';cw.classList.toggle('tool-link',t==='link');}
  render();
}

/* Suppr : efface l'élément sélectionné (appareil, câble, cadre ou texte), en mode Configuration. */
function deleteSelection(){
  var id=S.sel;
  if(!id||S.mode!=='config')return false;
  if(S.devs[id]){snapHistory();delDev(id);}
  else if(S.links[id]){snapHistory();delete S.links[id];}
  else if(S.frames&&S.frames[id]){snapHistory();delete S.frames[id];}
  else if(S.texts&&S.texts[id]){snapHistory();delete S.texts[id];}
  else return false;
  S.sel=null;render();noSel();
  return true;
}
/* Clavier, builder et élève : Échap revient à l'outil Sélection, quel que soit l'outil, et
   annule un câble ou un déplacement en cours ; Suppr (ou Retour arrière) efface la sélection,
   sauf pendant une saisie. */
document.addEventListener('keydown',function(e){
  var t=e.target||{};
  var typing=t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable;
  if(e.key==='Escape'){S.drag=null;setTool('select');return;}
  if((e.key==='Delete'||e.key==='Backspace')&&!typing&&deleteSelection())e.preventDefault();
});

function setMode(m){
  S.mode=m;
  document.getElementById('btn-cfg').classList.toggle('active',m==='config');
  document.getElementById('btn-sim').classList.toggle('active',m==='simulation');
  var simMode=(m==='simulation');
  ['link','pc','pc-desktop','pc-laptop','pc-phone','pc-tablet','server','switch','router','wifi_router','internet','frame','anntext'].forEach(function(t){
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
  var fi=d.ifaces[0],keys=['ip','mask','gateway','dns'];
  var was=!!fi.dhcpMode;
  fi.dhcpMode=enabled;
  // La configuration fixe est mise de côté (staticCfg), jamais lue par la simulation ni
  // l'évaluation, et remise en place si la case DHCP est décochée.
  if(enabled&&!was){
    if(keys.some(function(k){return fi[k];})){
      fi.staticCfg={};keys.forEach(function(k){fi.staticCfg[k]=fi[k]||'';});
    }
    keys.forEach(function(k){fi[k]='';});
  } else if(enabled){
    keys.forEach(function(k){fi[k]='';});
  } else if(was&&fi.staticCfg){
    keys.forEach(function(k){fi[k]=fi.staticCfg[k]||'';});
    delete fi.staticCfg;
  }
  // Comme un vrai poste : activer le DHCP envoie aussitôt une demande d'adresse
  // (même effet que la commande dhcp, y compris pour les objectifs).
  if(enabled)doDHCP(devId);
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
    checkDynamicObjective('dns_success',{from:S.devs[devId].name,fromId:devId,domain:hostname});
    target=dr.ip;
  }
  var res=simPing(devId,target);tpr('');
  var srcIP=(mainIface(S.devs[devId])||{}).ip||S.devs[devId].name;
  var disp=hostname?hostname+'['+target+']':target;
  if(res.ok){
    tpr('Ping de '+disp+' avec 32 octets de données :','info');
    for(var i=0;i<4;i++)tpr('Réponse de '+disp+' : octets=32 durée='+(res.lat+i%2)+'ms TTL='+pingTTL(res),'ok');
    tpr('');tpr('Statistiques : Envoyés=4, Reçus=4, Perdus=0 (0%)','ok');
    var pathNames=res.path.map(function(id){return S.devs[id]?S.devs[id].name:id;});
    if(res.path.length>1)tpr('Chemin : '+pathNames.join(' → '),'info');
    addLog('PING '+(hostname||target)+' depuis '+S.devs[devId].name+' — OK ('+pathNames.join('→')+')','ok');
    addPacket('ICMP Echo',srcIP,target,'4 réponses — '+pathNames.join('→'),true);
    animPath(res.path);
    checkDynamicObjective('ping_success',{from:S.devs[devId].name,fromId:devId,to:target});
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
    var fi=mainIface(d)||{},wb=wifiBoxOf(d);
    if(wb){var wpb=wifiProblem(devId);
      tpr('WiFi        : '+(wpb?wpb.replace('Non connecté au WiFi : ','non connecté — '):'connecté à '+wb.ssid),wpb?'err':'ok');}
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
    checkDynamicObjective('dns_success',{from:S.devs[devId].name,fromId:devId,domain:domain});
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
    checkDynamicObjective('dhcp_success',{from:d.name,fromId:devId,ip:res.ip});
  } else {
    tpr('DHCP Request échoué : '+res.reason,'err');
    addLog('DHCP '+d.name+' ÉCHEC : '+res.reason,'err');
    addPacket('DHCP','0.0.0.0','255.255.255.255',res.reason,false);
  }
}

/* ─────────────────────────────────────────────────────
   TABLE DE ROUTAGE
───────────────────────────────────────────────────── */

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
  var added=computeRoutes();
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
   CADRES & TEXTES D'ANNOTATION
───────────────────────────────────────────────────── */

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
  var nd={devs:S.devs,links:S.links,nid:S.nid,frames:S.frames,texts:S.texts};
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
  var tabs=['term','brow','log','pkt','activ'];
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

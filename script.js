const ADMIN_DEFAULT = { username: 'admin', password: 'admin123' };
let adminCreds = null;
try { adminCreds = JSON.parse(localStorage.getItem('adminCreds') || 'null'); } catch { adminCreds = null; }
function getAdminUsername(){ return adminCreds?.username || ADMIN_DEFAULT.username; }
function getAdminPassword(){ return adminCreds?.password || ADMIN_DEFAULT.password; }

/* ---------- App state ---------- */
let helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
let registeredHelpers = JSON.parse(localStorage.getItem('registeredHelpers') || '[]');
let pickupRequests = JSON.parse(localStorage.getItem('pickupRequests') || '[]');
let pickupHistory = JSON.parse(localStorage.getItem('pickupHistory') || '[]');
let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');

let currentUser = { name:'', role:'' };
let activeSection = 'map';

/* ---------- Session ---------- */
function setSessionUser(u){ try { sessionStorage.setItem('SESSION_USER', JSON.stringify(u)); } catch{} }
function getSessionUser(){ try { return JSON.parse(sessionStorage.getItem('SESSION_USER')||'null'); } catch { return null; } }
function isSessionLoggedIn(){ return sessionStorage.getItem('SESSION_LOGGED_IN') === '1'; }

/* ---------- Map + Geo ---------- */
let savedMapView = null;
try { savedMapView = JSON.parse(localStorage.getItem('mapView') || 'null'); } catch { savedMapView = null; }

function loadLastGoodFix(){
  try{
    const raw = localStorage.getItem('LAST_GOOD_FIX');
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || typeof obj.lat!=='number' || typeof obj.lng!=='number') return null;
    if(Date.now() - (obj.t || 0) > 24*60*60*1000) return null;
    return { lat: obj.lat, lng: obj.lng };
  }catch{ return null; }
}
let userLocation = loadLastGoodFix() || { lat: 51.5209, lng: -0.0550 };
let userAccuracy = null;
let bestAccuracy = Infinity;
let geoWatchId = null;
let hasBootstrappedLocation = false;

let map = null;
let markers = [];
let userMarker = null;
let userAccuracyCircle = null;
let routingControl = null;

/* ---------- Tunables ---------- */
const ONE_DAY = 24 * 60 * 60 * 1000;
const ACCEPTABLE_ACCURACY_M = 60;
const TARGET_BOOTSTRAP_ACCURACY_M = 50;
const MAX_STALE_FIX_MS = 5 * 60 * 1000;
const CLUSTER_DISTANCE_M = 30;

/* ---------- DOM ---------- */
const welcomeContainer = document.getElementById('welcomeContainer');
const appContainer = document.getElementById('appContainer');
const logoutBtn = document.getElementById('logoutBtn');

const loginSection = document.getElementById('loginSection');
const registerSection = document.getElementById('registerSection');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const showLoginBtn = document.getElementById('showLoginBtn');

const sections = {
  map: document.getElementById('map'),
  post: document.getElementById('post'),
  history: document.getElementById('history'),
  notifications: document.getElementById('notifications'),
  admin: document.getElementById('admin'),
  manage: document.getElementById('manage')
};

const nav = {
  mapBtn: document.getElementById('mapBtn'),
  postBtn: document.getElementById('postBtn'),
  historyBtn: document.getElementById('historyBtn'),
  notifyBtn: document.getElementById('notifyBtn'),
  adminBtn: document.getElementById('adminBtn'),
  manageBtn: document.getElementById('manageBtn')
};

const welcomeNameEl = document.getElementById('welcomeName');
const roleSelect = document.getElementById('role');
const adminPasswordRow = document.getElementById('adminPasswordRow');
const adminPasswordInput = document.getElementById('adminPassword');

const authBrand = document.getElementById('authBrand');
const topbarBrand = document.getElementById('topbarBrand');
const mapRoleTitle = document.getElementById('mapRoleTitle');
const locateBtn = document.getElementById('locateBtn');

/* ---------- Tiny green nav-dot indicators ---------- */
const DOT_STYLE = 'display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;margin-left:6px;box-shadow:0 0 0 2px rgba(0,0,0,.35);vertical-align:middle;';
function setNavDot(buttonEl, visible){
  if(!buttonEl) return;
  let dot = buttonEl.querySelector('.nav-dot');
  if(!dot){
    dot = document.createElement('span');
    dot.className = 'nav-dot';
    dot.style.cssText = DOT_STYLE;
    buttonEl.appendChild(dot);
  }
  dot.style.display = visible ? 'inline-block' : 'none';
}
function updateNavBadges(){
  if(currentUser.role==='helper'){
    const hasNotif = (notifications||[]).some(n => (n.helperName||'').toLowerCase() === (currentUser.name||'').toLowerCase());
    const hasPendingHelper = (pickupHistory||[]).some(h => (h.helperName||'').toLowerCase() === (currentUser.name||'').toLowerCase() && !h.helperCompleted);
    setNavDot(nav.notifyBtn, !!hasNotif);
    setNavDot(nav.historyBtn, !!hasPendingHelper);
  } else if(currentUser.role==='user'){
    const hasPending = (pickupHistory||[]).some(h => (h.neederName||'').toLowerCase() === (currentUser.name||'').toLowerCase() && !h.neederCompleted);
    setNavDot(nav.historyBtn, !!hasPending);
    setNavDot(nav.notifyBtn, false);
  } else {
    setNavDot(nav.notifyBtn, false);
    setNavDot(nav.historyBtn, false);
  }
}

/* ---------- Icons ---------- */
function makePinIcon(hex='#2A83F7'){
  const svg=encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41"><path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.5 11 18.5 11.6 19l.9.7.9-.7C14 31 25 22 25 12.5 25 5.6 19.4 0 12.5 0z" fill="${hex}"/><circle cx="12.5" cy="12" r="5" fill="#fff" opacity=".85"/></svg>`);
  return L.divIcon({className:'rm-pin', html:`<img src="data:image/svg+xml,${svg}" style="width:25px;height:41px;display:block">`, iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34]});
}
const blueIcon=makePinIcon('#2A83F7');
const redIcon=makePinIcon('#d33');

/* ---------- Storage helpers ---------- */
function saveState(){
  localStorage.setItem('helpers', JSON.stringify(helpers));
  localStorage.setItem('registeredHelpers', JSON.stringify(registeredHelpers));
  localStorage.setItem('pickupRequests', JSON.stringify(pickupRequests));
  localStorage.setItem('pickupHistory', JSON.stringify(pickupHistory));
  localStorage.setItem('notifications', JSON.stringify(notifications));
}
function reloadStateFromStorage(){
  try{
    helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
    registeredHelpers = JSON.parse(localStorage.getItem('registeredHelpers') || '[]');
    pickupRequests = JSON.parse(localStorage.getItem('pickupRequests') || '[]');
    pickupHistory = JSON.parse(localStorage.getItem('pickupHistory') || '[]');
    notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
  }catch{}
}
function saveLastGoodFix(){
  try{
    if(typeof userLocation.lat==='number' && typeof userLocation.lng==='number' && isFinite(userAccuracy ?? 0) && (userAccuracy ?? 9999) <= 1200){
      localStorage.setItem('LAST_GOOD_FIX', JSON.stringify({ ...userLocation, accuracy: userAccuracy, t: Date.now() }));
    }
  }catch{}
}

/* ---------- Utils ---------- */
function escapeHtml(s){return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function haversine(aLat,aLng,bLat,bLng){const R=6371000,toRad=d=>d*Math.PI/180,dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng),s1=Math.sin(dLat/2),s2=Math.sin(dLng/2),aa=s1*s1+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*s2*s2;return 2*R*Math.asin(Math.sqrt(aa));}
function nearBy(aLat,aLng,bLat,bLng,within=CLUSTER_DISTANCE_M){if([aLat,aLng,bLat,bLng].some(v=>typeof v!=='number'||Number.isNaN(v)))return false;return haversine(aLat,aLng,bLat,bLng)<=within;}
function mergeResourceStrings(oldStr,newStr){const clean=s=>(s||'').split(/[•,]/).map(x=>x.trim()).filter(Boolean);const arr=clean(oldStr);const add=clean(newStr);const seen=new Set(arr.map(x=>x.toLowerCase()));add.forEach(x=>{if(!seen.has(x.toLowerCase()))arr.push(x);});return arr.join(' • ');}
function starStr(n){ if(!n) return '—'; return '★'.repeat(n)+'☆'.repeat(5-n); }

/* ---------- Role title ---------- */
function getActiveHelpers(){ return (helpers||[]).filter(h => (h.resource||'').trim()!==''); }
function updateMapHeaderTitle(){ if(!mapRoleTitle) return; const r=currentUser.role; mapRoleTitle.textContent = r==='user'?'Find Resource in Map': r==='helper'?'Post Resource in Map':'Resource Map'; }

/* ---------- Auth UI ---------- */
roleSelect?.addEventListener('change',()=>{ if(!adminPasswordRow) return; adminPasswordRow.style.display = (roleSelect.value==='admin')?'block':'none'; if(roleSelect.value!=='admin') adminPasswordInput.value=''; });
showRegisterBtn?.addEventListener('click',()=>{ if(!loginSection||!registerSection) return; loginSection.style.display='none'; registerSection.style.display='block'; });
showLoginBtn?.addEventListener('click',()=>{ if(!loginSection||!registerSection) return; registerSection.style.display='none'; loginSection.style.display='block'; });

/* ---------- Geo acceptance ---------- */
function shouldAcceptPosition(pos){
  const acc = pos?.coords?.accuracy ?? Infinity;
  const lat = pos?.coords?.latitude, lng = pos?.coords?.longitude;
  if (lat==null || lng==null) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  const posTime = pos.timestamp ? +pos.timestamp : Date.now();
  if (Date.now() - posTime > MAX_STALE_FIX_MS) return false;

  if (!isFinite(bestAccuracy) || bestAccuracy === Infinity) return acc <= 1200;
  if (acc <= bestAccuracy * 0.8) return true;
  if (acc <= ACCEPTABLE_ACCURACY_M) {
    const jump = haversine(userLocation.lat, userLocation.lng, lat, lng);
    if (jump <= Math.max(acc * 2.5, 120)) return true;
  }
  return false;
}

/* ---------- Geo pipeline ---------- */
function startGeoPipeline(){
  if (!navigator.geolocation) { console.warn('Geolocation not supported.'); return; }
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const acc = pos?.coords?.accuracy ?? Infinity;
      const lat = pos?.coords?.latitude, lng = pos?.coords?.longitude;
      if(lat!=null && lng!=null){
        userLocation = { lat, lng }; userAccuracy = acc; bestAccuracy = acc;
        updateMyLocationMarker();
        if(!hasBootstrappedLocation){
          if(map && (acc <= TARGET_BOOTSTRAP_ACCURACY_M || !savedMapView)){
            map.setView([lat,lng], 16, {animate:false});
          }
          hasBootstrappedLocation = true;
          saveLastGoodFix();
          updateResourcesList(); renderNotifications(); renderHistory();
        }
      }
      beginWatch();
    },
    err=>{
      console.warn('getCurrentPosition error', err?.message||err);
      beginWatch();
    },
    { enableHighAccuracy:true, maximumAge:0, timeout:20000 }
  );
}
function beginWatch(){
  if (geoWatchId != null) return;
  geoWatchId = navigator.geolocation.watchPosition(
    pos=>{
      if(!shouldAcceptPosition(pos)) return;
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      userAccuracy = pos.coords.accuracy || null;
      bestAccuracy = Math.min(bestAccuracy, userAccuracy ?? Infinity);
      saveLastGoodFix();

      const shouldRecenter = !hasBootstrappedLocation || (userAccuracy!=null && userAccuracy <= TARGET_BOOTSTRAP_ACCURACY_M && (map?.getZoom()||0) < 15);
      updateMyLocationMarker();
      if(shouldRecenter && map){
        map.setView([userLocation.lat,userLocation.lng], Math.max(map.getZoom()||13, 16), {animate:false});
        hasBootstrappedLocation = true;
      }
      if (currentUser.role==='helper'){
        const i=helpers.findIndex(h=>h.name?.toLowerCase()===currentUser.name.toLowerCase()&&(h.resource||'').trim()!=='');
        if(i>=0){
          helpers[i].lat=userLocation.lat; helpers[i].lng=userLocation.lng;
          const rIdx=registeredHelpers.findIndex(h=>h.name?.toLowerCase()===currentUser.name.toLowerCase());
          if(rIdx>=0){ registeredHelpers[rIdx].lat=userLocation.lat; registeredHelpers[rIdx].lng=userLocation.lng; }
          saveState(); updateMap();
        }
      }
      if (routingControl){
        const w=routingControl.getWaypoints(); if(w&&w.length>=2){ routingControl.setWaypoints([L.latLng(userLocation.lat,userLocation.lng), w[1].latLng]); }
      }
    },
    err=>console.warn('watchPosition error',err?.message||err),
    { enableHighAccuracy:true, maximumAge:0, timeout:20000 }
  );
}
function stopGeoWatch(){ if(geoWatchId!=null){ navigator.geolocation.clearWatch(geoWatchId); geoWatchId=null; } }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&isSessionLoggedIn()){ startGeoPipeline(); if(map) setTimeout(()=>map.invalidateSize(true),0); } });

/* ---------- App frame ---------- */
function removeCityHarvestTabsIfAny(){
  ['cityHarvestNeederBtn','cityHarvestHelperBtn','cityHarvestNeeder','cityHarvestHelper'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.remove();
  });
}
function showApp(){
  if(!welcomeContainer||!appContainer) return;
  welcomeContainer.style.display='none'; appContainer.style.display='grid'; if(logoutBtn) logoutBtn.style.display='inline-block';
  if(authBrand) authBrand.style.display='none'; if(topbarBrand) topbarBrand.style.display='flex';

  removeCityHarvestTabsIfAny();

  const isAdmin=currentUser.role==='admin';
  if(nav.postBtn) nav.postBtn.style.display = currentUser.role==='helper' ? 'block' : 'none';
  if(nav.notifyBtn) nav.notifyBtn.style.display = currentUser.role==='helper' ? 'block' : 'none';
  if(nav.adminBtn) nav.adminBtn.style.display = isAdmin ? 'block' : 'none';
  if(nav.manageBtn) nav.manageBtn.style.display = isAdmin ? 'block' : 'none';

  if(welcomeNameEl) welcomeNameEl.textContent = currentUser.name ? `Welcome, ${currentUser.name}` : '';
  updateMapHeaderTitle();
  updateNavBadges();
}
function showAuth(){
  if(!welcomeContainer||!appContainer) return;
  welcomeContainer.style.display='flex'; appContainer.style.display='none'; if(logoutBtn) logoutBtn.style.display='none';
  if(registerSection) registerSection.style.display='none'; if(loginSection) loginSection.style.display='block'; if(welcomeNameEl) welcomeNameEl.textContent='';
  if(authBrand) authBrand.style.display='flex'; if(topbarBrand) topbarBrand.style.display='none';
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- Sections ---------- */
function showSection(id){
  if((id==='admin'||id==='manage')&&currentUser.role!=='admin'){ alert('Admin access only.'); id='map'; }
  Object.values(sections).forEach(s=>{ if(!s) return; s.classList.remove('active'); s.style.display='none'; });
  if(sections[id]){ sections[id].classList.add('active'); sections[id].style.display='block'; activeSection=id; }
  if(id==='map'){ updateMapHeaderTitle(); initMap(); updateResourcesList(); if(map) setTimeout(()=>map.invalidateSize(true),0); }
  else if(id==='history'){ renderHistory(); }
  else if(id==='notifications'){ renderNotifications(); }
  else if(id==='admin'){ renderAdmin(); }
  else if(id==='manage'){ loadAdminAccountForm(); }
  updateNavBadges();
}
window.showSection=showSection;

function refreshEverything(){
  reloadStateFromStorage();
  updateResourcesList();
  renderNotifications();
  if(activeSection!=='history') renderHistory();
  if(map){ updateMap(); setTimeout(()=>map.invalidateSize(true),0); }
  updateNavBadges();
}
function goHome(){
  if(isSessionLoggedIn()){ showApp(); if(!map) initMap(); else updateMap(); refreshEverything(); showSection('map'); }
  else { showAuth(); }
}
window.goHome=goHome;

/* ---------- Auth forms ---------- */
document.getElementById('loginForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const name=document.getElementById('loginName')?.value.trim();
  const role=document.getElementById('role')?.value;
  if(!name) return alert('Please enter your name.');
  if(role==='helper'){ const found=registeredHelpers.find(h=>h.name.toLowerCase()===name.toLowerCase()); if(!found) return alert('Helper not registered. Please register first.'); }
  if(role==='admin'){
    if(name.toLowerCase()!==getAdminUsername().toLowerCase()) return alert('Invalid admin username.');
    // Password not required for admin login.
  }
  currentUser={name,role}; sessionStorage.setItem('SESSION_LOGGED_IN','1'); setSessionUser(currentUser);
  showApp(); initMap(); startGeoPipeline(); showSection('map');
});

document.getElementById('registerForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const name=document.getElementById('regName')?.value.trim();
  const address=document.getElementById('regAddress')?.value.trim();
  const phone=document.getElementById('regPhone')?.value.trim();
  if(!name||!address||!phone) return alert('Please fill all fields.');
  if(registeredHelpers.find(h=>h.name.toLowerCase()===name.toLowerCase())){ const el=document.getElementById('registerStatus'); if(el) el.textContent='This name is already registered.'; return; }
  const obj={name,address,phone,lat:null,lng:null,resource:''};
  registeredHelpers.push(obj); helpers.push(obj); saveState();
  const el=document.getElementById('registerStatus'); if(el) el.textContent='Registered successfully! You can login now.';
  alert(`Registered as Helper: ${name}`);
  document.getElementById('registerForm').reset();
  setTimeout(()=>{ if(el) el.textContent=''; if(registerSection) registerSection.style.display='none'; if(loginSection) loginSection.style.display='block'; },1200);
});

logoutBtn?.addEventListener('click',()=>{
  if(!confirm('Are you sure you want to logout?')) return;
  currentUser={name:'',role:''}; sessionStorage.removeItem('SESSION_LOGGED_IN'); sessionStorage.removeItem('SESSION_USER');
  stopGeoWatch(); hasBootstrappedLocation=false; bestAccuracy=Infinity;
  if(map){ try{map.remove();}catch{} map=null; userMarker=null; userAccuracyCircle=null; markers=[]; }
  routingControl && map?.removeControl?.(routingControl); routingControl=null;
  showAuth();
});

/* ---------- Leaflet ---------- */
function initMap(){
  if(!sections.map) return;
  if(!map){
    try{
      const center = savedMapView ? [savedMapView.lat, savedMapView.lng] : [userLocation.lat,userLocation.lng];
      const zoom = savedMapView ? savedMapView.zoom : 15;
      map=L.map('mapContainer',{center,zoom,preferCanvas:true,scrollWheelZoom:true});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19,detectRetina:true,updateWhenIdle:true,updateWhenZooming:false}).addTo(map);
      map.on('moveend',()=>{ if(hasBootstrappedLocation){ const c=map.getCenter(); localStorage.setItem('mapView',JSON.stringify({lat:c.lat,lng:c.lng,zoom:map.getZoom()})); } });
      map.on('zoomend',()=>{ if(hasBootstrappedLocation){ const c=map.getCenter(); localStorage.setItem('mapView',JSON.stringify({lat:c.lat,lng:c.lng,zoom:map.getZoom()})); } });
    }catch(e){ const errEl=document.getElementById('mapError'); if(errEl) errEl.style.display='block'; return; }
  }
  updateMap();
}
function updateMyLocationMarker(){
  if(!map) return;
  if(!userMarker){ userMarker=L.marker([userLocation.lat,userLocation.lng],{title:'Your Location',icon:blueIcon}).addTo(map).bindPopup('Your Location'); }
  else { userMarker.setLatLng([userLocation.lat,userLocation.lng]); }
  if(userAccuracy!=null&&!isNaN(userAccuracy)){
    if(!userAccuracyCircle){ userAccuracyCircle=L.circle([userLocation.lat,userLocation.lng],{radius:userAccuracy,color:'#3b82f6',weight:2,fillColor:'#3b82f6',fillOpacity:.15}).addTo(map); }
    else { userAccuracyCircle.setLatLng([userLocation.lat,userLocation.lng]); userAccuracyCircle.setRadius(userAccuracy); }
  }else if(userAccuracyCircle){ try{map.removeLayer(userAccuracyCircle);}catch{} userAccuracyCircle=null; }
}
function startRoute(fromLatLng,toLatLng){
  if(!map) return;
  if(routingControl){ map.removeControl(routingControl); routingControl=null; }
  routingControl=L.Routing.control({
    waypoints:[L.latLng(fromLatLng[0],fromLatLng[1]),L.latLng(toLatLng[0],toLatLng[1])],
    router:L.Routing.osrmv1({serviceUrl:'https://router.project-osrm.org/route/v1'}),
    addWaypoints:false,draggableWaypoints:false,routeWhileDragging:false,show:false,fitSelectedRoutes:false,showAlternatives:false,
    lineOptions:{addWaypoints:false,styles:[{weight:6,opacity:.85}]},
    createMarker:(i,wp)=>L.marker(wp.latLng,{icon:i===0?blueIcon:redIcon})
  }).addTo(map);
}
function clearRoute(){ if(routingControl&&map){ map.removeControl(routingControl); routingControl=null; } }
function updateMap(){
  if(!map) return;
  const center=map.getCenter(), zoom=map.getZoom();
  markers.forEach(m=>{ if(map.hasLayer(m)) map.removeLayer(m); }); markers=[];
  updateMyLocationMarker();
  getActiveHelpers().forEach((h,idx)=>{
    if(typeof h.lat!=='number'||typeof h.lng!=='number') return;
    const m=L.marker([h.lat,h.lng],{title:h.name,icon:redIcon}).addTo(map);
    let actions='';
    if(currentUser.role==='user'){
      const exists=pickupRequests.some(r=>r.helperName?.toLowerCase()===h.name.toLowerCase()&&r.neederName?.toLowerCase()===currentUser.name.toLowerCase()&&r.status==='requested'&&((typeof r.helperLat==='number'&&typeof r.helperLng==='number')?nearBy(r.helperLat,r.helperLng,h.lat,h.lng):true));
      const btnId=`pinreq_${h.name.replace(/\W/g,'_')}_${idx}`;
      actions=`<div style="margin-top:.35rem"><button id="${btnId}" class="request-btn" ${exists?'disabled':''}>${exists?'Requested':'Request Pickup'}</button></div>`;
      m.on('popupopen',()=>{const b=document.getElementById(btnId); if(b&&!b.disabled) b.onclick=()=>requestPickupByHelperName(h.name,h.lat,h.lng);});
    }
    m.bindPopup(`<b>${escapeHtml(h.name)}</b><br>${escapeHtml(h.resource||'')}<br>Phone: ${escapeHtml(h.phone||'N/A')}${actions}`);
    markers.push(m);
  });
  map.setView(center,zoom,{animate:false});
}

/* ---------- Resources list ---------- */
function updateResourcesList(){
  const list=document.getElementById('resourcesList'); if(!list){ updateNavBadges(); return; }
  list.innerHTML='';
  const active=getActiveHelpers();
  if(!active.length){ list.innerHTML='<p class="muted">No resources posted yet.</p>'; return; }
  active.forEach((h,idx)=>{
    const div=document.createElement('div'); div.className='resource-item';
    let actions='';
    if(currentUser.role==='user'){
      const exists=pickupRequests.some(r=>r.helperName?.toLowerCase()===h.name.toLowerCase()&&r.neederName?.toLowerCase()===currentUser.name.toLowerCase()&&r.status==='requested'&&((typeof r.helperLat==='number'&&typeof r.helperLng==='number')?nearBy(r.helperLat,r.helperLng,h.lat,h.lng):true));
      actions=`<button ${exists?'disabled':''} class="request-btn" data-name="${h.name}" data-lat="${h.lat}" data-lng="${h.lng}">${exists?'Requested':'Request Pickup'}</button>`;
    }
    if(currentUser.role==='helper'&&currentUser.name.toLowerCase()===h.name.toLowerCase()){
      actions+=` <button class="remove-resource-btn" data-name="${h.name}" data-lat="${h.lat}" data-lng="${h.lng}">Remove Resource</button>`;
    }
    div.innerHTML=`<div>
        <strong>${escapeHtml(h.name)}</strong><br>
        <small class="muted">Resources:</small> ${escapeHtml(h.resource||'—')}<br>
        <small class="muted">Address:</small> ${escapeHtml(h.address||'—')}<br>
        <small class="muted">Phone:</small> ${escapeHtml(h.phone||'—')}
      </div>
      <div>${actions}</div>`;
    list.appendChild(div);
  });
  document.querySelectorAll('.request-btn').forEach(b=>b.addEventListener('click',()=>{const n=b.getAttribute('data-name');const lat=parseFloat(b.getAttribute('data-lat'));const lng=parseFloat(b.getAttribute('data-lng'));requestPickupByHelperName(n,lat,lng);}));
  document.querySelectorAll('.remove-resource-btn').forEach(b=>b.addEventListener('click',()=>{const n=b.getAttribute('data-name');const lat=parseFloat(b.getAttribute('data-lat'));const lng=parseFloat(b.getAttribute('data-lng'));if(!confirm('Remove this posted resource?'))return;const i=helpers.findIndex(x=>x.name.toLowerCase()===n.toLowerCase()&&nearBy(x.lat,x.lng,lat,lng));if(i>=0){helpers[i].resource='';saveState();}updateResourcesList();updateMap();renderAdmin();}));
  updateNavBadges();
}

/* ---------- Locate ---------- */
locateBtn?.addEventListener('click',()=>{ if(!map) return; const z=Math.max(map.getZoom()||13,16); map.setView([userLocation.lat,userLocation.lng],z,{animate:true}); });

/* ---------- Requests / Notifications ---------- */
function requestPickupByHelperName(helperName, lat=null, lng=null){
  if(currentUser.role!=='user') return alert('Only needers can request pickup.');
  const nameLc=(helperName||'').toLowerCase();
  const candidates=getActiveHelpers().filter(x=>(x.name||'').toLowerCase()===nameLc);
  if(!candidates.length) return alert('Resource not found.');
  let h=candidates[0];
  if(lat!=null&&lng!=null){ const hit=candidates.find(c=>nearBy(c.lat,c.lng,lat,lng)); if(hit) h=hit; }
  else if(candidates.length>1){ h=candidates.slice().sort((a,b)=>haversine(userLocation.lat,userLocation.lng,a.lat,a.lng)-haversine(userLocation.lat,userLocation.lng,b.lat,b.lng))[0]; }
  const nowMs=Date.now();
  const id='req_'+nowMs;
  const req={ id, helperName:h.name, helperPhone:h.phone||'N/A', helperLat:h.lat, helperLng:h.lng,
    neederName:currentUser.name, resource:h.resource||'N/A', status:'requested',
    timestamp:new Date(nowMs).toLocaleString(), timestampMs:nowMs,
    neederLat:userLocation.lat, neederLng:userLocation.lng, neederAddress:'' };
  pickupRequests.push(req);
  notifications.push({id,helperName:h.name,message:`Pickup requested by ${currentUser.name} for "${req.resource}".`,requestId:id,timestamp:req.timestamp});
  saveState();
  reverseGeocode(req.neederLat,req.neederLng).then(addr=>{const r=pickupRequests.find(x=>x.id===id); if(r){r.neederAddress=addr; saveState();}});
  alert('Pickup requested. Helper will be notified.');
  updateResourcesList(); renderNotifications(); updateMap(); renderAdmin(); updateNavBadges();
}
window.requestPickup=requestPickupByHelperName;

async function confirmPickupRequest(requestId){
  const idx=pickupRequests.findIndex(r=>r.id===requestId); if(idx<0) return alert('Request not found.');
  const r=pickupRequests[idx];
  if(currentUser.role!=='helper'||currentUser.name.toLowerCase()!==r.helperName.toLowerCase()) return alert('You are not authorized to confirm this request.');
  if(!confirm(`Confirm pickup for ${r.neederName} (resource: ${r.resource})?`)) return;
  await doConfirmAndRecord(r, {});
  notifications = notifications.filter(n=>n.requestId!==requestId);
  saveState();
  updateMap(); updateResourcesList(); renderNotifications(); renderHistory(); renderAdmin(); updateNavBadges();
}
window.confirmPickupRequest=confirmPickupRequest;

async function doConfirmAndRecord(r, opts={}){
  const isCH = !!opts.cityHarvest;

  const helperRec=registeredHelpers.find(h=>h.name.toLowerCase()===r.helperName.toLowerCase());
  const hLat = (typeof r.helperLat==='number') ? r.helperLat : (helperRec?.lat ?? null);
  const hLng = (typeof r.helperLng==='number') ? r.helperLng : (helperRec?.lng ?? null);

  let helperAddress=''; if(hLat!=null&&hLng!=null){ helperAddress=await reverseGeocode(hLat,hLng)||helperRec?.address||''; } else { helperAddress=helperRec?.address||''; }
  let neederAddress=r.neederAddress||''; if(!neederAddress&&r.neederLat&&r.neederLng){ const revN=await reverseGeocode(r.neederLat,r.neederLng); if(revN) neederAddress=revN; }

  const nowMs=Date.now();
  const index=pickupRequests.findIndex(x=>x.id===r.id);
  if(index>=0){
    pickupRequests[index].status='confirmed';
    pickupRequests[index].confirmedAt=new Date(nowMs).toLocaleString();
    pickupRequests[index].confirmedAtMs=nowMs;
    if(isCH){ pickupRequests[index].cityHarvest=true; pickupRequests[index].courier='City Harvest'; }
  }

  pickupHistory.push({
    id:r.id, helperName:r.helperName, helperPhone:r.helperPhone, helperAddress,
    helperLat:hLat??null, helperLng:hLng??null,
    neederName:r.neederName, neederAddress, neederLat:r.neederLat??null, neederLng:r.neederLng??null,
    resource:r.resource, timestamp:(pickupRequests[index]?.confirmedAt)||new Date(nowMs).toLocaleString(), timestampMs:nowMs,
    helperCompleted:false, neederCompleted:false, helperRating:null, helperFeedback:'',
    neederRating:null, neederFeedback:'', completedAt:null, hideFromNeeder:false, hideFromHelper:false,
    cityHarvest:isCH, courier: isCH ? 'City Harvest' : ''
  });

  printReceipt({
    helperName:r.helperName,
    helperPhone:r.helperPhone,
    helperAddress,
    neederName:r.neederName,
    neederAddress,
    resource:r.resource,
    timestamp:(pickupRequests[index]?.confirmedAt)||new Date(nowMs).toLocaleString(),
    courier: isCH ? 'City Harvest' : ''
  });
}

function convertHistoryToCityHarvest(recordId){
  const i = pickupHistory.findIndex(h=>h.id===recordId);
  if(i<0) return;
  if(pickupHistory[i].cityHarvest) return;

  pickupHistory[i].cityHarvest = true;
  pickupHistory[i].courier = 'City Harvest';

  const rIdx = pickupRequests.findIndex(r=>r.id===recordId);
  if(rIdx>=0){
    pickupRequests[rIdx].cityHarvest = true;
    pickupRequests[rIdx].courier = 'City Harvest';
  }

  saveState();
  printReceipt({
    helperName: pickupHistory[i].helperName,
    helperPhone: pickupHistory[i].helperPhone,
    helperAddress: pickupHistory[i].helperAddress || '',
    neederName: pickupHistory[i].neederName,
    neederAddress: pickupHistory[i].neederAddress || '',
    resource: pickupHistory[i].resource,
    timestamp: pickupHistory[i].timestamp,
    courier: 'City Harvest'
  });

  renderHistory(); renderAdmin(); updateNavBadges();
}

/* ---------- Feedback modal ---------- */
let feedbackModalOpen = false;
function openFeedbackModal(recordId, who){
  const rec = pickupHistory.find(x=>x.id===recordId);
  if(!rec) return;

  feedbackModalOpen = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;`;

  const modal = document.createElement('div');
  modal.style.cssText = `width:min(680px, 95vw); background:#111827; color:#cbd5e1; border:1px solid rgba(255,255,255,.08); border-radius:18px; padding:22px; box-shadow:0 15px 40px rgba(0,0,0,.45);`;

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:800; font-size:22px; color:#93c5fd; margin-bottom:14px;';
  title.textContent = `Rate & Feedback (${who==='helper' ? 'Helper → Needer' : 'Needer → Helper'})`;

  const starsWrap = document.createElement('div');
  starsWrap.style.cssText = 'font-size:28px; margin:6px 0 10px; user-select:none;';
  const starOn = '#f6c945', starOff = '#344256';
  let rating = 0; const stars = [];
  for(let i=1;i<=5;i++){
    const s=document.createElement('span');
    s.textContent='★';
    s.style.cssText=`cursor:pointer; margin-right:10px; color:${starOff}; opacity:.9;`;
    s.addEventListener('mouseenter',()=>paint(i));
    s.addEventListener('mouseleave',()=>paint(rating));
    s.addEventListener('click',()=>{ rating=i; paint(rating); });
    stars.push(s); starsWrap.appendChild(s);
  }
  function paint(n){ stars.forEach((s,idx)=>{ s.style.color = (idx+1)<=n ? starOn : starOff; s.style.transform=(idx+1)<=n?'scale(1.03)':'none'; }); }

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Optional feedback (up to 100 words)';
  textarea.rows = 4;
  textarea.style.cssText = `width:100%; background:#0b1220; border:1px solid rgba(255,255,255,.08); color:#e2e8f0; padding:12px; border-radius:12px; resize:vertical; outline:none;`;
  const counter = document.createElement('div');
  counter.style.cssText='font-size:12px; opacity:.75; margin:6px 2px 14px;';
  counter.textContent='0 / 100 words';
  function updateWordCount(){
    const words=(textarea.value||'').trim().split(/\s+/).filter(Boolean);
    if(words.length>100) textarea.value=words.slice(0,100).join(' ');
    const used=(textarea.value.trim()?textarea.value.trim().split(/\s+/).filter(Boolean).length:0);
    counter.textContent=`${used} / 100 words`;
  }
  textarea.addEventListener('input',updateWordCount);

  const btnRow = document.createElement('div');
  btnRow.style.cssText='display:flex; gap:10px; justify-content:flex-end; margin-top:10px;';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent='Cancel';
  cancelBtn.style.cssText='padding:10px 16px; border-radius:12px; border:1px solid rgba(255,255,255,.08); background:#0b1220; color:#e2e8f0; cursor:pointer;';
  const submitBtn = document.createElement('button');
  submitBtn.textContent='Submit';
  submitBtn.style.cssText='padding:10px 16px; border-radius:12px; border:1px solid rgba(59,130,246,.2); background:#3b82f6; color:white; font-weight:700; cursor:pointer;';

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(submitBtn);

  modal.appendChild(title);
  modal.appendChild(starsWrap);
  modal.appendChild(textarea);
  modal.appendChild(counter);
  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  setTimeout(()=>textarea.focus(),10);

  function closeModal(){
    feedbackModalOpen = false;
    overlay.remove();
    updateNavBadges();
  }
  overlay.addEventListener('click',e=>{ if(e.target===overlay) closeModal(); });
  cancelBtn.addEventListener('click',closeModal);

  submitBtn.addEventListener('click',()=>{
    if(rating<1){ alert('Please select a star rating (1–5).'); return; }
    const fb=(textarea.value||'').trim();
    const i=pickupHistory.findIndex(h=>h.id===recordId); if(i<0){ closeModal(); return; }

    if(who==='helper'){
      pickupHistory[i].helperRating = rating;
      pickupHistory[i].helperFeedback = fb;
    }else{
      pickupHistory[i].neederRating = rating;
      pickupHistory[i].neederFeedback = fb;
    }

    if(pickupHistory[i].helperCompleted && pickupHistory[i].neederCompleted && !pickupHistory[i].completedAt){
      pickupHistory[i].completedAt = new Date().toLocaleString();
    }

    saveState();
    closeModal();
    renderHistory(); updateMap(); updateResourcesList(); renderAdmin(); updateNavBadges();
  });
}

/* ---------- History ---------- */
function renderHistory(){
  const list=document.getElementById('historyList'); if(!list){ updateNavBadges(); return; }
  list.innerHTML='';
  if(!pickupHistory.length){ list.innerHTML='<p class="muted">No pickups recorded yet.</p>'; updateNavBadges(); return; }

  let records=pickupHistory.slice();
  if(currentUser.role!=='admin'){
    const cutoff=Date.now()-ONE_DAY;
    records=records.filter(h=>{
      if(currentUser.role==='user'&&h.hideFromNeeder) return false;
      if(currentUser.role==='helper'&&h.hideFromHelper) return false;
      const ms=typeof h.timestampMs==='number'?h.timestampMs:(typeof h.confirmedAtMs==='number'?h.confirmedAtMs:(Date.parse(h.timestamp)||0));
      return ms>=cutoff;
    });
  }
  if(!records.length){ list.innerHTML=(currentUser.role==='admin')?'<p class="muted">No pickups recorded yet.</p>':'<p class="muted">No pickups in the last 24 hours.</p>'; updateNavBadges(); return; }

  records.reverse().forEach(h=>{
    const div=document.createElement('div'); div.className='history-item';
    let actions='', extra='';

    if(currentUser.role==='user'&&currentUser.name.toLowerCase()===(h.neederName||'').toLowerCase()){
      if(!h.neederCompleted){
        actions+=`<button class="complete-btn" data-type="needer" data-id="${h.id}">Mark Received</button>`;
        if(!h.cityHarvest){
          actions+=` <button class="ch-convert-btn" data-id="${h.id}">Contact City Harvest Delivery</button>`;
        }
      }else if(h.neederRating==null){
        actions+=`<button class="give-fb-btn" data-type="needer" data-id="${h.id}">Give Feedback</button>`;
      }
      extra+=`<button class="direction-btn" data-id="${h.id}">Get Directions</button>`;
    }
    if(currentUser.role==='helper'&&currentUser.name.toLowerCase()===(h.helperName||'').toLowerCase()){
      if(!h.helperCompleted){
        actions+=`<button class="complete-btn" data-type="helper" data-id="${h.id}">Mark Given</button>`;
        if(!h.cityHarvest){
          actions+=` <button class="ch-hand-btn" data-id="${h.id}">Handed to City Harvest</button>`;
        }
      }else if(h.helperRating==null){
        actions+=`<button class="give-fb-btn" data-type="helper" data-id="${h.id}">Give Feedback</button>`;
      }
    }

    const canPrint=(currentUser.role==='user'&&currentUser.name.toLowerCase()===(h.neederName||'').toLowerCase())||(currentUser.role==='helper'&&currentUser.name.toLowerCase()===(h.helperName||'').toLowerCase())||(currentUser.role==='admin');
    const printBtn=canPrint?`<button class="print-history-btn" data-id="${h.id}">Print Receipt</button>`:'';

    const statusBits=[h.helperCompleted?'Helper ✅':'Helper ❌', h.neederCompleted?'Needer ✅':'Needer ❌']; if(h.completedAt) statusBits.push(`Completed • ${h.completedAt}`);
    const ratingText=v=>v?'★'.repeat(v)+'☆'.repeat(5-v):'—';
    const chTag = h.cityHarvest ? `<br><small class="muted">Courier:</small> City Harvest` : '';

    div.innerHTML=`<div>
        <small class="muted">Picked up by ${escapeHtml(h.neederName)} • ${escapeHtml(h.timestamp)}</small><br>
        <small class="muted">Status:</small> ${statusBits.join(' • ')}${chTag}<br>
        <small class="muted">Needer Rating:</small> ${ratingText(h.neederRating)} ${h.neederFeedback?` — “${escapeHtml(h.neederFeedback)}”`:''}<br>
        <small class="muted">Helper Rating:</small> ${ratingText(h.helperRating)} ${h.helperFeedback?` — “${escapeHtml(h.helperFeedback)}”`:''}
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">${actions}${extra}${printBtn}</div>`;
    list.appendChild(div);
  });

  document.querySelectorAll('.print-history-btn').forEach(b=>b.addEventListener('click',()=>{
    const id=b.getAttribute('data-id');const h=pickupHistory.find(x=>x.id===id);if(!h)return;
    printReceipt({
      helperName:h.helperName, helperPhone:h.helperPhone, helperAddress:h.helperAddress||'',
      neederName:h.neederName, neederAddress:h.neederAddress||'',
      resource:h.resource, timestamp:h.timestamp, courier: h.cityHarvest ? 'City Harvest' : ''
    });
  }));

  document.querySelectorAll('.complete-btn').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.getAttribute('data-id'); const type=btn.getAttribute('data-type');
    const i=pickupHistory.findIndex(x=>x.id===id); if(i<0) return;
    if(type==='needer'){ pickupHistory[i].neederCompleted=true; } else { pickupHistory[i].helperCompleted=true; }
    if(pickupHistory[i].helperCompleted && pickupHistory[i].neederCompleted){
      if(!pickupHistory[i].completedAt) pickupHistory[i].completedAt=new Date().toLocaleString();
      removeResourcePinForHistory(pickupHistory[i]); clearRoute();
    }
    saveState();
    renderHistory(); updateMap(); updateResourcesList(); renderAdmin(); updateNavBadges();
  }));
  document.querySelectorAll('.ch-convert-btn').forEach(btn=>btn.addEventListener('click',()=>{ convertHistoryToCityHarvest(btn.getAttribute('data-id')); }));
  document.querySelectorAll('.ch-hand-btn').forEach(btn=>btn.addEventListener('click',()=>{ convertHistoryToCityHarvest(btn.getAttribute('data-id')); }));
  document.querySelectorAll('.give-fb-btn').forEach(btn=>btn.addEventListener('click',()=>{ openFeedbackModal(btn.getAttribute('data-id'), btn.getAttribute('data-type')); }));
  document.querySelectorAll('.direction-btn').forEach(btn=>btn.addEventListener('click',()=>{
    const id=btn.getAttribute('data-id'); const rec=pickupHistory.find(x=>x.id===id); if(!rec) return;
    const from=(rec.neederLat!=null&&rec.neederLng!=null)?[rec.neederLat,rec.neederLng]:[userLocation.lat,userLocation.lng];
    let to=null;
    if(rec.helperLat!=null&&rec.helperLng!=null) to=[rec.helperLat,rec.helperLng];
    else { const h=registeredHelpers.find(v=>v.name.toLowerCase()===rec.helperName.toLowerCase()); if(h&&typeof h.lat==='number'&&typeof h.lng==='number') to=[h.lat,h.lng]; }
    if(!to){ alert('Helper location not available.'); return; }
    startRoute(from,to); showSection('map');
  }));

  updateNavBadges();
}

/* ---------- Remove helper pin when BOTH complete ---------- */
function removeResourcePinForHistory(rec){
  if(!rec) return;
  if(!(rec.helperCompleted && rec.neederCompleted)) return;
  let changed=false;
  const radius = Math.max(CLUSTER_DISTANCE_M, 60);
  for(let i=helpers.length-1;i>=0;i--){
    const h=helpers[i];
    if((h.name||'').toLowerCase() !== (rec.helperName||'').toLowerCase()) continue;
    const locMatch = (typeof h.lat==='number' && typeof h.lng==='number' &&
                      typeof rec.helperLat==='number' && typeof rec.helperLng==='number')
                      ? nearBy(h.lat,h.lng,rec.helperLat,rec.helperLng,radius)
                      : true;
    if(locMatch && (h.resource||'').trim()!==''){
      helpers[i].resource='';
      changed=true;
    }
  }
  if(changed){ saveState(); renderAdmin(); updateNavBadges(); }
}

/* ---------- Notifications ---------- */
function renderNotifications(){
  const list=document.getElementById('notificationList'); if(!list){ updateNavBadges(); return; }
  list.innerHTML='';
  if(currentUser.role!=='helper'){ list.innerHTML='<p class="muted">Login as a helper to see notifications.</p>'; updateNavBadges(); return; }
  const mine=notifications.filter(n=>n.helperName.toLowerCase()===currentUser.name.toLowerCase());
  if(!mine.length){ list.innerHTML=''; updateNavBadges(); return; }
  mine.forEach(n=>{
    const req=pickupRequests.find(r=>r.id===n.requestId);
    const div=document.createElement('div'); div.className='notification-item';
    let inner=`<div><strong>${n.message}</strong><br><small class="muted">${n.timestamp}</small></div>`;
    if(req){ inner+=`<div>${req.status==='requested'?`<button class="confirm-btn" data-id="${req.id}">Confirm & Print Receipt</button>`:`<small class="muted">Status: ${req.status}</small>`}</div>`; }
    div.innerHTML=inner; list.appendChild(div);
  });
  document.querySelectorAll('.confirm-btn').forEach(b=>b.addEventListener('click',()=>{const id=b.getAttribute('data-id');confirmPickupRequest(id);}));
  updateNavBadges();
}

/* ---------- Reverse geocode + printing ---------- */
async function reverseGeocode(lat,lng){
  try{
    const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
    const data=await res.json(); const a=data.address||{};
    const line1=(a.house_number&&a.road)?`${a.house_number} ${a.road}`:(a.road||a.pedestrian||a.residential||a.cycleway||a.footway||'');
    const line2=[a.suburb,a.city||a.town||a.village||a.hamlet].filter(Boolean).join(', ');
    const county=a.county||a.state_district||''; const postcode=a.postcode||''; const country=(a.country_code?a.country_code.toUpperCase():(a.country||''));
    return [line1,line2,county,postcode,country].filter(Boolean).join(', ');
  }catch{ return ''; }
}
function printReceipt({helperName,helperPhone,helperAddress,neederName,neederAddress,resource,timestamp,courier}){
  const courierRow = courier ? `<p><strong>Courier:</strong> ${escapeHtml(courier)}</p>` : '';
  const html=`<html><head><title>Pickup Receipt</title><meta name="viewport" content="width=device-width,initial-scale=1" /><style>body{font-family:'Poppins',sans-serif;padding:2rem;color:#0f1720}h1{color:#2563eb;margin-bottom:.5rem}.details{margin-top:1rem;font-size:1rem;line-height:1.5}.details p{margin:.45rem 0}.print-btn{margin-top:1.25rem;padding:.6rem 1rem;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700}@media print{.print-btn{display:none}}</style></head><body><h1>Pickup Receipt</h1><div class="details"><p><strong>Helper:</strong> ${escapeHtml(helperName)}</p><p><strong>Helper Phone:</strong> ${escapeHtml(helperPhone||'N/A')}</p><p><strong>Helper Address:</strong> ${escapeHtml(helperAddress||'N/A')}</p><p><strong>Needer:</strong> ${escapeHtml(neederName)}</p><p><strong>Needer Address:</strong> ${escapeHtml(neederAddress||'N/A')}</p><p><strong>Resource(s):</strong> ${escapeHtml(resource)}</p><p><strong>Date & Time:</strong> ${escapeHtml(timestamp)}</p>${courierRow}</div><button class="print-btn" onclick="window.print()">Print Receipt</button></body></html>`;
  const w=window.open('','_blank','width=600,height=700'); w.document.open(); w.document.write(html); w.document.close();
}
function printFullRecord(obj){ printReceipt(obj); }

/* ---------- Admin ---------- */
function adminItemRow(labelHtml,actionHtml=''){ const div=document.createElement('div'); div.className='admin-item'; div.innerHTML=`<div>${labelHtml}</div><div style="display:flex;gap:.4rem;flex-wrap:wrap">${actionHtml}</div>`; return div; }

async function adminPrintFromRequest(req){
  let helperAddress=''; const helperRec=registeredHelpers.find(h=>h.name.toLowerCase()===req.helperName.toLowerCase());
  const hLat=(typeof req.helperLat==='number')?req.helperLat:(helperRec?.lat??null);
  const hLng=(typeof req.helperLng==='number')?req.helperLng:(helperRec?.lng??null);
  if(hLat!=null&&hLng!=null){ helperAddress=await reverseGeocode(hLat,hLng)||helperRec?.address||''; } else { helperAddress=helperRec?.address||''; }
  let neederAddress=req.neederAddress||''; if(!neederAddress&&req.neederLat&&req.neederLng){ neederAddress=await reverseGeocode(req.neederLat,req.neederLng)||''; }
  printFullRecord({
    helperName:req.helperName,helperPhone:req.helperPhone,helperAddress,
    neederName:req.neederName,neederAddress,
    resource:req.resource,timestamp:req.confirmedAt||req.timestamp,
    courier: req.cityHarvest ? 'City Harvest' : ''
  });
}
async function adminConfirmRequest(requestId){
  const r = pickupRequests.find(x=>x.id===requestId);
  if(!r) return alert('Request not found.');
  if(r.status!=='requested'){ alert('This request is already confirmed.'); return; }
  await doConfirmAndRecord(r, {});
  notifications = notifications.filter(n=>n.requestId!==requestId);
  saveState();
  renderAdmin(); renderHistory(); updateResourcesList(); updateMap(); updateNavBadges();
}
function adminClearResource(encodedName, lat, lng){
  const name = decodeURIComponent(encodedName);
  if(!confirm(`Clear "${name}" posted resource?`)) return;
  const idx = helpers.findIndex(h=> (h.name||'').toLowerCase()===String(name).toLowerCase() && typeof h.lat==='number' && typeof h.lng==='number' && nearBy(h.lat,h.lng,Number(lat),Number(lng),Math.max(CLUSTER_DISTANCE_M,60)));
  if(idx>=0){ helpers[idx].resource=''; saveState(); }
  renderAdmin(); updateResourcesList(); updateMap(); updateNavBadges();
}
function adminFocus(lat,lng){
  showSection('map'); initMap();
  setTimeout(()=>{ if(map){ map.setView([Number(lat),Number(lng)], 17, {animate:true}); } }, 50);
}
window.adminConfirmRequest=adminConfirmRequest;
window.adminClearResource=adminClearResource;
window.adminFocus=adminFocus;

function printFullRecordFromHistory(h){
  const html=`<html><head><title>Pickup Record</title><meta name="viewport" content="width=device-width,initial-scale=1" /><style>
    body{font-family:'Poppins',sans-serif;padding:2rem;color:#0f1720}
    h1{color:#2563eb;margin-bottom:.5rem}
    .details p{margin:.35rem 0}
    .section{margin-top:1rem}
    .print-btn{margin-top:1.25rem;padding:.6rem 1rem;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700}
    @media print{.print-btn{display:none}}
  </style></head><body>
    <h1>Pickup Record</h1>
    <div class="section details">
      <p><strong>Helper:</strong> ${escapeHtml(h.helperName)}</p>
      <p><strong>Helper Phone:</strong> ${escapeHtml(h.helperPhone||'N/A')}</p>
      <p><strong>Helper Address:</strong> ${escapeHtml(h.helperAddress||'N/A')}</p>
      <p><strong>Needer:</strong> ${escapeHtml(h.neederName)}</p>
      <p><strong>Needer Address:</strong> ${escapeHtml(h.neederAddress||'N/A')}</p>
      <p><strong>Resource(s):</strong> ${escapeHtml(h.resource)}</p>
      <p><strong>Confirmed At:</strong> ${escapeHtml(h.timestamp||'')}</p>
      <p><strong>Completed At:</strong> ${escapeHtml(h.completedAt||'—')}</p>
      <hr>
      <p><strong>Needer Rating:</strong> ${escapeHtml(starStr(h.neederRating))} ${h.neederFeedback?`— “${escapeHtml(h.neederFeedback)}”`:''}</p>
      <p><strong>Helper Rating:</strong> ${escapeHtml(starStr(h.helperRating))} ${h.helperFeedback?`— “${escapeHtml(h.helperFeedback)}”`:''}</p>
      ${h.cityHarvest?`<p><strong>Courier:</strong> City Harvest</p>`:''}
    </div>
    <button class="print-btn" onclick="window.print()">Print</button>
  </body></html>`;
  const w=window.open('','_blank','width=700,height=800'); w.document.open(); w.document.write(html); w.document.close();
}
function clearNeederHistory(){ if(!confirm('Hide all history from Needer views? Admin will still see everything.')) return; pickupHistory=pickupHistory.map(h=>({...h,hideFromNeeder:true})); saveState(); renderAdmin(); }
function clearHelperHistory(){ if(!confirm('Hide all history from Helper views? Admin will still see everything.')) return; pickupHistory=pickupHistory.map(h=>({...h,hideFromHelper:true})); saveState(); renderAdmin(); }
function adminMarkComplete(historyId,who){
  const i=pickupHistory.findIndex(h=>h.id===historyId); if(i<0) return;
  if(who==='helper') pickupHistory[i].helperCompleted=true;
  if(who==='needer') pickupHistory[i].neederCompleted=true;
  if(pickupHistory[i].helperCompleted&&pickupHistory[i].neederCompleted&&!pickupHistory[i].completedAt){
    pickupHistory[i].completedAt=new Date().toLocaleString();
    removeResourcePinForHistory(pickupHistory[i]);
  }
  saveState(); renderAdmin(); updateMap(); updateResourcesList(); renderHistory(); updateNavBadges();
}
window.clearNeederHistory=clearNeederHistory;
window.clearHelperHistory=clearHelperHistory;
window.adminMarkComplete=adminMarkComplete;

function renderAdmin(){
  const resEl=document.getElementById('adminResources');
  const reqEl=document.getElementById('adminRequests');
  const histEl=document.getElementById('adminHistory');
  if(!resEl||!reqEl||!histEl) return;
  resEl.innerHTML=''; reqEl.innerHTML=''; histEl.innerHTML='';

  // Posted Resources (Helpers)
  const active = getActiveHelpers();
  if(active.length){
    active.forEach(h=>{
      const info = `<strong>${escapeHtml(h.name)}</strong><br>
        <small class="muted">${escapeHtml(h.address||'')}</small><br>
        ${escapeHtml(h.resource||'')}`;
      const acts = `
        <button onclick="adminClearResource('${encodeURIComponent(h.name)}','${h.lat}','${h.lng}')">Clear Resource</button>
        ${typeof h.lat==='number'&&typeof h.lng==='number'
          ? `<button onclick="adminFocus('${h.lat}','${h.lng}')">Focus on Map</button>` : ''}`;
      resEl.appendChild(adminItemRow(info, acts));
    });
  }

  // Pickup Requests (All)
  (pickupRequests||[]).slice().reverse().forEach(r=>{
    const ch = r.cityHarvest ? ' • via City Harvest' : '';
    const acts=[
      (r.status==='requested' ? `<button onclick="adminConfirmRequest('${r.id}')">Admin Confirm</button>` : ''),
      `<button onclick="adminPrintFromRequest(${JSON.stringify(r).replace(/"/g,'&quot;')})">Print</button>`
    ].join(' ');
    const card=adminItemRow(
      `<strong>${escapeHtml(r.neederName)}</strong> → ${escapeHtml(r.helperName)} — ${escapeHtml(r.resource)}
       <br><small class="muted">${escapeHtml(r.status)} • ${escapeHtml(r.timestamp)}${ch}</small>`,
      acts
    );
    reqEl.appendChild(card);
  });

  // History
  (pickupHistory||[]).slice().reverse().forEach(h=>{
    const statusBits=[h.helperCompleted?'Helper ✅':'Helper ❌', h.neederCompleted?'Needer ✅':'Needer ❌']; if(h.completedAt) statusBits.push(`Completed • ${h.completedAt}`);
    const info = `<strong>${escapeHtml(h.neederName)}</strong> ← ${escapeHtml(h.helperName)} — ${escapeHtml(h.resource)}<br>
      <small class="muted">${escapeHtml(h.timestamp||'')}</small><br>
      <small class="muted">Status:</small> ${escapeHtml(statusBits.join(' • '))}${h.cityHarvest?`<br><small class="muted">Courier:</small> City Harvest`:''}<br>
      <small class="muted">Needer Rating:</small> ${escapeHtml(starStr(h.neederRating))} ${h.neederFeedback?`— “${escapeHtml(h.neederFeedback)}”`:''}<br>
      <small class="muted">Helper Rating:</small> ${escapeHtml(starStr(h.helperRating))} ${h.helperFeedback?`— “${escapeHtml(h.helperFeedback)}”`:''}`;
    const actions=`<button onclick="printFullRecordFromHistory(${JSON.stringify(h).replace(/"/g,'&quot;')})">Print</button>${h.helperCompleted?'':` <button onclick="adminMarkComplete('${h.id}','helper')">Mark Helper Done</button>`}${h.neederCompleted?'':` <button onclick="adminMarkComplete('${h.id}','needer')">Mark Needer Done</button>`}`;
    const card=adminItemRow(info,actions);
    histEl.appendChild(card);
  });
}

/* ---------- CSV ---------- */
function toCSVVal(v){ if(v==null) return ''; const s=String(v).replace(/"/g,'""'); return `"${s}"`; }
function downloadFile(filename, content, mime='text/csv'){
  const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function exportResourcesCSV(){
  const rows=[['Name','Address','Phone','Lat','Lng','Resources']];
  getActiveHelpers().forEach(h=>rows.push([h.name,h.address,h.phone,h.lat,h.lng,h.resource]));
  const csv=rows.map(r=>r.map(toCSVVal).join(',')).join('\n');
  downloadFile('resources.csv',csv);
}
function exportRequestsCSV(){
  const rows=[['ID','Helper','Needer','Resource','Status','Timestamp','HelperLat','HelperLng','NeederLat','NeederLng','CityHarvest']];
  (pickupRequests||[]).forEach(r=>rows.push([r.id,r.helperName,r.neederName,r.resource,r.status,r.timestamp,r.helperLat,r.helperLng,r.neederLat,r.neederLng,!!r.cityHarvest]));
  const csv=rows.map(r=>r.map(toCSVVal).join(',')).join('\n');
  downloadFile('requests.csv',csv);
}
function exportHistoryCSV(){
  const rows=[['ID','Helper','Needer','Resource','ConfirmedAt','CompletedAt','HelperCompleted','NeederCompleted','HelperRating','HelperFeedback','NeederRating','NeederFeedback','CityHarvest']];
  (pickupHistory||[]).forEach(h=>rows.push([h.id,h.helperName,h.neederName,h.resource,h.timestamp,h.completedAt||'',h.helperCompleted,h.neederCompleted,h.helperRating||'',h.helperFeedback||'',h.neederRating||'',h.neederFeedback||'',!!h.cityHarvest]));
  const csv=rows.map(r=>r.map(toCSVVal).join(',')).join('\n');
  downloadFile('history.csv',csv);
}
window.exportResourcesCSV=exportResourcesCSV;
window.exportRequestsCSV=exportRequestsCSV;
window.exportHistoryCSV=exportHistoryCSV;

/* ---------- Manage Admin ---------- */
function loadAdminAccountForm(){
  const form=document.getElementById('adminAccountForm');
  if(!form) return;
  const userField=document.getElementById('adminUserField');
  const passField=document.getElementById('adminPassField');
  const passConfirm=document.getElementById('adminPassConfirmField');
  const status=document.getElementById('adminAccountStatus');

  if(userField) userField.value=getAdminUsername();
  if(status) status.textContent='';

  form.onsubmit=(e)=>{
    e.preventDefault();
    const newUser=(userField?.value||'').trim();
    const newPass=(passField?.value||'').trim();
    const confirm=(passConfirm?.value||'').trim();

    if(!newUser){ if(status) status.textContent='Username required.'; return; }
    if(newPass && newPass!==confirm){ if(status) status.textContent='Passwords do not match.'; return; }

    adminCreds = { username:newUser, password: newPass || getAdminPassword() };
    localStorage.setItem('adminCreds', JSON.stringify(adminCreds));
    if(status) status.textContent='Saved.';
    if(passField) passField.value=''; if(passConfirm) passConfirm.value='';
  };
}

/* ---------- Bootstrap ---------- */
window.onload=()=>{
  removeCityHarvestTabsIfAny();
  const sessUser=getSessionUser();
  if(isSessionLoggedIn()&&sessUser&&sessUser.name&&sessUser.role){
    currentUser=sessUser; showApp(); initMap(); startGeoPipeline(); showSection('map');
  }else{ showAuth(); }
};

/* ---------- Post resource ---------- */
document.getElementById('resourceForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const text=document.getElementById('resourcePost')?.value.trim(); if(!text) return alert('Enter a resource.');
  if(currentUser.role!=='helper') return alert('Only helpers can post resources.');
  const lat=userLocation.lat, lng=userLocation.lng;
  let helperRecord=registeredHelpers.find(h=>h.name.toLowerCase()===currentUser.name.toLowerCase());
  if(!helperRecord){ helperRecord={name:currentUser.name,address:'Not provided',phone:'Not provided',lat,lng,resource:''}; registeredHelpers.push(helperRecord); }
  else { helperRecord.lat=lat; helperRecord.lng=lng; }

  const i=helpers.findIndex(h=>h.name.toLowerCase()===currentUser.name.toLowerCase()&&typeof h.lat==='number'&&typeof h.lng==='number'&&nearBy(h.lat,h.lng,lat,lng));
  if(i>=0){ helpers[i].resource=mergeResourceStrings(helpers[i].resource,text); helpers[i].lat=lat; helpers[i].lng=lng; }
  else { helpers.push({name:currentUser.name,address:helperRecord.address||'Not provided',phone:helperRecord.phone||'Not provided',lat,lng,resource:text}); }

  saveState(); document.getElementById('resourceForm').reset();
  alert('Resource posted (appended to your current pin if same place).');
  updateMap(); updateResourcesList(); showSection('map'); renderAdmin(); updateNavBadges();
});

/* ---------- Live sync ---------- */
window.addEventListener('storage',(e)=>{
  if(['helpers','registeredHelpers','pickupRequests','pickupHistory','notifications'].includes(e.key)){
    reloadStateFromStorage();
    if(activeSection==='map'){ updateMap(); updateResourcesList(); }
    else if(activeSection==='history'){ if(!feedbackModalOpen) renderHistory(); }
    else if(activeSection==='notifications'){ renderNotifications(); }
    renderAdmin();
    updateNavBadges();
  }
});
setInterval(()=>{
  if(!isSessionLoggedIn()) return;
  reloadStateFromStorage();
  if(activeSection==='map'){ updateMap(); updateResourcesList(); }
  if(activeSection==='history'){ if(!feedbackModalOpen) renderHistory(); }
  if(activeSection==='notifications'){ renderNotifications(); }
  if(activeSection==='admin'){ renderAdmin(); }
  updateNavBadges();
}, 3000);

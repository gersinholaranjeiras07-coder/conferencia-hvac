const V='comissionamento-1795443699';
const FILES=["./", "OrceHVAC_Prototipo_v1.html", "dxf-parser.js", "icon-192.png", "icon-512.png", "index.html", "manifest.webmanifest", "municipios-ibge.js", "orcehvac-backup.js", "orcehvac-base.js", "orcehvac-conferencia.css", "orcehvac-conferencia.js", "orcehvac-desktop-ui.js", "orcehvac-modals.js", "orcehvac-organization.js", "orcehvac-storage.js", "orcehvac-tema.css", "orcehvac.css", "orcehvac.js", "pdf.bundle.js", "pdf.worker.bundle.js", "pwa.js", "resources.js", "state-schema.js", "xlsx.full.min.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==V).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
 const q=e.request,net=fetch(q,{cache:'no-cache'}).then(r=>{if(r&&r.ok){const c=r.clone();caches.open(V).then(x=>x.put(q,c))}return r}),to=new Promise(res=>setTimeout(()=>res(null),4000));
 e.respondWith(Promise.race([net.catch(()=>null),to]).then(r=>r||caches.match(q,{ignoreSearch:true}).then(c=>c||net)))});

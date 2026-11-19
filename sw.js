const V='comissionamento-1795114629';
const FILES=["./", "OrceHVAC_Prototipo_v1.html", "dxf-parser.js", "icon-192.png", "icon-512.png", "index.html", "manifest.webmanifest", "municipios-ibge.js", "orcehvac-backup.js", "orcehvac-base.js", "orcehvac-conferencia.css", "orcehvac-conferencia.js", "orcehvac-desktop-ui.js", "orcehvac-modals.js", "orcehvac-organization.js", "orcehvac-storage.js", "orcehvac-tema.css", "orcehvac.css", "orcehvac.js", "pdf.bundle.js", "pdf.worker.bundle.js", "pwa.js", "resources.js", "state-schema.js", "xlsx.full.min.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==V).map(n=>caches.delete(n)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)))});

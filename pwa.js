(()=>{if(!('serviceWorker' in navigator)||location.protocol==='file:')return;
let had=!!navigator.serviceWorker.controller;
navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(r=>{setInterval(()=>r.update().catch(()=>{}),30*60*1000)}).catch(()=>{});
navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!had){had=true;return}
 const b=document.createElement('div');b.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#4a0d12;color:#fff;padding:12px 16px;border-radius:12px;display:flex;gap:12px;align-items:center;justify-content:space-between;font:14px system-ui';
 b.innerHTML='<span>Nova versão instalada.</span><button style="background:#c01f2f;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:600">Atualizar agora</button>';
 b.querySelector('button').onclick=()=>location.reload();document.body.append(b)});
})();
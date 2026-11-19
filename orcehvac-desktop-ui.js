(()=>{
if(!OrceStorage.desktop)return;
document.title='Comissionamento de obra';
const info=orceDesktop.info();
if(!info.initialized&&!storageIssue&&!commit(store)){storageIssue=true;toast('Não foi possível inicializar o banco de dados. Feche e reabra o aplicativo.');}
const bottom=document.querySelector('.side-bottom');
const text=[...bottom.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);if(text)text.textContent='Comissionamento '+info.version+(info.development?' · Desenvolvimento':'');
const pill=bottom.querySelector('.local-pill');pill.innerHTML='<span class="dot"></span> Banco local · SQLite';
const folder=document.createElement('button');folder.className='text-action';folder.style.cssText='color:#b0d0e0;font-size:11px;margin-top:10px;display:block';folder.textContent='Abrir pasta dos dados';folder.onclick=()=>orceDesktop.openDataFolder().then(result=>{if(result)toast(result);}).catch(e=>toast(e.message));bottom.append(folder);
function describe(node){if(node.nodeType===Node.TEXT_NODE){const updated=OrceStorage.describe(node.textContent);if(updated!==node.textContent)node.textContent=updated;}else if(node.nodeType===Node.ELEMENT_NODE&&!['SCRIPT','STYLE','TEXTAREA','INPUT'].includes(node.tagName)){for(const child of [...node.childNodes])describe(child);}}
describe(document.body);
new MutationObserver(records=>{for(const record of records){if(record.type==='childList')record.addedNodes.forEach(describe);else if(record.type==='characterData')describe(record.target);}}).observe(document.body,{childList:true,characterData:true,subtree:true});
})();

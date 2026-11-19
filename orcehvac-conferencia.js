
/* =====================================================================
   OrceHVAC — módulo Comissionamento de obra (projeto × campo)
   Cadastro manual pelo escritório, planta clicável e conferência em campo.
   Dados: pasta do aplicativo (desktop) ou IndexedDB (navegador de revisão).
   ===================================================================== */
(()=>{
'use strict';
const APP_VERSION='0.5.0';
const SCRIPT_URL=document.currentScript&&document.currentScript.src;

/* ---------- Definições de campos e categorias ---------- */
const F={
 tag:{l:'TAG / Identificação'},fabricante:{l:'Fabricante'},modelo:{l:'Modelo'},tipo:{l:'Tipo'},
 dimensoes:{l:'Dimensões (mm)',num:1},vazao:{l:'Vazão',num:1},ambiente:{l:'Ambiente'},pavimento:{l:'Pavimento'},
 quantidade:{l:'Quantidade',num:1},atuador:{l:'Atuador'},tensao:{l:'Tensão do atuador (V)',num:1},
 localizacao:{l:'Localização'},capacidade:{l:'Capacidade',num:1},potencia:{l:'Potência',num:1},
 pressao:{l:'Pressão (mca / Pa)',num:1},corrente:{l:'Corrente (A)',num:1},tensaoeq:{l:'Tensão (V)',num:1},quadro:{l:'TAG do quadro'},vazaoagua:{l:'Vazão de água (m³/h)',num:1},
 outros:{l:'Demais informações técnicas',area:1}
};
const GR_TERM={proj:['tag','pavimento','fabricante','modelo','tipo','dimensoes','vazao','ambiente','quantidade'],conf:['modelo','fabricante','tipo','dimensoes','vazao','quantidade']};
const GR_DAMP={proj:['tag','pavimento','fabricante','modelo','tipo','dimensoes','atuador','tensao','localizacao','quantidade'],conf:['modelo','fabricante','tipo','dimensoes','atuador','tensao','quantidade']};
const GR_EQ={proj:['tag','pavimento','fabricante','modelo','tipo','capacidade','potencia','vazao','pressao','corrente','tensaoeq','quadro','localizacao','outros'],conf:['fabricante','modelo','tipo','capacidade','potencia','vazao','pressao','corrente','tensaoeq','quadro']};
const GR_FC={proj:['tag','pavimento','fabricante','modelo','tipo','capacidade','potencia','vazao','vazaoagua','corrente','tensaoeq','quadro','localizacao','outros'],conf:['fabricante','modelo','tipo','capacidade','potencia','vazao','vazaoagua','corrente','tensaoeq','quadro']};
const CATS={
 bomba:{l:'Bomba',s:'B',...GR_EQ},chiller:{l:'Chiller',s:'CH',...GR_EQ},
 fancolete:{l:'Fancolete',s:'FL',...GR_FC},fancoil:{l:'Fancoil',s:'FC',...GR_FC},
 difusor:{l:'Difusor',s:'D',...GR_TERM},grelha:{l:'Grelha',s:'G',...GR_TERM},
 damper:{l:'Damper',s:'DP',...GR_DAMP}
};
const ST={conferido:'Conferido',divergente:'Divergente',pendente:'Pendente',em_conferencia:'Em conferência'};
const STC={conferido:'#16a34a',divergente:'#dc2626',pendente:'#eab308',em_conferencia:'#2563eb'};
const STORDER=['conferido','divergente','pendente','em_conferencia'];
const DISCIPLINAS=['Climatização','Ar condicionado','Ventilação','Exaustão','Água gelada','Outra'];

/* ---------- Utilidades ---------- */
let root=null;
const $=(s,r=root)=>r.querySelector(s);
const $$=(s,r=root)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36);
const fdt=iso=>iso?new Date(iso).toLocaleString('pt-BR'):'';
function toast(m){if(typeof globalThis.toast==='function'&&document.getElementById('toast'))globalThis.toast(m);else alert(m)}
function download(name,content,type){const b=content instanceof Blob?content:new Blob([content],{type:type||'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
const blobToDataURL=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)});
const dataURLToBlob=async u=>{const m=/^data:([^;,]*)(;base64)?,(.*)$/s.exec(u);if(!m)throw Error('Anexo inválido.');const bin=atob(m[3]),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:m[1]})};

/* ---------- Armazenamento: arquivos na pasta do app (desktop) ou IndexedDB (navegador) ---------- */
const desk=()=>globalThis.orceDesktop&&typeof orceDesktop.conf==='function'?orceDesktop.conf:null;
let _db=null;
const idb=()=>_db||(_db=new Promise((res,rej)=>{const r=indexedDB.open('orcehvac-conferencia',1);
 r.onupgradeneeded=()=>{r.result.createObjectStore('kv');r.result.createObjectStore('blobs')};
 r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
const tx=(st,mode,fn)=>idb().then(db=>new Promise((res,rej)=>{const t=db.transaction(st,mode);const rq=fn(t.objectStore(st));t.oncomplete=()=>res(rq&&rq.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)}));
const urlCache=new Map();
async function kvGet(){const d=desk();if(d){const r=await d({action:'read-state'});return r?JSON.parse(r):null}return tx('kv','readonly',s=>s.get('state'))}
async function kvSet(k,v){const d=desk();if(d)return d({action:'write-state',json:JSON.stringify(v)});return tx('kv','readwrite',s=>s.put(v,'state'))}
async function blobGet(id){const d=desk();if(d){const r=await d({action:'blob-get',id});return r?new Blob([r.data],{type:r.mime||''}):null}return tx('blobs','readonly',s=>s.get(id))}
async function blobSet(id,b){const d=desk();if(d)return d({action:'blob-put',id,mime:b.type||'',data:new Uint8Array(await b.arrayBuffer())});return tx('blobs','readwrite',s=>s.put(b,id))}
async function blobDel(id){urlCache.delete(id);const d=desk();if(d)return d({action:'blob-del',id});return tx('blobs','readwrite',s=>s.delete(id))}
async function blobIds(){const d=desk();if(d)return d({action:'blob-list'});return idb().then(db=>new Promise((res,rej)=>{const out=[];const rq=db.transaction('blobs','readonly').objectStore('blobs').openKeyCursor();rq.onsuccess=()=>{const c=rq.result;if(c){out.push(c.key);c.continue()}else res(out)};rq.onerror=()=>rej(rq.error)}))}
async function urlFor(id){if(urlCache.has(id))return urlCache.get(id);const b=await blobGet(id);if(!b)return '';const u=URL.createObjectURL(b);urlCache.set(id,u);return u}
/* ---------- Bibliotecas locais (vendor/) carregadas sob demanda ---------- */
const libs={};
function loadVendor(name){const root=new URL('.',SCRIPT_URL);if(!libs[name])libs[name]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=new URL(name.split('/').pop(),root).href;s.onload=res;s.onerror=()=>{libs[name]=null;rej(Error('Arquivo não encontrado: vendor/'+name))};document.head.append(s)});return libs[name]}
async function ensureXlsx(){if(globalThis.XLSX)return true;try{await loadVendor('xlsx.full.min.js')}catch{return false}return !!globalThis.XLSX}
async function ensureDxf(){if(globalThis.DxfParser)return true;await loadVendor('dxf-parser.js');return !!globalThis.DxfParser}
let pdfEngine=null;
async function ensurePdf(){if(pdfEngine)return pdfEngine;
 if(!(globalThis.OrcePdfEngine&&globalThis.OrcePdfResources)){await loadVendor('pdfjs/pdf.bundle.js');await loadVendor('pdfjs/pdf.worker.bundle.js');await loadVendor('pdfjs/resources.js')}
 return pdfEngine=globalThis.OrcePdfEngine}
class LocalBinaryDataFactory{async fetch({kind,filename}){const e=globalThis.OrcePdfResources[kind+':'+filename];if(!e)throw Error('Recurso de PDF indisponível: '+filename);return Uint8Array.from(atob(e),c=>c.charCodeAt(0))}}

/* ---------- Estado ---------- */
let S={obras:[],projetos:[],plantas:[],itens:[],marcas:[],conf:{},hist:[],cfg:{},del:{}};
const ui={view:'home',obraId:'',projetoId:'',disc:'',plantaId:'',pagina:1,placing:null,atab:'cad',
 fCat:'',fStatus:'',fPlanta:'',fBusca:'',pav:'',stFilter:new Set(STORDER),catFilter:'',side:true};
let mode=localStorage.getItem('orcehvac.conf.modo')||'escritorio';
let user=localStorage.getItem('orcehvac.conf.usuario')||'';
let saveT=null;
function save(){stamp();schedSync();clearTimeout(saveT);saveT=setTimeout(()=>kvSet('state',S).catch(e=>toast('Erro ao salvar: '+e)),150)}
const by=(arr,id)=>arr.find(x=>x.id===id);
const obra=id=>by(S.obras,id),proj=id=>by(S.projetos,id),planta=id=>by(S.plantas,id),item=id=>by(S.itens,id);
function logH(acao,ent,ref,desc,mud){S.hist.unshift({id:uid(),ts:new Date().toISOString(),user:user||'(sem nome)',acao,ent,ref,desc,mud:mud||[]});if(S.hist.length>3000)S.hist.length=3000}

/* ---------- Comparação projeto × obra ---------- */
const nums=s=>(String(s).replace(/,/g,'.').match(/\d+(?:\.\d+)?/g)||[]).map(Number);
const normT=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9.]/g,'');
function same(k,a,b){a=String(a??'').trim();b=String(b??'').trim();if(!a||!b)return a===b;
 if(F[k].num){const x=nums(a),y=nums(b);if(x.length&&y.length)return x.length===y.length&&x.every((v,i)=>v===y[i])}
 return normT(a)===normT(b)}
function diverg(id){const it=item(id),c=S.conf[id];if(!it||!c)return[];
 return CATS[it.cat].conf.filter(k=>{const pv=(it.campos[k]||'').trim();return pv&&!same(k,pv,c.campos[k]||'')})}
function statusOf(id){const c=S.conf[id];if(!c)return 'pendente';if(c.estado!=='finalizada')return 'em_conferencia';return diverg(id).length?'divergente':'conferido'}
const projItens=pid=>S.itens.filter(i=>i.projetoId===pid);
function scopeItens(){let l=ui.projetoId?projItens(ui.projetoId):ui.obraId?S.itens.filter(i=>proj(i.projetoId)?.obraId===ui.obraId):[];if(ui.projetoId&&ui.pav)l=l.filter(i=>pavLabel(i)===ui.pav);return l}
function counts(list){const c={conferido:0,divergente:0,pendente:0,em_conferencia:0};list.forEach(i=>c[statusOf(i.id)]++);return c}
const PAVS=['Subsolo 2','Subsolo 1','Térreo','1º Pavimento','2º Pavimento','3º Pavimento','4º Pavimento','5º Pavimento','Cobertura','Casa de máquinas'];
function pavRank(n){const t=normT(n||'');if(!t||t==='sempavimento')return 9999;if(t.includes('sub')||/^ss/.test(t))return -(parseInt((t.match(/\d+/)||[1])[0]))-0.5+1;if(t.includes('terreo')||t==='t')return 0;
 if(t.includes('cobertura')||t.includes('cob'))return 1000;if(t.includes('barrilete')||t.includes('casademaq'))return 1001;const m=t.match(/\d+/);return m?+m[0]:500}
const pavSort=(a,b)=>pavRank(a)-pavRank(b)||a.localeCompare(b);
function pavOf(i){if(i.campos.pavimento)return i.campos.pavimento;const m=S.marcas.find(x=>x.itemId===i.id);return(m&&planta(m.plantaId)?.pav)||''}
const pavLabel=i=>pavOf(i)||'Sem pavimento';
function pavList(pid){const set=new Set();S.plantas.filter(p=>p.projetoId===pid).forEach(p=>set.add(p.pav||'Sem pavimento'));projItens(pid).forEach(i=>set.add(pavLabel(i)));return[...set].sort(pavSort)}
const marcaDe=id=>S.marcas.find(m=>m.itemId===id);
const plantasDoItem=id=>S.marcas.filter(m=>m.itemId===id).map(m=>planta(m.plantaId)?.nome).filter(Boolean);

/* ---------- Cabeçalho / navegação ---------- */
function renderTop(){
 const hasP=!!ui.projetoId,v=ui.view,off=mode==='escritorio';
 root.classList.toggle('office',off);
 $('#cfHead').innerHTML=`<div><div class="eyebrow">Obra e campo</div><h1>Comissionamento de obra</h1><p>${off?'Modo escritório: cadastre equipamentos, terminais, plantas e posicione os pontos.':'Modo campo: abra a planta, toque no ponto e registre o que foi instalado.'}</p></div>
  <div class="cf-tools"><button class="btn sec" data-act="user" title="Responsável pela conferência">👤 ${esc(user||'Definir nome')}</button>
  <div class="seg"><button data-act="mode" data-v="campo" class="${mode==='campo'?'on':''}">Campo</button><button data-act="mode" data-v="escritorio" class="${mode==='escritorio'?'on':''}">Escritório</button></div></div>`;
 $('#cfNav').innerHTML=`<button data-act="nav" data-v="home" class="${v==='home'||v==='plant'?'active':''}">Início</button>
  ${hasP?`<button data-act="nav" data-v="itens" class="${v==='itens'?'active':''}">Itens</button><button data-act="nav" data-v="report" class="${v==='report'?'active':''}">Relatório</button>`:''}
  ${off?`<button data-act="nav" data-v="admin" class="${v==='admin'?'active':''}">Administração</button>`:''}`;
}
function renderKpi(){
 const el=$('#cfKpi');
 if(!ui.obraId||ui.view==='admin'){el.className='';el.innerHTML='';return}
 const list=scopeItens(),c=counts(list),t=list.length,done=c.conferido+c.divergente,pct=t?Math.round(done/t*100):0;
 const nm=ui.projetoId?`${obra(ui.obraId)?.nome} › ${proj(ui.projetoId)?.nome}${ui.pav?' › '+ui.pav:''}`:`${obra(ui.obraId)?.nome} (todos os projetos)`;
 const seg=k=>t?`<i style="width:${c[k]/t*100}%;background:${STC[k]}"></i>`:'';
 el.className='show';
 el.innerHTML=`<div class="sc">${esc(nm)}</div><div class="kpis">
  <div class="kpi"><b>${t}</b><span>Itens cadastrados</span></div>
  <div class="kpi k-conferido"><b>${c.conferido}</b><span>Conferidos</span></div>
  <div class="kpi k-divergente"><b>${c.divergente}</b><span>Divergentes</span></div>
  <div class="kpi k-pendente"><b>${c.pendente}</b><span>Pendentes</span></div>
  <div class="kpi k-em_conferencia"><b>${c.em_conferencia}</b><span>Em conferência</span></div>
  <div class="kpi k-pct"><b>${pct}%</b><span>Conclusão (conferidos + divergentes)</span><div class="cfbar">${STORDER.map(seg).join('')}</div></div></div>`;
}
function render(){
 if(!root)return;
 renderTop();renderKpi();
 const m=$('#cfMain');m.className=ui.view==='plant'?'flush':'';
 ({home:viewHome,plant:viewPlant,itens:viewItens,report:viewReport,admin:viewAdmin})[ui.view]();
}

/* ---------- Modal helpers ---------- */
function openModal(html,wide){$('#cfModal').innerHTML=`<div class="mbox ${wide?'wide':''}">${html}</div>`;$('#cfModal').onclick=e=>{if(e.target.id==='cfModal')closeModal()}}
function closeModal(){$('#cfModal').innerHTML='';modalCleanup&&modalCleanup();modalCleanup=null}
let modalCleanup=null;
function fieldHTML(f){const v=f.value??'';const id='f_'+f.k;
 let inp;
 if(f.type==='select')inp=`<select id="${id}" ${f.chg?`data-chg="${f.chg}"`:''}>${f.options.map(o=>`<option value="${esc(o.v)}" ${o.v===v?'selected':''}>${esc(o.t)}</option>`).join('')}</select>`;
 else if(f.type==='textarea')inp=`<textarea id="${id}">${esc(v)}</textarea>`;
 else if(f.type==='file')inp=`<input id="${id}" type="file" accept="${f.accept||''}">`;
 else inp=`<input id="${id}" type="text" value="${esc(v)}" ${f.list?`list="dl_${f.k}"`:''}>${f.list?`<datalist id="dl_${f.k}">${f.list.map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`:''}`;
 return `<div class="fld"><label for="${id}">${esc(f.l)}</label>${inp}</div>`}
function formModal(title,fields,onOk,okLabel){
 openModal(`<h3>${esc(title)}</h3><div id="ff">${fields.map(fieldHTML).join('')}</div><div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" id="fok">${okLabel||'Salvar'}</button></div>`);
 setTimeout(()=>{if(!$('#ff')?.contains(document.activeElement))$('#ff input,#ff select')?.focus()},30);
 $('#fok').onclick=async()=>{const v={};fields.forEach(f=>{const e=$('#f_'+f.k);v[f.k]=f.type==='file'?e.files[0]:e.value.trim()});
  if(await onOk(v)!==false)closeModal()}}

/* ---------- Eventos globais ---------- */
const ACT={},CHG={};
function bindRoot(){
 root.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&ACT[b.dataset.act]){ACT[b.dataset.act](b,e)}});
 root.addEventListener('change',e=>{const b=e.target.closest('[data-chg]');if(b&&CHG[b.dataset.chg])CHG[b.dataset.chg](b,e)});
 root.addEventListener('input',e=>onSearchInput(e));
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root&&root.isConnected){if($('#cfModal').innerHTML)closeModal();else if(ui.placing){ui.placing=null;viewerUpdate()}}});
ACT.closeModal=()=>closeModal();
ACT.nav=b=>{ui.view=b.dataset.v;closeModal();render()};
ACT.mode=b=>{mode=b.dataset.v;localStorage.setItem('orcehvac.conf.modo',mode);if(mode==='campo'&&ui.view==='admin')ui.view='home';ui.placing=null;render()};
function askName(){return new Promise(res=>{
 openModal(`<h3>Responsável pela conferência</h3><div class="fld"><label for="f_nome">Seu nome</label><input id="f_nome" type="text" value="${esc(user)}" autocomplete="off"></div><div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" id="nmOk">Salvar</button></div>`);
 setTimeout(()=>$('#f_nome')?.focus(),30);
 const ok=()=>{const n=$('#f_nome').value.trim();if(!n)return;user=n;localStorage.setItem('orcehvac.conf.usuario',user);modalCleanup=null;closeModal();renderTop();res(true)};
 $('#nmOk').onclick=ok;$('#f_nome').onkeydown=e=>{if(e.key==='Enter')ok()};modalCleanup=()=>res(false)})}
ACT.user=()=>{askName()};
async function needUser(){return user?true:askName()}

/* =====================================================================
   TELA INICIAL — seleção de obra / projeto / disciplina / planta
   ===================================================================== */
function viewHome(){
 const obras=S.obras,projs=S.projetos.filter(p=>p.obraId===ui.obraId);
 const pls=S.plantas.filter(p=>p.projetoId===ui.projetoId);
 const discs=[...new Set(pls.map(p=>p.disc||'Sem disciplina'))];
 const pavs=ui.projetoId?pavList(ui.projetoId):[];
 const plsF=pls.filter(p=>(!ui.disc||(p.disc||'Sem disciplina')===ui.disc)&&(!ui.pav||(p.pav||'Sem pavimento')===ui.pav)).sort((a,b)=>pavSort(a.pav||'',b.pav||'')||a.nome.localeCompare(b.nome));
 const opt=(arr,sel,ph,fn)=>`<option value="">${ph}</option>`+arr.map(x=>`<option value="${esc(x.id??x)}" ${(x.id??x)===sel?'selected':''}>${esc(fn(x))}</option>`).join('');
 let h=`<div class="card"><h2>Selecione o que deseja consultar</h2>
 <div class="row">
  <div><label>Obra</label><select data-chg="selObra">${opt(obras,ui.obraId,'— escolha a obra —',x=>x.nome)}</select></div>
  <div><label>Projeto</label><select data-chg="selProj" ${ui.obraId?'':'disabled'}>${opt(projs,ui.projetoId,'— escolha o projeto —',x=>x.nome)}</select></div>
  <div><label>Pavimento</label><select data-chg="selPav" ${ui.projetoId?'':'disabled'}>${opt(pavs,ui.pav,'Todos',x=>x)}</select></div>
  <div><label>Disciplina / categoria</label><select data-chg="selDisc" ${ui.projetoId?'':'disabled'}>${opt(discs,ui.disc,'Todas',x=>x)}</select></div>
  <div><label>Planta</label><select data-chg="selPlanta" ${ui.projetoId?'':'disabled'}>${opt(plsF,ui.plantaId,'— escolha a planta —',x=>x.nome)}</select></div>
 </div>
 <div class="row" style="margin-top:12px">
  <button class="btn big" data-act="abrirPlanta" ${ui.plantaId?'':'disabled'} style="flex:none">📐 Abrir planta</button>
  <button class="btn sec big" data-act="nav" data-v="itens" ${ui.projetoId?'':'disabled'} style="flex:none">📋 Lista de itens</button>
  <button class="btn sec big" data-act="nav" data-v="report" ${ui.projetoId?'':'disabled'} style="flex:none">🧾 Relatório</button>
 </div></div>`;
 if(!obras.length)h+=`<div class="card"><b>Nenhuma obra cadastrada ainda.</b><p class="muted">O escritório cadastra obras, projetos, plantas e equipamentos na área <b>Administração</b> (modo Escritório). Se o escritório lhe enviou um arquivo de projeto, importe-o em Administração › Backup.</p><button class="btn" data-act="mode" data-v="escritorio">Ir para o modo Escritório</button></div>`;
 if(ui.projetoId){
  const allI=projItens(ui.projetoId);
  h+=`<div class="card"><h3>Andamento por pavimento</h3><div style="overflow:auto"><table><thead><tr><th>Pavimento</th><th>Itens</th><th>Conferidos</th><th>Divergentes</th><th>Pendentes</th><th>Em conf.</th><th style="min-width:140px">Conclusão</th></tr></thead><tbody>
  ${pavs.map(pv=>{const l=allI.filter(i=>pavLabel(i)===pv),c=counts(l),t=l.length,pc=t?Math.round((c.conferido+c.divergente)/t*100):0;
   return `<tr class="click ${pv===ui.pav?'sel':''}" data-act="selPav" data-v="${esc(pv)}"><td><b>${esc(pv)}</b></td><td>${t}</td><td>${c.conferido}</td><td>${c.divergente}</td><td>${c.pendente}</td><td>${c.em_conferencia}</td><td>${pc}%<div class="cfbar">${STORDER.map(k=>t?`<i style="width:${c[k]/t*100}%;background:${STC[k]}"></i>`:'').join('')}</div></td></tr>`}).join('')||'<tr><td colspan="7" class="muted">Sem itens ou plantas.</td></tr>'}</tbody></table></div>
  <p class="muted" style="margin:6px 0 0">Clique em um pavimento para filtrar plantas, itens, indicadores e relatório.${ui.pav?' <a href="#" data-act="selPav" data-v="">Limpar filtro</a>':''}</p></div>`;
  h+=`<div class="card"><h3>Plantas do projeto${ui.pav?' — '+esc(ui.pav):''}</h3>`;
  if(!plsF.length)h+=`<p class="muted">Nenhuma planta cadastrada${ui.disc||ui.pav?' com esses filtros':''}.</p>`;
  let lastPav=null;
  h+=plsF.map(p=>{const ids=S.marcas.filter(m=>m.plantaId===p.id).map(m=>m.itemId);const c=counts(ids.map(item).filter(Boolean));const t=ids.length;const pv=p.pav||'Sem pavimento';
   const head=pv!==lastPav?`<h4 style="margin:12px 0 6px;color:var(--mut)">${esc(pv)}</h4>`:'';lastPav=pv;
   return head+`<div class="pcard" style="display:inline-block;width:240px;margin:0 8px 8px 0;vertical-align:top" data-act="openP" data-id="${p.id}"><b>${esc(p.nome)}</b><div class="muted">${esc(p.disc||'Sem disciplina')} · ${t} ponto(s)</div>
   <div class="cfbar">${STORDER.map(k=>t?`<i style="width:${c[k]/t*100}%;background:${STC[k]}"></i>`:'').join('')}</div></div>`}).join('')+'</div>';
 }
 $('#cfMain').innerHTML=h;
}
CHG.selObra=b=>{ui.obraId=b.value;ui.projetoId='';ui.pav='';ui.disc='';ui.plantaId='';render()};
CHG.selProj=b=>{ui.projetoId=b.value;ui.pav='';ui.disc='';ui.plantaId='';render()};
CHG.selPav=b=>{ui.pav=b.value;ui.plantaId='';render()};
ACT.selPav=(b,e)=>{e.preventDefault();ui.pav=b.dataset.v;ui.plantaId='';render()};
CHG.selDisc=b=>{ui.disc=b.value;ui.plantaId='';render()};
CHG.selPlanta=b=>{ui.plantaId=b.value;render()};
ACT.abrirPlanta=()=>openPlanta(ui.plantaId);
ACT.openP=b=>openPlanta(b.dataset.id);
function openPlanta(id,pagina){ui.plantaId=id;ui.pagina=pagina||1;ui.view='plant';ui.placing=null;render()}

/* =====================================================================
   VISUALIZADOR DE PLANTA (zoom, pan, páginas, marcadores clicáveis)
   ===================================================================== */
const docCache={};let V=null,renderTok=0;
function viewPlant(){
 const p=planta(ui.plantaId);if(!p){ui.view='home';return render()}
 const office=mode==='escritorio';
 $('#cfMain').innerHTML=`<div class="pv"><div class="tb noprint" id="tb"></div>
  <div class="pvbody"><div id="vp" class="${ui.placing?'placing':''}"><div id="stage"><canvas id="cv"></canvas><div id="mks"></div></div>
  <div id="loading" style="position:absolute;left:14px;top:14px;background:#fff;padding:6px 10px;border-radius:8px">Carregando planta…</div></div>
  <aside id="side" class="${ui.side?'':'hide'}"></aside></div></div>`;
 V={p,z:1,tx:0,ty:0,W:1000,H:700,pts:new Map(),drag:null,pages:p.paginas||1};
 setupPointer();viewerUpdate();loadPage();
}
async function loadPage(){
 const tok=++renderTok,p=V.p,cv=$('#cv');if(!cv)return;
 try{
  const blob=await blobGet(p.blobId);if(!blob)throw new Error('Arquivo da planta não encontrado no banco local. Reimporte o projeto.');
  let w,h;const ctx=cv.getContext('2d');
  if(p.tipo==='pdf'){
   const eng=await ensurePdf();
   if(!docCache[p.id])docCache[p.id]=await eng.getDocument({data:new Uint8Array(await blob.arrayBuffer()),BinaryDataFactory:LocalBinaryDataFactory,useWorkerFetch:false,isEvalSupported:false,useSystemFonts:true,enableXfa:false}).promise;
   const doc=docCache[p.id];V.pages=doc.numPages;if(p.paginas!==doc.numPages){p.paginas=doc.numPages;save()}
   if(ui.pagina>doc.numPages)ui.pagina=1;
   const pg=await doc.getPage(ui.pagina),v0=pg.getViewport({scale:1}),sc=Math.min(4,3600/v0.width),vw=pg.getViewport({scale:sc});
   if(tok!==renderTok)return;
   cv.width=Math.round(vw.width);cv.height=Math.round(vw.height);w=v0.width;h=v0.height;
   await pg.render({canvasContext:ctx,viewport:vw,background:'rgb(255,255,255)'}).promise;
  }else if(p.tipo==='dxf'){
   await ensureDxf();
   if(!docCache[p.id])docCache[p.id]=dxfPrepare(await readText(blob));
   const d=docCache[p.id];const sc=Math.min(3600/d.w,3600/d.h,1e9);
   cv.width=Math.max(50,Math.round(d.w*sc));cv.height=Math.max(50,Math.round(d.h*sc));
   dxfDraw(d,cv);w=d.w;h=d.h;
  }else{
   const img=new Image();img.src=await urlFor(p.blobId);await img.decode();
   if(tok!==renderTok)return;
   const sc=Math.min(1,4000/img.naturalWidth);cv.width=Math.round(img.naturalWidth*sc);cv.height=Math.round(img.naturalHeight*sc);
   ctx.drawImage(img,0,0,cv.width,cv.height);w=img.naturalWidth;h=img.naturalHeight;
  }
  if(tok!==renderTok)return;
  V.H=V.W*h/w;const st=$('#stage');st.style.width=V.W+'px';st.style.height=V.H+'px';
  $('#loading')?.remove();fitView();viewerUpdate();
 }catch(e){const l=$('#loading');if(l)l.textContent='Erro ao abrir a planta: '+e.message}
}
function fitView(){const vp=$('#vp');if(!vp)return;const r=vp.getBoundingClientRect();
 V.z=Math.min(r.width/V.W,r.height/V.H)*.97;V.tx=(r.width-V.W*V.z)/2;V.ty=(r.height-V.H*V.z)/2;applyT()}
function applyT(){const st=$('#stage');if(!st)return;st.style.transform=`translate(${V.tx}px,${V.ty}px) scale(${V.z})`;st.style.setProperty('--inv',(1/V.z).toFixed(4))}
function zoomAt(f,cx,cy){const vp=$('#vp').getBoundingClientRect();cx??=vp.width/2;cy??=vp.height/2;
 const nz=Math.max(.05,Math.min(25,V.z*f));f=nz/V.z;V.tx=cx-(cx-V.tx)*f;V.ty=cy-(cy-V.ty)*f;V.z=nz;applyT()}
function centerOn(nx,ny){const r=$('#vp').getBoundingClientRect();V.z=Math.max(V.z,Math.min(r.width/V.W*3,6));V.tx=r.width/2-nx*V.W*V.z;V.ty=r.height/2-ny*V.H*V.z;applyT()}
function setupPointer(){
 const vp=$('#vp');
 vp.addEventListener('wheel',e=>{e.preventDefault();const r=vp.getBoundingClientRect();zoomAt(e.deltaY<0?1.15:1/1.15,e.clientX-r.left,e.clientY-r.top)},{passive:false});
 vp.addEventListener('pointerdown',e=>{
  vp.setPointerCapture(e.pointerId);V.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(V.pts.size===1){const mk=e.target.closest('.mk');V.drag={sx:e.clientX,sy:e.clientY,tx:V.tx,ty:V.ty,moved:false,mk:mk?mk.dataset.id:null}}
  else if(V.pts.size===2){const [a,b]=[...V.pts.values()];V.pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:V.z};if(V.drag)V.drag.moved=true}
 });
 vp.addEventListener('pointermove',e=>{
  if(!V.pts.has(e.pointerId))return;V.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const r=vp.getBoundingClientRect();
  if(V.pts.size===2&&V.pinch){const [a,b]=[...V.pts.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);zoomAt(V.pinch.z*d/V.pinch.d/V.z,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);return}
  const d=V.drag;if(!d)return;const dx=e.clientX-d.sx,dy=e.clientY-d.sy;
  if(!d.moved&&Math.hypot(dx,dy)>6){d.moved=true;vp.classList.add('drag')}
  if(!d.moved)return;
  if(d.mk&&mode==='escritorio'){const nm=normCoords(e);const el=$(`.mk[data-id="${d.mk}"]`);if(el&&nm){el.style.left=nm.x*100+'%';el.style.top=nm.y*100+'%';d.pos=nm}}
  else{V.tx=d.tx+dx;V.ty=d.ty+dy;applyT()}
 });
 const up=e=>{
  if(!V.pts.has(e.pointerId))return;V.pts.delete(e.pointerId);vp.classList.remove('drag');
  if(V.pts.size<2)V.pinch=null;
  const d=V.drag;if(V.pts.size>0||!d)return;V.drag=null;
  if(!d.moved){ if(d.mk)markerClick(d.mk); else if(ui.placing){const nm=normCoords(e);if(nm)placeMarker(ui.placing,nm.x,nm.y)} }
  else if(d.mk&&d.pos&&mode==='escritorio'){const m=marcaDe(d.mk);if(m){m.x=d.pos.x;m.y=d.pos.y;save();logH('editou','marcador',d.mk,`Moveu o ponto de ${item(d.mk)?.campos.tag} na planta ${V.p.nome}`)}}
 };
 vp.addEventListener('pointerup',up);vp.addEventListener('pointercancel',up);
}
function normCoords(e){const r=$('#stage').getBoundingClientRect();const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;return(x<0||y<0||x>1||y>1)?null:{x,y}}
function placeMarker(itemId,x,y){
 let m=marcaDe(itemId);const it=item(itemId);
 if(m){m.plantaId=V.p.id;m.pagina=ui.pagina;m.x=x;m.y=y}else S.marcas.push({id:uid(),itemId,plantaId:V.p.id,pagina:ui.pagina,x,y});
 if(!it.campos.pavimento&&V.p.pav)it.campos.pavimento=V.p.pav;
 logH('editou','marcador',itemId,`Posicionou ${it.campos.tag} na planta ${V.p.nome} (pág. ${ui.pagina})`);
 ui.placing=null;save();viewerUpdate();renderKpi();toast('Ponto posicionado: '+it.campos.tag)}
function markerClick(id){
 if(mode==='campo')return openConf(id);
 const it=item(id);
 openModal(`<h3>${esc(it.campos.tag)} <span class="chip s-${statusOf(id)}">${ST[statusOf(id)]}</span></h3><p class="muted">${CATS[it.cat].l}</p>
 <div class="mfoot" style="justify-content:flex-start"><button class="btn sec" data-act="mkEdit" data-id="${id}">✎ Editar cadastro</button><button class="btn sec" data-act="mkConf" data-id="${id}">Ver conferência</button><button class="btn red" data-act="mkDel" data-id="${id}">Remover ponto</button><button class="btn sec" data-act="closeModal">Fechar</button></div>`);
}
ACT.mkEdit=b=>{closeModal();itemForm(b.dataset.id)};
ACT.mkConf=b=>{closeModal();openConf(b.dataset.id)};
ACT.mkDel=b=>{const id=b.dataset.id;S.marcas=S.marcas.filter(m=>m.itemId!==id);logH('editou','marcador',id,`Removeu o ponto de ${item(id)?.campos.tag}`);save();closeModal();viewerUpdate();renderKpi()};
function viewerUpdate(){
 if(!V||!$('#tb'))return;
 const office=mode==='escritorio',p=V.p;
 const marks=S.marcas.filter(m=>m.plantaId===p.id&&item(m.itemId));
 const here=marks.filter(m=>(m.pagina||1)===ui.pagina);
 const cnt=counts(marks.map(m=>item(m.itemId)));
 // toolbar
 $('#tb').innerHTML=`<button class="btn sec sm" data-act="nav" data-v="home">← Plantas</button><b>${esc(p.nome)}</b><span class="muted">${esc([p.pav,p.disc].filter(Boolean).join(' · '))}</span>
  ${V.pages>1?`<button class="btn sec sm" data-act="pg" data-d="-1">‹</button><span>Pág. ${ui.pagina}/${V.pages}</span><button class="btn sec sm" data-act="pg" data-d="1">›</button>`:''}
  <button class="btn sec sm" data-act="zm" data-f="0.8">−</button><button class="btn sec sm" data-act="zm" data-f="fit">Ajustar</button><button class="btn sec sm" data-act="zm" data-f="1.25">+</button>
  <span class="sp"></span>
  ${STORDER.map(k=>`<span class="chip s-${k} fchip ${ui.stFilter.has(k)?'on':''}" data-act="stf" data-k="${k}" title="Mostrar/ocultar">${ST[k]} ${cnt[k]}</span>`).join('')}
  <select data-chg="catF"><option value="">Todas as categorias</option>${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${ui.catFilter===k?'selected':''}>${c.l}</option>`).join('')}</select>
  <button class="btn sec sm" data-act="sideT">☰ Lista</button>`;
 // marcadores
 const vis=here.filter(m=>{const it=item(m.itemId);return ui.stFilter.has(statusOf(it.id))&&(!ui.catFilter||it.cat===ui.catFilter)});
 const mk=$('#mks');if(mk)mk.innerHTML=vis.map(m=>{const it=item(m.itemId),s=statusOf(it.id);
  return `<div class="mk ${office?'office-drag':''}" data-id="${it.id}" style="left:${m.x*100}%;top:${m.y*100}%" title="${esc(it.campos.tag)} — ${ST[s]}"><i class="s-${s}">${CATS[it.cat].s}</i><b>${esc(it.campos.tag)}</b></div>`}).join('');
 $('#vp')?.classList.toggle('placing',!!ui.placing);
 // lateral
 const row=it=>{const s=statusOf(it.id);return `<div class="si" data-act="goItem" data-id="${it.id}"><span class="cfdot" style="background:${STC[s]}"></span><b>${esc(it.campos.tag)}</b><span class="muted">${CATS[it.cat].l}</span></div>`};
 let sd='';
 if(ui.placing){const it=item(ui.placing);sd+=`<div class="banner">Clique na planta para posicionar <b>${esc(it.campos.tag)}</b>. <a href="#" data-act="cancelPlace">Cancelar (Esc)</a></div>`}
 sd+=`<h4>Itens nesta planta (${marks.length})</h4>`+(marks.length?marks.map(m=>row(item(m.itemId))).join(''):'<div class="muted">Nenhum ponto posicionado.</div>');
 if(office){
  const un=projItens(p.projetoId).filter(i=>!marcaDe(i.id));
  const el=projItens(p.projetoId).filter(i=>{const m=marcaDe(i.id);return m&&m.plantaId!==p.id});
  sd+=`<h4>Sem posição (${un.length}) — clique para posicionar</h4>`+un.map(i=>`<div class="si" data-act="startPlace" data-id="${i.id}">📍 <b>${esc(i.campos.tag)}</b><span class="muted">${CATS[i.cat].l}</span></div>`).join('');
  if(el.length)sd+=`<h4>Posicionados em outra planta (${el.length})</h4>`+el.map(i=>`<div class="si" data-act="startPlace" data-id="${i.id}" title="Clique para mover para esta planta">↪ <b>${esc(i.campos.tag)}</b><span class="muted">${esc(planta(marcaDe(i.id).plantaId)?.nome||'')}</span></div>`).join('');
 }
 $('#side').innerHTML=sd;
}
ACT.pg=b=>{const n=ui.pagina+ +b.dataset.d;if(n<1||n>V.pages)return;ui.pagina=n;loadPage();viewerUpdate()};
ACT.zm=b=>{b.dataset.f==='fit'?fitView():zoomAt(+b.dataset.f)};
ACT.stf=b=>{const k=b.dataset.k;ui.stFilter.has(k)?ui.stFilter.delete(k):ui.stFilter.add(k);viewerUpdate()};
CHG.catF=b=>{ui.catFilter=b.value;viewerUpdate()};
ACT.sideT=()=>{ui.side=!ui.side;$('#side').classList.toggle('hide',!ui.side)};
ACT.startPlace=b=>{ui.placing=b.dataset.id;viewerUpdate()};
ACT.cancelPlace=(b,e)=>{e.preventDefault();ui.placing=null;viewerUpdate()};
ACT.goItem=b=>{const m=marcaDe(b.dataset.id);if(!m)return;
 const go=()=>{centerOn(m.x,m.y);setTimeout(()=>{const el=$(`.mk[data-id="${m.itemId}"]`);el?.classList.add('hl');setTimeout(()=>el?.classList.remove('hl'),2200)},50)};
 if((m.pagina||1)!==ui.pagina){ui.pagina=m.pagina||1;loadPage().then(()=>{viewerUpdate();go()})}else go()};

/* ---------- Leitor/renderizador de DXF ---------- */
async function readText(blob){const buf=await blob.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch(e){return new TextDecoder('windows-1252').decode(buf)}}
function dxfColor(c){let r=(c>>16)&255,g=(c>>8)&255,b=c&255;if(r>235&&g>235&&b>235)return '#000';
 const lum=(0.299*r+0.587*g+0.114*b)/255;if(lum>.72){r*=.55;g*=.55;b*=.55}return `rgb(${r|0},${g|0},${b|0})`}
function dxfPrepare(text){
 const dxf=new DxfParser().parseSync(text);if(!dxf)throw new Error('DXF inválido');
 const layers=dxf.tables?.layer?.layers||{},prims=[];
 const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
 const ap=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
 const arcPts=(cx,cy,r,a0,a1,n)=>{while(a1<=a0)a1+=Math.PI*2;const k=Math.max(8,Math.ceil((a1-a0)/(Math.PI*2)*n));const o=[];for(let i=0;i<=k;i++){const a=a0+(a1-a0)*i/k;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}return o};
 const bulgeSeg=(p,q,bu)=>{const th=4*Math.atan(bu),dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);if(!d)return[];const r=d/(2*Math.sin(th/2)),mx=(p.x+q.x)/2,my=(p.y+q.y)/2,h=r*Math.cos(th/2);const cx=mx-dy/d*h,cy=my+dx/d*h;let a0=Math.atan2(p.y-cy,p.x-cx);const o=[],k=Math.max(4,Math.ceil(Math.abs(th)/(Math.PI*2)*64));for(let i=1;i<k;i++){const a=a0+th*i/k;o.push({x:cx+Math.abs(r)*Math.cos(a),y:cy+Math.abs(r)*Math.sin(a)})}return o};
 const visible=e=>{const L=layers[e.layer];return!(L&&(L.visible===false||L.frozen))&&e.visible!==false};
 const colOf=(e,inh)=>{let c=e.color;if(e.colorIndex===256||c==null||e.colorIndex===0){c=layers[e.layer]?.color;if(e.colorIndex===0&&inh!=null)c=inh}return c==null?0:c};
 const emit=(pts,c,closed)=>{if(pts.length>1)prims.push({t:'l',p:pts,c,z:closed})};
 function walk(ents,m,inh,depth){
  for(const e of ents||[]){if(!visible(e))continue;const c=dxfColor(colOf(e,inh));
   try{switch(e.type){
    case 'LINE':emit(e.vertices.map(v=>ap(m,v.x,v.y)),c);break;
    case 'LWPOLYLINE':case 'POLYLINE':{const v=e.vertices||[];const pts=[];const closed=e.shape;
     for(let i=0;i<v.length;i++){const p=v[i];pts.push(ap(m,p.x,p.y));const q=v[(i+1)%v.length];if(p.bulge&&(i<v.length-1||closed))bulgeSeg(p,q,p.bulge).forEach(z=>pts.push(ap(m,z.x,z.y)))}
     if(closed&&pts.length)pts.push(pts[0]);emit(pts,c);break}
    case 'CIRCLE':emit(arcPts(e.center.x,e.center.y,e.radius,0,Math.PI*2,72).map(p=>ap(m,p[0],p[1])),c);break;
    case 'ARC':emit(arcPts(e.center.x,e.center.y,e.radius,e.startAngle,e.endAngle,72).map(p=>ap(m,p[0],p[1])),c);break;
    case 'ELLIPSE':{const mx=e.majorAxisEndPoint.x,my=e.majorAxisEndPoint.y,a=Math.hypot(mx,my),rot=Math.atan2(my,mx),b=a*e.axisRatio;const a0=e.startAngle||0;let a1=e.endAngle==null?Math.PI*2:e.endAngle;if(Math.abs(a1-a0)<1e-9)a1=a0+Math.PI*2;
     const pts=arcPts(0,0,1,a0,a1,72).map(([x,y])=>{const X=a*x,Y=b*y;return ap(m,e.center.x+X*Math.cos(rot)-Y*Math.sin(rot),e.center.y+X*Math.sin(rot)+Y*Math.cos(rot))});emit(pts,c);break}
    case 'SPLINE':{const v=(e.fitPoints&&e.fitPoints.length>1?e.fitPoints:e.controlPoints)||[];emit(v.map(p=>ap(m,p.x,p.y)),c);break}
    case 'SOLID':case '3DFACE':{const v=e.points||e.vertices||[];if(v.length>=3){const o=v.map(p=>ap(m,p.x,p.y));if(e.type==='SOLID'&&o.length===4)[o[2],o[3]]=[o[3],o[2]];o.push(o[0]);emit(o,c)}break}
    case 'LEADER':emit((e.vertices||[]).map(p=>ap(m,p.x,p.y)),c);break;
    case 'TEXT':case 'MTEXT':case 'ATTRIB':{const pos=e.startPoint||e.position;if(!pos)break;let tx=String(e.text||'');if(e.type==='MTEXT')tx=tx.replace(/\\P/g,'\n').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'');
     const h=(e.textHeight||e.height||1)*Math.hypot(m[0],m[1]);const rot=Math.atan2(m[1],m[0])+(e.rotation||0)*Math.PI/180;const [x,y]=ap(m,pos.x,pos.y);if(tx.trim())prims.push({t:'t',x,y,h,rot,s:tx,c});break}
    case 'INSERT':{if(depth>8)break;const b=dxf.blocks?.[e.name];if(!b||!b.entities)break;const bp=b.position||{x:0,y:0};
     const sx=e.xScale||1,sy=e.yScale||1,r=(e.rotation||0)*Math.PI/180,co=Math.cos(r),si=Math.sin(r);
     const cols=e.columnCount||1,rows=e.rowCount||1;
     for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
      const px=e.position.x+j*(e.columnSpacing||0),py=e.position.y+i*(e.rowSpacing||0);
      const T=[co*sx,si*sx,-si*sy,co*sy,px,py];let M=mul(m,mul(T,[1,0,0,1,-bp.x,-bp.y]));
      walk(b.entities,M,colOf(e,inh),depth+1)}break}
    case 'DIMENSION':{if(depth>8||!e.block)break;const b=dxf.blocks?.[e.block];if(b?.entities)walk(b.entities,m,null,depth+1);break}
   }}catch(err){}
  }}
 walk(dxf.entities,[1,0,0,1,0,0],null,0);
 // extensão robusta (ignora pontos isolados muito distantes)
 const xs=[],ys=[];prims.forEach(p=>{if(p.t==='l')p.p.forEach(q=>{xs.push(q[0]);ys.push(q[1])});else{xs.push(p.x);ys.push(p.y)}});
 if(!xs.length)throw new Error('O DXF não tem desenhos legíveis (linhas, polilinhas, arcos ou textos).');
 const q=(a,f)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.floor(f*(s.length-1))))]};
 let x0=q(xs,.002),x1=q(xs,.998),y0=q(ys,.002),y1=q(ys,.998);const mx=(x1-x0)*.08||1,my=(y1-y0)*.08||1;
 x0-=mx;x1+=mx;y0-=my;y1+=my;
 return{prims,x0,y0,w:x1-x0,h:y1-y0};
}
function dxfDraw(d,cv){
 const ctx=cv.getContext('2d'),sc=cv.width/d.w;ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
 ctx.lineWidth=Math.max(1.5,cv.width/1100);ctx.lineJoin='round';ctx.lineCap='round';
 const X=x=>(x-d.x0)*sc,Y=y=>cv.height-(y-d.y0)*sc;
 for(const p of d.prims){
  if(p.t==='l'){ctx.strokeStyle=p.c;ctx.beginPath();p.p.forEach((q,i)=>i?ctx.lineTo(X(q[0]),Y(q[1])):ctx.moveTo(X(q[0]),Y(q[1])));ctx.stroke()}
  else{const px=p.h*sc;if(px<3)continue;ctx.save();ctx.translate(X(p.x),Y(p.y));ctx.rotate(-p.rot);ctx.fillStyle=p.c;ctx.font=`${px}px sans-serif`;ctx.textBaseline='alphabetic';
   p.s.split('\n').forEach((ln,i)=>ctx.fillText(ln,0,i*px*1.2));ctx.restore()}
 }
}

/* =====================================================================
   CONFERÊNCIA EM CAMPO (projeto à esquerda × obra à direita)
   ===================================================================== */
async function openConf(id){
 const it=item(id);if(!it)return;const cat=CATS[it.cat];
 const c=S.conf[id];
 const d={campos:{...(c?.campos||{})},obs:c?.obs||'',fotos:[...(c?.fotos||[])],added:[],removed:[]};
 const fin=c?.estado==='finalizada';
 const pl=plantasDoItem(id).join(', ');
 const draw=async()=>{
  const urls=await Promise.all(d.fotos.map(urlFor));
  const st=statusOf(id);
  openModal(`<h3>${esc(it.campos.tag)} <span class="muted" style="font-weight:400">${cat.l}${pl?' · '+esc(pl):''}</span> <span class="chip s-${st}">${ST[st]}</span></h3>
  <div class="two">
   <div class="panel proj"><h4>📘 Informações do projeto <span class="muted">(somente leitura)</span></h4>
    ${cat.proj.map(k=>`<div class="pr"><label>${F[k].l}</label><div class="v" id="pv_${k}">${esc(it.campos[k]||'—')}</div></div>`).join('')}</div>
   <div class="panel obra"><h4>🏗 Informações encontradas na obra</h4>
    ${cat.conf.map(k=>`<div class="pr"><label>${F[k].l}</label><input type="text" data-k="${k}" id="cf_${k}" value="${esc(d.campos[k]||'')}" placeholder="${it.campos[k]?'Projeto: '+esc(it.campos[k]):''}" autocomplete="off"></div>`).join('')}
    <div class="pr"><label>Observações</label><textarea id="cf_obs">${esc(d.obs)}</textarea></div>
    <div class="pr"><label>Fotografias do equipamento instalado</label>
     <input type="file" id="cf_foto" accept="image/*" multiple capture="environment" style="display:none">
     <button class="btn sec sm" type="button" data-act="pickFoto">📷 Adicionar foto</button>
     <div class="photos">${d.fotos.map((f,i)=>`<div class="ph"><img src="${urls[i]}" data-act="bigFoto" data-u="${i}"><button data-act="rmFoto" data-i="${i}" title="Remover">×</button></div>`).join('')}</div></div>
   </div></div>
  <p class="muted" style="margin-bottom:0">${c?`Última gravação: ${fdt(c.data)} por ${esc(c.resp||'')}`:'Ainda não conferido.'}</p>
  <div class="mfoot"><button class="btn sec" data-act="confCancel">Fechar sem salvar</button><button class="btn" style="background:var(--azul)" data-act="confSave">💾 Salvar e continuar depois</button><button class="btn" style="background:var(--verde)" data-act="confFinal">✔ Finalizar conferência</button></div>`,true);
  cat.conf.forEach(k=>liveCmp(k));
  $('#cf_foto').onchange=async e=>{harvest();for(const f of e.target.files){const b=await compress(f);const bid='ph_'+uid();await blobSet(bid,b);d.fotos.push(bid);d.added.push(bid)}draw()};
 };
 const harvest=()=>{cat.conf.forEach(k=>{const e=$('#cf_'+k);if(e)d.campos[k]=e.value.trim()});const o=$('#cf_obs');if(o)d.obs=o.value};
 const liveCmp=k=>{const e=$('#cf_'+k),v=$('#pv_'+k);if(!e||!v)return;const pv=(it.campos[k]||'').trim(),fv=e.value.trim();
  const cls=!pv||!fv?'':same(k,pv,fv)?'ok':'bad';e.className=cls;v.className='v '+cls};
 const done=async(final)=>{
  harvest();
  if(!await needUser()){toast('Informe seu nome para salvar a conferência');return}
  if(final){
   const empt=cat.conf.filter(k=>(it.campos[k]||'').trim()&&!(d.campos[k]||'').trim());
   if(empt.length&&!confirm('Campos sem preenchimento serão considerados DIVERGENTES:\n- '+empt.map(k=>F[k].l).join('\n- ')+'\n\nFinalizar mesmo assim?'))return;
  }
  d.removed.forEach(blobDel);
  S.conf[id]={campos:d.campos,obs:d.obs,fotos:d.fotos,estado:final?'finalizada':'rascunho',resp:user,data:new Date().toISOString()};
  logH('conferiu','conferencia',id,`${final?'Finalizou':'Salvou rascunho da'} conferência de ${it.campos.tag}`);
  save();modalCleanup=null;closeModal();refreshAfterConf();
  const s=statusOf(id);toast(final?(s==='divergente'?'⚠ Divergência identificada em '+it.campos.tag:'✔ '+it.campos.tag+' conferido'):'Rascunho salvo');
 };
 ACT.confSave=()=>done(false);ACT.confFinal=()=>done(true);
 ACT.confCancel=()=>{d.added.forEach(blobDel);modalCleanup=null;closeModal()};
 ACT.pickFoto=()=>$('#cf_foto').click();
 ACT.rmFoto=b=>{harvest();const i=+b.dataset.i;const [x]=d.fotos.splice(i,1);if(d.added.includes(x)){blobDel(x);d.added=d.added.filter(a=>a!==x)}else d.removed.push(x);draw()};
 ACT.bigFoto=async b=>{const u=await urlFor(d.fotos[+b.dataset.u]);const lb=document.createElement('div');lb.className='cf-lightbox';lb.innerHTML=`<img src="${u}" alt="">`;lb.onclick=()=>lb.remove();root.append(lb)};
 await draw();
 // delegação de input precisa sobreviver ao re-render do modal: registrar no container fixo
 $('#cfModal').oninput=e=>{const k=e.target.dataset?.k;if(k)liveCmp(k)};
}
function refreshAfterConf(){renderKpi();if(ui.view==='plant')viewerUpdate();else render()}
async function compress(file){const bmp=await createImageBitmap(file).catch(()=>null);if(!bmp)return file;
 const s=Math.min(1,1400/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);
 c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);return new Promise(r=>c.toBlob(b=>r(b||file),'image/jpeg',.8))}

/* =====================================================================
   LISTA DE ITENS (conferência + cadastro no modo Escritório)
   ===================================================================== */
function filteredItens(){
 return projItens(ui.projetoId).filter(i=>{
  if(ui.fCat&&i.cat!==ui.fCat)return false;
  if(ui.pav&&pavLabel(i)!==ui.pav)return false;
  if(ui.fStatus&&statusOf(i.id)!==ui.fStatus)return false;
  if(ui.fPlanta){const m=S.marcas.filter(m=>m.itemId===i.id);if(ui.fPlanta==='_none'?m.length:!m.some(x=>x.plantaId===ui.fPlanta))return false}
  if(ui.fBusca){const q=normT(ui.fBusca);if(!normT(Object.values(i.campos).join(' ')+CATS[i.cat].l).includes(q))return false}
  return true});
}
function filtersHTML(){
 const pls=S.plantas.filter(p=>p.projetoId===ui.projetoId);
 return `<div class="row noprint"><div><label>Busca</label><input type="search" id="fBusca" value="${esc(ui.fBusca)}" placeholder="TAG, modelo, ambiente…"></div>
 <div><label>Categoria</label><select data-chg="fCat"><option value="">Todas</option>${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${ui.fCat===k?'selected':''}>${c.l}</option>`).join('')}</select></div>
 <div><label>Pavimento</label><select data-chg="selPav"><option value="">Todos</option>${pavList(ui.projetoId).map(x=>`<option value="${esc(x)}" ${ui.pav===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
 <div><label>Planta</label><select data-chg="fPlanta"><option value="">Todas</option><option value="_none" ${ui.fPlanta==='_none'?'selected':''}>Sem ponto em planta</option>${pls.map(p=>`<option value="${p.id}" ${ui.fPlanta===p.id?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></div>
 <div><label>Status</label><select data-chg="fStatus"><option value="">Todos</option>${STORDER.map(k=>`<option value="${k}" ${ui.fStatus===k?'selected':''}>${ST[k]}</option>`).join('')}</select></div></div>`}
CHG.fCat=b=>{ui.fCat=b.value;render()};CHG.fPlanta=b=>{ui.fPlanta=b.value;render()};CHG.fStatus=b=>{ui.fStatus=b.value;render()};
const onSearchInput=e=>{if(e.target.id==='fBusca'){ui.fBusca=e.target.value;clearTimeout(viewItens.t);viewItens.t=setTimeout(()=>{const pos=e.target.selectionStart;render();const n=$('#fBusca');if(n){n.focus();n.setSelectionRange(pos,pos)}},250)}};
function viewItens(){
 if(!ui.projetoId){ui.view='home';return render()}
 const office=mode==='escritorio',list=filteredItens();
 $('#cfMain').innerHTML=`<div class="card"><div class="row" style="align-items:center"><h2 style="flex:3;margin:0">Itens do projeto — ${esc(proj(ui.projetoId).nome)}</h2>
  ${office?`<button class="btn" data-act="newItem" style="flex:none">+ Novo item</button><button class="btn sec" data-act="csvImp" style="flex:none">⬆ Importar Excel / CSV</button><button class="btn sec" data-act="csvTpl" style="flex:none">⬇ Modelo Excel</button><input type="file" id="csvF" accept=".xlsx,.xls,.xlsm,.csv,text/csv" style="display:none">`:''}</div>
  <div style="margin-top:10px">${filtersHTML()}</div></div>
  <div class="card" style="padding:0;overflow:auto"><table><thead><tr><th>Status</th><th>TAG</th><th>Pavimento</th><th>Categoria</th><th>Modelo</th><th>Local</th><th>Planta(s)</th><th></th></tr></thead><tbody>
  ${list.map(i=>{const s=statusOf(i.id);return `<tr class="click" data-act="openConfRow" data-id="${i.id}"><td><span class="chip s-${s}">${ST[s]}</span></td><td><b>${esc(i.campos.tag)}</b></td><td>${esc(pavLabel(i))}</td><td>${CATS[i.cat].l}</td><td>${esc(i.campos.modelo||'')}</td><td>${esc(i.campos.ambiente||i.campos.localizacao||'')}</td><td>${esc(plantasDoItem(i.id).join(', ')||'— sem ponto —')}</td>
   <td style="white-space:nowrap">${office?`<button class="btn sec sm" data-act="editItem" data-id="${i.id}">✎</button> <button class="btn sec sm" data-act="histItem" data-id="${i.id}" title="Histórico">🕘</button> <button class="btn red sm" data-act="delItem" data-id="${i.id}">🗑</button>`:'<span class="muted">Conferir ›</span>'}</td></tr>`}).join('')||`<tr><td colspan="8" class="muted">Nenhum item${S.itens.length?' com esses filtros':' cadastrado'}.</td></tr>`}
  </tbody></table></div>`;
 const f=$('#csvF');if(f)f.onchange=()=>{importPlanilha(f.files[0]);f.value=''};
}
ACT.openConfRow=(b,e)=>{if(e.target.closest('button'))return;openConf(b.dataset.id)};
ACT.newItem=()=>itemForm();
ACT.editItem=b=>itemForm(b.dataset.id);
ACT.delItem=b=>{const it=item(b.dataset.id);if(!confirm(`Excluir ${it.campos.tag}? A conferência e o ponto na planta também serão removidos.`))return;delItemById(it.id);save();render()};
function delItemById(id){const it=item(id);(S.conf[id]?.fotos||[]).forEach(blobDel);delete S.conf[id];S.marcas=S.marcas.filter(m=>m.itemId!==id);S.itens=S.itens.filter(i=>i.id!==id);logH('excluiu','item',id,`Excluiu ${it.campos.tag} (${CATS[it.cat].l})`,Object.entries(it.campos).filter(([k,v])=>v).map(([k,v])=>({campo:F[k].l,de:v,para:''})))}
ACT.histItem=b=>{const id=b.dataset.id;const h=S.hist.filter(x=>x.ref===id);
 openModal(`<h3>Histórico — ${esc(item(id)?.campos.tag||'')}</h3><div class="hist">${histHTML(h)}</div><div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
function histHTML(h){return h.map(x=>`<div class="h"><b>${esc(x.acao)}</b> · ${esc(x.desc)}<br><span class="muted">${fdt(x.ts)} — ${esc(x.user)}</span>${(x.mud||[]).map(m=>`<div class="muted">&nbsp;&nbsp;${esc(m.campo)}: <s>${esc(m.de||'—')}</s> → <b>${esc(m.para||'—')}</b></div>`).join('')}</div>`).join('')||'<p class="muted">Sem registros.</p>'}

/* ----- formulário de item ----- */
function itemForm(id){
 const ex=id?item(id):null;let cat=ex?.cat||'damper';const vals={...(ex?.campos||{})};
 const build=()=>{
  const cf=CATS[cat];
  openModal(`<h3>${ex?'Editar item':'Novo item'}</h3>
  <div class="fld"><label>Categoria</label><select id="ic" ${ex?'':''}>${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${k===cat?'selected':''}>${c.l}</option>`).join('')}</select></div>
  ${cf.proj.map(k=>`<div class="fld"><label>${F[k].l}</label>${F[k].area?`<textarea data-k="${k}">${esc(vals[k]||'')}</textarea>`:`<input type="text" data-k="${k}" value="${esc(vals[k]||'')}">`}</div>`).join('')}
  <div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" id="isv">Salvar</button></div>`);
  const grab=()=>$$('[data-k]',$('#cfModal')).forEach(e=>vals[e.dataset.k]=e.value.trim());
  $('#ic').onchange=e=>{grab();cat=e.target.value;build()};
  $('#isv').onclick=()=>{grab();const campos={};CATS[cat].proj.forEach(k=>campos[k]=vals[k]||'');
   if(!campos.tag)return toast('Informe a TAG / identificação');
   if(S.itens.some(i=>i.projetoId===ui.projetoId&&i.id!==id&&i.campos.tag.toLowerCase()===campos.tag.toLowerCase()))return toast('Já existe um item com essa TAG neste projeto');
   if(ex){const mud=[];if(ex.cat!==cat)mud.push({campo:'Categoria',de:CATS[ex.cat].l,para:CATS[cat].l});
    new Set([...Object.keys(ex.campos),...Object.keys(campos)]).forEach(k=>{if((ex.campos[k]||'')!==(campos[k]||''))mud.push({campo:F[k].l,de:ex.campos[k]||'',para:campos[k]||''})});
    ex.cat=cat;ex.campos=campos;if(mud.length)logH('editou','item',ex.id,`Editou ${campos.tag}`,mud)}
   else{const n={id:uid(),projetoId:ui.projetoId,cat,campos};S.itens.push(n);logH('criou','item',n.id,`Criou ${campos.tag} (${CATS[cat].l})`,Object.entries(campos).filter(([k,v])=>v).map(([k,v])=>({campo:F[k].l,de:'',para:v})))}
   save();closeModal();render();toast('Item salvo')};
 };
 build();
}
/* ----- CSV ----- */
const ALLK=['categoria','tag','pavimento','fabricante','modelo','tipo','dimensoes','vazao','ambiente','quantidade','atuador','tensao','localizacao','capacidade','potencia','pressao','corrente','tensaoeq','quadro','vazaoagua','outros'];
ACT.csvTpl=async()=>{if(!await ensureXlsx())return toast('Biblioteca Excel indisponível');
 const wb=XLSX.utils.book_new();
 Object.entries(CATS).forEach(([k,c])=>{const ex={tag:k==='damper'?'DP-01':k==='difusor'?'DF-01':k.toUpperCase().slice(0,3)+'-01'};
  const ws=XLSX.utils.aoa_to_sheet([c.proj.map(x=>F[x].l),c.proj.map(x=>ex[x]||'')]);ws['!cols']=c.proj.map(()=>({wch:22}));XLSX.utils.book_append_sheet(wb,ws,c.l)});
 XLSX.writeFile(wb,'modelo_itens.xlsx')};
ACT.csvImp=()=>$('#csvF').click();
function parseCSV(t){t=t.replace(/^﻿/,'');const d=(t.split('\n')[0].match(/;/g)||[]).length>=(t.split('\n')[0].match(/,/g)||[]).length?';':',';
 const rows=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];
  if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}
  else if(ch==='"')q=true;else if(ch===d){r.push(c);c=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;r.push(c);c='';if(r.some(x=>x.trim()))rows.push(r);r=[]}else c+=ch}
 r.push(c);if(r.some(x=>x.trim()))rows.push(r);return rows}
const ALIAS={tag:['tag','identificacao','ident','codigo','cod','item','id','tagidentificacao','numero','nome'],categoria:['categoria','grupo','familia','tipodeequipamento','equipamento','tipodeitem'],pavimento:['pav','andar','nivel','pavimentos'],fabricante:['marca','fornecedor'],quantidade:['qtd','qtde','quant','qt','qtdade'],dimensoes:['dimensao','dim','medidas','medida','tamanho','dimensoesmm'],localizacao:['local'],ambiente:['sala','ambientes'],tensao:['voltagem','volts','tensaov'],potencia:['pot'],capacidade:['cap'],corrente:['amperagem','amp','correntea','correntenominal','in'],quadro:['tagdoquadro','tagquadro','qd','painel','quadroeletrico','tagdoqd'],pressao:['pressaomca','mca','pressaopa','pressaoestatica','pressaodisponivel','alturamanometrica'],vazaoagua:['vazaodeagua','vazaoagua','vazaoh2o','vazaoliquida']};
function resolveKey(h){if(!h)return '';
 for(const [k,al] of Object.entries(ALIAS))if(al.includes(h))return k;
 if(ALLK.includes(h))return h;const byLabel=ALLK.find(k=>F[k]&&normT(F[k].l)===h);if(byLabel)return byLabel;
 const keys=ALLK.filter(k=>k!=='categoria').sort((a,b)=>b.length-a.length);
 return keys.find(k=>h.startsWith(k))||(h.includes('tag')?'tag':keys.find(k=>k.length>4&&h.includes(k)))||'';}
const CATPLUR={dampers:'damper',difusores:'difusor',grelhas:'grelha',bombas:'bomba',chillers:'chiller',fancoils:'fancoil',fancoletes:'fancolete',fancolets:'fancolete',fancoilx:'fancoil'};
function catFrom(txt){const n=normT(String(txt||''));if(!n)return undefined;if(CATPLUR[n])return CATPLUR[n];
 return Object.entries(CATS).find(([k,c])=>normT(c.l)===n||k===n||n.startsWith(k))?.[0]}
function sheetRecords(sh){
 const rows=sh.rows.filter(r=>r.some(x=>String(x).trim()));
 let best=-1,bi=-1;rows.slice(0,15).forEach((r,i)=>{const ks=r.map(h=>resolveKey(normT(String(h))));const sc=new Set(ks.filter(Boolean)).size+(ks.includes('tag')?5:0);if(sc>best){best=sc;bi=i}});
 if(bi<0)return{recs:[],head:[]};
 const hdr=rows[bi].map(h=>String(h).trim()),keys=hdr.map(h=>resolveKey(normT(h)));
 const recs=[];for(const r of rows.slice(bi+1)){const o={};keys.forEach((k,i)=>{if(k&&!(k in o))o[k]=String(r[i]??'').trim()});
  if(!o.tag){continue}
  let cat=catFrom(o.categoria)||catFrom(sh.name);
  if(!cat)for(const c of r){const x=catFrom(c);if(x&&normT(String(c)).length<=12){cat=x;break}}
  recs.push({o,cat})}
 return{recs,head:hdr,keys,hasTag:keys.includes('tag')};
}
async function importPlanilha(file){if(!file)return;
 let sheets=[];
 try{
  if(/\.csv$/i.test(file.name))sheets=[{name:'',rows:parseCSV(await file.text())}];
  else{if(!await ensureXlsx())return toast('Biblioteca Excel indisponível');
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
   sheets=wb.SheetNames.map(n=>({name:n,rows:XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''})}))}
 }catch(e){return toast('Não foi possível ler o arquivo: '+e.message)}
 const parsed=sheets.map(sh=>({sh,...sheetRecords(sh)}));
 const total=parsed.reduce((a,p)=>a+p.recs.length,0);
 if(!total){
  openModal(`<h3>Não encontrei itens nesta planilha</h3><p>Preciso de uma coluna com a <b>TAG / identificação</b> de cada item (ex.: "TAG", "Identificação", "Código", "Item").</p>
  ${parsed.map(p=>`<p><b>Aba "${esc(p.sh.name||'CSV')}":</b> colunas lidas → ${p.head?.length?p.head.map(h=>`<code>${esc(h||'(vazio)')}</code>`).join(', '):'<i>aba vazia</i>'}</p>`).join('')}
  <p class="muted">Renomeie o cabeçalho da coluna de identificação para <b>TAG</b> (ou use o <b>⬇ Modelo Excel</b>) e tente de novo.</p><div class="mfoot"><button class="btn" data-act="closeModal">Entendi</button></div>`);return}
 const semCat=parsed.reduce((a,p)=>a+p.recs.filter(r=>!r.cat).length,0);
 const run=def=>{let n=0,u=0,skip=0;
  for(const p of parsed)for(const {o,cat:c0} of p.recs){const cat=c0||def;if(!cat){skip++;continue}
   if(cat!=='damper'&&o.tensao&&!o.tensaoeq)o.tensaoeq=o.tensao;
   const campos={};CATS[cat].proj.forEach(k=>campos[k]=o[k]||'');
   const ex=S.itens.find(i=>i.projetoId===ui.projetoId&&i.campos.tag.toLowerCase()===o.tag.toLowerCase());
   if(ex){const mud=[];Object.keys(campos).forEach(k=>{if((ex.campos[k]||'')!==campos[k])mud.push({campo:F[k].l,de:ex.campos[k]||'',para:campos[k]})});ex.cat=cat;ex.campos=campos;u++;if(mud.length)logH('editou','item',ex.id,`Atualizou ${o.tag} via planilha`,mud)}
   else{const it={id:uid(),projetoId:ui.projetoId,cat,campos};S.itens.push(it);n++;logH('criou','item',it.id,`Criou ${o.tag} via planilha`)}}
  save();render();toast(`Planilha: ${n} criado(s), ${u} atualizado(s)${skip?', '+skip+' ignorado(s)':''}`)};
 if(!semCat)return run();
 openModal(`<h3>Qual é a categoria dos itens?</h3><p>${semCat} de ${total} linha(s) não indicam a categoria (Damper, Difusor, Grelha, Bomba…). Escolha a categoria para importá-las:</p>
  <div class="fld"><select id="defCat">${Object.entries(CATS).map(([k,c])=>`<option value="${k}">${c.l}</option>`).join('')}</select></div>
  <p class="muted">Dica: se a planilha tiver itens de tipos diferentes, adicione uma coluna "Categoria" ou separe em abas com o nome da categoria.</p>
  <div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" id="defOk">Importar</button></div>`);
 $('#defOk').onclick=()=>{const d=$('#defCat').value;closeModal();run(d)};
}

/* =====================================================================
   RELATÓRIO
   ===================================================================== */
async function viewReport(){
 if(!ui.projetoId){ui.view='home';return render()}
 const list=filteredItens();
 const ids=list.flatMap(i=>S.conf[i.id]?.fotos||[]);await Promise.all(ids.map(urlFor));
 const conf=list.filter(i=>S.conf[i.id]),resps=[...new Set(conf.map(i=>S.conf[i.id].resp).filter(Boolean))];
 const datas=conf.map(i=>S.conf[i.id].data).sort();
 const c=counts(list);
 const cf=cfg(),logoU=cf.logo?await urlFor('logo_empresa'):'';
 $('#cfMain').innerHTML=`<div class="card">${(cf.empresa||logoU)?`<div class="rep-brand">${logoU?`<img src="${logoU}" alt="">`:''}<div><b>${esc(cf.empresa||'')}</b><div class="muted">${esc([cf.cnpj&&'CNPJ '+cf.cnpj,cf.contato].filter(Boolean).join(' · '))}</div></div></div>`:''}<div class="row noprint" style="align-items:center"><h2 style="flex:3;margin:0">Relatório de comissionamento</h2>
  <button class="btn" data-act="print" style="flex:none">🖨 Imprimir / Salvar PDF</button><button class="btn sec" data-act="xlsExp" style="flex:none">⬇ Excel</button><button class="btn sec" data-act="csvExp" style="flex:none">⬇ CSV</button></div>
  <div class="noprint" style="margin-top:10px">${filtersHTML()}</div>
  <div class="rep-head" style="margin-top:12px"><div><label>Obra</label>${esc(obra(ui.obraId).nome)}</div><div><label>Projeto</label>${esc(proj(ui.projetoId).nome)}</div>
   <div><label>Pavimento</label>${esc(ui.pav||'Todos')}</div><div><label>Planta</label>${esc(ui.fPlanta&&ui.fPlanta!=='_none'?planta(ui.fPlanta)?.nome:'Todas')}</div><div><label>Responsável(is)</label>${esc(resps.join(', ')||'—')}</div>
   <div><label>Período das conferências</label>${datas.length?fdt(datas[0])+(datas.length>1?' a '+fdt(datas.at(-1)):''):'—'}</div>
   <div><label>Resumo</label>${list.length} itens · ${c.conferido} conf. · ${c.divergente} diverg. · ${c.pendente} pend. · ${c.em_conferencia} em conf.</div></div></div>
  ${list.map(i=>repItem(i)).join('')||'<div class="card muted">Nenhum item.</div>'}
  <div class="rep-sign"><div><div class="line"></div>${esc(cf.resp||'Responsável técnico')}<br><span class="muted">${esc(cf.crea?'CREA/Registro: '+cf.crea:(cf.empresa||''))}</span></div><div><div class="line"></div>${esc(cf.cliente||'Cliente / responsável pelo aceite')}<br><span class="muted">Data: ____/____/______</span></div></div>`;
}
function repItem(i){
 const s=statusOf(i.id),c=S.conf[i.id],cat=CATS[i.cat],dv=diverg(i.id);
 return `<div class="rep-item"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:16px">${esc(i.campos.tag)}</b><span class="muted">${cat.l} · ${esc(pavLabel(i))} · ${esc(plantasDoItem(i.id).join(', ')||'sem ponto em planta')}</span><span class="chip s-${s}">${ST[s]}</span></div>
 <table style="margin-top:6px"><thead><tr><th>Campo</th><th>Previsto (projeto)</th><th>Encontrado (obra)</th><th></th></tr></thead><tbody>
 ${cat.conf.map(k=>{const pv=i.campos[k]||'',fv=c?.campos[k]||'';const bad=dv.includes(k);const ok=c&&pv&&fv&&!bad;
  return `<tr><td>${F[k].l}</td><td>${esc(pv||'—')}</td><td class="${bad?'bad-td':ok?'ok-td':''}">${c?esc(fv||'—'):'—'}</td><td>${bad?'✗ divergente':ok?'✓':''}</td></tr>`}).join('')}</tbody></table>
 ${dv.length?`<div style="margin-top:6px"><b style="color:var(--verm)">Divergências:</b> ${dv.map(k=>`${F[k].l} (previsto ${esc(i.campos[k])} × encontrado ${esc(c.campos[k]||'—')})`).join('; ')}</div>`:''}
 ${c?.obs?`<div style="margin-top:6px"><b>Observações:</b> ${esc(c.obs)}</div>`:''}
 ${c?.fotos?.length?`<div class="photos">${c.fotos.map(f=>`<div class="ph"><img src="${urlCache.get(f)||''}"></div>`).join('')}</div>`:''}
 ${c?`<div class="muted" style="margin-top:4px">Conferido por ${esc(c.resp||'—')} em ${fdt(c.data)}${c.estado!=='finalizada'?' (rascunho — não finalizada)':''}</div>`:''}</div>`}
ACT.print=async()=>{const d=desk();if(d){try{const r=await d({action:'print-pdf',name:'Relatorio-conferencia'});if(r)toast('PDF salvo.')}catch(e){toast(e.message)}}else window.print()};
function repRows(){const list=filteredItens();const rows=[['Obra','Projeto','Pavimento','Planta','Categoria','TAG','Status','Campo','Previsto','Encontrado','Divergente','Observações','Responsável','Data']];
 list.forEach(i=>{const c=S.conf[i.id],dv=diverg(i.id);CATS[i.cat].conf.forEach(k=>rows.push([obra(ui.obraId).nome,proj(ui.projetoId).nome,pavLabel(i),plantasDoItem(i.id).join('/'),CATS[i.cat].l,i.campos.tag,ST[statusOf(i.id)],F[k].l,i.campos[k]||'',c?.campos[k]||'',dv.includes(k)?'SIM':'',c?.obs||'',c?.resp||'',c?fdt(c.data):'']))});return rows}
ACT.xlsExp=async()=>{if(!await ensureXlsx())return toast('Biblioteca Excel indisponível');const ws=XLSX.utils.aoa_to_sheet(repRows());ws['!cols']=[22,18,14,16,12,12,14,22,20,20,10,30,16,18].map(w=>({wch:w}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Conferência');XLSX.writeFile(wb,'relatorio_conferencia.xlsx')};
ACT.csvExp=()=>{const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;download('relatorio_conferencia.csv','\ufeff'+repRows().map(r=>r.map(q).join(';')).join('\n'),'text/csv')};

/* =====================================================================
   ADMINISTRAÇÃO (escritório)
   ===================================================================== */

/* ---------- Carimbos de edição, exclusões e sincronização em equipe ---------- */
const ENT=['obras','projetos','plantas','itens','marcas'];
let sigs=new Map(),prevIds=new Set(),syncing=false,syncOn=false,syncT=null;
const sigOf=x=>{const{_u,...r}=x;return JSON.stringify(r)};
function resetSigs(){sigs=new Map();prevIds=new Set();ENT.forEach(k=>(S[k]||[]).forEach(x=>{sigs.set(x.id,sigOf(x));prevIds.add(x.id)}))}
function stamp(){const now=new Date().toISOString(),cur=new Set();S.del=S.del||{};
 ENT.forEach(k=>S[k].forEach(x=>{cur.add(x.id);const s=sigOf(x);if(sigs.get(x.id)!==s){x._u=now;sigs.set(x.id,s)}}));
 prevIds.forEach(id=>{if(!cur.has(id)){S.del[id]=now;sigs.delete(id)}});prevIds=cur}
const cfg=()=>S.cfg||(S.cfg={});
function deviceId(){let d=localStorage.getItem('orcehvac.conf.dev');if(!d){d='d'+uid().replace(/[^A-Za-z0-9]/g,'').slice(0,12);localStorage.setItem('orcehvac.conf.dev',d)}return d}
function mergeState(o){
 let ch=0;S.del=S.del||{};
 for(const [id,ts] of Object.entries(o.del||{}))if(!S.del[id]||S.del[id]<ts)S.del[id]=ts;
 ENT.forEach(k=>(o[k]||[]).forEach(x=>{
  const dts=S.del[x.id];if(dts&&dts>=(x._u||''))return;
  const i=S[k].findIndex(y=>y.id===x.id);
  if(i<0){S[k].push(x);ch++}
  else if((x._u||'')>(S[k][i]._u||'')){S[k][i]=x;ch++;if(k==='plantas')delete docCache[x.id]}}));
 ENT.forEach(k=>{const n=S[k].length;S[k]=S[k].filter(x=>!(S.del[x.id]&&S.del[x.id]>=(x._u||'')));ch+=n-S[k].length});
 for(const [id,c] of Object.entries(o.conf||{})){if(!item(id))continue;const l=S.conf[id];if(!l||(c.data||'')>(l.data||'')){S.conf[id]=c;ch++}}
 for(const id of Object.keys(S.conf))if(!item(id))delete S.conf[id];
 S.marcas=S.marcas.filter(m=>item(m.itemId)&&planta(m.plantaId));
 if(!cfg().empresa&&o.cfg&&o.cfg.empresa){S.cfg={...o.cfg};ch++}
 (o.hist||[]).forEach(h=>{if(!S.hist.some(x=>x.id===h.id)){S.hist.push(h)}});S.hist.sort((a,b)=>b.ts.localeCompare(a.ts));if(S.hist.length>3000)S.hist.length=3000;
 return ch}
async function syncNow(silent){const d=desk();if(!d||syncing)return;syncing=true;
 try{
  if(!await d({action:'sync-dir'})){syncOn=false;return}
  stamp();
  const others=await d({action:'sync-run',device:deviceId(),json:JSON.stringify(S)});
  let ch=0;for(const t of others){try{ch+=mergeState(JSON.parse(t))}catch{}}
  if(ch){resetSigs();await kvSet('state',S);await d({action:'sync-run',device:deviceId(),json:JSON.stringify(S)})}
  localStorage.setItem('orcehvac.conf.lastSync',new Date().toISOString());
  if(ch&&root&&root.isConnected){const busy=$('#cfModal')&&$('#cfModal').children.length||ui.view==='plant';if(busy)toast('Sincronizado: '+ch+' novidade(s) da equipe. Volte ao início para ver.');else{render();toast('Sincronizado: '+ch+' novidade(s) da equipe')}}
  else if(!silent)toast(ch?'Sincronizado: '+ch+' novidade(s)':'Sincronizado — nada novo');
  if(root&&root.isConnected&&ui.view==='admin'&&ui.atab==='bkp')render();
 }catch(e){if(!silent)toast('Sincronização: '+e.message)}finally{syncing=false}}
function schedSync(){if(!syncOn)return;clearTimeout(syncT);syncT=setTimeout(()=>syncNow(true),15000)}
async function initSync(){const d=desk();if(!d)return;try{syncOn=!!await d({action:'sync-dir'})}catch{}if(syncOn){syncNow(true);setInterval(()=>{if(syncOn)syncNow(true)},120000)}}
ACT.syncPick=async()=>{const d=desk();if(!d)return;const r=await d({action:'sync-pick'});if(!r)return;if(!await needUser())returnsyncOn=true;await syncNow(false);render()};
ACT.syncNow=()=>syncNow(false);
ACT.syncOff=async()=>{const d=desk();if(!d)return;await d({action:'sync-off'});syncOn=false;toast('Sincronização desligada');render()};
ACT.bkpFolder=async()=>{const d=desk();if(!d)return;try{const r=await d({action:'backup-folder'});if(r){localStorage.setItem('orcehvac.conf.lastBkp',new Date().toISOString());toast('Backup completo salvo em: '+r);render()}}catch(e){toast('Backup: '+e.message)}};
ACT.restFolder=async()=>{const d=desk();if(!d)return;if(!confirm('Restaurar um backup substitui os dados atuais (uma cópia dos atuais é guardada antes). Continuar?'))return;try{const r=await d({action:'restore-folder'});if(r){toast('Backup restaurado. Recarregando…');setTimeout(()=>location.reload(),900)}}catch(e){toast('Restauração: '+e.message)}};
ACT.empSave=async()=>{const c=cfg();['empresa','cnpj','resp','crea','cliente','contato'].forEach(k=>{c[k]=($('#e_'+k)?.value||'').trim()});
 const f=$('#e_logo')?.files[0];if(f){if(!/^image\//.test(f.type))return toast('O logo precisa ser uma imagem (PNG ou JPG)');await blobSet('logo_empresa',f);urlCache.delete('logo_empresa');c.logo=true}
 save();toast('Dados da empresa salvos');render()};
ACT.empLogoDel=async()=>{await blobDel('logo_empresa');urlCache.delete('logo_empresa');cfg().logo=false;save();render()};
function adminEmp(){const c=cfg();const fl=(k,l)=>`<div class="fld"><label for="e_${k}">${l}</label><input id="e_${k}" type="text" value="${esc(c[k]||'')}"></div>`;
 return `<div class="card"><h3>Empresa e assinatura do relatório</h3><p class="muted">Aparecem no cabeçalho e no rodapé de assinatura do relatório de comissionamento.</p>
 <div class="two"><div>${fl('empresa','Empresa')}${fl('cnpj','CNPJ')}${fl('contato','Telefone / e-mail')}</div><div>${fl('resp','Responsável técnico')}${fl('crea','CREA / registro')}${fl('cliente','Cliente / responsável pelo aceite')}</div></div>
 <div class="fld"><label for="e_logo">Logo da empresa (PNG ou JPG)</label><input id="e_logo" type="file" accept="image/*"></div>
 ${c.logo?'<p class="muted">Logo já cadastrado. <button class="btn red sm" data-act="empLogoDel">Remover logo</button></p>':''}
 <div class="row"><button class="btn" data-act="empSave" style="flex:none">Salvar</button></div></div>`}
function viewAdmin(){
 const t=ui.atab;
 let h=`<div class="tabs">${[['cad','Obras, projetos e plantas'],['hist','Histórico de alterações'],['emp','Empresa e assinatura'],['bkp','Backup e equipe']].map(([k,l])=>`<button data-act="atab" data-k="${k}" class="${t===k?'on':''}">${l}</button>`).join('')}</div>`;
 if(t==='cad')h+=adminCad();else if(t==='hist')h+=`<div class="card"><h3>Histórico de alterações</h3><div class="hist">${histHTML(S.hist.slice(0,400))}</div></div>`;else if(t==='emp')h+=adminEmp();else h+=adminBkp();
 $('#cfMain').innerHTML=h;renderKpi();bindImp();
}
ACT.atab=b=>{ui.atab=b.dataset.k;render()};
function adminCad(){
 const li=(arr,sel,sc,ed,del,extra)=>arr.map(x=>`<div class="li ${x.id===sel?'sel':''}"><div class="grow" data-act="${sc}" data-id="${x.id}"><b>${esc(x.nome)}</b>${extra?`<div class="muted">${extra(x)}</div>`:''}</div><button class="btn sec sm" data-act="${ed}" data-id="${x.id}">✎</button><button class="btn red sm" data-act="${del}" data-id="${x.id}">🗑</button></div>`).join('')||'<div class="muted">Nada cadastrado.</div>';
 const projs=S.projetos.filter(p=>p.obraId===ui.obraId),pls=S.plantas.filter(p=>p.projetoId===ui.projetoId);
 return `<div class="two"><div class="card"><div class="row" style="align-items:center"><h3 style="margin:0">Obras</h3><button class="btn sm" data-act="addObra" style="flex:none">+ Nova obra</button></div><div class="list">${li(S.obras,ui.obraId,'selO','edObra','delObra',o=>S.projetos.filter(p=>p.obraId===o.id).length+' projeto(s)')}</div></div>
 <div class="card"><div class="row" style="align-items:center"><h3 style="margin:0">Projetos ${ui.obraId?'— '+esc(obra(ui.obraId)?.nome):''}</h3><button class="btn sm" data-act="addProj" style="flex:none" ${ui.obraId?'':'disabled'}>+ Novo projeto</button></div><div class="list">${ui.obraId?li(projs,ui.projetoId,'selP','edProj','delProj',p=>projItens(p.id).length+' item(ns)'):'<div class="muted">Selecione uma obra.</div>'}</div></div></div>
 <div class="card"><div class="row" style="align-items:center"><h3 style="margin:0">Plantas ${ui.projetoId?'— '+esc(proj(ui.projetoId)?.nome):''}</h3>
  <button class="btn sm" data-act="addPl" style="flex:none" ${ui.projetoId?'':'disabled'}>+ Enviar planta (PDF / DXF / imagem)</button>
  <button class="btn sm sec" data-act="nav" data-v="itens" style="flex:none" ${ui.projetoId?'':'disabled'}>Cadastrar equipamentos e terminais ›</button></div>
  <div class="list">${ui.projetoId?pls.map(p=>`<div class="li"><div class="grow" data-act="posPl" data-id="${p.id}"><b>${esc(p.nome)}</b><div class="muted">${esc(p.pav||'Sem pavimento')} · ${esc(p.disc||'Sem disciplina')} · ${p.tipo.toUpperCase()} · ${S.marcas.filter(m=>m.plantaId===p.id).length} ponto(s)</div></div>
   <button class="btn sm" data-act="posPl" data-id="${p.id}">📍 Posicionar pontos</button><button class="btn sec sm" data-act="edPl" data-id="${p.id}">✎</button><button class="btn red sm" data-act="delPl" data-id="${p.id}">🗑</button></div>`).join('')||'<div class="muted">Nenhuma planta enviada.</div>':'<div class="muted">Selecione um projeto.</div>'}</div></div>`}
ACT.selO=b=>{ui.pav='';ui.obraId=b.dataset.id;ui.projetoId='';ui.plantaId='';ui.disc='';render()};
ACT.selP=b=>{ui.pav='';ui.projetoId=b.dataset.id;ui.plantaId='';ui.disc='';render()};
function sitesOptions(){try{const st=typeof store!=='undefined'?store:null;if(!st||!st.sites)return[];return st.sites.map(s=>({v:s.id,t:((st.clients.find(c=>c.id===s.clientId)||{}).name||'Cliente')+' — '+s.name}))}catch{return[]}}
ACT.addObra=()=>formModal('Nova obra',[...(sitesOptions().length?[{k:'site',l:'Obra já cadastrada no programa (opcional)',type:'select',options:[{v:'',t:'— digitar o nome abaixo —'},...sitesOptions()]}]:[]),{k:'nome',l:'Nome da obra'}],v=>{if(v.site&&!v.nome)v.nome=sitesOptions().find(o=>o.v===v.site)?.t||'';if(!v.nome)return false;const o={id:uid(),nome:v.nome,siteId:v.site||undefined};S.obras.push(o);ui.obraId=o.id;ui.projetoId='';logH('criou','obra',o.id,'Criou obra '+v.nome);save();render()});
ACT.edObra=b=>{const o=obra(b.dataset.id);formModal('Editar obra',[{k:'nome',l:'Nome',value:o.nome}],v=>{if(!v.nome)return false;logH('editou','obra',o.id,`Renomeou obra ${o.nome} → ${v.nome}`);o.nome=v.nome;save();render()})};
ACT.delObra=b=>{const o=obra(b.dataset.id);if(!confirm(`Excluir a obra "${o.nome}" com TODOS os projetos, plantas, itens e conferências?`))return;S.projetos.filter(p=>p.obraId===o.id).forEach(p=>delProjeto(p.id));S.obras=S.obras.filter(x=>x.id!==o.id);logH('excluiu','obra',o.id,'Excluiu obra '+o.nome);if(ui.obraId===o.id){ui.obraId='';ui.projetoId='';ui.plantaId=''}save();render()};
ACT.addProj=()=>formModal('Novo projeto',[{k:'nome',l:'Nome do projeto'}],v=>{if(!v.nome)return false;const p={id:uid(),obraId:ui.obraId,nome:v.nome};S.projetos.push(p);ui.projetoId=p.id;logH('criou','projeto',p.id,'Criou projeto '+v.nome);save();render()});
ACT.edProj=b=>{const p=proj(b.dataset.id);formModal('Editar projeto',[{k:'nome',l:'Nome',value:p.nome}],v=>{if(!v.nome)return false;logH('editou','projeto',p.id,`Renomeou projeto ${p.nome} → ${v.nome}`);p.nome=v.nome;save();render()})};
function delProjeto(id){projItens(id).forEach(i=>delItemById(i.id));S.plantas.filter(p=>p.projetoId===id).forEach(p=>{blobDel(p.blobId);delete docCache[p.id]});S.marcas=S.marcas.filter(m=>planta(m.plantaId)&&planta(m.plantaId).projetoId!==id);S.plantas=S.plantas.filter(p=>p.projetoId!==id);S.projetos=S.projetos.filter(p=>p.id!==id)}
ACT.delProj=b=>{const p=proj(b.dataset.id);if(!confirm(`Excluir o projeto "${p.nome}" com plantas, itens e conferências?`))return;delProjeto(p.id);logH('excluiu','projeto',p.id,'Excluiu projeto '+p.nome);if(ui.projetoId===p.id){ui.projetoId='';ui.plantaId=''}save();render()};
const fileTipo=f=>{if(/\.dwg$/i.test(f.name)){toast('DWG não é suportado: no AutoCAD use SALVAR COMO › DXF (ou exporte em PDF)');return null}return /\.dxf$/i.test(f.name)?'dxf':/pdf$/i.test(f.type)||/\.pdf$/i.test(f.name)?'pdf':/^image\//.test(f.type)?'img':null};
ACT.addPl=()=>formModal('Enviar planta',[{k:'nome',l:'Nome da planta (ex.: Climatização — 3º pavimento)'},{k:'pav',l:'Pavimento',list:PAVS},{k:'disc',l:'Disciplina / categoria',list:DISCIPLINAS,value:'Climatização'},{k:'file',l:'Arquivo (PDF, DXF, PNG, JPG)',type:'file',accept:'.pdf,.dxf,image/*'}],async v=>{
 if(!v.file){toast('Selecione o arquivo da planta');return false}const tipo=fileTipo(v.file);if(!tipo){toast('Formato não suportado — use PDF, DXF, PNG ou JPG');return false}
 const p={id:uid(),projetoId:ui.projetoId,nome:v.nome||v.file.name.replace(/\.[^.]+$/,''),pav:v.pav,disc:v.disc,tipo,blobId:'pl_'+uid()};
 await blobSet(p.blobId,v.file);S.plantas.push(p);logH('criou','planta',p.id,'Enviou planta '+p.nome);save();render();toast('Planta enviada')},'Enviar');
ACT.edPl=b=>{const p=planta(b.dataset.id);formModal('Editar planta',[{k:'nome',l:'Nome',value:p.nome},{k:'pav',l:'Pavimento',value:p.pav,list:PAVS},{k:'disc',l:'Disciplina',value:p.disc,list:DISCIPLINAS},{k:'file',l:'Substituir arquivo (opcional)',type:'file',accept:'.pdf,.dxf,image/*'}],async v=>{
 if(v.file){const t=fileTipo(v.file);if(!t){toast('Formato não suportado');return false}await blobSet(p.blobId,v.file);p.tipo=t;p.paginas=0;delete docCache[p.id]}
 p.nome=v.nome||p.nome;p.disc=v.disc;p.pav=v.pav;logH('editou','planta',p.id,'Editou planta '+p.nome);save();render()})};
ACT.delPl=b=>{const p=planta(b.dataset.id);if(!confirm(`Excluir a planta "${p.nome}"? Os pontos nela serão removidos (os itens continuam cadastrados).`))return;blobDel(p.blobId);delete docCache[p.id];S.marcas=S.marcas.filter(m=>m.plantaId!==p.id);S.plantas=S.plantas.filter(x=>x.id!==p.id);logH('excluiu','planta',p.id,'Excluiu planta '+p.nome);save();render()};
ACT.posPl=b=>openPlanta(b.dataset.id);

/* ----- Backup / pacotes ----- */
function adminBkp(){
 const dk=!!desk(),lb=localStorage.getItem('orcehvac.conf.lastBkp'),ls=localStorage.getItem('orcehvac.conf.lastSync');
 return (dk?`<div class="card"><h3>Backup completo (dados, plantas e fotos)</h3><p>Copia tudo para uma pasta de sua escolha (pendrive, OneDrive, rede). Último backup: <b>${lb?fdt(lb):'nunca feito'}</b>.</p><div class="row"><button class="btn" data-act="bkpFolder" style="flex:none">💾 Fazer backup completo</button><button class="btn sec" data-act="restFolder" style="flex:none">Restaurar de um backup…</button></div></div>
 <div class="card"><h3>Equipe: sincronizar por pasta compartilhada</h3><p>Escolha uma pasta que todos acessam (OneDrive, Google Drive, rede). Cada computador grava ali o próprio estado e junta o dos outros automaticamente — conferências, fotos, plantas e pontos. Se duas pessoas editarem o mesmo item, vale a alteração mais recente.</p>${syncOn?`<p>Sincronização <b>ativa</b>${ls?' · última: '+fdt(ls):''}.</p><div class="row"><button class="btn" data-act="syncNow" style="flex:none">🔄 Sincronizar agora</button><button class="btn sec" data-act="syncPick" style="flex:none">Trocar pasta</button><button class="btn red" data-act="syncOff" style="flex:none">Desligar</button></div>`:`<div class="row"><button class="btn" data-act="syncPick" style="flex:none">📁 Escolher pasta compartilhada</button></div>`}</div>`:'')+`<div class="card"><h3>Como levar o projeto do escritório para o engenheiro</h3>
 <p>Os dados ficam salvos neste navegador/aparelho. Para enviar um projeto ao engenheiro: <b>exporte a obra</b> (arquivo .json com plantas, equipamentos, pontos e fotos) e envie por WhatsApp, e-mail ou pendrive. O engenheiro <b>importa</b> o arquivo no aparelho dele. Depois da conferência, o engenheiro exporta de volta e o escritório importa para ver as conferências — nada é sobrescrito: itens e conferências são mesclados pelo identificador.</p>
 <div class="row"><div><label>Obra para exportar</label><select id="expObra">${S.obras.map(o=>`<option value="${o.id}" ${o.id===ui.obraId?'selected':''}>${esc(o.nome)}</option>`).join('')}</select></div>
 <button class="btn" data-act="expObra" style="flex:none">⬇ Exportar obra</button>
 <button class="btn sec" data-act="impPkg" style="flex:none">⬆ Importar arquivo</button><input type="file" id="impF" accept=".json,application/json" style="display:none"></div></div>
 <div class="card"><h3>Backup completo</h3><div class="row"><button class="btn sec" data-act="expAll" style="flex:none">⬇ Backup de tudo</button><button class="btn red" data-act="wipe" style="flex:none">Apagar todos os dados</button></div>
 <p class="muted">Recomendação: faça backup periodicamente. Os dados ficam na pasta de dados do OrceHVAC (subpasta conferencia); inclua-a nas cópias de segurança do computador.</p><p class="muted">Versão do aplicativo: ${APP_VERSION}</p></div>`}
async function packObras(obraIds){
 const projetos=S.projetos.filter(p=>obraIds.includes(p.obraId)),pids=projetos.map(p=>p.id);
 const plantas=S.plantas.filter(p=>pids.includes(p.projetoId)),itens=S.itens.filter(i=>pids.includes(i.projetoId)),iids=new Set(itens.map(i=>i.id));
 const marcas=S.marcas.filter(m=>iids.has(m.itemId)),conf={};iids.forEach(i=>{if(S.conf[i])conf[i]=S.conf[i]});
 const bl={};for(const id of [...plantas.map(p=>p.blobId),...Object.values(conf).flatMap(c=>c.fotos)]){const b=await blobGet(id);if(b)bl[id]=await blobToDataURL(b)}
 return {formato:'conferencia-hvac',versao:1,exportado:new Date().toISOString(),obras:S.obras.filter(o=>obraIds.includes(o.id)),projetos,plantas,itens,marcas,conf,blobs:bl,hist:S.hist.filter(h=>iids.has(h.ref)||pids.includes(h.ref)||obraIds.includes(h.ref))}}
ACT.expObra=async()=>{const id=$('#expObra').value;if(!id)return toast('Cadastre uma obra primeiro');toast('Gerando arquivo…');const p=await packObras([id]);download(`obra_${normT(obra(id).nome)||'obra'}.json`,JSON.stringify(p),'application/json')};
ACT.expAll=async()=>{toast('Gerando backup…');const p=await packObras(S.obras.map(o=>o.id));download('backup_conferencia_hvac.json',JSON.stringify(p),'application/json')};
ACT.impPkg=()=>$('#impF').click();
function bindImp(){const f=$('#impF');if(!f)return;f.onchange=async()=>{const file=f.files[0];if(!file)return;try{await importPkg(JSON.parse(await file.text()));render();toast('Arquivo importado')}catch(e){toast('Arquivo inválido: '+e.message)}f.value=''}}
async function importPkg(p){
 if(p.formato!=='conferencia-hvac')throw new Error('não é um arquivo do sistema');
 const up=(arr,x)=>{const i=arr.findIndex(y=>y.id===x.id);i>=0?arr[i]=x:arr.push(x)};
 for(const [id,u] of Object.entries(p.blobs||{})){await blobSet(id,await dataURLToBlob(u));urlCache.delete(id)}
 p.obras.forEach(x=>up(S.obras,x));p.projetos.forEach(x=>up(S.projetos,x));p.plantas.forEach(x=>{up(S.plantas,x);delete docCache[x.id]});p.itens.forEach(x=>up(S.itens,x));
 p.marcas.forEach(x=>up(S.marcas,x));
 // marcas removidas no escritório: remover marcas locais de itens importados que não vieram no pacote
 const imp=new Set(p.itens.map(i=>i.id)),keep=new Set(p.marcas.map(m=>m.id));S.marcas=S.marcas.filter(m=>!imp.has(m.itemId)||keep.has(m.id));
 for(const [id,c] of Object.entries(p.conf||{})){const l=S.conf[id];if(!l||(c.data||'')>=(l.data||''))S.conf[id]=c}
 (p.hist||[]).forEach(h=>{if(!S.hist.some(x=>x.id===h.id))S.hist.push(h)});S.hist.sort((a,b)=>b.ts.localeCompare(a.ts));
 save();if(!ui.obraId&&S.obras[0])ui.obraId='';}
ACT.wipe=async()=>{if(!confirm('Apagar TODOS os dados deste aparelho? Faça backup antes.')||!confirm('Tem certeza? Esta ação não pode ser desfeita.'))return;
 for(const k of await blobIds())await blobDel(k);S={obras:[],projetos:[],plantas:[],itens:[],marcas:[],conf:{},hist:[],cfg:{},del:{}};resetSigs();ui.obraId=ui.projetoId=ui.plantaId='';await kvSet('state',S);render();toast('Dados apagados')};

/* ---------- Montagem no OrceHVAC ---------- */
let loaded=false,pendingItem=null;
async function ensureLoaded(){if(loaded)return true;try{const saved=await kvGet();if(saved)S={...S,...saved};S.cfg=S.cfg||{};S.del=S.del||{};resetSigs();loaded=true;initSync();return true}catch(e){toast('Não foi possível ler os dados do comissionamento: '+e.message);return false}}
function mount(){
 const c=document.getElementById('content');root=document.createElement('div');root.className='cf';
 root.innerHTML='<section class="heading" id="cfHead"></section><nav class="module-tabs" id="cfNav"></nav><div id="cfKpi"></div><div id="cfMain"></div><div id="cfModal"></div>';
 c.replaceChildren(root);bindRoot();
}
async function start(){
 if(!await ensureLoaded())return;
 mount();render();
 if(pendingItem){const id=pendingItem;pendingItem=null;if(item(id))openConf(id)}
}
/* ---------- Visão geral (painel do comissionamento) ---------- */
function bkpWarn(){if(!S.obras.length||!desk())return '';const lb=localStorage.getItem('orcehvac.conf.lastBkp');const days=lb?(Date.now()-new Date(lb))/864e5:999;if(days<7||syncOn)return '';return `<div class="panel" style="margin-bottom:16px;border-left:4px solid #dc2626"><b>Faça um backup completo.</b> ${lb?'Último há '+Math.floor(days)+' dia(s).':'Nenhum backup feito ainda.'} <button class="btn sm" data-ov="bkp">Abrir backup</button></div>`}
async function overview(){
 if(!await ensureLoaded())return;
 const c=document.getElementById('content');
 const ov=document.createElement('div');ov.className='cf cf-ov';root=ov;
 const sel=ui.ovObra&&obra(ui.ovObra)?ui.ovObra:'';ui.ovObra=sel;
 const OB=sel?S.obras.filter(o=>o.id===sel):S.obras,PJ=S.projetos.filter(p=>OB.some(o=>o.id===p.obraId)),PL=S.plantas.filter(p=>PJ.some(x=>x.id===p.projetoId)),IT=S.itens.filter(i=>PJ.some(x=>x.id===i.projetoId));
 const cs=counts(IT),t=IT.length,pct=t?Math.round((cs.conferido+cs.divergente)/t*100):0;
 const seg=(cc,tt)=>STORDER.map(k=>tt?`<i style="width:${cc[k]/tt*100}%;background:${STC[k]}"></i>`:'').join('');
 const obras=OB.map(o=>{const pids=S.projetos.filter(p=>p.obraId===o.id).map(p=>p.id);const it=S.itens.filter(i=>pids.includes(i.projetoId));return{o,np:pids.length,it,c:counts(it)}});
 const projOf=i=>proj(i.projetoId),obraOf=i=>obra(projOf(i)?.obraId);
 const div=IT.filter(i=>statusOf(i.id)==='divergente').slice(0,8);
 const acts=S.hist.filter(h=>['conferiu','criou','editou'].includes(h.acao)&&['conferencia','item','planta','obra'].includes(h.ent)).slice(0,8);
 const pavs={};IT.forEach(i=>{const k=pavLabel(i);(pavs[k]??=[]).push(i)});
 const pavRows=Object.keys(pavs).sort(pavSort);
 const row=(ico,title,meta,tag,attr)=>`<div class="activity-row" style="cursor:${attr?'pointer':'default'}" ${attr||''}><div class="activity-icon">${ico}</div><div><div class="activity-title">${title}</div><div class="activity-meta">${meta}</div></div>${tag||''}</div>`;
 ov.innerHTML=`<section class="heading"><div><div class="eyebrow">Painel de controle</div><h1>Comissionamento de obra</h1><p>Confira o que foi projetado com o que foi instalado, pavimento por pavimento.</p></div>
  <div class="cf-tools"><select id="ovSel" title="Filtrar por obra"><option value="">Todas as obras</option>${S.obras.map(o=>`<option value="${o.id}" ${o.id===sel?'selected':''}>${esc(o.nome)}</option>`).join('')}</select><button class="btn primary" data-ov="work">▶ Abrir comissionamento</button></div></section>
  ${bkpWarn()}
  <section class="stats">
   <div class="stat"><div class="stat-top"><span>Obras em comissionamento</span><span class="stat-icon">▰</span></div><div class="stat-value">${OB.length}</div><div class="stat-foot">${PJ.length} projeto(s) · ${PL.length} planta(s)</div></div>
   <div class="stat"><div class="stat-top"><span>Itens a comissionar</span><span class="stat-icon">▦</span></div><div class="stat-value">${t}</div><div class="stat-foot">${cs.pendente} pendente(s) · ${cs.em_conferencia} em conferência</div></div>
   <div class="stat"><div class="stat-top"><span>Comissionamento concluído</span><span class="stat-icon">✓</span></div><div class="stat-value">${pct}%</div><div class="stat-foot">${cs.conferido} conferido(s) sem divergência</div></div>
   <div class="stat"><div class="stat-top"><span>Divergências abertas</span><span class="stat-icon" style="color:#dc2626">⚠</span></div><div class="stat-value" style="color:${cs.divergente?'#dc2626':'inherit'}">${cs.divergente}</div><div class="stat-foot">Projeto × instalado em campo</div></div>
  </section>
  <section class="layout-grid">
   <div class="panel"><div class="panel-head"><div><h2>Andamento por obra</h2><div class="sub">Itens conferidos e divergentes sobre o total cadastrado</div></div></div>
    ${obras.length?obras.map(x=>{const tt=x.it.length,pc=tt?Math.round((x.c.conferido+x.c.divergente)/tt*100):0;return `<div class="budget-row" style="grid-template-columns:minmax(0,1.4fr) minmax(120px,1fr) auto;cursor:pointer" data-ov="obra" data-id="${x.o.id}"><div><div class="budget-name">${esc(x.o.nome)}</div><div class="budget-meta">${x.np} projeto(s) · ${tt} item(ns)${x.c.divergente?` · <b style="color:#dc2626">${x.c.divergente} divergente(s)</b>`:''}</div></div><div><div class="cfbar">${seg(x.c,tt)}</div></div><div class="budget-value">${pc}%</div></div>`}).join(''):'<div class="empty">Nenhuma obra cadastrada ainda.<br><br><button class="btn primary" data-ov="admin">＋ Cadastrar a primeira obra</button></div>'}
   </div>
   <div class="panel"><div class="panel-head"><div><h2>Divergências em aberto</h2><div class="sub">Itens que não conferem com o projeto</div></div></div>
    <div class="activity">${div.length?div.map(i=>{const c=S.conf[i.id],d=diverg(i.id);return row('⚠',esc(i.campos.tag)+' — '+CATS[i.cat].l,esc((obraOf(i)?.nome||'')+' › '+pavLabel(i)+' · '+d.map(k=>F[k].l+': '+(i.campos[k]||'—')+' → '+(c.campos[k]||'—')).join('; ')),'<span class="tag draft">Divergente</span>',`data-ov="item" data-id="${i.id}"`)}).join(''):'<div class="empty">Nenhuma divergência registrada.</div>'}</div>
   </div>
  </section>
  <section class="layout-grid" style="margin-top:18px">
   <div class="panel"><div class="panel-head"><div><h2>Andamento por pavimento</h2><div class="sub">Todas as obras</div></div></div>
    ${pavRows.length?pavRows.map(k=>{const l=pavs[k],cc=counts(l),tt=l.length,pc=Math.round((cc.conferido+cc.divergente)/tt*100);return `<div class="budget-row" style="grid-template-columns:minmax(0,1fr) minmax(120px,1.2fr) auto"><div><div class="budget-name">${esc(k)}</div><div class="budget-meta">${tt} item(ns) · ${cc.pendente} pendente(s)</div></div><div class="cfbar">${seg(cc,tt)}</div><div class="budget-value">${pc}%</div></div>`}).join(''):'<div class="empty">Sem itens cadastrados.</div>'}
   </div>
   <div class="panel"><div class="panel-head"><div><h2>Atividade recente</h2><div class="sub">Últimas conferências e cadastros</div></div></div>
    <div class="activity">${acts.length?acts.map(h=>row(h.acao==='conferiu'?'✓':'✎',esc(h.desc),esc(fdt(h.ts)+' · '+h.user))).join(''):'<div class="empty">Sem atividade ainda.</div>'}</div>
   </div>
  </section>
  <div class="quick-title">Acesso rápido</div>
  <section class="quick-grid">
   <button class="quick-card" data-ov="work"><span class="quick-icon">📐</span><span><strong>Abrir planta</strong><span>Escolha obra, pavimento e planta para conferir em campo.</span></span></button>
   <button class="quick-card" data-ov="report"><span class="quick-icon">🧾</span><span><strong>Relatório de comissionamento</strong><span>Previsto × encontrado, divergências e fotos. PDF ou Excel.</span></span></button>
   <button class="quick-card" data-ov="bkp"><span class="quick-icon">💾</span><span><strong>Backup e equipe</strong><span>Backup completo e sincronização entre computadores.</span></span></button>
   <button class="quick-card" data-ov="admin"><span class="quick-icon">⚙</span><span><strong>Cadastro (escritório)</strong><span>Obras, plantas, equipamentos e pontos na planta.</span></span></button>
  </section>`;
 c.replaceChildren(ov);
 ov.querySelector('#ovSel').onchange=e=>{ui.ovObra=e.target.value;overview()};
 ov.addEventListener('click',e=>{const b=e.target.closest('[data-ov]');if(!b)return;const a=b.dataset.ov;
  if(a==='work')openWork({});else if(a==='obra')openWork({obraId:b.dataset.id});else if(a==='item')openWork({itemId:b.dataset.id});
  else if(a==='bkp'){ui.atab='bkp';mode='escritorio';localStorage.setItem('orcehvac.conf.modo',mode);openWork({view:'admin'})}else if(a==='report')openWork({view:'report'});else if(a==='admin'){mode='escritorio';localStorage.setItem('orcehvac.conf.modo',mode);openWork({view:'admin'})}});
}
function openWork(o){
 if(o.itemId){const it=item(o.itemId);if(it){const p=proj(it.projetoId);ui.obraId=p?.obraId||'';ui.projetoId=it.projetoId;ui.pav='';ui.disc='';ui.plantaId='';ui.view='home';pendingItem=it.id}}
 else if(o.obraId){ui.obraId=o.obraId;ui.projetoId=S.projetos.find(p=>p.obraId===o.obraId)?.id||'';ui.pav='';ui.disc='';ui.plantaId='';ui.view='home'}
 else if(o.view){ui.view=(o.view==='report'&&!ui.projetoId)?'home':o.view}
 else ui.view='home';
 globalThis.go('conferencia');
}
window.addEventListener('resize',()=>{if(root&&root.isConnected&&ui.view==='plant'&&V&&$('#vp'))applyT()});
if(typeof labels!=='undefined')labels.conferencia='Comissionamento de obra';
/* Menu: somente comissionamento (orçamentos e cadastros de orçamento ficam ocultos) */
['orcamentos','materiais','composicoes','historico','especificacoes','cadastros'].forEach(p=>document.querySelectorAll('[data-page="'+p+'"]').forEach(b=>b.remove()));
document.querySelectorAll('.artech-logo').forEach(e=>e.remove());
const nav=document.querySelector('#mainNav');
if(nav){const b=document.createElement('button');b.dataset.page='conferencia';b.innerHTML='<span class="ico">✔</span>Comissionamento de obra';b.addEventListener('click',()=>globalThis.go('conferencia'));nav.append(b)}
document.querySelectorAll('.sidebar-links > div').forEach(g=>{if(g.querySelector('.nav-label')&&!g.querySelector('.nav button'))g.remove()});
const previousGo=globalThis.go;
globalThis.go=function(page){
 if(page!=='conferencia')page='inicio';
 location.hash=page;
 document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const cr=document.getElementById('crumbCurrent');if(cr)cr.textContent=page==='inicio'?'Visão geral':'Comissionamento de obra';
 if(innerWidth<=680)document.querySelector('.sidebar').style.display='none';
 if(page==='inicio')overview();else start();
};
globalThis.go('inicio');
})();


/* =====================================================================
   OrceHVAC — módulo Comissionamento de obra (projeto × campo)
   Cadastro manual pelo escritório, planta clicável e conferência em campo.
   Dados: pasta do aplicativo (desktop) ou IndexedDB (navegador de revisão).
   ===================================================================== */
(()=>{
'use strict';
const APP_VERSION='0.9.1';
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
let S={obras:[],projetos:[],plantas:[],itens:[],marcas:[],usuarios:[],pend:[],aceites:[],modelos:[],conf:{},hist:[],cfg:{},del:{}};
const ui={view:'home',obraId:'',projetoId:'',disc:'',plantaId:'',pagina:1,placing:null,atab:'cad',
 fCat:'',fStatus:'',fPlanta:'',fBusca:'',pav:'',stFilter:new Set(STORDER),catFilter:'',side:(typeof innerWidth==='number'?innerWidth>=1000:true)};
let mode=localStorage.getItem('orcehvac.conf.modo')||'escritorio';
let user=localStorage.getItem('orcehvac.conf.usuario')||'';
let saveT=null;
function save(){stamp();schedSync();clearTimeout(saveT);saveT=setTimeout(()=>kvSet('state',S).then(()=>snapMaybe()).catch(e=>toast('Erro ao salvar: '+e)),150)}
const by=(arr,id)=>arr.find(x=>x.id===id);
const obra=id=>by(S.obras,id),proj=id=>by(S.projetos,id),planta=id=>by(S.plantas,id),item=id=>by(S.itens,id);
function logH(acao,ent,ref,desc,mud){S.hist.unshift({id:uid(),ts:new Date().toISOString(),user:user||'(sem nome)',acao,ent,ref,desc,mud:mud||[]});if(S.hist.length>3000)S.hist.length=3000}

/* ---------- Comparação projeto × obra ---------- */
const nums=s=>(String(s).replace(/,/g,'.').match(/\d+(?:\.\d+)?/g)||[]).map(Number);
const TOLS={vazao:.10,vazaoagua:.10,tensaoeq:.05},TOLK=Object.keys(TOLS); // tolerância só para cima: vazões +10%, tensão da energia +5%
const normT=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9.]/g,'');
function same(k,a,b){a=String(a??'').trim();b=String(b??'').trim();if(!a||!b)return a===b;
 if(TOLK.includes(k)){const x=nums(a),y=nums(b);if(x.length===1&&y.length===1)return y[0]>=x[0]-1e-9&&y[0]<=x[0]*(1+TOLS[k])+1e-9}
 if(F[k].num){const x=nums(a),y=nums(b);if(x.length&&y.length)return x.length===y.length&&x.every((v,i)=>v===y[i])}
 return normT(a)===normT(b)}
function diverg(id){const it=item(id),c=S.conf[id];if(!it||!c)return[];
 return CATS[it.cat].conf.filter(k=>{const pv=(it.campos[k]||'').trim();return pv&&!same(k,pv,c.campos[k]||'')})}
function statusOf(id){const c=S.conf[id];if(!c)return 'pendente';if(c.estado!=='finalizada')return 'em_conferencia';return (diverg(id).length||chkFails(id).length)?'divergente':'conferido'}
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
  <div class="cf-tools">${bellHTML()}<button class="btn sec" data-act="qrScan" title="Ler a etiqueta QR do equipamento com a câmera">📷 Ler QR</button><button class="btn sec usr-btn" data-act="user" title="Minha conta · trocar de usuário · sair">${user?avatar(user,true)+' <span>'+esc(user)+'</span> ▾':'👤 Entrar'}</button>
  ${canOffice()?`<div class="seg"><button data-act="mode" data-v="campo" class="${mode==='campo'?'on':''}">Campo</button><button data-act="mode" data-v="escritorio" class="${mode==='escritorio'?'on':''}">Escritório</button></div>`:'<span class="chip s-em_conferencia" title="Seu acesso é só para conferir em campo">Modo campo</span>'}</div>`;
 $('#cfNav').innerHTML=`<button data-act="nav" data-v="home" class="${v==='home'||v==='plant'?'active':''}">Início</button>
  ${hasP?`<button data-act="nav" data-v="itens" class="${v==='itens'?'active':''}">Itens</button><button data-act="nav" data-v="pend" class="${v==='pend'?'active':''}">Pendências${pendProj().filter(x=>x.estado!=='fechada').length?' <span class="tabn">'+pendProj().filter(x=>x.estado!=='fechada').length+'</span>':''}</button><button data-act="nav" data-v="painel" class="${v==='painel'?'active':''}">Painel</button><button data-act="nav" data-v="report" class="${v==='report'?'active':''}">Relatório</button>`:''}
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
function render(){guardMode();
 if(!root)return;
 renderTop();renderKpi();
 const m=$('#cfMain');m.className=ui.view==='plant'?'flush':'';
 ({home:viewHome,plant:viewPlant,itens:viewItens,pend:viewPend,painel:viewPainel,report:viewReport,admin:viewAdmin})[ui.view]();
}

/* ---------- Modal helpers ---------- */
function openModal(html,wide){$('#cfModal').innerHTML=`<div class="mbox ${wide?'wide':''}">${html}</div>`;$('#cfModal').onclick=e=>{if(e.target.id==='cfModal')closeModal()}}
function closeModal(){RET=null;$('#cfModal').innerHTML='';modalCleanup&&modalCleanup();modalCleanup=null}
let modalCleanup=null;
function fieldHTML(f){const v=f.value??'';const id='f_'+f.k;
 let inp;
 if(f.type==='select')inp=`<select id="${id}" ${f.chg?`data-chg="${f.chg}"`:''}>${f.options.map(o=>`<option value="${esc(o.v)}" ${o.v===v?'selected':''}>${esc(o.t)}</option>`).join('')}</select>`;
 else if(f.type==='date')inp=`<input id="${id}" type="date" value="${esc(v)}">`;
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root&&root.isConnected){if($('#cfModal').innerHTML)closeModal();else if(ui.placing){ui.placing=null;viewerUpdate()}else if(V&&V.cadManual){V.cadManual=false;viewerUpdate()}}});
ACT.closeModal=()=>{const r=RET;closeModal();if(r)openConf(r.id,r.draft)};
ACT.nav=b=>{ui.view=b.dataset.v;closeModal();render()};
ACT.mode=b=>{const v=b.dataset.v,ap=()=>{mode=v;localStorage.setItem('orcehvac.conf.modo',mode);if(mode==='campo'&&ui.view==='admin')ui.view='home';ui.placing=null;render()};if(v==='escritorio')askOffice(ap);else ap()};
async function needUser(){return !!me}

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
  <div class="pvbody"><div id="vp" class="${ui.placing||(V&&V.cadManual)?'placing':''}"><div id="stage"><canvas id="cv"></canvas><div id="mks"></div></div>
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
   if(!docCache[p.id]){const had=!!p.dxfExt;docCache[p.id]=dxfPrepare(await readText(blob),p);if(!had&&p.dxfExt)save()}
   const d=docCache[p.id];cv.style.display='none';ensureCv2();w=d.w;h=d.h;setTimeout(()=>dxfNote(d),0);
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
 V.z=Math.min(r.width/V.W,r.height/V.H)*.97;V.zf=null;V.tx=(r.width-V.W*V.z)/2;V.ty=(r.height-V.H*V.z)/2;V.zf=V.z;applyT()}
function applyT(){const st=$('#stage');if(!st)return;st.style.transform=`translate(${V.tx}px,${V.ty}px) scale(${V.z})`;if(V.p&&V.p.tipo==='dxf')drawDxfSoon();st.style.setProperty('--inv',(1/V.z).toFixed(4));st.classList.toggle('lbl',!!V.zf&&V.z>=V.zf*3);st.classList.toggle('nomk',!!ui.hideMk)}
function zoomAt(f,cx,cy){const vp=$('#vp').getBoundingClientRect();cx??=vp.width/2;cy??=vp.height/2;
 const nz=Math.max(.05,Math.min(25,V.z*f));f=nz/V.z;V.tx=cx-(cx-V.tx)*f;V.ty=cy-(cy-V.ty)*f;V.z=nz;applyT()}
function centerOn(nx,ny){const r=$('#vp').getBoundingClientRect();V.z=Math.max(V.z,Math.min(r.width/V.W*3,6));V.tx=r.width/2-nx*V.W*V.z;V.ty=r.height/2-ny*V.H*V.z;applyT()}
function setupPointer(){
 const vp=$('#vp');
 vp.addEventListener('wheel',e=>{e.preventDefault();const r=vp.getBoundingClientRect();zoomAt(e.deltaY<0?1.15:1/1.15,e.clientX-r.left,e.clientY-r.top)},{passive:false});
 vp.addEventListener('pointerdown',e=>{
  vp.setPointerCapture(e.pointerId);V.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(V.pts.size===1&&V.draw&&V.draw.tool!=='mao'){V.drag={draw:true};drawStart(e);renderDraw()}
  else if(V.pts.size===1){const bub=e.target.closest('.mkbub'),mk=bub?null:e.target.closest('.mk');V.drag={sx:e.clientX,sy:e.clientY,tx:V.tx,ty:V.ty,moved:false,mk:mk?mk.dataset.id:null,bub:bub?(e.target.closest('[data-bact]')?.dataset.bact||'x'):null,bid:bub?bub.parentNode.dataset.id:null}}
  else if(V.pts.size===2){const [a,b]=[...V.pts.values()];V.pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:V.z};if(V.dcur){V.dcur=null;renderDraw()}if(V.drag)V.drag.moved=true}
 });
 vp.addEventListener('pointermove',e=>{
  if(!V.pts.has(e.pointerId))return;V.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const r=vp.getBoundingClientRect();
  if(V.pts.size===2&&V.pinch){const [a,b]=[...V.pts.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);zoomAt(V.pinch.z*d/V.pinch.d/V.z,(a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top);return}
  const d=V.drag;if(!d)return;if(d.draw){if(V.pts.size===1)drawMove(e);return}const dx=e.clientX-d.sx,dy=e.clientY-d.sy;
  if(!d.moved&&Math.hypot(dx,dy)>6){d.moved=true;vp.classList.add('drag')}
  if(!d.moved)return;
  if(d.mk&&mode==='escritorio'){const nm=normCoords(e);const el=$(`.mk[data-id="${d.mk}"]`);if(el&&nm){el.style.left=nm.x*100+'%';el.style.top=nm.y*100+'%';d.pos=nm}}
  else{V.tx=d.tx+dx;V.ty=d.ty+dy;applyT()}
 });
 const up=e=>{
  if(!V.pts.has(e.pointerId))return;V.pts.delete(e.pointerId);vp.classList.remove('drag');
  if(V.pts.size<2)V.pinch=null;
  const d=V.drag;if(V.pts.size>0||!d)return;V.drag=null;if(d.draw){drawCommit();return}
  if(!d.moved){ if(d.bub){bubAct(d.bub,d.bid)} else if(d.mk)markerTap(d.mk); else if(V.cadManual){V.cadManual=false;const nm=normCoords(e);if(V.p.tipo==='dxf')pickDxf(e);viewerUpdate();manualCad(nm)} else if(ui.placing){const nm=normCoords(e);if(nm)placeMarker(ui.placing,nm.x,nm.y)} else if(V.p.tipo==='dxf'){clearSel();pickDxf(e)} else clearSel() }
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
function clearSel(){if(!V)return;V.sel=null;$$('.mk.sel').forEach(m=>{m.classList.remove('sel');m.querySelector('.mkbub')?.remove()})}
function selMk(id){if(!V)return;clearSel();const el=$(`.mk[data-id="${id}"]`);const it=item(id);if(!el||!it)return;V.sel=id;el.classList.add('sel');
 const st=statusOf(id),amb=it.campos.ambiente||'',off=mode==='escritorio';
 el.insertAdjacentHTML('beforeend',`<div class="mkbub"><div class="t">${esc(it.campos.tag)}</div><div class="m">${esc(CATS[it.cat].l)}${amb?' · '+esc(amb):''}</div><div class="s s-${st}">${ST[st]}</div>`+
  (off?`<div class="a" data-bact="conf">Ver conferência</div><div class="r"><div class="a sec" data-bact="edit">Editar</div><div class="a sec" data-bact="del">Remover ponto</div></div>`:`<div class="a" data-bact="conf">Conferir</div>`)+`</div>`)}
function bubAct(act,id){if(act==='conf')openConf(id);else if(act==='edit')itemForm(id);else if(act==='del'){ACT.mkDel({dataset:{id}});V.sel=null}}
function markerTap(id){if(V&&V.sel===id){clearSel();return markerClick(id)}selMk(id)}
function markerClick(id){
 if(mode==='campo')return openConf(id);
 const it=item(id);
 openModal(`<h3>${esc(it.campos.tag)} <span class="chip s-${statusOf(id)}">${ST[statusOf(id)]}</span></h3><p class="muted">${CATS[it.cat].l}</p>
 <div class="mfoot" style="justify-content:flex-start"><button class="btn sec" data-act="mkEdit" data-id="${id}">✎ Editar cadastro</button><button class="btn sec" data-act="mkConf" data-id="${id}">Ver conferência</button><button class="btn red" data-act="mkDel" data-id="${id}">Remover ponto</button><button class="btn sec" data-act="closeModal">Fechar</button></div>`);
}
ACT.mkEdit=b=>{closeModal();itemForm(b.dataset.id)};
ACT.mkConf=b=>{closeModal();openConf(b.dataset.id)};
ACT.mkDel=b=>{const id=b.dataset.id;S.marcas=S.marcas.filter(m=>m.itemId!==id);logH('editou','marcador',id,`Removeu o ponto de ${item(id)?.campos.tag}`);save();closeModal();viewerUpdate();renderKpi()};
document.addEventListener('input',e=>{if(e.target&&e.target.id==='dxq'&&V){clearTimeout(V.qt);V.qt=setTimeout(()=>{V.q=e.target.value.trim();V.hl=null;const n=$('#hlnote');if(n)n.dataset.k='';drawDxfSoon()},250)}});
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
  <button class="btn sec sm" data-act="sideT">☰ Lista</button><button class="btn sec sm" data-act="mkHide" aria-pressed="${ui.hideMk?'true':'false'}" title="Esconde os pontos para ver o desenho limpo">${ui.hideMk?'👁 Mostrar pontos':'👁 Ocultar pontos'}</button><button class="btn sec sm" data-act="drawT" aria-pressed="${V.draw?'true':'false'}" title="Desenhar círculos, setas e riscos sobre a planta">✏ ${V.draw?'Desenhando…':'Desenhar'}</button><button class="btn sec sm tbmore" data-act="tbMore" aria-expanded="${ui.tbOpen?'true':'false'}">⚙ Filtros e ferramentas${(ui.catFilter||V.room||V.duct||V.q)?' •':''}</button>${p.tipo==='dxf'?(docCache[p.id]?.rooms?.length?`<select id="roomSel" class="dxq" data-chg="roomF" title="Filtrar por ambiente"><option value="">Todos os ambientes (${docCache[p.id].rooms.length})</option>${roomOpts(docCache[p.id]).map(x=>`<option value="${x.i}" ${V.room===x.i?'selected':''}>${esc(x.r.n)} · ${String(x.r.A).replace('.',',')} m²</option>`).join('')}</select><button class="btn sec sm" data-act="roomList">📍 Por ambiente</button>`:'')+(Object.keys(docCache[p.id]?.kinds||{}).length?`<select id="ductSel" class="dxq" data-chg="ductF" title="Filtrar por tipo de duto"><option value="">Todos os dutos</option>${Object.keys(docCache[p.id].kinds).map(k=>`<option value="${k}" ${V.duct===k?'selected':''}>${esc(KINDS[k])}</option>`).join('')}</select><button class="btn sec sm" data-act="ductList">📏 Medidas dos dutos</button>`:'')+(mode==='escritorio'?'<button class="btn sm" data-act="dxfCad">➕ Cadastrar do desenho</button>':'')+'<input id="dxq" class="dxq" type="search" placeholder="Buscar texto no desenho…" value="'+esc(V.q||'')+'"><button class="btn sec sm" data-act="dxfList">🔎 Equipamentos do desenho</button>'+((docCache[p.id]?.clusters?.length||0)>1?`<button class="btn sec sm" data-act="dxfCl">🗺 Quadros (${docCache[p.id].clusters.length})</button>`:''):''}${mode==='escritorio'?`<button class="btn sm ${V.cadManual?'':'sec'}" data-act="cadManual" title="Clique na planta onde está um equipamento que o programa não identificou">${V.cadManual?'✋ Clique na planta…':'➕ Equipamento não identificado'}</button>`:''}`;
 $('#tb').classList.toggle('open',!!ui.tbOpen||!!V.cadManual);
 // marcadores
 const vis=here.filter(m=>{const it=item(m.itemId);return ui.stFilter.has(statusOf(it.id))&&(!ui.catFilter||it.cat===ui.catFilter)});
 const mk=$('#mks');if(mk)mk.innerHTML=vis.map(m=>{const it=item(m.itemId),s=statusOf(it.id);
  return `<div class="mk ${office?'office-drag':''}" data-id="${it.id}" style="left:${m.x*100}%;top:${m.y*100}%" title="${esc(it.campos.tag)} — ${ST[s]}"><i class="s-${s}">${CATS[it.cat].s}</i><b>${esc(it.campos.tag)}</b></div>`}).join('');if(V.sel){if(vis.some(m=>m.itemId===V.sel))selMk(V.sel);else V.sel=null}renderDraw();
 $('#vp')?.classList.toggle('placing',!!ui.placing||!!V.cadManual);
 if(p.tipo==='dxf'){V.hl=null;drawDxfSoon()}
 // lateral
 const row=it=>{const s=statusOf(it.id);return `<div class="si" data-act="goItem" data-id="${it.id}"><span class="cfdot" style="background:${STC[s]}"></span><b>${esc(it.campos.tag)}</b><span class="muted">${CATS[it.cat].l}</span></div>`};
 let sd='';
 if(V.cadManual)sd+=`<div class="banner">Clique na planta <b>onde está o equipamento</b> que não foi identificado. <a href="#" data-act="cancelPlace" onclick="return false">Cancelar (Esc)</a></div>`;
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
ACT.mkHide=b=>{ui.hideMk=!ui.hideMk;if(ui.hideMk)clearSel();const st=$('#stage');if(st)st.classList.toggle('nomk',ui.hideMk);if(b){b.textContent=ui.hideMk?'👁 Mostrar pontos':'👁 Ocultar pontos';b.setAttribute('aria-pressed',ui.hideMk?'true':'false')}};
ACT.tbMore=()=>{ui.tbOpen=!ui.tbOpen;const t=$('#tb');if(t)t.classList.toggle('open',ui.tbOpen);const b=t&&t.querySelector('.tbmore');if(b)b.setAttribute('aria-expanded',ui.tbOpen?'true':'false')};
ACT.sideT=()=>{ui.side=!ui.side;$('#side').classList.toggle('hide',!ui.side)};
ACT.startPlace=b=>{ui.placing=b.dataset.id;viewerUpdate()};
ACT.cancelPlace=(b,e)=>{e.preventDefault();ui.placing=null;if(V)V.cadManual=false;viewerUpdate()};
ACT.goItem=b=>{const m=marcaDe(b.dataset.id);if(!m)return;
 const go=()=>{centerOn(m.x,m.y);setTimeout(()=>{const el=$(`.mk[data-id="${m.itemId}"]`);el?.classList.add('hl');selMk(m.itemId);setTimeout(()=>el?.classList.remove('hl'),2200)},50)};
 if((m.pagina||1)!==ui.pagina){ui.pagina=m.pagina||1;loadPage().then(()=>{viewerUpdate();go()})}else go()};

/* ---------- Leitor/renderizador de DXF ---------- */
async function readText(blob){const buf=await blob.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch(e){return new TextDecoder('windows-1252').decode(buf)}}
function dxfColor(c){let r=(c>>16)&255,g=(c>>8)&255,b=c&255;if(r>235&&g>235&&b>235)return '#000';
 const lum=(0.299*r+0.587*g+0.114*b)/255;if(lum>.72){r*=.55;g*=.55;b*=.55}return `rgb(${r|0},${g|0},${b|0})`}
function rawScan(text){
 const L=text.split(/\r?\n/),out={ins:new Map(),hatches:[],types:{}};let sec='',cur=null,last=null;
 const G=(g,c)=>{const x=g.find(a=>a[0]===c);return x?x[1]:undefined},N=(g,c,d=0)=>{const v=G(g,c);const n=parseFloat(v);return isNaN(n)?d:n};
 const rad=a=>a*Math.PI/180;
 const arc=(cx,cy,r,a0,a1,ccw)=>{if(!ccw)[a0,a1]=[a1,a0];a0=rad(a0);a1=rad(a1);while(a1<=a0)a1+=Math.PI*2;const k=Math.max(8,Math.ceil((a1-a0)/(Math.PI*2)*64)),o=[];for(let i=0;i<=k;i++){const a=a0+(a1-a0)*i/k;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}return o};
 function hatch(g){const loops=[];let i=g.findIndex(a=>a[0]===91);if(i<0)return loops;let nl=parseInt(g[i][1]);i++;
  while(nl-->0&&i<g.length){while(i<g.length&&g[i][0]!==92)i++;if(i>=g.length)break;const flag=parseInt(g[i][1]);i++;const pts=[];
   if(flag&2){let hb=0;while(i<g.length&&g[i][0]!==93){if(g[i][0]===72)hb=parseInt(g[i][1]);i++}const nv=parseInt(g[i]?.[1]||0);i++;
    let k=0,x=null;while(i<g.length&&k<nv){const c=g[i][0];if(c===10){x=parseFloat(g[i][1])}else if(c===20){pts.push([x,parseFloat(g[i][1])]);k++}i++}
    if(pts.length)pts.push(pts[0])}
   else{while(i<g.length&&g[i][0]!==93)i++;let ne=parseInt(g[i]?.[1]||0);i++;
    while(ne-->0&&i<g.length){while(i<g.length&&g[i][0]!==72)i++;const t=parseInt(g[i][1]);i++;const e={};
     while(i<g.length&&![72,97,92,75,98].includes(g[i][0])){const c=g[i][0];if(!(c in e))e[c]=parseFloat(g[i][1]);i++}
     if(t===1)pts.push([e[10],e[20]],[e[11],e[21]]);
     else if(t===2)pts.push(...arc(e[10],e[20],e[40],e[50],e[51],e[73]!==0));
     else if(t===3){const mx=e[11],my=e[21],a=Math.hypot(mx,my),b=a*e[40],rot=Math.atan2(my,mx);const a0=rad(e[50]||0);let a1=rad(e[51]??360);if(e[73]===0)[a1]=[a1];for(let q=0;q<=48;q++){const t2=a0+(a1-a0)*q/48,X=a*Math.cos(t2),Y=b*Math.sin(t2);pts.push([e[10]+X*Math.cos(rot)-Y*Math.sin(rot),e[20]+X*Math.sin(rot)+Y*Math.cos(rot)])}}}}
   if(pts.length>1)loops.push(pts)}
  return loops}
 const flush=()=>{if(!cur)return;const g=cur.g,t=cur.t;if(t!=='ATTRIB'&&t!=='SEQEND'&&t!=='VERTEX')out.types[t]=(out.types[t]||0)+1;
  if(t==='INSERT'){const o={name:G(g,2)||'',x:N(g,10),y:N(g,20),attrs:[]};const k=o.name+'|'+Math.round(o.x*100)+','+Math.round(o.y*100);(out.ins.get(k)||out.ins.set(k,[]).get(k)).push(o);last=o}
  else if(t==='ATTRIB'){if(last&&!(N(g,70)&1)){const al=N(g,72)||N(g,74);last.attrs.push({tag:G(g,2)||'',text:(G(g,1)||'').trim(),x:al&&G(g,11)!==undefined?N(g,11):N(g,10),y:al&&G(g,21)!==undefined?N(g,21):N(g,20),h:N(g,40,1),rot:N(g,50)})}}
  else{last=null;if(t==='HATCH')out.hatches.push({ly:G(g,8)||'0',ps:N(g,67)===1,loops:hatch(g)})}
  cur=null};
 for(let i=0;i+1<L.length;i+=2){const c=parseInt(L[i]),v=L[i+1].replace(/\r$/,'').trim();if(isNaN(c))continue;
  if(c===0){if(sec==='ENTITIES')flush();if(v==='SECTION'){}else if(v==='ENDSEC'){sec=''}else if(sec==='ENTITIES')cur={t:v,g:[]};continue}
  if(c===2&&!cur&&i>0&&L[i-2].trim()==='0'&&L[i-1].trim()==='SECTION'){sec=v;continue}
  if(cur)cur.g.push([c,v])}
 flush();return out}
function clusterPts(pts){
 let ax=1e308,ay=1e308,bx=-1e308,by=-1e308;for(const v of pts){if(v[0]<ax)ax=v[0];if(v[0]>bx)bx=v[0];if(v[1]<ay)ay=v[1];if(v[1]>by)by=v[1]}
 const span=Math.max(bx-ax,by-ay)||1,s=span/300,K=(i,j)=>i*100003+j,cells=new Map();
 for(const v of pts){const i=Math.floor((v[0]-ax)/s),j=Math.floor((v[1]-ay)/s),k=K(i,j);cells.set(k,(cells.get(k)||0)+1)}
 const comp=new Map();let nc=0;const R=3;
 for(const k0 of cells.keys()){if(comp.has(k0))continue;const id=nc++;const st=[k0];comp.set(k0,id);
  while(st.length){const k=st.pop(),i=Math.round(k/100003),j=k-i*100003;
   for(let di=-R;di<=R;di++)for(let dj=-R;dj<=R;dj++){const k2=K(i+di,j+dj);if(cells.has(k2)&&!comp.has(k2)){comp.set(k2,id);st.push(k2)}}}}
 const cl=Array.from({length:nc},()=>({x0:1e308,y0:1e308,x1:-1e308,y1:-1e308,n:0}));
 for(const v of pts){const c=cl[comp.get(K(Math.floor((v[0]-ax)/s),Math.floor((v[1]-ay)/s)))];if(v[0]<c.x0)c.x0=v[0];if(v[0]>c.x1)c.x1=v[0];if(v[1]<c.y0)c.y0=v[1];if(v[1]>c.y1)c.y1=v[1];c.n++}
 cl.sort((a,b)=>b.n-a.n);const tot=pts.length;const keep=cl.filter(c=>c.n>=Math.max(5,tot*.003));return keep.length?keep:[cl[0]]}

/* ===== AMBIENTES (salas): nome + área escrita no desenho, ex. "SUB-POSTO DE ENFERMAGEM" / "15.48m²" ===== */
const AREA_RE=/^\s*(\d+(?:[.,]\d+)?)\s*m\s*[²2]\s*$/i;
const NOT_NAME=/^\s*P\.?\s*D\.?\s*[=:]|\d\s*[x×]\s*\d|m\s*[³3]\s*\/\s*h|^[\d\s.,x×\/+-]+$|m\s*[²2]\s*$/i;
function polyArea(p){let a=0;for(let i=0,n=p.length-1;i<n;i++)a+=p[i][0]*p[i+1][1]-p[i+1][0]*p[i][1];return Math.abs(a)/2}
function inPoly(p,x,y){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
function findRooms(prims){
 const texts=prims.filter(q=>q.t==='t');
 const eqW=[...Object.values(CATS).map(c=>normS(c.l)),...Object.keys(CATS)].filter(w=>w.length>=4);
 const ok=s=>{const l=s.replace(/\s+/g,' ').trim();return l.length>=3&&/[a-zA-ZÀ-ú]{3}/.test(l)&&!NOT_NAME.test(l)&&!eqW.some(w=>normS(l).includes(w))};
 const areaT=[],cand=[];
 for(const t of texts){const ls=t.s.split('\n').map(x=>x.trim()).filter(Boolean);const ai=ls.findIndex(l=>AREA_RE.test(l));
  if(ai>=0)areaT.push({t,A:parseFloat(ls[ai].match(AREA_RE)[1].replace(',','.')),own:ls.filter((l,i)=>i!==ai&&ok(l))});
  else if(ok(t.s))cand.push(t)}
 const rooms=[];
 for(const a of areaT){if(!(a.A>0.5&&a.A<20000))continue;const t=a.t;let names=[...a.own],box={x0:t.x0,y0:t.y0,x1:t.x1,y1:t.y1};
  if(!names.length){let cur=t,prevH=0;for(let k=0;k<3;k++){const h=cur.h||t.h,ext=2*h;let best=null,bd=1e308;const cy0=(cur.y0+cur.y1)/2;
   for(const c of cand){if(c===cur)continue;const dy=(c.y0+c.y1)/2-cy0;if(dy<=0||dy>h*4.2+(cur.y1-cur.y0))continue;if(c.x1<cur.x0-ext||c.x0>cur.x1+ext)continue;if(k>0&&Math.abs(c.h-prevH)>prevH*.25)continue;
    const d=dy+Math.abs(((c.x0+c.x1)-(cur.x0+cur.x1))/2)*.3;if(d<bd){bd=d;best=c}}
   if(!best)break;names.unshift(best.s.replace(/\s+/g,' ').trim());prevH=best.h;cur=best;box={x0:Math.min(box.x0,best.x0),y0:Math.min(box.y0,best.y0),x1:Math.max(box.x1,best.x1),y1:Math.max(box.y1,best.y1)}}}
  const n=names.join(' ').replace(/\s+/g,' ').trim()||'Ambiente sem nome';
  rooms.push({n,A:a.A,cx:(t.x0+t.x1)/2,cy:(t.y0+t.y1)/2,lb:box,th:t.h,poly:null,pa:0})}
 if(!rooms.length)return rooms;
 // polígonos fechados que contêm o rótulo e têm área parecida com a área escrita
 const polys=[];for(const q of prims){if(q.t!=='l'||q.p.length<4)continue;const a=q.p[0],b=q.p[q.p.length-1];if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-3)continue;polys.push(q)}
 const cands=rooms.map(r=>{const o=[];for(const q of polys){if(r.cx<q.x0||r.cx>q.x1||r.cy<q.y0||r.cy>q.y1)continue;if(inPoly(q.p,r.cx,r.cy))o.push({q,a:polyArea(q.p)})}return o});
 const FS=[1,1e4,1e6];let bf=0,bc=-1;FS.forEach((f,fi)=>{let c=0;rooms.forEach((r,i)=>{if(cands[i].some(x=>x.a>=r.A*f*.75&&x.a<=r.A*f*1.3))c++});if(c>bc){bc=c;bf=fi}});
 const hs=rooms.map(r=>r.th).sort((a,b)=>a-b),mh=hs[hs.length>>1]||1;
 const f=bc>=Math.max(2,rooms.length*.1)?FS[bf]:(mh<1?1:mh<30?1e4:1e6);
 rooms.forEach((r,i)=>{let best=null,bd=1e308;for(const x of cands[i]){const rt=x.a/(r.A*f);if(rt<.75||rt>1.3)continue;const dv=Math.abs(Math.log(rt));if(dv<bd){bd=dv;best=x}}
  const half=Math.sqrt(r.A*f)/2*1.1;
  if(best){r.poly=best.q.p;r.pa=best.a;r.bb={x0:best.q.x0,y0:best.q.y0,x1:best.q.x1,y1:best.q.y1}}
  else{r.pa=r.A*f;r.half=half;r.bb={x0:r.cx-half,y0:r.cy-half,x1:r.cx+half,y1:r.cy+half}}});
 return rooms}
function roomOf(d,x,y){const R=d.rooms;if(!R||!R.length)return -1;let best=-1,ba=1e308;
 R.forEach((r,i)=>{if(r.poly&&x>=r.bb.x0&&x<=r.bb.x1&&y>=r.bb.y0&&y<=r.bb.y1&&r.pa<ba&&inPoly(r.poly,x,y)){ba=r.pa;best=i}});
 if(best>=0)return best;let bd=1e308;
 R.forEach((r,i)=>{if(r.poly)return;const dx=Math.abs(x-r.cx),dy=Math.abs(y-r.cy);if(dx<=r.half&&dy<=r.half){const dd=Math.hypot(dx,dy)/r.half;if(dd<bd){bd=dd;best=i}}});
 if(best>=0)return best;
 R.forEach((r,i)=>{if(r.poly)return;const dd=Math.hypot(x-r.cx,y-r.cy)/r.half;if(dd<=1.9&&dd<bd){bd=dd;best=i}});return best}

/* ===== TIPOS DE DUTO (pela camada/cor do desenho) + medidas escritas (40x20, Ø250) ===== */
const KINDS={insuf:'Insuflamento',ret:'Retorno',exaust:'Exaustão',ext:'Renovação de ar (ar externo)',gord:'Exaustão de gordura',flex:'Duto flexível'};
function kindOfName(n){const k=normS(n);if(/gordur/.test(k))return'gord';if(/flexiv/.test(k))return'flex';if(!/duto|insufla|retorno|exaust|renova|externo/.test(k))return'';
 if(/insufla/.test(k))return'insuf';if(/retorno/.test(k))return'ret';if(/exaust/.test(k))return'exaust';if(/externo|renova/.test(k))return'ext';return''}
function segDist(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy;let t=L?((x-a[0])*dx+(y-a[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)}
function ductScan(layers,prims){
 const cm=new Map(),kc={};
 for(const [n,L] of Object.entries(layers)){const k=kindOfName(L.name||n);if(!k||L.color==null)continue;const c=dxfColor(L.color);if(cm.has(c)&&cm.get(c)!==k)cm.set(c,'?');else cm.set(c,k);kc[k]=kc[k]||c}
 const kinds={},dp=[];
 for(const q of prims){if(q.t!=='l')continue;let k=kindOfName(q.ly);if(!k){const m=cm.get(q.c);if(m&&m!=='?')k=m}
  if(k){q.k=k;kinds[k]=(kinds[k]||0)+1;kc[k]=kc[k]||q.c;dp.push(q)}}
 const dims=[];
 if(dp.length)for(const t of prims){if(t.t!=='t')continue;
  for(const ln of t.s.split('\n')){const l=ln.trim(),m=l.match(/^(\d{1,4})\s*[xX×]\s*(\d{1,4})$/),o=l.match(/^[Øø]\s*(\d{2,4})$/);if(!m&&!o)continue;
   const txt=m?m[1]+'×'+m[2]:'Ø'+o[1],tol=Math.max(t.h*2.5,1e-9),cx=(t.x0+t.x1)/2,cy=(t.y0+t.y1)/2;let best=null,bd=1e308;
   for(const q of dp){if(t.x1+tol<q.x0||t.x0-tol>q.x1||t.y1+tol<q.y0||t.y0-tol>q.y1)continue;for(let i=1;i<q.p.length;i++){const dd=segDist(cx,cy,q.p[i-1],q.p[i]);if(dd<bd){bd=dd;best=q}}}
   if(best&&bd<=tol)dims.push({txt,t,q:best,k:best.k,cx,cy,room:-1})}}
 return{dims,kinds,kc}}
function dxfPrepare(text,pl){
 const dxf=new DxfParser().parseSync(text);if(!dxf)throw new Error('DXF inválido');
 let raw={ins:new Map(),hatches:[],types:{}};try{raw=rawScan(text)}catch(e){console.warn('rawScan',e)}
 const recs=[];let curLy='0';
 const mc=document.createElement('canvas').getContext('2d');mc.font='100px Arial,sans-serif';
 const mkT=(x,y,h,rot,s,c,ly,al,vv)=>{const ls=s.split('\n'),n=ls.length;let W=0;for(const l of ls)W=Math.max(W,mc.measureText(l).width/100*h);
  // vv: 'top'|'mid'|'bot'|'base' -> ajusta a linha de base da primeira linha
  const lh=h*1.2;let by=y;if(vv==='top')by=y-h*.9;else if(vv==='mid')by=y+n*lh/2-h*.9;else if(vv==='bot')by=y+(n-1)*lh+h*.25;
  // retângulo local (x para a direita, y para cima) em relação ao ponto de ancoragem
  const lx0=al==='center'?-W/2:al==='right'?-W:0,lx1=lx0+W,ly1=h*.95,ly0=-(n-1)*lh-h*.25,co=Math.cos(rot),si=Math.sin(rot);
  const cs=[[lx0,ly0],[lx1,ly0],[lx1,ly1],[lx0,ly1]].map(([a,b])=>[x+a*co-b*si,by+a*si+b*co]);
  return{t:'t',x,y:by,h,rot,s,c,ly,al:al||'left',x0:Math.min(...cs.map(q=>q[0])),x1:Math.max(...cs.map(q=>q[0])),y0:Math.min(...cs.map(q=>q[1])),y1:Math.max(...cs.map(q=>q[1]))}};
 const layers=dxf.tables?.layer?.layers||{},prims=[];
 const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
 const ap=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
 const arcPts=(cx,cy,r,a0,a1,n)=>{while(a1<=a0)a1+=Math.PI*2;const k=Math.max(8,Math.ceil((a1-a0)/(Math.PI*2)*n));const o=[];for(let i=0;i<=k;i++){const a=a0+(a1-a0)*i/k;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}return o};
 const bulgeSeg=(p,q,bu)=>{const th=4*Math.atan(bu),dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);if(!d)return[];const r=d/(2*Math.sin(th/2)),mx=(p.x+q.x)/2,my=(p.y+q.y)/2,h=r*Math.cos(th/2);const cx=mx-dy/d*h,cy=my+dx/d*h;let a0=Math.atan2(p.y-cy,p.x-cx);const o=[],k=Math.max(4,Math.ceil(Math.abs(th)/(Math.PI*2)*64));for(let i=1;i<k;i++){const a=a0+th*i/k;o.push({x:cx+Math.abs(r)*Math.cos(a),y:cy+Math.abs(r)*Math.sin(a)})}return o};
 const visible=e=>{const L=layers[e.layer];return!(L&&(L.visible===false||L.frozen))&&e.visible!==false};
 const colOf=(e,inh)=>{let c=e.color;if(e.colorIndex===256||c==null||e.colorIndex===0){c=layers[e.layer]?.color;if(e.colorIndex===0&&inh!=null)c=inh}return c==null?0:c};
 const emit=(pts,c,closed)=>{if(pts.length>1)prims.push({t:'l',p:pts,c,ly:curLy})};
 function walk(ents,m,inh,depth){
  for(const e of ents||[]){if(!visible(e))continue;curLy=e.layer||'0';const c=dxfColor(colOf(e,inh));
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
    case 'TEXT':case 'MTEXT':case 'ATTRIB':{let pos=e.startPoint||e.position;if(!pos)break;let tx=String(e.text||'');if(e.type==='MTEXT')tx=tx.replace(/\\P/g,'\n').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'');
     const h=(e.textHeight||e.height||1)*Math.hypot(m[0],m[1]);const rot=Math.atan2(m[1],m[0])+(e.rotation||0)*Math.PI/180;let al='left',vv='base';
     if(e.type==='MTEXT'){const a=e.attachmentPoint||1;al=[1,4,7].includes(a)?'left':[2,5,8].includes(a)?'center':'right';vv=a<=3?'top':a<=6?'mid':'bot'}
     else if((e.halign||e.valign)&&e.endPoint){pos=e.endPoint;al=[1,4].includes(e.halign)?'center':e.halign===2?'right':'left';vv=e.valign===3?'top':e.valign===2?'mid':e.valign===1?'bot':'base'}
     const [x,y]=ap(m,pos.x,pos.y);if(tx.trim())prims.push(mkT(x,y,h,rot,tx,c,curLy,al,vv));break}
    case 'INSERT':{if(depth>8)break;const b=dxf.blocks?.[e.name];if(!b||!b.entities)break;const bp=b.position||{x:0,y:0};
     const sx=e.xScale||1,sy=e.yScale||1,r=(e.rotation||0)*Math.PI/180,co=Math.cos(r),si=Math.sin(r);
     const cols=e.columnCount||1,rows=e.rowCount||1;const i0=prims.length,insLy=e.layer||'0';
     for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
      const px=e.position.x+j*(e.columnSpacing||0),py=e.position.y+i*(e.rowSpacing||0);
      const T=[co*sx,si*sx,-si*sy,co*sy,px,py];let M=mul(m,mul(T,[1,0,0,1,-bp.x,-bp.y]));
      walk(b.entities,M,colOf(e,inh),depth+1)}
     const attrs=[];if(depth===0){const k=e.name+'|'+Math.round(e.position.x*100)+','+Math.round(e.position.y*100);const lst=raw.ins.get(k);const o=lst&&lst.shift();
      if(o)o.attrs.forEach(a=>{attrs.push({tag:a.tag,text:a.text});if(a.text)prims.push(mkT(a.x,a.y,a.h,a.rot*Math.PI/180,a.text,dxfColor(colOf(e,inh)),insLy,'left','base'))})}
     recs.push({name:e.name,ly:insLy,i0,i1:prims.length,attrs,d:depth});curLy=insLy;break}
    case 'DIMENSION':{if(depth>8||!e.block)break;const b=dxf.blocks?.[e.block];if(b?.entities)walk(b.entities,m,null,depth+1);break}
   }}catch(err){}
  }}
 const allE=dxf.entities||[],modelE=allE.filter(e=>!e.inPaperSpace),paperE=allE.filter(e=>e.inPaperSpace);
 walk(modelE,[1,0,0,1,0,0],null,0);let usedPaper=false;
 if(!prims.length&&!raw.hatches.some(h=>!h.ps&&h.loops.length)&&paperE.length){walk(paperE,[1,0,0,1,0,0],null,0);usedPaper=true}
 raw.hatches.filter(h=>h.ps===usedPaper).forEach(h=>{const L=layers[h.ly];if(L&&(L.visible===false||L.frozen))return;const c=dxfColor(L?.color??0);curLy=h.ly;h.loops.forEach(pts=>emit(pts,c))});
 if(!prims.length)throw new Error('O DXF não tem desenhos legíveis (linhas, polilinhas, arcos ou textos).');
 // caixa de cada elemento (para cortar o que está fora da tela) e extensão
 for(const q of prims){if(q.t==='l'){let a=1e308,b=1e308,c=-1e308,d2=-1e308;for(const v of q.p){if(v[0]<a)a=v[0];if(v[0]>c)c=v[0];if(v[1]<b)b=v[1];if(v[1]>d2)d2=v[1]}q.x0=a;q.y0=b;q.x1=c;q.y1=d2}
  }
 const pts=[];prims.forEach(q=>{if(q.t==='l')q.p.forEach(v=>pts.push(v));else pts.push([q.x,q.y])});
 const clusters=clusterPts(pts);
 if(pl&&(pl.dxfV||0)<2){delete pl.dxfExt;pl.dxfV=2;pl.dxfCl=0}
 let ext=pl&&pl.dxfExt;
 if(!ext){const c=clusters[Math.min(pl?.dxfCl||0,clusters.length-1)]||clusters[0],mx=(c.x1-c.x0)*.04||1,my=(c.y1-c.y0)*.04||1;
  ext={x0:c.x0-mx,y0:c.y0-my,w:c.x1-c.x0+2*mx,h:c.y1-c.y0+2*my};if(pl)pl.dxfExt=ext}
 const inserts=recs.map(r=>{let a=1e308,b=1e308,c=-1e308,d2=-1e308;const texts=[];for(let i=r.i0;i<r.i1;i++){const q=prims[i];if(!q)continue;if(q.x0<a)a=q.x0;if(q.y0<b)b=q.y0;if(q.x1>c)c=q.x1;if(q.y1>d2)d2=q.y1;if(q.t==='t')texts.push(q.s.replace(/\s+/g,' ').trim())}
  return a>c?null:{name:r.name,ly:r.ly,x0:a,y0:b,x1:c,y1:d2,attrs:r.attrs,texts,d:r.d,i0:r.i0,i1:r.i1}}).filter(Boolean);
 const SUP=new Set(['LINE','LWPOLYLINE','POLYLINE','CIRCLE','ARC','ELLIPSE','SPLINE','SOLID','3DFACE','LEADER','TEXT','MTEXT','INSERT','DIMENSION','HATCH','ATTDEF','POINT']);
 const xrefs=Object.entries(dxf.blocks||{}).filter(([n,b])=>b&&b.xrefPath).map(([n,b])=>b.xrefPath||n);
 const unsup=Object.entries(raw.types).filter(([t])=>!SUP.has(t)).sort((a,b)=>b[1]-a[1]);
 const diag={model:modelE.length,paper:paperE.length,usedPaper,xrefs,unsup,nprims:prims.length,types:raw.types};
 let rooms=[];try{rooms=findRooms(prims)}catch(e){console.warn('rooms',e)}
 let ds={dims:[],kinds:{},kc:{}};try{ds=ductScan(layers,prims)}catch(e){console.warn('duct',e)}
 const R={prims,x0:ext.x0,y0:ext.y0,w:ext.w,h:ext.h,inserts,texts:prims.filter(q=>q.t==='t'),nIns:recs.length,diag,clusters,rooms,dims:ds.dims,kinds:ds.kinds,kc:ds.kc};
 if(rooms.length)R.dims.forEach(m=>{m.room=roomOf(R,m.cx,m.cy)});
 return R;
}
function dxfNote(d){
 $('#dxfnote')?.remove();if(!d||!d.diag)return;const g=d.diag,msg=[];
 if(g.xrefs.length)msg.push(`<b>Este DXF usa referências externas (XREF)</b>: ${g.xrefs.slice(0,4).map(esc).join(', ')}. O conteúdo delas <u>não está dentro do arquivo</u> e por isso não aparece. No AutoCAD: <i>XREF › selecione tudo › Vincular (Bind)</i> e salve o DXF de novo.`);
 if(g.usedPaper)msg.push('Só foi encontrada a <b>folha (layout)</b>; o espaço do modelo está vazio. Abra o desenho no AutoCAD e salve o DXF com o desenho dentro do modelo.');
 if(g.unsup.length)msg.push('Elementos ainda não suportados (ignorados): '+g.unsup.slice(0,6).map(([t,n])=>esc(t)+' ×'+n).join(', ')+'.');
 if(g.nprims<40&&!g.xrefs.length&&!g.usedPaper)msg.push('Poucos elementos foram lidos ('+g.nprims+').');
 if(!msg.length)return;
 const n=document.createElement('div');n.id='dxfnote';const head=g.xrefs.length?`⚠ Desenho incompleto: ${g.xrefs.length} referência(s) externa(s) (XREF) não estão no arquivo`:g.usedPaper?'⚠ Só a folha (layout) foi encontrada':'ℹ Avisos sobre este DXF';
 n.innerHTML=`<details><summary>${head} <span class="muted">— ver detalhes</span></summary>${msg.map(m=>'<div>'+m+'</div>').join('')}</details><button class="x" data-act="noteClose">✕</button>`;
 $('#vp')?.append(n);n.addEventListener('pointerdown',e=>e.stopPropagation());n.addEventListener('pointerup',e=>e.stopPropagation())}
ACT.noteClose=()=>$('#dxfnote')?.remove();
function insStrings(d,r){const s=[...r.attrs.map(a=>a.text),...r.texts].filter(Boolean);if(s.length)return[...new Set(s)];
 const cx=(r.x0+r.x1)/2,cy=(r.y0+r.y1)/2,R=Math.max(r.x1-r.x0,r.y1-r.y0)*1.6+1e-9,c=[];
 for(const t of d.texts){const dist=Math.hypot((t.x0+t.x1)/2-cx,(t.y0+t.y1)/2-cy);if(dist<=R+(t.x1-t.x0)/2)c.push({s:t.s.replace(/\s+/g,' ').trim(),dist})}
 return[...new Set(c.sort((a,b)=>a.dist-b.dist).slice(0,2).map(x=>x.s).filter(Boolean))]}
ACT.dxfCl=()=>{const d=docCache[V.p.id];if(!d)return;const cur=V.p.dxfExt;
 openModal(`<h3>Quadros do desenho</h3><p class="muted">Este DXF tem mais de um desenho separado (por exemplo, folha/carimbo e a planta). Escolha qual mostrar. O maior costuma ser a planta com os equipamentos.</p>
 ${d.clusters.map((c,i)=>`<div class="si" data-act="dxfSetCl" data-i="${i}"><b>Quadro ${i+1}</b><span class="muted">${c.n.toLocaleString('pt-BR')} elementos · ${Math.round(c.x1-c.x0)} × ${Math.round(c.y1-c.y0)} un.</span>${cur&&Math.abs(cur.x0+cur.w*.5-(c.x0+c.x1)/2)<cur.w*.5+1e-6&&Math.abs(cur.w-(c.x1-c.x0)*1.08)<cur.w*.02?'<span class="chip s-conferido">em uso</span>':''}</div>`).join('')}
 <div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
ACT.dxfSetCl=b=>{const p=V.p,n=S.marcas.filter(m=>m.plantaId===p.id).length;
 if(n&&!confirm(`Trocar de quadro move a escala da planta e remove os ${n} ponto(s) já posicionados nela. Continuar?`))return;
 S.marcas=S.marcas.filter(m=>m.plantaId!==p.id);delete p.dxfExt;p.dxfV=2;p.dxfCl=+b.dataset.i;delete docCache[p.id];save();closeModal();loadPage().then(()=>viewerUpdate())};
ACT.dxfList=()=>{const d=docCache[V?.p.id];if(!d||!d.inserts)return;
 const skip=n=>/^[*]|^A\$C|^_|^ARCH/i.test(n);
 const rows=[];d.inserts.forEach((r,i)=>{if(r.d>0||skip(r.name))return;const strs=insStrings(d,r);const its=matchItems(strs);rows.push({r,i,strs:strs.slice(0,3),its,rm:d.rooms&&d.rooms.length?roomOf(d,(r.x0+r.x1)/2,(r.y0+r.y1)/2):-1})});
 const grp=new Map();rows.forEach(x=>{(grp.get(x.r.name)||grp.set(x.r.name,[]).get(x.r.name)).push(x)});
 const html=[...grp.entries()].sort((a,b)=>b[1].length-a[1].length).map(([name,l])=>`<details ${grp.size<=6?'open':''}><summary><b>${esc(name)}</b> <span class="muted">× ${l.length}</span></summary>${l.slice(0,60).map(x=>`<div class="si" data-act="dxfGo" data-i="${x.i}"><span>${x.strs.length?esc(x.strs.join(' · ')):'<i class="muted">sem texto</i>'}${x.rm>=0?` <span class="muted">· 📍 ${esc(d.rooms[x.rm].n)}</span>`:''}</span>${x.its.length?`<span class="chip s-${statusOf(x.its[0].id)}">${esc(x.its[0].campos.tag)}</span>`:''}</div>`).join('')}${l.length>60?'<div class="muted">… mais '+(l.length-60)+'</div>':''}</details>`).join('');
 openModal(`<h3>Blocos / equipamentos no desenho</h3><p class="muted">Clique em um item para ir até ele na planta.</p><div style="max-height:60vh;overflow:auto">${html||'<div class="muted">Nenhum bloco encontrado neste desenho.</div>'}</div><div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
ACT.dxfGo=b=>{const d=docCache[V.p.id],r=d.inserts[+b.dataset.i];if(!r)return;closeModal();
 const cx=(r.x0+r.x1)/2,cy=(r.y0+r.y1)/2,nx=(cx-d.x0)/d.w,ny=1-(cy-d.y0)/d.h,r2=$('#vp').getBoundingClientRect(),sc=Math.min(r2.width/(Math.max(r.x1-r.x0,1)*8),60);
 const targetZ=Math.min(25,Math.max(V.z,(r2.width/V.W)*0.4*(d.w/Math.max(r.x1-r.x0,d.w/400))/8));
 V.z=Math.min(25,Math.max(targetZ,V.z));V.tx=r2.width/2-nx*V.W*V.z;V.ty=r2.height/2-ny*V.H*V.z;applyT();
 const strs=insStrings(d,r);V.pickHl=r;V.pick={x:nx,y:ny};drawDxfSoon();
 V.pickLbl=r.name+(strs[0]?' · '+strs[0]:'');showPick({title:V.pickLbl,name:r.name,layer:r.ly,strings:[...new Set(strs)].slice(0,8),items:matchItems(strs),tagAttr:r.attrs.find(a=>a.text)?.text});drawDxfSoon()};
function ensureCv2(){const vp=$('#vp');if(!vp)return null;let c=$('#cv2');if(!c){c=document.createElement('canvas');c.id='cv2';c.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';vp.insertBefore(c,vp.firstChild);$('#stage')?.classList.add('dxf')}return c}
const normS=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const hlOn=()=>!!(ui.catFilter||V.q||V.room!=null||V.duct!=null);
function collectEq(d,cats,qk){
 const items=projItens(V.p.projetoId).filter(i=>cats.includes(i.cat));
 const kwOf=k=>[normS(CATS[k].l),k,...((cfg().kw&&cfg().kw[k])||[]).map(normS)].filter(c=>c.length>=2);
 const all=[...cats.flatMap(kwOf),...(qk?[qk]:[])].filter(c=>c.length>=2);
 const catOf=str=>{const k=normS(str);return cats.find(c=>kwOf(c).some(w=>k.includes(w)))||''};
 const ik=items.map(i=>({i,k:tagKey(i.campos.tag)})).filter(x=>x.k.length>=2),hit=k=>ik.find(x=>k===x.k||(x.k.length>=3&&k.includes(x.k)&&k.length<=x.k.length+12));
 const out=[],used=new Set();
 d.inserts.forEach(r=>{if(r.d>0)return;const strs=insStrings(d,r);let it=null;for(const s of strs){const m=hit(tagKey(s));if(m){it=m.i;break}}
  const byName=all.some(c=>normS(r.name).includes(c));if(it||byName){out.push({r,it,cat:it?it.cat:catOf(r.name+' '+strs.join(' ')),label:it?it.campos.tag:(strs[0]||r.name)});if(it)used.add(it.id)}});
 const tu=new Set();
 for(const t of d.texts){const m=hit(tagKey(t.s));if(m&&!used.has(m.i.id)){out.push({box:t,it:m.i,cat:m.i.cat,label:m.i.campos.tag});used.add(m.i.id);tu.add(t)}}
 for(const t of d.texts){if(tu.has(t))continue;const k=normS(t.s);if(all.some(c=>k.includes(c))){const l=t.s.split('\n')[0].replace(/\s+/g,' ').trim();out.push({box:t,it:null,cat:catOf(t.s),label:l.length>26?l.slice(0,25)+'…':l})}}
 if(d.rooms&&d.rooms.length)for(const o of out){const b=o.r||o.box;o.room=roomOf(d,(b.x0+b.x1)/2,(b.y0+b.y1)/2)}
 return{out,items:items.length,found:used.size}}
function hlCompute(d){
 const room=V.room!=null&&d.rooms?d.rooms[V.room]:null;
 const cats=ui.catFilter?[ui.catFilter]:(room&&!V.q&&V.duct==null?Object.keys(CATS):[]);
 if(!cats.length&&!V.q&&!room&&V.duct==null)return null;
 const qk=V.q?normS(V.q):'';
 const c=(cats.length||qk)?collectEq(d,cats,qk):{out:[],items:0,found:0};
 const list=room?c.out.filter(o=>o.room===V.room):c.out;
 return{list,items:c.items,found:c.found,room}}
function drawHl(ctx,d,X,Y,sc){
 if(!V.hl)V.hl=hlCompute(d)||{list:[],items:0,found:0};const h=V.hl;
 for(const o of h.list){const b=o.r||o.box,pad=o.r?Math.max(b.x1-b.x0,b.y1-b.y0)*.3+5/sc:Math.min(b.y1-b.y0,b.x1-b.x0)*.12+2.5/sc;const col=o.it?STC[statusOf(o.it.id)]:'#1769e0';
  if(o.r){ctx.strokeStyle=col;ctx.lineWidth=2.4;ctx.beginPath();for(let i=o.r.i0;i<o.r.i1;i++){const q=d.prims[i];if(!q||q.t!=='l')continue;ctx.moveTo(X(q.p[0][0]),Y(q.p[0][1]));for(let k=1;k<q.p.length;k++)ctx.lineTo(X(q.p[k][0]),Y(q.p[k][1]))}ctx.stroke()}
  const x=X(b.x0-pad),y=Y(b.y1+pad),w=(b.x1-b.x0+2*pad)*sc,hh=(b.y1-b.y0+2*pad)*sc;
  ctx.fillStyle=col+'26';ctx.strokeStyle=col;ctx.lineWidth=2;ctx.fillRect(x,y,w,hh);ctx.strokeRect(x,y,w,hh);
  if((b.x1-b.x0+2*pad)*sc<46)continue;
  ctx.font='700 12px Arial,sans-serif';const tw=ctx.measureText(o.label).width+12;ctx.fillStyle=col;ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y-20,tw,18,5):ctx.rect(x,y-20,tw,18);ctx.fill();ctx.fillStyle='#fff';ctx.textBaseline='middle';ctx.fillText(o.label,x+6,y-11)}
 return h}
function hlNote(h){let n=$('#hlnote');if(!h||!hlOn()){n?.remove();return}
 if(!n){n=document.createElement('div');n.id='hlnote';$('#vp')?.append(n);['pointerdown','pointerup','wheel'].forEach(t=>n.addEventListener(t,e=>e.stopPropagation()))}
 const cat=ui.catFilter?CATS[ui.catFilter].l:'',kws=(cat&&cfg().kw&&cfg().kw[ui.catFilter])||[];
 let msg,extra='';const dk=V.duct!=null?ductBlock(docCache[V.p.id]):null,only=V.duct!=null&&!ui.catFilter&&!V.q&&!h.room;
 if(only){msg=dk.msg;extra=dk.extra}
 else if(h.room){const by={};h.list.forEach(o=>{const k=o.cat?CATS[o.cat].l:'Outros';by[k]=(by[k]||0)+1});
  msg=`📍 Ambiente <b>${esc(h.room.n)}</b> · ${String(h.room.A).replace('.',',')} m²${dk&&!cat&&!V.q?'':'<br>'+(h.list.length?`<b>${h.list.length}</b> equipamento(s)${cat?' de '+esc(cat):''} neste ambiente: ${Object.entries(by).map(([k,v])=>v+' '+esc(k)).join(' · ')}`:`Nenhum equipamento${cat?' de '+esc(cat):''}${V.q?' com “'+esc(V.q)+'”':''} identificado dentro deste ambiente.`)}`;
  extra=h.list.slice(0,14).map((o,i)=>`<a href="#" class="hl-go" data-act="hlGo" data-i="${i}">${esc(o.label)}</a>`).join('');if(dk){msg+='<br>'+dk.msg;extra+=dk.extra}}
 else msg=h.list.length?`${cat?`Filtro <b>${esc(cat)}</b>: `:''}${V.q?`busca “${esc(V.q)}”: `:''}<b>${h.list.length}</b> destacado(s) no desenho${h.items?` · ${h.found} de ${h.items} item(ns) do projeto achados pela TAG`:''}.`
  :`${cat?`Filtro <b>${esc(cat)}</b>: `:''}nada encontrado no desenho${V.q?` para “${esc(V.q)}”`:''}. Este DXF pode não ter essa palavra escrita; use a busca acima com o texto que aparece no desenho (ex.: FC, AR-04) e salve como palavra-chave.`;
 const key=msg+extra+'|'+kws.join(',')+'|'+!!V.q;if(n.dataset.k===key)return;n.dataset.k=key;
 n.innerHTML=msg+(extra?`<div class="hl-list">${extra}</div>`:'')+(kws.length&&!h.room&&!only?`<div class="muted" style="margin-top:4px">Palavras-chave de ${esc(cat)}: ${kws.map(esc).join(', ')} <a href="#" data-act="kwClear">limpar</a></div>`:'')+(cat&&V.q&&!h.room&&!only?`<div style="margin-top:6px"><button class="btn sm" data-act="kwSave">Salvar “${esc(V.q)}” como palavra-chave de ${esc(cat)}</button></div>`:'')}

function ductDims(d){return(d.dims||[]).filter(m=>m.k===V.duct&&(V.room==null||m.room===V.room))}
function ductBlock(d){const dm=ductDims(d),col=d.kc[V.duct]||'#1769e0',nm=KINDS[V.duct];V.dl=[];const g=new Map();
 dm.forEach(m=>{if(!g.has(m.txt)){V.dl.push(m);g.set(m.txt,{n:0,i:V.dl.length-1})}g.get(m.txt).n++});
 const sc=V.room!=null?' dentro do ambiente <b>'+esc(d.rooms[V.room].n)+'</b>':'';
 const msg=`<span style="color:${col};font-size:16px">■</span> Duto de <b>${esc(nm)}</b>${sc}: `+(dm.length?`<b>${dm.length}</b> medida(s) escrita(s) no desenho.`:'nenhuma medida escrita encontrada para este tipo de duto aqui.');
 const extra=[...g.entries()].sort((a,b)=>b[1].n-a[1].n).slice(0,24).map(([t,v])=>`<a href="#" class="hl-go" data-act="dGo" data-i="${v.i}">${esc(t)}${v.n>1?' ×'+v.n:''}</a>`).join('');
 return{msg,extra}}
ACT.dGo=(b,e)=>{e?.preventDefault();const d=docCache[V.p.id],m=V.dl?.[+b.dataset.i];if(!d||!m)return;zoomBox(d,m.t.x0,m.t.y0,m.t.x1,m.t.y1,.12)};
function drawDuct(ctx,d,X,Y,sc,vx0,vx1,vy0,vy1){if(V.duct==null)return;const k=V.duct,col=d.kc[k]||'#1769e0',r=V.room!=null&&d.rooms?d.rooms[V.room]:null;
 ctx.save();if(r){ctx.beginPath();if(r.poly)r.poly.forEach((v,i)=>i?ctx.lineTo(X(v[0]),Y(v[1])):ctx.moveTo(X(v[0]),Y(v[1])));else ctx.rect(X(r.bb.x0),Y(r.bb.y1),(r.bb.x1-r.bb.x0)*sc,(r.bb.y1-r.bb.y0)*sc);ctx.clip()}
 ctx.lineWidth=2.8;ctx.strokeStyle=col;ctx.beginPath();
 for(const p of d.prims){if(p.k!==k||p.x1<vx0||p.x0>vx1||p.y1<vy0||p.y0>vy1)continue;const v=p.p;ctx.moveTo(X(v[0][0]),Y(v[0][1]));for(let i=1;i<v.length;i++)ctx.lineTo(X(v[i][0]),Y(v[i][1]))}
 ctx.stroke();ctx.restore();
 ctx.font='700 12px Arial,sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';
 for(const m of ductDims(d)){if(m.cx<vx0||m.cx>vx1||m.cy<vy0||m.cy>vy1)continue;const tw=ctx.measureText(m.txt).width+12,x=X(m.cx)-tw/2,y=Y(m.cy)-9;
  ctx.fillStyle='#0a2a52';ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,tw,18,5):ctx.rect(x,y,tw,18);ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#fff';ctx.fillText(m.txt,x+6,y+9.5)}}
CHG.ductF=b=>{V.duct=b.value||null;V.hl=null;const n=$('#hlnote');if(n)n.dataset.k='';drawDxfSoon()};
ACT.ductList=()=>{const d=docCache[V?.p.id];if(!d)return;V.dl=[];
 const html=Object.keys(d.kinds).map(k=>{const dm=d.dims.filter(m=>m.k===k),g=new Map();dm.forEach(m=>{if(!g.has(m.txt)){V.dl.push(m);g.set(m.txt,{n:0,i:V.dl.length-1,k})}g.get(m.txt).n++});
  return`<div class="pk-l"><span style="color:${d.kc[k]||'#999'}">■</span> ${esc(KINDS[k])} · ${d.kinds[k]} trechos desenhados · ${dm.length} medida(s) escrita(s)</div><div class="hl-list" style="max-height:none">${[...g.entries()].sort((a,b)=>b[1].n-a[1].n).map(([t,v])=>`<a href="#" class="hl-go" data-act="dMod" data-k="${k}" data-i="${v.i}">${esc(t)}${v.n>1?' ×'+v.n:''}</a>`).join('')||'<span class="muted">sem medida escrita</span>'}</div>`}).join('');
 openModal(`<h3>Dutos do desenho</h3><p class="muted">O tipo de cada duto vem da cor/camada do desenho. A medida é a escrita sobre o duto (em cm, padrão de projeto: largura × altura; Ø = diâmetro). Clique numa medida para ir até ela.</p><div style="max-height:60vh;overflow:auto">${html||'<div class="muted">Este DXF não tem camadas de duto identificáveis (insuflamento, retorno, exaustão, ar externo).</div>'}</div><div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
ACT.dMod=(b,e)=>{e?.preventDefault();const d=docCache[V.p.id],m=V.dl?.[+b.dataset.i];if(!m)return;closeModal();V.duct=b.dataset.k;V.hl=null;const sel=$('#ductSel');if(sel)sel.value=V.duct;const n=$('#hlnote');if(n)n.dataset.k='';zoomBox(d,m.t.x0,m.t.y0,m.t.x1,m.t.y1,.12)};

/* ===== CADASTRAR EQUIPAMENTOS DIRETO DO DESENHO (difusor/grelha/damper… sem TAG) ===== */
const STOPW=new Set(['DE','DA','DO','DAS','DOS','E','A','O','PARA','COM','EM']);
function roomCode(n){const w=normS(n).toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(x=>x&&!STOPW.has(x));if(!w.length)return'SA';
 const num=w.filter(x=>/^\d+$/.test(x)),txt=w.filter(x=>!/^\d+$/.test(x));
 return(txt.length===1?txt[0].slice(0,3):txt.slice(0,4).map(x=>x[0]).join(''))+num.join('')}
const NOTE_RE=/prever|nota\b|observa|conforme|detalhe|desce\b|sobe\b/i;
function planCad(d,cat,room){
 const pid=V.p.id,cats=cat==='*'?Object.keys(CATS):[cat],c=collectEq(d,cats,'');
 let list=c.out.filter(o=>!o.it&&o.cat);
 list=list.filter(o=>{const t=o.box?o.box.s:insStrings(d,o.r).join('\n'),f=t.split('\n')[0];return f.length<=60&&!NOTE_RE.test(f)});
 if(room!==''&&room!=null)list=list.filter(o=>o.room===+room);
 const done=new Set(S.itens.filter(i=>i.projetoId===V.p.projetoId&&i.src).map(i=>i.src));
 const rows=list.map(o=>{const b=o.r||o.box,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;return{o,cat:o.cat,cx,cy,src:'dxf:'+pid+':'+Math.round(cx*100)+','+Math.round(cy*100),room:o.room>=0?d.rooms[o.room]:null}});
 const fresh=rows.filter(r=>!done.has(r.src));
 fresh.sort((a,b)=>(!a.room-!b.room)||(a.room&&b.room?a.room.n.localeCompare(b.room.n,'pt-BR')||a.room.A-b.room.A:0)||Object.keys(CATS).indexOf(a.cat)-Object.keys(CATS).indexOf(b.cat)||b.cy-a.cy||a.cx-b.cx);
 const used=new Set(projItens(V.p.projetoId).map(i=>String(i.campos.tag||'').toUpperCase())),cnt=new Map();
 for(const r of fresh){const pre=CATS[r.cat].s,code=r.room?roomCode(r.room.n):'SA',key=pre+'-'+code;let n=cnt.get(key)||0,tag;do{n++;tag=key+'-'+String(n).padStart(2,'0')}while(used.has(tag));cnt.set(key,n);used.add(tag);r.tag=tag;
  const txt=r.o.box?r.o.box.s:insStrings(d,r.o.r).join('\n'),pl=prettyLabel(txt),vm=txt.match(/(\d+(?:[.,]\d+)?)\s*m\s*[³3]\s*\/\s*h/i),P=CATS[r.cat].proj,cp={tag,pavimento:V.p.pav||'',modelo:pl.title,dimensoes:pl.dims[0]?pl.dims[0].replace(/[×X]/g,'x'):'',vazao:vm?vm[1]+' m³/h':'',fabricante:/trox/i.test(txt)?'Trox':'',quantidade:'1'};
  if(r.room){cp.ambiente=r.room.n;cp.localizacao=r.room.n}
  r.campos={};for(const k of P)if(cp[k])r.campos[k]=cp[k]}
 return{rows,fresh,done:rows.length-fresh.length}}
function cadModal(cat,room){const d=docCache[V.p.id];if(!d)return;const pl=planCad(d,cat,room);V.cadPlan={cat,pl};
 const ro=d.rooms&&d.rooms.length?roomOpts(d):[];
 const byCat={},byRoom=new Map();pl.fresh.forEach(r=>{byCat[r.cat]=(byCat[r.cat]||0)+1;const k=r.room?r.room.n:'Sem ambiente identificado';const m=byRoom.get(k)||{n:0,c:{}};m.n++;m.c[r.cat]=(m.c[r.cat]||0)+1;byRoom.set(k,m)});
 openModal(`<h3>Cadastrar a partir do desenho</h3>
 <p class="muted">Equipamentos sem TAG no projeto (difusores, grelhas, dampers…): o programa cria a TAG sozinho — <b>tipo + ambiente + número</b>, ex.: <b>D-ENF08-01</b> — preenche modelo, medida, vazão e ambiente com o que está escrito no desenho e já coloca cada ponto na planta.</p>
 <div class="two"><div class="pr"><label>Categoria</label><select data-chg="cadCat"><option value="*" ${cat==='*'?'selected':''}>Todas as categorias</option>${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${k===cat?'selected':''}>${c.l}</option>`).join('')}</select></div>
 <div class="pr"><label>Onde</label><select data-chg="cadRoom"><option value="">Toda a planta</option>${ro.map(x=>`<option value="${x.i}" ${String(x.i)===String(room)?'selected':''}>${esc(x.r.n)} · ${String(x.r.A).replace('.',',')} m²</option>`).join('')}</select></div></div>
 <div class="cad-sum"><div class="cad-n"><b>${pl.fresh.length}</b><span>para cadastrar</span></div>${pl.done?`<div class="cad-n"><b>${pl.done}</b><span>já cadastrados</span></div>`:''}
  <div class="cad-chips">${Object.entries(byCat).map(([k,n])=>`<span class="pk-chip c">${n} ${esc(CATS[k].l)}</span>`).join('')}</div></div>
 ${pl.fresh.length?`<div class="cad-list">${[...byRoom.entries()].slice(0,40).map(([k,m])=>`<div class="cad-r"><span>📍 <b>${esc(k)}</b></span><span class="muted">${Object.entries(m.c).map(([c,n])=>n+' '+esc(CATS[c].l)).join(' · ')}</span></div>`).join('')}${byRoom.size>40?`<div class="muted">… e mais ${byRoom.size-40} ambiente(s)</div>`:''}</div>
 <div class="pk-l">Exemplos de TAG</div><div class="cad-tags">${pl.fresh.slice(0,8).map(r=>`<span class="pk-chip">${esc(r.tag)}</span>`).join('')}</div>`
 :`<div class="muted" style="margin-top:10px">Nada novo para cadastrar com este filtro. O programa procura no desenho textos com o nome da categoria (ex.: “DIFUSOR”, “GRELHA”) ou as palavras-chave salvas.</div>`}
 <div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" data-act="cadGo" ${pl.fresh.length?'':'disabled'}>Cadastrar ${pl.fresh.length}</button></div>`)}
let cadSel={cat:'*',room:''};
CHG.cadCat=b=>{cadSel.cat=b.value;cadModal(cadSel.cat,cadSel.room)};
CHG.cadRoom=b=>{cadSel.room=b.value;cadModal(cadSel.cat,cadSel.room)};
ACT.dxfCad=()=>{cadSel={cat:ui.catFilter||'*',room:V.room!=null?String(V.room):''};cadModal(cadSel.cat,cadSel.room)};
ACT.cadGo=()=>{const d=docCache[V.p.id],P=V.cadPlan;if(!d||!P||!P.pl.fresh.length)return;const {pl}=P;
 for(const r of pl.fresh){const it={id:uid(),projetoId:V.p.projetoId,cat:r.cat,campos:r.campos,src:r.src};S.itens.push(it);
  S.marcas.push({id:uid(),itemId:it.id,plantaId:V.p.id,pagina:ui.pagina,x:(r.cx-d.x0)/d.w,y:1-(r.cy-d.y0)/d.h})}
 logH('criou','item','',`Cadastrou ${pl.fresh.length} equipamento(s) a partir do desenho ${V.p.nome}`);save();closeModal();V.hl=null;viewerUpdate();toast(pl.fresh.length+' equipamento(s) cadastrado(s) e posicionado(s) na planta')};
/* botão na tela de Itens: abre a planta DXF e já pergunta o que cadastrar */
function cadWhenReady(id){let n=0;const t=setInterval(()=>{n++;const d=docCache[id];if(d&&d.prims&&V&&V.p.id===id){clearInterval(t);ACT.dxfCad()}else if(n>200)clearInterval(t)},300)}
ACT.cadItens=()=>{const pls=S.plantas.filter(p=>p.projetoId===ui.projetoId&&p.tipo==='dxf');
 if(!pls.length){alert('Este projeto ainda não tem planta DXF. Envie uma em Administração › Enviar planta.');return}
 if(pls.length===1){openPlanta(pls[0].id);cadWhenReady(pls[0].id);return}
 openModal(`<h3>De qual planta cadastrar?</h3>${pls.map(p=>`<div class="si" data-act="cadPick" data-id="${p.id}"><b>${esc(p.nome)}</b><span class="muted">${esc([p.pav,p.disc].filter(Boolean).join(' · '))}</span></div>`).join('')}<div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
ACT.cadPick=b=>{closeModal();openPlanta(b.dataset.id);cadWhenReady(b.dataset.id)};

/* ===== CADASTRO MANUAL: equipamento que o programa não identificou no desenho ===== */
function suggestTag(cat,roomName){const pre=CATS[cat].s,code=roomName?roomCode(roomName):'SA',key=pre+'-'+code,used=new Set(projItens(V.p.projetoId).map(i=>String(i.campos.tag||'').toUpperCase()));let n=0,tag;do{n++;tag=key+'-'+String(n).padStart(2,'0')}while(used.has(tag));return tag}
function manualCad(nm){if(!nm)return;const lp=V.lastPick&&Math.abs(V.lastPick.x-nm.x)<1e-9&&Math.abs(V.lastPick.y-nm.y)<1e-9?V.lastPick:null,pl=lp&&lp.pl,room=lp&&lp.room;
 const cat=(pl&&pl.cat)||ui.catFilter||'difusor',txt=lp?(lp.txt||[]).join(' '):'',vm=txt.match(/(\d+(?:[.,]\d+)?)\s*m\s*[³3]\s*\/\s*h/i),campos={};
 if(V.p.pav)campos.pavimento=V.p.pav;if(pl&&pl.cat&&pl.title){campos.modelo=pl.title;if(pl.dims[0])campos.dimensoes=pl.dims[0].replace(/[×X]/g,'x')}
 if(vm)campos.vazao=vm[1]+' m³/h';if(/trox/i.test(txt))campos.fabricante='Trox';if(room){campos.ambiente=room.n;campos.localizacao=room.n}
 itemForm(null,{cat,campos,place:{x:nm.x,y:nm.y},autoTag:c=>suggestTag(c,room?room.n:'')})}
ACT.cadManual=()=>{V.cadManual=!V.cadManual;ACT.pickClose&&ACT.pickClose();viewerUpdate();if(V.cadManual)toast('Clique na planta onde está o equipamento')};
ACT.pickCad=()=>{if(V?.pick)manualCad(V.pick)};
function zoomBox(d,x0,y0,x1,y1,frac){const r2=$('#vp').getBoundingClientRect();
 const w=Math.max(x1-x0,d.w/2000),h=Math.max(y1-y0,d.h/2000);
 V.z=Math.max(1,Math.min(40,Math.min(r2.width*frac*d.w/(w*V.W),r2.height*frac*d.h/(h*V.H))));
 const nx=((x0+x1)/2-d.x0)/d.w,ny=1-((y0+y1)/2-d.y0)/d.h;V.tx=r2.width/2-nx*V.W*V.z;V.ty=r2.height/2-ny*V.H*V.z;applyT()}
function roomBox(r){const b=r.bb,l=r.lb;return{x0:Math.min(b.x0,l.x0),y0:Math.min(b.y0,l.y0),x1:Math.max(b.x1,l.x1),y1:Math.max(b.y1,l.y1)}}
function drawRoom(ctx,d,X,Y,sc){const r=V.room!=null&&d.rooms?d.rooms[V.room]:null;if(!r)return;
 ctx.save();ctx.fillStyle='rgba(245,158,11,.17)';ctx.strokeStyle='#f59e0b';ctx.lineWidth=3;ctx.lineJoin='round';
 if(r.poly){ctx.beginPath();r.poly.forEach((v,i)=>i?ctx.lineTo(X(v[0]),Y(v[1])):ctx.moveTo(X(v[0]),Y(v[1])));ctx.closePath();ctx.fill();ctx.stroke()}
 else{ctx.setLineDash([8,5]);const x=X(r.bb.x0),y=Y(r.bb.y1),w=(r.bb.x1-r.bb.x0)*sc,h=(r.bb.y1-r.bb.y0)*sc;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.setLineDash([])}
 const tx=r.n+' · '+String(r.A).replace('.',',')+' m²';ctx.font='700 13px Arial,sans-serif';const tw=ctx.measureText(tx).width+16,bx=X(r.bb.x0),by=Y(r.bb.y1)-26;
 ctx.fillStyle='#b45309';ctx.beginPath();ctx.roundRect?ctx.roundRect(bx,by,tw,22,6):ctx.rect(bx,by,tw,22);ctx.fill();ctx.fillStyle='#fff';ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillText(tx,bx+8,by+11);ctx.restore()}
ACT.hlGo=(b,e)=>{e?.preventDefault();const d=docCache[V.p.id],o=V.hl?.list[+b.dataset.i];if(!d||!o)return;const x=o.r||o.box;zoomBox(d,x.x0,x.y0,x.x1,x.y1,.18)};
const roomOpts=d=>(d.rooms||[]).map((r,i)=>({r,i})).sort((a,b)=>a.r.n.localeCompare(b.r.n,'pt-BR')||a.r.A-b.r.A);
function setRoom(i,zoom){V.room=(i===''||i==null||i<0)?null:+i;V.hl=null;const n=$('#hlnote');if(n)n.dataset.k='';const sel=$('#roomSel');if(sel)sel.value=V.room==null?'':String(V.room);
 const d=docCache[V.p.id];if(d&&V.room!=null&&zoom){const b=roomBox(d.rooms[V.room]);zoomBox(d,b.x0,b.y0,b.x1,b.y1,.55)}drawDxfSoon()}
CHG.roomF=b=>setRoom(b.value,true);
ACT.roomPick=b=>{try{closeModal()}catch(e){}setRoom(+b.dataset.i,true)};
ACT.roomList=()=>{const d=docCache[V?.p.id];if(!d||!d.rooms?.length)return;
 const c=collectEq(d,Object.keys(CATS),'');const by=new Map();c.out.forEach(o=>{const k=o.room==null?-1:o.room;(by.get(k)||by.set(k,[]).get(k)).push(o)});
 const line=l=>{const m={};l.forEach(o=>{const k=o.cat?CATS[o.cat].l:'Outros';m[k]=(m[k]||0)+1});return Object.entries(m).map(([k,v])=>v+' '+k).join(' · ')};
 const withEq=roomOpts(d).filter(x=>by.has(x.i)),without=roomOpts(d).filter(x=>!by.has(x.i));
 openModal(`<h3>Equipamentos por ambiente</h3><p class="muted">O programa lê o nome e a área de cada sala no desenho e associa cada equipamento à sala onde ele está. Clique no ambiente para vê-lo na planta.</p>
 <div style="max-height:60vh;overflow:auto">${withEq.map(x=>`<div class="si" data-act="roomPick" data-i="${x.i}"><span><b>${esc(x.r.n)}</b> <span class="muted">${String(x.r.A).replace('.',',')} m²</span><br><span class="muted">${esc(line(by.get(x.i)))}</span></span><span class="chip">${by.get(x.i).length}</span></div>`).join('')||'<div class="muted">Nenhum equipamento foi associado a ambientes.</div>'}
 ${by.has(-1)?`<div class="si"><span><b>Fora de qualquer ambiente</b><br><span class="muted">${esc(line(by.get(-1)))}</span></span><span class="chip">${by.get(-1).length}</span></div>`:''}
 ${without.length?`<details><summary class="muted">${without.length} ambiente(s) sem equipamento identificado</summary>${without.map(x=>`<div class="si" data-act="roomPick" data-i="${x.i}"><span>${esc(x.r.n)} <span class="muted">${String(x.r.A).replace('.',',')} m²</span></span></div>`).join('')}</details>`:''}</div>
 <div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
ACT.kwSave=()=>{const k=ui.catFilter,q=(V.q||'').trim();if(!k||!q)return;const c=cfg();c.kw=c.kw||{};c.kw[k]=[...new Set([...(c.kw[k]||[]),q])];save();V.hl=null;const n=$('#hlnote');if(n)n.dataset.k='';drawDxfSoon();toast('Palavra-chave salva em '+CATS[k].l)};
ACT.kwClear=(b,e)=>{e?.preventDefault();const k=ui.catFilter;if(k&&cfg().kw){delete cfg().kw[k];save();V.hl=null;const n=$('#hlnote');if(n)n.dataset.k='';drawDxfSoon()}};
function drawDxfSoon(){if(!V||V.raf)return;V.raf=requestAnimationFrame(()=>{if(V)V.raf=0;drawDxfView()})}
function drawDxfView(){
 const cv=$('#cv2');if(!cv||!V||V.p.tipo!=='dxf')return;const d=docCache[V.p.id];if(!d||!d.prims)return;
 const vp=$('#vp'),r=vp.getBoundingClientRect(),dpr=Math.min(3,globalThis.devicePixelRatio||1);
 const W=Math.max(1,Math.round(r.width*dpr)),H=Math.max(1,Math.round(r.height*dpr));if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}
 const ctx=cv.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);ctx.scale(dpr,dpr);
 const sc=V.W*V.z/d.w,ox=V.tx,oy=V.ty+V.H*V.z,X=x=>ox+(x-d.x0)*sc,Y=y=>oy-(y-d.y0)*sc;
 ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,.3)';ctx.shadowBlur=14;ctx.fillRect(V.tx,V.ty,V.W*V.z,V.H*V.z);ctx.shadowBlur=0;
 ctx.save();ctx.beginPath();ctx.rect(V.tx,V.ty,V.W*V.z,V.H*V.z);ctx.clip();
 const vx0=d.x0+(0-ox)/sc,vx1=d.x0+(r.width-ox)/sc,vy1=d.y0+oy/sc,vy0=d.y0+(oy-r.height)/sc;
 ctx.lineWidth=1.2;ctx.lineJoin='round';ctx.lineCap='round';
 if(hlOn()){if(!V.hl)V.hl=hlCompute(d)||{list:[],items:0,found:0};if(V.hl.list.length||V.room!=null||V.duct!=null)ctx.globalAlpha=.3}
 let cur=null;const flush=()=>{if(cur!==null){ctx.stroke();cur=null}};
 for(const p of d.prims){
  if(p.x1<vx0||p.x0>vx1||p.y1<vy0||p.y0>vy1)continue;
  if(p.t==='l'){if((p.x1-p.x0)*sc<.4&&(p.y1-p.y0)*sc<.4)continue;
   if(cur!==p.c){flush();ctx.strokeStyle=p.c;ctx.beginPath();cur=p.c}
   const v=p.p;ctx.moveTo(X(v[0][0]),Y(v[0][1]));for(let i=1;i<v.length;i++)ctx.lineTo(X(v[i][0]),Y(v[i][1]))}
  else{const px=p.h*sc;if(px<3.5)continue;flush();ctx.save();ctx.translate(X(p.x),Y(p.y));ctx.rotate(-p.rot);ctx.fillStyle=p.c;ctx.font=`${px}px Arial,sans-serif`;ctx.textBaseline='alphabetic';ctx.textAlign=p.al||'left';
   p.s.split('\n').forEach((ln,i)=>ctx.fillText(ln,0,i*px*1.2));ctx.restore()}
 }
 flush();ctx.globalAlpha=1;
 if(hlOn()){drawRoom(ctx,d,X,Y,sc);drawDuct(ctx,d,X,Y,sc,vx0,vx1,vy0,vy1);const hh=drawHl(ctx,d,X,Y,sc);hlNote(hh)}else hlNote(null);
 const h=V.pickHl;if(h){ctx.fillStyle='rgba(23,105,224,.14)';ctx.strokeStyle='#1769e0';ctx.lineWidth=2;const a=X(h.x0),b=Y(h.y1),w=(h.x1-h.x0)*sc,hh=(h.y1-h.y0)*sc;ctx.fillRect(a,b,w,hh);ctx.strokeRect(a,b,w,hh)}
 if(V.pickLbl&&h){const tx=V.pickLbl;ctx.font='700 14px Arial,sans-serif';const tw=ctx.measureText(tx).width+22,cx=(X(h.x0)+X(h.x1))/2;let lx=Math.max(8,Math.min(r.width-tw-8,cx-tw/2)),ly=Y(h.y1)-38;if(ly<6)ly=Y(h.y0)+14;ctx.save();ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=10;ctx.fillStyle='#0a2a52';ctx.beginPath();ctx.roundRect?ctx.roundRect(lx,ly,tw,28,8):ctx.rect(lx,ly,tw,28);ctx.fill();ctx.restore();ctx.fillStyle='#fff';ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillText(tx,lx+11,ly+14)}
 ctx.restore();
}
/* clique na planta DXF: mostra nome do bloco/equipamento e a TAG */
const tagKey=s=>normT(String(s||''));
function matchItems(strings){const keys=strings.map(tagKey).filter(k=>k.length>=2),found=new Map();
 for(const it of projItens(V.p.projetoId)){const tk=tagKey(it.campos.tag);if(tk.length<2)continue;
  if(keys.some(k=>k===tk||(tk.length>=3&&k.includes(tk)&&k.length<=tk.length+12)))found.set(it.id,it)}
 return[...found.values()]}
function prettyLabel(s){const ls=String(s||'').split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);const title=ls[0]||'';
 const dims=[...new Set((title.match(/\d+(?:[.,]\d+)?\s*[x×X]\s*\d+(?:[.,]\d+)?/g)||[]).map(x=>x.replace(/\s+/g,'')))];
 const cat=Object.entries(CATS).find(([k,c])=>normS(title).includes(normS(c.l)));
 return{title,extra:ls.slice(1),dims,cat:cat?cat[0]:''}}
function pickDxf(e){
 const d=docCache[V.p.id];if(!d||!d.prims)return;const nm=normCoords(e);if(!nm)return;
 const sc=V.W*V.z/d.w,x=d.x0+nm.x*d.w,y=d.y0+(1-nm.y)*d.h,tol=10/sc;
 let best=null;for(const r of d.inserts){if(x<r.x0-tol||x>r.x1+tol||y<r.y0-tol||y>r.y1+tol)continue;const a=(r.x1-r.x0)*(r.y1-r.y0);if(r.d>0&&a>d.w*d.h*.2)continue;if(!best||a<best.a)best={r,a}}
 // texto mais provável: o que está sob o clique, ou o rótulo mais próximo
 let tHit=null,bs=1e308;const maxd=70/sc;
 for(const t of d.texts){const dx=Math.max(t.x0-x,0,x-t.x1),dy=Math.max(t.y0-y,0,y-t.y1),dist=Math.hypot(dx,dy);if(dist>maxd)continue;const sc2=dist===0?-1+(t.x1-t.x0)*(t.y1-t.y0)/(d.w*d.h):dist;if(sc2<bs){bs=sc2;tHit=t}}
 let layer='',lineHit=null,ductHit=null;
 {let bd2=tol*1.6;for(const p of d.prims){if(!p.k||x<p.x0-tol*2||x>p.x1+tol*2||y<p.y0-tol*2||y>p.y1+tol*2)continue;for(let i=1;i<p.p.length;i++){const dd=segDist(x,y,p.p[i-1],p.p[i]);if(dd<bd2){bd2=dd;ductHit=p}}}}
 if(!best&&!tHit){let bd=tol*.8;for(const p of d.prims){if(p.t!=='l'||x<p.x0-tol||x>p.x1+tol||y<p.y0-tol||y>p.y1+tol)continue;for(let i=1;i<p.p.length;i++){const a=p.p[i-1],b=p.p[i],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy;let t=L2?((x-a[0])*dx+(y-a[1])*dy)/L2:0;t=Math.max(0,Math.min(1,t));const dd=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);if(dd<bd){bd=dd;lineHit=p}}}
  if(lineHit)layer=lineHit.ly}
 const strings=[];if(best)insStrings(d,best.r).forEach(s=>strings.push(s));
 if(tHit)tHit.s.split('\n').forEach(s=>strings.push(s.trim()));
 const uniq=[...new Set(strings.filter(Boolean))].slice(0,8);
 let duct=null;const dimHit=tHit&&d.dims?d.dims.find(m=>m.t===tHit):null;
 if(!best&&(dimHit||(ductHit&&(!tHit||bs>25/sc)))){const q=dimHit?dimHit.q:ductHit,k=q.k,same=(d.dims||[]).filter(m=>m.k===k);
  const exact=[...new Set(same.filter(m=>m.q===q).map(m=>m.txt))],near=[...new Set(same.map(m=>({m,dd:Math.hypot(m.cx-x,m.cy-y)})).sort((a,b)=>a.dd-b.dd).slice(0,3).map(z=>z.m.txt))];
  duct={k,col:d.kc[k],exact,near}}
 const items=matchItems(uniq);
 const pl=tHit?prettyLabel(tHit.s):null;
 const pb=tHit||(best&&best.r),ri=d.rooms&&d.rooms.length?roomOf(d,pb?(pb.x0+pb.x1)/2:x,pb?(pb.y0+pb.y1)/2:y):-1,room=ri>=0?d.rooms[ri]:null;
 let title=best?.r.attrs.find(a=>a.text)?.text?(best.r.name+' · '+best.r.attrs.find(a=>a.text).text):best?best.r.name:(pl?pl.title:'');
 if(!title&&room)title=room.n;
 if(duct)title='Duto de '+KINDS[duct.k]+((duct.exact[0]||duct.near[0])?' · '+(duct.exact[0]||duct.near[0]):'');
 V.pickHl=tHit&&(!best||(tHit.x1-tHit.x0)*(tHit.y1-tHit.y0)<(best.r.x1-best.r.x0)*(best.r.y1-best.r.y0))?tHit:(best?best.r:null);if(duct)V.pickHl=dimHit?dimHit.t:{x0:x-tol,x1:x+tol,y0:y-tol,y1:y+tol};V.pickLbl=title;V.pick={x:nm.x,y:nm.y};V.lastPick={x:nm.x,y:nm.y,pl,room,txt:uniq,title};drawDxfSoon();
 showPick({title,pl,room,ri,duct,name:best?.r.name,layer:best?.r.ly||tHit?.ly||layer,strings:uniq,items,tagAttr:best?.r.attrs.find(a=>/tag|ident|nome|codigo/i.test(a.tag)&&a.text)?.text,empty:!best&&!tHit&&!lineHit&&!room&&!duct})}
function showPick(info){
 let c=$('#pickcard');if(!c){c=document.createElement('div');c.id='pickcard';$('#vp').append(c);c.addEventListener('pointerdown',e=>e.stopPropagation());c.addEventListener('pointerup',e=>e.stopPropagation());c.addEventListener('wheel',e=>e.stopPropagation())}
 const office=mode==='escritorio';
 const free=office?projItens(V.p.projetoId).filter(i=>!marcaDe(i.id)):[];
 const pl=info.pl;
 c.innerHTML=`<button class="x" data-act="pickClose" title="Fechar">✕</button>
 ${info.empty?'<div class="muted">Nada identificado neste ponto. Clique sobre um equipamento ou perto do texto dele.</div>':`
 <div class="pk-t">${esc(info.title||info.name||'Elemento do desenho')}</div>
 <div class="pk-chips">${pl&&pl.cat?`<span class="pk-chip c">${esc(CATS[pl.cat].l)}</span>`:''}${(pl?pl.dims:[]).map(x=>`<span class="pk-chip">📐 ${esc(x)}</span>`).join('')}${info.layer?`<span class="pk-chip g">Camada: ${esc(info.layer)}</span>`:''}</div>
 ${pl&&pl.extra.length?`<div class="pk-l">Complemento no desenho</div><div class="pk-v">${pl.extra.map(esc).join(' · ')}</div>`:''}
 ${info.duct?`<div class="pk-chips"><span class="pk-chip" style="background:${info.duct.col};color:#fff">${esc(KINDS[info.duct.k])}</span></div>
  ${info.duct.exact.length?`<div class="pk-l">Medida escrita neste trecho</div><div class="pk-v" style="font-size:20px">${info.duct.exact.map(esc).join(' · ')} <span class="muted" style="font-size:12px">cm</span></div>`:`<div class="pk-l">Medida mais próxima no mesmo tipo de duto</div><div class="pk-v">${info.duct.near.map(esc).join(' · ')||'<span class="muted">nenhuma medida escrita neste desenho</span>'} <span class="muted" style="font-size:12px">cm</span></div><div class="muted" style="font-size:12px">Não há medida escrita exatamente neste trecho; confirme no desenho.</div>`}`:''}
 ${info.room&&info.title!==info.room.n?`<div class="pk-l">Ambiente</div><div class="pk-v">📍 ${esc(info.room.n)} <span class="muted">· ${String(info.room.A).replace('.',',')} m²</span></div><div class="pk-b"><button class="btn sm sec" data-act="roomPick" data-i="${info.ri}">Ver este ambiente</button></div>`:''}
 ${info.tagAttr?`<div class="pk-l">TAG no desenho</div><div class="pk-v">${esc(info.tagAttr)}</div>`:''}
 ${!pl&&info.strings.length?`<div class="pk-l">Textos encontrados</div><div class="pk-v">${info.strings.map(esc).join(' · ')}</div>`:''}
 ${info.items.length?`<div class="pk-l">No projeto cadastrado</div>${info.items.map(it=>`<div class="pk-it"><b>${esc(it.campos.tag)}</b> — ${CATS[it.cat].l}${it.campos.modelo?' · '+esc(it.campos.modelo):''} <span class="chip s-${statusOf(it.id)}">${ST[statusOf(it.id)]}</span><div class="pk-b"><button class="btn sm" data-act="pickOpen" data-id="${it.id}">Abrir conferência</button>${office&&!marcaDe(it.id)?`<button class="btn sm sec" data-act="pickMark" data-id="${it.id}">📍 Marcar ponto aqui</button>`:''}</div></div>`).join('')}`:'<div class="muted" style="margin-top:8px">Nenhum item do projeto com esta TAG.</div>'}
 ${office&&!info.items.length&&!info.empty&&!info.duct?`<div class="pk-b"><button class="btn sm" data-act="pickCad">➕ Cadastrar este equipamento</button></div>`:''}
 ${office&&free.length&&!info.items.length?`<div class="pk-b"><select id="pickSel">${free.map(i=>`<option value="${i.id}">${esc(i.campos.tag)} — ${CATS[i.cat].l}</option>`).join('')}</select><button class="btn sm" data-act="pickMarkSel">📍 Marcar aqui</button></div>`:''}`}`;
}
ACT.pickClose=()=>{$('#pickcard')?.remove();if(V){V.pickHl=null;V.pickLbl=null;drawDxfSoon()}};
ACT.pickOpen=b=>openConf(b.dataset.id);
ACT.pickMark=b=>{if(V?.pick){placeMarker(b.dataset.id,V.pick.x,V.pick.y);ACT.pickClose()}};
ACT.pickMarkSel=()=>{const id=$('#pickSel')?.value;if(id&&V?.pick){placeMarker(id,V.pick.x,V.pick.y);ACT.pickClose()}};

/* =====================================================================
   CONFERÊNCIA EM CAMPO (projeto à esquerda × obra à direita)
   ===================================================================== */
let RET=null;
async function openConf(id,draft){
 const it=item(id);if(!it)return;const cat=CATS[it.cat];
 const c=S.conf[id];
 const d={campos:{...(c?.campos||{})},obs:c?.obs||'',fotos:[...(c?.fotos||[])],assin:c?.assin||'',chk:chkMerge(c?.chk?JSON.parse(JSON.stringify(c.chk)):null,modeloDe(it.cat)),added:[],removed:[]};
 if(draft)Object.assign(d,draft);
 const REQ=['modelo','fabricante','tipo'].filter(k=>cat.conf.includes(k));
 REQ.forEach(k=>{if(!c||!(k in (c.campos||{})))d.campos[k]=(it.campos[k]||'').trim()});
 const fin=c?.estado==='finalizada';
 const pl=plantasDoItem(id).join(', ');
 const draw=async()=>{
  const urls=await Promise.all(d.fotos.map(urlFor));
  const st=statusOf(id);
  openModal(`<h3>${esc(it.campos.tag)} <span class="muted" style="font-weight:400">${cat.l}${pl?' · '+esc(pl):''}</span> <span class="chip s-${st}">${ST[st]}</span> ${pendBadge(id)}<span class="h3-tools"><button class="btn sec sm" type="button" data-act="confDocs">📎 Documentos${(it.docs||[]).length?' ('+it.docs.length+')':''}</button><button class="btn sec sm" type="button" data-act="confPend">⚑ Pendência</button></span></h3>${hierInfo(it)}
  <div class="two">
   <div class="panel proj"><h4>📘 Informações do projeto <span class="muted">(somente leitura)</span></h4>
    ${cat.proj.map(k=>`<div class="pr"><label>${F[k].l}</label><div class="v" id="pv_${k}">${esc(it.campos[k]||'—')}</div></div>`).join('')}</div>
   <div class="panel obra"><h4>🏗 Informações encontradas na obra</h4>
    ${cat.conf.map(k=>`<div class="pr"><label>${F[k].l}${REQ.includes(k)?' <b style="color:#b42318" title="Obrigatório">*</b>':''}${TOLK.includes(k)?` <small class="muted" title="Valor igual ao projeto ou até ${Math.round(TOLS[k]*100)}% acima é considerado conferido">(até +${Math.round(TOLS[k]*100)}%)</small>`:''}</label><input type="text" data-k="${k}" id="cf_${k}" value="${esc(d.campos[k]||'')}" placeholder="${it.campos[k]?'Projeto: '+esc(it.campos[k]):REQ.includes(k)?'Obrigatório — informe o que foi encontrado':''}" ${REQ.includes(k)?'required':''} autocomplete="off"></div>`).join('')}
    ${REQ.length?'<p class="muted" style="margin:0 0 8px;font-size:12px"><b style="color:#b42318">*</b> Obrigatórios: já vêm preenchidos com o que está no projeto. Confira na obra e <b>corrija</b> o que for diferente.</p>':''}
    <div class="pr"><label>Observações ${micBtn('cf_obs')}</label><textarea id="cf_obs">${esc(d.obs)}</textarea></div>
    ${chkHTML(d.chk,it)}
    <div class="pr"><label>Assinatura do engenheiro${cfg().assinObrig?' <b style="color:#b42318" title="Obrigatória">*</b>':''}</label><canvas id="cf_sig" class="sigpad"></canvas><div class="sig-foot"><span class="muted">${esc(user||'')}</span><button class="btn sec sm" type="button" data-act="sigClear">Limpar assinatura</button></div></div>
    <div class="pr"><label>Fotografias do equipamento instalado</label>
     <input type="file" id="cf_foto" accept="image/*" multiple capture="environment" style="display:none">
     <button class="btn sec sm" type="button" data-act="pickFoto">📷 Adicionar foto</button>
     <div class="photos">${d.fotos.map((f,i)=>`<div class="ph"><img src="${urls[i]}" data-act="bigFoto" data-u="${i}"><button data-act="rmFoto" data-i="${i}" title="Remover">×</button><button class="mkb" data-act="markFoto" data-i="${i}" title="Marcar na foto (círculo, seta, caneta)">✏</button></div>`).join('')}</div></div>
   </div></div>
  <p class="muted" style="margin-bottom:0">${c?`Última gravação: ${fdt(c.data)} por ${esc(c.resp||'')}`:'Ainda não conferido.'}</p>
  <div class="mfoot"><button class="btn sec" data-act="confCancel">Fechar sem salvar</button><button class="btn" style="background:var(--azul)" data-act="confSave">💾 Salvar e continuar depois</button><button class="btn" style="background:var(--verde)" data-act="confFinal">✔ Finalizar conferência</button></div>`,true);
  cat.conf.forEach(k=>liveCmp(k));SG=sigPad($('#cf_sig'),d.assin);
  $('#cf_foto').onchange=async e=>{harvest();for(const f of e.target.files){const b=await compress(f);const bid='ph_'+uid();await blobSet(bid,b);d.fotos.push(bid);d.added.push(bid)}draw()};
 };
 const harvest=()=>{cat.conf.forEach(k=>{const e=$('#cf_'+k);if(e)d.campos[k]=e.value.trim()});const o=$('#cf_obs');if(o)d.obs=o.value;if(SG&&$('#cf_sig'))d.assin=SG.get();$$('[data-ck]',$('#cfModal')).forEach(e=>{const l=d.chk&&d.chk.linhas.find(x=>x.id===e.dataset.ck);if(l)l.v=e.value})};
 const liveCmp=k=>{const e=$('#cf_'+k),v=$('#pv_'+k);if(!e||!v)return;const pv=(it.campos[k]||'').trim(),fv=e.value.trim();
  const cls=!pv||!fv?'':same(k,pv,fv)?'ok':'bad';e.className=cls;v.className='v '+cls};
 const done=async(final)=>{
  harvest();
  if(!await needUser()){toast('Informe seu nome para salvar a conferência');return}
  if(final){
   const miss=REQ.filter(k=>!(d.campos[k]||'').trim());
   if(miss.length){toast('Preencha os campos obrigatórios: '+miss.map(k=>F[k].l).join(', '));const e=$('#cf_'+miss[0]);if(e){e.classList.add('bad');e.focus()}return}
   if(cfg().assinObrig&&!d.assin){toast('Assine antes de finalizar a conferência');return}
   {const un=(d.chk?.linhas||[]).filter(l=>chkRes(l,it)==='');if(un.length){toast('Responda todo o checklist ('+un.length+' linha(s) sem resposta)');return}}
   const empt=cat.conf.filter(k=>(it.campos[k]||'').trim()&&!(d.campos[k]||'').trim());
   if(empt.length&&!confirm('Campos sem preenchimento serão considerados DIVERGENTES:\n- '+empt.map(k=>F[k].l).join('\n- ')+'\n\nFinalizar mesmo assim?'))return;
  }
  d.removed.forEach(blobDel);
  S.conf[id]={campos:d.campos,obs:d.obs,fotos:d.fotos,assin:d.assin||'',chk:d.chk||undefined,estado:final?'finalizada':'rascunho',resp:user,data:new Date().toISOString()};
  if(final)pendSync(id);
  logH('conferiu','conferencia',id,`${final?'Finalizou':'Salvou rascunho da'} conferência de ${it.campos.tag}`);
  save();modalCleanup=null;SG=null;closeModal();refreshAfterConf();
  const s=statusOf(id);toast(final?(s==='divergente'?'⚠ Divergência identificada em '+it.campos.tag:'✔ '+it.campos.tag+' conferido'):'Rascunho salvo');
 };
 ACT.confDocs=()=>{harvest();RET={id,draft:d};docsModal(id)};ACT.confPend=()=>{harvest();RET={id,draft:d};pendNewForm(id)};
 ACT.markFoto=async b=>{harvest();const i=+b.dataset.i,old=d.fotos[i],u=await urlFor(old);markEditor(u,async bl=>{const nid='ph_'+uid();await blobSet(nid,bl);d.fotos[i]=nid;d.added.push(nid);if(d.added.includes(old)){blobDel(old);d.added=d.added.filter(a=>a!==old)}else d.removed.push(old);draw()})};
 ACT.chkSet=b=>{const l=d.chk&&d.chk.linhas.find(x=>x.id===b.dataset.l);if(!l)return;harvest();l.r=(l.r===b.dataset.r?'':b.dataset.r);const tr=b.closest('tr');tr.querySelectorAll('button').forEach(x=>{x.className=l.r===x.dataset.r?'on '+x.dataset.r:''});const inp=tr.querySelector('input');if(inp){inp.disabled=l.r==='na';inp.className=chkRes(l,it)}tr.className='r-'+(chkRes(l,it)||'vz')};
 ACT.confSave=()=>done(false);ACT.confFinal=()=>done(true);
 ACT.confCancel=()=>{d.added.forEach(blobDel);modalCleanup=null;closeModal()};
 ACT.pickFoto=()=>$('#cf_foto').click();
 ACT.rmFoto=b=>{harvest();const i=+b.dataset.i;const [x]=d.fotos.splice(i,1);if(d.added.includes(x)){blobDel(x);d.added=d.added.filter(a=>a!==x)}else d.removed.push(x);draw()};
 ACT.bigFoto=async b=>{const u=await urlFor(d.fotos[+b.dataset.u]);const lb=document.createElement('div');lb.className='cf-lightbox';lb.innerHTML=`<img src="${u}" alt="">`;lb.onclick=()=>lb.remove();root.append(lb)};
 await draw();
 // delegação de input precisa sobreviver ao re-render do modal: registrar no container fixo
 $('#cfModal').oninput=e=>{const k=e.target.dataset?.k;if(k)liveCmp(k);const ck=e.target.dataset?.ck;if(ck&&d.chk){const l=d.chk.linhas.find(x=>x.id===ck);if(l){l.v=e.target.value;const r=chkRes(l,it);e.target.className=r;e.target.closest('tr').className='r-'+(r||'vz')}}};
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
ACT.grpT=b=>{ui.open=ui.open||new Set();const k=b.dataset.k;ui.open.has(k)?ui.open.delete(k):ui.open.add(k);render()};
ACT.grpAll=b=>{ui.open=new Set();if(b.dataset.v==='1')filteredItens().forEach(i=>ui.open.add(i.campos.ambiente||i.campos.localizacao||'Sem ambiente'));render()};
CHG.agr=b=>{ui.agr=b.checked;render()};CHG.fCat=b=>{ui.fCat=b.value;render()};CHG.fPlanta=b=>{ui.fPlanta=b.value;render()};CHG.fStatus=b=>{ui.fStatus=b.value;render()};
const onSearchInput=e=>{if(e.target.id==='fBusca'){ui.fBusca=e.target.value;clearTimeout(viewItens.t);viewItens.t=setTimeout(()=>{const pos=e.target.selectionStart;render();const n=$('#fBusca');if(n){n.focus();n.setSelectionRange(pos,pos)}},250)}};
function viewItens(){
 if(!ui.projetoId){ui.view='home';return render()}
 const office=mode==='escritorio',list=filteredItens();
 $('#cfMain').innerHTML=`<div class="card"><div class="row" style="align-items:center"><h2 style="flex:3;margin:0">Itens do projeto — ${esc(proj(ui.projetoId).nome)}</h2>
  ${office?`<button class="btn" data-act="cadItens" style="flex:none">➕ Puxar do desenho</button><button class="btn sec" data-act="newItem" style="flex:none">+ Novo item</button><button class="btn sec" data-act="csvImp" style="flex:none">⬆ Importar Excel / CSV</button><button class="btn sec" data-act="csvTpl" style="flex:none">⬇ Modelo Excel</button><button class="btn sec" data-act="qrLabels" style="flex:none">🏷 Etiquetas QR</button><input type="file" id="csvF" accept=".xlsx,.xls,.xlsm,.csv,text/csv" style="display:none">`:''}</div>
  <div style="margin-top:10px">${filtersHTML()}</div></div>
  <div class="card" style="padding:0;overflow:auto"><div class="grp-bar noprint"><label><input type="checkbox" data-chg="agr" ${ui.agr!==false?'checked':''}> Agrupar por ambiente</label><span class="grp-btns">${ui.agr!==false?'<button class="btn sec sm" data-act="grpAll" data-v="1">Expandir tudo</button><button class="btn sec sm" data-act="grpAll" data-v="0">Recolher tudo</button>':''}<span class="muted">${list.length} item(ns)</span></span></div><table class="tbl-it"><thead><tr><th>Status</th><th>TAG</th><th>Categoria</th><th>Modelo</th><th>Medida</th><th>Vazão</th><th>Planta(s)</th><th></th></tr></thead><tbody>
  ${(()=>{const nat=(a,b)=>String(a.campos.tag||'').localeCompare(String(b.campos.tag||''),'pt-BR',{numeric:true}),roomOf2=i=>i.campos.ambiente||i.campos.localizacao||'';
   const row=i=>{const s=statusOf(i.id);return `<tr class="click" data-act="openConfRow" data-id="${i.id}"><td><span class="chip s-${s}">${ST[s]}</span></td><td><b>${esc(i.campos.tag)}</b> ${pendBadge(i.id)}</td><td><span class="cat-pill">${CATS[i.cat].l}</span></td><td>${esc(i.campos.modelo||'')}</td><td>${esc(i.campos.dimensoes||'')}</td><td>${esc(i.campos.vazao||'')}</td><td>${esc(plantasDoItem(i.id).join(', ')||'— sem ponto —')}</td>
   <td style="white-space:nowrap">${docBtn(i)} ${office?`<button class="btn sec sm" data-act="editItem" data-id="${i.id}">✎</button> <button class="btn sec sm" data-act="histItem" data-id="${i.id}" title="Histórico">🕘</button> <button class="btn red sm" data-act="delItem" data-id="${i.id}">🗑</button>`:'<span class="muted">Conferir ›</span>'}</td></tr>`};
   if(!list.length)return`<tr><td colspan="8" class="muted">Nenhum item${S.itens.length?' com esses filtros':' cadastrado'}.</td></tr>`;
   if(ui.agr===false)return[...list].sort(nat).map(row).join('');
   const g=new Map();list.forEach(i=>{const k=roomOf2(i)||'Sem ambiente';(g.get(k)||g.set(k,[]).get(k)).push(i)});
   ui.open=ui.open||new Set();const auto=!!(ui.fBusca||ui.fCat||ui.fStatus||ui.fPlanta);
   return[...g.entries()].sort((a,b)=>(a[0]==='Sem ambiente')-(b[0]==='Sem ambiente')||a[0].localeCompare(b[0],'pt-BR')).map(([k,l])=>{const c={},st={};l.forEach(i=>{c[CATS[i.cat].l]=(c[CATS[i.cat].l]||0)+1;const z=statusOf(i.id);st[z]=(st[z]||0)+1});
    const op=auto||ui.open.has(k);
    return`<tr class="grp ${op?'open':''}" data-act="grpT" data-k="${esc(k)}"><td colspan="8"><span class="grp-ar">${op?'▾':'▸'}</span> 📍 <b>${esc(k)}</b> <span class="grp-n">${l.length}</span> <span class="muted">${Object.entries(c).map(([a,b])=>b+' '+esc(a)).join(' · ')}</span><span class="grp-st">${st.pendente?`<button class="btn sm grp-ok" data-act="batchOk" data-k="${esc(k)}" title="Marcar como conferidos os itens deste ambiente que estão iguais ao projeto">✔ Tudo confere (${st.pendente})</button>`:''}<span class="grp-pct">${Math.round(((st.conferido||0)+(st.divergente||0))/l.length*100)}%</span>${STORDER.filter(z=>st[z]).map(z=>`<span class="chip s-${z}">${st[z]}</span>`).join('')}</span></td></tr>`+(op?l.sort(nat).map(row).join(''):'')}).join('')})()}
  </tbody></table></div>`;
 const f=$('#csvF');if(f)f.onchange=()=>{importPlanilha(f.files[0]);f.value=''};
}

/* ===== CONFERÊNCIA EM LOTE POR AMBIENTE: "tudo confere" ===== */
const ambKey=i=>i.campos.ambiente||i.campos.localizacao||'Sem ambiente';
ACT.batchOk=b=>{const k=b.dataset.k,l=filteredItens().filter(i=>ambKey(i)===k&&statusOf(i.id)==='pendente'&&!modeloDe(i.cat));if(!l.length)return;
 const nat=(a,c)=>String(a.campos.tag||'').localeCompare(String(c.campos.tag||''),'pt-BR',{numeric:true});l.sort(nat);V_batch={k,ids:l.map(i=>i.id)};
 openModal(`<h3>✔ Tudo confere — ${esc(k)}</h3>
 <p class="muted">Marque os itens que, <b>na obra, estão iguais ao projeto</b> (modelo, medida, vazão…). Desmarque os que tiverem alguma diferença: esses você confere um a um. Os marcados ficam como <b>conferidos</b>, com seu nome e a data.</p>
 <div class="batch-list">${l.map(i=>`<label class="batch-r"><input type="checkbox" class="bo" data-id="${i.id}" checked><span><b>${esc(i.campos.tag)}</b> <span class="cat-pill">${CATS[i.cat].l}</span><br><span class="muted">${esc([i.campos.modelo,i.campos.dimensoes,i.campos.vazao].filter(Boolean).join(' · ')||'sem detalhes')}</span></span></label>`).join('')}</div>
 <div class="mfoot"><button class="btn sec" data-act="batchAll" data-v="0">Desmarcar todos</button><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" data-act="batchGo">Confirmar <span id="bo_n">${l.length}</span> conferido(s)</button></div>`);
 $('#cfModal').onchange=e=>{if(e.target.classList?.contains('bo'))$('#bo_n').textContent=$$('.bo:checked').length}};
let V_batch=null;
ACT.batchAll=b=>{const v=b.dataset.v==='1';$$('.bo').forEach(x=>x.checked=v);b.dataset.v=v?'0':'1';b.textContent=v?'Desmarcar todos':'Marcar todos';$('#bo_n').textContent=$$('.bo:checked').length};
ACT.batchGo=async()=>{const ids=$$('.bo:checked').map(x=>x.dataset.id);if(!ids.length){toast('Nenhum item marcado');return}
 if(!await needUser()){toast('Informe seu nome para registrar a conferência');return}
 await snapNow('antes da conferência em lote');const now=new Date().toISOString();
 for(const id of ids){const it=item(id);if(!it)continue;const campos={};for(const k of CATS[it.cat].conf)if((it.campos[k]||'').trim())campos[k]=it.campos[k];
  S.conf[id]={campos,obs:'Conferência em lote: instalado igual ao projeto.',fotos:[],estado:'finalizada',resp:user,data:now}}
 logH('conferiu','conferencia','',`Conferência em lote: ${ids.length} item(ns) de ${V_batch?V_batch.k:'ambiente'} conferidos`);save();closeModal();render();toast('✔ '+ids.length+' item(ns) conferido(s)')};
ACT.openConfRow=(b,e)=>{if(e.target.closest('button'))return;openConf(b.dataset.id)};
ACT.newItem=()=>itemForm();
ACT.editItem=b=>itemForm(b.dataset.id);
ACT.delItem=b=>{const it=item(b.dataset.id);if(!confirm(`Excluir ${it.campos.tag}? A conferência e o ponto na planta também serão removidos.`))return;delItemById(it.id);save();render()};
function delItemById(id){const it=item(id);(S.conf[id]?.fotos||[]).forEach(blobDel);(it.docs||[]).forEach(d=>blobDel(d.blobId));S.pend=(S.pend||[]).filter(p=>p.itemId!==id);S.itens.forEach(x=>{if(x.pai===id)delete x.pai});delete S.conf[id];S.marcas=S.marcas.filter(m=>m.itemId!==id);S.itens=S.itens.filter(i=>i.id!==id);logH('excluiu','item',id,`Excluiu ${it.campos.tag} (${CATS[it.cat].l})`,Object.entries(it.campos).filter(([k,v])=>v).map(([k,v])=>({campo:F[k].l,de:v,para:''})))}
ACT.histItem=b=>{const id=b.dataset.id;const h=S.hist.filter(x=>x.ref===id);
 openModal(`<h3>Histórico — ${esc(item(id)?.campos.tag||'')}</h3><div class="hist">${histHTML(h)}</div><div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
function histHTML(h){return h.map(x=>`<div class="h"><b>${esc(x.acao)}</b> · ${esc(x.desc)}<br><span class="muted">${fdt(x.ts)} — ${esc(x.user)}</span>${(x.mud||[]).map(m=>`<div class="muted">&nbsp;&nbsp;${esc(m.campo)}: <s>${esc(m.de||'—')}</s> → <b>${esc(m.para||'—')}</b></div>`).join('')}</div>`).join('')||'<p class="muted">Sem registros.</p>'}

/* ----- formulário de item ----- */
function itemForm(id,pre){
 const ex=id?item(id):null;let cat=ex?.cat||pre?.cat||'damper';const vals={...(pre?.campos||{}),...(ex?.campos||{})};if(ex&&ex.pai)vals.__pai=(item(ex.pai)?.campos.tag)||'';if(pre&&pre.autoTag&&!vals.tag){vals.tag=pre.autoTag(cat);pre.lastAuto=vals.tag}
 const build=()=>{
  const cf=CATS[cat];
  openModal(`<h3>${ex?'Editar item':pre&&pre.place?'Cadastrar equipamento na planta':'Novo item'}</h3>${pre&&pre.place?'<p class="muted">O ponto é colocado na planta exatamente onde você clicou.</p>':''}
  <div class="fld"><label>Categoria</label><select id="ic" ${ex?'':''}>${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${k===cat?'selected':''}>${c.l}</option>`).join('')}</select></div>
  ${cf.proj.map(k=>`<div class="fld"><label>${F[k].l}</label>${F[k].area?`<textarea data-k="${k}">${esc(vals[k]||'')}</textarea>`:`<input type="text" data-k="${k}" value="${esc(vals[k]||'')}">`}</div>`).join('')}
  <div class="fld"><label>Atendido por (TAG do equipamento que alimenta ou serve este — opcional)</label><input type="text" data-k="__pai" list="dl_pai" value="${esc(vals.__pai||'')}" placeholder="Ex.: o fancoil é atendido pela bomba BAG-01"><datalist id="dl_pai">${projItens(pre?V.p.projetoId:ui.projetoId).filter(i=>!ex||i.id!==ex.id).map(i=>`<option value="${esc(i.campos.tag)}">`).join('')}</datalist></div>
  <div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" id="isv">Salvar</button></div>`);
  const grab=()=>$$('[data-k]',$('#cfModal')).forEach(e=>vals[e.dataset.k]=e.value.trim());
  $('#ic').onchange=e=>{grab();cat=e.target.value;if(pre&&pre.autoTag&&vals.tag===pre.lastAuto){vals.tag=pre.autoTag(cat);pre.lastAuto=vals.tag}build()};
  $('#isv').onclick=()=>{grab();const campos={};CATS[cat].proj.forEach(k=>campos[k]=vals[k]||'');
   if(!campos.tag)return toast('Informe a TAG / identificação');
   if(S.itens.some(i=>i.projetoId===(pre?V.p.projetoId:ui.projetoId)&&i.id!==id&&i.campos.tag.toLowerCase()===campos.tag.toLowerCase()))return toast('Já existe um item com essa TAG neste projeto');
   const ptag=(vals.__pai||'').trim();let paiId='';
   if(ptag){const pj=pre?V.p.projetoId:ui.projetoId,pi=S.itens.find(i=>i.projetoId===pj&&String(i.campos.tag).toLowerCase()===ptag.toLowerCase());if(!pi)return toast('“Atendido por”: TAG não encontrada neste projeto');if(ex&&(pi.id===ex.id||descend(ex.id).some(x=>x.id===pi.id)))return toast('“Atendido por” não pode ser o próprio item nem um item que ele atende');paiId=pi.id}
   if(ex){const mud=[];if(ex.cat!==cat)mud.push({campo:'Categoria',de:CATS[ex.cat].l,para:CATS[cat].l});
    new Set([...Object.keys(ex.campos),...Object.keys(campos)]).forEach(k=>{if((ex.campos[k]||'')!==(campos[k]||''))mud.push({campo:F[k].l,de:ex.campos[k]||'',para:campos[k]||''})});
    ex.cat=cat;ex.campos=campos;if(paiId)ex.pai=paiId;else delete ex.pai;if(mud.length)logH('editou','item',ex.id,`Editou ${campos.tag}`,mud)}
   else{const n={id:uid(),projetoId:pre?V.p.projetoId:ui.projetoId,cat,campos,...(paiId?{pai:paiId}:{})};S.itens.push(n);logH('criou','item',n.id,`Criou ${campos.tag} (${CATS[cat].l})`,Object.entries(campos).filter(([k,v])=>v).map(([k,v])=>({campo:F[k].l,de:'',para:v})));
    if(pre&&pre.place)S.marcas.push({id:uid(),itemId:n.id,plantaId:V.p.id,pagina:ui.pagina,x:pre.place.x,y:pre.place.y})}
   save();closeModal();if(pre&&pre.place){V.hl=null;viewerUpdate();renderKpi();drawDxfSoon();toast('Equipamento cadastrado e posicionado na planta')}else{render();toast('Item salvo')}};
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
  <button class="btn" data-act="print" style="flex:none">🖨 Imprimir / Salvar PDF</button><button class="btn sec" data-act="xlsExp" style="flex:none">⬇ Excel</button><button class="btn sec" data-act="csvExp" style="flex:none">⬇ CSV</button><button class="btn sec" data-act="xlsDados" style="flex:none" title="Várias abas, para Power BI ou Excel">⬇ Dados (Power BI)</button><button class="btn sec" data-act="xlsAtivos" style="flex:none" title="Lista de ativos para o sistema de manutenção">⬇ Entrega de ativos</button></div>
  <div class="noprint" style="margin-top:10px">${filtersHTML()}</div>
  <div class="rep-head" style="margin-top:12px"><div><label>Obra</label>${esc(obra(ui.obraId).nome)}</div><div><label>Projeto</label>${esc(proj(ui.projetoId).nome)}</div>
   <div><label>Pavimento</label>${esc(ui.pav||'Todos')}</div><div><label>Planta</label>${esc(ui.fPlanta&&ui.fPlanta!=='_none'?planta(ui.fPlanta)?.nome:'Todas')}</div><div><label>Responsável(is)</label>${esc(resps.join(', ')||'—')}</div>
   <div><label>Período das conferências</label>${datas.length?fdt(datas[0])+(datas.length>1?' a '+fdt(datas.at(-1)):''):'—'}</div>
   <div><label>Resumo</label>${list.length} itens · ${c.conferido} conf. · ${c.divergente} diverg. · ${c.pendente} pend. · ${c.em_conferencia} em conf.</div></div></div>
  ${list.map(i=>repItem(i)).join('')||'<div class="card muted">Nenhum item.</div>'}
  ${aceitesRep()}
  <div class="rep-sign"><div><div class="line"></div>${esc(cf.resp||'Responsável técnico')}<br><span class="muted">${esc(cf.crea?'CREA/Registro: '+cf.crea:(cf.empresa||''))}</span></div><div><div class="line"></div>${esc(cf.cliente||'Cliente / responsável pelo aceite')}<br><span class="muted">Data: ____/____/______</span></div></div>`;
}
function repItem(i){
 const s=statusOf(i.id),c=S.conf[i.id],cat=CATS[i.cat],dv=diverg(i.id);
 return `<div class="rep-item"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:16px">${esc(i.campos.tag)}</b><span class="muted">${cat.l} · ${esc(pavLabel(i))} · ${esc(plantasDoItem(i.id).join(', ')||'sem ponto em planta')}</span><span class="chip s-${s}">${ST[s]}</span></div>
 <table style="margin-top:6px"><thead><tr><th>Campo</th><th>Previsto (projeto)</th><th>Encontrado (obra)</th><th></th></tr></thead><tbody>
 ${cat.conf.map(k=>{const pv=i.campos[k]||'',fv=c?.campos[k]||'';const bad=dv.includes(k);const ok=c&&pv&&fv&&!bad;
  return `<tr><td>${F[k].l}</td><td>${esc(pv||'—')}</td><td class="${bad?'bad-td':ok?'ok-td':''}">${c?esc(fv||'—'):'—'}</td><td>${bad?'✗ divergente':ok?'✓':''}</td></tr>`}).join('')}</tbody></table>
 ${chkRep(i)}
 ${dv.length?`<div style="margin-top:6px"><b style="color:var(--verm)">Divergências:</b> ${dv.map(k=>`${F[k].l} (previsto ${esc(i.campos[k])} × encontrado ${esc(c.campos[k]||'—')})`).join('; ')}</div>`:''}
 ${c?.obs?`<div style="margin-top:6px"><b>Observações:</b> ${esc(c.obs)}</div>`:''}
 ${c?.fotos?.length?`<div class="photos">${c.fotos.map(f=>`<div class="ph"><img src="${urlCache.get(f)||''}"></div>`).join('')}</div>`:''}
 ${pendsOf(i.id).length?`<div style="margin-top:6px"><b>Pendências:</b> ${pendsOf(i.id).map(p=>`${esc(p.titulo)} — <i>${PEND_ST[p.estado]}</i>${p.resp?' · resp. '+esc(p.resp):''}${p.empresa?' ('+esc(p.empresa)+')':''}${p.prazo?' · prazo '+esc(p.prazo.split('-').reverse().join('/')):''}`).join('; ')}</div>`:''}
 ${(i.docs||[]).length?`<div class="muted" style="margin-top:4px">Documentos anexados: ${i.docs.map(d=>esc(d.nome)).join(', ')}</div>`:''}
 ${c?.assin?`<div class="rep-assin"><img src="${c.assin}" alt="Assinatura"><span class="muted">${esc(c.resp||'')}</span></div>`:''}
 ${c?`<div class="muted" style="margin-top:4px">Conferido por ${esc(c.resp||'—')} em ${fdt(c.data)}${c.estado!=='finalizada'?' (rascunho — não finalizada)':''}</div>`:''}</div>`}
ACT.print=async()=>{const d=desk();if(d){try{const r=await d({action:'print-pdf',name:'Relatorio-conferencia'});if(r)toast('PDF salvo.')}catch(e){toast(e.message)}}else window.print()};
function repRows(){const list=filteredItens();const rows=[['Obra','Projeto','Pavimento','Planta','Categoria','TAG','Status','Campo','Previsto','Encontrado','Divergente','Observações','Responsável','Data']];
 list.forEach(i=>{const c=S.conf[i.id],dv=diverg(i.id);CATS[i.cat].conf.forEach(k=>rows.push([obra(ui.obraId).nome,proj(ui.projetoId).nome,pavLabel(i),plantasDoItem(i.id).join('/'),CATS[i.cat].l,i.campos.tag,ST[statusOf(i.id)],F[k].l,i.campos[k]||'',c?.campos[k]||'',dv.includes(k)?'SIM':'',c?.obs||'',c?.resp||'',c?fdt(c.data):'']));(c?.chk?.linhas||[]).forEach(l=>{const r=chkRes(l,i);rows.push([obra(ui.obraId).nome,proj(ui.projetoId).nome,pavLabel(i),plantasDoItem(i.id).join('/'),CATS[i.cat].l,i.campos.tag,ST[statusOf(i.id)],'Checklist: '+l.t,l.ref?(i.campos[l.ref]||''):(l.esp||''),l.tipo==='sn'?(({ok:'OK',nok:'Não',na:'N/A'})[r]||''):(l.v||''),r==='nok'?'SIM':'',c?.obs||'',c?.resp||'',fdt(c.data)])})});return rows}
ACT.xlsExp=async()=>{if(!await ensureXlsx())return toast('Biblioteca Excel indisponível');const ws=XLSX.utils.aoa_to_sheet(repRows());ws['!cols']=[22,18,14,16,12,12,14,22,20,20,10,30,16,18].map(w=>({wch:w}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Conferência');XLSX.writeFile(wb,'relatorio_conferencia.xlsx')};
ACT.csvExp=()=>{const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;download('relatorio_conferencia.csv','\ufeff'+repRows().map(r=>r.map(q).join(';')).join('\n'),'text/csv')};

/* =====================================================================
   ADMINISTRAÇÃO (escritório)
   ===================================================================== */


/* =====================================================================
   v0.8 — PENDÊNCIAS, ASSINATURA E ACEITE, DOCUMENTOS, PAINEL, QR, REVISÕES
   ===================================================================== */
const hoje=()=>new Date().toLocaleDateString('sv-SE');
const PEND_ST={aberta:'Aberta',corrigida:'Corrigida — reconferir',fechada:'Fechada'};
const cm=txt=>({ts:new Date().toISOString(),user:user||'(sem nome)',txt});
const pendsOf=id=>(S.pend||[]).filter(p=>p.itemId===id);
const pendOpen=id=>pendsOf(id).filter(p=>p.estado!=='fechada');
const pendVenc=p=>p.estado!=='fechada'&&p.prazo&&p.prazo<hoje();
function pendProj(){return(S.pend||[]).filter(p=>item(p.itemId)?.projetoId===ui.projetoId)}
function pendSync(id){ // chamado ao finalizar uma conferência
 const it=item(id),c=S.conf[id];if(!it||!c)return;S.pend=S.pend||[];const dv=diverg(id),ck=chkFails(id),auto=pendOpen(id).filter(p=>p.auto),now=new Date().toISOString();
 if(dv.length||ck.length){
  const desc=[...dv.map(k=>`${F[k].l}: previsto ${it.campos[k]} × encontrado ${c.campos[k]||'—'}`),...ck.map(l=>`Checklist: ${l.t}${l.tipo==='sn'?' — não conforme':' — medido '+(l.v||'—')+(l.un?' '+l.un:'')}`)].join('; '),tit='Divergência: '+[...dv.map(k=>F[k].l),...ck.map(l=>l.t)].join(', ');
  const ex=auto[0];
  if(ex){ex.titulo=tit;ex.desc=desc;if(ex.estado==='corrigida'){ex.estado='aberta';ex.coment.push(cm('Reconferido: a divergência continua.'))}}
  else{S.pend.push({id:uid(),itemId:id,titulo:tit,desc,resp:'',empresa:'',prazo:'',estado:'aberta',auto:true,criada:now,por:user||'',coment:[]});logH('criou','pendencia',id,`Pendência aberta em ${it.campos.tag}: ${tit}`)}
 }else auto.forEach(p=>{p.estado='fechada';p.fechada=now;p.fechadaPor=user||'';p.coment.push(cm('Fechada automaticamente: reconferido sem divergência.'));logH('editou','pendencia',id,`Pendência fechada em ${it.campos.tag} (reconferido sem divergência)`)});
}
function pendBadge(id){const n=pendOpen(id).length;return n?`<span class="pbadge" title="${n} pendência(s) em aberto">⚑ ${n}</span>`:''}

/* ---------- aba Pendências ---------- */
function viewPend(){
 if(!ui.projetoId){ui.view='home';return render()}
 const f=ui.pf=ui.pf||{est:'abertas',resp:'',emp:''};
 let l=pendProj();const all=l;
 if(f.est==='abertas')l=l.filter(p=>p.estado!=='fechada');else if(f.est==='vencidas')l=l.filter(pendVenc);else if(f.est!=='todas')l=l.filter(p=>p.estado===f.est);
 if(f.resp==='_sem')l=l.filter(p=>!p.resp);else if(f.resp)l=l.filter(p=>p.resp===f.resp);
 if(f.emp==='_sem')l=l.filter(p=>!p.empresa);else if(f.emp)l=l.filter(p=>p.empresa===f.emp);
 l=[...l].sort((a,b)=>(a.estado==='fechada')-(b.estado==='fechada')||(a.prazo||'9999').localeCompare(b.prazo||'9999')||b.criada.localeCompare(a.criada));
 const resps=[...new Set(all.map(p=>p.resp).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const emps=[...new Set(all.map(p=>p.empresa).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const nA=all.filter(p=>p.estado!=='fechada').length,nV=all.filter(pendVenc).length,nC=all.filter(p=>p.estado==='corrigida').length;
 const opt=(v,t,cur)=>`<option value="${v}" ${cur===v?'selected':''}>${t}</option>`;
 $('#cfMain').innerHTML=`<div class="card"><div class="row" style="align-items:center"><h2 style="flex:3;margin:0">Pendências — ${esc(proj(ui.projetoId).nome)}</h2><button class="btn" data-act="pendNew" style="flex:none">+ Nova pendência</button></div>
  <p class="muted" style="margin:6px 0 0">Quando uma conferência é finalizada com divergência, a pendência é aberta sozinha. Defina o <b>responsável</b> e o <b>prazo</b>; depois que for corrigida, <b>reconfira</b> o item: se estiver igual ao projeto, a pendência fecha sozinha.</p>
  <div class="pend-kpis"><div><b>${nA}</b><span>em aberto</span></div><div class="${nV?'bad':''}"><b>${nV}</b><span>vencidas</span></div><div><b>${nC}</b><span>aguardando reconferência</span></div><div><b>${all.length-nA}</b><span>fechadas</span></div></div>
  <div class="row" style="margin-top:10px"><div class="fld"><label>Mostrar</label><select data-chg="pEst">${opt('abertas','Em aberto',f.est)}${opt('vencidas','Vencidas',f.est)}${opt('corrigida','Aguardando reconferência',f.est)}${opt('fechada','Fechadas',f.est)}${opt('todas','Todas',f.est)}</select></div>
  <div class="fld"><label>Responsável</label><select data-chg="pResp">${opt('','Todos',f.resp)}${opt('_sem','Sem responsável',f.resp)}${resps.map(r=>opt(esc(r),esc(r),f.resp)).join('')}</select></div>
  <div class="fld"><label>Empresa</label><select data-chg="pEmp">${opt('','Todas',f.emp)}${opt('_sem','Sem empresa',f.emp)}${emps.map(r=>opt(esc(r),esc(r),f.emp)).join('')}</select></div></div></div>
  <div class="card" style="padding:0;overflow:auto"><table class="tbl-pend"><thead><tr><th>Situação</th><th>TAG</th><th>Pendência</th><th>Responsável</th><th>Empresa</th><th>Prazo</th><th></th></tr></thead><tbody>
  ${l.map(p=>{const it=item(p.itemId);return `<tr class="click" data-act="pendOpen" data-id="${p.id}"><td><span class="chip pst-${p.estado}">${PEND_ST[p.estado]}</span></td><td><b>${esc(it?.campos.tag||'?')}</b></td><td>${esc(p.titulo)}<div class="muted" style="font-size:12px">${esc((p.desc||'').slice(0,140))}</div></td><td>${p.resp?esc(p.resp):'<span class="muted">— definir —</span>'}</td><td>${esc(p.empresa||'')||'<span class="muted">—</span>'}</td><td class="${pendVenc(p)?'venc':''}">${p.prazo?esc(p.prazo.split('-').reverse().join('/'))+(pendVenc(p)?' ⚠':''):'<span class="muted">—</span>'}</td><td class="muted">${p.coment.length?'💬 '+p.coment.length:''}</td></tr>`}).join('')||`<tr><td colspan="7" class="muted">Nenhuma pendência${all.length?' com esse filtro':' neste projeto. Quando uma conferência encontrar divergência, ela aparece aqui'}.</td></tr>`}
  </tbody></table></div>`;
}
CHG.pEmp=b=>{ui.pf.emp=b.value;viewPend()};CHG.pEst=b=>{ui.pf.est=b.value;viewPend()};CHG.pResp=b=>{ui.pf.resp=b.value;viewPend()};
let PD=null;
function pendModal(id){
 const p=(S.pend||[]).find(x=>x.id===id);if(!p)return;PD=id;const it=item(p.itemId),off=canOffice(),cur=p.estado;
 const users=S.usuarios.map(u=>u.nome);
 openModal(`<h3>⚑ ${esc(it?.campos.tag||'?')} — ${esc(p.titulo)} <span class="chip pst-${cur}">${PEND_ST[cur]}</span></h3>
  <p class="muted" style="margin-top:0">Aberta por ${esc(p.por||'—')} em ${fdt(p.criada)}${p.fechada?` · fechada por ${esc(p.fechadaPor||'—')} em ${fdt(p.fechada)}`:''}</p>
  <div class="fld"><label for="pd_desc">Descrição</label><textarea id="pd_desc" ${cur==='fechada'?'readonly':''}>${esc(p.desc||'')}</textarea></div>
  <div class="two"><div class="fld"><label for="pd_resp">Responsável pela correção</label><input id="pd_resp" list="pd_users" value="${esc(p.resp||'')}" ${cur==='fechada'?'readonly':''}><datalist id="pd_users">${users.map(u=>`<option value="${esc(u)}">`).join('')}</datalist></div>
  <div class="fld"><label for="pd_prazo">Prazo</label><input id="pd_prazo" type="date" value="${esc(p.prazo||'')}" ${cur==='fechada'?'readonly':''}></div></div>
  <div class="fld"><label for="pd_emp">Empresa responsável (instaladora, fornecedora…)</label><input id="pd_emp" list="pd_emps" value="${esc(p.empresa||'')}" ${cur==='fechada'?'readonly':''}><datalist id="pd_emps">${[...new Set(S.pend.map(x=>x.empresa).filter(Boolean))].map(u=>`<option value="${esc(u)}">`).join('')}</datalist></div>
  <h4 style="margin:12px 0 6px">Comentários e histórico</h4>
  <div class="pd-log">${p.coment.length?p.coment.slice().reverse().map(c=>`<div class="pd-c"><b>${esc(c.user)}</b> <span class="muted">${fdt(c.ts)}</span><div>${esc(c.txt)}</div></div>`).join(''):'<div class="muted">Nenhum comentário ainda.</div>'}</div>
  <div class="fld"><label for="pd_new">Novo comentário ${micBtn('pd_new')}</label><textarea id="pd_new" placeholder="Ex.: modelo trocado, aguardando fornecedor…"></textarea></div>
  <div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar janela</button>
   ${off&&cur!=='fechada'?'':''}${cur==='aberta'?`<button class="btn" style="background:var(--azul)" data-act="pendSt" data-v="corrigida">✔ Marcar como corrigida</button>`:''}
   ${cur!=='fechada'?`<button class="btn" style="background:var(--verde)" data-act="pendReconf">📋 Reconferir item</button>`:''}
   ${cur==='corrigida'?`<button class="btn sec" data-act="pendSt" data-v="aberta">↩ Reabrir</button>`:''}
   ${cur==='fechada'?`<button class="btn sec" data-act="pendSt" data-v="aberta">↩ Reabrir</button>`:''}
   ${off&&cur!=='fechada'?`<button class="btn sec" data-act="pendSt" data-v="fechada">Fechar pendência</button>`:''}
   ${off?`<button class="btn red" data-act="pendDel">🗑</button>`:''}
   <button class="btn sec" data-act="pendAvisar">📤 Avisar responsável</button><button class="btn" data-act="pendSave">Salvar</button></div>`,true);
}
function pendRead(p){const d=$('#pd_desc'),r=$('#pd_resp'),z=$('#pd_prazo'),n=$('#pd_new');if(!d)return false;
 const ch=[];if(d.value!==(p.desc||''))p.desc=d.value;
 const em=$('#pd_emp');if(em&&em.value.trim()!==(p.empresa||'')){ch.push('Empresa: '+(em.value.trim()||'—'));p.empresa=em.value.trim()}
 if(r.value.trim()!==(p.resp||'')){ch.push('Responsável: '+(r.value.trim()||'—'));p.resp=r.value.trim()}
 if(z.value!==(p.prazo||'')){ch.push('Prazo: '+(z.value?z.value.split('-').reverse().join('/'):'—'));p.prazo=z.value}
 if(ch.length)p.coment.push(cm(ch.join(' · ')));
 if(n.value.trim()){p.coment.push(cm(n.value.trim()));n.value=''}return true}
ACT.pendOpen=b=>pendModal(b.dataset.id);
ACT.pendSave=()=>{const p=S.pend.find(x=>x.id===PD);if(!p)return;pendRead(p);logH('editou','pendencia',p.itemId,'Atualizou pendência de '+item(p.itemId)?.campos.tag);save();if(ui.view==='pend')viewPend();pendModal(p.id)};
ACT.pendSt=b=>{const p=S.pend.find(x=>x.id===PD);if(!p)return;pendRead(p);const v=b.dataset.v;
 if(v==='fechada'){if(!confirm('Fechar esta pendência sem reconferir o item?'))return;p.fechada=new Date().toISOString();p.fechadaPor=user||''}
 else{delete p.fechada;delete p.fechadaPor}
 p.estado=v;p.coment.push(cm({corrigida:'Marcada como corrigida — aguardando reconferência.',aberta:'Reaberta.',fechada:'Fechada manualmente.'}[v]));
 logH('editou','pendencia',p.itemId,`Pendência de ${item(p.itemId)?.campos.tag}: ${PEND_ST[v]}`);save();renderTop();if(ui.view==='pend')viewPend();pendModal(p.id)};
ACT.pendReconf=()=>{const p=S.pend.find(x=>x.id===PD);if(!p)return;pendRead(p);save();closeModal();openConf(p.itemId)};
ACT.pendDel=()=>{const p=S.pend.find(x=>x.id===PD);if(!p||!confirm('Excluir esta pendência?'))return;S.pend=S.pend.filter(x=>x.id!==PD);save();closeModal();renderTop();if(ui.view==='pend')viewPend()};
function pendNewForm(itemId){
 const l=projItens(ui.projetoId).slice().sort((a,b)=>String(a.campos.tag).localeCompare(String(b.campos.tag),'pt-BR',{numeric:true}));
 const cur=itemId?item(itemId):null;
 formModal('Nova pendência',[{k:'tag',l:'TAG do equipamento',value:cur?cur.campos.tag:'',list:l.map(i=>i.campos.tag)},{k:'titulo',l:'O que está pendente',value:''},{k:'desc',l:'Detalhes (opcional)',type:'textarea'},{k:'resp',l:'Responsável (opcional)',list:S.usuarios.map(u=>u.nome)},{k:'empresa',l:'Empresa responsável (opcional)',list:[...new Set((S.pend||[]).map(x=>x.empresa).filter(Boolean))]},{k:'prazo',l:'Prazo (AAAA-MM-DD, opcional)'}],v=>{
  const it=l.find(i=>String(i.campos.tag).toLowerCase()===v.tag.toLowerCase());if(!it){toast('TAG não encontrada neste projeto');return false}
  if(!v.titulo){toast('Escreva o que está pendente');return false}
  if(v.prazo&&!/^\d{4}-\d{2}-\d{2}$/.test(v.prazo)){toast('Prazo no formato AAAA-MM-DD, ex.: 2026-12-15');return false}
  S.pend=S.pend||[];S.pend.push({id:uid(),itemId:it.id,titulo:v.titulo,desc:v.desc,resp:v.resp,empresa:v.empresa,prazo:v.prazo,estado:'aberta',auto:false,criada:new Date().toISOString(),por:user||'',coment:[]});
  logH('criou','pendencia',it.id,`Pendência aberta em ${it.campos.tag}: ${v.titulo}`);save();{const r=RET;if(r)setTimeout(()=>openConf(r.id,r.draft),0)}renderTop();if(ui.view==='pend')viewPend();else if(ui.view==='plant')viewerUpdate();toast('Pendência aberta em '+it.campos.tag)},'Abrir pendência')}
ACT.pendNew=()=>pendNewForm('');
ACT.pendItem=b=>{pendNewForm(b.dataset.id)};

/* ---------- Assinatura (desenhar no tablet) ---------- */
function sigPad(cv,init){const g=cv.getContext('2d');cv.width=640;cv.height=200;g.lineWidth=3;g.lineCap='round';g.lineJoin='round';g.strokeStyle='#0F222B';
 let touched=false,drawing=false,lx=0,ly=0,base=init||'';
 const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
 cv.addEventListener('pointerdown',e=>{drawing=true;touched=true;try{cv.setPointerCapture(e.pointerId)}catch{}[lx,ly]=pos(e);g.beginPath();g.moveTo(lx,ly);g.lineTo(lx+.1,ly);g.stroke();e.preventDefault()});
 cv.addEventListener('pointermove',e=>{if(!drawing)return;const[x,y]=pos(e);g.beginPath();g.moveTo(lx,ly);g.lineTo(x,y);g.stroke();lx=x;ly=y;e.preventDefault()});
 const end=()=>{drawing=false};cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
 if(init){const im=new Image();im.onload=()=>g.drawImage(im,0,0,cv.width,cv.height);im.src=init}
 return{get:()=>touched?cv.toDataURL('image/png'):base,clear:()=>{g.clearRect(0,0,cv.width,cv.height);touched=false;base=''}}}
let SG=null;
ACT.sigClear=()=>{SG&&SG.clear()};

/* ---------- Painel: andamento por sistema, pavimento e pessoa + aceite ---------- */
const aceiteDe=(tipo,chave)=>(S.aceites||[]).find(a=>a.projetoId===ui.projetoId&&a.tipo===tipo&&a.chave===chave);
const escopoItens=(tipo,chave)=>{const l=projItens(ui.projetoId);if(tipo==='sis'){const r=l.find(i=>String(i.campos.tag)===chave&&!i.pai);return r?[r,...descend(r.id)]:[]}return l.filter(i=>tipo==='pav'?pavLabel(i)===chave:CATS[i.cat].l===chave)};
function escopoOk(l){if(!l.length)return 'Nenhum item neste escopo.';const nc=l.filter(i=>statusOf(i.id)!=='conferido').length;if(nc)return nc+' item(ns) ainda não estão conferidos sem divergência.';const np=l.filter(i=>pendOpen(i.id).length).length;if(np)return np+' item(ns) com pendência em aberto.';return ''}
function bar(c,t){const seg=k=>c[k]?`<span class="s-${k}" style="width:${c[k]/t*100}%" title="${ST[k]}: ${c[k]}"></span>`:'';return `<div class="cfbar">${STORDER.map(seg).join('')}</div>`}
function painelRows(tipo,groups){
 return groups.map(([chave,l])=>{const c=counts(l),t=l.length,pc=t?Math.round(c.conferido/t*100):0,pa=l.reduce((n,i)=>n+pendOpen(i.id).length,0),ac=aceiteDe(tipo,chave),why=escopoOk(l),m=metaDe(tipo,chave),late=m&&m.fim&&m.fim<hoje()&&c.conferido<t;
  const acc=ac?`<span class="chip s-conferido" title="Aceito por ${esc(ac.nome)} em ${fdt(ac.ts)}">✔ Aceito</span> <button class="btn sec sm" data-act="aceiteView" data-t="${tipo}" data-k="${esc(chave)}">Ver</button>${why?' <span title="Itens mudaram depois do aceite: '+esc(why)+'">⚠</span>':''}`:`<button class="btn sm" data-act="aceiteNew" data-t="${tipo}" data-k="${esc(chave)}" ${why?'disabled':''} title="${why?esc(why):'Registrar o aceite com assinatura'}">Aceitar</button>`;
  const meta=`<td style="white-space:nowrap">${m&&m.fim?`<span class="${late?'venc':''}">${fmtD(m.fim)}${late?' ⚠':''}</span>`:'<span class="muted">—</span>'} ${canOffice()?`<button class="btn sec sm" data-act="metaEdit" data-t="${tipo}" data-k="${esc(chave)}" title="Definir meta de conclusão">📅</button>`:''}</td>`;
  return `<tr><td><b>${esc(chave)}</b></td><td>${t}</td><td>${c.conferido}</td><td>${c.divergente}</td><td>${c.pendente}</td><td>${c.em_conferencia}</td><td style="min-width:130px">${pc}%${bar(c,t)}</td><td>${pa?`<b style="color:var(--verm)">${pa}</b>`:'0'}</td>${meta}<td style="white-space:nowrap">${canOffice()?acc:(ac?'<span class="chip s-conferido">✔ Aceito</span>':'—')}</td></tr>`}).join('')}
function viewPainel(){
 if(!ui.projetoId){ui.view='home';return render()}
 const its=projItens(ui.projetoId),pend=pendProj(),abertas=pend.filter(p=>p.estado!=='fechada');
 const gp=new Map();its.forEach(i=>{const k=pavLabel(i);(gp.get(k)||gp.set(k,[]).get(k)).push(i)});
 const gc=new Map();its.forEach(i=>{const k=CATS[i.cat].l;(gc.get(k)||gc.set(k,[]).get(k)).push(i)});
 const gs=its.filter(i=>!i.pai&&filhos(i.id).length).map(r=>[String(r.campos.tag),[r,...descend(r.id)]]).sort((a,b)=>a[0].localeCompare(b[0],'pt-BR',{numeric:true}));
 const pess=new Map();const P=n=>pess.get(n)||pess.set(n,{conf:0,div:0,ab:0,venc:0,fech:0,ult:''}).get(n);
 its.forEach(i=>{const x=S.conf[i.id];if(x&&x.estado==='finalizada'&&x.resp){const r=P(x.resp);r.conf++;if(statusOf(i.id)==='divergente')r.div++;if((x.data||'')>r.ult)r.ult=x.data}});
 pend.forEach(p=>{const r=P(p.resp||'(sem responsável)');if(p.estado==='fechada')r.fech++;else{r.ab++;if(pendVenc(p))r.venc++}});
 const emp=new Map();pend.forEach(p=>{const n=p.empresa||'(sem empresa)';const r=emp.get(n)||emp.set(n,{ab:0,venc:0,cor:0,fech:0}).get(n);if(p.estado==='fechada')r.fech++;else{r.ab++;if(pendVenc(p))r.venc++;if(p.estado==='corrigida')r.cor++}});
 const head=t=>`<thead><tr><th>${t}</th><th>Itens</th><th>Conferidos</th><th>Divergentes</th><th>Pendentes</th><th>Em conf.</th><th>Andamento</th><th>Pend. abertas</th><th>Meta</th><th>Aceite</th></tr></thead>`;
 $('#cfMain').innerHTML=`<div class="card"><h2 style="margin:0">Painel — ${esc(proj(ui.projetoId).nome)}</h2>
  <div class="pend-kpis"><div class="${abertas.length?'bad':''}"><b>${abertas.length}</b><span>pendências abertas</span></div><div class="${pend.filter(pendVenc).length?'bad':''}"><b>${pend.filter(pendVenc).length}</b><span>vencidas</span></div><div><b>${pend.filter(x=>x.estado==='corrigida').length}</b><span>aguardando reconferência</span></div><div><b>${pend.filter(x=>x.estado==='fechada').length}</b><span>fechadas</span></div></div></div>
  ${cronoHTML()}
  ${gs.length?`<div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0;margin:0">Por sistema <span class="muted" style="font-weight:400;font-size:13px">(equipamento principal e tudo que ele atende)</span></h3><table class="tbl-pend">${head('Sistema (equipamento principal)')}<tbody>${painelRows('sis',gs)}</tbody></table></div>`:''}
  <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0;margin:0">Por tipo de equipamento</h3><table class="tbl-pend">${head('Tipo')}<tbody>${painelRows('cat',[...gc.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR')))}</tbody></table></div>
  <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0;margin:0">Por pavimento</h3><table class="tbl-pend">${head('Pavimento')}<tbody>${painelRows('pav',[...gp.entries()].sort((a,b)=>pavSort(a[0],b[0])))}</tbody></table></div>
  <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0;margin:0">Por empresa</h3><table class="tbl-pend"><thead><tr><th>Empresa</th><th>Pendências abertas</th><th>Vencidas</th><th>Aguardando reconferência</th><th>Fechadas</th></tr></thead><tbody>
  ${[...emp.entries()].sort((a,b)=>b[1].ab-a[1].ab).map(([n,r])=>`<tr><td><b>${esc(n)}</b></td><td>${r.ab}</td><td class="${r.venc?'venc':''}">${r.venc}</td><td>${r.cor}</td><td>${r.fech}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Nenhuma pendência ainda. Informe a empresa responsável ao abrir uma pendência.</td></tr>'}</tbody></table></div>
  <div class="card" style="padding:0;overflow:auto"><h3 style="padding:14px 16px 0;margin:0">Por pessoa</h3><table class="tbl-pend"><thead><tr><th>Pessoa</th><th>Conferências finalizadas</th><th>Com divergência</th><th>Pendências abertas</th><th>Vencidas</th><th>Fechadas</th><th>Última conferência</th></tr></thead><tbody>
  ${[...pess.entries()].sort((a,b)=>b[1].ab-a[1].ab||b[1].conf-a[1].conf).map(([n,r])=>`<tr><td><b>${esc(n)}</b></td><td>${r.conf}</td><td>${r.div}</td><td>${r.ab}</td><td class="${r.venc?'venc':''}">${r.venc}</td><td>${r.fech}</td><td>${r.ult?fdt(r.ult):'—'}</td></tr>`).join('')||'<tr><td colspan="7" class="muted">Ainda não há conferências nem pendências.</td></tr>'}</tbody></table></div>`;
}
let AC=null;
ACT.aceiteNew=b=>{const tipo=b.dataset.t,chave=b.dataset.k,l=escopoItens(tipo,chave),why=escopoOk(l);if(why)return toast(why);AC={tipo,chave};
 openModal(`<h3>Registrar aceite — ${esc(chave)}</h3><p class="muted">${l.length} item(ns) conferido(s) sem divergência e sem pendência em aberto. Quem recebe (cliente, fiscal ou gerente) assina abaixo.</p>
  <div class="two"><div class="fld"><label for="ac_nome">Nome de quem aceita</label><input id="ac_nome" type="text" value="${esc(cfg().cliente||'')}"></div><div class="fld"><label for="ac_cargo">Cargo / empresa</label><input id="ac_cargo" type="text"></div></div>
  <div class="fld"><label for="ac_obs">Observações ${micBtn('ac_obs')}</label><textarea id="ac_obs"></textarea></div>
  <div class="fld"><label>Assinatura</label><canvas id="ac_sig" class="sigpad"></canvas><button class="btn sec sm" type="button" data-act="sigClear">Limpar assinatura</button></div>
  <div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" style="background:var(--verde)" data-act="aceiteSave">✔ Registrar aceite</button></div>`,true);
 SG=sigPad($('#ac_sig'),'')};
ACT.aceiteSave=()=>{if(!AC)return;const nome=$('#ac_nome').value.trim(),sig=SG?SG.get():'';if(!nome)return toast('Informe o nome de quem aceita');if(!sig)return toast('A assinatura é necessária para registrar o aceite');
 const l=escopoItens(AC.tipo,AC.chave),why=escopoOk(l);if(why)return toast(why);
 S.aceites=S.aceites||[];S.aceites.push({id:uid(),projetoId:ui.projetoId,tipo:AC.tipo,chave:AC.chave,ts:new Date().toISOString(),user:user||'',nome,cargo:$('#ac_cargo').value.trim(),obs:$('#ac_obs').value.trim(),assin:sig,n:l.length});
 logH('criou','aceite',ui.projetoId,`Aceite registrado: ${AC.chave} (${l.length} itens) por ${nome}`);save();SG=null;closeModal();viewPainel();toast('Aceite registrado')};
ACT.aceiteView=b=>{const a=aceiteDe(b.dataset.t,b.dataset.k);if(!a)return;AC=a;
 openModal(`<h3>Aceite — ${esc(a.chave)}</h3><p>Aceito por <b>${esc(a.nome)}</b>${a.cargo?' ('+esc(a.cargo)+')':''} em ${fdt(a.ts)}.<br><span class="muted">Registrado por ${esc(a.user||'—')} · ${a.n} item(ns) na data do aceite.</span></p>${a.obs?`<p>${esc(a.obs)}</p>`:''}<img src="${a.assin}" alt="Assinatura" class="sigimg">
  <div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button>${canOffice()?'<button class="btn red" data-act="aceiteDel">Cancelar este aceite</button>':''}</div>`)};
ACT.aceiteDel=()=>{if(!AC||!confirm('Cancelar este aceite? A assinatura será apagada.'))return;S.aceites=S.aceites.filter(x=>x.id!==AC.id);logH('excluiu','aceite',ui.projetoId,'Cancelou aceite de '+AC.chave);save();closeModal();viewPainel()};
function aceitesRep(){const l=(S.aceites||[]).filter(a=>a.projetoId===ui.projetoId);if(!l.length)return '';
 return `<div class="rep-item"><b style="font-size:16px">Aceites registrados</b>${l.map(a=>`<div class="rep-ac"><img src="${a.assin}" alt=""><div><b>${esc(a.chave)}</b> <span class="muted">(${a.tipo==='pav'?'pavimento':'sistema'} · ${a.n} itens)</span><br>Aceito por ${esc(a.nome)}${a.cargo?' — '+esc(a.cargo):''}<br><span class="muted">${fdt(a.ts)}${a.obs?' · '+esc(a.obs):''}</span></div></div>`).join('')}</div>`}

/* ---------- Documentos por equipamento ---------- */
const fsz=n=>n>=1048576?(n/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(n/1024))+' KB';
let DOCID=null;
function docsModal(id){const it=item(id);if(!it)return;DOCID=id;it.docs=it.docs||[];const off=canOffice();
 openModal(`<h3>📎 Documentos — ${esc(it.campos.tag)}</h3><p class="muted" style="margin-top:0">Manual, certificado, ART, folha de dados, foto da placa… tudo que acompanha o equipamento na entrega.</p>
  <div class="doc-list">${it.docs.map(d=>`<div class="doc-r"><div class="grow"><b>${esc(d.nome)}</b><div class="muted">${fsz(d.size||0)} · ${esc(d.user||'')} · ${fdt(d.ts)}</div></div><button class="btn sec sm" data-act="docOpen" data-i="${d.id}">Abrir</button>${off||true?`<button class="btn red sm" data-act="docDel" data-i="${d.id}" title="Remover">🗑</button>`:''}</div>`).join('')||'<div class="muted">Nenhum documento anexado.</div>'}</div>
  <input type="file" id="doc_f" multiple style="display:none"><div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button><button class="btn" data-act="docAdd">➕ Anexar arquivo</button></div>`);
 $('#doc_f').onchange=async e=>{const it2=item(DOCID);if(!it2)return;for(const f of e.target.files){const bid='doc_'+uid();await blobSet(bid,f);it2.docs.push({id:uid(),nome:f.name,mime:f.type||'',size:f.size,blobId:bid,ts:new Date().toISOString(),user:user||''});logH('editou','item',DOCID,`Anexou documento ${f.name} em ${it2.campos.tag}`)}save();docsModal(DOCID);if(ui.view==='itens')viewItens()}}
ACT.docs=b=>docsModal(b.dataset.id);
ACT.docAdd=()=>$('#doc_f').click();
ACT.docOpen=async b=>{const it=item(DOCID),d=it?.docs.find(x=>x.id===b.dataset.i);if(!d)return;const bl=await blobGet(d.blobId);if(!bl)return toast('Arquivo não encontrado neste aparelho (foi anexado em outro).');
 if((d.mime||'').startsWith('image/')){const u=URL.createObjectURL(bl),lb=document.createElement('div');lb.className='cf-lightbox';lb.innerHTML=`<img src="${u}" alt="">`;lb.onclick=()=>{lb.remove();URL.revokeObjectURL(u)};root.append(lb)}
 else download(d.nome,new Blob([bl],{type:d.mime||'application/octet-stream'}))};
ACT.docDel=b=>{const it=item(DOCID),d=it?.docs.find(x=>x.id===b.dataset.i);if(!d||!confirm('Remover "'+d.nome+'"?'))return;blobDel(d.blobId);it.docs=it.docs.filter(x=>x.id!==d.id);logH('editou','item',DOCID,`Removeu documento ${d.nome} de ${it.campos.tag}`);save();docsModal(DOCID);if(ui.view==='itens')viewItens()};
const docBtn=i=>`<button class="btn sec sm" data-act="docs" data-id="${i.id}" title="Documentos do equipamento">📎${(i.docs||[]).length?' '+i.docs.length:''}</button>`;

/* ---------- QR code: etiquetas e leitura ---------- */
const qrText=i=>'HVACCX|'+i.id+'|'+i.campos.tag;
async function ensureQr(){if(globalThis.qrcode)return true;try{await loadVendor('qrcode.js')}catch{return false}return !!globalThis.qrcode}
function qrSvg(text){const q=globalThis.qrcode(0,'M');q.addData(text);q.make();return q.createSvgTag({cellSize:4,margin:0,scalable:true})}
ACT.qrLabels=async()=>{if(!await ensureQr())return toast('Biblioteca de QR indisponível');const list=filteredItens();if(!list.length)return toast('Nenhum item na lista (veja os filtros)');
 const nat=(a,b)=>String(a.campos.tag).localeCompare(String(b.campos.tag),'pt-BR',{numeric:true});
 let o=document.getElementById('cfLab');if(o)o.remove();o=document.createElement('div');o.id='cfLab';
 o.innerHTML=`<div class="lab-bar"><b>Etiquetas QR — ${list.length} equipamento(s)</b><span class="muted">Cole no equipamento. O engenheiro lê com o botão “📷 Ler QR” e a conferência abre direto.</span><button class="btn" data-lab="print">🖨 Imprimir / Salvar PDF</button><button class="btn sec" data-lab="close">Fechar</button></div>
  <div class="lab-grid">${list.slice().sort(nat).map(i=>`<div class="lab"><div class="lab-qr">${qrSvg(qrText(i))}</div><div class="lab-t"><b>${esc(i.campos.tag)}</b><span>${esc(CATS[i.cat].l)}</span>${i.campos.ambiente?`<span>${esc(i.campos.ambiente)}</span>`:''}</div></div>`).join('')}</div>`;
 document.body.append(o);document.body.classList.add('cf-labp');
 o.onclick=e=>{const a=e.target.closest('[data-lab]');if(!a)return;if(a.dataset.lab==='close'){o.remove();document.body.classList.remove('cf-labp')}else ACT.print()}};
let QRS=null;
async function ensureJsQr(){if(globalThis.jsQR)return true;try{await loadVendor('jsQR.js')}catch{return false}return !!globalThis.jsQR}
function qrStop(){if(!QRS)return;QRS.on=false;try{QRS.stream&&QRS.stream.getTracks().forEach(t=>t.stop())}catch{}QRS.el&&QRS.el.remove();QRS=null}
function qrOpenItem(text){
 text=String(text||'').trim();let it=null;
 const m=/^HVACCX\|([^|]+)\|(.*)$/.exec(text);
 if(m)it=item(m[1])||S.itens.find(i=>String(i.campos.tag).toLowerCase()===m[2].toLowerCase());
 if(!it)it=S.itens.find(i=>String(i.campos.tag).toLowerCase()===text.toLowerCase());
 if(!it){toast('Equipamento não encontrado neste aparelho: '+text);return false}
 const p=proj(it.projetoId);if(p){ui.projetoId=p.id;ui.obraId=p.obraId}
 closeModal();openConf(it.id);return true}
ACT.qrScan=async()=>{qrStop();const el=document.createElement('div');el.className='qr-ov';
 el.innerHTML=`<div class="qr-box"><b>Aponte a câmera para a etiqueta QR do equipamento</b><div class="qr-vw"><video playsinline muted></video><i></i></div><div class="qr-msg muted">Iniciando câmera…</div>
  <div class="row" style="margin-top:8px"><input type="text" class="qr-man" placeholder="Ou digite a TAG (ex.: D-ADM-01)"><button class="btn" data-q="go" style="flex:none">Abrir</button><button class="btn sec" data-q="x" style="flex:none">Fechar</button></div></div>`;
 root.append(el);QRS={el,on:true};
 el.onclick=e=>{const a=e.target.closest('[data-q]');if(!a)return;if(a.dataset.q==='x')qrStop();else{const v=el.querySelector('.qr-man').value;if(v&&qrOpenItem(v))qrStop()}};
 el.querySelector('.qr-man').onkeydown=e=>{if(e.key==='Enter')el.querySelector('[data-q=go]').click()};
 const msg=t=>{const m=el.querySelector('.qr-msg');if(m)m.textContent=t};
 if(!navigator.mediaDevices?.getUserMedia)return msg('Este aparelho/navegador não permite usar a câmera aqui. Digite a TAG abaixo.');
 if(!await ensureJsQr())return msg('Leitor de QR indisponível. Digite a TAG abaixo.');
 try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(!QRS||QRS.el!==el){stream.getTracks().forEach(t=>t.stop());return}
  QRS.stream=stream;const v=el.querySelector('video');v.srcObject=stream;await v.play();msg('Procurando QR…');
  const cv=document.createElement('canvas'),g=cv.getContext('2d',{willReadFrequently:true});
  const tick=()=>{if(!QRS||QRS.el!==el||!QRS.on)return;
   if(v.videoWidth){const w=Math.min(640,v.videoWidth);cv.width=w;cv.height=Math.round(v.videoHeight*w/v.videoWidth);g.drawImage(v,0,0,cv.width,cv.height);
    const r=globalThis.jsQR(g.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height,{inversionAttempts:'dontInvert'});
    if(r&&r.data){if(qrOpenItem(r.data)){qrStop();return}else{QRS.on=false;setTimeout(()=>{if(QRS&&QRS.el===el)QRS.on=true,tick()},1800);return}}}
   setTimeout(tick,120)};
  tick();
 }catch(e){msg('Câmera indisponível ('+(e.name==='NotAllowedError'?'acesso negado — permita a câmera para este site':e.message)+'). Digite a TAG abaixo.')}};

/* ---------- Revisões de planta ---------- */
const revLetra=n=>{let s='';n=n+1;while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s};
ACT.revPl=b=>{const p=planta(b.dataset.id);if(!p)return;p.revs=p.revs||[];const atual=p.rev||revLetra(p.revs.length);
 formModal(`Nova revisão — ${p.nome}`,[{k:'file',l:`Arquivo da nova revisão (atual: revisão ${atual}) — PDF, DXF, PNG ou JPG`,type:'file',accept:'.pdf,.dxf,.png,.jpg,.jpeg'},{k:'nota',l:'O que mudou (opcional)'}],async v=>{
  if(!v.file){toast('Selecione o arquivo');return false}const tipo=fileTipo(v.file);if(!tipo){toast('Formato não suportado — use PDF, DXF, PNG ou JPG');return false}
  p.revs.push({rev:atual,blobId:p.blobId,tipo:p.tipo,ts:new Date().toISOString(),user:user||'',nota:p.nota||''});
  p.blobId='pl_'+uid();await blobSet(p.blobId,v.file);p.tipo=tipo;p.paginas=0;{const used=new Set(p.revs.map(r=>r.rev));let n=p.revs.length,L;do{L=revLetra(n++)}while(used.has(L));p.rev=L}p.nota=v.nota||'';p.revAviso=true;delete docCache[p.id];
  logH('editou','planta',p.id,`Nova revisão ${p.rev} da planta ${p.nome}`);save();render();toast(`Revisão ${p.rev} enviada. Os ${S.marcas.filter(m=>m.plantaId===p.id).length} ponto(s) foram mantidos — confira se continuam no lugar.`)},'Enviar revisão')};
ACT.revList=b=>{const p=planta(b.dataset.id);if(!p)return;p.revs=p.revs||[];const atual=p.rev||revLetra(p.revs.length);
 openModal(`<h3>Revisões — ${esc(p.nome)}</h3><div class="doc-list"><div class="doc-r"><div class="grow"><b>Revisão ${atual} (em uso)</b><div class="muted">${p.tipo.toUpperCase()}${p.nota?' · '+esc(p.nota):''}</div></div></div>
  ${p.revs.slice().reverse().map((r,i)=>`<div class="doc-r"><div class="grow"><b>Revisão ${esc(r.rev)}</b><div class="muted">${(r.tipo||'').toUpperCase()} · substituída em ${fdt(r.ts)} por ${esc(r.user||'—')}${r.nota?' · '+esc(r.nota):''}</div></div>${canOffice()?`<button class="btn sec sm" data-act="revBack" data-id="${p.id}" data-i="${p.revs.length-1-i}">Voltar para esta</button>`:''}</div>`).join('')}</div>
  <div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
ACT.revBack=b=>{const p=planta(b.dataset.id),r=p?.revs[+b.dataset.i];if(!r||!confirm(`Voltar a planta para a revisão ${r.rev}? A revisão atual continua guardada no histórico.`))return;
 const atual=p.rev||revLetra(p.revs.length);p.revs.splice(+b.dataset.i,1,{rev:atual,blobId:p.blobId,tipo:p.tipo,ts:new Date().toISOString(),user:user||'',nota:p.nota||''});
 p.blobId=r.blobId;p.tipo=r.tipo;p.rev=r.rev;p.nota=r.nota||'';p.paginas=0;p.revAviso=true;delete docCache[p.id];logH('editou','planta',p.id,`Planta ${p.nome} voltou para a revisão ${r.rev}`);save();closeModal();render()};


/* =====================================================================
   v0.9 — HIERARQUIA, AVISOS, EMPRESAS, METAS, VOZ, DESENHO, CHECKLISTS, EXPORTAÇÕES
   ===================================================================== */
const fmtD=d=>d?d.split('-').reverse().join('/'):'';
const addDias=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toLocaleDateString('sv-SE')};

/* ---------- 1. Hierarquia de sistemas (quem atende quem) ---------- */
const filhos=id=>S.itens.filter(i=>i.pai===id);
function descend(id,seen){seen=seen||new Set([id]);const out=[];for(const f of filhos(id)){if(seen.has(f.id))continue;seen.add(f.id);out.push(f,...descend(f.id,seen))}return out}
const paiDe=i=>i.pai?item(i.pai):null;
function hierInfo(i){const p=paiDe(i),f=filhos(i.id);if(!p&&!f.length)return '';
 return `<div class="hier">${p?`↳ Atendido por <b>${esc(p.campos.tag)}</b> (${esc(CATS[p.cat].l)})`:''}${p&&f.length?' · ':''}${f.length?`Atende <b>${f.length}</b>: ${f.slice(0,8).map(x=>esc(x.campos.tag)).join(', ')}${f.length>8?'…':''}`:''}</div>`}

/* ---------- 2. Avisos (sino) ---------- */
const AV_T={venc:'⚠ Vencida',prox:'⏰ Vence em breve',reconf:'📋 Aguardando reconferência',sua:'⚑ Atribuída a você',semresp:'❔ Sem responsável'};
function avisos(){const l=[],eu=user||'',off=canOffice();
 (S.pend||[]).forEach(p=>{if(p.estado==='fechada')return;const it=item(p.itemId);if(!it)return;const mine=!!eu&&p.resp===eu;let tipo='';
  if(pendVenc(p)&&(mine||off))tipo='venc';
  else if(mine&&p.estado==='aberta'&&p.prazo&&p.prazo<=addDias(2))tipo='prox';
  else if(off&&p.estado==='corrigida')tipo='reconf';
  else if(mine&&p.estado==='aberta')tipo='sua';
  else if(off&&p.estado==='aberta'&&!p.resp)tipo='semresp';
  if(tipo)l.push({tipo,p,it})});
 const o={venc:0,prox:1,reconf:2,sua:3,semresp:4};return l.sort((a,b)=>o[a.tipo]-o[b.tipo])}
let notified=false;
function avisoNotify(){if(notified||!user)return;const n=avisos().length;if(!n)return;notified=true;try{if(globalThis.Notification&&Notification.permission==='granted')new Notification('Comissionamento de obra',{body:n+' pendência(s) precisam da sua atenção'})}catch{}}
ACT.bell=()=>{const l=avisos();
 openModal(`<h3>🔔 Avisos</h3><p class="muted" style="margin-top:0">${user?'Pendências que precisam de ação de '+esc(user)+(canOffice()?' e do escritório':'')+'.':'Entre com seu usuário para ver os seus avisos.'}</p>
  <div class="doc-list">${l.map(a=>`<div class="doc-r click" data-act="avOpen" data-id="${a.p.id}"><div class="grow"><b>${esc(a.it.campos.tag)}</b> — ${esc(a.p.titulo)}<div class="muted">${AV_T[a.tipo]}${a.p.prazo?' · prazo '+fmtD(a.p.prazo):''}${a.p.resp?' · '+esc(a.p.resp):''}</div></div><span class="chip pst-${a.p.estado}">${PEND_ST[a.p.estado]}</span></div>`).join('')||'<div class="muted">Nada pendente para você. 👍</div>'}</div>
  ${globalThis.Notification&&Notification.permission!=='granted'&&Notification.permission!=='denied'?'<div class="mfoot" style="justify-content:flex-start"><button class="btn sec" data-act="avPerm">Ativar aviso do navegador ao abrir o programa</button></div>':'<div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>'}
  <p class="muted" style="font-size:12px;margin-bottom:0">Os avisos aparecem quando o programa está aberto. Para avisar alguém fora do programa, abra a pendência e use <b>📤 Avisar responsável</b> (WhatsApp ou e-mail).</p>`)};
ACT.avOpen=b=>pendModal(b.dataset.id);
ACT.avPerm=async()=>{try{const r=await Notification.requestPermission();toast(r==='granted'?'Avisos do navegador ativados':'Avisos não permitidos')}catch{toast('Este navegador não permite avisos')}ACT.bell()};
ACT.pendAvisar=async()=>{const p=(S.pend||[]).find(x=>x.id===PD);if(!p)return;const it=item(p.itemId);pendRead(p);save();
 const txt=`Pendência em ${it.campos.tag} (${proj(it.projetoId)?.nome||''}): ${p.titulo}\n${p.desc||''}\nResponsável: ${p.resp||'—'}${p.empresa?' ('+p.empresa+')':''}\nPrazo: ${p.prazo?fmtD(p.prazo):'—'}`;
 if(navigator.share){try{await navigator.share({title:'Pendência '+it.campos.tag,text:txt});return}catch(e){if(e&&e.name==='AbortError')return}}
 const em=(S.usuarios.find(u=>u.nome===p.resp)||{}).email||'';
 try{await navigator.clipboard.writeText(txt);toast('Texto copiado — cole no WhatsApp ou no e-mail')}catch{}
 const a=document.createElement('a');a.href='mailto:'+encodeURIComponent(em)+'?subject='+encodeURIComponent('Pendência '+it.campos.tag)+'&body='+encodeURIComponent(txt);document.body.append(a);a.click();a.remove()};

/* ---------- 3. Metas e cronograma ---------- */
const metaKey=(t,k)=>t+':'+k;
const metaDe=(t,k)=>((proj(ui.projetoId)||{}).metas||{})[metaKey(t,k)];
ACT.metaEdit=b=>{const t=b.dataset.t,k=b.dataset.k,m=metaDe(t,k)||{};
 formModal('Meta — '+k,[{k:'ini',l:'Início previsto',type:'date',value:m.ini||''},{k:'fim',l:'Meta de conclusão (tudo conferido)',type:'date',value:m.fim||''}],v=>{
  if(v.ini&&v.fim&&v.ini>v.fim){toast('O início não pode ser depois da meta');return false}
  const pr=proj(ui.projetoId);pr.metas=pr.metas||{};if(!v.ini&&!v.fim)delete pr.metas[metaKey(t,k)];else pr.metas[metaKey(t,k)]={ini:v.ini,fim:v.fim};
  logH('editou','projeto',pr.id,`Meta de ${k}: ${v.fim?fmtD(v.fim):'removida'}`);save();viewPainel()})};
function escopoLista(t,k){return escopoItens(t,k)}
function cronoHTML(){
 const pr=proj(ui.projetoId),M=pr.metas||{},keys=Object.keys(M).filter(x=>M[x].fim||M[x].ini);if(!keys.length)return '';
 const rows=keys.map(x=>{const[t,...r]=x.split(':'),k=r.join(':'),m=M[x],l=escopoItens(t,k),c=counts(l),pc=l.length?Math.round(c.conferido/l.length*100):0;const fim=m.fim||m.ini,ini=m.ini||fim;return{t,k,m,pc,fim,ini,atras:m.fim&&m.fim<hoje()&&pc<100}}).sort((a,b)=>a.fim.localeCompare(b.fim));
 const dMs=d=>new Date(d+'T12:00:00').getTime(),h=hoje();
 let lo=Math.min(...rows.map(r=>dMs(r.ini)),dMs(h)),hi=Math.max(...rows.map(r=>dMs(r.fim)),dMs(h));const pad=(hi-lo)*.04+864e5*2;lo-=pad;hi+=pad;const pos=ms=>((ms-lo)/(hi-lo)*100).toFixed(2);
 return `<div class="card"><h3 style="margin:0 0 10px">Cronograma</h3><div class="cr"><div class="cr-hoje" style="left:${pos(dMs(h))}%" title="Hoje"><span>hoje</span></div>
 ${rows.map(r=>{const a=dMs(r.ini),b=Math.max(dMs(r.fim),a+864e5*3);return `<div class="cr-row"><div class="cr-l"><b>${esc(r.k)}</b><span class="muted">${r.t==='pav'?'pavimento':r.t==='sis'?'sistema':'tipo'}</span></div><div class="cr-t"><div class="cr-b ${r.atras?'late':''}" style="left:${pos(a)}%;width:${(pos(b)-pos(a)).toFixed(2)}%" title="${fmtD(r.m.ini)||'—'} → ${fmtD(r.m.fim)||'—'} · ${r.pc}% conferido"><i style="width:${r.pc}%"></i><em>${r.pc}%</em></div></div></div>`}).join('')}</div>
 <p class="muted" style="margin:8px 0 0;font-size:12px">A barra vai do início à meta; o preenchimento é a parte já conferida sem divergência. Vermelho = passou da meta e ainda não terminou.</p></div>`}

/* ---------- 5. Ditado por voz ---------- */
const SR=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
const micBtn=id=>(SR&&!desk())?`<button class="btn sec sm mic" type="button" data-act="mic" data-t="${id}" title="Falar em vez de digitar">🎤 Ditar</button>`:'';
let REC=null;
ACT.mic=b=>{if(REC){try{REC.stop()}catch{}return}const el=document.getElementById(b.dataset.t);if(!el||!SR)return;
 const r=new SR(),old=b.textContent;REC=r;r.lang='pt-BR';r.interimResults=false;r.continuous=true;b.textContent='● Ouvindo… toque para parar';b.classList.add('rec');
 r.onresult=e=>{let t='';for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)t+=e.results[i][0].transcript;if(t)el.value=(el.value?el.value.replace(/\s*$/,' '):'')+t.trim()};
 r.onerror=e=>{toast(e.error==='not-allowed'?'Permita o microfone para ditar':e.error==='network'?'O ditado precisa de internet':'Ditado: '+e.error)};
 r.onend=()=>{REC=null;b.textContent=old;b.classList.remove('rec')};
 try{r.start()}catch{REC=null;b.textContent=old;b.classList.remove('rec')}};

/* ---------- 6a. Marcar sobre a foto ---------- */
function markEditor(url,onSave){
 const o=document.createElement('div');o.className='mk-ov';
 o.innerHTML=`<div class="mk-box"><div class="mk-bar"><span class="mk-tools">${[['pen','✏ Caneta'],['circ','◯ Círculo'],['arr','➚ Seta']].map(([k,l],i)=>`<button type="button" data-t="${k}" class="${i?'':'on'}">${l}</button>`).join('')}</span><span class="mk-cols">${['#E5252A','#F5B800','#1E6FE0','#12A150','#111111'].map((c,i)=>`<button type="button" data-c="${c}" class="${i?'':'on'}" style="background:${c}" aria-label="cor"></button>`).join('')}</span><span class="mk-act"><button type="button" data-a="undo">↶ Desfazer</button><button type="button" data-a="clr">Limpar</button><button type="button" data-a="ok" class="ok">✔ Salvar</button><button type="button" data-a="x">Cancelar</button></span></div><div class="mk-cv"><canvas></canvas></div></div>`;
 document.body.append(o);
 const cv=o.querySelector('canvas'),g=cv.getContext('2d'),img=new Image();let strokes=[],cur=null,tool='pen',col='#E5252A';
 const lw=()=>Math.max(4,cv.width/180);
 const shape=s=>{g.strokeStyle=s.c;g.fillStyle=s.c;g.lineWidth=lw();g.lineCap='round';g.lineJoin='round';const a=s.p[0],b=s.p[s.p.length-1];
  if(s.t==='pen'){g.beginPath();g.moveTo(a[0],a[1]);s.p.forEach(q=>g.lineTo(q[0],q[1]));g.stroke()}
  else if(s.t==='circ'){g.beginPath();g.ellipse((a[0]+b[0])/2,(a[1]+b[1])/2,Math.abs(b[0]-a[0])/2+1,Math.abs(b[1]-a[1])/2+1,0,0,7);g.stroke()}
  else{g.beginPath();g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.stroke();const an=Math.atan2(b[1]-a[1],b[0]-a[0]),h=lw()*5;g.beginPath();g.moveTo(b[0],b[1]);g.lineTo(b[0]-h*Math.cos(an-.45),b[1]-h*Math.sin(an-.45));g.lineTo(b[0]-h*Math.cos(an+.45),b[1]-h*Math.sin(an+.45));g.closePath();g.fill()}};
 const redraw=()=>{g.drawImage(img,0,0,cv.width,cv.height);strokes.forEach(shape);if(cur)shape(cur)};
 img.onload=()=>{const s=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));cv.width=Math.round(img.naturalWidth*s);cv.height=Math.round(img.naturalHeight*s);redraw()};img.src=url;
 const pt=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
 cv.addEventListener('pointerdown',e=>{try{cv.setPointerCapture(e.pointerId)}catch{}const q=pt(e);cur={t:tool,c:col,p:tool==='pen'?[q]:[q,q]};e.preventDefault()});
 cv.addEventListener('pointermove',e=>{if(!cur)return;const q=pt(e);if(cur.t==='pen')cur.p.push(q);else cur.p[1]=q;redraw()});
 const end=()=>{if(cur){strokes.push(cur);cur=null;redraw()}};cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
 o.onclick=e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.t){tool=b.dataset.t;o.querySelectorAll('[data-t]').forEach(x=>x.classList.toggle('on',x===b))}
  else if(b.dataset.c){col=b.dataset.c;o.querySelectorAll('[data-c]').forEach(x=>x.classList.toggle('on',x===b))}
  else if(b.dataset.a==='undo'){strokes.pop();redraw()}else if(b.dataset.a==='clr'){strokes=[];redraw()}else if(b.dataset.a==='x')o.remove();
  else if(b.dataset.a==='ok'){cv.toBlob(bl=>{o.remove();onSave(bl)},'image/jpeg',.88)}}}

/* ---------- 6b. Desenhar sobre a planta ---------- */
function drwEnsure(){const st=$('#stage');if(!st||!V)return null;let s=$('#drw');if(!s){s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.id='drw';st.insertBefore(s,$('#mks'))}s.setAttribute('viewBox',`0 0 ${V.W} ${V.H}`);return s}
function drwShape(s){const W=V.W,H=V.H,P=s.p.map(q=>[q[0]*W,q[1]*H]),a=P[0],b=P[P.length-1],c=s.c,f=n=>n.toFixed(1),sw=`stroke="${c}" stroke-width="3" fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"`;
 if(s.t==='pen')return `<polyline ${sw} points="${P.map(q=>f(q[0])+','+f(q[1])).join(' ')}"/>`;
 if(s.t==='circ')return `<ellipse ${sw} cx="${f((a[0]+b[0])/2)}" cy="${f((a[1]+b[1])/2)}" rx="${f(Math.abs(b[0]-a[0])/2+1)}" ry="${f(Math.abs(b[1]-a[1])/2+1)}"/>`;
 const an=Math.atan2(b[1]-a[1],b[0]-a[0]),h=W*.012,hp=[[b[0],b[1]],[b[0]-h*Math.cos(an-.45),b[1]-h*Math.sin(an-.45)],[b[0]-h*Math.cos(an+.45),b[1]-h*Math.sin(an+.45)]];
 return `<line ${sw} x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/><polygon fill="${c}" stroke="${c}" stroke-width="1" vector-effect="non-scaling-stroke" points="${hp.map(q=>f(q[0])+','+f(q[1])).join(' ')}"/>`}
function renderDraw(){if(!V)return;const s=drwEnsure();if(!s)return;const L=(V.p.desenho||[]).filter(d=>(d.pg||1)===ui.pagina);s.innerHTML=L.map(drwShape).join('')+(V.dcur?drwShape(V.dcur):'')}
function drwBar(){const old=$('#drwbar');if(old)old.remove();if(!V||!V.draw)return;const d=V.draw,pv=$('.pvbody');if(!pv)return;
 const bar=document.createElement('div');bar.id='drwbar';bar.className='drwbar';
 bar.innerHTML=`${[['mao','✋ Mover'],['pen','✏ Caneta'],['circ','◯ Círculo'],['arr','➚ Seta']].map(([k,l])=>`<button data-act="drawTool" data-v="${k}" class="${d.tool===k?'on':''}">${l}</button>`).join('')}<span class="mk-cols">${['#E5252A','#F5B800','#1E6FE0','#12A150','#111111'].map(c=>`<button data-act="drawCol" data-v="${c}" class="${d.col===c?'on':''}" style="background:${c}" aria-label="cor"></button>`).join('')}</span><button data-act="drawUndo">↶</button><button data-act="drawClr">Limpar</button><button data-act="drawT" class="ok">✔ Pronto</button>`;
 pv.append(bar)}
ACT.drawT=()=>{if(!V)return;$('#vp')?.classList.toggle('drawing',!V.draw);if(V.draw){V.draw=null;V.dcur=null;if(V.drawCh){logH('editou','planta',V.p.id,'Desenhou sobre a planta '+V.p.nome);V.drawCh=false}renderDraw()}else{V.draw={tool:'pen',col:'#E5252A'};clearSel()}drwBar();viewerUpdate()};
ACT.drawTool=b=>{V.draw.tool=b.dataset.v;drwBar()};ACT.drawCol=b=>{V.draw.col=b.dataset.v;drwBar()};
ACT.drawUndo=()=>{const L=V.p.desenho||[];for(let i=L.length-1;i>=0;i--)if((L[i].pg||1)===ui.pagina){L.splice(i,1);V.drawCh=true;save();break}renderDraw()};
ACT.drawClr=()=>{if(!(V.p.desenho||[]).length||!confirm('Apagar todos os desenhos desta planta?'))return;V.p.desenho=(V.p.desenho||[]).filter(d=>(d.pg||1)!==ui.pagina);V.drawCh=true;save();renderDraw()};
function normC(e){const r=$('#stage').getBoundingClientRect();return[Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))]}
function drawStart(e){const n=normC(e);V.dcur={t:V.draw.tool,c:V.draw.col,pg:ui.pagina,p:V.draw.tool==='pen'?[n]:[n,n]}}
function drawMove(e){if(!V.dcur)return;const n=normC(e);if(V.dcur.t==='pen')V.dcur.p.push(n);else V.dcur.p[1]=n;renderDraw()}
function drawCommit(){const s=V.dcur;V.dcur=null;if(s){const a=s.p[0],b=s.p[s.p.length-1],len=Math.hypot((b[0]-a[0])*V.W,(b[1]-a[1])*V.H);if(s.t==='pen'?s.p.length>2:len>6){V.p.desenho=V.p.desenho||[];V.p.desenho.push(s);V.drawCh=true;save()}}renderDraw()}

/* ---------- 7. Modelos de checklist (verificação e medições) ---------- */
const modeloDe=cat=>(S.modelos||[]).find(m=>m.cat===cat);
function chkRes(l,it){
 if(l.r==='na')return 'na';
 if(l.tipo==='sn')return l.r||'';
 const v=nums(l.v||'');if(!String(l.v||'').trim())return '';
 if(l.ref&&String(it.campos[l.ref]||'').trim())return same(l.ref,it.campos[l.ref],l.v)?'ok':'nok';
 if(String(l.esp??'').trim()&&nums(l.esp).length&&v.length){const e=nums(l.esp)[0],t=(+l.tol||5)/100;return(v[0]>=e*(1-t)-1e-9&&v[0]<=e*(1+t)+1e-9)?'ok':'nok'}
 return 'ok'}
const chkFails=id=>{const c=S.conf[id],it=item(id);return it&&c&&c.chk?c.chk.linhas.filter(l=>chkRes(l,it)==='nok'):[]};
function chkMerge(chk,mod){ // atualiza as linhas com o modelo atual, mantendo respostas
 if(!mod)return chk;
 if(!chk||chk.modeloId!==mod.id)return{modeloId:mod.id,nome:mod.nome,linhas:mod.linhas.map(l=>({...l,r:'',v:'',n:''}))};
 const old=new Map(chk.linhas.map(l=>[l.id,l]));
 return{modeloId:mod.id,nome:mod.nome,linhas:mod.linhas.map(l=>{const o=old.get(l.id);return{...l,r:o?o.r:'',v:o?o.v:'',n:o?o.n:''}})}}
function chkHTML(chk,it){if(!chk||!chk.linhas.length)return '';
 const btn=(l,r,t,c)=>`<button type="button" data-act="chkSet" data-l="${l.id}" data-r="${r}" class="${l.r===r?'on '+c:''}">${t}</button>`;
 return `<div class="pr chk-sec"><label>Checklist — ${esc(chk.nome||'')}</label><table class="chk-t"><tbody>${chk.linhas.map(l=>{const res=chkRes(l,it),proj2=l.ref?String(it.campos[l.ref]||''):'';
  return `<tr data-l="${l.id}" class="r-${res||'vz'}"><td>${esc(l.t)}${l.tipo==='num'&&(proj2||l.esp)?`<div class="muted" style="font-size:12px">${proj2?'Projeto: '+esc(proj2)+(TOLS[l.ref]?' (até +'+Math.round(TOLS[l.ref]*100)+'%)':''):'Esperado: '+esc(l.esp)+' ±'+(+l.tol||5)+'%'}</div>`:''}</td>
  <td class="chk-b">${l.tipo==='sn'?btn(l,'ok','✔ OK','ok')+btn(l,'nok','✖ Não','nok'):`<input type="text" data-ck="${l.id}" value="${esc(l.v||'')}" class="${res}" ${l.r==='na'?'disabled':''} inputmode="decimal"> <small>${esc(l.un||'')}</small>`}${btn(l,'na','N/A','na')}</td></tr>`}).join('')}</tbody></table></div>`}
function adminChk(){
 const cat=ui.chkCat&&CATS[ui.chkCat]?ui.chkCat:'fancoil',mod=modeloDe(cat);
 const sel=`<div class="fld"><label>Tipo de equipamento</label><select data-chg="chkCat">${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${k===cat?'selected':''}>${c.l}${modeloDe(k)?' ✔':''}</option>`).join('')}</select></div>`;
 return `<div class="card"><h3>Modelos de checklist</h3><div class="usr-tab" style="margin-bottom:12px"><b>⚡ Começar rápido</b><p class="muted" style="margin:4px 0 8px">Cria de uma vez um modelo sugerido de HVAC para cada tipo que ainda não tem (bomba, chiller, fancoil, fancolete, difusor, grelha e damper). Depois ajuste ou apague o que não servir. <b>Para os tablets:</b> clique em <b>Gerar arquivo para o tablet</b> e envie o <code>modelos.json</code> ao GitHub, junto do <code>usuarios.json</code>; os engenheiros recebem o checklist sozinhos.</p><div class="row"><button class="btn" data-act="chkAllSug" style="flex:none">Criar modelos sugeridos para todos os tipos</button><button class="btn sec" data-act="chkExport" style="flex:none">⬇ Gerar arquivo para o tablet</button></div></div>
 <p class="muted">Defina, para cada tipo de equipamento, as verificações e medições que o engenheiro deve registrar na conferência (ex.: “fixação adequada”, “corrente medida”). Linhas <b>Não</b> ou medição fora da tolerância deixam o item <b>divergente</b> e abrem pendência.</p>${sel}
 ${mod?`<table class="chk-adm"><thead><tr><th></th><th>Verificação / medição</th><th>Tipo</th><th>Compara com</th><th></th></tr></thead><tbody>${mod.linhas.map((l,i)=>`<tr><td class="muted">${i+1}</td><td>${esc(l.t)}</td><td>${l.tipo==='sn'?'Sim / Não':'Medida'+(l.un?' ('+esc(l.un)+')':'')}</td><td>${l.tipo==='sn'?'—':l.ref?'Projeto: '+esc(F[l.ref].l)+(TOLS[l.ref]?' (+'+Math.round(TOLS[l.ref]*100)+'%)':''):(l.esp?esc(l.esp)+' ±'+(+l.tol||5)+'%':'sem comparação')}</td><td style="white-space:nowrap"><button class="btn sec sm" data-act="chkUp" data-i="${i}">↑</button> <button class="btn sec sm" data-act="chkDn" data-i="${i}">↓</button> <button class="btn sec sm" data-act="chkEdit" data-i="${i}">✎</button> <button class="btn red sm" data-act="chkDel" data-i="${i}">🗑</button></td></tr>`).join('')||'<tr><td colspan="5" class="muted">Modelo sem linhas.</td></tr>'}</tbody></table>
 <div class="row" style="margin-top:10px"><button class="btn" data-act="chkAdd" style="flex:none">+ Nova linha</button><button class="btn red" data-act="chkDelModel" style="flex:none">Excluir modelo</button></div>`
 :`<p class="muted">Ainda não há modelo para <b>${CATS[cat].l}</b>.</p><div class="row"><button class="btn" data-act="chkNew" data-v="sug" style="flex:none">Criar modelo sugerido</button><button class="btn sec" data-act="chkNew" data-v="vazio" style="flex:none">Criar em branco</button></div>`}</div>`}
CHG.chkCat=b=>{ui.chkCat=b.value;render()};
function sugLinhas(cat){const L=[];let n=0;const id=()=>'l'+(++n)+uid().slice(0,3),sn=t=>L.push({id:id(),t,tipo:'sn'}),nu=(t,ref,un)=>L.push({id:id(),t,tipo:'num',un,ref,esp:'',tol:5}),c=CATS[cat].conf;
 sn('Instalado conforme o projeto');sn('TAG de identificação afixada');
 if(cat==='bomba'){sn('Base nivelada e fixação adequada');sn('Sentido de rotação correto');sn('Sem vazamento no selo / conexões');sn('Sem vibração ou ruído anormal');sn('Válvulas de bloqueio e retenção instaladas');sn('Manômetros instalados');sn('Acesso para manutenção livre')}
 else if(cat==='chiller'){sn('Base e amortecedores adequados');sn('Isolamento térmico das tubulações íntegro');sn('Fluxostato e intertravamentos funcionando');sn('Sem vazamento de água ou gás');sn('Sem vibração ou ruído anormal');sn('Acesso para manutenção livre')}
 else if(cat==='fancoil'||cat==='fancolete'){sn('Fixação e suportes adequados');sn('Dreno conectado e escoando');sn('Bandeja limpa e sem vazamento');sn('Filtro instalado');sn('Válvula de água e atuador instalados');sn('Isolamento térmico das tubulações íntegro');sn('Acesso para manutenção livre')}
 else if(cat==='difusor'){sn('Fixação e acabamento adequados');sn('Sem vazamento de ar ao redor');sn('Damper de regulagem instalado')}
 else if(cat==='grelha'){sn('Fixação e acabamento adequados');sn('Sem vazamento de ar ao redor')}
 else if(cat==='damper'){sn('Instalado no sentido e posição corretos');sn('Atuador funcionando (abre e fecha)');sn('Sem obstrução das lâminas');sn('Indicação de posição visível');sn('Acesso para inspeção');if(/damper/i.test(CATS[cat].l))sn('Elo fusível / dispositivo de segurança no lugar (se corta-fogo)')}
 if(c.includes('vazao'))nu('Vazão medida','vazao','m³/h');if(c.includes('vazaoagua'))nu('Vazão de água medida','vazaoagua','m³/h');if(c.includes('pressao'))nu('Pressão medida','pressao','');if(c.includes('corrente'))nu('Corrente medida','corrente','A');if(c.includes('tensaoeq'))nu('Tensão medida','tensaoeq','V');
 return L}
ACT.chkNew=b=>{const cat=ui.chkCat||'fancoil';S.modelos=S.modelos||[];S.modelos.push({id:uid(),cat,nome:'Verificação — '+CATS[cat].l,linhas:b.dataset.v==='sug'?sugLinhas(cat):[]});logH('criou','modelo',cat,'Criou modelo de checklist de '+CATS[cat].l);save();render()};
ACT.chkAllSug=()=>{S.modelos=S.modelos||[];let n=0;Object.keys(CATS).forEach(cat=>{if(!modeloDe(cat)){S.modelos.push({id:uid(),cat,nome:'Verificação — '+CATS[cat].l,linhas:sugLinhas(cat)});n++}});if(!n)return toast('Todos os tipos já têm modelo');logH('criou','modelo','todos','Criou '+n+' modelo(s) de checklist sugeridos');save();render();toast(n+' modelo(s) criado(s). Ajuste o que quiser em cada tipo.')};
ACT.chkExport=()=>{if(!(S.modelos||[]).length)return toast('Crie os modelos primeiro');download('modelos.json',JSON.stringify({v:1,gerado:new Date().toISOString(),modelos:S.modelos.map(({arq,...m})=>m)},null,1),'application/json');toast('Arquivo gerado ('+S.modelos.length+' modelo(s)). Envie para o GitHub, na pasta do site, junto do usuarios.json.')};
async function loadModelFile(){if(desk()||!/^https?:/.test(location.protocol))return;
 try{const r=await fetch('modelos.json?'+Date.now(),{cache:'no-store'});if(!r.ok)return;const j=await r.json();if(!j||!Array.isArray(j.modelos))return;
  S.modelos=S.modelos||[];const ids=new Set(j.modelos.map(m=>m.id));let ch=0;
  for(const m of j.modelos){if(!m.id||!m.cat||!Array.isArray(m.linhas))continue;const n={...m,arq:true},i=S.modelos.findIndex(x=>x.id===m.id);
   if(i<0){S.modelos.push(n);ch++}else if(JSON.stringify({...S.modelos[i],_u:0})!==JSON.stringify({...n,_u:0})){S.modelos[i]=n;ch++}}
  const n0=S.modelos.length;S.modelos=S.modelos.filter(m=>!m.arq||ids.has(m.id));ch+=n0-S.modelos.length;
  if(ch){resetSigs();await kvSet('state',S)}}catch{}}
function chkLinhaForm(i){const cat=ui.chkCat,mod=modeloDe(cat),l=i>=0?mod.linhas[i]:{};
 const refs=[{v:'',t:'— nenhum —'},...Object.keys(F).filter(k=>F[k].num&&CATS[cat].proj.includes(k)).map(k=>({v:k,t:F[k].l+(TOLS[k]?' (+'+Math.round(TOLS[k]*100)+'%)':'')}))];
 formModal(i>=0?'Editar linha':'Nova linha',[{k:'t',l:'Verificação ou medição',value:l.t||''},{k:'tipo',l:'Tipo de resposta',type:'select',value:l.tipo||'sn',options:[{v:'sn',t:'Sim / Não'},{v:'num',t:'Medida (valor)'}]},{k:'un',l:'Unidade (medidas)',value:l.un||''},{k:'ref',l:'Comparar com o campo do projeto (medidas)',type:'select',value:l.ref||'',options:refs},{k:'esp',l:'…ou valor esperado fixo (medidas)',value:l.esp||''},{k:'tol',l:'Tolerância ± % (valor fixo)',value:String(l.tol||5)}],v=>{
  if(!v.t){toast('Escreva a verificação');return false}
  const n={id:l.id||('l'+uid()),t:v.t,tipo:v.tipo};if(v.tipo==='num'){n.un=v.un;n.ref=v.ref;n.esp=v.esp;n.tol=+v.tol||5}
  if(i>=0)mod.linhas[i]=n;else mod.linhas.push(n);save();render()})}
ACT.chkAdd=()=>chkLinhaForm(-1);ACT.chkEdit=b=>chkLinhaForm(+b.dataset.i);
ACT.chkDel=b=>{const m=modeloDe(ui.chkCat);if(!confirm('Excluir esta linha do modelo?'))return;m.linhas.splice(+b.dataset.i,1);save();render()};
ACT.chkUp=b=>{const m=modeloDe(ui.chkCat),i=+b.dataset.i;if(i>0){[m.linhas[i-1],m.linhas[i]]=[m.linhas[i],m.linhas[i-1]];save();render()}};
ACT.chkDn=b=>{const m=modeloDe(ui.chkCat),i=+b.dataset.i;if(i<m.linhas.length-1){[m.linhas[i+1],m.linhas[i]]=[m.linhas[i],m.linhas[i+1]];save();render()}};
ACT.chkDelModel=()=>{const m=modeloDe(ui.chkCat);if(!m||!confirm('Excluir o modelo inteiro? As conferências já feitas guardam as respostas.'))return;S.modelos=S.modelos.filter(x=>x.id!==m.id);save();render()};
function chkRep(i){const c=S.conf[i.id];if(!c||!c.chk||!c.chk.linhas.length)return '';
 return `<table style="margin-top:6px"><thead><tr><th>Checklist — ${esc(c.chk.nome||'')}</th><th>Resposta</th><th></th></tr></thead><tbody>${c.chk.linhas.map(l=>{const r=chkRes(l,i);return `<tr><td>${esc(l.t)}</td><td class="${r==='nok'?'bad-td':r==='ok'?'ok-td':''}">${l.tipo==='sn'?({ok:'OK',nok:'Não',na:'N/A','':'—'})[r||'']:(r==='na'?'N/A':esc((l.v||'—')+(l.un?' '+l.un:'')))}</td><td>${r==='nok'?'✗':r==='ok'?'✓':''}</td></tr>`}).join('')}</tbody></table>`}

/* ---------- 9 e 10. Exportações: dados (Power BI/Excel) e entrega de ativos (manutenção) ---------- */
const stTxt=id=>ST[statusOf(id)];
ACT.xlsDados=async()=>{if(!await ensureXlsx())return toast('Biblioteca Excel indisponível');
 const its=projItens(ui.projetoId),pr=proj(ui.projetoId),ob=obra(pr.obraId)?.nome||'',wb=XLSX.utils.book_new();
 const add=(n,rows,w)=>{const ws=XLSX.utils.aoa_to_sheet(rows);if(w)ws['!cols']=w.map(x=>({wch:x}));XLSX.utils.book_append_sheet(wb,ws,n)};
 add('Itens',[['Obra','Projeto','TAG','Categoria','Pavimento','Ambiente','Fabricante','Modelo','Tipo','Dimensões','Vazão','Quantidade','Atendido por','Status','Conferido por','Data da conferência','Pendências abertas','Documentos'],...its.map(i=>{const c=S.conf[i.id],p=paiDe(i);return[ob,pr.nome,i.campos.tag,CATS[i.cat].l,pavLabel(i),i.campos.ambiente||i.campos.localizacao||'',i.campos.fabricante||'',i.campos.modelo||'',i.campos.tipo||'',i.campos.dimensoes||'',i.campos.vazao||'',i.campos.quantidade||'',p?p.campos.tag:'',stTxt(i.id),c?.resp||'',c?fdt(c.data):'',pendOpen(i.id).length,(i.docs||[]).map(d=>d.nome).join('; ')]})],[14,18,14,12,14,18,14,16,12,12,10,8,14,14,14,18,10,30]);
 const cf=[['TAG','Campo','Previsto','Encontrado','Divergente']];its.forEach(i=>{const c=S.conf[i.id];if(!c)return;const dv=diverg(i.id);CATS[i.cat].conf.forEach(k=>cf.push([i.campos.tag,F[k].l,i.campos[k]||'',c.campos[k]||'',dv.includes(k)?'SIM':'']))});add('Conferências',cf,[14,22,20,20,10]);
 const ck=[['TAG','Linha do checklist','Tipo','Esperado','Resposta','Resultado']];its.forEach(i=>{const c=S.conf[i.id];(c?.chk?.linhas||[]).forEach(l=>{const r=chkRes(l,i);ck.push([i.campos.tag,l.t,l.tipo==='sn'?'Sim/Não':'Medida',l.ref?(i.campos[l.ref]||''):(l.esp||''),l.tipo==='sn'?({ok:'OK',nok:'Não',na:'N/A'})[l.r]||'':(l.v||'')+(l.un?' '+l.un:''),({ok:'OK',nok:'FORA',na:'N/A'})[r]||''])})});add('Checklists',ck,[14,36,10,16,16,10]);
 add('Pendências',[['TAG','Pendência','Descrição','Responsável','Empresa','Prazo','Situação','Aberta em','Fechada em','Comentários'],...pendProj().map(p=>[item(p.itemId)?.campos.tag||'',p.titulo,p.desc||'',p.resp||'',p.empresa||'',p.prazo?fmtD(p.prazo):'',PEND_ST[p.estado],fdt(p.criada),p.fechada?fdt(p.fechada):'',p.coment.length])],[14,28,40,16,16,12,20,18,18,10]);
 add('Aceites',[['Escopo','Nome','Aceito por','Cargo','Data','Itens'],...(S.aceites||[]).filter(a=>a.projetoId===ui.projetoId).map(a=>[a.tipo==='pav'?'Pavimento':'Sistema',a.chave,a.nome,a.cargo||'',fdt(a.ts),a.n])],[12,22,22,18,18,8]);
 const M=pr.metas||{};add('Metas',[['Escopo','Nome','Início','Meta','% conferido'],...Object.keys(M).map(x=>{const[t,...r]=x.split(':'),k=r.join(':'),l=escopoItens(t,k),c=counts(l);return[t==='pav'?'Pavimento':t==='sis'?'Sistema':'Tipo',k,fmtD(M[x].ini),fmtD(M[x].fim),l.length?Math.round(c.conferido/l.length*100)+'%':'']})],[12,22,12,12,12]);
 XLSX.writeFile(wb,'dados_comissionamento_'+(normT(pr.nome)||'projeto')+'.xlsx');toast('Planilha gerada — abra no Excel ou conecte no Power BI')};
ACT.xlsAtivos=async()=>{if(!await ensureXlsx())return toast('Biblioteca Excel indisponível');
 const its=projItens(ui.projetoId),pr=proj(ui.projetoId),ob=obra(pr.obraId)?.nome||'',wb=XLSX.utils.book_new();
 const rows=[['TAG','Descrição','Categoria','Fabricante','Modelo','Tipo','Capacidade','Potência','Vazão','Pressão','Corrente','Tensão (V)','Quadro de alimentação','Pavimento','Local / ambiente','Atendido por','Obra','Projeto','Status do comissionamento','Comissionado por','Data','Pendências abertas','Documentos anexados']];
 its.slice().sort((a,b)=>String(a.campos.tag).localeCompare(String(b.campos.tag),'pt-BR',{numeric:true})).forEach(i=>{const c=S.conf[i.id],k=i.campos,fin=c&&c.estado==='finalizada',p=paiDe(i);const val=f=>(fin&&c.campos[f])||k[f]||'';
  rows.push([k.tag,[CATS[i.cat].l,val('modelo')].filter(Boolean).join(' '),CATS[i.cat].l,val('fabricante'),val('modelo'),val('tipo'),k.capacidade||'',k.potencia||'',val('vazao'),k.pressao||'',k.corrente||'',k.tensaoeq||'',k.quadro||'',pavLabel(i),k.ambiente||k.localizacao||'',p?p.campos.tag:'',ob,pr.nome,stTxt(i.id),fin?c.resp||'':'',fin?fdt(c.data):'',pendOpen(i.id).length,(i.docs||[]).map(d=>d.nome).join('; ')])});
 const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[14,28,12,14,18,14,12,10,10,10,10,10,16,14,20,14,18,18,16,14,16,10,30].map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,'Ativos');
 const h=[['Equipamento (filho)','Atendido por (pai)']];its.filter(i=>i.pai&&item(i.pai)).forEach(i=>h.push([i.campos.tag,item(i.pai).campos.tag]));const ws2=XLSX.utils.aoa_to_sheet(h);ws2['!cols']=[22,22].map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws2,'Hierarquia');
 XLSX.writeFile(wb,'entrega_ativos_'+(normT(pr.nome)||'projeto')+'.xlsx');toast('Planilha de entrega de ativos gerada')};

function bellHTML(){const n=avisos().length;avisoNotify();return `<button class="btn sec bell" data-act="bell" title="Avisos e pendências">🔔${n?` <span class="tabn">${n}</span>`:''}</button>`}

/* ---------- Carimbos de edição, exclusões e sincronização em equipe ---------- */
const ENT=['obras','projetos','plantas','itens','marcas','usuarios','pend','aceites','modelos'];
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
ACT.syncPick=async()=>{const d=desk();if(!d)return;const r=await d({action:'sync-pick'});if(!r)return;if(!await needUser())return;syncOn=true;await syncNow(false);render()};
ACT.syncNow=()=>syncNow(false);
ACT.syncOff=async()=>{const d=desk();if(!d)return;await d({action:'sync-off'});syncOn=false;toast('Sincronização desligada');render()};
ACT.bkpFolder=async()=>{const d=desk();if(!d)return;try{const r=await d({action:'backup-folder'});if(r){localStorage.setItem('orcehvac.conf.lastBkp',new Date().toISOString());toast('Backup completo salvo em: '+r);render()}}catch(e){toast('Backup: '+e.message)}};
ACT.restFolder=async()=>{const d=desk();if(!d)return;if(!confirm('Restaurar um backup substitui os dados atuais (uma cópia dos atuais é guardada antes). Continuar?'))return;try{const r=await d({action:'restore-folder'});if(r){toast('Backup restaurado. Recarregando…');setTimeout(()=>location.reload(),900)}}catch(e){toast('Restauração: '+e.message)}};
ACT.empSave=async()=>{const c=cfg();c.assinObrig=!!$('#e_assinObrig')?.checked;['empresa','cnpj','resp','crea','cliente','contato'].forEach(k=>{c[k]=($('#e_'+k)?.value||'').trim()});
 const f=$('#e_logo')?.files[0];if(f){if(!/^image\//.test(f.type))return toast('O logo precisa ser uma imagem (PNG ou JPG)');await blobSet('logo_empresa',f);urlCache.delete('logo_empresa');c.logo=true}
 save();toast('Dados da empresa salvos');render()};
ACT.empLogoDel=async()=>{await blobDel('logo_empresa');urlCache.delete('logo_empresa');cfg().logo=false;save();render()};
function adminEmp(){const c=cfg();const fl=(k,l)=>`<div class="fld"><label for="e_${k}">${l}</label><input id="e_${k}" type="text" value="${esc(c[k]||'')}"></div>`;
 return `<div class="card"><h3>Empresa e assinatura do relatório</h3><p class="muted">Aparecem no cabeçalho e no rodapé de assinatura do relatório de comissionamento.</p>
 <div class="two"><div>${fl('empresa','Empresa')}${fl('cnpj','CNPJ')}${fl('contato','Telefone / e-mail')}</div><div>${fl('resp','Responsável técnico')}${fl('crea','CREA / registro')}${fl('cliente','Cliente / responsável pelo aceite')}</div></div>
 <div class="fld"><label for="e_logo">Logo da empresa (PNG ou JPG)</label><input id="e_logo" type="file" accept="image/*"></div>
 ${c.logo?'<p class="muted">Logo já cadastrado. <button class="btn red sm" data-act="empLogoDel">Remover logo</button></p>':''}
 <label class="chk"><input type="checkbox" id="e_assinObrig" ${c.assinObrig?'checked':''}> Exigir a assinatura do engenheiro para finalizar uma conferência</label>
 <div class="row"><button class="btn" data-act="empSave" style="flex:none">Salvar</button></div></div>`}

/* ===== TRAVA DO ESCRITÓRIO (senha) — o engenheiro em campo só confere; cadastrar/editar exige senha ===== */
const sha256=(()=>{let K=null,H0=null;const init=()=>{K=[];H0=[];let n=2,c=0;const fr=x=>Math.floor((x-Math.floor(x))*4294967296);while(c<64){let p=true;for(let i=2;i*i<=n;i++)if(n%i===0){p=false;break}if(p){if(c<8)H0.push(fr(Math.sqrt(n)));K.push(fr(Math.cbrt(n)));c++}n++}};
 const rr=(x,n)=>(x>>>n)|(x<<(32-n));
 return s=>{if(!K)init();const b=new TextEncoder().encode(s),l=b.length,nb=((l+9+63)>>6)<<6,m=new Uint8Array(nb);m.set(b);m[l]=128;const dv0=new DataView(m.buffer);dv0.setUint32(nb-4,(l*8)>>>0);dv0.setUint32(nb-8,Math.floor(l*8/4294967296));
  const H=H0.slice(),w=new Uint32Array(64);
  for(let o=0;o<nb;o+=64){for(let i=0;i<16;i++)w[i]=dv0.getUint32(o+i*4);for(let i=16;i<64;i++){const a=w[i-15],c=w[i-2];w[i]=(w[i-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[i-7]+(rr(c,17)^rr(c,19)^(c>>>10)))>>>0}
   let [a,b2,c,d,e,f,g,h]=H;for(let i=0;i<64;i++){const t1=(h+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b2)^(a&c)^(b2&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b2;b2=a;a=(t1+t2)>>>0}
   [a,b2,c,d,e,f,g,h].forEach((v,i)=>{H[i]=(H[i]+v)>>>0})}
  return H.map(x=>x.toString(16).padStart(8,'0')).join('')}})();
const hashPw=(pw,salt)=>{let h=sha256(salt+'|'+pw);for(let i=0;i<4000;i++)h=sha256(h+salt+pw);return h};
const rnd=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return a};

/* ===================================================================
   LOGIN E ACESSOS — cada pessoa entra com a própria senha
   Administrador: tudo + usuários · Escritório: cadastra/edita · Engenheiro (campo): só confere
   =================================================================== */
const ROLES=['Administrador','Escritório','Engenheiro (campo)'];
const ROLE_HELP={'Administrador':'Acesso total e gerencia os usuários.','Escritório':'Cadastra obras, plantas e equipamentos; não gerencia usuários.','Engenheiro (campo)':'Só abre as plantas e registra a conferência. Não altera o cadastro.'};
let me=null;
const isAdm=()=>!!me&&me.papel==='Administrador',canOffice=()=>!!me&&(me.papel==='Administrador'||me.papel==='Escritório');
const initials=n=>String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const UCOL=['#1769e0','#16a34a','#d97706','#9333ea','#dc2626','#0891b2','#be185d','#4d7c0f'];
const ucolor=n=>UCOL[[...String(n)].reduce((a,c,i)=>a+c.charCodeAt(0)*(i+3),0)%UCOL.length];
const avatar=(n,sm,big)=>`<span class="usr-av ${sm?'sm':''} ${big?'big':''}" style="background:${ucolor(n)}">${esc(initials(n))}</span>`;
const sessGet=()=>{try{return sessionStorage.getItem('orcehvac.conf.sess')||localStorage.getItem('orcehvac.conf.sess')||''}catch(e){return ''}};
const sessSet=(id,keep)=>{try{sessionStorage.setItem('orcehvac.conf.sess',id);if(keep)localStorage.setItem('orcehvac.conf.sess',id);else localStorage.removeItem('orcehvac.conf.sess')}catch(e){}};
const sessClear=()=>{try{sessionStorage.removeItem('orcehvac.conf.sess');localStorage.removeItem('orcehvac.conf.sess')}catch(e){}};
function loginAs(u,keep){me=u;user=u.nome;localStorage.setItem('orcehvac.conf.usuario',user);sessSet(u.id,keep);if(!canOffice()){mode='campo';localStorage.setItem('orcehvac.conf.modo','campo')}}
function gate(then){
 if(me){const u=S.usuarios.find(x=>x.id===me.id);if(u){me=u;return true}me=null}
 const id=sessGet(),u=id&&S.usuarios.find(x=>x.id===id);
 if(u){loginAs(u,!!localStorage.getItem('orcehvac.conf.sess'));return true}
 showLogin(then);return false}
function logout(){sessClear();me=null;user='';ui.view='home';showLogin(start)}
function guardMode(){if(mode==='escritorio'&&!canOffice()){mode='campo';localStorage.setItem('orcehvac.conf.modo','campo');if(ui.view==='admin')ui.view='home'}}
function askOffice(then){if(canOffice()){then();return}toast('Seu usuário é do tipo Engenheiro (campo): só confere. Peça acesso ao administrador.')}
const newCode=()=>{const AL='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(rnd(10),x=>AL[x%AL.length]).join('')};
const newSalt=()=>Array.from(rnd(8),x=>x.toString(16).padStart(2,'0')).join('');
const LOGO='<svg viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#0F222B"/><circle cx="32" cy="32" r="22" fill="none" stroke="#244552" stroke-width="2"/><g fill="#19A7C4"><path d="M32 30c-2-8 0-14 6-16 4 6 2 13-6 16z"/><path d="M34 32c8-2 14 0 16 6-6 4-13 2-16-6z"/><path d="M32 34c2 8 0 14-6 16-4-6-2-13 6-16z"/><path d="M30 32c-8 2-14 0-16-6 6-4 13-2 16 6z"/></g><circle cx="32" cy="32" r="4.2" fill="#0F222B" stroke="#E6F4F7" stroke-width="1.6"/><circle cx="48" cy="48" r="9.5" fill="#1F8A5B" stroke="#0F222B" stroke-width="2.2"/><path d="M43.8 48.2l3.1 3.1 6-6.2" stroke="#fff" stroke-width="2.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function showLogin(then){
 const c=document.getElementById('content');if(!c)return;
 const L=document.createElement('div');L.className='cf cf-login';root=L;c.replaceChildren(L);
 let step=S.usuarios.length?'pick':(desk()?'first':'nouser'),sel=null,fails=0,lockUntil=0,keep=false,note='',recCode='',pendUser=null;
 const shell=inner=>`<div class="lg-wrap"><div class="lg-card"><div class="lg-logo">${LOGO}</div><h1>Comissionamento de obra</h1>${inner}</div><div class="lg-foot">Versão ${APP_VERSION}</div></div>`;
 const eye=id=>`<button type="button" class="lg-eye" data-eye="${id}" title="Mostrar/ocultar senha">👁</button>`;
 const draw=()=>{let h='';
  if(step==='pick')h=`<p class="lg-sub">Quem vai entrar?</p>${note?`<div class="lg-ok">${esc(note)}</div>`:''}<div class="usr-grid">${S.usuarios.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(u=>`<button class="usr-card" data-uid="${u.id}">${avatar(u.nome,false,true)}<b>${esc(u.nome)}</b><span class="muted">${esc(u.papel)}</span></button>`).join('')}</div>`;
  else if(step==='pw')h=`<div class="lg-who">${avatar(sel.nome,false,true)}<b>${esc(sel.nome)}</b><span class="muted">${esc(sel.papel)}</span></div>${note?`<div class="lg-ok">${esc(note)}</div>`:''}
   <div class="fld"><label for="lg_pw">Senha</label><div class="lg-pw"><input id="lg_pw" type="password" autocomplete="current-password" autofocus>${eye('lg_pw')}</div></div><div id="lg_err" class="lg-err"></div>
   <label class="lg-keep"><input type="checkbox" id="lg_keep" ${keep?'checked':''}> Manter conectado neste aparelho</label>
   <button class="btn lg-go" id="lg_go">Entrar</button><div class="lg-links"><a href="#" id="lg_back">← Trocar de usuário</a><a href="#" id="lg_forgot">Esqueci minha senha</a></div>`;
  else if(step==='first')h=`<p class="lg-sub">Primeiro acesso</p><p class="muted lg-p">Crie o usuário <b>Administrador</b>. Ele cadastra os demais usuários e define o que cada um pode fazer.</p>
   <div class="fld"><label for="fs_n">Seu nome</label><input id="fs_n" type="text" autocomplete="name" value="${esc(user||'')}"></div>
   <div class="fld"><label for="fs_p1">Senha (mínimo 4 caracteres)</label><div class="lg-pw"><input id="fs_p1" type="password" autocomplete="new-password">${eye('fs_p1')}</div></div>
   <div class="fld"><label for="fs_p2">Repita a senha</label><input id="fs_p2" type="password" autocomplete="new-password"></div><div id="lg_err" class="lg-err"></div><button class="btn lg-go" id="fs_go">Criar administrador e entrar</button>`;
  else if(step==='nouser')h=`<p class="lg-sub">Acesso não liberado</p><p class="muted lg-p">Ainda não há usuários cadastrados neste aparelho. Peça ao <b>escritório</b> para cadastrar o seu usuário e senha e enviar a lista atualizada. Depois toque em <b>Tentar novamente</b>.</p><div id="lg_err" class="lg-err"></div><button class="btn lg-go" id="nu_go">Tentar novamente</button>`;
  else if(step==='rec')h=`<p class="lg-sub">✅ Administrador criado</p><p class="muted lg-p">Anote o <b>código de recuperação</b>. Ele é a única forma de redefinir a senha do administrador se você esquecer. Só aparece agora.</p><div class="lg-code">${recCode.slice(0,5)}-${recCode.slice(5)}</div><button class="btn lg-go" id="rc_go">Anotei, continuar</button>`;
  else if(step==='forgot'){h=`<div class="lg-who">${avatar(sel.nome,false,true)}<b>${esc(sel.nome)}</b></div>`+(sel.papel==='Administrador'?`<p class="muted lg-p">Digite o <b>código de recuperação</b> do administrador e defina uma nova senha.</p>
   <div class="fld"><label for="fg_c">Código de recuperação</label><input id="fg_c" type="text" autocomplete="off" style="text-transform:uppercase"></div><div class="fld"><label for="fg_p1">Nova senha</label><input id="fg_p1" type="password" autocomplete="new-password"></div><div class="fld"><label for="fg_p2">Repita a nova senha</label><input id="fg_p2" type="password" autocomplete="new-password"></div><div id="lg_err" class="lg-err"></div><button class="btn lg-go" id="fg_go">Redefinir senha</button>`
   :`<p class="lg-p">Peça ao <b>Administrador</b> para redefinir a sua senha em <i>Administração › Usuários e acessos › 🔑</i>.</p>`)+`<div class="lg-links"><a href="#" id="lg_back2">← Voltar</a></div>`}
  L.innerHTML=shell(h);bind()};
 const err=m=>{const e=L.querySelector('#lg_err');if(e){e.textContent=m;e.classList.remove('shake');void e.offsetWidth;e.classList.add('shake')}};
 const go=u=>{loginAs(u,keep);then&&then()};
 const bind=()=>{
  L.querySelectorAll('[data-eye]').forEach(b=>b.onclick=()=>{const i=L.querySelector('#'+b.dataset.eye);i.type=i.type==='password'?'text':'password'});
  L.querySelectorAll('[data-uid]').forEach(b=>b.onclick=()=>{sel=S.usuarios.find(u=>u.id===b.dataset.uid);note='';step='pw';draw()});
  const q=id=>L.querySelector(id);
  if(step==='pw'){const f=()=>{const now=Date.now();if(now<lockUntil)return err('Muitas tentativas. Aguarde '+Math.ceil((lockUntil-now)/1000)+' s.');
    keep=q('#lg_keep').checked;const pw=q('#lg_pw').value;if(sel.h&&hashPw(pw,sel.s)===sel.h){go(sel);return}
    fails++;if(fails>=5){fails=0;lockUntil=Date.now()+30000;err('Muitas tentativas. Aguarde 30 s.')}else err('Senha incorreta.');q('#lg_pw').select()};
   q('#lg_go').onclick=f;q('#lg_pw').onkeydown=e=>{if(e.key==='Enter')f()};setTimeout(()=>q('#lg_pw')?.focus(),40);
   q('#lg_back').onclick=e=>{e.preventDefault();step='pick';note='';draw()};q('#lg_forgot').onclick=e=>{e.preventDefault();step='forgot';draw()}}
  if(step==='first'){const f=()=>{const n=q('#fs_n').value.trim(),a=q('#fs_p1').value,b=q('#fs_p2').value;if(!n)return err('Digite seu nome.');if(a.length<4)return err('A senha precisa ter pelo menos 4 caracteres.');if(a!==b)return err('As senhas não conferem.');
    const salt=newSalt(),u={id:uid(),nome:n,papel:'Administrador',s:salt,h:hashPw(a,salt)};S.usuarios.push(u);recCode=newCode();S.cfg=S.cfg||{};S.cfg.rec={s:salt,h:hashPw(recCode,salt)};pendUser=u;user=n;logH('criou','usuario',u.id,'Criou o administrador '+n);save();step='rec';draw()};
   q('#fs_go').onclick=f;q('#fs_p2').onkeydown=e=>{if(e.key==='Enter')f()};setTimeout(()=>q('#fs_n')?.focus(),40)}
  if(step==='nouser')q('#nu_go').onclick=async()=>{q('#nu_go').disabled=true;q('#nu_go').textContent='Verificando…';await loadUserFile();if(S.usuarios.length){step='pick';draw()}else{q('#nu_go').disabled=false;q('#nu_go').textContent='Tentar novamente';err('Ainda não há usuários. Fale com o escritório.')}};
  if(step==='rec')q('#rc_go').onclick=()=>go(pendUser);
  if(step==='forgot'){const b=q('#lg_back2');if(b)b.onclick=e=>{e.preventDefault();step='pw';draw()};const g=q('#fg_go');
   if(g)g.onclick=()=>{const c=q('#fg_c').value.trim().toUpperCase().replace(/[\s-]/g,''),a=q('#fg_p1').value,b2=q('#fg_p2').value,r=S.cfg&&S.cfg.rec;
    if(!r||hashPw(c,r.s)!==r.h)return err('Código de recuperação incorreto.');if(a.length<4)return err('A senha precisa ter pelo menos 4 caracteres.');if(a!==b2)return err('As senhas não conferem.');
    const salt=newSalt();sel.s=salt;sel.h=hashPw(a,salt);S.cfg.rec={s:salt,h:hashPw(c,salt)};logH('editou','usuario',sel.id,'Redefiniu a senha de '+sel.nome+' (código de recuperação)');save();note='Senha redefinida. Entre com a nova senha.';step='pw';draw()}}};
 draw()}
/* conta do usuário */
ACT.user=()=>{if(!me)return;
 openModal(`<div class="acc">${avatar(me.nome,false,true)}<h3 style="margin:8px 0 2px">${esc(me.nome)}</h3><div class="muted">${esc(me.papel)}</div><p class="muted" style="font-size:13px">${esc(ROLE_HELP[me.papel]||'')}</p></div>
 <div class="acc-btns"><button class="btn sec" data-act="pwMine">🔑 Alterar minha senha</button><button class="btn sec" data-act="logoutAct">🔄 Trocar de usuário</button><button class="btn red" data-act="logoutAct">⎋ Sair</button></div><div class="mfoot"><button class="btn sec" data-act="closeModal">Fechar</button></div>`)};
ACT.logoutAct=()=>{closeModal();logout()};
ACT.pwMine=()=>{openModal(`<h3>🔑 Alterar minha senha</h3><div class="fld"><label for="pm_o">Senha atual</label><input id="pm_o" type="password" autocomplete="current-password"></div><div class="fld"><label for="pm_1">Nova senha</label><input id="pm_1" type="password" autocomplete="new-password"></div><div class="fld"><label for="pm_2">Repita a nova senha</label><input id="pm_2" type="password" autocomplete="new-password"></div><div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" id="pm_ok">Salvar</button></div>`);
 $('#pm_ok').onclick=()=>{const o=$('#pm_o').value,a=$('#pm_1').value,b=$('#pm_2').value;if(hashPw(o,me.s)!==me.h)return toast('Senha atual incorreta.');if(a.length<4)return toast('A senha precisa ter pelo menos 4 caracteres.');if(a!==b)return toast('As senhas não conferem.');
  me.s=newSalt();me.h=hashPw(a,me.s);logH('editou','usuario',me.id,'Alterou a própria senha');save();closeModal();toast('Senha alterada')}};
/* administração de usuários */
function adminUsr(){const l=S.usuarios.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));const st=n=>{const h=S.hist.filter(x=>x.user===n);return{n:h.filter(x=>x.acao==='conferiu').length,t:h.length?h[0].ts:''}};
 return `<div class="card"><div class="row" style="align-items:center"><h3 style="margin:0">Usuários e acessos</h3><button class="btn sm" data-act="usrAdd" style="flex:none">+ Novo usuário</button></div>
 <p class="muted">Cada pessoa entra com a <b>própria senha</b>. O nome dela fica registrado em cada conferência e alteração.</p>
 <div class="usr-tab"><b>📲 Usuários no tablet dos engenheiros</b><p class="muted" style="margin:4px 0 8px">Depois de cadastrar todos, clique em <b>Gerar arquivo para o tablet</b>. Envie o arquivo <b>usuarios.json</b> para o GitHub (na mesma pasta do site). Quando o engenheiro abrir o site, os usuários já estarão lá — ele só escolhe o nome e digita a senha. Se criar, apagar ou trocar a senha de alguém, gere e envie o arquivo de novo.</p><button class="btn sec sm" data-act="usrExport" style="flex:none">⬇ Gerar arquivo para o tablet (usuarios.json)</button></div>
 <div class="usr-roles">${ROLES.map(r=>`<div><b>${r}</b><span class="muted">${ROLE_HELP[r]}</span></div>`).join('')}</div>
 <div class="list">${l.map(u=>{const x=st(u.nome);return`<div class="li ${u.id===me.id?'sel':''}"><div class="usr-row">${avatar(u.nome)}<div class="grow"><b>${esc(u.nome)}</b> ${u.id===me.id?'<span class="usr-on">você</span>':''}<div class="muted">${esc(u.papel)} · ${x.n} conferência(s)${x.t?' · última atividade '+fdt(x.t):''}</div></div></div>
  <button class="btn sec sm" data-act="usrEd" data-id="${u.id}" title="Editar nome e função">✎</button><button class="btn sec sm" data-act="usrPw" data-id="${u.id}" title="Redefinir senha">🔑</button>${u.id===me.id?'':`<button class="btn red sm" data-act="usrDel" data-id="${u.id}" title="Remover">🗑</button>`}</div>`}).join('')}</div></div>`}
const admins=()=>S.usuarios.filter(u=>u.papel==='Administrador');
function userForm(id){const u=id?S.usuarios.find(x=>x.id===id):null;
 openModal(`<h3>${u?'Editar usuário':'Novo usuário'}</h3><div class="fld"><label for="uf_n">Nome</label><input id="uf_n" type="text" value="${esc(u?u.nome:'')}" autocomplete="off"></div>
 <div class="fld"><label for="uf_p">Função</label><select id="uf_p">${ROLES.map(r=>`<option ${(u?u.papel:'Engenheiro (campo)')===r?'selected':''}>${r}</option>`).join('')}</select><div class="muted" id="uf_h" style="margin-top:4px"></div></div>
 ${u?'':'<div class="fld"><label for="uf_1">Senha inicial (mínimo 4 caracteres)</label><input id="uf_1" type="text" autocomplete="off"></div><p class="muted" style="font-size:12px">Passe esta senha para a pessoa. Ela pode trocar depois em “Minha conta”.</p>'}
 <div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" id="uf_ok">${u?'Salvar':'Criar usuário'}</button></div>`);
 const hp=()=>{$('#uf_h').textContent=ROLE_HELP[$('#uf_p').value]||''};$('#uf_p').onchange=hp;hp();setTimeout(()=>$('#uf_n')?.focus(),30);
 $('#uf_ok').onclick=()=>{const n=$('#uf_n').value.trim(),p=$('#uf_p').value;if(!n)return toast('Digite o nome');
  if(S.usuarios.some(x=>x.id!==id&&x.nome.toLowerCase()===n.toLowerCase()))return toast('Já existe um usuário com esse nome');
  if(u){if(u.papel==='Administrador'&&p!=='Administrador'&&admins().length<2)return toast('É preciso manter pelo menos um administrador');u.nome=n;u.papel=p;if(u.id===me.id)user=n;logH('editou','usuario',u.id,'Editou o usuário '+n)}
  else{const a=$('#uf_1').value;if(a.length<4)return toast('A senha precisa ter pelo menos 4 caracteres');const salt=newSalt(),nu={id:uid(),nome:n,papel:p,s:salt,h:hashPw(a,salt)};S.usuarios.push(nu);logH('criou','usuario',nu.id,'Criou o usuário '+n+' ('+p+')')}
  save();closeModal();render()}}
ACT.usrExport=()=>{if(!isAdm())return toast('Somente o administrador');const us=S.usuarios.map(u=>({id:u.id,nome:u.nome,papel:u.papel,s:u.s,h:u.h,_u:u._u||''}));
 download('usuarios.json',JSON.stringify({v:1,gerado:new Date().toISOString(),usuarios:us},null,1),'application/json');toast('Arquivo gerado ('+us.length+' usuário(s)). Envie para o GitHub, na pasta do site.')};
ACT.usrAdd=()=>userForm();ACT.usrEd=b=>userForm(b.dataset.id);
ACT.usrPw=b=>{const u=S.usuarios.find(x=>x.id===b.dataset.id);if(!u)return;openModal(`<h3>🔑 Redefinir senha — ${esc(u.nome)}</h3><div class="fld"><label for="rp_1">Nova senha (mínimo 4 caracteres)</label><input id="rp_1" type="text" autocomplete="off"></div><p class="muted" style="font-size:12px">Passe a nova senha para a pessoa.</p><div class="mfoot"><button class="btn sec" data-act="closeModal">Cancelar</button><button class="btn" id="rp_ok">Redefinir</button></div>`);
 setTimeout(()=>$('#rp_1')?.focus(),30);$('#rp_ok').onclick=()=>{const a=$('#rp_1').value;if(a.length<4)return toast('A senha precisa ter pelo menos 4 caracteres');u.s=newSalt();u.h=hashPw(a,u.s);logH('editou','usuario',u.id,'Redefiniu a senha de '+u.nome);save();closeModal();toast('Senha de '+u.nome+' redefinida')}};
ACT.usrDel=b=>{const u=S.usuarios.find(x=>x.id===b.dataset.id);if(!u||u.id===me.id)return;if(u.papel==='Administrador'&&admins().length<2)return toast('É preciso manter pelo menos um administrador');
 if(!confirm(`Remover o usuário "${u.nome}"? O histórico dele continua registrado.`))return;S.usuarios=S.usuarios.filter(x=>x.id!==u.id);logH('excluiu','usuario',u.id,'Removeu o usuário '+u.nome);save();render()};

function viewAdmin(){
 const t=ui.atab;
 let h=`<div class="tabs">${[['cad','📋 Cadastro passo a passo'],['hist','🕘 Histórico'],['emp','🏢 Empresa e assinatura'],['chk','📝 Modelos de checklist'],...(isAdm()?[['usr','👥 Usuários e acessos']]:[]),['bkp','💾 Backup e equipe']].map(([k,l])=>`<button data-act="atab" data-k="${k}" class="${t===k?'on':''}">${l}</button>`).join('')}</div>`;
 h+=`<p class="adm-help muted">${({cad:'Prepare a obra seguindo as etapas abaixo, de cima para baixo.',hist:'Tudo o que foi criado, editado ou conferido, com data e responsável.',emp:'Dados que aparecem no cabeçalho e na assinatura do relatório.',chk:'Verificações e medições que o engenheiro preenche na conferência de cada tipo de equipamento.',usr:'Quem pode entrar no programa e o que cada pessoa pode fazer.',bkp:'Guarde cópias de segurança e sincronize com a equipe.'})[t]||''}</p>`;
 if(t==='cad')h+=adminCad();else if(t==='hist')h+=`<div class="card"><h3>Histórico de alterações</h3><div class="hist">${histHTML(S.hist.slice(0,400))}</div></div>`;else if(t==='emp')h+=adminEmp();else if(t==='chk')h+=adminChk();else if(t==='usr'&&isAdm())h+=adminUsr();else h+=adminBkp();
 $('#cfMain').innerHTML=h;renderKpi();bindImp();
}
ACT.atab=b=>{ui.atab=b.dataset.k;render()};
function adminCad(){
 const li=(arr,sel,sc,ed,del,extra)=>arr.map(x=>`<div class="li ${x.id===sel?'sel':''}"><div class="grow" data-act="${sc}" data-id="${x.id}"><b>${esc(x.nome)}</b>${extra?`<div class="muted">${extra(x)}</div>`:''}</div><button class="btn sec sm" data-act="${ed}" data-id="${x.id}" title="Renomear">✎</button><button class="btn red sm" data-act="${del}" data-id="${x.id}" title="Excluir">🗑</button></div>`).join('');
 const projs=S.projetos.filter(p=>p.obraId===ui.obraId),pls=S.plantas.filter(p=>p.projetoId===ui.projetoId),its=ui.projetoId?projItens(ui.projetoId):[];
 const pos=its.filter(i=>marcaDe(i.id)).length,hasO=!!(ui.obraId&&obra(ui.obraId)),hasP=!!(ui.projetoId&&proj(ui.projetoId)),hasPl=pls.length>0,hasIt=its.length>0;
 const done=[hasO,hasP,hasPl,hasIt,hasIt&&pos===its.length],cur=done.indexOf(false),lock=[false,!hasO,!hasP,!hasP,!(hasPl&&hasIt)];
 const st=n=>done[n]?'ok':(n===cur?'cur':(lock[n]?'lock':'todo'));
 const step=(n,title,help,body,state)=>`<section class="stp ${state}"><div class="stp-n">${state==='ok'?'✓':n+1}</div><div class="stp-b"><h3>${title}${state==='cur'?' <span class="stp-tag">você está aqui</span>':''}</h3><p class="muted">${help}</p>${state==='lock'?'<div class="stp-lock">🔒 Conclua a etapa anterior para liberar.</div>':body}</div></section>`;
 const pct=Math.round(done.filter(Boolean).length/5*100);
 const nextTxt=['Crie a obra (o prédio ou cliente).','Crie o projeto desta obra (ex.: Climatização).','Envie a planta do projeto.','Cadastre os equipamentos do projeto.','Posicione cada equipamento na planta.','Tudo pronto: leve o tablet para o campo!'][cur<0?5:cur];
 return `<div class="stp-head"><div><b>${cur<0?'✅ Cadastro completo':'Próximo passo'}</b><div class="muted">${esc(nextTxt)}</div></div><div class="stp-prog"><div class="stp-bar"><span style="width:${pct}%"></span></div><span class="muted">${done.filter(Boolean).length} de 5 etapas</span></div></div>
 ${step(0,'Obra','A <b>obra</b> é o empreendimento ou cliente (ex.: “Hospital Aeroporto”). Escolha uma da lista ou crie uma nova.',
  `<div class="list">${li(S.obras,ui.obraId,'selO','edObra','delObra',o=>S.projetos.filter(p=>p.obraId===o.id).length+' projeto(s)')||'<div class="muted">Nenhuma obra ainda.</div>'}</div><div class="stp-act"><button class="btn" data-act="addObra">+ Nova obra</button></div>`,st(0))}
 ${step(1,'Projeto','O <b>projeto</b> é a disciplina dentro da obra (ex.: “Climatização”). É nele que ficam os equipamentos e as plantas.',
  `<div class="list">${li(projs,ui.projetoId,'selP','edProj','delProj',p=>projItens(p.id).length+' item(ns)')||'<div class="muted">Nenhum projeto nesta obra.</div>'}</div><div class="stp-act"><button class="btn" data-act="addProj">+ Novo projeto</button></div>`,st(1))}
 ${step(2,'Planta','A <b>planta</b> é o desenho onde os equipamentos aparecem. Aceita <b>DXF</b> (recomendado: reconhece ambientes e equipamentos), PDF ou imagem. Envie uma por pavimento.',
  `<div class="list">${pls.map(p=>`<div class="li"><div class="grow" data-act="posPl" data-id="${p.id}"><b>${esc(p.nome)}</b><div class="muted">${esc(p.pav||'Sem pavimento')} · ${p.tipo.toUpperCase()} · ${S.marcas.filter(m=>m.plantaId===p.id).length} ponto(s) marcado(s)</div></div><button class="btn sec sm" data-act="revPl" data-id="${p.id}" title="Enviar nova revisão da planta mantendo os pontos">⟳ Revisão</button>${(p.revs||[]).length?`<button class="btn sec sm" data-act="revList" data-id="${p.id}" title="Revisões anteriores">🕘 ${esc(p.rev||'')}</button>`:''}<button class="btn sec sm" data-act="edPl" data-id="${p.id}" title="Editar">✎</button><button class="btn red sm" data-act="delPl" data-id="${p.id}" title="Excluir">🗑</button></div>`).join('')||'<div class="muted">Nenhuma planta enviada.</div>'}</div><div class="stp-act"><button class="btn" data-act="addPl">+ Enviar planta</button></div>`,st(2))}
 ${step(3,'Equipamentos','Cadastre o que o projeto prevê: difusores, grelhas, dampers, fancoils, bombas… Você pode <b>puxar automático do desenho DXF</b>, importar uma planilha Excel ou digitar um por um.',
  `<div class="stp-stat"><b>${its.length}</b> equipamento(s) cadastrado(s)</div><div class="stp-act">${pls.some(p=>p.tipo==='dxf')?'<button class="btn" data-act="cadItens">➕ Puxar do desenho (automático)</button>':''}<button class="btn sec" data-act="nav" data-v="itens">📋 Ver lista / importar Excel / cadastrar um</button></div>`,st(3))}
 ${step(4,'Pontos na planta','Marque na planta onde cada equipamento está. Se você usou “Puxar do desenho”, <b>os pontos já foram colocados sozinhos</b>. Equipamentos que faltarem: abra a planta e use o botão “➕ Equipamento não identificado”.',
  `<div class="stp-stat"><b>${pos}</b> de ${its.length} equipamento(s) com ponto</div><div class="stp-act">${pls.map(p=>`<button class="btn sec" data-act="posPl" data-id="${p.id}">📍 Abrir ${esc(p.nome)}</button>`).join('')}</div>`,st(4))}
 <section class="stp info"><div class="stp-n">🚀</div><div class="stp-b"><h3>Levar para o campo</h3><p class="muted">Com tudo cadastrado, o engenheiro abre o programa em <b>Campo</b> (tablet ou computador), toca no equipamento e compara o projeto com o que está instalado. Antes de sair, faça um backup na aba <b>💾 Backup e equipe</b>.</p></div></section>`}
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

/* ===== CÓPIAS AUTOMÁTICAS (a cada 30 min de uso + antes de importar/restaurar/apagar) ===== */
const SNAP_KEEP=24;
async function snapNow(reason){try{if(!S.obras.length)return;const now=new Date(),meta={ts:now.toISOString(),reason:reason||'automática',obras:S.obras.length,itens:S.itens.length,conf:Object.keys(S.conf).length};
 const id='snap_'+now.toISOString().replace(/[-:T]/g,'').slice(0,14)+String(now.getMilliseconds()).padStart(3,'0');
 await blobSet(id,new Blob([JSON.stringify({meta,state:S})],{type:'application/json'}));localStorage.setItem('orcehvac.conf.lastSnap',String(Date.now()));
 const ids=(await blobIds()).map(String).filter(x=>x.startsWith('snap_')).sort();for(const o of ids.slice(0,Math.max(0,ids.length-SNAP_KEEP)))await blobDel(o)}catch(e){console.warn('snap',e)}}
function snapMaybe(){const l=+localStorage.getItem('orcehvac.conf.lastSnap')||0;if(Date.now()-l>=30*60e3)snapNow('automática')}
async function snapList(){const out=[];for(const id of (await blobIds()).map(String).filter(x=>x.startsWith('snap_')).sort().reverse()){try{const b=await blobGet(id);if(!b)continue;const j=JSON.parse(await b.text());out.push({id,meta:j.meta})}catch(e){}}return out}
ACT.snapView=async()=>{const l=await snapList();
 openModal(`<h3>🕘 Cópias automáticas</h3><p class="muted">O programa guarda sozinho cópias do cadastro (a cada 30 minutos de uso e antes de importar, restaurar ou apagar). Se algo foi apagado ou importado errado, volte a uma delas. As cópias ficam neste aparelho; faça também o backup em arquivo.</p>
 <div style="max-height:55vh;overflow:auto">${l.map(x=>`<div class="si"><span><b>${fdt(x.meta.ts)}</b> <span class="muted">· ${esc(x.meta.reason)}</span><br><span class="muted">${x.meta.obras} obra(s) · ${x.meta.itens} item(ns) · ${x.meta.conf} conferência(s)</span></span><button class="btn sm sec" data-act="snapRest" data-id="${x.id}">Restaurar</button></div>`).join('')||'<div class="muted">Ainda não há cópias. A primeira é criada depois de alguns minutos de uso.</div>'}</div>
 <div class="mfoot"><button class="btn sec" data-act="snapNowBtn">Criar cópia agora</button><button class="btn" data-act="closeModal">Fechar</button></div>`)};
ACT.snapNowBtn=async()=>{await snapNow('manual');toast('Cópia criada');ACT.snapView()};
ACT.snapRest=async b=>{if(!confirm('Voltar o cadastro para esta cópia? O estado atual é guardado antes, então dá para desfazer.'))return;
 const blob=await blobGet(b.dataset.id);if(!blob)return toast('Cópia não encontrada');const j=JSON.parse(await blob.text());await snapNow('antes de restaurar');
 const keepU=S.usuarios,keepR=S.cfg&&S.cfg.rec;S={...S,...j.state};S.usuarios=keepU;S.cfg=S.cfg||{};if(keepR)S.cfg.rec=keepR;S.del=S.del||{};Object.keys(docCache).forEach(k=>delete docCache[k]);resetSigs();await kvSet('state',S);closeModal();ui.obraId=ui.projetoId=ui.plantaId='';ui.view='home';render();toast('Cadastro restaurado da cópia de '+fdt(j.meta.ts))};
function adminBkp(){
 const dk=!!desk(),lb=localStorage.getItem('orcehvac.conf.lastBkp'),ls=localStorage.getItem('orcehvac.conf.lastSync');
 return (dk?`<div class="card"><h3>Backup completo (dados, plantas e fotos)</h3><p>Copia tudo para uma pasta de sua escolha (pendrive, OneDrive, rede). Último backup: <b>${lb?fdt(lb):'nunca feito'}</b>.</p><div class="row"><button class="btn" data-act="bkpFolder" style="flex:none">💾 Fazer backup completo</button><button class="btn sec" data-act="restFolder" style="flex:none">Restaurar de um backup…</button></div></div>
 <div class="card"><h3>Equipe: sincronizar por pasta compartilhada</h3><p>Escolha uma pasta que todos acessam (OneDrive, Google Drive, rede). Cada computador grava ali o próprio estado e junta o dos outros automaticamente — conferências, fotos, plantas e pontos. Se duas pessoas editarem o mesmo item, vale a alteração mais recente.</p>${syncOn?`<p>Sincronização <b>ativa</b>${ls?' · última: '+fdt(ls):''}.</p><div class="row"><button class="btn" data-act="syncNow" style="flex:none">🔄 Sincronizar agora</button><button class="btn sec" data-act="syncPick" style="flex:none">Trocar pasta</button><button class="btn red" data-act="syncOff" style="flex:none">Desligar</button></div>`:`<div class="row"><button class="btn" data-act="syncPick" style="flex:none">📁 Escolher pasta compartilhada</button></div>`}</div>`:'')+`<div class="card"><h3>Como levar o projeto do escritório para o engenheiro</h3>
 <p>Os dados ficam salvos neste navegador/aparelho. Para enviar um projeto ao engenheiro: <b>exporte a obra</b> (arquivo .json com plantas, equipamentos, pontos e fotos) e envie por WhatsApp, e-mail ou pendrive. O engenheiro <b>importa</b> o arquivo no aparelho dele. Depois da conferência, o engenheiro exporta de volta e o escritório importa para ver as conferências — nada é sobrescrito: itens e conferências são mesclados pelo identificador.</p>
 <div class="row"><div><label>Obra para exportar</label><select id="expObra">${S.obras.map(o=>`<option value="${o.id}" ${o.id===ui.obraId?'selected':''}>${esc(o.nome)}</option>`).join('')}</select></div>
 <button class="btn" data-act="expObra" style="flex:none">⬇ Exportar obra</button>
 <button class="btn sec" data-act="impPkg" style="flex:none">⬆ Importar arquivo</button><input type="file" id="impF" accept=".json,application/json" style="display:none"></div></div>
 <div class="card"><h3>Backup completo</h3><div class="row"><button class="btn sec" data-act="expAll" style="flex:none">⬇ Backup de tudo (arquivo)</button><button class="btn sec" data-act="snapView" style="flex:none">🕘 Cópias automáticas</button><button class="btn red" data-act="wipe" style="flex:none">Apagar todos os dados</button></div>
 <p class="muted">Recomendação: faça backup periodicamente. Os dados ficam na pasta de dados do OrceHVAC (subpasta conferencia); inclua-a nas cópias de segurança do computador.</p><p class="muted">Versão do aplicativo: ${APP_VERSION}</p></div>`}
async function packObras(obraIds){
 const projetos=S.projetos.filter(p=>obraIds.includes(p.obraId)),pids=projetos.map(p=>p.id);
 const plantas=S.plantas.filter(p=>pids.includes(p.projetoId)),itens=S.itens.filter(i=>pids.includes(i.projetoId)),iids=new Set(itens.map(i=>i.id));
 const marcas=S.marcas.filter(m=>iids.has(m.itemId)),conf={};iids.forEach(i=>{if(S.conf[i])conf[i]=S.conf[i]});
 const bl={};for(const id of [...plantas.flatMap(p=>[p.blobId,...(p.revs||[]).map(r=>r.blobId)]),...itens.flatMap(i=>(i.docs||[]).map(d=>d.blobId)),...Object.values(conf).flatMap(c=>c.fotos)]){const b=await blobGet(id);if(b)bl[id]=await blobToDataURL(b)}
 return {formato:'conferencia-hvac',versao:1,exportado:new Date().toISOString(),obras:S.obras.filter(o=>obraIds.includes(o.id)),projetos,plantas,itens,marcas,conf,pend:(S.pend||[]).filter(x=>iids.has(x.itemId)),aceites:(S.aceites||[]).filter(a=>pids.includes(a.projetoId)),modelos:S.modelos||[],blobs:bl,hist:S.hist.filter(h=>iids.has(h.ref)||pids.includes(h.ref)||obraIds.includes(h.ref))}}
ACT.expObra=async()=>{const id=$('#expObra').value;if(!id)return toast('Cadastre uma obra primeiro');toast('Gerando arquivo…');const p=await packObras([id]);download(`obra_${normT(obra(id).nome)||'obra'}.json`,JSON.stringify(p),'application/json')};
ACT.expAll=async()=>{toast('Gerando backup…');const p=await packObras(S.obras.map(o=>o.id));p.usuarios=S.usuarios;download('backup_conferencia_hvac_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(p),'application/json');localStorage.setItem('orcehvac.conf.lastBkp',new Date().toISOString());render()};
ACT.impPkg=()=>$('#impF').click();
function bindImp(){const f=$('#impF');if(!f)return;f.onchange=async()=>{const file=f.files[0];if(!file)return;try{await importPkg(JSON.parse(await file.text()));render();toast('Arquivo importado')}catch(e){toast('Arquivo inválido: '+e.message)}f.value=''}}
async function importPkg(p){
 if(p.formato!=='conferencia-hvac')throw new Error('não é um arquivo do sistema');
 await snapNow('antes de importar arquivo');
 if(p.usuarios&&!S.usuarios.length)S.usuarios=p.usuarios;
 const up=(arr,x)=>{const i=arr.findIndex(y=>y.id===x.id);i>=0?arr[i]=x:arr.push(x)};
 for(const [id,u] of Object.entries(p.blobs||{})){await blobSet(id,await dataURLToBlob(u));urlCache.delete(id)}
 p.obras.forEach(x=>up(S.obras,x));p.projetos.forEach(x=>up(S.projetos,x));p.plantas.forEach(x=>{up(S.plantas,x);delete docCache[x.id]});p.itens.forEach(x=>up(S.itens,x));
 p.marcas.forEach(x=>up(S.marcas,x));(p.pend||[]).forEach(x=>up(S.pend=S.pend||[],x));(p.aceites||[]).forEach(x=>up(S.aceites=S.aceites||[],x));(p.modelos||[]).forEach(x=>up(S.modelos=S.modelos||[],x));
 // marcas removidas no escritório: remover marcas locais de itens importados que não vieram no pacote
 const imp=new Set(p.itens.map(i=>i.id)),keep=new Set(p.marcas.map(m=>m.id));S.marcas=S.marcas.filter(m=>!imp.has(m.itemId)||keep.has(m.id));
 for(const [id,c] of Object.entries(p.conf||{})){const l=S.conf[id];if(!l||(c.data||'')>=(l.data||''))S.conf[id]=c}
 (p.hist||[]).forEach(h=>{if(!S.hist.some(x=>x.id===h.id))S.hist.push(h)});S.hist.sort((a,b)=>b.ts.localeCompare(a.ts));
 save();if(!ui.obraId&&S.obras[0])ui.obraId='';}
ACT.wipe=async()=>{if(!confirm('Apagar TODOS os dados deste aparelho? Faça backup antes.')||!confirm('Tem certeza? Esta ação não pode ser desfeita.'))return;
 await snapNow('antes de apagar tudo');for(const k of await blobIds())if(!String(k).startsWith('snap_'))await blobDel(k);S={obras:[],projetos:[],plantas:[],itens:[],marcas:[],usuarios:S.usuarios||[],pend:[],aceites:[],modelos:[],conf:{},hist:[],cfg:{rec:S.cfg&&S.cfg.rec},del:{}};resetSigs();ui.obraId=ui.projetoId=ui.plantaId='';await kvSet('state',S);render();toast('Dados apagados')};

/* ---------- Montagem no OrceHVAC ---------- */
let loaded=false,pendingItem=null;
async function loadUserFile(){if(desk()||!/^https?:/.test(location.protocol))return;
 try{const r=await fetch('usuarios.json?'+Date.now(),{cache:'no-store'});if(!r.ok)return;const j=await r.json();if(!j||!Array.isArray(j.usuarios))return;
  const ids=new Set(j.usuarios.map(u=>u.id));let ch=0;
  for(const u of j.usuarios){if(!u.id||!u.nome||!u.h||!u.s)continue;const i=S.usuarios.findIndex(x=>x.id===u.id),n={...u,arq:true};
   if(i<0){S.usuarios.push(n);ch++}else if(S.usuarios[i].arq&&JSON.stringify(S.usuarios[i])!==JSON.stringify(n)){S.usuarios[i]=n;ch++}}
  const n0=S.usuarios.length;S.usuarios=S.usuarios.filter(u=>!u.arq||ids.has(u.id));ch+=n0-S.usuarios.length;
  if(ch){resetSigs();await kvSet('state',S)}}catch{}}
async function ensureLoaded(){if(loaded)return true;try{const saved=await kvGet();if(saved)S={...S,...saved};S.cfg=S.cfg||{};S.del=S.del||{};S.usuarios=S.usuarios||[];resetSigs();loaded=true;await loadUserFile();await loadModelFile();initSync();return true}catch(e){toast('Não foi possível ler os dados do comissionamento: '+e.message);return false}}
function mount(){
 const c=document.getElementById('content');root=document.createElement('div');root.className='cf';
 root.innerHTML='<section class="heading" id="cfHead"></section><nav class="module-tabs" id="cfNav"></nav><div id="cfKpi"></div><div id="cfMain"></div><div id="cfModal"></div>';
 c.replaceChildren(root);bindRoot();
}
async function start(){
 if(!await ensureLoaded())return;
 if(!gate(start))return;
 mount();render();
 if(pendingItem){const id=pendingItem;pendingItem=null;if(item(id))openConf(id)}
}
/* ---------- Visão geral (painel do comissionamento) ---------- */
function bkpWarn(){if(!S.obras.length)return '';const lb=localStorage.getItem('orcehvac.conf.lastBkp');const days=lb?(Date.now()-new Date(lb))/864e5:999;if(days<7||syncOn)return '';return `<div class="panel" style="margin-bottom:16px;border-left:4px solid #dc2626;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span><b>Faça um backup.</b> ${lb?'O último foi há '+Math.floor(days)+' dia(s).':'Nenhum backup em arquivo foi feito ainda.'} Guarde o arquivo no WhatsApp, e-mail ou pendrive.</span><button class="btn sm" data-ov="${desk()?'bkp':'bkpdl'}" style="margin-left:auto">${desk()?'Abrir backup':'⬇ Baixar backup agora'}</button></div>`}
async function overview(){
 if(!await ensureLoaded())return;
 if(!gate(overview))return;
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
  else if(a==='bkp'){askOffice(()=>{ui.atab='bkp';mode='escritorio';localStorage.setItem('orcehvac.conf.modo',mode);openWork({view:'admin'})})}else if(a==='bkpdl')ACT.expAll();else if(a==='report')openWork({view:'report'});else if(a==='admin'){askOffice(()=>{mode='escritorio';localStorage.setItem('orcehvac.conf.modo',mode);openWork({view:'admin'})})}});
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

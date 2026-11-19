// Cadastros editáveis e agrupamento cliente > local > obra.
if(!Array.isArray(store.sites))store.sites=[];
labels.cadastros='Clientes e Colaboradores';
registryButton.innerHTML='<span class="ico">♙</span>Clientes e Colaboradores';
let editingRegistration=null;
$('registerRoleField').insertAdjacentHTML('afterend',`<div class="field full" id="registerCityField" hidden><label for="registerCity">Cidade/estado do cliente</label><input id="registerCity" list="clientCityOptions" maxlength="140" placeholder="Ex.: São Paulo/SP"><datalist id="clientCityOptions"></datalist><small>Usada abaixo do nome do cliente na proposta. A cidade da obra é informada no orçamento.</small></div>`);
$('registerCity').oninput=()=>{const q=norm($('registerCity').value);$('clientCityOptions').innerHTML=(globalThis.ORCE_CITIES||[]).filter(c=>norm(c).includes(q)).slice(0,60).map(c=>`<option value="${esc(c)}"></option>`).join('');};
$('newClientCity').oninput=()=>{const q=norm($('newClientCity').value);$('clientCityOptions').innerHTML=(globalThis.ORCE_CITIES||[]).filter(c=>norm(c).includes(q)).slice(0,60).map(c=>`<option value="${esc(c)}"></option>`).join('');};
const originalOpenRegister=openRegister;
openRegister=function(type,clientId,entityId){
 editingRegistration=entityId??null;
 if(type==='site'){
  registerType=type;registerClient=clientId;$('registerForm').reset();$('registerRoleField').hidden=true;$('registerError').textContent='';$('registerTitle').textContent=entityId?'Editar subpasta':'Nova subpasta';$('registerLabel').textContent='Nome do local / empreendimento';$('registerDialog').showModal();
 }else{originalOpenRegister(type,clientId);if(entityId!==undefined)$('registerTitle').textContent={client:'Editar cliente',employee:'Editar colaborador',payment:'Editar forma de pagamento',contact:'Editar contato'}[type];}
 $('registerCityField').hidden=type!=='client';$('registerCity').value=type==='client'?(store.clients.find(c=>c.id===entityId)?.city||''):'';
 if(entityId!==undefined){const entity=type==='contact'?{name:entityId}:store[{client:'clients',employee:'employees',payment:'payments',site:'sites'}[type]].find(e=>e.id===entityId);if(entity){$('registerName').value=entity.name;if(type==='employee')$('registerRole').value=entity.role||'';}}
};
$('registerForm').onsubmit=event=>{
 event.preventDefault();const name=$('registerName').value.trim();const fail=message=>$('registerError').textContent=message;
 if(!name)return fail('Informe um nome válido.');
 const next=structuredClone(store);let entity;
 if(registerType==='contact'){
  const client=next.clients.find(c=>c.id===registerClient);if(!client)return fail('Cliente não encontrado.');
  if(client.contacts.some(n=>norm(n)===norm(name)&&n!==editingRegistration))return fail('Este contato já está cadastrado.');
  if(editingRegistration!==null){const index=client.contacts.indexOf(editingRegistration);if(index<0)return fail('Contato não encontrado.');client.contacts[index]=name;next.budgets.filter(b=>b.clientId===client.id&&b.contact===editingRegistration).forEach(b=>b.contact=name);}else client.contacts.push(name);
 }else{
  const list=next[{client:'clients',employee:'employees',payment:'payments',site:'sites'}[registerType]];
  if(registerType==='site'&&!next.clients.some(c=>c.id===registerClient))return fail('Cliente não encontrado.');
  if(list.some(e=>e.id!==editingRegistration&&norm(e.name)===norm(name)&&(registerType!=='site'||e.clientId===registerClient)))return fail('Já existe um cadastro com esse nome.');
  entity=editingRegistration===null?{id:uid()}:list.find(e=>e.id===editingRegistration);if(!entity)return fail('Cadastro não encontrado.');
  if(registerType==='client'){const value=$('registerCity').value.trim();const city=(globalThis.ORCE_CITIES||[]).find(c=>norm(c)===norm(value));if(value&&!city)return fail('Selecione uma cidade/estado da lista do IBGE.');entity.city=city||'';}
  entity.name=name;if(registerType==='client'&&!entity.contacts)entity.contacts=[];if(registerType==='employee')entity.role=$('registerRole').value.trim();if(registerType==='site')entity.clientId=registerClient;
  if(editingRegistration===null)list.push(entity);
  if(registerType==='employee')next.budgets.filter(b=>b.employeeId===entity.id).forEach(b=>b.employeeName=name);
  if(registerType==='payment')next.budgets.filter(b=>b.paymentId===entity.id).forEach(b=>b.paymentName=name);
 }
 if(!commit(next))return fail('Não foi possível salvar no navegador. Os campos continuam preenchidos.');
 $('registerDialog').close();
 if(budgetDialog.open){refreshSelects();if(registerType==='employee')$('employeeSelect').value=entity.id;}
 else if(registerType==='site')filterBudgets();else renderRegistries();
 toast(editingRegistration===null?'Cadastro salvo.':'Cadastro atualizado. Os vínculos dos orçamentos foram preservados.');
};
function editButton(type,id,clientId){return `<button class="small-link" data-edit-registration="${type}" data-entity-id="${esc(id)}" ${clientId?`data-registration-client="${esc(clientId)}"`:''}>Editar</button>${trashButton(`data-delete-registration="${type}" data-entity-id="${esc(id)}" data-registration-client="${esc(clientId)}"`,"Excluir cadastro")}`;}
renderRegistries=function(){
 $('content').innerHTML=`<section class="heading"><div><div class="eyebrow">Cadastros</div><h1>Clientes e Colaboradores</h1><p>Inclua e edite clientes, contatos, colaboradores e formas de pagamento.</p></div></section><div class="registry-grid"><section class="panel"><h2>Clientes e contatos</h2><button class="btn" data-register="client">＋ Novo cliente</button><ul class="registry-list">${store.clients.map(c=>`<li><div class="registration-row"><strong>${esc(c.name)}</strong>${editButton('client',c.id)}</div><small>${esc(c.city||'Cidade/UF não informada')}</small><ul class="contact-list">${c.contacts.map(n=>`<li class="registration-row"><span>${esc(n)}</span>${editButton('contact',n,c.id)}</li>`).join('')}</ul>${!c.contacts.length?'<small>Nenhum contato cadastrado</small>':''}<button class="text-action" data-register="contact" data-for-client="${esc(c.id)}">＋ Adicionar contato</button></li>`).join('')}</ul></section><section class="panel"><h2>Colaboradores</h2><button class="btn" data-register="employee">＋ Novo colaborador</button><ul class="registry-list">${store.employees.map(e=>`<li class="registration-row"><div><strong>${esc(e.name)}</strong><small>${esc(e.role||'Cargo não informado')}</small></div>${editButton('employee',e.id)}</li>`).join('')}</ul>${store.employees.length?'':'<p class="registry-empty">Nenhum colaborador cadastrado.</p>'}</section><section class="panel"><h2>Formas de pagamento</h2><button class="btn" data-register="payment">＋ Nova forma</button><ul class="registry-list">${store.payments.map(p=>`<li class="registration-row"><span>${esc(p.name)}</span>${editButton('payment',p.id)}</li>`).join('')}</ul></section></div>`;
};
$('workName').closest('.field').insertAdjacentHTML('beforebegin',`<div class="field"><label for="siteSelect">Local / empreendimento (subpasta)</label><select id="siteSelect"></select><input id="newSite" maxlength="180" placeholder="Ex.: Hospital Aeroporto" aria-label="Nome da nova subpasta" hidden><small>Agrupe várias obras no mesmo local. O agrupamento é opcional.</small></div>`);
function refreshSites(selected=''){
 const clientId=$('clientSelect').value;
 $('siteSelect').innerHTML=options(store.sites.filter(s=>s.clientId===clientId),'Sem subpasta','Criar nova subpasta');$('siteSelect').value=selected;$('newSite').hidden=selected!=='__new';$('newSite').required=selected==='__new';
}
const openBudgetBeforeSites=openBudget;
openBudget=function(id){openBudgetBeforeSites(id);$('newSite').value='';refreshSites(store.budgets.find(b=>b.id===id)?.siteId||'');};
$('clientSelect').addEventListener('change',()=>refreshSites());
$('siteSelect').onchange=()=>{const yes=$('siteSelect').value==='__new';$('newSite').hidden=!yes;$('newSite').required=yes;};
function resolveBudgetSite(next,clientId){
 const value=$('siteSelect').value;
 if(value==='__new'){const name=$('newSite').value.trim();let site=next.sites.find(s=>s.clientId===clientId&&norm(s.name)===norm(name));if(!site){site={id:uid(),clientId,name};next.sites.push(site);}return site.id;}
 return next.sites.find(s=>s.clientId===clientId&&s.id===value)?.id||null;
}
const saveBudgetBeforeSites=$('budgetForm').onsubmit;
$('budgetForm').onsubmit=event=>{if($('clientSelect').value==='__new'&&$('newClientCity').value.trim()){const value=$('newClientCity').value;const city=(globalThis.ORCE_CITIES||[]).find(c=>norm(c)===norm(value));if(!city){event.preventDefault();$('budgetError').textContent='Selecione a cidade do cliente na lista do IBGE.';return;}$('newClientCity').value=city;}if($('siteSelect').value==='__new'&&!$('newSite').value.trim()){event.preventDefault();$('budgetError').textContent='Informe o nome da nova subpasta.';$('newSite').focus();return;}saveBudgetBeforeSites(event);};
function budgetRow(b){return `<div class="budget-row"><div><div class="budget-name">${esc(b.name)}</div><div class="budget-meta">${esc(b.id)} · ${esc(b.city)}${b.demo?' · Demonstração':''}</div></div><span class="tag ${b.status==='Finalizado'?'':'draft'}">${esc(b.status)}</span><div class="budget-value">${b.demo?money(b.value):'A calcular'}</div><button class="btn" data-open-budget="${esc(b.id)}">Abrir →</button>${trashButton(`data-delete-registration="budget" data-entity-id="${esc(b.id)}"`,"Excluir orçamento")}</div>`;}
filterBudgets=function(){
 const q=norm($('budgetSearch').value),status=$('budgetStatus').value;
 const open=new Set([...document.querySelectorAll('.client-toggle[aria-expanded=true]')].map(b=>b.dataset.client));
 const matches=(b,c,s)=> (status==='todos'||b.status===status)&&norm(c.name+' '+(s?.name||'')+' '+b.name+' '+b.id+' '+b.city).includes(q);
 $('folderList').innerHTML=store.clients.map((c,index)=>{
  const sites=store.sites.filter(s=>s.clientId===c.id);const budgets=store.budgets.filter(b=>b.clientId===c.id);
  const loose=budgets.filter(b=>!sites.some(s=>s.id===b.siteId)&&matches(b,c));
  const visibleSites=sites.filter(s=>budgets.some(b=>b.siteId===s.id&&matches(b,c,s))||(status==='todos'&&norm(c.name+' '+s.name).includes(q)));
  if(!loose.length&&!visibleSites.length&&!(status==='todos'&&norm(c.name).includes(q)))return '';
  const clientOpen=open.has(c.id),bodyId=`works-${index}`;
  return `<section class="folder"><button class="folder-head client-toggle" data-client="${esc(c.id)}" aria-expanded="${clientOpen}" aria-controls="${bodyId}"><strong>${esc(c.name)}</strong><span class="chevron">›</span></button><div class="folder-body" id="${bodyId}" ${clientOpen?'':'hidden'}><div class="folder-tools"><button class="text-action" data-register="site" data-for-client="${esc(c.id)}">＋ Nova subpasta / local</button></div>${visibleSites.map((s,i)=>{const key='site-'+s.id,siteOpen=open.has(key);const rows=budgets.filter(b=>b.siteId===s.id&&matches(b,c,s));return `<section class="site-folder"><div class="site-heading"><button class="client-toggle" data-client="${esc(key)}" aria-expanded="${siteOpen}" aria-controls="site-${index}-${i}"><strong>▰ ${esc(s.name)}</strong><span class="chevron">›</span></button>${editButton('site',s.id,c.id)}</div><div class="site-body" id="site-${index}-${i}" ${siteOpen?'':'hidden'}>${rows.map(budgetRow).join('')||'<p class="empty">Nenhuma obra nesta subpasta.</p>'}<button class="text-action add-in-site" data-new-at-site="${esc(s.id)}">＋ Nova obra neste local</button></div></section>`;}).join('')}${loose.length?`${sites.length?'<p class="ungrouped-title">Obras sem subpasta</p>':''}${loose.map(budgetRow).join('')}`:!visibleSites.length?'<p class="empty">Nenhuma obra cadastrada.</p>':''}</div></section>`;
 }).join('')||'<div class="panel empty">Nenhum cliente ou orçamento encontrado.</div>';
};
const renderBudgetsBeforeSites=renderBudgets;
renderBudgets=function(){renderBudgetsBeforeSites();document.querySelector('.heading p').textContent='Selecione o cliente, o local e a obra. Use subpastas para agrupar obras do mesmo empreendimento.';};
const detailBeforeSites=renderBudgetDetail;
renderBudgetDetail=function(id,tab='resumo'){detailBeforeSites(id,tab);const b=store.budgets.find(b=>b.id===id);const site=store.sites.find(s=>s.id===b?.siteId);if(tab==='resumo'&&b){const edit=$('content').querySelector('.heading [data-edit-budget]');
 const actions=document.createElement('div');actions.className='row-actions';
 edit.replaceWith(actions);actions.append(edit);
 actions.insertAdjacentHTML('beforeend',trashButton(`data-delete-registration="budget" data-entity-id="${esc(b.id)}"`,'Excluir orçamento'));renderBudgetTasks(b);$('content').querySelector('.summary-grid').insertAdjacentHTML('afterbegin',`<div><dt>Local / empreendimento</dt><dd>${esc(site?.name||'Sem subpasta')}</dd></div>`);}};
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.editRegistration)openRegister(button.dataset.editRegistration,button.dataset.registrationClient,button.dataset.entityId);if(button.dataset.newAtSite){const site=store.sites.find(s=>s.id===button.dataset.newAtSite);if(site){openBudget();$('clientSelect').value=site.clientId;updateClient();refreshSites(site.id);}}});
function deleteRegistration(button){
 const {deleteRegistration:type,entityId:id,registrationClient:clientId}=button.dataset;
 const collections={client:'clients',site:'sites',employee:'employees',payment:'payments',budget:'budgets'};
 const next=structuredClone(store),collection=collections[type];
 const client=next.clients.find(c=>c.id===clientId);
 const record=type==='contact'?(client?.contacts.includes(id)?{name:id}:null):next[collection].find(r=>r.id===id);
 if(!record)return;
 const linkedBudgets=type==='client'?next.budgets.filter(b=>b.clientId===id).length:0;
 const details={
  client:linkedBudgets?` Também serão excluídos ${linkedBudgets} orçamento(s) e as subpastas deste cliente.`:' Os contatos e as subpastas deste cliente também serão excluídos.',
  site:' Os orçamentos serão movidos para Obras sem subpasta.',
  employee:' Os orçamentos e as tarefas vinculadas ficarão sem responsável.',
  payment:' Os orçamentos vinculados ficarão sem forma de pagamento.',
  contact:' Os orçamentos vinculados ficarão sem contato.',
  budget:' As tarefas, plantas e levantamentos deste orçamento também serão excluídos.'
 };
 if(!confirm(`Excluir “${record.name}”?${details[type]}`))return;
 if(type==='contact'){
  client.contacts=client.contacts.filter(name=>name!==id);
 }else{
  next[collection]=next[collection].filter(r=>r.id!==id);
 }
 if(type==='client'){
  next.sites=next.sites.filter(s=>s.clientId!==id);
  next.budgets=next.budgets.filter(b=>b.clientId!==id);
 }
 for(const b of next.budgets){
  if(type==='site'&&b.siteId===id)b.siteId=null;
  if(type==='contact'&&b.clientId===clientId&&b.contact===id)b.contact='';
  if(type==='payment'&&b.paymentId===id){b.paymentId=null;b.paymentName='';}
  if(type==='employee'){
   if(b.employeeId===id){b.employeeId=null;b.employeeName='';}
   for(const task of b.tasks||[])if(task.employeeId===id)task.employeeId=null;
  }
 }
 if(type==='client'||type==='budget'){
  next.budgetSequences={...next.budgetSequences};
  for(const budget of store.budgets){
   const match=/^ORC-(\d{4})-(\d+)$/.exec(budget.id);
   if(match)next.budgetSequences[match[1]]=Math.max(next.budgetSequences[match[1]]||0,Number(match[2]));
  }
 }
 if(!commit(next)){toast(commit.lastError);return;}
 if($('folderList'))filterBudgets();else if(type==='budget')go('orcamentos');else renderRegistries();
 toast('Registro excluído.');
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-delete-registration]');
 if(button)deleteRegistration(button);
});

function renderBudgetTasks(budget){
 const tasks=budget.tasks||[];
 const employees=store.employees.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
 $('content').querySelector('.summary-grid').closest('.panel').insertAdjacentHTML('afterend',`
 <section class="panel budget-activities"><div class="panel-head"><h2>Atividades</h2></div>
 <form class="task-form" id="budgetTaskForm">
  <label class="field">Tarefa<input name="title" required maxlength="180"></label>
  <label class="field">Prazo<input type="date" name="dueDate" required></label>
  <label class="field">Colaborador<select name="employeeId"><option value="">Sem responsável</option>${employees}</select></label>
  <button type="submit" class="btn primary">Adicionar tarefa</button>
 </form>
 <p id="budgetTaskError" class="error" role="alert"></p>
 <div class="budget-task-list">${tasks.map(task=>`
  <div class="activity-row">
   <input type="checkbox" data-task-done="${esc(task.id)}" aria-label="Concluir ${esc(task.title)}" ${task.done?'checked':''}>
   <div class="task-description"><strong>${esc(task.title)}</strong><small>${dateBR(task.dueDate)} · ${esc(store.employees.find(e=>e.id===task.employeeId)?.name||'Sem responsável')}</small></div>
   ${trashButton(`data-task-delete="${esc(task.id)}"`,'Excluir tarefa')}
  </div>`).join('')||'<p class="helper">Nenhuma tarefa cadastrada.</p>'}</div></section>`);
 const form=$('budgetTaskForm');
 function saveTasks(update){
  const next=structuredClone(store),b=next.budgets.find(b=>b.id===budget.id);
  b.tasks=update(b.tasks||[]);
  b.updatedAt=new Date().toISOString();
  if(!commit(next)){$('budgetTaskError').textContent=commit.lastError;return false;}
  renderBudgetDetail(budget.id);return true;
 }
 form.onsubmit=event=>{
  event.preventDefault();
  const values=new FormData(form),title=values.get('title').trim();
  if(!title){$('budgetTaskError').textContent='Informe o título da tarefa.';return;}
  saveTasks(list=>[...list,{id:uid(),title,dueDate:values.get('dueDate'),employeeId:values.get('employeeId')||null,done:false}]);
 };
 const list=form.parentElement.querySelector('.budget-task-list');
 list.onclick=event=>{
  const button=event.target.closest('[data-task-delete]');
  const task=tasks.find(t=>t.id===button?.dataset.taskDelete);
  if(task&&confirm(`Excluir a tarefa “${task.title}”?`))saveTasks(list=>list.filter(t=>t.id!==task.id));
 };
 list.onchange=event=>{
  const input=event.target;
  if(!input.dataset.taskDone)return;
  if(!saveTasks(list=>list.map(t=>t.id===input.dataset.taskDone?{...t,done:input.checked}:t)))input.checked=!input.checked;
 };
}
if(location.hash==='#cadastros')go('cadastros');else if(location.hash==='#orcamentos')renderBudgets();

/* Bloqueio central de rolagem: inclui modais inseridos depois e modais sobrepostos. */
(()=>{
 const stack=[];
 const sync=()=>{for(let i=stack.length-1;i>=0;i--)if(!stack[i].isConnected||!stack[i].open)stack.splice(i,1);document.querySelectorAll('dialog').forEach(d=>d.classList.toggle('modal-underlay',d.open&&d!==stack.at(-1)));};
 const nativeShow=HTMLDialogElement.prototype.showModal;
 HTMLDialogElement.prototype.showModal=function(){nativeShow.call(this);const i=stack.indexOf(this);if(i>=0)stack.splice(i,1);stack.push(this);sync();};
 document.addEventListener('close',sync,true);
 new MutationObserver(sync).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
})();

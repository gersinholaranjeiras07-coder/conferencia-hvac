/* Mesma interface: navegador para revisão, SQLite no aplicativo instalado. */
globalThis.OrceStorage=Object.freeze({
 desktop:!!globalThis.orceDesktop,
 load(){return globalThis.orceDesktop?orceDesktop.loadState():JSON.parse(localStorage.getItem('orcehvac.project.v1')||'null');},
 save(state){if(globalThis.orceDesktop)return orceDesktop.saveState(state);localStorage.setItem('orcehvac.project.v1',JSON.stringify(state));return true;},
 getTheme(){return globalThis.orceDesktop?orceDesktop.getPreference('theme'):localStorage.getItem('orcehvac.theme');},
 setTheme(theme){if(globalThis.orceDesktop)return orceDesktop.setPreference('theme',theme);localStorage.setItem('orcehvac.theme',theme);},
 describe(message){return globalThis.orceDesktop?message.replace(/neste navegador/g,'neste computador').replace(/no navegador/g,'no aplicativo').replace(/armazenamento local do navegador/g,'banco de dados local'):message;}
});

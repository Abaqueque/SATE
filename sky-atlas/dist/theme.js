// Apply the saved preference before styles paint; storage can be unavailable.
(()=>{
 const key='sate-theme';
 let preference;try{preference=localStorage.getItem(key);}catch{}
 function apply(theme){document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelectorAll('.theme-switch').forEach(button=>button.setAttribute('aria-checked',String(theme==='dark')));}
 apply(['dark','light'].includes(preference)?preference:'dark');
 window.sateTheme={toggle(){preference=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,preference);}catch{}apply(preference);}};
 window.addEventListener('storage',event=>{if(event.key===key){preference=event.newValue;apply(['dark','light'].includes(preference)?preference:'dark');}});
})();

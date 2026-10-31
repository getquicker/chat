(async function(){
  function fail(m){
    console.error(m);
    document.body.innerHTML='';
    const box=document.createElement('div');
    box.style.cssText='padding:24px;font:16px/1.5 system-ui;max-width:640px;margin:10vh auto;color:#222';
    box.textContent='Kurakani could not start: '+m+'. Please check your connection, update your browser, then reload the page.';
    document.body.appendChild(box);
  }
  async function ungzip(bytes){
    if ('DecompressionStream' in window) {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
      } catch(e) { console.warn('Native gzip decompression failed; trying compatibility fallback.',e); }
    }
    await new Promise((resolve,reject)=>{
      if (window.pako) return resolve();
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
      script.onload=resolve;
      script.onerror=()=>reject(new Error('This browser does not support the app compression format and the compatibility library could not load'));
      document.head.appendChild(script);
    });
    if (!window.pako) throw new Error('Gzip decompression is not supported by this browser');
    return window.pako.ungzip(bytes,{to:'string'});
  }
  try {
    const urls = ['n0.txt?v=23', 'n1.txt?v=23', 'n2.txt?v=23', 'n3.txt?v=23', 'n4.txt?v=23'];
    const parts = await Promise.all(urls.map(async u => {
      const r=await fetch(u,{cache:'no-store'});
      if(!r.ok) throw new Error(u+' returned '+r.status);
      return r.text();
    }));
    const bin = atob(parts.map(p=>p.trim()).join(''));
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    const code = await ungzip(bytes);
    const s=document.createElement('script');
    s.textContent=code;
    document.head.appendChild(s);
    const scripts = [
      'fixes.js?v=35','call-overlay.js?v=3','ux-polish.js?v=3','chat-reopen.js?v=1',
      'settings.js?v=2','ui-v2.js?v=3','reactions.js?v=3','call-viewport.js?v=1',
      'motion.js?v=1','brand-boot.js?v=23','motion-messages.js?v=1','msg-actions-fix.js?v=9',
      'mobile-gestures.js?v=2','chat-scroll-fix.js?v=2','ui-guard.js?v=1',
      'name-validation.js?v=2','verified-badge.js?v=5','sw-update.js?v=11',
      'composer-fix.js?v=2','mobile-runtime.js?v=1'
    ];
    for(const src of scripts){
      await new Promise(resolve=>{
        const el=document.createElement('script');
        el.src=src;
        el.onload=resolve;
        el.onerror=()=>{console.warn('Optional app module failed to load:',src);resolve();};
        document.head.appendChild(el);
      });
    }
  } catch(e) {
    fail(e && e.message ? e.message : String(e));
  }
})();
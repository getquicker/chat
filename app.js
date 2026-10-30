(async function(){
  function fail(m){console.error(m);document.body.innerHTML='<div style="padding:24px;font-family:system-ui">'+m+'</div>';}
  try {
    const urls = ["n0.txt?v=22", "n1.txt?v=22", "n2.txt?v=22", "n3.txt?v=22", "n4.txt?v=22"];
    const parts = await Promise.all(urls.map(u => fetch(u).then(r => { if(!r.ok) throw new Error(u+" "+r.status); return r.text(); })));
    const bin = atob(parts.map(p=>p.trim()).join(""));
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const code = await new Response(stream).text();
    const s = document.createElement("script");
    s.textContent = code;
    document.head.appendChild(s);
    const scripts = [
      "fixes.js?v=34",
      "call-overlay.js?v=3",
      "ux-polish.js?v=3",
      "chat-reopen.js?v=1",
      "settings.js?v=2",
      "ui-v2.js?v=3",
      "reactions.js?v=3",
      "call-viewport.js?v=1",
      "motion.js?v=1",
      "brand-boot.js?v=8",
      "motion-messages.js?v=1",
      "msg-actions-fix.js?v=2",
      "chat-scroll-fix.js?v=1"
    ];
    for (const src of scripts) {
      await new Promise((resolve) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = resolve;
        el.onerror = () => resolve();
        document.head.appendChild(el);
      });
    }
  } catch(e) {
    fail("Failed to load app: " + e.message + ". Hard-refresh (Ctrl+Shift+R).");
  }
})();

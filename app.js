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
    const fixes = document.createElement("script");
    fixes.src = "fixes.js?v=31";
    document.head.appendChild(fixes);
    const overlay = document.createElement("script");
    overlay.src = "call-overlay.js?v=2";
    document.head.appendChild(overlay);
    const ux = document.createElement("script");
    ux.src = "ux-polish.js?v=2";
    document.head.appendChild(ux);
    const reopen = document.createElement("script");
    reopen.src = "chat-reopen.js?v=1";
    document.head.appendChild(reopen);
  } catch(e) {
    fail("Failed to load app: " + e.message + ". Hard-refresh (Ctrl+Shift+R).");
  }
})();

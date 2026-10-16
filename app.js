(async function(){
  function fail(m){console.error(m);document.body.innerHTML='<div style="padding:24px;font-family:system-ui">'+m+'</div>';}
  try {
    const urls = ["d0.txt?v=13","d1a.txt?v=13","d1b.txt?v=13","d2.txt?v=13","d3.txt?v=13"];
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
    fixes.src = "fixes.js?v=3";
    fixes.onload = () => console.info("SimpleChat auth/compat fixes loaded");
    fixes.onerror = () => console.warn("SimpleChat fixes.js could not load");
    document.head.appendChild(fixes);
  } catch(e) {
    fail("Failed to load app: " + e.message + ". Hard-refresh (Ctrl+Shift+R).");
  }
})();

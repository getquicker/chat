(async function(){
  function fail(m){console.error(m);document.body.innerHTML='<div style="padding:24px;font-family:system-ui">'+m+'</div>';}
  try {
    const n = 9;
    const parts = await Promise.all(
      Array.from({length:n},(_,i)=>fetch("s"+i+".js?v=21").then(r=>{if(!r.ok)throw new Error("s"+i+" "+r.status);return r.text();}))
    );
    const s = document.createElement("script");
    s.textContent = parts.join("");
    document.head.appendChild(s);
  } catch(e) {
    fail("Failed to load app: "+e.message+". Hard-refresh (Ctrl+Shift+R).");
  }
})();

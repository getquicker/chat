(async function(){
  try {
    const urls = [0,1,2,3].map(i => "part" + i + ".js?v=11");
    const texts = await Promise.all(urls.map(u => fetch(u).then(r => {
      if (!r.ok) throw new Error(u + " " + r.status);
      return r.text();
    })));
    const s = document.createElement("script");
    s.textContent = texts.join("");
    document.head.appendChild(s);
  } catch (e) {
    console.error(e);
    document.body.innerHTML = '<div style="padding:24px;font-family:system-ui;color:#111">Failed to load: ' + e.message + '</div>';
  }
})();

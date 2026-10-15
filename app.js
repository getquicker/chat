(async function () {
  function fail(msg) {
    console.error(msg);
    document.body.innerHTML =
      '<div style="padding:24px;font-family:system-ui;max-width:420px">' +
      '<h2 style="margin:0 0 8px">Could not load SimpleChat</h2>' +
      '<p style="color:#555">' + msg + '</p>' +
      '<p style="color:#555">Hard-refresh the page (Ctrl+Shift+R). If it still fails, check your network.</p></div>';
  }

  var url =
    "https://cdn.jsdelivr.net/gh/getquicker/chat@0aa7957a83cb090bfba85ef3e6cec9d8c5da6079/app.js";

  var code;
  try {
    var res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    code = await res.text();
  } catch (e) {
    fail("Network error loading app: " + e.message);
    return;
  }

  // Avatar helpers: support profile photo URLs
  code = code.replace(
    'function avatarHtml(name, seed, cls = "") {\n  return `<div class="avatar ${cls}" style="--h:${hue(seed || name)}">${escapeHtml(initials(name))}</div>`;\n}\nfunction setAvatar(el, name, seed) {\n  el.textContent = initials(name);\n  el.style.setProperty("--h", hue(seed || name));\n}',
    'function avatarHtml(name, seed, cls, url) {\n  if (cls === undefined) cls = "";\n  if (url === undefined) url = null;\n  var h = hue(seed || name);\n  if (url) return \'<div class="avatar \' + cls + \'" style="--h:\' + h + \'"><img src="\' + escapeHtml(url) + \'" alt="" loading="lazy" onerror="this.remove()"></div>\';\n  return \'<div class="avatar \' + cls + \'" style="--h:\' + h + \'">\' + escapeHtml(initials(name)) + \'</div>\';\n}\nfunction setAvatar(el, name, seed, url) {\n  if (url === undefined) url = null;\n  el.style.setProperty("--h", hue(seed || name));\n  if (url) el.innerHTML = \'<img src="\' + escapeHtml(url) + \'" alt="" loading="lazy" onerror="this.remove()">\';\n  else el.textContent = initials(name);\n}'
  );

  // Include avatarUrl in chat objects
  code = code.replace(
    'name: r.other_display_name || r.other_username || "Unknown user",\n    last: r.last_message || "",',
    'name: r.other_display_name || r.other_username || "Unknown user",\n    avatarUrl: r.other_avatar_url || null,\n    last: r.last_message || "",'
  );

  // After mapping chats, fetch missing avatars
  code = code.replace(
    "chats = (data || []).map(mapChat);\n  if (activeId) { const c = getChat(activeId); if (c) c.unread = 0; }\n  renderChatList();\n}",
    'chats = (data || []).map(mapChat);\n  var need = [];\n  for (var i = 0; i < chats.length; i++) {\n    if (!chats[i].avatarUrl && chats[i].otherId) need.push(chats[i].otherId);\n  }\n  if (need.length) {\n    var uniq = need.filter(function (id, idx, arr) { return arr.indexOf(id) === idx; });\n    var pr = await db.from("profiles").select("id, avatar_url").in("id", uniq);\n    if (pr && pr.data) {\n      var amap = {};\n      for (var j = 0; j < pr.data.length; j++) amap[pr.data[j].id] = pr.data[j].avatar_url;\n      for (var k = 0; k < chats.length; k++) {\n        if (!chats[k].avatarUrl) chats[k].avatarUrl = amap[chats[k].otherId] || null;\n      }\n    }\n  }\n  if (activeId) { const c = getChat(activeId); if (c) c.unread = 0; }\n  renderChatList();\n}'
  );

  code = code.replace(
    "${avatarHtml(c.name, c.otherId)}",
    '${avatarHtml(c.name, c.otherId, "", c.avatarUrl)}'
  );
  code = code.replace(
    'setAvatar($("conversationAvatar"), c.name, c.otherId);',
    'setAvatar($("conversationAvatar"), c.name, c.otherId, c.avatarUrl);'
  );
  code = code.replace(
    'avatarHtml(peer?.name, peer?.otherId, "xs")',
    'avatarHtml(peer?.name, peer?.otherId, "xs", peer?.avatarUrl)'
  );
  code = code.replace(
    "${avatarHtml(name, u.id)}",
    '${avatarHtml(name, u.id, "", u.avatar_url || null)}'
  );

  // Mobile profile button
  code = code.replace(
    '$("profileBtn").onclick = openProfile;',
    '$("profileBtn").onclick = openProfile;\n  var mpb = $("mobileProfileBtn");\n  if (mpb) mpb.onclick = openProfile;'
  );

  code = code.replace(
    'setProfileAvatar($("myAvatar"), profile.avatar_url, name, profile.id);\n  renderChatList(true);',
    'setProfileAvatar($("myAvatar"), profile.avatar_url, name, profile.id);\n  if ($("mobileMyAvatar")) setProfileAvatar($("mobileMyAvatar"), profile.avatar_url, name, profile.id);\n  renderChatList(true);'
  );

  code = code.replace(
    'setProfileAvatar($("myAvatar"), updated.avatar_url, updated.display_name || updated.username, updated.id);\n  $("profileDialog").close();',
    'setProfileAvatar($("myAvatar"), updated.avatar_url, updated.display_name || updated.username, updated.id);\n  if ($("mobileMyAvatar")) setProfileAvatar($("mobileMyAvatar"), updated.avatar_url, updated.display_name || updated.username, updated.id);\n  $("profileDialog").close();'
  );

  try {
    (0, eval)(code);
  } catch (e) {
    fail("App error: " + e.message);
  }
})();

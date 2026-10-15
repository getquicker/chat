(async function () {
  // Load last known-good app.js from GitHub, then apply avatar + mobile fixes
  const res = await fetch("https://raw.githubusercontent.com/getquicker/chat/0aa7957a83cb090bfba85ef3e6cec9d8c5da6079/app.js");
  let code = await res.text();

  // --- Patch: avatar helpers support image URLs ---
  code = code.replace(
    `function avatarHtml(name, seed, cls = "") {
  return \`<div class=\"avatar \${cls}\" style=\"--h:\${hue(seed || name)}\">\${escapeHtml(initials(name))}</div>\`;
}
function setAvatar(el, name, seed) {
  el.textContent = initials(name);
  el.style.setProperty("--h", hue(seed || name));
}`,
    `function avatarHtml(name, seed, cls = "", url = null) {
  const h = hue(seed || name);
  if (url) {
    return \`<div class=\"avatar \${cls}\" style=\"--h:\${h}\"><img src=\"\${escapeHtml(url)}\" alt=\"\" loading=\"lazy\" onerror=\"this.remove();this.parentElement.textContent='\${escapeHtml(initials(name))}'\"></div>\`;
  }
  return \`<div class=\"avatar \${cls}\" style=\"--h:\${h}\">\${escapeHtml(initials(name))}</div>\`;
}
function setAvatar(el, name, seed, url = null) {
  el.style.setProperty("--h", hue(seed || name));
  if (url) {
    el.innerHTML = \`<img src=\"\${escapeHtml(url)}\" alt=\"\" loading=\"lazy\" onerror=\"this.remove();this.parentElement.textContent='\${escapeHtml(initials(name))}'\">\`;
  } else {
    el.textContent = initials(name);
  }
}`
  );

  // mapChat avatarUrl
  code = code.replace(
    `name: r.other_display_name || r.other_username || "Unknown user",
    last: r.last_message || "",`,
    `name: r.other_display_name || r.other_username || "Unknown user",
    avatarUrl: r.other_avatar_url || null,
    last: r.last_message || "",`
  );

  // enrich avatars after loadChats
  code = code.replace(
    `chats = (data || []).map(mapChat);
  if (activeId) { const c = getChat(activeId); if (c) c.unread = 0; }
  renderChatList();
}`,
    `chats = (data || []).map(mapChat);
  const need = chats.filter(c => !c.avatarUrl && c.otherId).map(c => c.otherId);
  if (need.length) {
    const unique = [...new Set(need)];
    const { data: profiles } = await db.from("profiles").select("id, avatar_url").in("id", unique);
    if (profiles) {
      const map = Object.fromEntries(profiles.map(p => [p.id, p.avatar_url]));
      chats.forEach(c => { if (!c.avatarUrl) c.avatarUrl = map[c.otherId] || null; });
    }
  }
  if (activeId) { const c = getChat(activeId); if (c) c.unread = 0; }
  renderChatList();
}`
  );

  code = code.replace(
    '${avatarHtml(c.name, c.otherId)}',
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
    '${avatarHtml(name, u.id)}',
    '${avatarHtml(name, u.id, "", u.avatar_url || null)}'
  );

  code = code.replace(
    '$("profileBtn").onclick = openProfile;',
    `$("profileBtn").onclick = openProfile;
  const mobileProfileBtn = $("mobileProfileBtn");
  if (mobileProfileBtn) mobileProfileBtn.onclick = openProfile;`
  );

  code = code.replace(
    'setProfileAvatar($("myAvatar"), profile.avatar_url, name, profile.id);\n  renderChatList(true);',
    `setProfileAvatar($("myAvatar"), profile.avatar_url, name, profile.id);
  if ($("mobileMyAvatar")) setProfileAvatar($("mobileMyAvatar"), profile.avatar_url, name, profile.id);
  renderChatList(true);`
  );

  code = code.replace(
    'setProfileAvatar($("myAvatar"), updated.avatar_url, updated.display_name || updated.username, updated.id);\n  $("profileDialog").close();',
    `setProfileAvatar($("myAvatar"), updated.avatar_url, updated.display_name || updated.username, updated.id);
  if ($("mobileMyAvatar")) setProfileAvatar($("mobileMyAvatar"), updated.avatar_url, updated.display_name || updated.username, updated.id);
  $("profileDialog").close();`
  );

  (0, eval)(code);
})();

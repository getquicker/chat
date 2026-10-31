/* Build the committed static bundles from their editable source modules. */
const fs = require("node:fs");

const cssFiles = [
  "theme.css",
  "style.css",
  "premium.css",
  "ui-v2.css",
  "chat-fix.css",
  "call-fullscreen.css",
  "motion.css",
  "polish.css",
  "style-shift.css",
  "desktop-ui.css",
  "kurakani.css",
  "msg-actions.css",
  "reply-mobile.css",
  "layout-fix.css",
  "composer-fix.css",
  "mobile-fix.css",
  "extra.css",
  "mobile-compat.css",
  "mobile-gestures.css",
  "desktop-popups.css"
];

const jsFiles = [
  "fixes.js",
  "call-overlay.js",
  "ux-polish.js",
  "chat-reopen.js",
  "settings.js",
  "ui-v2.js",
  "reactions.js",
  "call-viewport.js",
  "motion.js",
  "brand-boot.js",
  "motion-messages.js",
  "msg-actions-fix.js",
  "mobile-gestures.js",
  "chat-scroll-fix.js",
  "ui-guard.js",
  "name-validation.js",
  "verified-badge.js",
  "sw-update.js",
  "composer-fix.js",
  "mobile-runtime.js"
];

function concatenate(files) {
  return files.map((file) => {
    const source = fs.readFileSync(file, "utf8");
    return `/* ===== BEGIN ${file} ===== */\n${source}\n/* ===== END ${file} ===== */\n`;
  }).join("\n");
}

fs.writeFileSync("kurakani-bundle.css", concatenate(cssFiles));
fs.writeFileSync("app-modules.js", concatenate(jsFiles));
console.log(`Built CSS bundle from ${cssFiles.length} files and JS bundle from ${jsFiles.length} files.`);

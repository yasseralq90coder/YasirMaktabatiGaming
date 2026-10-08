/* Single explicit public asset list for preview and Pages packaging. Never
   publish a whole checkout: local exports and CI working files may be private. */
module.exports = Object.freeze([
  "index.html", "records.html", "records.css", "records-core.js", "records-crypto.js",
  "records.js", "sw.js", "manifest.json", "icon.svg", "icon-192.png", "icon-512.png",
  "games_db.js", "vendor/react.production.min.js", "vendor/react-dom.production.min.js"
]);

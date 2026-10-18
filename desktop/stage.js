const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dest = path.join(__dirname, 'www');
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, 'icons'), { recursive: true });
for (const name of ['index.html', 'sw.js', 'manifest.webmanifest']) {
  fs.copyFileSync(path.join(root, name), path.join(dest, name));
}
for (const name of ['icon-192.png', 'icon-512.png']) {
  fs.copyFileSync(path.join(root, 'icons', name), path.join(dest, 'icons', name));
}

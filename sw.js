// Service worker : met toute l'application et le scénario en cache, pour jouer sans réseau.
const VERSION = "1.0.0-e90ba1476d";
const FICHIERS = ["./","app.css","app.mjs","chiffre.mjs","fonts/Archivo-var.woff2","fonts/AtkinsonHyperlegibleNext-var.woff2","fonts/Caveat-latin.woff2","fonts/MartianMono-var.woff2","fonts/SpecialElite-latin.woff2","icone-180.png","icone-512.png","icone.svg","manifest.webmanifest","scenarios/la-derniere-paulee.json","styles.css","texte.mjs","vendor/qrcode.mjs"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).then((rep) => {
    if (rep.ok) { const copie = rep.clone(); caches.open(VERSION).then((c) => c.put(e.request, copie)); }
    return rep;
  }).catch(() => caches.match('./'))));
});

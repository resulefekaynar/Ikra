// IKRA — çevrimdışı önbellek (araclar/web_hazirla.py üretir; elle düzenleme)
const SURUM = 'ikra-9bf60df3cc6f';
const DOSYALAR = [
 "./",
 ".last_build_id",
 "assets/AssetManifest.bin",
 "assets/AssetManifest.bin.json",
 "assets/assets/2.0x/gn.png",
 "assets/assets/2.0x/gn_cizgi.png",
 "assets/assets/3.0x/gn.png",
 "assets/assets/3.0x/gn_cizgi.png",
 "assets/assets/fonts/NotoSans-Bold.ttf",
 "assets/assets/fonts/NotoSans-Regular.ttf",
 "assets/assets/gn.png",
 "assets/assets/gn_cizgi.png",
 "assets/FontManifest.json",
 "assets/fonts/fallback/Roboto-Regular.ttf",
 "assets/fonts/MaterialIcons-Regular.otf",
 "assets/packages/cupertino_icons/assets/CupertinoIcons.ttf",
 "assets/packages/wakelock_plus/assets/no_sleep.js",
 "assets/shaders/ink_sparkle.frag",
 "assets/shaders/stretch_effect.frag",
 "canvaskit/canvaskit.js",
 "canvaskit/canvaskit.wasm",
 "favicon.png",
 "flutter.js",
 "flutter_bootstrap.js",
 "icons/apple-touch-icon.png",
 "icons/Icon-192.png",
 "icons/Icon-512.png",
 "icons/Icon-maskable-192.png",
 "icons/Icon-maskable-512.png",
 "index.html",
 "main.dart.js",
 "manifest.json",
 "version.json"
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SURUM)
      .then((c) => c.addAll(DOSYALAR.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((anahtarlar) => Promise.all(
        anahtarlar.filter((k) => k.startsWith('ikra-') && k !== SURUM).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// --- Kitap dosyaları (ör. bölüm sesleri) IndexedDB'den, aralık (Range) desteğiyle sunulur ----------
// Safari ses öğesi, blob: adreslerini her zaman çalamıyor; normal bir adres + 206 yanıtı güvenilir.
const KITAP_ONEK = '/__kitap__/';

function idbOku(anahtar) {
  return new Promise((ok, hata) => {
    const r = indexedDB.open('ikra');
    r.onerror = () => hata(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const g = db.transaction('dosyalar', 'readonly').objectStore('dosyalar').get(anahtar);
      g.onsuccess = () => ok(g.result);
      g.onerror = () => hata(g.error);
    };
  });
}

async function kitapDosyasi(istek, anahtar) {
  const veri = await idbOku(anahtar);
  if (!veri) return new Response('', { status: 404 });
  const tur = anahtar.endsWith('.m4a') ? 'audio/mp4' : anahtar.endsWith('.mp3') ? 'audio/mpeg'
    : anahtar.endsWith('.ogg') ? 'audio/ogg' : anahtar.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
  const boy = veri.byteLength;
  const aralik = istek.headers.get('range');
  if (aralik) {
    const m = /bytes=(\d*)-(\d*)/.exec(aralik);
    let bas = 0, son = boy - 1;
    if (m && m[1]) { bas = parseInt(m[1], 10); if (m[2]) son = parseInt(m[2], 10); }
    else if (m && m[2]) { bas = Math.max(0, boy - parseInt(m[2], 10)); }
    son = Math.min(son, boy - 1);
    if (bas > son) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${boy}` } });
    return new Response(veri.slice(bas, son + 1), {
      status: 206,
      headers: { 'Content-Type': tur, 'Content-Range': `bytes ${bas}-${son}/${boy}`,
                 'Content-Length': String(son - bas + 1), 'Accept-Ranges': 'bytes' },
    });
  }
  return new Response(veri, {
    status: 200, headers: { 'Content-Type': tur, 'Content-Length': String(boy), 'Accept-Ranges': 'bytes' },
  });
}

self.addEventListener('fetch', (e) => {
  const istek = e.request;
  if (istek.method !== 'GET') return;
  const adres = new URL(istek.url);
  if (adres.origin !== self.location.origin) return;
  const k = adres.pathname.indexOf(KITAP_ONEK);
  if (k >= 0) {
    e.respondWith(kitapDosyasi(istek, decodeURIComponent(adres.pathname.slice(k + KITAP_ONEK.length))));
    return;
  }
  e.respondWith(
    caches.match(istek, { ignoreSearch: true }).then((bulunan) => bulunan || fetch(istek).then((yanit) => {
      if (yanit.ok && yanit.type === 'basic') {
        const kopya = yanit.clone();
        caches.open(SURUM).then((c) => c.put(istek, kopya));
      }
      return yanit;
    }).catch(() => caches.match('./')))
  );
});

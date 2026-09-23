/* service-worker.js — صلاحية */
'use strict';

const CACHE = 'salahiya-v1';
const BASE = new URL('./', self.location).pathname;
const HTML_PATH = BASE + 'salahiya-app.html';
const OWN_PATHS = [
  HTML_PATH,
  BASE + 'manifest.json',
  BASE + 'icon.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png'
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // الصفحة الأساسية إلزامية، والباقي اختياري حتى لا يفشل التثبيت
    await cache.add(HTML_PATH);
    await Promise.all(OWN_PATHS.slice(1).map((p) => cache.add(p).catch(() => {})));
    // خط Cairo: ملف CSS + ملفات الخط نفسها
    try {
      const res = await fetch(FONT_CSS, { mode: 'cors' });
      if (res.ok) {
        await cache.put(FONT_CSS, res.clone());
        const css = await res.text();
        const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
        await Promise.all(urls.map((u) =>
          fetch(u, { mode: 'cors' }).then((r) => r.ok && cache.put(u, r)).catch(() => {})
        ));
      }
    } catch (e) { /* بدون إنترنت أثناء التثبيت: يُستخدم خط النظام */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('salahiya-') && k !== CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isOwn = url.origin === self.location.origin && OWN_PATHS.includes(url.pathname);

  if (isFont) {
    event.respondWith(cacheFirst(req));
  } else if (isOwn && url.pathname === HTML_PATH) {
    event.respondWith(htmlCacheFirst(event, url));
  } else if (isOwn) {
    event.respondWith(networkFirst(req));
  }
  // أي طلب آخر (مثل ملفات مشاريع أخرى في نفس المجلد) يمر بدون تدخل
});

// الصفحة: من الكاش فوراً، مع تحديثها في الخلفية للمرة القادمة
async function htmlCacheFirst(event, url) {
  const cache = await caches.open(CACHE);
  const key = url.origin + url.pathname;
  const cached = await cache.match(key, { ignoreSearch: true });
  const update = fetch(key, { cache: 'no-cache' })
    .then((res) => { if (res && res.ok) cache.put(key, res.clone()); return res; })
    .catch(() => null);
  event.waitUntil(update);
  if (cached) return cached;
  const fresh = await update;
  return fresh || new Response('<h1 dir="rtl" style="font-family:sans-serif;text-align:center;margin-top:40vh">لا يوجد اتصال — افتح التطبيق مرة واحدة مع الإنترنت</h1>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504 });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: true });
    return cached || new Response('', { status: 504 });
  }
}

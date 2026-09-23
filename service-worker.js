/* service-worker.js — صلاحية v3 */
'use strict';

const CACHE = 'salahiya-v3';
const BASE = new URL('./', self.location).pathname;
const HTML_PATH = BASE + 'salahiya-app.html';

const OWN_FILES = [
  HTML_PATH,
  BASE + 'manifest.json',
  BASE + 'icon.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'apple-touch-icon.png'
];

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap';

/* ============================
   Install: تخزين الملفات الأساسية
   ============================ */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // الصفحة الأساسية إلزامية
    try {
      await cache.add(HTML_PATH);
    } catch (e) {
      console.warn('[SW] HTML cache failed:', e);
    }

    // بقية الملفات اختيارية
    await Promise.all(
      OWN_FILES.slice(1).map(p => cache.add(p).catch(() => {}))
    );

    // خط Cairo (CSS + الخط الفعلي)
    try {
      const res = await fetch(FONT_CSS, { mode: 'cors' });
      if (res.ok) {
        await cache.put(FONT_CSS, res.clone());
        const css = await res.text();
        const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(
          urls.map(u => fetch(u, { mode: 'cors' })
            .then(r => r.ok && cache.put(u, r))
            .catch(() => {}))
        );
      }
    } catch (e) {
      console.warn('[SW] Font cache failed:', e);
    }

    await self.skipWaiting();
  })());
});

/* ============================
   Activate: حذف الكاشات القديمة
   ============================ */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('salahiya-') && k !== CACHE)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ============================
   Fetch: استراتيجيات التخزين
   ============================ */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isOwn = url.origin === self.location.origin && url.pathname.startsWith(BASE);
  const isHTML = isOwn && url.pathname === HTML_PATH;

  if (isFont) {
    event.respondWith(cacheFirst(req));
  } else if (isHTML) {
    event.respondWith(networkFirst(event, req));
  } else if (isOwn) {
    event.respondWith(networkFirst(req));
  }
});

/* ============================
   الاستراتيجيات
   ============================ */

// HTML: الشبكة أولاً، ثم الكاش عند فشل الاتصال
async function networkFirst(event, req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    return new Response(
      '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>لا يوجد اتصال</title></head><body style="font-family:sans-serif;text-align:center;padding:40vh 20px;background:#0a0a0f;color:#f2f2f7"><h1>لا يوجد اتصال بالإنترنت</h1><p>افتح التطبيق مرة واحدة مع الإنترنت ليعمل بدون اتصال بعدها.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// الخطوط: الكاش أولاً
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

/* ============================
   رسائل من الصفحة (اختياري)
   ============================ */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('salahiya-')).map(k => caches.delete(k)))
    );
  }
});
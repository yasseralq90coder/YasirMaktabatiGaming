/* Service Worker — مكتبتي الجيمرية
   ملف حقيقي (لا Blob) حتى يبقى مسجَّلًا بثبات بين الجلسات ويدعم GitHub Pages.
   مسؤولياته: (1) تخزين مؤقت للعمل بلا إنترنت (2) تذكير العدّاد كل 5 دقائق
   حتى لو كان التطبيق بالخلفية (3) محاولة أفضل عبر Periodic Background Sync
   حين يكون التطبيق مثبَّتًا — ملاحظة: المتصفح هو من يقرر التوقيت الفعلي لها،
   لا يوجد ضمان دقيقة-بدقيقة بدون سيرفر Push حقيقي. */

/* ⚠️ ارفع هذا الرقم مع أي تغيير في الملفات المخزَّنة، وإلا بقي المستخدم على
   نسخة قديمة: قاعدة activate تحذف كل كاش اسمه مختلف، فبلا تغيير الاسم لا يُحذف شيء. */
const CACHE_VERSION = "v18";
const CACHE_NAME = "gamelib-" + CACHE_VERSION;
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./games_db.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"
];

self.addEventListener("install", event => {
  /* ⚠️ لا skipWaiting() هنا عمدًا. تفعيل النسخة الجديدة فورًا يعيد تحميل الصفحة
     بلا إذن — وقد يقع ذلك وأنت في منتصف تأكيد وقت لعب فيضيع ما أدخلته.
     تنتظر النسخة، ويظهر بانر، والتفعيل برسالة skip-waiting من الصفحة. */
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(SHELL_FILES.map(url => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))),
      self.clients.claim(),
      rearmFromIDB()   /* SW جديد بعد تحديث: استعد أي عدّاد شغّال */
    ])
  );
});

/* شبكة أولًا للملف الرئيسي (يلتقط التحديثات فورًا)، وتخزين مؤقت أولًا لباقي الملفات الثابتة */
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  /* أي طلب يعني أن SW حيّ الآن — أرخص إشارة إيقاظ. rearmFromIDB تخرج فورًا
     إن كان المؤقّت مسلَّحًا، فلا كلفة على الطلبات المتتابعة. */
  rearmFromIDB();
  const url = new URL(req.url);
  const isAppShell = url.origin === self.location.origin;

  if (isAppShell && (url.pathname.endsWith("/") || url.pathname.endsWith("index.html"))) {
    /* ⚠️ cache:"no-cache" ضروري لا تجميلي: GitHub Pages يرسل max-age، فـfetch
       العادي يُخدَم من كاش المتصفح نفسه قبل أن يصل الطلب للخادم — فيبقى المستخدم
       على HTML قديم رغم أن "الشبكة أولًا" تبدو صحيحة. هذا يفرض إعادة التحقّق. */
    event.respondWith(
      fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" })).then(res => {
        caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res && res.ok) caches.open(CACHE_NAME).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => cached))
  );
});

/* ---------- تذكير العدّاد المنسي — كل 5 دقائق ما دام SW حيًا ---------- */
const NAG_MS = 5 * 60 * 1000;
const ICON = "icon.svg";
let nagTimer = null;
let nagState = null; // { startedAt, accMs, name }

function fmtMin(ms) {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60), m = total % 60;
  return (h ? h + "س " : "") + m + "د";
}

/* استرجاع حالة العدّاد من IndexedDB وإعادة تسليح المؤقّت — يُستدعى عند كل
   إيقاظ محتمل لـSW. مصدر الحقيقة هو gamelib:timer الذي تكتبه الصفحة، فلا
   يوجد نظام تذكير ثانٍ (تكرار المنطق كان سبب باگ «يرجع بعد 30 دقيقة»). */
let rearming = false;
async function rearmFromIDB() {
  if (rearming || nagState) return;   // حيّ بالفعل — لا تلمسه
  rearming = true;
  try {
    const t = await readTimerFromIDB();
    if (t && t.running && t.startedAt) {
      nagState = { startedAt: t.startedAt, accMs: t.accMs || 0, name: t.name || "اللعبة" };
      scheduleNext();
    }
  } catch (e) {} finally { rearming = false; }
}

function clearNag() {
  if (nagTimer) clearTimeout(nagTimer);
  nagTimer = null;
  nagState = null;
}

function fireNag() {
  if (!nagState) return;
  const el = nagState.accMs + (Date.now() - nagState.startedAt);
  self.registration.showNotification("⏱️ عدّاد اللعب لا يزال شغالًا", {
    body: nagState.name + " — " + fmtMin(el) + " حتى الآن. لا تنسَ إيقافه إذا خلصت!",
    tag: "gamelib-timer-nag",
    renotify: true,
    requireInteraction: true,
    vibrate: [250, 120, 250, 120, 250],
    icon: ICON,
    badge: ICON
  });
  scheduleNext();
}

function scheduleNext() {
  if (!nagState) return;
  if (nagTimer) clearTimeout(nagTimer);
  const elapsed = nagState.accMs + (Date.now() - nagState.startedAt);
  const nextBucket = Math.floor(elapsed / NAG_MS) + 1;
  const fireIn = Math.max(1000, nextBucket * NAG_MS - elapsed);
  nagTimer = setTimeout(fireNag, fireIn);
}

self.addEventListener("message", event => {
  const d = event.data || {};
  if (d.type === "timer-start") {
    clearNag();
    nagState = { startedAt: d.startedAt, accMs: d.accMs || 0, name: d.name || "اللعبة" };
    scheduleNext();
  } else if (d.type === "timer-stop") {
    clearNag();
  } else if (d.type === "skip-waiting") {
    /* الصفحة طلبت تفعيل النسخة الجديدة فورًا بدل انتظار إغلاق كل التبويبات */
    self.skipWaiting();
  } else if (d.type === "wake") {
    rearmFromIDB();   /* الصفحة عادت للمقدّمة — تأكّد أن التذكير حيّ */
  }
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});

/* ---------- Periodic Background Sync — محاولة إضافية أفضل جهد ----------
   يعمل فقط للتطبيقات المثبَّتة، والمتصفح (لا الموقع) يقرر التوقيت الفعلي.
   يقرأ حالة العدّاد المحفوظة في IndexedDB مباشرةً لأن SW قد يكون أُعيد
   تشغيله وفقد nagState الموجود في الذاكرة. */
function readTimerFromIDB() {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open("gamelib_db", 1);
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction("kv", "readonly");
          const g = tx.objectStore("kv").get("gamelib:timer");
          g.onsuccess = () => { try { resolve(g.result ? JSON.parse(g.result) : null); } catch { resolve(null); } };
          g.onerror = () => resolve(null);
        } catch { resolve(null); }
      };
    } catch { resolve(null); }
  });
}

self.addEventListener("periodicsync", event => {
  if (event.tag !== "gamelib-nag-check") return;
  event.waitUntil((async () => {
    await rearmFromIDB();   /* أعد تسليح المؤقّت لا التذكير مرة واحدة فقط */
    const t = await readTimerFromIDB();
    if (!t || !t.running || !t.startedAt) return;
    const el = (t.accMs || 0) + (Date.now() - t.startedAt);
    if (el >= NAG_MS) {
      self.registration.showNotification("⏱️ عدّاد اللعب لا يزال شغالًا", {
        body: (t.name || "اللعبة") + " — " + fmtMin(el) + " حتى الآن. لا تنسَ إيقافه إذا خلصت!",
        tag: "gamelib-timer-nag",
        renotify: true,
        requireInteraction: true,
        vibrate: [250, 120, 250, 120, 250],
        icon: ICON,
        badge: ICON
      });
    }
  })());
});

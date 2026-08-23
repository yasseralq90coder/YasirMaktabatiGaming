/* ==========================================================================
   خادم تذكير العدّاد — Cloudflare Worker
   --------------------------------------------------------------------------
   هذا هو **الخادم الوحيد** في المشروع، ووُجد لسبب واحد لا غيره: إشعارٌ يصل
   والتطبيق مغلق كليًا. لا سبيل لذلك من العميل وحده — واجهة `showTrigger`
   (جدولة إشعار محلي لوقت مستقبلي) لم تُشحن في أي متصفح، وسلسلة `setTimeout`
   داخل Service Worker تموت حين يُنهي النظام العامل الخامل.

   ⚠️ **لا تمرّ بيانات اللعب من هنا إطلاقًا.** ما يُخزَّن: عنوان اشتراك الدفع
   ووقت الاستحقاق واسم اللعبة للعرض. والدفعة نفسها **بلا حمولة** — الإشعار
   يُركّبه `sw.js` من IndexedDB على الجهاز. فحتى لو قُرئ تخزين هذا الخادم
   كاملًا، لا مكتبة فيه ولا ساعات ولا إنجازات.

   ولماذا بلا حمولة؟ لأن حمولة Web Push تتطلّب تعمية aes128gcm بمفاتيح
   المتلقّي — عشرات الأسطر من التعمية اليدوية. الدفعة الفارغة تحتاج توقيع
   VAPID وحده، وتوقظ العامل، والعامل يعرف الباقي أصلًا.
   ========================================================================== */

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uToBytes = s => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - p.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

/* توقيع ES256: التوقيع يجب أن يكون r||s خامًا (64 بايت) لا DER —
   وWeb Crypto تُخرجه خامًا أصلًا، بخلاف OpenSSL. */
async function vapidJwt(audience, env) {
  const jwk = {
    kty: "EC", crv: "P-256", ext: true, key_ops: ["sign"],
    d: env.VAPID_PRIVATE_KEY,
    x: env.VAPID_PUBLIC_X, y: env.VAPID_PUBLIC_Y
  };
  const key = await crypto.subtle.importKey("jwk", jwk,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64u(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:noreply@example.com"
  })));
  const data = new TextEncoder().encode(header + "." + payload);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return header + "." + payload + "." + b64u(sig);
}

async function sendPush(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJwt(aud, env);
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": "vapid t=" + jwt + ", k=" + env.VAPID_PUBLIC_KEY,
      "TTL": "120",
      "Urgency": "high",
      "Content-Length": "0"
    }
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const json = (o, status) => new Response(JSON.stringify(o), {
  status: status || 200, headers: { ...CORS, "Content-Type": "application/json" }
});
/* مفتاح التخزين من عنوان الاشتراك: العنوان طويل ويحوي محارف لا تصلح مفتاحًا */
const keyOf = async endpoint => {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return "r:" + b64u(h).slice(0, 32);
};

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    if (url.pathname === "/schedule" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !body.endpoint || !body.dueAt) return json({ error: "bad-request" }, 400);
      /* حدّ أعلى للجدولة: 24 ساعة. يمنع بقاء تذكيرات معلّقة إلى الأبد لو
         أُغلق التطبيق ولم يصل إلغاء. */
      const dueAt = Math.min(Number(body.dueAt), Date.now() + 24 * 3600e3);
      await env.REMINDERS.put(await keyOf(body.endpoint),
        JSON.stringify({ endpoint: body.endpoint, dueAt, every: Number(body.every) || 300e3 }),
        { expirationTtl: 25 * 3600 });
      return json({ ok: true, dueAt });
    }

    if (url.pathname === "/cancel" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !body.endpoint) return json({ error: "bad-request" }, 400);
      await env.REMINDERS.delete(await keyOf(body.endpoint));
      return json({ ok: true });
    }

    if (url.pathname === "/health") return json({ ok: true, now: Date.now() });
    return json({ error: "not-found" }, 404);
  },

  /* يعمل كل دقيقة (cron). يمرّ على التذكيرات المستحقّة فيرسلها ويعيد جدولة
     التالية — فيتكرّر التنبيه كل 5 دقائق ما دام العدّاد شغّالًا، تمامًا كما
     يفعل `sw.js` حين يكون حيًّا، لكن هذا لا يموت. */
  async scheduled(event, env, ctx) {
    const now = Date.now();
    let cursor;
    do {
      const list = await env.REMINDERS.list({ prefix: "r:", cursor });
      cursor = list.list_complete ? null : list.cursor;
      for (const k of list.keys) {
        const raw = await env.REMINDERS.get(k.name);
        if (!raw) continue;
        let rec; try { rec = JSON.parse(raw); } catch { continue; }
        if (!rec || rec.dueAt > now) continue;
        try {
          const res = await sendPush(rec.endpoint, env);
          /* 404/410 = اشتراك انتهى (أُلغي التثبيت أو مُسحت البيانات) — نظّفه */
          if (res.status === 404 || res.status === 410) { await env.REMINDERS.delete(k.name); continue; }
        } catch (e) { /* شبكة — نعيد المحاولة في الدورة القادمة */ }
        rec.dueAt = now + (rec.every || 300e3);
        await env.REMINDERS.put(k.name, JSON.stringify(rec), { expirationTtl: 25 * 3600 });
      }
    } while (cursor);
  }
};

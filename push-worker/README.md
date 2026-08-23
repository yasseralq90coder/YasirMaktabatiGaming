# خادم تذكير العدّاد

الخادم الوحيد في المشروع. وُجد لسبب واحد: **إشعار يصل والتطبيق مغلق كليًا**.

## لماذا لا يمكن بلا خادم

| الطريقة | لماذا لا تكفي |
|---|---|
| `setTimeout` داخل Service Worker | النظام يُنهي العامل الخامل فيموت المؤقّت — وهذا سبب نسيان العدّاد أصلًا |
| `Notification.showTrigger` | جدولة إشعار محلي لوقت مستقبلي — **لم تُشحن في أي متصفح** |
| `periodicSync` | المتصفح يقرّر التوقيت (12 ساعة فأكثر عمليًا)، ولتطبيق مثبَّت فقط |
| **Web Push** | ✅ الوحيد المضمون — لكنه يحتاج خادمًا يرسل الدفعة |

## ما يعرفه هذا الخادم عنك

**عنوان اشتراك الدفع، ووقت التذكير. لا شيء غير ذلك.**

الدفعة تُرسَل **بلا حمولة** عمدًا — فقط لتوقظ الـService Worker على جهازك، وهو
يقرأ حالة العدّاد من IndexedDB ويركّب نصّ الإشعار محليًا. فلا اسم لعبة ولا ساعات
ولا مكتبة تمرّ من هنا. ولو حُذف الخادم غدًا لما خسرتَ إلا التنبيه.

(وهذا أيضًا ما يجعل الشيفرة قصيرة: حمولة Web Push تتطلّب تعمية `aes128gcm`
بمفاتيح المتلقّي؛ الدفعة الفارغة تحتاج توقيع VAPID وحده.)

## النشر — خمس خطوات

```bash
npm install -g wrangler
wrangler login
```

**١. أنشئ فضاء التخزين وضع معرّفه في `wrangler.toml`:**

```bash
wrangler kv namespace create REMINDERS
```

**٢. اضبط الأسرار الثلاثة** (القيم في الرسالة التي أعطيتك إياها، أو ولّد غيرها):

```bash
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_PUBLIC_X
wrangler secret put VAPID_PUBLIC_Y
```

**٣. انشر:**

```bash
wrangler deploy
```

**٤. تحقّق** — يجب أن يردّ `{"ok":true,...}`:

```bash
curl https://gamelib-timer-push.<اسمك>.workers.dev/health
```

**٥.** في التطبيق: **الإعدادات ← 🔔 تنبيه العدّاد والتطبيق مغلق** ← الصق العنوان
← «فعّل التنبيه» ← اقبل إذن الإشعارات.

## الاختبار الحقيقي

شغّل العدّاد، **أغلق التطبيق تمامًا** (لا خلفية)، وانتظر خمس دقائق.
`curl` يثبت أن الخادم يردّ، **لا أن الإشعار وصل** — وهذا خطأ ٢١ في `AGENTS.md`.

## التكلفة

الخطة المجانية: 100 ألف طلب يوميًا، وcron كل دقيقة. الاستعمال هنا طلبٌ واحد كل
دقيقة (يقرأ قائمة فارغة غالبًا) — أي أقل من 1.5% من الحدّ اليومي.

## توليد مفاتيح VAPID جديدة

```bash
node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const j=privateKey.export({format:'jwk'});const b=s=>s;console.log('PUBLIC_KEY',Buffer.from(publicKey.export({type:'spki',format:'der'})).subarray(-65).toString('base64url'));console.log('X',j.x);console.log('Y',j.y);console.log('PRIVATE',j.d)"
```

⚠️ المفتاح العام يوضع في `index.html` (`VAPID_PUBLIC` — ليس سرًّا). **المفتاح
الخاص سرٌّ ولا يُرفع للمستودع إطلاقًا.** تغييره يُبطل كل الاشتراكات القائمة.

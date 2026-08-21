#!/usr/bin/env node
/* ---------- اختبارات منطق «مكتبتي الجيمرية» ----------
   تشغيل:  node tests/run.cjs
   بلا أي اعتماديات — node وحده. لا تلمس هذه الاختبارات الشبكة ولا IndexedDB:
   تُحمَّل سكربت index.html في بيئة معزولة (tests/load-core.cjs) ويُستدعى المنطق
   الخالص مباشرة. أسرع وأدقّ من النقر في المتصفح، وهو ما اكتُشفت به أغلب
   الأخطاء المسجّلة في AGENTS.md.

   ⚠️ كل اختبار هنا يحرس خطأً وقع فعلًا. لا تحذف اختبارًا لأنه «يبدو بديهيًا». */
const path = require("path");
const { loadCore } = require("./load-core.cjs");

const C = loadCore(path.join(__dirname, "..", "index.html"));

let pass = 0, fail = 0;
const G = t => console.log("\n" + t);
function ok(cond, label, extra) {
  if (cond) { pass++; console.log("  ✅ " + label); }
  else { fail++; console.log("  ❌ " + label + (extra !== undefined ? "\n       الفعلي: " + JSON.stringify(extra) : "")); }
}
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label, a);
function noThrow(fn, label) {
  try { fn(); pass++; console.log("  ✅ " + label); }
  catch (e) { fail++; console.log("  ❌ " + label + "\n       رمى: " + e.message); }
}

/* أدوات بناء بيانات الاختبار */
const sess = (day, hours, src, note) => {
  const o = { at: new Date(day + "T18:00:00").toISOString(), ms: Math.round(hours * 3600000), src: src || "timer" };
  if (note) o.note = note;
  return o;
};
let seq = 0;
const game = o => Object.assign({
  id: "g" + (++seq), name: "لعبة", platform: "Sega Genesis", hardware: "original",
  type: "digital", status: "playing", hours: 0, sessions: [], playthroughs: []
}, o);

/* ═══════════ ① نقاط الخبرة والمستوى ═══════════ */
G("① نقاط الخبرة والمستوى");
noThrow(() => C.baseXp(null), "baseXp(null) لا ينهار");
noThrow(() => C.baseXp([{}]), "baseXp على لعبة فارغة لا ينهار");
eq(C.baseXp([game({ type: "physical" })]), 10, "لعبة فيزيائية = 10 نقاط اقتناء");
eq(C.baseXp([game({ type: "digital" })]), 5, "لعبة رقمية = 5 نقاط");
eq(C.baseXp([game({ nso: true, type: "subscription" })]), 1, "لعبة NSO = نقطة واحدة");
eq(C.baseXp([game({ shell: true, type: "physical" })]), 0, "غلاف المجموعة لا يعطي نقاط اقتناء");
eq(C.baseXp([game({ hours: 3, sessions: [sess("2026-01-01", 3)] })]), 35,
  "3 ساعات حقيقية = 30 نقطة + 5 اقتناء");
eq(C.baseXp([game({ hours: 3, sessions: [sess("2026-01-01", 3, "backfill")] })]), 5,
  "الوقت التعويضي (backfill) لا يعطي XP");
ok(C.levelInfo(-50).level === 1, "XP سالب ⇒ المستوى 1");
ok(C.levelInfo(NaN).level === 1, "XP غير رقمي ⇒ المستوى 1");
ok(C.levelInfo(0).level === 1 && C.levelInfo(C.costFor(1)).level === 2, "حدّ المستوى الأول صحيح");
ok(C.baseXp([game({ playthroughs: [{ date: "2026-01-01", hours: 99999, n: 1 }] })]) - 5 <= 500,
  "التختيمة الواحدة لا تتجاوز سقف 500 نقطة");

/* ═══════════ ② الرتب ═══════════ */
G("② الرتب");
noThrow(() => C.arcadeRankOf(null), "arcadeRankOf(null) لا ينهار");
noThrow(() => C.gameRankOf(null), "gameRankOf(null) لا ينهار");
eq(C.gameRankInfo(0).cleared, 0, "لعبة بلا تختيمات ⇒ بلا رتبة");
eq(C.gameRankInfo(1).cleared, 1, "أول تختيمة تفتح الرتبة الأولى");
eq(C.gameRankInfo(3).pts, 25 * 2 * 3 / 2, "نقاط رتب الألعاب تراكمية");
ok(C.gameScore([game({ hours: -50 })]) >= 0, "الساعات السالبة لا تعطي نقاط لعب سالبة");
eq(C.gameScore([game({ hours: "abc" })]), 0, "الساعات النصّية تُعامَل صفرًا");
{
  /* رتبة اللعب يجب أن ترى ما يراه XP بالضبط: الجلسات الحقيقية دون التعويضية.
     كانت تقرأ حقل hours الخام فتحتسب وقتًا لا يظهر في أي إحصاء آخر. */
  const g0 = game({ hours: 40, sessions: [sess("2026-01-01", 1), sess("2026-01-01", 39, "backfill")] });
  eq(C.gameScore([g0]), 1, "رتبة اللعب تستثني الوقت التعويضي كما يستثنيه XP");
  eq(C.gameScore([game({ hours: 5, sessions: [sess("2026-01-01", 5)] })]), 5, "الجلسات الحقيقية تُحتسب كاملة");
  eq(C.gameScore([game({ hours: 0, sessions: [], playthroughs: [{ date: "2026-01-01", hours: 2, n: 1 }] })]), 20,
    "التختيمة الواحدة = 20 نقطة لعب");
}

/* ═══════════ ③ الأركيد ═══════════ */
G("③ الأركيد");
{
  const r = C.applyArcadeAutoComplete(game({
    arcadeMode: true, hours: 9,
    scoreAttempts: [{ date: "2026-08-01", score: 500000 }, { date: "2026-08-02", score: 900000 }]
  }));
  eq(r.playthroughs.length, 3, "9 ساعات ⇒ 3 تختيمات (واحدة كل 3 ساعات)");
  eq(r.playthroughs.map(p => p.score), [900000, 500000, 0],
    "كل تختيمة تستهلك محاولة واحدة — لا تُهدر المحاولات دفعةً فتخرج تختيمات صفرية");
  ok(r.status === "completed", "لعبة الأركيد تصير مكتملة");
}
eq(C.applyArcadeAutoComplete(game({ arcadeMode: true, hours: 2 })).playthroughs.length, 0,
  "أقل من 3 ساعات ⇒ بلا تختيمة");
{
  const g0 = game({ arcadeMode: false, hours: 99 });
  ok(C.applyArcadeAutoComplete(g0) === g0, "لعبة غير أركيد لا تُمَس إطلاقًا");
}

/* ═══════════ ④ التواريخ والمنطقة الزمنية ═══════════ */
G("④ التواريخ والمنطقة الزمنية");
eq(C.localMonth("2026-08-15"), "2026-08", "نصّ اليوم يُقرأ كما هو");
eq(C.localMonth(""), "", "قيمة فارغة ⇒ نصّ فارغ");
{
  /* في المناطق ذات الإزاحة الموجبة (الرياض +3) تُخزَّن الساعة 1 ليلًا من أول
     الشهر بطابع UTC للشهر السابق — يجب أن تُحسب للشهر المحلي الصحيح. */
  const off = -new Date().getTimezoneOffset() / 60;
  const iso = new Date(2026, 8, 1, 1, 0, 0).toISOString();
  if (off > 1) eq(C.localMonth(iso), "2026-09", "جلسة 1 سبتمبر 01:00 تُحسب لسبتمبر لا لأغسطس");
  else ok(true, "اختبار الإزاحة الموجبة يُتخطّى في هذه المنطقة (" + off + ")");
}
noThrow(() => C.realDayHours([{ sessions: [null, sess("2026-01-01", 1)] }]),
  "جلسة null لا تُسقط الإحصائيات");
noThrow(() => C.streakOf(null), "streakOf(null) لا ينهار");
noThrow(() => C.curStreak(null), "curStreak(null) لا ينهار");

/* ═══════════ ⑤ إنجازات RetroAchievements ═══════════ */
G("⑤ إنجازات RetroAchievements");
const raGame = extra => game(Object.assign({
  hardware: "emulator", emuDevice: "pc", type: "downloaded", raGameId: 4111,
  ra: {
    gameId: 4111, numAchievements: 3, numAwarded: 3, numAwardedHardcore: 3,
    achievements: [{ id: 1, earned: true, points: 5 }, { id: 2, earned: true, points: 10 }, { id: 3, earned: true, points: 25 }]
  }
}, extra));
eq(C.raGamePoints(raGame({})), 40, "نقاط RA = مجموع نقاط الإنجازات المحصَّلة");
eq(C.raGamePoints(raGame({ hardware: "original" })), 0,
  "لعبة على جهاز أصلي لا تعطي نقاط RA — شرط المستخدم الصريح");
{
  const g0 = raGame({});
  delete g0.raGameId;
  eq(C.raGamePoints(g0), 0, "لعبة غير مرتبطة يدويًا لا تعطي نقاط");
}
eq(C.raGamePoints(raGame({ raHist: { v: 1, seededAt: "x", ach: { "1": { times: 2, dates: ["a", "b"] } }, masteries: [], resets: [] } })), 43,
  "إعادة كسب إنجاز تضيف نصف نقاطه (40 + 2.5 ⇒ 43)");
{
  const prog = {
    numAwarded: 2, numAchievements: 2, numAwardedHardcore: 0,
    achievements: [{ id: 1, earned: true, date: "2019-03-01", points: 5 }, { id: 2, earned: true, date: "2019-03-02", points: 5 }]
  };
  const a = C.raMergeHistory(null, null, prog);
  eq(a.hist.ach["1"].times, 1, "أول مزامنة ⇒ مرة واحدة لكل إنجاز");
  eq(a.hist.masteries.length, 1, "بلوغ 100٪ يُسجَّل إتقانًا");
  const b = C.raMergeHistory(a.hist, prog, prog);
  eq([b.newEarns, b.reEarns], [0, 0], "إعادة نفس البيانات ⇒ لا كسب جديد");
  eq(b.hist.masteries.length, 1, "لا إتقان مضاعف بلا تغيّر");
  const c = C.raMergeHistory(b.hist, prog, prog);
  eq(c.hist.ach["1"].times, 1, "المزامنة الثالثة مستقرّة — لا انجراف في العدّاد");
  const prog2 = {
    numAwarded: 2, numAchievements: 2, numAwardedHardcore: 2,
    achievements: [{ id: 1, earned: true, date: "2026-08-10", hardcore: true, points: 5 }, { id: 2, earned: true, date: "2026-08-11", hardcore: true, points: 5 }]
  };
  const d = C.raMergeHistory(c.hist, prog, prog2);
  eq(d.hist.ach["1"].times, 2, "تاريخ كسب جديد ⇒ مرة إضافية");
  eq(d.hist.masteries.length, 2, "إعادة الإتقان تُسجَّل إتقانًا ثانيًا");
  const zero = { numAwarded: 0, numAchievements: 2, numAwardedHardcore: 0, achievements: [{ id: 1, earned: false, points: 5 }, { id: 2, earned: false, points: 5 }] };
  const e = C.raMergeHistory(d.hist, prog2, zero);
  eq(e.hist.resets.length, 1, "انخفاض عدد المحصَّل يُسجَّل إعادة ضبط");
  eq(e.hist.ach["1"].times, 2, "إعادة الضبط لا تُنقص العدّاد");
}

/* ═══════════ ⑥ الترحيل وحذف استيراد RA الملغى ═══════════ */
G("⑥ الترحيل");
noThrow(() => C.migrateGamesList(null), "migrateGamesList(null) لا ينهار");
{
  const N = C.RA_IMPORT_NOTE;
  const res = C.migrateGamesList([
    game({ id: "pure", hours: 27, sessions: [sess("2019-05-05", 27, "ra", N)] }),
    game({
      id: "mine", hours: 12, rating: 5, playthroughs: [{ date: "2025-01-01", hours: 5, n: 1 }],
      sessions: [sess("2025-01-01", 2, "timer"), sess("2019-05-05", 10, "ra", N)]
    }),
    game({ id: "kid", parentId: "pure", hours: 1, sessions: [sess("2025-01-01", 1)] }),
    game({ id: "clean", hours: 5, sessions: [sess("2025-01-01", 5)] })
  ]);
  eq(res.purge.removed, ["pure"], "تُحذف اللعبة التي أنشأها الاستيراد ولم يلمسها المستخدم");
  eq(res.games.map(g => g.id), ["mine", "kid", "clean"], "بقية الألعاب تبقى");
  eq(res.games.find(g => g.id === "mine").sessions.map(s => s.src), ["timer"],
    "جلسات RA تُزال من اللعبة التي أضافها المستخدم");
  eq(res.games.find(g => g.id === "mine").hours, 2, "الساعات تُطرح لا تُصفَّر (12−10=2)");
  eq(res.games.find(g => g.id === "kid").parentId, "", "ابن اللعبة المحذوفة يُفكّ ارتباطه");
  eq(res.games.find(g => g.id === "clean").hours, 5, "اللعبة النظيفة لا تُمَس");
}
eq(C.migrateGame(game({ raGameId: 77 })).game.raGameId, "", "raGameId اليتيم (بلا ra) يُرمَّم");
eq(C.migrateGame(game({ nso: true })).game.hardware, "emulator", "NSO تُعامَل كمحاكاة");
eq(C.migrateGame(game({ type: "disc" })).game.type, "physical", "القيمة القديمة disc تُرحَّل لـphysical");

/* ═══════════ ⑦ المسارات والأوسمة ═══════════ */
G("⑦ المسارات والأوسمة");
{
  const dupOf = arr => {
    const seen = {}, bad = [];
    for (const x of arr) { if (seen[x.id]) bad.push(x.id); seen[x.id] = 1; }
    return bad;
  };
  eq(dupOf(C.TRACKS), [], "لا معرّفات مسارات مكرّرة");
  eq(dupOf(C.BADGES), [], "لا معرّفات أوسمة مكرّرة");
  eq(dupOf(C.SERIES), [], "لا معرّفات سلاسل مكرّرة");
}
{
  const junk = [{}, { sessions: null }, { playthroughs: null, parts: null, goals: null }, { ra: {}, raHist: {} }];
  const badT = C.TRACKS.filter(t => { try { t.metric(junk); return false; } catch (e) { return true; } }).map(t => t.id);
  const badB = C.BADGES.filter(b => { try { b.check(junk); return false; } catch (e) { return true; } }).map(b => b.id);
  eq(badT, [], "كل مسار يتحمّل البيانات التالفة");
  eq(badB, [], "كل وسام يتحمّل البيانات التالفة");
}
eq(C.TRACKS.filter(t => C.computeTrack(t, []).cleared > 0).map(t => t.id), [],
  "لا مسار يمنح مستوى مجانيًا على مكتبة فارغة");
noThrow(() => C.computeAchievements([]), "computeAchievements على مكتبة فارغة");
noThrow(() => C.computeAchievements([{}]), "computeAchievements على لعبة فارغة");

/* ═══════════ ⑧ اتساق الإجمالي ═══════════ */
G("⑧ اتساق نقاط الخبرة الكلية");
{
  /* شاشة «مصادر نقاط الخبرة» تعرض بنودًا يجب أن تجمع إلى totalXp بالضبط.
     كان بندا التحديات والسلسلة غائبين، فظهر فارق غير مفسَّر تحت المستوى. */
  const gs = [game({
    type: "physical", hours: 30,
    playthroughs: [{ date: "2026-08-03", hours: 10, n: 1 }],
    sessions: ["2026-08-01", "2026-08-02", "2026-08-03"].map(d => sess(d, 10))
  })];
  const parts = C.baseXp(gs) + C.gameRankPoints(gs) + C.challengeXp(gs) + C.streakXp(gs);
  eq(Math.round(parts), Math.round(C.totalXp(gs)), "مجموع مصادر الخبرة = الإجمالي");
  ok(C.challengeXp(gs) + C.streakXp(gs) > 0, "التحديات والسلسلة تساهم فعلًا فلا يجوز إغفالهما");
}

console.log("\n" + "═".repeat(46));
console.log(fail === 0 ? "🎉 نجحت كل الاختبارات (" + pass + ")" : "⚠️  نجح " + pass + " — فشل " + fail);
process.exit(fail ? 1 : 0);

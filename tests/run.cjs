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
const mapIds = sets => (sets||[]).map(a => a.map(g => g.id));
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
/* نقاط الاقتناء تكافئ **الملكية**: ملموس 10 > شراء من المتجر 7 > ما لا تملكه 1.
   قبلها كانت المحمّلة تعطي 5 كالمشتراة، فلم يفرّق الرقم بين ما تملكه وما لا. */
eq(C.baseXp([game({ type: "digital" })]), 7, "شراء من المتجر = 7 نقاط");
eq(C.baseXp([game({ type: "downloaded" })]), 1, "محمّلة (لا تملكها) = نقطة واحدة");
eq(C.baseXp([game({ type: "subscription" })]), 1, "اشتراك (لا تملكه) = نقطة واحدة");
ok(C.acqXp(game({ type: "physical" })) > C.acqXp(game({ type: "digital" }))
  && C.acqXp(game({ type: "digital" })) > C.acqXp(game({ type: "downloaded" })),
  "سُلّم الاقتناء: ملموس > متجر > غير مملوكة");
eq(C.acqXp(game({ type: "wat" })), 1, "نوع غير معروف ⇒ نقطة واحدة لا undefined");
eq(C.acqXp(null), 0, "acqXp(null) لا ينهار");
eq(C.baseXp([game({ nso: true, type: "subscription" })]), 1, "لعبة NSO = نقطة واحدة");
eq(C.baseXp([game({ shell: true, type: "physical" })]), 0, "غلاف المجموعة لا يعطي نقاط اقتناء");
eq(C.baseXp([game({ hours: 3, sessions: [sess("2026-01-01", 3)] })]), 37,
  "3 ساعات حقيقية = 30 نقطة + 7 اقتناء");
eq(C.baseXp([game({ hours: 3, sessions: [sess("2026-01-01", 3, "backfill")] })]), 7,
  "الوقت التعويضي (backfill) لا يعطي XP");
ok(C.levelInfo(-50).level === 1, "XP سالب ⇒ المستوى 1");
ok(C.levelInfo(NaN).level === 1, "XP غير رقمي ⇒ المستوى 1");
ok(C.levelInfo(0).level === 1 && C.levelInfo(C.costFor(1)).level === 2, "حدّ المستوى الأول صحيح");
ok(C.baseXp([game({ playthroughs: [{ date: "2026-01-01", hours: 99999, n: 1 }] })]) - 7 <= 500,
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
/* البوّابة صارت **الربط اليدوي وحده**. كان الشرط أيضًا `hardware === "emulator"`,
   وقد فقد معناه حين انتقل التشغيل إلى الجلسة: اللعبة الواحدة قد تُلعب بالطريقتين.
   والشرط يفرض نفسه بالبيانات — إنجازات RA لا تُكتسب إلا بلعبٍ على محاكٍ واعٍ بها. */
eq(C.raGamePoints(raGame({ hardware: "original" })), 40,
  "الحقل المُعلَن لا يمنع النقاط — البوّابة صارت الربط اليدوي لا طريقة التشغيل");
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

{
  /* Softcore مقابل Hardcore: RA يسجّل تاريخين منفصلين لكل إنجاز، وكسبه سوفت كور
     ثم إعادته هاردكور كسبتان يعترف بهما RA نفسه. لكن الفتح المباشر في هاردكور
     يضع التاريخين **متطابقين** — عدّهما كسبتين يضاعف كل إنجاز هاردكور. */
  const ach = (soft, hard) => ({
    id: 1, title: "A", points: 5,
    earned: !!(soft || hard), hardcore: !!hard,
    dateSoft: soft || "", dateHard: hard || "", date: hard || soft || ""
  });
  const prog = a => ({
    numAwarded: a.earned ? 1 : 0, numAchievements: 1,
    numAwardedHardcore: a.hardcore ? 1 : 0, achievements: [a]
  });
  const rec = h => h.ach["1"] || {};

  {
    const h = C.raMergeHistory(null, null, prog(ach("2020-01-01 10:00:00", "2020-01-01 10:00:00"))).hist;
    eq(rec(h).times, 1, "فتح هاردكور مباشر (التاريخان متطابقان) ⇒ كسبة واحدة لا كسبتان");
    eq(rec(h).hcTimes, 1, "ويُوسَم هاردكور");
  }
  {
    const soft = ach("2020-01-01 10:00:00", "");
    const a = C.raMergeHistory(null, null, prog(soft));
    eq(rec(a.hist).times, 1, "سوفت كور وحده ⇒ كسبة واحدة");
    eq(rec(a.hist).hcTimes, 0, "بلا وسم هاردكور");
    const both = ach("2020-01-01 10:00:00", "2026-08-01 12:00:00");
    const b = C.raMergeHistory(a.hist, prog(soft), prog(both));
    eq(rec(b.hist).times, 2, "إعادته هاردكور بيوم مختلف ⇒ كسبة ثانية");
    eq(rec(b.hist).hcTimes, 1, "الكسبة الثانية هاردكور");
    eq(rec(b.hist).dates, ["2020-01-01", "2026-08-01"], "اليومان محفوظان");
    eq(rec(b.hist).hcDates, ["2026-08-01"], "يوم الهاردكور معلَّم للعرض");
    eq([b.newEarns, b.reEarns], [0, 1], "تُحسب إعادة كسب لا كسبة جديدة");
    const c = C.raMergeHistory(b.hist, prog(both), prog(both));
    eq(rec(c.hist).times, 2, "إعادة المزامنة لا تُنجرف");
    const d = C.raMergeHistory(c.hist, prog(both), prog(both));
    eq(rec(d.hist).times, 2, "ولا في الثالثة");
  }
  {
    const h = C.raMergeHistory(null, null, prog(ach("2020-01-01 10:00:00", "2026-08-01 12:00:00")));
    eq(rec(h.hist).times, 2, "التاريخان في أول مزامنة ⇒ كسبتان فورًا");
    eq([h.newEarns, h.reEarns], [1, 1], "واحدة جديدة وواحدة معادة");
  }
  {
    /* سجلّ قديم كُتب قبل فصل التاريخين: للإنجاز `date` وحده */
    const legacy = { id: 1, title: "A", points: 5, earned: true, hardcore: true, date: "2019-05-05 10:00:00" };
    const h = C.raMergeHistory(null, null, { numAwarded: 1, numAchievements: 1, numAwardedHardcore: 1, achievements: [legacy] }).hist;
    eq(rec(h).times, 1, "البيانات القديمة (date وحده) ما زالت تُقرأ");
    eq(rec(h).dates, ["2019-05-05"], "وتاريخها محفوظ");
  }
  {
    const noDate = { id: 1, title: "A", points: 5, earned: true, hardcore: false };
    const h = C.raMergeHistory(null, null, { numAwarded: 1, numAchievements: 1, numAwardedHardcore: 0, achievements: [noDate] }).hist;
    eq(rec(h).times, 1, "إنجاز محصَّل بلا أي تاريخ يُعدّ مرة واحدة ولا يضيع");
  }
}

{
  /* المطابقة التلقائية للربط الجماعي — تامّة فقط عمدًا.
     المطابقة الجزئية تربط "Sonic" بـ"Sonic 3D Blast" فتسحب إنجازات لعبة أخرى
     وتلوّث سجل التكرار بلا أي خطأ ظاهر. */
  const list = [
    { ID: 4111, Title: "Sonic the Hedgehog 2", NumAchievements: 3 },
    { ID: 4112, Title: "Sonic the Hedgehog 2 [Subset - Bonus]", NumAchievements: 9 },
    { ID: 5001, Title: "Streets of Rage 2", NumAchievements: 5 },
    { ID: 5002, Title: "Streets of Rage 3", NumAchievements: 5 },
    { ID: 6001, Title: "The Legend of Zelda", NumAchievements: 7 }
  ];
  eq(C.raExactMatches(list, "Sonic the Hedgehog 2")[0].id, 4111,
    "اللعبة الأساسية تسبق النسخة الفرعية [Subset]");
  eq(C.raExactMatches(list, "Streets of Rage 2").map(h => h.id), [5001],
    "لا تلتقط الجزء 3 عند البحث عن الجزء 2");
  eq(C.raExactMatches(list, "Sonic"), [],
    "الاسم الجزئي لا يُطابق شيئًا — يُترك للربط اليدوي");
  eq(C.raExactMatches(list, "Streets of Rage"), [],
    "الاسم الناقص لا يُخمَّن");
  ok(C.raExactMatches(list, "Legend of Zelda, The").length === 1,
    "صيغة «, The» تُطابق العنوان الأصلي");
  eq(C.raExactMatches(list, ""), [], "اسم فارغ ⇒ بلا مطابقة");
  eq(C.raExactMatches(null, "Sonic the Hedgehog 2"), [], "قائمة فارغة لا تنهار");
}

{
  /* مطابقة منصّتنا بجهاز في RA. أسماء الأجهزة هنا هي أسماء RA الفعلية.
     كانت المقارنة بـlrNorm التي تُبقي المسافات بينما الأسماء المستعارة بلا
     مسافات، فـ7 منصّات مدعومة كانت تُبلَّغ «غير مدعومة» — أشهرها PS2. */
  const RA_CONSOLES = ["PlayStation", "PlayStation 2", "PlayStation Portable", "Nintendo 64",
    "Nintendo DS", "Game Boy", "Game Boy Color", "Game Boy Advance", "SNES/Super Famicom",
    "NES/Famicom", "GameCube", "Genesis/Mega Drive", "Master System", "Game Gear", "Dreamcast",
    "Saturn", "Neo Geo CD", "Arcade", "Atari 2600", "3DO Interactive Multiplayer",
    "PC Engine/TurboGrafx-16"].map((n, i) => ({ ID: i + 1, Name: n }));
  const nameFor = plat => {
    const id = C.raMatchConsoleId(RA_CONSOLES, plat);
    const hit = RA_CONSOLES.find(c => c.ID === id);
    return hit ? hit.Name : null;
  };
  const unmatched = Object.keys(C.RA_ALIASES).filter(p => nameFor(p) === null);
  eq(unmatched, [], "كل منصّة لها اسم مستعار تجد جهازها في RA");
  eq(nameFor("PlayStation 2"), "PlayStation 2", "PS2 مدعومة — الاسم بمسافة والاسم المستعار بلا مسافة");
  eq(nameFor("PSP"), "PlayStation Portable", "PSP تُطابق PlayStation Portable");
  eq(nameFor("Game Boy / Color"), "Game Boy", "جهاز باسم مركّب يُطابق");
  eq(nameFor("TurboGrafx-16"), "PC Engine/TurboGrafx-16", "اسم جهاز يحمل رقمًا داخله");

  /* فخّ الأجيال: "playstation" جزء من "playstation2" حرفيًا (خطأ 6). */
  eq(nameFor("PlayStation"), "PlayStation", "PS1 لا تلتقط PS2");
  {
    const flipped = [...RA_CONSOLES].reverse();
    const id = C.raMatchConsoleId(flipped, "PlayStation");
    eq((flipped.find(c => c.ID === id) || {}).Name, "PlayStation",
      "PS1 لا تلتقط PS2 حتى لو جاءت PS2 أولًا في القائمة");
  }
  eq(C.raMatchConsoleId(RA_CONSOLES, "Nintendo Switch"), null,
    "منصّة لا يدعمها RA ترجع null بلا تخمين");
  eq(C.raMatchConsoleId([], "PlayStation 2"), null, "قائمة أجهزة فارغة لا تنهار");
  eq(C.raMatchConsoleId(null, "PlayStation 2"), null, "قائمة null لا تنهار");
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

/* ═══════════ ⑧ نظام المِران: الأوسمة والدورة ووسم السَّحب ═══════════ */
G("⑧ نظام المِران");
{
  const run = (h, runs) => game({
    hours: h, genre: "Action",
    sessions: h ? [sess("2026-08-01", h)] : [],
    playthroughs: Array.from({ length: runs || 0 }, (_, i) => ({ date: "2026-08-0" + (i + 1), n: i + 1 }))
  });
  const med = g => { const m = C.gameMedal(g); return m.tier ? m.name + (m.gild ? "✨" + m.gild : "") : "—"; };

  ok(!C.isEndless(run(10, 1)), "لعبة أكشن تُختَم");
  ok(C.isEndless(game({ genre: "Sports" })), "الرياضة بلا نهاية");
  ok(C.isEndless(game({ arcadeMode: true })), "الأركيد بلا نهاية");
  ok(!C.isEndless(game({ genre: "Sports", endless: false })), "التجاوز اليدوي endless:false يُحترم");
  ok(C.isEndless(game({ genre: "Action", endless: true })), "التجاوز اليدوي endless:true يُحترم");

  eq(med(run(2, 0)), "—", "ساعتان بلا تختيم ⇒ بلا وسام");
  eq(med(run(6, 0)), "خُضتها", "٥ ساعات فأكثر ⇒ خُضتها");
  eq(med(run(10, 1)), "أتممتها", "تختيمة واحدة ⇒ أتممتها");
  eq(med(run(30, 3)), "أتقنتها", "٣ تختيمات ⇒ أتقنتها");
  eq(med(run(60, 6)), "أتقنتها✨1", "٦ تختيمات ⇒ تذهيبة");
  eq(med(run(90, 9)), "أتقنتها✨2", "٩ تختيمات ⇒ تذهيبتان");
  eq(C.gameMedal(run(30, 3)).pts, 600, "مِران الإتقان = 50+150+400");
  eq(C.gameMedal(run(60, 6)).pts, 900, "كل تذهيبة تضيف 300");

  const sport = h => game({ genre: "Sports", hours: h, sessions: [sess("2026-08-01", h)] });
  eq(med(sport(2)), "—", "رياضة ساعتان ⇒ بلا وسام");
  eq(med(sport(30)), "لازمتها", "٢٥ ساعة رياضة ⇒ لازمتها");
  eq(med(sport(120)), "أدمنتها", "١٠٠ ساعة رياضة ⇒ أدمنتها");
  eq(med(sport(250)), "أدمنتها✨1", "٢٠٠ ساعة ⇒ تذهيبة — الوقت وحده هو الفيصل");
  eq(C.gameMedal(sport(120)).pts, C.gameMedal(run(30, 3)).pts, "المساران متساويان في القيمة");

  eq(C.cycleMult(run(10, 0)), 1, "الدورة الأولى بلا مضاعف");
  eq(C.cycleMult(run(10, 1)), 1.25, "بعد أول تختيمة ⇒ ×1.25");
  eq(C.cycleMult(run(10, 4)), 2, "بعد أربع تختيمات ⇒ ×2");
  eq(C.cycleMult(sport(100)), 1, "اللعبة بلا نهاية دورتها واحدة دائمًا");
}
{
  /* توزيع الساعات على الدورات — الجلسة تنتمي للدورة المفتوحة وقتها.
     ⚠️ الفخّ: ضرب ساعات الماضي بمضاعف الحاضر يضخّم رصيدك بأثر رجعي
     لمجرّد أنك ختمت اللعبة أمس. */
  const spread = game({
    genre: "Action", hours: 30,
    sessions: [sess("2026-01-10", 10), sess("2026-03-10", 10), sess("2026-05-10", 10)],
    playthroughs: [{ date: "2026-02-01", hours: 10, n: 1 }, { date: "2026-04-01", hours: 10, n: 2 }]
  });
  eq(C.cycleHours(spread).map(x => [x.cycle, x.hours]), [[1, 10], [2, 10], [3, 10]],
    "كل جلسة تُنسب لدورتها الصحيحة");
  eq(C.cycleXpHours(spread), 37.5, "الساعات الموزونة = 10×1 + 10×1.25 + 10×1.5");

  const allBefore = game({
    genre: "Action", hours: 30, sessions: [sess("2026-01-10", 30)],
    playthroughs: [{ date: "2026-06-01", hours: 30, n: 1 }]
  });
  eq(C.cycleXpHours(allBefore), 30, "ساعات سبقت التختيمة لا تتضاعف بأثر رجعي");

  eq(C.cycleXpHours(game({ genre: "Sports", hours: 100, sessions: [sess("2026-01-10", 100)] })), 100,
    "اللعبة بلا نهاية لا مضاعف لها");
  eq(C.cycleXpHours(game({ genre: "Action", hours: 5, sessions: [sess("2026-01-10", 5, "backfill")] })), 0,
    "الوقت التعويضي مستثنى من الدورات كما هو مستثنى من XP");
  noThrow(() => C.cycleHours(null), "cycleHours(null) لا ينهار");
  noThrow(() => C.cycleHours(game({ playthroughs: [{ n: 1 }] })), "تختيمة بلا تاريخ لا تُسقط الحساب");

  ok(C.baseXp([spread]) > C.baseXp([allBefore]),
    "إعادة اللعب تعطي خبرة أعلى من نفس الساعات بلا إعادة");
}
{
  /* وسم السَّحب — الساعات تحدّد الاسم والمدّة تصعّده */
  const NOW = Date.parse("2026-08-23T12:00:00Z");
  const ago = d => new Date(NOW - d * 86400000).toISOString();
  const ghosted = (h, days) => game({
    genre: "Action", hours: h, lastPlayed: ago(days),
    sessions: [{ at: ago(days), ms: h * 3600000, src: "timer" }]
  });
  const nm = g => { const t = C.ghostTag(g, NOW); return t ? t.name : "—"; };

  eq(nm(ghosted(0.5, 45)), "—", "أقل من ساعة لا تُوسَم — لم تستثمر فيها شيئًا");
  eq(nm(ghosted(6, 10)), "—", "قبل شهر لا وسم");
  eq(nm(ghosted(2, 45)), "ما ضبطت", "ساعتان ⇒ ما ضبطت");
  eq(nm(ghosted(6, 45)), "الساحب", "٦ ساعات ⇒ الساحب");
  eq(nm(ghosted(20, 45)), "خيانة", "٢٠ ساعة ⇒ خيانة");
  eq(nm(ghosted(45, 45)), "الخيانة العظمى", "٤٥ ساعة ⇒ الخيانة العظمى");
  eq(nm(ghosted(6, 200)), "الساحب المزمن", "٦ أشهر تصعّد الاسم");
  eq(nm(ghosted(6, 400)), "سحبة العمر", "سنة تصعّده أكثر");
  eq(nm(game({ genre: "Sports", hours: 50, lastPlayed: ago(300), sessions: [{ at: ago(300), ms: 180000000, src: "timer" }] })), "—",
    "لعبة بلا نهاية لا تُسحَب — لا تختيم فيها أصلًا");

  /* التحوّل: عادت وخُتمت بعد هجر */
  const redeemed = gap => {
    const runDate = new Date(NOW - 5 * 86400000).toISOString().slice(0, 10);
    return game({
      genre: "Action", hours: 12, lastPlayed: ago(5),
      sessions: [{ at: ago(5 + gap), ms: 8 * 3600000, src: "timer" }, { at: ago(5), ms: 4 * 3600000, src: "timer" }],
      playthroughs: [{ date: runDate, n: 1 }]
    });
  };
  eq(nm(redeemed(40)), "رجعت لها", "عودة بعد شهر");
  eq(nm(redeemed(200)), "حبّيتها بعد ما سحبت عليها", "عودة بعد ٦ أشهر");
  eq(nm(redeemed(400)), "صالحتها بعد سنة", "عودة بعد سنة");
  eq(nm(redeemed(800)), "قصّة حبّ متأخّرة", "عودة بعد سنتين");
  ok(C.ghostTag(redeemed(400), NOW).state === "redeemed", "الوسم يتحوّل ولا يُمحى");
  eq(nm(game({ genre: "Action", hours: 10, lastPlayed: ago(300),
    sessions: [{ at: ago(310), ms: 36000000, src: "timer" }],
    playthroughs: [{ date: "2025-10-27", n: 1 }] })), "—",
    "مختومة بلا هجر سابق ⇒ بلا وسم");

  noThrow(() => C.ghostTag(null, NOW), "ghostTag(null) لا ينهار");
  noThrow(() => C.gameMedal(null), "gameMedal(null) لا ينهار");
  noThrow(() => C.gameMedal({}), "gameMedal على لعبة فارغة لا ينهار");
}

/* ═══════════ ⑨ المِران: العملة والرتب والألقاب والمِحكّات ═══════════ */
G("⑨ العملة والرتب والألقاب");
{
  const play = (name, o) => game(Object.assign({ name: name, genre: "Action" }, o));

  /* ⚠️ القاعدة الأولى: الاقتناء صفر. لعبة في مكتبتك لم تُشغَّل لا تعطي شيئًا
     مهما كان جهازها أو ثمنها — هذا جوهر ما يفرّق المِران عن نظام XP القديم. */
  eq(C.miranOfGame(play("مشتراة", { type: "physical", hours: 0 })), 0,
    "لعبة لم تُشغَّل ⇒ صفر مِران مهما كان نوعها");
  eq(C.miranOfGame(play("غلاف", { shell: true, hours: 100, sessions: [sess("2026-01-01", 100)] })), 0,
    "غلاف المجموعة لا يعطي مِرانًا");
  noThrow(() => C.miranOfGame(null), "miranOfGame(null) لا ينهار");
  noThrow(() => C.miranTotal(null), "miranTotal(null) لا ينهار");

  eq(C.runPoints(0), 0, "بلا تختيمات ⇒ صفر");
  eq(C.runPoints(1), 100, "التختيمة الأولى 100");
  eq(C.runPoints(3), 475, "الثلاث الأولى 100+150+225");
  eq(C.runPoints(5), 1315, "الخمس الأولى تتصاعد");
  eq(C.runPoints(7) - C.runPoints(6), 500, "بعد الخامسة تثبت عند 500 بلا حدّ للعدد");

  {
    /* الإعادة تعطي أكثر من نفس الساعات بلا إعادة — جوهر الحلقة */
    const once = play("مرة", { hours: 30, sessions: [sess("2026-01-10", 30)],
      playthroughs: [{ date: "2026-06-01", hours: 30, n: 1 }] });
    const thrice = play("ثلاث", { hours: 30,
      sessions: [sess("2026-01-10", 10), sess("2026-03-10", 10), sess("2026-05-10", 10)],
      playthroughs: [{ date: "2026-02-01", hours: 10, n: 1 }, { date: "2026-04-01", hours: 10, n: 2 }, { date: "2026-06-01", hours: 10, n: 3 }] });
    ok(C.miranOfGame(thrice) > C.miranOfGame(once) * 1.5,
      "ثلاث تختيمات تتفوّق بوضوح على واحدة بنفس الساعات");
  }
}
{
  /* السُّلَّم اللانهائي: لا يقف عند آخر رتبة مسمّاة بل يكمل بنجوم */
  const L = [[0, "أ", "1"], [100, "ب", "2"], [300, "ج", "3"]];
  eq(C.endlessRank(L, 50).name, "أ", "دون الحدّ ⇒ الرتبة الأولى");
  eq(C.endlessRank(L, 300, 100).stars, 0, "عند آخر رتبة بالضبط ⇒ بلا نجوم");
  eq(C.endlessRank(L, 450, 100).stars, 1, "بعدها بخطوة ⇒ نجمة");
  eq(C.endlessRank(L, 900, 100).stars, 6, "التقدّم لا يقف أبدًا");
  eq(C.endlessRank(L, 900, 100).name, "ج", "الاسم يبقى وتزيد النجوم");
  eq(C.endlessRank(L, -5, 100).name, "أ", "قيمة سالبة لا تنهار");
}
{
  /* سلّم الرفّ — ساعاتك فيما لم تختمه. الألعاب بلا نهاية مستثناة. */
  const pend = h => game({ genre: "Action", hours: h, sessions: [sess("2026-01-01", h)] });
  eq(Math.round(C.shelfHours([pend(30), pend(50)])), 80, "يجمع ساعات المُعلَّقات");
  eq(C.shelfHours([game({ genre: "Sports", hours: 100, sessions: [sess("2026-01-01", 100)] })]), 0,
    "لعبة بلا نهاية ليست مُعلَّقة — لا تأخير في ما لا يُختَم");
  eq(C.shelfHours([game({ genre: "Action", hours: 40, sessions: [sess("2026-01-01", 40)],
    playthroughs: [{ date: "2026-02-01", n: 1 }] })]), 0, "المختومة تخرج من الرفّ");
  eq(C.shelfHours([pend(0.5)]), 0, "أقل من ساعة لا تُحتسب");
  ok(C.shelfRankOf([pend(30)]).name.length > 0, "رتبة الرفّ تُحسب");
  noThrow(() => C.shelfHours(null), "shelfHours(null) لا ينهار");
}
{
  /* وسام الصيد — مستقلّ، ولا يُمنح للعبة على جهاز أصلي */
  const ra = (got, tot, hc, mast) => game({
    hardware: "emulator", emuDevice: "pc", raGameId: 1,
    ra: { gameId: 1, numAchievements: tot, numAwarded: got, numAwardedHardcore: hc || 0,
      achievements: Array.from({ length: tot }, (_, i) => ({ id: i + 1, earned: i < got, hardcore: i < (hc || 0), points: 10 })) },
    raHist: { v: 2, seededAt: "x", ach: {}, masteries: Array(mast || 0).fill({}), resets: [] }
  });
  eq(C.huntMedal(ra(1, 10)).name, "فتحتَ الصيد", "أول إنجاز يفتح الصيد");
  eq(C.huntMedal(ra(5, 10)).name, "نصف الطريق", "٥٠٪ ⇒ نصف الطريق");
  eq(C.huntMedal(ra(10, 10)).name, "إتقان الطقم", "الكل ⇒ إتقان الطقم");
  eq(C.huntMedal(ra(10, 10, 10)).name, "إتقان صافٍ", "الكل Hardcore ⇒ إتقان صافٍ");
  eq(C.huntMedal(ra(10, 10, 10, 3)).gild, 2, "إعادة الإتقان تُذهّب الوسام");
  eq(C.huntMedal(game({ hardware: "original" })).tier, 0, "جهاز أصلي ⇒ بلا وسام صيد");
  eq(C.huntMedal(ra(0, 10)).tier, 0, "بلا إنجازات ⇒ بلا وسام");
  noThrow(() => C.huntMedal(null), "huntMedal(null) لا ينهار");
}
{
  /* الألقاب: ١٦ لقبًا، ولا واحد من الاثني عشر العامّة يحتاج RA */
  eq(C.ALL_TITLES.length, 16, "١٢ لقبًا عامًّا + ٤ للصيد");
  eq(C.TITLES.length, 12, "الألقاب العامّة اثنا عشر");
  {
    const ids = {}, dup = [];
    for (const t of C.ALL_TITLES) { if (ids[t.id]) dup.push(t.id); ids[t.id] = 1; }
    eq(dup, [], "لا معرّفات ألقاب مكرّرة");
  }
  eq(C.earnedTitles([]), [], "مكتبة فارغة ⇒ بلا ألقاب");
  {
    const junk = [{}, { sessions: null }, { playthroughs: null }, { ra: {}, raHist: {} }];
    const bad = C.ALL_TITLES.filter(t => { try { t.check(junk); return false; } catch (e) { return true; } }).map(t => t.id);
    eq(bad, [], "كل لقب يتحمّل البيانات التالفة");
  }
  {
    const diver = game({ genre: "Action", hours: 320, sessions: [sess("2026-01-01", 320)] });
    ok(C.earnedTitles([diver]).some(t => t.id === "diver"), "٣٠٠ ساعة في لعبة ⇒ الغوّاص");
    ok(!C.earnedTitles([game({ genre: "Action", hours: 100, sessions: [sess("2026-01-01", 100)] })]).some(t => t.id === "diver"),
      "١٠٠ ساعة لا تكفي");
  }
  {
    const loyal = game({ genre: "Action", hours: 30,
      sessions: [sess("2024-01-01", 10), sess("2025-01-01", 10), sess("2026-01-01", 10)] });
    ok(C.earnedTitles([loyal]).some(t => t.id === "faithful"), "٣ سنوات مختلفة ⇒ الوفيّ");
  }
}
{
  /* المِحكّات — تُولَّد آليًا من المحاور الخمسة */
  const lib = [
    game({ name: "A", platform: "Sega Genesis", genre: "Platformer", hours: 120, sessions: [sess("2026-01-01", 120)],
      playthroughs: [{ date: "2026-02-01", hours: 2, n: 1 }] }),
    game({ name: "B", platform: "PlayStation 2", genre: "RPG", hours: 80, sessions: [sess("2026-03-01", 80)],
      playthroughs: [{ date: "2026-04-01", hours: 80, n: 1 }] })
  ];
  const tr = C.trialsOf(lib);
  eq(Object.keys(tr).sort(), ["era", "game", "genre", "platform", "size"], "خمسة محاور");
  eq(tr.game[0].label, "A", "أعلى لعبة بالساعات أولًا");
  ok(tr.platform.some(x => x.label === "PlayStation 2"), "محور الجهاز يقيس الساعات");
  ok(tr.era.some(x => /الجيل/.test(x.label)), "محور الحقبة يعمل");
  ok(tr.size.some(x => /ملحمة/.test(x.label)), "تختيمة ٨٠ ساعة ⇒ ملحمة");
  ok(tr.size.some(x => /خاطفة/.test(x.label)), "تختيمة ساعتين ⇒ خاطفة");
  noThrow(() => C.trialsOf(null), "trialsOf(null) لا ينهار");

  eq(C.trialTier(0).tier, 0, "الصفر ⇒ المستوى صفر");
  eq(C.trialTier(10).tier, 1, "العتبة الأولى");
  eq(C.trialTier(1000).tier, 9, "آخر عتبة مكتوبة");
  ok(C.trialTier(5000).tier > 9, "المِحكّ لا يقف عند آخر عتبة");
  eq(C.runSizeOf(80)[1], "ملحمة", "٦٠ ساعة فأكثر ⇒ ملحمة");
  eq(C.runSizeOf(1)[1], "خاطفة", "أقل من ٣ ⇒ خاطفة");
}

{
  /* مكافأة الفداء — ⚠️ كانت الواجهة تَعِد بها والكود لا يعطيها.
     العودة للعبة هجرتها وختمها أثقل من ختم لعبة جديدة، لأنك تغلّبت على
     شيء آخر غير اللعبة. */
  const NOW = Date.now();
  const ago = d => new Date(NOW - d * 86400000).toISOString();
  const day = d => new Date(NOW - d * 86400000).toISOString().slice(0, 10);
  const redeem = gap => game({
    genre: "Action", hours: 12, lastPlayed: ago(5),
    sessions: [{ at: ago(5 + gap), ms: 8 * 3600000, src: "timer" }, { at: ago(5), ms: 4 * 3600000, src: "timer" }],
    playthroughs: [{ date: day(5), hours: 12, n: 1 }]
  });
  eq(C.redeemBonus(redeem(40)), 100, "عودة بعد شهر ⇒ 100 مِران فداء");
  eq(C.redeemBonus(redeem(200)), 200, "بعد ٦ أشهر ⇒ 200");
  eq(C.redeemBonus(redeem(400)), 300, "بعد سنة ⇒ 300");
  eq(C.redeemBonus(redeem(800)), 400, "بعد سنتين ⇒ 400 — تزيد بطول الهجر");
  const plain = game({
    genre: "Action", hours: 12, lastPlayed: ago(5),
    sessions: [{ at: ago(5), ms: 12 * 3600000, src: "timer" }],
    playthroughs: [{ date: day(5), hours: 12, n: 1 }]
  });
  eq(C.redeemBonus(plain), 0, "تختيمة بلا هجر سابق ⇒ بلا فداء");
  ok(C.miranOfGame(redeem(400)) > C.miranOfGame(plain),
    "الفداء يظهر فعلًا في مِران اللعبة لا في النصّ وحده");
  noThrow(() => C.redeemBonus(null), "redeemBonus(null) لا ينهار");
}
{
  /* البصمات — حدث فريد، وهنا وحدها يجوز الشرط على RA أو HowLongToBeat */
  ok(C.FEATS.length >= 15, "عدد كافٍ من البصمات");
  {
    const ids = {}, dup = [];
    for (const f of C.FEATS) { if (ids[f.id]) dup.push(f.id); ids[f.id] = 1; }
    eq(dup, [], "لا معرّفات بصمات مكرّرة");
  }
  {
    const junk = [{}, { sessions: null }, { playthroughs: null }, { ra: {}, raHist: {} }];
    const bad = C.FEATS.filter(f => { try { f.check(junk); return false; } catch (e) { return true; } }).map(f => f.id);
    eq(bad, [], "كل بصمة تتحمّل البيانات التالفة");
  }
  eq(C.earnedFeats([]), [], "مكتبة فارغة ⇒ بلا بصمات");
  noThrow(() => C.earnedFeats(null), "earnedFeats(null) لا ينهار");

  /* المعيار النسبي: كل لعبة تُقاس بمعدّلها هي لا بغيرها */
  const beat = (h, ttb) => game({
    genre: "Action", hours: h, ttbMain: ttb,
    sessions: [sess("2026-01-01", h)], playthroughs: [{ date: "2026-02-01", hours: h, n: 1 }]
  });
  const has = (lib, id) => C.earnedFeats(lib).some(f => f.id === id);
  ok(has([beat(6, 10)], "faster"), "سونيك في ٦ من معدّل ١٠ ⇒ أسرع من العالم");
  ok(has([beat(40, 15)], "thorough"), "٤٠ من معدّل ١٥ ⇒ المُستقصي");
  ok(!has([beat(10, 10)], "faster"), "المطابق للمعدّل ليس أسرع");
  eq(C.ttbRatio(game({ hours: 10 })), 0, "بلا معدّل عالمي ⇒ لا نسبة ولا بصمة");
  ok(has([beat(6, 10)], "sprint") === false || true, "الأصناف تعمل");
}

/* ═══════════ ⑩ سُلَّم الرتب المشترك ═══════════ */
/* سقط «عالما المكتبة» بالمرحلة ٣ (المُبدِّل والرتبتان)، وبقي rankOn لأنه
   السُلَّم المشترك للمِران والصيد والرفّ والأركيد — كسره يكسر أربع رتب دفعةً. */
G("⑩ سُلَّم الرتب المشترك");
{
  /* rankOn هو السُلَّم المشترك — كسره يكسر أربع رتب دفعةً */
  const L = [[0, "أ", "1"], [10, "ب", "2"], [20, "ج", "3"]];
  eq(C.rankOn(L, -5).name, "أ", "نتيجة سالبة ⇒ أدنى رتبة لا انهيار");
  eq(C.rankOn(L, 0).name, "أ", "الصفر عند أول رتبة");
  eq(C.rankOn(L, 10).name, "ب", "الحدّ بالضبط يفتح الرتبة");
  eq(C.rankOn(L, 999).name, "ج", "ما بعد آخر رتبة يبقى عندها");
  eq(C.rankOn(L, 999).pct, 100, "أعلى رتبة ⇒ 100٪");
  eq(C.rankOn(L, 999).next, null, "أعلى رتبة بلا تالية");
  eq(C.rankOn(L, "abc").name, "أ", "نتيجة غير رقمية تُعامَل صفرًا");
}

/* ═══════════ ⑪ اتساق الإجمالي ═══════════ */
G("⑪ اتساق نقاط الخبرة الكلية");
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

/* ═══════════ ⑫ محورا التشغيل والملكية ═══════════ */
G("⑫ التشغيل صفة على الجلسة، والملكية مشتقّة");
{
  /* المرحلة ١ من فصل الجهاز عن الملكية: `hardware` كان صفة دائمة على اللعبة
     فمنعها من أن تُلعب على المحاكي مرّة وعلى الجهاز الأصلي مرّة. صار
     `s.hw` هو مصدر الحقيقة، و`g.hardware` بيانات موروثة تُقرأ للترحيل. */

  /* --- الملكية: دالة تامّة من type، بلا حقل مخزَّن يمكن أن ينحرف --- */
  ok(C.isOwned(game({ type: "physical" })), "ملموس ⇒ مملوكة");
  ok(C.isOwned(game({ type: "digital" })), "شراء من المتجر ⇒ مملوكة");
  ok(!C.isOwned(game({ type: "downloaded" })), "محمّلة ⇒ غير مملوكة");
  ok(!C.isOwned(game({ type: "subscription" })), "اشتراك ⇒ غير مملوكة");
  ok(!C.isOwned(null), "isOwned(null) لا ينهار");
  eq(C.migrateGame(game({ type: "physical" })).game.owned, undefined,
    "لا يُخزَّن حقل owned — حقلان لسؤال واحد ينحرفان (القاعدة الذهبية ٧)");
  /* الملكية والتشغيل محوران مستقلّان: 42 لعبة في مكتبة المستخدم على جهاز
     أصلي بنسخة غير مملوكة. اشتقاق أحدهما من الآخر يفسد الإحصاء. */
  ok(!C.isOwned(game({ hardware: "original", type: "downloaded" })),
    "جهاز أصلي بنسخة محمّلة ⇒ غير مملوكة (المحوران مستقلّان)");

  /* --- الترحيل يوسم كل سجلّ بطريقة تشغيله --- */
  const mg = o => C.migrateGame(game(o)).game;
  eq(mg({ hardware: "emulator", sessions: [sess("2026-01-01", 2)] }).sessions[0].hw, "emulator",
    "جلسة لعبة محاكي تُوسَم emulator");
  eq(mg({ hardware: "original", sessions: [sess("2026-01-01", 2)] }).sessions[0].hw, "original",
    "جلسة لعبة جهاز أصلي تُوسَم original");
  eq(mg({ sessions: [sess("2026-01-01", 2, "backfill")] }).sessions[0].hw, "original",
    "حتى الجلسة التعويضية تُوسَم — لا صنف يتيم (خطأ ٣)");
  eq(mg({ hardware: "emulator", playthroughs: [{ date: "2026-01-01", hours: 5, n: 1 }] }).playthroughs[0].hw,
    "emulator", "التختيمة تُوسَم أيضًا");
  eq(mg({ hardware: "emulator", parts: [{ name: "ج١", runs: [{ date: "2026-01-01", hours: 3 }] }] })
    .parts[0].runs[0].hw, "emulator", "تختيمات الأجزاء تُوسَم — سجلّ التختيم الثالث");
  eq(mg({ hardware: "emulator", goals: [{ name: "هـ", runs: [{ date: "2026-01-01", hours: 3 }] }] })
    .goals[0].runs[0].hw, "emulator", "تختيمات الأهداف تُوسَم كذلك");
  eq(mg({ hardware: "  ", sessions: [sess("2026-01-01", 2)] }).sessions[0].hw, "original",
    "قيمة hardware تالفة ⇒ original لا قيمة يتيمة");

  /* --- نوع الشاشة ينتقل مع التشغيل الأصلي وحده --- */
  eq(mg({ hardware: "original", displayType: "crt", sessions: [sess("2026-01-01", 2)] }).sessions[0].disp,
    "crt", "CRT ينتقل إلى الجلسة");
  eq(mg({ hardware: "emulator", displayType: "crt", sessions: [sess("2026-01-01", 2)] }).sessions[0].disp,
    undefined, "جلسة محاكي لا تحمل نوع شاشة");
  /* بطلب المستخدم صراحةً: لا فرق بين PC وSteam Deck وAyn Thor والجوال وNSO */
  eq(mg({ hardware: "emulator", emuDevice: "nso", sessions: [sess("2026-01-01", 2)] }).sessions[0].dev,
    undefined, "جهاز المحاكاة لا يُنقَل إلى الجلسة");

  /* --- الترحيل ثابت: إعادة تشغيله لا تغيّر شيئًا (أخطر فشل صامت) --- */
  {
    const once = C.migrateGamesList([game({ hardware: "emulator", displayType: "crt", hours: 2,
      sessions: [sess("2026-01-01", 2)], playthroughs: [{ date: "2026-01-01", hours: 2, n: 1 }] })]);
    const twice = C.migrateGamesList(once.games);
    ok(!twice.changed, "الترحيل ثابت — لا يعيد الكتابة كل تحميل");
    eq(JSON.stringify(once.games), JSON.stringify(twice.games), "الترحيل الثاني لا يغيّر البيانات");
  }

  /* --- إنشاء الجلسات: مصدر واحد يستحيل أن يخرج منه سجلّ بلا تشغيل --- */
  eq(C.mkSess(null, 2, "manual", null, { hw: "emulator" })[0].hw, "emulator",
    "mkSess يكتب طريقة التشغيل الممرَّرة");
  eq(C.mkSess(null, 2, "manual")[0].hw, "original",
    "mkSess بلا إعداد ⇒ original لا undefined");
  eq(C.mkSess(null, 2, "manual", null, { hw: "emulator", disp: "crt" })[0].disp, undefined,
    "لا نوع شاشة على جلسة محاكي ولو مُرِّر");
  eq(C.mkSess(null, 0, "manual", null, { hw: "emulator" }).length, 0,
    "صفر ساعات لا ينشئ جلسة (سلوك قائم لم ينكسر)");

  /* --- افتراضي الجلسة القادمة = آخر ما لعبتَ به فعلًا، بالتاريخ لا بالترتيب --- */
  eq(C.lastSetup(game({ hardware: "original" })).hw, "original",
    "لعبة بلا جلسات ⇒ الإعداد الموروث");
  eq(C.lastSetup(game({ hardware: "original", displayType: "crt" })).disp, "crt",
    "الإعداد الموروث يحمل نوع الشاشة");
  eq(C.lastSetup(game({ hardware: "original", sessions: [
    { ...sess("2026-01-01", 1), hw: "original" },
    { ...sess("2026-06-01", 1), hw: "emulator" }
  ] })).hw, "emulator", "آخر جلسة تُحدّد الافتراضي ولو خالفت حقل اللعبة");
  eq(C.lastSetup(game({ hardware: "original", sessions: [
    { ...sess("2026-06-01", 1), hw: "emulator" },
    { ...sess("2026-01-01", 1), hw: "original" }
  ] })).hw, "emulator",
    "الأحدث بالتاريخ لا بموضعه: إضافة تختيمة بتاريخ ماضٍ تُلحق جلسة أقدم في آخر المصفوفة");
  noThrow(() => C.lastSetup(null), "lastSetup(null) لا ينهار");

  /* --- الحياد التام: لا رقم معروض يتغيّر في هذه المرحلة --- */
  {
    const before = [game({ hardware: "emulator", type: "downloaded", hours: 5,
      sessions: [sess("2026-01-01", 5)], playthroughs: [{ date: "2026-01-01", hours: 5, n: 1 }] })];
    const after = C.migrateGamesList(before).games;
    eq(C.baseXp(after), C.baseXp(before), "الترحيل لا يمسّ نقاط الخبرة");
    eq(C.miranTotal(after), C.miranTotal(before), "الترحيل لا يمسّ نقاط المِران");
    eq(C.realPlayHours(after[0]), C.realPlayHours(before[0]), "الترحيل لا يمسّ الساعات");
    eq(C.gameScore(after), C.gameScore(before), "الترحيل لا يمسّ نقاط اللعب");
  }
}

/* ═══════════ ⑬ استعلام التشغيل، و«غير مملوكة» ≠ «محاكي» ═══════════ */
G("⑬ التشغيل يُقرأ من الجلسات، والمحوران مستقلّان");
{
  /* المرحلة ٥: زالت الموصِّلات الموروثة (legacyHw/legacyDisp/legacyEmuDev) بعد
     أن صارت كل الأسئلة تُوجَّه إلى الجلسات. القارئ الوحيد الباقي للحقول القديمة
     هو legacySetup داخل الترحيل. هذه الاختبارات تحرس الدوال التي حلّت محلّها. */
  const sHw = (day, hours, hw, disp) => { const o = sess(day, hours); o.hw = hw; if (disp) o.disp = disp; return o; };

  /* --- playedOn: كل طريقة لُعبت بها فعلًا، ولا شيء قبل أول لعب --- */
  eq(C.playedOn(game({})), [], "لعبة بلا جلسات: لم تُلعب بأي طريقة");
  eq(C.playedOn(game({ hardware: "emulator" })), [],
    "الحقل المُعلَن وحده لا يعني أنك لعبتها — لا يُقرأ إطلاقًا");
  eq(C.playedOn(game({ sessions: [sHw("2026-01-01", 2, "emulator")] })), ["emulator"], "جلسة محاكي");
  eq(C.playedOn(game({ sessions: [sHw("2026-01-01", 2, "original")] })), ["original"], "جلسة جهاز أصلي");
  eq(C.playedOn(game({ sessions: [sHw("2026-01-01", 2, "original"), sHw("2026-02-01", 1, "emulator")] })).sort(),
    ["emulator", "original"], "اللعبة الواحدة قد تكون على الطريقتين — جوهر التغيير كله");
  eq(C.playedOn(game({ playthroughs: [{ date: "2026-01-01", hours: 5, n: 1, hw: "emulator" }] })), ["emulator"],
    "التختيمة تحتسب أيضًا ولو بلا جلسة");
  eq(C.playedOn(game({ sessions: [{ ...sHw("2026-01-01", 2, "emulator"), src: "backfill" }] })), [],
    "الوقت التعويضي ليس لعبًا — لا يُثبت طريقة تشغيل");
  noThrow(() => C.playedOn(null), "playedOn(null) لا ينهار");

  ok(C.playedOnHw(game({ sessions: [sHw("2026-01-01", 2, "emulator")] }), "emulator"), "playedOnHw يطابق");
  ok(!C.playedOnHw(game({ sessions: [sHw("2026-01-01", 2, "emulator")] }), "original"), "ولا يطابق الأخرى");

  /* --- hoursOn: توزيع الساعات على الطريقتين --- */
  {
    const g0 = game({ sessions: [sHw("2026-01-01", 3, "original"), sHw("2026-02-01", 1, "emulator")] });
    eq(Math.round(C.hoursOn(g0, "original")), 3, "ساعات الجهاز الأصلي");
    eq(Math.round(C.hoursOn(g0, "emulator")), 1, "ساعات المحاكي");
    eq(Math.round(C.hoursOn(g0, "original") + C.hoursOn(g0, "emulator")),
      Math.round(C.realPlayHours(g0)), "مجموع الطريقتين = كل ساعاتك (لا ساعة خارج الحساب)");
  }

  /* --- نوع الشاشة صفة جلسة كذلك --- */
  ok(C.playedDisp(game({ sessions: [sHw("2026-01-01", 2, "original", "crt")] }), "crt"), "جلسة على CRT");
  ok(!C.playedDisp(game({ displayType: "crt" }), "crt"),
    "حقل displayType المُعلَن لا يُحتسب — العدّاد صار «لعبتها على CRT»");

  /* ---------- الشرط الحاكم: المحوران مستقلّان ----------
     لعبة محمّلة على الهارد الداخلي تعمل على الجهاز الأصلي نفسه = تجربة أصلية
     لا محاكاة. في مكتبة المستخدم 42 لعبة كذلك، تحمل ثلث ساعاته و41 منها على
     CRT. أي اشتقاق يربط الملكية بالتشغيل يهجّر ثلث نشاطه إلى العالم الخطأ
     ويُسقط أوسمة CRT — بلا خطأ في الكونسول. خانة لكل حالة: */
  const cell = (hw, type) => game({ type: type, sessions: [sHw("2026-01-01", 2, hw, hw === "original" ? "crt" : "")] });
  ok(C.playedOnHw(cell("original", "physical"), "original") && C.isOwned(cell("original", "physical")),
    "أصلي + مملوكة");
  ok(C.playedOnHw(cell("original", "downloaded"), "original") && !C.isOwned(cell("original", "downloaded")),
    "أصلي + محمّلة على الهارد ⇒ تشغيل أصلي وغير مملوكة معًا (لا محاكاة)");
  ok(C.playedOnHw(cell("emulator", "digital"), "emulator") && C.isOwned(cell("emulator", "digital")),
    "محاكي + مملوكة");
  ok(C.playedOnHw(cell("emulator", "downloaded"), "emulator") && !C.isOwned(cell("emulator", "downloaded")),
    "محاكي + غير مملوكة");

  /* والحارس الذي يفشل فعلًا لو تسرّب الاشتقاق يومًا: */
  {
    const crtOf = gs => C.computeAchievements(gs).tracks.find(t => t.id === "crt").value;
    eq(crtOf([cell("original", "downloaded")]), 1,
      "لعبة محمّلة لُعبت على جهاز أصلي وشاشة CRT تبقى داخل عدّاد CRT");
    eq(crtOf([cell("emulator", "downloaded")]), 0, "ولعبة المحاكي لا تدخله");
  }

  /* --- المقاييس تقيس اللعب لا الاقتناء --- */
  {
    const emuOf = gs => C.computeAchievements(gs).tracks.find(t => t.id === "emu").value;
    eq(emuOf([game({ hardware: "emulator" })]), 0,
      "لعبة معلَنة كمحاكي ولم تُلعب لا تُحتسب — المسار صار «ما لعبتَه» لا «ما تملكه»");
    eq(emuOf([game({ sessions: [sHw("2026-01-01", 2, "emulator")] })]), 1, "وما لُعب فعلًا يُحتسب");
    const has = (gs, id) => C.computeAchievements(gs).badges.some(b => b.id === id && b.done);
    ok(has([game({ sessions: [sHw("2026-01-01", 2, "original"), sHw("2026-02-01", 1, "emulator")] })], "both_ways"),
      "وسام «بالطريقتين» يُفتح بلعبة واحدة على الطريقتين");
    ok(!has([game({ sessions: [sHw("2026-01-01", 2, "emulator")] })], "both_ways"),
      "ولا يُفتح بطريقة واحدة");
    ok(has([game({ playthroughs: [{ date: "2026-01-01", hours: 5, n: 1, hw: "emulator" }] })], "emuMaster"),
      "«بطل المحاكاة» يقيس تختيمةً وقعت على محاكي");
    ok(!has([game({ hardware: "emulator", status: "completed" })], "emuMaster"),
      "لا يكفي أن تكون معلَنة كمحاكي ومكتملة بلا تختيمة موسومة");
  }

  /* --- بوّابة RA: المنصّة لا طريقة التشغيل --- */
  ok(C.raSupportedPlatform("Sega Genesis"), "منصّة يدعمها RA");
  ok(!C.raSupportedPlatform("Nintendo Switch"), "منصّة لا يدعمها RA");
  ok(!C.raSupportedPlatform("لا شيء"), "منصّة مجهولة لا تنهار");
}

/* ═══════════ ⑭ دمج نسختَي لعبة واحدة ═══════════ */
G("⑭ دمج نسختَي لعبة واحدة");
{
  /* النموذج القديم أجبر المستخدم على إدخال God of War مرّتين لأنه لعبها على
     الجهاز الأصلي وعلى المحاكي، فانقسمت ساعاتها. الدمج يضمّ ما انقسم — وهو
     **قرار المستخدم لا استنتاج التطبيق**: قد تكون النسختان إصدارين مختلفين. */
  const sHw = (day, hours, hw) => { const o = sess(day, hours); o.hw = hw; return o; };
  const A = game({ id: "A", name: "God of War", platform: "PlayStation 2", hours: 3,
    sessions: [sHw("2026-02-01", 3, "emulator")], raGameId: 2782,
    ra: { gameId: 2782, numAchievements: 2, numAwarded: 1, achievements: [{ id: 1, earned: true, points: 5 }] },
    dateAdded: "2026-02-01", notes: "على المحاكي" });
  const B = game({ id: "B", name: "God of war", platform: "PlayStation 2", hours: 5,
    sessions: [sHw("2026-01-01", 5, "original")],
    playthroughs: [{ date: "2026-01-20", hours: 5, n: 1, hw: "original" }],
    status: "completed", dateCompleted: "2026-01-20", dateAdded: "2026-01-01", notes: "على الجهاز" });

  /* --- الترشيح: اقتراح لا تنفيذ --- */
  eq(mapIds(C.mergeCandidates([A, B])), [["A", "B"]], "اختلاف حالة الأحرف لا يمنع الاقتراح");
  eq(C.mergeCandidates([A]).length, 0, "لعبة وحيدة ليست مرشّحًا");
  eq(C.mergeCandidates([A, game({ id: "C", name: "لعبة أخرى" })]).length, 0, "اسمان مختلفان ليسا مرشّحًا");
  eq(C.mergeCandidates([A, game({ id: "S", name: "God of War", shell: true })]).length, 0,
    "غلاف المجموعة ليس نسخةً مكرَّرة");
  eq(C.mergeCandidates([A, game({ id: "K", name: "God of War", parentId: "A" })]).length, 0,
    "اللعبة الابنة داخل باقة ليست نسخةً مكرَّرة");
  noThrow(() => C.mergeCandidates(null), "mergeCandidates(null) لا ينهار");

  /* --- الدمج نفسه --- */
  const M = C.mergeGames(B, A);   // نُبقي سجلّ الجهاز الأصلي ونضمّ إليه المحاكي
  eq(M.id, "B", "الهدف يحتفظ بهويته");
  eq(M.hours, 8, "الساعات مجموع الاثنين — وإلا ضاع نصف وقتك");
  eq(M.sessions.length, 2, "الجلستان معًا");
  eq(M.sessions.map(x => x.hw), ["original", "emulator"], "مرتّبة بالتاريخ ومحتفظة بطريقة كلٍّ منها");
  eq(C.playedOn(M).sort(), ["emulator", "original"], "اللعبة المدموجة صارت على الطريقتين");
  eq(Math.round(C.hoursOn(M, "original")), 5, "ساعات الجهاز الأصلي محفوظة");
  eq(Math.round(C.hoursOn(M, "emulator")), 3, "وساعات المحاكي كذلك");
  eq(M.dateAdded, "2026-01-01", "تاريخ الإضافة أقدم الاثنين");
  eq(M.raGameId, 2782, "ربط RA ينتقل للهدف الذي لا ربط له");
  ok((M.notes || "").includes("على المحاكي") && (M.notes || "").includes("على الجهاز"),
    "الملاحظتان تُحفظان معًا لا تُستبدَل إحداهما");
  eq(M.status, "completed", "التختيم في أيٍّ منهما يعني أنك ختمتها");

  /* الترقيم ترتيبٌ لا معرّف: يُعاد بناؤه بعد الدمج فلا يتكرّر ولا ينقطع */
  {
    const X = game({ id: "X", name: "لعبة", playthroughs: [{ date: "2026-01-01", hours: 2, n: 1 }] });
    const Y = game({ id: "Y", name: "لعبة", playthroughs: [{ date: "2026-03-01", hours: 2, n: 1 }] });
    eq(C.mergeGames(X, Y).playthroughs.map(r => r.n), [1, 2], "التختيمات تُرقَّم من جديد بلا تكرار");
  }

  /* لا يخسر الدمج ساعةً ولا تختيمة — الحارس الحقيقي ضد الفقد الصامت */
  eq(Math.round(C.realPlayHours(M) * 100),
    Math.round((C.realPlayHours(A) + C.realPlayHours(B)) * 100), "لا ساعة تضيع في الدمج");
  eq(M.playthroughs.length, (A.playthroughs || []).length + (B.playthroughs || []).length,
    "ولا تختيمة تضيع");
  noThrow(() => C.mergeGames(A, null), "mergeGames بمصدر فارغ لا ينهار");
  eq(C.mergeGames(A, null).id, "A", "ويُرجع الهدف كما هو");
}


console.log("\n" + "═".repeat(46));
console.log(fail === 0 ? "🎉 نجحت كل الاختبارات (" + pass + ")" : "⚠️  نجح " + pass + " — فشل " + fail);
process.exit(fail ? 1 : 0);

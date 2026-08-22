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

/* ═══════════ ⑧ عالما المكتبة (النطاق والرتب) ═══════════ */
G("⑧ عالما المكتبة");
{
  const orig = game({ id: "o", hardware: "original", type: "physical", hours: 5,
    sessions: [sess("2026-08-01", 5)], playthroughs: [{ date: "2026-08-01", hours: 5, n: 1 }] });
  const emu = game({ id: "e", hardware: "emulator", emuDevice: "pc", type: "downloaded", hours: 2,
    sessions: [sess("2026-08-02", 2)], playthroughs: [] });
  const both = [orig, emu];

  eq(C.scopeGames(both, "all").length, 2, "نطاق «الكل» يشمل العالمين");
  eq(C.scopeGames(both, "original").map(g => g.id), ["o"], "نطاق الأجهزة الأصلية يعزل ألعابه");
  eq(C.scopeGames(both, "emulator").map(g => g.id), ["e"], "نطاق المحاكاة يعزل ألعابه");
  eq(C.scopeGames(null, "original"), [], "نطاق على قائمة فارغة لا ينهار");
  ok(C.inScope(orig, "all") && C.inScope(orig, "original") && !C.inScope(orig, "emulator"),
    "inScope يفرّق بين العالمين");
  ok(!C.inScope(null, "original"), "inScope على قيمة فارغة يرجع false لا ينهار");

  /* الرتبتان مستقلّتان: لكل عالم سُلَّمه، ومقياسه هو نفس gameScore على ألعابه */
  const ro = C.worldRankOf(both, "original"), re = C.worldRankOf(both, "emulator");
  eq(ro.score, C.gameScore([orig]), "رتبة الأصلي تقيس ألعاب الأصلي وحدها");
  eq(re.score, C.gameScore([emu]), "رتبة المحاكي تقيس ألعاب المحاكي وحدها");
  ok(ro.name !== re.name || ro.score !== re.score, "السُلَّمان مختلفان فعلًا");
  ok(C.ORIGINAL_RANKS[0][1] !== C.EMULATOR_RANKS[0][1], "لكل عالم أسماء رتب خاصة به");

  /* المستوى الموحّد لا يتأثر بالنطاق — هوية واحدة (قرار المستخدم) */
  eq(C.totalXp(both), C.totalXp(C.scopeGames(both, "all")), "XP الكلي لا يتغيّر بنطاق «الكل»");
  ok(C.totalXp(both) > C.totalXp([orig]), "XP الكلي يشمل العالمين معًا");
}
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

/* ═══════════ ⑨ اتساق الإجمالي ═══════════ */
G("⑨ اتساق نقاط الخبرة الكلية");
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

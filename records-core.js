/* A snapshot is evidence, not a second scoring engine. Validate and whitelist
   its presentation fields before persistence; never merge it into local games
   or invent dated sessions from lifetime totals. Shared by browser and tests. */
(function(root) {
  "use strict";
  const MAX_BYTES = 10 * 1024 * 1024;
  const fail = () => { throw new Error("ملف اللقطة غير صالح أو أرقامه غير متسقة؛ لم تتغير بياناتك."); };
  function text(v, limit = 500) { if (typeof v !== "string" || v.length > limit) fail(); return v; }
  function number(v) { if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > Number.MAX_SAFE_INTEGER) fail(); return v; }
  function integer(v) { number(v); if (!Number.isSafeInteger(v)) fail(); return v; }
  function boolean(v) { if (typeof v !== "boolean") fail(); return v; }
  function day(v) { text(v); if (v !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v)) fail(); return v; }
  function timestamp(v) { text(v); if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(Date.parse(v))) fail(); return v; }
  function color(v) { if (!/^#[0-9a-f]{6}$/i.test(text(v))) fail(); return v; }
  function object(v, schema) {
    if (!v || typeof v !== "object" || Array.isArray(v)) fail();
    const clean = {};
    for (const [key, check] of Object.entries(schema)) {
      const optional = key.endsWith("?"); const field = optional ? key.slice(0, -1) : key;
      if (v[field] === undefined && optional) continue;
      clean[field] = check(v[field]);
    }
    return clean;
  }
  function rows(schema, max = 50000) { return v => {
    if (!Array.isArray(v) || v.length > max) fail();
    return v.map(row => object(row, schema));
  }; }
  const slot = rows({key:text, hours:number, sittings:integer, games:integer});
  const totalSchema = Object.fromEntries("hours datedHours undatedHours outsideHours clockHours clockSittings games played sittings days perPlayDay perSitting streak bestStreak".split(" ").map(k => [k, number]));
  Object.assign(totalSchema, {first:day, last:day, bestFrom:day, bestTo:day});
  const sum = (list, key) => list.reduce((s, row) => s + row[key], 0);
  const unique = (list, key) => { if (new Set(list.map(row => row[key])).size !== list.length) fail(); };
  function validate(input) {
    if (typeof input === "string") {
      if (new TextEncoder().encode(input).length > MAX_BYTES) fail();
      try { input = JSON.parse(input); } catch { fail(); }
    }
    if (!input || input.format !== "gaming-snapshot" || input.schemaVersion !== 1 || input.readOnly !== true) fail();
    const out = object(input, {
      format:text, schemaVersion:integer, readOnly:boolean, exportedAt:text, source:text,
      engineSha256:text,
      injaz:v => object(v, {
        rank:r => object(r, {points:integer, name:text, stars:integer, tier:integer}),
        totals:r => object(r, {awards:integer, points:integer, games:integer, hours:number, finishes:integer, raAwards:integer}),
        families:rows({key:text, name:text, icon:text, points:integer, awards:integer, share:number}, 7),
        materials:rows({tier:integer, name:text, hex:color, shape:text, pays:integer, awards:integer}, 5),
        awards:rows({key:text, name:text, shortName:text, family:text, familyName:text, icon:text, tier:integer, material:text, hex:color, shape:text, points:integer, "rarity?":integer, "scaleSource?":text, "game?":text, "gameId?":text, "date?":timestamp})
      }),
      stats:v => object(v, {
        totals:r => object(r, totalSchema),
        ...Object.fromEntries("years months weekdays hours24 devices families genres decades sources".split(" ").map(k => [k, slot])),
        top:rows({id:text, name:text, hours:number, sittings:integer})
      }),
      games:rows({id:text, name:text, platform:text, family:text, hours:number, sittings:integer, beats:integer, days:integer, "lastPlayed?":day, "lastPlayedExact?":boolean, "year?":integer, "genre?":text, "status?":text, "endless?":boolean}),
      days:rows({d:day, h:number, n:integer, "g?":integer})
    });
    if (!/^\d{4}-\d{2}-\d{2}T/.test(out.exportedAt) || !Number.isFinite(Date.parse(out.exportedAt)) || !/^[0-9a-f]{64}$/i.test(out.engineSha256)) fail();
    const i = out.injaz, points = i.totals.points;
    unique(i.awards, "key"); unique(i.families, "key"); unique(i.materials, "tier"); unique(out.games, "id"); unique(out.days, "d");
    if (i.rank.stars > 5 || i.rank.points !== points || sum(i.awards, "points") !== points || i.totals.awards !== i.awards.length) fail();
    if (sum(i.families,"points") !== points || sum(i.families,"awards") !== i.awards.length || sum(i.materials,"awards") !== i.awards.length) fail();
    for (const a of i.awards) if (!i.families.some(f => f.key === a.family) || !i.materials.some(m => m.tier === a.tier)) fail();
    if (Math.abs(i.totals.hours - out.stats.totals.hours) > 0.11) fail();
    return out;
  }
  const api = Object.freeze({validate, MAX_BYTES});
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GamingSnapshot = api;
})(globalThis);

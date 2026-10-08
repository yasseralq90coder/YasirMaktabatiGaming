/* Contract tests: precise dates, source totals, safe imports and SW isolation. */
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const {validate,MAX_BYTES} = require("../records-core.js"), fixture = require("./snapshot-fixture.cjs");
let passed = 0;
function test(name,run) { run(); passed++; console.log("PASS",name); }
const rejects = mutate => { const data=fixture(); mutate(data); assert.throws(()=>validate(data)); };
test("valid independent snapshot",()=>assert.equal(validate(fixture()).injaz.rank.points,10));
test("JSON string input",()=>assert.equal(validate(JSON.stringify(fixture())).games.length,1));
test("raw profile rejected",()=>assert.throws(()=>validate({games:[]})));
test("unknown format rejected",()=>rejects(d=>d.format="profile"));
test("future schema rejected",()=>rejects(d=>d.schemaVersion=2));
test("mutable profile rejected",()=>rejects(d=>d.readOnly=false));
test("unknown fields stripped at each depth",()=>{
  const d=fixture();d.misc={steamkey:"DO-NOT-COPY"};d.games[0].note="PRIVATE";d.injaz.goals=["PRIVATE"];
  const clean=validate(d);assert(!("misc" in clean));assert(!("note" in clean.games[0]));assert(!("goals" in clean.injaz));
});
test("does not mutate input",()=>{const d=fixture(),copy=JSON.stringify(d);validate(d);assert.equal(JSON.stringify(d),copy);});
test("unknown lifetime hours never become days",()=>{const d=validate(fixture());assert.equal(d.days.length,1);assert.equal(d.days[0].h,2);assert.equal(d.stats.totals.undatedHours,8);});
test("invalid JSON rejected",()=>assert.throws(()=>validate("{")));
test("oversized JSON rejected",()=>assert.throws(()=>validate(" ".repeat(MAX_BYTES+1))));
test("negative hours rejected",()=>rejects(d=>d.games[0].hours=-1));
test("NaN rejected",()=>rejects(d=>d.stats.totals.hours=NaN));
test("string numbers rejected",()=>rejects(d=>d.games[0].hours="10"));
test("duplicate awards rejected",()=>rejects(d=>d.injaz.awards.push(d.injaz.awards[0])));
test("duplicate games rejected",()=>rejects(d=>d.games.push(d.games[0])));
test("duplicate dates rejected",()=>rejects(d=>d.days.push(d.days[0])));
test("invalid calendar day rejected",()=>rejects(d=>d.days[0].d="2026-02-30"));
test("invalid timestamp rejected",()=>rejects(d=>d.injaz.awards[0].date="today"));
test(".NET seven-digit timestamps retained",()=>assert.equal(validate(fixture()).injaz.awards[0].date,"2026-08-01T12:00:00.0000000Z"));
test("rank cannot disagree",()=>rejects(d=>d.injaz.rank.points=11));
test("award payouts reconcile",()=>rejects(d=>d.injaz.awards[0].points=11));
test("family totals reconcile",()=>rejects(d=>d.injaz.families[0].points=9));
test("material counts reconcile",()=>rejects(d=>d.injaz.materials[0].awards=2));
test("unknown family rejected",()=>rejects(d=>d.injaz.awards[0].family="invented"));
test("malformed CSS colors rejected",()=>rejects(d=>d.injaz.awards[0].hex="url(https://example.com)"));
test("engine totals cannot drift",()=>rejects(d=>d.stats.totals.hours=11));
test("rounding tolerance accepts original engine output",()=>{const d=fixture();d.stats.totals.hours=10.1;validate(d);});
test("legacy material points field is not treated as money",()=>{const d=fixture();d.injaz.materials[0].points=1;assert(!("points" in validate(d).injaz.materials[0]));});
const handlers={}, scope="https://example.com/repo/";
vm.runInNewContext(fs.readFileSync(require.resolve("../sw.js"),"utf8"),{
  self:{registration:{scope},location:{origin:"https://example.com"},addEventListener:(type,fn)=>{handlers[type]=fn;}},
  URL,Response,Request,setTimeout,clearTimeout,indexedDB:{open:()=>{throw new Error("test");}}
});
test("SW ignores external provider requests",()=>{let handled=false;handlers.fetch({request:new Request("https://provider.test/games"),respondWith(){handled=true;}});assert.equal(handled,false);});
test("SW ignores authorization headers",()=>{let handled=false;handlers.fetch({request:new Request(scope+"records.html",{headers:{Authorization:"test"}}),respondWith(){handled=true;}});assert.equal(handled,false);});
test("SW ignores private snapshot paths",()=>{let handled=false;handlers.fetch({request:new Request(scope+"private.json"),respondWith(){handled=true;}});assert.equal(handled,false);});
if(process.argv[2])test("real snapshot validates without exposing contents",()=>validate(fs.readFileSync(process.argv[2],"utf8")));
console.log(`${passed} snapshot/security checks passed.`);

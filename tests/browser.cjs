/* Integration test in an isolated headless Edge profile. Uses an EXISTING
   Playwright installation; no browser download, user profile, or remote data.
   Optional argv[2] is a private local snapshot; never served by the HTTP server. */
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fixture=require("./snapshot-fixture.cjs"),root=path.resolve(__dirname,"..");
const real=process.argv[2] ? fs.readFileSync(process.argv[2],"utf8") : JSON.stringify(fixture());
const validated=require("../records-core.js").validate(real);
const allowed=new Set(["/records.html","/records.css","/records-core.js","/records-crypto.js","/records.js","/sw.js","/index.html","/manifest.json","/icon.svg","/icon-192.png","/icon-512.png","/games_db.js","/vendor/react.production.min.js","/vendor/react-dom.production.min.js","/data/snapshot.enc.json","/"]);
const testPassword="Test-only cloud fern river 47!";
let publishedCipher;
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");if(!allowed.has(url.pathname)){res.writeHead(404).end();return;}
  if(url.pathname==="/data/snapshot.enc.json"){res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(publishedCipher));return;}
  const file=path.join(root,url.pathname==="/"?"index.html":url.pathname);
  res.writeHead(200,{"Content-Type":types[path.extname(file)],"Cache-Control":"no-cache"});fs.createReadStream(file).pipe(res);
});
(async()=>{
  publishedCipher=await require("../records-crypto.js").encrypt(fixture(),testPassword);
  await new Promise(r=>server.listen(0,"127.0.0.1",r));let browser;
  try{
    browser=await chromium.launch({channel:"msedge",headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],external=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("request",r=>{if(!r.url().startsWith("http://127.0.0.1:")&&!r.url().startsWith("data:"))external.push(r.url());});
    const base=`http://127.0.0.1:${server.address().port}`;
    await page.goto(base+"/records.html");await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>navigator.serviceWorker.controller);
    assert(await page.locator("#empty").isVisible());
    await page.locator("#vault-password").fill(testPassword);await page.locator("#vault-confirm").fill(testPassword);
    const upload=content=>page.locator("#snapshot-file").setInputFiles({name:"gaming-snapshot.json",mimeType:"application/json",buffer:Buffer.from(content)});
    await upload(real);await page.locator("#preview").waitFor({state:"visible"});
    assert(await page.locator("#empty").isVisible(),"preview must not import");
    await page.locator("#cancel").click();assert(await page.locator("#empty").isVisible());
    await upload(real);await page.locator("#preview").waitFor({state:"visible"});await page.locator("#confirm").click();
    await page.locator("#content").waitFor({state:"visible"});
    assert((await page.locator("#headline").innerText()).includes(validated.injaz.rank.name));
    const unlock=async()=>{await page.locator("#vault-password").fill(testPassword);await page.locator("#unlock").click();await page.locator("#content").waitFor({state:"visible"});};
    await page.reload();assert(await page.locator("#content").isHidden());
    await page.locator("#vault-password").fill("Wrong-only tree river lake 98!");await page.locator("#unlock").click();
    await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("غير صحيحة"));
    assert(await page.locator("#content").isHidden());await unlock();
    const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{
      const r=indexedDB.open("gamelib-encrypted-snapshots",1);
      r.onsuccess=()=>{const db=r.result,t=db.transaction("snapshots","readonly"),q=t.objectStore("snapshots").getAll();t.oncomplete=()=>{db.close();resolve(q.result);};t.onerror=()=>reject(Error("read"));};
    }));
    assert.equal(stored[0].format,"gaming-encrypted");assert(!JSON.stringify(stored).includes(validated.games[0].name));assert(!JSON.stringify(stored).includes(testPassword));
    const original=await page.locator("#headline").innerText();
    await page.locator("#fetch-encrypted").click();await page.locator("#preview").waitFor({state:"visible"});await page.locator("#cancel").click();
    await upload('{"games":[]}');await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("غير صالح"));
    assert.equal(await page.locator("#headline").innerText(),original);
    await page.locator('[data-tab="awards"]').click();assert(await page.locator(".award").count()>0);
    await page.locator("#award-search").fill("zz-no-result-zz");assert.equal(await page.locator(".award").count(),0);
    await page.locator('[data-tab="library"]').click();assert(await page.locator("#game-list tr").count()>0);
    await page.locator("#game-search").fill("zz-no-result-zz");assert.equal(await page.locator("#game-list tr").count(),0);
    await page.locator('[data-tab="overview"]').click();
    const second=fixture();second.exportedAt="2026-10-09T00:00:00Z";
    second.games[0].name='<img src=x onerror="alert(1)">';
    await upload(JSON.stringify(second));await page.locator("#preview").waitFor({state:"visible"});await page.locator("#confirm").click();
    await page.waitForFunction(()=>!document.querySelector("#undo").disabled);
    await page.locator("#undo").click();await page.locator("#preview").waitFor({state:"visible"});await page.locator("#confirm").click();
    await page.waitForFunction(()=>document.querySelector("#preview").hidden);
    assert.equal(await page.locator("#headline").innerText(),original);
    await page.locator("#lock").click();assert(await page.locator("#content").isHidden());assert.equal(await page.locator("#headline").innerText(),"");assert.equal(await page.locator("#vault-password").inputValue(),"");await unlock();
    await context.setOffline(true);await page.reload();await unlock();
    assert.equal(await page.locator("#headline").innerText(),original,"offline snapshot survives reload");
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"no mobile overflow");
    if(process.env.PREVIEW_PNG)await page.screenshot({path:process.env.PREVIEW_PNG,fullPage:false});
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log("PASS browser: encrypted storage, wrong-password refusal, lock clears view, ciphertext fetch/preview, import/cancel/restore, offline unlock, filters, mobile width, no external requests or JS errors.");
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

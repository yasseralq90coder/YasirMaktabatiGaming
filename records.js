/* Read-only, offline snapshot UI. Never contact a provider or the desktop.
   Import is preview -> explicit approval -> atomic IndexedDB replacement with
   one previous generation. A failed import leaves both old libraries intact. */
"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat("ar-SA", {maximumFractionDigits:1}).format(n);
  const when = s => new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {dateStyle:"medium",timeStyle:"short"}).format(new Date(s));
  const message = s => { $("message").textContent = s; };
  let current = null, previous = null, pending = null, busy = false, awardLimit = 60, gameLimit = 100;
  let sessionPassword = "", encryptedCurrent = null, encryptedPrevious = null, lockVersion = 0, idleTimer;
  function el(tag, value, className) {
    const node = document.createElement(tag);
    if (value !== undefined && value !== null) node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function openDb() {
    return new Promise((resolve,reject) => {
      const req = indexedDB.open("gamelib-encrypted-snapshots", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("snapshots");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error("تعذّر فتح التخزين المحلي."));
      req.onblocked = () => reject(new Error("أغلق تبويبات السجل الأخرى ثم أعد المحاولة."));
    });
  }
  async function loadStored() {
    const db = await openDb();
    return new Promise((resolve,reject) => {
      const tx = db.transaction("snapshots","readonly"), store = tx.objectStore("snapshots");
      const a = store.get("current"), b = store.get("previous");
      tx.oncomplete = () => { db.close(); resolve([a.result,b.result]); };
      tx.onabort = tx.onerror = () => { db.close(); reject(new Error("تعذّرت قراءة اللقطة المحفوظة.")); };
    });
  }
  async function save(next) {
    // This assertion is at the persistence boundary: plaintext is never allowed.
    next = GamingCrypto.envelope(next);
    const db = await openDb();
    // Read the prior generation INSIDE this transaction, not from a stale tab.
    return new Promise((resolve,reject) => {
      const tx = db.transaction("snapshots","readwrite"), store = tx.objectStore("snapshots");
      let old;
      const request = store.get("current");
      request.onsuccess = () => {
        old = request.result;
        if (old) store.put(old, "previous");
        store.put(next, "current");
      };
      tx.oncomplete = () => { db.close(); resolve(old); };
      tx.onabort = tx.onerror = () => { db.close(); reject(new Error("لم تُحفظ اللقطة. قد تكون مساحة التخزين ممتلئة؛ البيانات السابقة باقية.")); };
    });
  }
  function options(id, values, all) {
    const select = $(id); select.replaceChildren();
    if (all) { const option = el("option",all); option.value = ""; select.append(option); }
    for (const [value,label] of values) { const option = el("option",label); option.value = value; select.append(option); }
  }
  function bars(id, rows, unit = "ساعة") {
    const target = $(id); target.replaceChildren();
    if (!rows.length) { target.append(el("p","لا تتوفر بيانات موثّقة لهذا التوزيع.")); return; }
    const max = Math.max(1,...rows.map(r => r.value));
    for (const row of rows) {
      const item = el("div",null,"bar-row"), label = el("div",null,"bar-label");
      label.append(el("span",row.label),el("small",`${fmt(row.value)} ${unit}`));
      const bar = el("progress"); bar.max = max; bar.value = row.value;
      bar.setAttribute("aria-label",`${row.label}: ${fmt(row.value)} ${unit}`);
      item.append(label,bar); target.append(item);
    }
  }
  const slots = rows => rows.map(r => ({label:r.key,value:r.hours}));
  function renderTime() {
    const year = $("year-filter").value;
    bars("months",slots(current.stats.months.filter(m => m.key.startsWith(year)).sort((a,b)=>a.key.localeCompare(b.key))));
    $("calendar").replaceChildren();
    const days = current.days.filter(d => d.d.startsWith(year)).sort((a,b)=>a.d.localeCompare(b.d));
    for (const d of days) {
      const button = el("button",d.d.slice(5),"day");
      const label = `${d.d} • ${fmt(d.h)} ساعة • ${fmt(d.n)} جلسة`;
      button.title = label; button.setAttribute("aria-label",label);
      button.dataset.level = String(d.h >= 4 ? 4 : d.h >= 2 ? 3 : d.h >= 1 ? 2 : 1);
      button.onclick = () => message(label);
      $("calendar").append(button);
    }
    if (!days.length) $("calendar").append(el("p","لا توجد أيام دقيقة في هذه السنة."));
  }
  function renderAwards() {
    const query = $("award-search").value.trim().toLocaleLowerCase(), family = $("family-filter").value;
    const rows = current.injaz.awards.filter(a => (!family || a.family === family) && (!query || `${a.name} ${a.game || ""}`.toLocaleLowerCase().includes(query)));
    $("award-count").textContent = `${fmt(rows.length)} إنجاز — النقاط والتواريخ كما حسبها المحرّك عند التصدير`;
    $("award-list").replaceChildren();
    const shapes = {disc:"●",shield:"⬟",cup:"🏆",cup2:"♜",crown:"♛"};
    for (const a of rows.slice(0,awardLimit)) {
      const card = el("article",null,"award"), medal = el("div",`${shapes[a.shape] || "◇"} ${a.material}`,"medal");
      medal.style.color = a.hex;
      card.append(medal,el("strong",a.shortName),el("p",a.game || a.familyName),el("strong",`${fmt(a.points)} نقطة`));
      if (a.rarity) card.append(el("p",`الندرة: ${fmt(a.rarity)} لعبة تحمل هذا الإنجاز`));
      if (a.scaleSource) card.append(el("p",`مصدر المقياس: ${a.scaleSource}`));
      card.append(el("small",a.date ? when(a.date) : "تاريخ الاستحقاق غير معروف"));
      $("award-list").append(card);
    }
    $("more-awards").hidden = rows.length <= awardLimit;
  }
  function renderGames() {
    const query = $("game-search").value.trim().toLocaleLowerCase(), platform = $("platform-filter").value;
    const rows = current.games.filter(g => (!platform || g.platform === platform) && (!query || g.name.toLocaleLowerCase().includes(query))).sort((a,b)=>b.hours-a.hours || a.name.localeCompare(b.name));
    $("game-count").textContent = `${fmt(rows.length)} لعبة — مرتبة حسب الوقت`;
    $("game-list").replaceChildren();
    for (const g of rows.slice(0,gameLimit)) {
      const row = el("tr");
      for (const value of [g.name,g.platform,fmt(g.hours),fmt(g.beats),g.lastPlayed ? `${g.lastPlayed}${g.lastPlayedExact ? "" : " (غير دقيق)"}` : "غير معروف"]) row.append(el("td",value));
      $("game-list").append(row);
    }
    $("more-games").hidden = rows.length <= gameLimit;
  }
  function render() {
    $("empty").hidden = !!current; $("content").hidden = !current;
    $("export").disabled = !current; $("undo").disabled = !previous;
    if (!current) return;
    $("lockbox").hidden = true; $("lock").hidden = false;
    const {injaz:i,stats:s} = current, t = s.totals;
    $("stamp").textContent = `لقطة ثابتة: ${when(current.exportedAt)} • آخر يوم لعب موثّق: ${t.last || "غير معروف"} • ليست مزامنة حيّة`;
    $("headline").replaceChildren();
    const rank = el("div"), points = el("div",null,"points");
    rank.append(el("span","إنجاز • رتبتك"),el("strong",`${i.rank.name} ${"★".repeat(i.rank.stars)}`),el("span",`${fmt(i.totals.awards)} إنجاز مستحق`));
    points.append(el("span","رصيد النقاط"),el("strong",fmt(i.totals.points)));
    $("headline").append(rank,points);
    $("metrics").replaceChildren();
    for (const [value,label] of [[t.hours,"ساعة في السجل"],[t.played,"لعبة لها وقت"],[i.totals.finishes,"تختيمة يدوية"],[t.days,"يوم لعب موثّق"]]) {
      const card = el("div",null,"metric"); card.append(el("strong",fmt(value)),el("span",label)); $("metrics").append(card);
    }
    bars("precision",[{label:"مؤرّخة",value:t.datedHours},{label:"غير مؤرّخة",value:t.undatedHours},{label:"خارج تفاصيل الجلسات",value:t.outsideHours}]);
    const sourceNames = {xbox:"Xbox",psn:"PlayStation",steam:"Steam",nintendo:"Nintendo",manual:"تسجيل يدوي",yasirxcenter:"تسجيل الكمبيوتر",library:"المكتبة",thor:"Thor",other:"مصادر أخرى","nintendo-history":"تاريخ Nintendo"};
    bars("sources",s.sources.map(r=>({label:sourceNames[r.key] || r.key,value:r.hours}))); bars("years",slots(s.years)); bars("devices",slots(s.devices));
    bars("top",s.top.slice(0,10).map(g=>({label:g.name,value:g.hours})));
    const weekdays = ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
    bars("weekdays",s.weekdays.map(r=>({label:weekdays[Number(r.key)] || r.key,value:r.hours})));
    $("habits").replaceChildren();
    for (const line of [`أطول سلسلة: ${fmt(t.bestStreak)} يومًا`, `متوسط اليوم النشط: ${fmt(t.perPlayDay)} ساعة`, `متوسط الجلسة: ${fmt(t.perSitting)} ساعة`, `ساعات ذات توقيت دقيق: ${fmt(t.clockHours)} ساعة`]) $("habits").append(el("p",line));
    const years = [...new Set([...s.months.map(m=>m.key.slice(0,4)),...current.days.map(d=>d.d.slice(0,4))])].sort().reverse();
    options("year-filter",years.map(y=>[y,y])); renderTime();
    bars("families",i.families.map(f=>({label:`${f.icon} ${f.name}`,value:f.points})),"نقطة");
    bars("materials",i.materials.map(m=>({label:m.name,value:m.awards})),"إنجاز");
    options("family-filter",i.families.map(f=>[f.key,f.name]),"كل العائلات");
    options("platform-filter",[...new Set(current.games.map(g=>g.platform))].sort().map(p=>[p,p]),"كل المنصات");
    awardLimit = 60; gameLimit = 100; renderAwards(); renderGames();
  }
  function preview(next, restoring = false) {
    pending = next;
    const older = current && Date.parse(next.exportedAt) < Date.parse(current.exportedAt);
    $("preview-text").textContent = `${restoring ? "استعادة السابقة — " : ""}${when(next.exportedAt)} • ${fmt(next.games.length)} لعبة • ${fmt(next.stats.totals.hours)} ساعة • ${fmt(next.injaz.totals.points)} نقطة • ${next.injaz.rank.name}${older ? " — تنبيه: هذه اللقطة أقدم من الحالية." : ""}`;
    $("preview").hidden = false; $("confirm").focus();
  }
  function password(confirmNew = false) {
    const value = sessionPassword || $("vault-password").value;
    GamingCrypto.passphrase(value);
    if (confirmNew && !sessionPassword && !current && value !== $("vault-confirm").value) throw new Error("أعد كتابة عبارة المرور نفسها في حقل التأكيد قبل تشفير ملف جديد.");
    return value;
  }
  function remember(value) {
    sessionPassword = value;
    $("vault-password").value = ""; $("vault-confirm").value = "";
    $("lockbox").hidden = true; $("lock").hidden = false;
    touch();
  }
  function lock() {
    lockVersion++;
    current = previous = pending = null; sessionPassword = "";
    $("vault-password").value = ""; $("vault-confirm").value = "";
    $("preview").hidden = true; $("preview-text").textContent = "";
    for (const id of ["headline","metrics","precision","sources","years","devices","months","calendar","top","habits","weekdays","families","materials","award-list","game-list","award-count","game-count","year-filter","family-filter","platform-filter"]) $(id).replaceChildren();
    $("game-search").value = ""; $("award-search").value = "";
    $("stamp").textContent = "السجل مقفل. النسخة المحفوظة مشفّرة.";
    render(); $("lockbox").hidden = false; $("lock").hidden = true;
    clearTimeout(idleTimer); message("قُفل السجل، ولا توجد كلمة مرور محفوظة.");
  }
  function touch() { clearTimeout(idleTimer); if(sessionPassword) idleTimer = setTimeout(lock,15*60*1000); }
  for(const event of ["pointerdown","keydown"]) document.addEventListener(event,touch,{passive:true});
  window.addEventListener("pagehide",lock);
  $("lock").onclick = lock;
  $("unlock").onclick = async () => {
    if(busy)return; busy=true; const version=lockVersion;
    try {
      const pass=password();
      const [a,b]=await loadStored();
      if(!a)throw new Error("لا توجد لقطة مشفّرة محفوظة بعد. اختر ملف اللقطة أو اجلب النسخة المشفّرة من الموقع.");
      const next=await GamingCrypto.decrypt(a,pass);
      let prev=null; if(b){try{prev=await GamingCrypto.decrypt(b,pass);}catch{}}
      if(version!==lockVersion)return;
      encryptedCurrent=GamingCrypto.envelope(a);encryptedPrevious=b?GamingCrypto.envelope(b):null;
      current=next;previous=prev;remember(pass);render();message("فُتح السجل محليًا. كلمة المرور لا تغادر المتصفح.");
    }catch(e){message(e.message);}finally{busy=false;}
  };
  $("vault-password").addEventListener("keydown",e=>{if(e.key==="Enter")$("unlock").click();});
  $("fetch-encrypted").onclick = async () => {
    if(busy)return;busy=true;const version=lockVersion;
    try {
      const pass=password();
      const response=await fetch("./data/snapshot.enc.json",{cache:"no-store",credentials:"omit",redirect:"error",signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(response.status===404?"لم تُنشر لقطة مشفّرة على الموقع بعد.":"تعذّر جلب اللقطة؛ لم تتغير نسختك.");
      if(Number(response.headers.get("content-length"))>16*1024*1024)throw new Error("ملف أكبر من الحد المسموح.");
      const next=await GamingCrypto.decrypt(await response.text(),pass);
      if(version!==lockVersion)return;
      remember(pass);preview(next);message("فُتحت النسخة المنشورة؛ راجع تاريخها قبل اعتمادها محليًا.");
    }catch(e){message(e.message);}finally{busy=false;}
  };
  $("snapshot-file").onchange = async event => {
    const file = event.target.files[0]; if (!file || busy) return;
    busy = true; pending = null; $("preview").hidden = true; const version=lockVersion;
    try {
      if (file.size > 16*1024*1024) throw new Error("الملف أكبر من الحد المسموح.");
      let value; try { value=JSON.parse(await file.text()); } catch { throw new Error("ملف JSON غير صالح."); }
      const encrypted=value?.format==="gaming-encrypted",pass=password(!encrypted);
      const next=encrypted?await GamingCrypto.decrypt(value,pass):GamingSnapshot.validate(value);
      if(version!==lockVersion)return;
      remember(pass);preview(next); message("تم فحص اللقطة. ستُحفظ مشفّرة بعد اعتماد المعاينة.");
    } catch(e) { message(e.message); }
    finally { busy = false; event.target.value = ""; }
  };
  $("confirm").onclick = async () => {
    if (!pending || busy) return;
    busy = true; $("confirm").disabled = true;
    const next = pending, pass=sessionPassword, version=lockVersion;
    try {
      const sealed = await GamingCrypto.encrypt(next,pass);
      if(version!==lockVersion)return;
      const old = await save(sealed);
      encryptedCurrent=sealed;encryptedPrevious=old || null;
      if(version!==lockVersion)return;
      let prior = null;
      // A corrupt previous generation is retained on disk, but cannot turn a
      // successful commit into an apparent failure after the transaction ended.
      if (old) { try { prior = await GamingCrypto.decrypt(old,pass); } catch {} }
      if(version!==lockVersion)return;
      previous=prior;
      current = next; pending = null; $("preview").hidden = true; render();
      message("حُفظت اللقطة مشفّرة محليًا. لم تُرسل بيانات ولم تتغير المكتبة القديمة.");
    } catch(e) { message(e.message); }
    finally { busy = false; $("confirm").disabled = false; }
  };
  $("cancel").onclick = () => { if (busy) return; pending = null; $("preview").hidden = true; message("أُلغي الاستيراد؛ لم تتغير اللقطة."); };
  $("undo").onclick = () => { if (previous && !busy) preview(previous,true); };
  $("export").onclick = () => {
    if (!current || !encryptedCurrent) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(encryptedCurrent)],{type:"application/json"}));
    const a = el("a"); a.href = url; a.download = "snapshot.enc.json";
    document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  for (const button of document.querySelectorAll("[data-tab]")) button.onclick = () => {
    for (const tab of document.querySelectorAll("[data-tab]")) { const active = tab === button; tab.setAttribute("aria-pressed",String(active)); $(tab.dataset.tab).hidden = !active; }
  };
  $("year-filter").onchange = renderTime;
  for (const id of ["award-search","family-filter"]) $(id).addEventListener("input",()=>{awardLimit=60;renderAwards();});
  for (const id of ["game-search","platform-filter"]) $(id).addEventListener("input",()=>{gameLimit=100;renderGames();});
  $("more-awards").onclick=()=>{awardLimit+=60;renderAwards();};
  $("more-games").onclick=()=>{gameLimit+=100;renderGames();};
  let installPrompt;
  window.addEventListener("beforeinstallprompt", e=>{e.preventDefault();installPrompt=e;$("install").hidden=false;});
  $("install").onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$("install").hidden=true;}};
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then(reg=>{
      const ready=()=>{if(reg.waiting){$("update").hidden=false;$("update").onclick=()=>{if(!busy&&!pending)reg.waiting.postMessage({type:"skip-waiting"});else message("أكمل أو ألغِ معاينة الاستيراد قبل تحديث الموقع.");};}};
      ready();reg.addEventListener("updatefound",()=>reg.installing?.addEventListener("statechange",ready));
    }).catch(()=>message("تعذّر تجهيز العمل بلا إنترنت. الاستيراد المحلي متاح."));
    let refreshing=false;
    navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!refreshing&&!busy&&!pending){refreshing=true;location.reload();}});
  }
  loadStored().then(([a,b])=>{
    encryptedCurrent=a?GamingCrypto.envelope(a):null;
    encryptedPrevious=b?GamingCrypto.envelope(b):null;
    if(a)$("stamp").textContent="توجد لقطة مشفّرة محفوظة؛ افتحها بعبارة المرور.";
    render();
  }).catch(e=>message(e.message));
})();

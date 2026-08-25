/* ---------- محمّل منطق التطبيق خارج المتصفح ----------
   بدل قصّ دوال بعينها (يكسره أي اعتماد جديد)، نُحمّل سكربت index.html كاملًا في
   بيئة vm معزولة ونعوّض واجهات المتصفح بأقل قدر يكفي لتنفيذ التعريفات العليا.
   المكوّنات لا تُرندَر — نحتاج المنطق الخالص فقط (XP، الرتب، الإنجازات، الترحيل). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function stubEl() {
  const el = {
    style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    appendChild(c){ return c; }, removeChild(c){ return c; }, addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; }, focus(){}, click(){},
    getContext(){ return { drawImage(){}, fillRect(){}, getImageData(){ return { data: [] }; } }; },
    toDataURL(){ return "data:,"; }, children: [], dataset: {}
  };
  return el;
}

/* [extras] تُحقن في السياق قبل التقييم — لتحميل ما يأتي من ملفات منفصلة
   في المتصفح (مثل GAMES_DB من games_db.js)، وإلا بدا المنطق المعتمد عليها
   وكأنه لا يعمل بينما هو لم يجد بياناته أصلًا. */
function loadCore(htmlPath, extras) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const m = html.split(/^<script>\r?$/m);
  if (m.length < 2) throw new Error("لم أجد وسم <script> المنفرد");
  const src = m[1].split(/<\/script>/)[0];

  const noop = () => {};
  const hookRet = v => v;
  /* React مُعطَّل: التعريفات العليا لا تستدعي الخطّافات، والمكوّنات لا تُرندَر هنا */
  const React = {
    createElement: (t, p, ...c) => ({ type: t, props: p, children: c }),
    Fragment: "Fragment",
    useState: init => [typeof init === "function" ? init() : init, noop],
    useEffect: noop, useLayoutEffect: noop, useRef: init => ({ current: init }),
    useMemo: (f) => f(), useCallback: f => f, useContext: () => ({}),
    createContext: () => ({ Provider: noop, Consumer: noop }), memo: f => f
  };

  const doc = {
    documentElement: stubEl(), body: stubEl(), head: stubEl(),
    createElement: () => stubEl(), getElementById: () => stubEl(),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop, cookie: "",
    visibilityState: "visible", readyState: "complete"
  };

  const sandbox = {
    React, ReactDOM: { createRoot: () => ({ render: noop }), render: noop },
    document: doc, navigator: { userAgent: "node", serviceWorker: { register: () => Promise.resolve() }, storage: {} },
    location: { href: "http://localhost/", protocol: "http:", hostname: "localhost", reload: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    indexedDB: { open: () => ({ addEventListener: noop }) },
    fetch: () => Promise.reject(new Error("الشبكة معطّلة في الاختبارات")),
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    setTimeout, clearTimeout, setInterval, clearInterval,
    console, Image: function(){ return stubEl(); }, Blob: function(){}, URL: { createObjectURL: () => "blob:", revokeObjectURL: noop },
    Response: global.Response, Headers: global.Headers, Request: global.Request,
    TextEncoder, TextDecoder, crypto: global.crypto, performance: global.performance,
    Intl, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Map, Set, WeakMap, WeakSet,
    Promise, Error, TypeError, isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    alert: noop, confirm: () => true, prompt: () => null,
    GAMES_DB: []
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  vm.createContext(sandbox);
  /* نُعلن المتغيّرات كخصائص على السياق حتى نستطيع قراءتها بعد التنفيذ:
     تعريفات const/let في vm لا تصير خصائص، فنغلّف السكربت ونصدّر ما نحتاجه. */
  const exportNames = collectTopLevelNames(src);
  const wrapped = src + "\n;(" + JSON.stringify(exportNames) + ").forEach(function(n){" +
    "try { globalThis.__core[n] = eval(n); } catch (e) {} });";
  Object.assign(sandbox, extras || {});
  sandbox.__core = {};
  new vm.Script(wrapped, { filename: "index.html:<script>" }).runInContext(sandbox, { timeout: 30000 });
  return sandbox.__core;
}

/* أسماء التعريفات في العمود 0 — بلا regex معقّد (قصّ الشِل يفسد الهروب) */
function collectTopLevelNames(src) {
  const KW = ["const ", "let ", "var ", "function ", "class "];
  const names = [];
  for (const raw of src.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const kw = KW.find(k => line.startsWith(k));
    if (!kw) continue;
    let rest = line.slice(kw.length).trim();
    if (rest.startsWith("[") || rest.startsWith("{")) continue; // تفكيك — نتجاهله
    let n = "";
    for (const ch of rest) {
      if (/[A-Za-z0-9_$]/.test(ch)) n += ch; else break;
    }
    if (n) names.push(n);
  }
  return [...new Set(names)];
}

module.exports = { loadCore, collectTopLevelNames };

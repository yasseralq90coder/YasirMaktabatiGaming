/* Public ciphertext, private records. Web Crypto only: AES-256-GCM with a
   random 96-bit nonce and a fresh 256-bit salt per envelope. PBKDF2-SHA256
   (600,000 iterations) derives a non-exportable key from a long passphrase.
   This is NOT an authentication server: public ciphertext permits offline
   guessing. Short numeric PINs are deliberately refused. No recovery key. */
(function(root) {
  "use strict";
  const ITERATIONS = 600000, MAX_CIPHER_BYTES = 11 * 1024 * 1024;
  const AAD = new TextEncoder().encode("gaming-encrypted:v1:AES-256-GCM:PBKDF2-SHA256:600000");
  const invalid = () => { throw new Error("ملف مشفّر غير صالح أو إصدار غير مدعوم."); };
  function passphrase(value) {
    if (typeof value !== "string" || value.length < 14 || value.length > 1024 || /^[\d\s٠-٩۰-۹]+$/.test(value) || new Set(value).size < 5)
      throw new Error("استخدم عبارة مرور طويلة من 14 حرفًا على الأقل، وليست رقمًا سريًا قصيرًا. الأفضل كلمات عشوائية متعددة.");
    return value; // No trimming/normalizing: exactly what the user typed.
  }
  function b64(bytes) {
    let s = "";
    for (let i=0;i<bytes.length;i+=8192) s += String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(s);
  }
  function unb64(value) {
    if (typeof value !== "string" || value.length % 4 || value.length > Math.ceil(MAX_CIPHER_BYTES/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) invalid();
    try { return Uint8Array.from(atob(value), c=>c.charCodeAt(0)); } catch { invalid(); }
  }
  function envelope(value) {
    if (typeof value === "string") {
      if (value.length > 16 * 1024 * 1024) invalid();
      try { value=JSON.parse(value); } catch { invalid(); }
    }
    if (!value || value.format !== "gaming-encrypted" || value.version !== 1 || value.cipher !== "AES-256-GCM" || value.kdf !== "PBKDF2-SHA256" || value.iterations !== ITERATIONS) invalid();
    if (unb64(value.salt).length !== 32 || unb64(value.iv).length !== 12) invalid();
    const bytes = unb64(value.data);
    if (bytes.length < 17 || bytes.length > MAX_CIPHER_BYTES) invalid();
    // Do not carry arbitrary plaintext metadata alongside the encrypted data.
    return {format:value.format,version:1,cipher:value.cipher,kdf:value.kdf,iterations:ITERATIONS,salt:value.salt,iv:value.iv,data:value.data};
  }
  async function derive(password,salt) {
    passphrase(password);
    if (!root.crypto?.subtle) throw new Error("التشفير يحتاج HTTPS أو معاينة localhost في متصفح حديث.");
    const material=await root.crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
    return root.crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:ITERATIONS},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function encrypt(snapshot,password) {
    passphrase(password);
    const validator = typeof module !== "undefined" && module.exports ? require("./records-core.js") : root.GamingSnapshot;
    const clean = validator.validate(snapshot), bytes=new TextEncoder().encode(JSON.stringify(clean));
    if(bytes.length>validator.MAX_BYTES) invalid();
    const salt=root.crypto.getRandomValues(new Uint8Array(32)),iv=root.crypto.getRandomValues(new Uint8Array(12));
    const key=await derive(password,salt);
    const encrypted=await root.crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:AAD,tagLength:128},key,bytes);
    bytes.fill(0);
    return {format:"gaming-encrypted",version:1,cipher:"AES-256-GCM",kdf:"PBKDF2-SHA256",iterations:ITERATIONS,salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(encrypted))};
  }
  async function decrypt(value,password) {
    const e=envelope(value), key=await derive(password,unb64(e.salt));
    let plain;
    try { plain=await root.crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(e.iv),additionalData:AAD,tagLength:128},key,unb64(e.data)); }
    catch { throw new Error("تعذّر فتح السجل: كلمة المرور غير صحيحة أو الملف تغيّر. بياناتك المحفوظة لم تتغير."); }
    const bytes=new Uint8Array(plain);
    try {
      const validator=typeof module !== "undefined" && module.exports ? require("./records-core.js") : root.GamingSnapshot;
      return validator.validate(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    } finally { bytes.fill(0); }
  }
  const api=Object.freeze({encrypt,decrypt,envelope,passphrase});
  if(typeof module!=="undefined" && module.exports)module.exports=api;else root.GamingCrypto=api;
})(globalThis);

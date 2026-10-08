/* All passphrases/data below are SYNTHETIC test fixtures, never user secrets. */
const assert=require("node:assert/strict"), fs=require("node:fs");
const seal=require("../records-crypto.js"), fixture=require("./snapshot-fixture.cjs");
const pass="Test-only cloud fern river 47!";
(async()=>{
  const original=fixture();
  const encrypted=await seal.encrypt(original,pass);
  assert.deepEqual(await seal.decrypt(encrypted,pass),original);
  assert(!JSON.stringify(encrypted).includes(original.games[0].name));
  assert(!JSON.stringify(encrypted).includes(pass));
  assert(!JSON.stringify(encrypted).includes(original.injaz.rank.name));
  const again=await seal.encrypt(original,pass);
  assert.notEqual(encrypted.salt,again.salt);assert.notEqual(encrypted.iv,again.iv);assert.notEqual(encrypted.data,again.data);
  await assert.rejects(()=>seal.decrypt(encrypted,"Wrong-only tree river lake 98!"));
  for(const key of ["data","salt","iv"]){const changed={...encrypted};const bytes=Buffer.from(changed[key],"base64");bytes[0]^=1;changed[key]=bytes.toString("base64");await assert.rejects(()=>seal.decrypt(changed,pass));}
  for(const update of [{iterations:1},{iterations:900000000},{version:2},{cipher:"AES-CBC"},{iv:"abcd"},{salt:"===="}]) assert.throws(()=>seal.envelope({...encrypted,...update}));
  for(const weak of ["1234","12345678901234567890","٠١٢٣٤٥٦٧٨٩٠١٢٣٤٥","aaaaaaaaaaaaaaaaaaaa",""])assert.throws(()=>seal.passphrase(weak));
  assert(!("note" in seal.envelope({...encrypted,note:"PRIVATE"})));
  assert.throws(()=>seal.envelope("{"));
  assert.throws(()=>seal.envelope(" ".repeat(17*1024*1024)));
  // Independent Node crypto implementation proves the wire format interoperates.
  const nodeCrypto=require("node:crypto"),key=nodeCrypto.pbkdf2Sync(pass,Buffer.from(encrypted.salt,"base64"),600000,32,"sha256");
  const bytes=Buffer.from(encrypted.data,"base64"),decipher=nodeCrypto.createDecipheriv("aes-256-gcm",key,Buffer.from(encrypted.iv,"base64"));
  decipher.setAAD(Buffer.from("gaming-encrypted:v1:AES-256-GCM:PBKDF2-SHA256:600000"));decipher.setAuthTag(bytes.subarray(-16));
  const plain=Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]);
  assert.deepEqual(JSON.parse(plain),original);plain.fill(0);key.fill(0);
  if(process.argv[2]){
    const real=fs.readFileSync(process.argv[2],"utf8"),safe=require("../records-core.js").validate(real);
    const realEncrypted=await seal.encrypt(safe,pass);assert.deepEqual(await seal.decrypt(realEncrypted,pass),safe);
    // Intentionally not saved: a public test passphrase must never protect real output.
  }
  console.log("PASS encryption: round-trip, random salt/nonce, wrong password, tamper resistance, bounded KDF, no plaintext metadata, weak-password rejection, Node interoperability.");
})().catch(()=>{console.error("Encryption test failed; details suppressed to avoid exposing decrypted data.");process.exitCode=1;});

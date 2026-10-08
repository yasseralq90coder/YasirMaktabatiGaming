/* CI encryption boundary: passphrase comes from GitHub Secrets via environment,
   never arguments or a file in the repository. Only validated ciphertext exits.
   No logs include payloads, keys, passphrases or exception details. */
const fs=require("node:fs"), path=require("node:path"), crypto=require("../records-crypto.js");
(async()=>{
  if(process.argv.length!==4)throw Error("args");
  const [source,target]=process.argv.slice(2).map(p=>path.resolve(p));
  if(source===target || !target.endsWith(".enc.json"))throw Error("target");
  const password=process.env.SNAPSHOT_PASSPHRASE;
  delete process.env.SNAPSHOT_PASSPHRASE;
  crypto.passphrase(password);
  const payload=fs.readFileSync(source,"utf8");
  const encrypted=await crypto.encrypt(payload,password);
  // No overwriting: caller chooses a new staging file and publishes only after validation.
  const descriptor=fs.openSync(target,"wx",0o600);
  try{fs.writeFileSync(descriptor,JSON.stringify(encrypted));fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
  console.log("Validated encrypted snapshot created.");
})().catch(()=>{console.error("Encryption failed; no plaintext was published.");process.exitCode=1;});

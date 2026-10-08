/* Publish allow-listed code and strictly validated ciphertext only. The target
   must be NEW, so a previous staging directory cannot carry leaked files. */
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),files=require("./public-files.cjs");
function stage(target) {
  const dest=path.resolve(target);
  if(dest===root||root.startsWith(dest+path.sep)||fs.existsSync(dest))throw Error("Staging directory must be new and not a project ancestor.");
  // Validate everything before creating a directory or copying any file.
  for(const name of files){const source=path.join(root,name);if(!fs.statSync(source).isFile()||!fs.realpathSync(source).startsWith(root+path.sep))throw Error("Invalid asset.");}
  const encryptedPath=path.join(root,"data","snapshot.enc.json");let encrypted=null;
  if(fs.existsSync(encryptedPath)) {
    if(!fs.realpathSync(encryptedPath).startsWith(root+path.sep)||fs.statSync(encryptedPath).size>16*1024*1024)throw Error("Invalid encrypted file.");
    // Reject surplus fields rather than silently packaging a secret next to data.
    const original=JSON.parse(fs.readFileSync(encryptedPath,"utf8"));
    const clean=require("../records-crypto.js").envelope(original);
    if(Object.keys(original).some(k=>!(k in clean)))throw Error("Unexpected plaintext envelope field.");
    encrypted=JSON.stringify(clean);
  }
  fs.mkdirSync(dest,{recursive:true});
  for(const name of files){const targetFile=path.join(dest,name);fs.mkdirSync(path.dirname(targetFile),{recursive:true});fs.copyFileSync(path.join(root,name),targetFile);}
  if(encrypted){fs.mkdirSync(path.join(dest,"data"));fs.writeFileSync(path.join(dest,"data","snapshot.enc.json"),encrypted,{flag:"wx"});}
  fs.writeFileSync(path.join(dest,".nojekyll"),"",{flag:"wx"});
  console.log(encrypted?"Public assets and encrypted snapshot staged.":"Public shell staged; no snapshot published.");
}
if(require.main===module){try{if(process.argv.length!==3)throw Error("args");stage(process.argv[2]);}catch{console.error("Pages staging refused; no unsafe artifact was uploaded.");process.exitCode=1;}}
module.exports={stage};

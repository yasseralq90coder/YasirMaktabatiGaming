/* Rasterize the existing vector brand for install surfaces requiring PNG.
   Uses an already-installed sharp module; no downloads or design changes. */
const path = require("node:path");
const sharp = require(process.env.SHARP_MODULE || "sharp");
(async()=>{
  for(const size of [192,512]) await sharp(path.join(__dirname,"..","icon.svg")).resize(size,size).flatten({background:"#0b0d17"}).png().toFile(path.join(__dirname,"..",`icon-${size}.png`));
})().catch(e=>{console.error(e);process.exitCode=1;});

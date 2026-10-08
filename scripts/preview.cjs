/* Local preview only. No file upload/write endpoints, no directory listing,
   no private files, loopback binding and Host check against DNS rebinding. */
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const root=path.resolve(__dirname,".."),allowed=new Set(require("./public-files.cjs"));
allowed.add("data/snapshot.enc.json");
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".png":"image/png"};
const server=http.createServer((req,res)=>{
  const port=server.address().port;
  if(!["127.0.0.1:"+port,"localhost:"+port].includes(req.headers.host)||!["GET","HEAD"].includes(req.method)){res.writeHead(403).end();return;}
  let name;try{name=new URL(req.url,"http://127.0.0.1").pathname.slice(1)||"records.html";}catch{res.writeHead(400).end();return;}
  if(!allowed.has(name)){res.writeHead(404).end();return;}
  const file=path.join(root,name);
  if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep)){res.writeHead(404).end();return;}
  res.writeHead(200,{"Content-Type":types[path.extname(file)],"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
  if(req.method==="HEAD")res.end();else fs.createReadStream(file).pipe(res);
});
server.listen(0,"127.0.0.1",()=>console.log(`Preview: http://127.0.0.1:${server.address().port}/records.html`));

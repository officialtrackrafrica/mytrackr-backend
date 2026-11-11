const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
(async()=>{
  const target=await fetch('http://127.0.0.1:9338/json/new?about:blank',{method:'PUT'}).then(r=>r.json());
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let id=0;const pending=new Map();let loaded;
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const h=pending.get(m.id);pending.delete(m.id);clearTimeout(h.timer);m.error?h.reject(new Error(m.error.message)):h.resolve(m.result);}if(m.method==='Page.loadEventFired'&&loaded)loaded();});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(new Error('Timed out: '+method)),30000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:900,height:1200,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setEmulatedMedia',{media:'print'});
  const ready=new Promise(resolve=>{loaded=resolve;});
  await call('Page.navigate',{url:pathToFileURL(path.resolve('artifacts/developer-guide/MyTrackr-Developer-Guide.html')).href});
  await ready;
  await call('Runtime.evaluate',{expression:'Promise.all([document.fonts.ready,...[...document.images].map(img=>img.decode())])',awaitPromise:true});
  const layout=await call('Runtime.evaluate',{expression:`JSON.stringify([...document.querySelectorAll('.sheet')].map((sheet,i)=>{const r=sheet.getBoundingClientRect(),main=sheet.querySelector('main'),footer=sheet.querySelector('footer'),last=main.lastElementChild;return {page:i+1,x:r.x,y:r.y,width:r.width,height:r.height,mainHeight:main.clientHeight,contentHeight:main.scrollHeight,lastBottom:last.getBoundingClientRect().bottom-r.y,footerTop:footer.getBoundingClientRect().top-r.y,overflow:main.scrollHeight>main.clientHeight+2,wide:[...main.querySelectorAll('*')].some(el=>el.getBoundingClientRect().right>r.right-15)}}))`,returnByValue:true});
  const pages=JSON.parse(layout.result.value);console.log(JSON.stringify(pages,null,2));
  for(const page of pages){
    const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:page.x,y:page.y,width:page.width,height:page.height,scale:1}});
    fs.writeFileSync(path.resolve('.tmp/developer-pdf-page-'+page.page+'.png'),Buffer.from(shot.data,'base64'));
  }
  if(pages.some(page=>page.overflow||page.wide||page.lastBottom>page.footerTop-5))throw new Error('Page content exceeds its available layout area');
  const pdf=await call('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0});
  const output=path.resolve('artifacts/developer-guide/MyTrackr-Developer-Guide.pdf');
  fs.writeFileSync(output,Buffer.from(pdf.data,'base64'));
  ws.close();await fetch('http://127.0.0.1:9338/json/close/'+target.id);
  console.log('PDF saved: '+output);
})().catch(error=>{console.error(error.message);process.exitCode=1;});

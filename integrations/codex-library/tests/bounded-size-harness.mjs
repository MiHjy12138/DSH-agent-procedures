// Real headless browser and iframe bridge; this is not native-host acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Library} from '../codex-plugin/scripts/library.mjs';
import {createServer} from '../codex-plugin/scripts/server.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.test-output');
await fs.mkdir(base,{recursive:true});const temp=await fs.mkdtemp(path.join(base,'browser-'));const project=path.join(temp,'ICT');await fs.mkdir(path.join(project,'procedures'),{recursive:true});
const secondProject=path.join(temp,'tradeloom');const missingProject=path.join(temp,'No library');await fs.mkdir(path.join(secondProject,'procedures'),{recursive:true});await fs.mkdir(missingProject);
const target=path.join(project,'procedures','fixture.md');await fs.writeFile(target,'# Harness card\n<script>window.injected=true</script>');
const env={...process.env,CODEX_HOME:path.join(temp,'codex'),LOCALAPPDATA:path.join(temp,'appdata')};await fs.mkdir(env.CODEX_HOME,{recursive:true});await fs.writeFile(path.join(env.CODEX_HOME,'.codex-global-state.json'),JSON.stringify({'local-projects':{a:{id:'a',name:'ICT',rootPaths:[project]},b:{id:'b',name:'tradeloom',rootPaths:[secondProject]},c:{id:'c',name:'No library',rootPaths:[missingProject]}},'thread-project-assignments':{'thread-a':{projectKind:'local',projectId:'a'},'thread-b':{projectKind:'local',projectId:'b'},'thread-c':{projectKind:'local',projectId:'c'}}}));
let recycleCalls=0;
const library=new Library({env,action:async request=>{if(request.action==='locale')return {langid:0x0804};if(request.action==='recycle'){recycleCalls++;await fs.rename(request.path,path.join(temp,'recycled-fixture.md'));return {recycled:true};}return {opened:true};}});
await library.select(secondProject);
const dispatch=createServer(library);
const app=await fs.readFile(process.env.BASELINE_APP || new URL('../codex-plugin/ui/app.html',import.meta.url),'utf8');
const host=`<!doctype html><html><body style="margin:0"><iframe src="/app" style="display:block;border:0;width:100%;height:100vh"></iframe><script>window.calls=[];window.sizes=[];window.threadId=new URL(location.href).searchParams.get('source')||'thread-a';addEventListener('message',async e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const d=e.data;if(d.method==='ui/notifications/size-changed'){sizes.push(d.params);document.querySelector('iframe').style.height=d.params.height+'px';}if(d.id===undefined)return;let result;if(d.method==='ui/initialize')result={hostCapabilities:{serverTools:true},hostContext:{locale:'zh-CN',sourceThreadId:'11111111-1111-4111-8111-111111111111',cwd:${JSON.stringify(path.toNamespacedPath(project))},secret:'NEVER_UI_LOG'}};else if(d.method==='tools/call'){calls.push(d.params.name);d.params._meta={threadId:window.threadId};const r=await fetch('/rpc',{method:'POST',body:JSON.stringify(d)});const body=await r.json();e.source.postMessage(body,'*');return;}else result={};e.source.postMessage({jsonrpc:'2.0',id:d.id,result},'*');});</script></body></html>`;
const server=http.createServer(async(req,res)=>{if(req.url==='/rpc'){let body='';for await(const part of req)body+=part;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await dispatch(JSON.parse(body))));}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/app'?app:host);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--disable-extensions','--user-data-dir='+path.join(temp,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
try {
 let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(temp,'profile/DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(port,'headless browser must start');
 const page=await (await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let next=0;const pending=new Map();socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);if(item){pending.delete(data.id);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result);}}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const frame="document.querySelector('iframe').contentWindow";
 const wait=async expression=>{for(let i=0;i<100;i++){try{if(await evaluate(expression))return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('UI did not reach expected state: '+expression);};
 await send('Emulation.setDeviceMetricsOverride',{width:1040,height:680,deviceScaleFactor:1.5,mobile:false});
 await wait(frame+'.document.querySelectorAll("#projects option").length>1');
 await wait('sizes.length===1');assert.deepEqual(await evaluate('sizes.map(x=>x.height)'),[560]);
 const sizeRows=[];
 for(const width of [390,600,1040]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(frame+`.document.getElementById('content').textContent='Long card\\n'.repeat(2000)`);
  await evaluate("document.querySelector('iframe').style.height='560px'");const heights=[];
  for(let i=0;i<12;i++){
   const h=await evaluate(`(()=>{const f=document.querySelector('iframe');const d=f.contentDocument;return {document:d.documentElement.scrollHeight,body:d.body.getBoundingClientRect().height,content:d.getElementById('content').clientHeight,scroll:d.getElementById('content').scrollHeight,width:d.documentElement.scrollWidth,client:d.documentElement.clientWidth};})()`);
   assert.ok(h.document<=561);assert.ok(h.body<=560);assert.ok(h.scroll>h.content);assert.ok(h.width<=h.client);heights.push(h.document);
   // Host follows actual document measurement repeatedly: content must not amplify it.
   await evaluate(`document.querySelector('iframe').style.height=${h.document}+'px'`);
  }
  assert.equal(new Set(heights).size,1);sizeRows.push({width,heights});
 }

 const transitions=[];
 for(const [context,frameHeight,expected] of [[{displayMode:'inline',containerDimensions:{maxHeight:1000}},1000,1000],[{displayMode:'inline',containerDimensions:{}},1000,560],[{displayMode:'fullscreen'},820,820],[{displayMode:'inline'},820,560]]){
  await evaluate(`document.querySelector('iframe').style.height='${frameHeight}px';${frame}.eval(${JSON.stringify('hostContext('+JSON.stringify(context)+')')})`);
  const height=await evaluate(frame+'.document.body.getBoundingClientRect().height');assert.equal(height,expected);transitions.push({context,height});
 }
 await wait('sizes.length===3');for(let i=0;i<6;i++)await evaluate(frame+`.eval('hostContext({displayMode:"inline"})')`);const sizeNotifications=await evaluate('sizes.map(x=>x.height)');assert.deepEqual(sizeNotifications,[560,560,560]);
 sizeRows.push({transitions,sizeNotifications});
 await fs.writeFile(path.join(base,'bounded-size-feedback.json'),JSON.stringify(sizeRows,null,2));console.log(JSON.stringify(sizeRows));
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();browser.kill();await new Promise(resolve=>server.close(resolve));}

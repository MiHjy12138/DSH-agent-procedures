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
const app=await fs.readFile(new URL('../codex-plugin/ui/app.html',import.meta.url),'utf8');
const host=`<!doctype html><html><body style="margin:0"><iframe src="/app" style="display:block;border:0;width:100%;height:100vh"></iframe><script>window.calls=[];window.threadId=new URL(location.href).searchParams.get('source')||'thread-a';addEventListener('message',async e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const d=e.data;if(d.id===undefined)return;let result;if(d.method==='ui/initialize')result={hostCapabilities:{serverTools:true},hostContext:{locale:'zh-CN',sourceThreadId:'11111111-1111-4111-8111-111111111111',cwd:${JSON.stringify(path.toNamespacedPath(project))},secret:'NEVER_UI_LOG'}};else if(d.method==='tools/call'){calls.push(d.params.name);d.params._meta={threadId:window.threadId};const r=await fetch('/rpc',{method:'POST',body:JSON.stringify(d)});const body=await r.json();e.source.postMessage(body,'*');return;}else result={};e.source.postMessage({jsonrpc:'2.0',id:d.id,result},'*');});</script></body></html>`;
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
 // True iframe: a missing source remains selected and exposes creation only there.
 await evaluate("window.threadId='thread-c';"+frame+".document.getElementById('refresh').click()");
 await wait(frame+`.document.getElementById('projects').value===${JSON.stringify(missingProject)}`);
 await wait('!'+frame+'.document.getElementById("initialize").classList.contains("hide")');
 assert.equal(await evaluate(frame+'.document.getElementById("title").textContent'),'当前项目尚未创建项目库');
 await assert.rejects(fs.stat(path.join(missingProject,'procedures')));
 const selectBefore=await evaluate("calls.filter(x=>x==='procedure_library_select_project').length");
 await evaluate(frame+`.eval(${JSON.stringify('chooseProject('+JSON.stringify(project)+')')})`);
 await wait(frame+`.document.getElementById('projects').value===${JSON.stringify(project)}`);
 await evaluate(frame+`.eval(${JSON.stringify('chooseProject('+JSON.stringify(missingProject)+')')})`);
 await wait(frame+`.document.getElementById('projects').value===${JSON.stringify(missingProject)}`);
 await wait('!'+frame+'.document.getElementById("initialize").classList.contains("hide")');
 assert.equal(await evaluate("calls.filter(x=>x==='procedure_library_select_project').length"),selectBefore+1);
 const unknown=path.join(temp,'Unknown missing');await fs.mkdir(unknown);
 await evaluate(frame+`.eval(${JSON.stringify('chooseProject('+JSON.stringify(unknown)+')')})`);
 assert.equal(await evaluate(`Array.from(${frame}.document.getElementById('projects').options).some(x=>x.value===${JSON.stringify(unknown)})`),false);

 await evaluate(frame+'.document.getElementById("central").click()');
 await wait(frame+'.document.getElementById("initialize").classList.contains("hide")');
 await evaluate("window.threadId='thread-a';"+frame+".document.getElementById('refresh').click()");
 await wait(frame+`.document.getElementById('projects').value===${JSON.stringify(project)}`);
 await evaluate(frame+'.document.getElementById("project").click()');
 await wait(frame+'.document.getElementById("initialize").classList.contains("hide")');
 const rows=[];
 for(const width of [390,600,1040]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});
  for(const locale of ['zh-CN','zh-TW','en-US']) {
   await evaluate(frame+`.eval("language=normalizeLocale('${locale}');applyLanguage()")`);
   const data=await evaluate(`(()=>{const d=${frame}.document;return {width:${width},locale:'${locale}',top:d.querySelector('main').getBoundingClientRect().top,main:d.querySelector('main').getBoundingClientRect().height,scroll:d.documentElement.scrollWidth,client:d.documentElement.clientWidth,actions:['refresh','manual','folder','delete'].map(id=>{const n=d.getElementById(id);return {id,name:n.getAttribute('aria-label')||n.textContent,svg:!!n.querySelector('svg')};})};})()`);
   assert.ok(data.scroll<=data.client);assert.ok(data.actions.every(x=>x.name));
   if(process.env.PHASE==='after')assert.ok(data.actions.every(x=>x.svg));
   rows.push(data);
  }
  await fs.writeFile(path.join(base,`compact-${process.env.PHASE}-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 await fs.writeFile(path.join(base,`compact-${process.env.PHASE}.json`),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();browser.kill();await new Promise(resolve=>server.close(resolve));}

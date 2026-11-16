import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import {Library} from './library.mjs';

export const VERSION='0.1.7';
export const URI=`ui://procedure-library/app/${VERSION}`;
export const READ_URIS=new Set([URI,...['0.1.2','0.1.3-probe.1','0.1.4','0.1.5','0.1.6'].map(version=>`ui://procedure-library/app/${version}`)]);
export const MIME='text/html;profile=mcp-app';
const object=properties=>({type:'object',properties,additionalProperties:false});
const context={library:{type:'string',enum:['central','project']},projectPath:{type:'string'},query:{type:'string'}};
const card={...context,name:{type:'string'},expectedPath:{type:'string'}};
function tool(name,title,inputSchema,{write=false,destructive=false}={}) {return {name,title,description:title,inputSchema,annotations:{readOnlyHint:!write,destructiveHint:destructive,openWorldHint:false},_meta:{ui:{visibility:['app']}}};}
export const tools=[
 {name:'procedure_library_open',title:'经验卡',description:'Open the native procedure-card panel. Does not open an external window.',inputSchema:object({}),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{ui:{resourceUri:URI,visibility:['app']},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}}},
 tool('procedure_library_state','Library projects and display language',object({})),
 tool('procedure_library_select_project','Remember the explicitly selected project',object({projectPath:{type:'string'}}),{write:true}),
 tool('procedure_library_initialize','Create the current source project library',object({projectPath:{type:'string'},expectedPath:{type:'string'}}),{write:true}),
 tool('procedure_library_list','Search procedure cards',object(context)),
 tool('procedure_library_read','Read a selected procedure card',object(card)),
 tool('procedure_library_recycle','Move one explicitly confirmed card to Windows Recycle Bin',object(card),{write:true,destructive:true}),
 tool('procedure_library_open_folder','Open the selected library folder',object(context),{write:true}),
];
export function createServer(library=new Library()) {
 return async function dispatch(request) {
  const {id,method,params={}}=request;
  if(id===undefined)return null;
  try {
   let result;
   if(method==='initialize')result={protocolVersion:params.protocolVersion || '2025-06-18',capabilities:{tools:{},resources:{}},serverInfo:{name:'procedure-library',version:VERSION}};
   else if(method==='ping')result={};
   else if(method==='tools/list')result={tools};
   else if(method==='resources/list')result={resources:[{uri:URI,name:'Procedure cards',mimeType:MIME}]};
   else if(method==='resources/read') {
    if(!READ_URIS.has(params.uri))throw new Error('Unknown resource.');
    result={contents:[{uri:params.uri,mimeType:MIME,text:await fs.readFile(fileURLToPath(new URL('../ui/app.html',import.meta.url)),'utf8'),_meta:{ui:{csp:{connectDomains:[],resourceDomains:[]}}}}]};
   } else if(method==='tools/call') {
    const args=params.arguments || {};let data;
    switch(params.name) {
     case 'procedure_library_open':data={resourceProvided:true,resourceUri:URI};break;
     case 'procedure_library_state':data=await library.state(params._meta);break;
     case 'procedure_library_select_project':data=await library.select(args.projectPath);break;
     case 'procedure_library_initialize':data=await library.initializeProject(args,params._meta);break;
     case 'procedure_library_list':data=await library.list(args);break;
     case 'procedure_library_read':data=await library.read(args);break;
     case 'procedure_library_recycle':data=await library.recycle(args);break;
     case 'procedure_library_open_folder':data=await library.openFolder(args);break;
     default:throw new Error('Unknown tool.');
    }
    result={content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
   } else return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
   return {jsonrpc:'2.0',id,result};
  } catch(error) {
   return method==='tools/call'?{jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:error.message}]}}:{jsonrpc:'2.0',id,error:{code:-32602,message:error.message}};
  }
 };
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
 const dispatch=createServer();
 const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 let queue=Promise.resolve();
 input.on('line',line=>{queue=queue.then(async()=>{try{const result=await dispatch(JSON.parse(line));if(result)process.stdout.write(JSON.stringify(result)+'\n');}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');}}).catch(error=>process.stderr.write(error.message+'\n'));});
}

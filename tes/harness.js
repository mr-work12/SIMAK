const fs=require('fs'),vm=require('vm');
const sheets={};
function mkSheet(name){const d=[];const sh={_d:d,
 getName:()=>name,
 getLastRow:()=>{for(let i=d.length;i>0;i--)if(d[i-1].some(x=>x!==''&&x!=null))return i;return 0},
 getDataRange(){const n=Math.max(1,sh.getLastRow());const w=Math.max(1,...d.map(r=>r.length));return sh.getRange(1,1,n,w)},
 getRange(r,c,nr=1,nc=1){const api={getValue(){return api.getValues()[0][0]},getValues(){const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++){let v=(d[r-1+i]||[])[c-1+j];if(v===undefined||v===null)v='';if(typeof v==='string'&&v.startsWith("'"))v=v.slice(1);row.push(v)}o.push(row)}return o},
   setValues(vs){vs.forEach((row,i)=>{d[r-1+i]=d[r-1+i]||[];row.forEach((v,j)=>d[r-1+i][c-1+j]=v)});return api},
   setValue(v){d[r-1]=d[r-1]||[];d[r-1][c-1]=v;return api},
   clearContent(){for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)if(d[r-1+i])d[r-1+i][c-1+j]='';return api},
   setFontWeight(){return api},setBackground(){return api},setFontColor(){return api}};return api},
 getMaxColumns:()=>99,insertColumnsAfter(){},appendRow(row){d.splice(sh.getLastRow(),0,row.slice())},deleteRow(i){d.splice(i-1,1)},setFrozenRows(){}};return sh}
const ss={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=mkSheet(n))};
const mails=[],events=[];const PROPS={};const CACHE={};const PUSH=[];const FILES={};const SLIDEOPS=[];let fid=0;
function mkFile(name){const id='1AbCdEfGhIjKlMnOpQrStUvWxYz'+(++fid);const f={id,name,trashed:false,getBlob:()=>({getContentType:()=>'image/jpeg',getBytes:()=>[1]}),getName:()=>name,getId:()=>id,getUrl:()=>'https://drive.google.com/file/d/'+id+'/view',isTrashed:()=>f.trashed,setTrashed(v){f.trashed=v},moveTo(){},setSharing(){},
 makeCopy(n){const c=mkFile(n);c.text=f.text;return c},getAs(){return {setName(nm){this.name=nm;return this},src:f}}};FILES[id]=f;return f}
function mkFolder(n){return {getId:()=>'folder-'+n,isTrashed:()=>false,createFile(b){const f=mkFile(b.name||b._n);if(b.src)f.pdfOf=b.src.repl;return f}}}
function pad(n){return String(n).padStart(2,'0')}
function fmtJkt(d,p){const t=new Date(d.getTime()+7*3600000);const Y=t.getUTCFullYear(),M=pad(t.getUTCMonth()+1),D=pad(t.getUTCDate()),h=pad(t.getUTCHours()),m=pad(t.getUTCMinutes());return p.replace('yyyy',Y).replace('MM',M).replace('dd',D).replace('HH',h).replace('mm',m)}
const ctx={console,Math,Date,JSON,String,Number,Object,Array,
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 Utilities:{_x:0,getUuid:()=>'uuid-'+Math.random().toString(36).slice(2),computeDigest:(a,s)=>Array.from(Buffer.from(require('crypto').createHash('sha256').update(s).digest())),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),DigestAlgorithm:{},formatDate:(d,tz,p)=>fmtJkt(d,p),parseDate:(s,tz,p)=>{const [a,b]=s.split(' ');const [Y,M,D]=a.split('-').map(Number);const [h,m]=(b||'00:00').split(':').map(Number);return new Date(Date.UTC(Y,M-1,D,h-7,m))},base64Decode:()=>[],base64Encode:()=>'QUJD',newBlob:(b,t,n)=>({name:n}),newBlob:()=>({})},
 MailApp:{getRemainingDailyQuota:()=>100,sendEmail:(to,sub,body)=>typeof to==='object'?mails.push({to:to.to+' bcc:'+to.bcc,sub:to.subject}):mails.push({to,sub,body})},UrlFetchApp:{fetch(){return {getResponseCode:()=>404,getHeaders:()=>({}),getContentText:()=>"no"}},getRequest(){},fetch:(u,o)=>{PUSH.push(JSON.parse(o.payload))}},
 CalendarApp:{getDefaultCalendar:()=>({createEvent:(t,a,b,o)=>{const ev={id:'ev'+events.length,t,a,o,guests:o.guests.split(',').filter(Boolean),getId(){return this.id},setGuestsCanSeeGuests(){},addPopupReminder(){},addGuest(e){this.guests.push(e)},deleteEvent(){this.deleted=true}};events.push(ev);return ev},
   createAllDayEvent:(t,a,o)=>ctx.CalendarApp.getDefaultCalendar().createEvent(t,a,a,o),getEventById:id=>events.find(e=>e.id===id)})},
 ScriptApp:{getOAuthToken:()=>"t",WeekDay:{SUNDAY:7},getService:()=>({getUrl:()=>'https://app/exec'}),getProjectTriggers:()=>[],newTrigger:()=>({timeBased(){return this},everyMinutes(){return this},everyDays(){return this},onWeekDay(){return this},atHour(){return this},inTimezone(){return this},create(){}})},
 CacheService:{getScriptCache:()=>({get:k=>CACHE[k]===undefined?null:CACHE[k],put:(k,v)=>{CACHE[k]=String(v)},remove:k=>{delete CACHE[k]}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>PROPS[k]||null,setProperty:(k,v)=>{PROPS[k]=v},deleteProperty:k=>{delete PROPS[k]},getProperties:()=>PROPS})},
 DriveApp:{createFolder:n=>mkFolder(n),getFolderById:id=>mkFolder(id),getFileById:id=>FILES[id],Access:{},Permission:{}},
 SlidesApp:{ShapeType:{},ParagraphAlignment:{},create(n){const f=mkFile(n);f.text=[];const chain=new Proxy(function(){},{get:(t,k)=>k==='getWidth'||k==='getHeight'?()=>100:()=>chain,apply:()=>chain});
   return {getPageWidth:()=>720,getPageHeight:()=>405,getId:()=>f.id,getSlides:()=>[{getPageElements:()=>[],getBackground:()=>chain,insertShape:()=>chain,insertImage:()=>chain,insertTextBox:(t)=>{f.text.push(t);return chain}}],saveAndClose(){}}},
   openById(id){const f=FILES[id];f.repl={};return {replaceAllText:(a,b)=>{f.repl[a]=b},saveAndClose(){}}}},
 HtmlService:{createHtmlOutput:x=>({getBlob:()=>({getAs:()=>({_n:'',setName(n){this._n=n;return this},getName(){return this._n},getBytes:()=>[1,2,3],name:'pdf'})})})},Session:{getActiveUser:()=>({getEmail:()=>'me@x'}),getEffectiveUser:()=>({getEmail:()=>'me@x'})},Logger:{log(){}},
 };
vm.createContext(ctx);vm.runInContext(fs.readFileSync(''+require('path').join(__dirname,'..','src',process.env.FILE_KODE||'Code.gs')+'','utf8'),ctx);
const R=c=>vm.runInContext(c,ctx);
R("validasiFormDAD_=function(p){cekEmail_(p.email)}; var __d=daftarDAD; daftarDAD=function(p){p.foto=p.foto||{data:'x'};return __d(p)}");

R("validasiFormDAD_=function(p){cekEmail_(p.email)}");
ctx.GmailApp={getUserLabelByName:()=>null};R("setup()");
const today=fmtJkt(new Date(),'yyyy-MM-dd');
const lastMail=()=>mails[mails.length-1];
const pw="CONFIG.PASSWORD_ADMIN";
console.log('--- PIN ---');
// daftar mandiri dgn PIN
const REPL=[];
module.exports={R,ctx,sheets,mails,pw,fmtJkt,today};

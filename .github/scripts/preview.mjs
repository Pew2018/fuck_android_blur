import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve('webroot');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,pathname==='/'?'index.html':'.'+pathname);
 if(!file.startsWith(root)){res.writeHead(403).end();return}
 try{const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data)}catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:412,height:1000},deviceScaleFactor:1});
 const pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 await page.addInitScript(()=>{window.ksu={exec:()=>{}}});
 for(const mode of ['light','dark','global-off','busy','dialog','snackbar','diagnostics','loading','error']){
  await page.goto('http://127.0.0.1:4173/?preview='+mode);
  if(mode==='loading'||mode==='error'){
   await page.waitForSelector('#loadingShell:not([hidden])');
   if(mode==='error')assert.equal(await page.locator('#retryLoad').isVisible(),true);
   else {
    await page.waitForFunction(()=>document.querySelector('#loadingProgress').classList.contains('mdc-linear-progress--animation-ready'));
    const loadingLayout=await page.evaluate(()=>{
     const root=document.querySelector('#loadingProgress');
     return{width:root.getBoundingClientRect().width,primaryHalf:getComputedStyle(root).getPropertyValue('--mdc-linear-progress-primary-half').trim()};
    });
    assert.ok(loadingLayout.width>0,JSON.stringify(loadingLayout));
    assert.notEqual(loadingLayout.primaryHalf,'0px',JSON.stringify(loadingLayout));
    const loadingMotion=await page.evaluate(async()=>{
     if(matchMedia('(prefers-reduced-motion: reduce)').matches)return{reduced:true};
     const bar=document.querySelector('#loadingProgress .mdc-linear-progress__primary-bar');
     await new Promise(resolve=>setTimeout(resolve,750));
     const before=getComputedStyle(bar).transform;
     await new Promise(resolve=>setTimeout(resolve,350));
     const computed=getComputedStyle(bar),animations=bar.getAnimations();
     return{reduced:false,before,after:computed.transform,animationName:computed.animationName,animationDuration:computed.animationDuration,animations:animations.map(animation=>({playState:animation.playState,currentTime:animation.currentTime}))};
    });
    console.log('Loading animation diagnostic:',JSON.stringify(loadingMotion));
    if(!loadingMotion.reduced)assert.notEqual(loadingMotion.before,loadingMotion.after,'MDC loading indicator should keep animating');
    assert.equal(await page.locator('#main').isVisible(),false);
    assert.equal(await page.locator('#loadingSubtext').isVisible(),false);
    assert.equal(await page.locator('#loadingProgress.mdc-linear-progress--indeterminate').count(),1);
    assert.equal(await page.locator('#loadingProgress .mdc-linear-progress__bar').count(),2);
    assert.equal(await page.evaluate(()=>!!window.PixelBlurMDC?.MDCLinearProgress),true);
   }
  }else{
   await page.waitForSelector('#main.ready');
   const headerLayout=await page.evaluate(()=>{
    const toolbar=document.querySelector('.topbar').getBoundingClientRect(),title=document.querySelector('.title').getBoundingClientRect();
    return{toolbarHeight:toolbar.height,titleLeft:title.left,titleCenter:title.top+title.height/2,toolbarCenter:toolbar.top+toolbar.height/2};
   });
   assert.equal(headerLayout.toolbarHeight,56,JSON.stringify(headerLayout));
   assert.equal(headerLayout.titleLeft,16,JSON.stringify(headerLayout));
   assert.ok(Math.abs(headerLayout.titleCenter-headerLayout.toolbarCenter)<1,JSON.stringify(headerLayout));
   assert.equal(await page.evaluate(()=>!!window.PixelBlurMDC?.MDCSwitch),true);
   assert.ok(await page.locator('.mdc-button').count()>0);
   assert.equal(await page.locator('.topbar .subtitle').count(),0);
   assert.equal(await page.locator('#hookState').innerText(),'');
   assert.equal(await page.locator('#globalState').innerText(),'');
   assert.equal(await page.locator('#systemuiState').innerText(),'');
   assert.equal(await page.locator('#launcherState').innerText(),'');
   if(mode==='light'){
    const alignment=await page.evaluate(()=>({label:document.querySelector('.restore-card .status-overview .label').getBoundingClientRect().left,button:document.getElementById('restoreButton').getBoundingClientRect().left}));
    assert.ok(Math.abs(alignment.label-alignment.button)<1,JSON.stringify(alignment));
   }
   assert.equal(await page.evaluate(()=>!!window.PixelBlurMDC?.MDCDialog),true);
   assert.equal(await page.locator('html').getAttribute('data-theme'),mode==='dark'?'dark':'light');
   if(mode==='global-off'){
    assert.equal(await page.locator('#systemui').isChecked(),false);
    assert.equal(await page.locator('#launcher').isChecked(),false);
    assert.equal(await page.locator('#systemui').isDisabled(),true);
    assert.equal(await page.locator('#launcher').isDisabled(),true);
   }
   if(mode==='dialog')assert.equal(await page.locator('#restoreDialog.mdc-dialog--open').count(),1);
   if(mode==='snackbar')assert.equal(await page.locator('#snackbar.mdc-snackbar--open').count(),1);
   if(mode==='diagnostics'){
    assert.equal(await page.locator('#diagnosticsDetails').evaluate(e=>e.open),true);
    assert.equal(await page.locator('#diag').evaluate(e=>getComputedStyle(e).userSelect),'text');
   }
  }
  const geometry=await page.evaluate(()=>{
   const header=document.querySelector('.page-header').getBoundingClientRect();
   const toolbar=document.querySelector('.topbar').getBoundingClientRect();
   const title=document.querySelector('.title'),style=getComputedStyle(title),rect=title.getBoundingClientRect();
   return{height:header.height,toolbar:toolbar.height,titleSize:style.fontSize,titleWeight:style.fontWeight,
    centerDelta:Math.abs(rect.top+rect.height/2-toolbar.top-toolbar.height/2),
    contentTop:document.getElementById(document.getElementById('main').hidden?'loadingShell':'main').getBoundingClientRect().top};
  });
  assert.equal(geometry.height,mode==='busy'||mode==='loading'?60:56,mode+JSON.stringify(geometry));
  assert.equal(geometry.contentTop,geometry.height,mode+JSON.stringify(geometry));
  assert.equal(geometry.titleSize,'20px');assert.equal(geometry.titleWeight,'500');
  assert.ok(geometry.centerDelta<1,mode+JSON.stringify(geometry));
  await page.screenshot({path:'preview-artifacts/webui-'+mode+'.png',fullPage:true});
 }
 await page.goto('http://127.0.0.1:4173/?preview=busy');
 await page.waitForSelector('#main.ready');
 await page.waitForFunction(()=>document.body.classList.contains('progress-active'));
 await page.evaluate(()=>{document.getElementById('main').scrollTop=420});
 await page.waitForTimeout(100);
 const scrollLayout=await page.evaluate(()=>{
  const header=document.querySelector('.page-header').getBoundingClientRect(),toolbar=document.querySelector('.topbar').getBoundingClientRect(),progress=document.getElementById('operationProgress').getBoundingClientRect(),main=document.getElementById('main');
  return{scrollTop:main.scrollTop,headerTop:header.top,toolbarHeight:toolbar.height,progressTop:progress.top,progressVisible:getComputedStyle(document.getElementById('operationProgress')).visibility};
 });
 assert.ok(scrollLayout.scrollTop>0,JSON.stringify(scrollLayout));
 assert.equal(scrollLayout.headerTop,0,JSON.stringify(scrollLayout));
 assert.equal(scrollLayout.toolbarHeight,56,JSON.stringify(scrollLayout));
 assert.equal(scrollLayout.progressTop,56,JSON.stringify(scrollLayout));
 assert.equal(scrollLayout.progressVisible,'visible',JSON.stringify(scrollLayout));
 await page.screenshot({path:'preview-artifacts/webui-scroll-fixed-header.png'});
 await page.goto('http://127.0.0.1:4173/?preview=light');
 await page.waitForSelector('#main.ready');
 const disclosure=page.locator('#blurMoreToggle');
 assert.equal(await disclosure.getAttribute('aria-expanded'),'false');
 assert.equal(await disclosure.locator('svg').count(),1);
 assert.equal(await disclosure.locator('.mdc-ripple-upgraded').count(),0);
 await disclosure.click();
 assert.equal(await disclosure.getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('#blurMoreContent').isVisible(),true);
 assert.equal(await disclosure.locator('svg').count(),1);
 assert.doesNotMatch(await disclosure.innerText(),/expand_(more|less)/);
 await disclosure.click();
 assert.equal(await disclosure.getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#blurMoreContent').isVisible(),false);
 await disclosure.click();
 await page.screenshot({path:'preview-artifacts/webui-disclosure-open.png',fullPage:true});
 const model=await page.evaluate(()=>{
  const m=window.PixelBlurModel;
  return{
   missing:m.parseGlobal('null','Blur supported on device: true\nBlur enabled: true'),
   zero:m.parseGlobal('0','Blur supported on device: true\nBlur enabled: false'),
   one:m.parseGlobal('1','Blur supported on device: true\nBlur enabled: true'),
   failed:m.parseGlobal('__QUERY_FAILED__',''),
   on:m.childVisual(true,true,true),
   off:m.childVisual(true,false,true),
   hookOff:m.childVisual(true,true,false)
  };
 });
 assert.equal(model.missing.explicit,null);assert.equal(model.missing.allowed,true);
 assert.equal(model.zero.explicit,'0');assert.equal(model.zero.allowed,false);
 assert.equal(model.one.explicit,'1');assert.equal(model.one.allowed,true);
 assert.equal(model.failed.allowed,null);assert.equal(model.failed.supported,null);
 assert.deepEqual(model.on,{checked:true,disabled:false});
 assert.deepEqual(model.off,{checked:false,disabled:true});
 assert.deepEqual(model.hookOff,{checked:false,disabled:true});
 const asyncChecks=await page.evaluate(async()=>{
  let callbackName='';
  window.ksu.exec=(cmd,name)=>{callbackName=name};
  const saved=Promise.resolve().then(()=>window[callbackName]);
  const result=window.PixelBlurExec('timeout-test',25).then(()=>({timeout:false}),e=>({timeout:!!e.timeout,message:e.message}));
  const late=await saved,out=await result;late?.(0,'late result','');
  const removed=typeof window[callbackName]==='undefined';
  window.ksu.exec=(cmd,name)=>{callbackName=name;throw new Error('sync failure')};
  let sync=false;try{await window.PixelBlurExec('sync-test',100)}catch(e){sync=e.message==='sync failure'}
  return{out,removed,sync,syncRemoved:typeof window[callbackName]==='undefined'};
 });
 assert.equal(asyncChecks.out.timeout,true);
 assert.match(asyncChecks.out.message,/底层命令可能仍在执行/);
 assert.equal(asyncChecks.removed,true);assert.equal(asyncChecks.sync,true);assert.equal(asyncChecks.syncRemoved,true);
 const themePage=await browser.newPage({viewport:{width:412,height:900}});
 const themeErrors=[];
 themePage.on('pageerror',e=>themeErrors.push(e.stack||e.message));
 themePage.on('console',m=>{if(m.type()==='error')themeErrors.push(m.text())});
 await themePage.addInitScript(()=>{window.ksu={exec:(cmd,name)=>{let out='';if(cmd.includes('dumpsys uimode'))out='mComputedNightMode=false';else if(cmd.includes('__WM_BEGIN__'))out='hook=1\nglobal=0\nsystemui=1\nlauncher=0\n__WM_BEGIN__\nBlur supported on device: true\nBlur enabled: true\n__WM_END__\nsystemui.pid=1234\nsystemui.hook=installed\nlauncher.pid=5678\nlauncher.hook=not_installed';setTimeout(()=>window[name](0,out,''),0)}};if(location.origin!=='null'){localStorage.setItem('pixelBlur.theme.followSystem','0');localStorage.setItem('pixelBlur.theme.manualDark','1')}});
 await themePage.goto('http://127.0.0.1:4173/');
 await themePage.waitForTimeout(500);
 console.log('Theme init state:',JSON.stringify(await themePage.evaluate(()=>({theme:document.documentElement.dataset.theme,ksu:typeof window.ksu?.exec,model:typeof window.PixelBlurModel,mainReady:document.getElementById('main').classList.contains('ready'),loadingError:document.getElementById('loadingText').textContent+' / '+document.getElementById('loadingSubtext').textContent,callback:Object.keys(window).filter(k=>k.startsWith('__pixelBlurExecCallback_'))}))),'page errors:',JSON.stringify(themeErrors));
 await themePage.waitForSelector('#main.ready');
 const lineBreaks=await themePage.evaluate(()=>({details:document.getElementById('runtimeDetails').textContent,status:document.getElementById('status').textContent}));
 assert.ok(lineBreaks.details.includes('\\n')===false);
 assert.ok(lineBreaks.details.includes('\n'));
 assert.ok(lineBreaks.status.includes('\\n')===false);
 assert.ok(lineBreaks.status.includes('\n'));
 assert.equal(await themePage.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await themePage.locator('#themeDark').isChecked(),true);
 await themePage.reload();await themePage.waitForSelector('#main.ready');
 assert.equal(await themePage.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await themePage.locator('#themeDark').isChecked(),true);
 await themePage.close();

 // Exercise initialize(), not ?preview=loading: a callback API can block before returning.
 // The old init called theme exec before adding loading-active, and status exec before RAF.
 for(const colorScheme of ['light','dark']){
  const startup=await browser.newPage({viewport:{width:412,height:900},colorScheme});
  const errors=[];
  startup.on('pageerror',error=>errors.push(error.message));
  await startup.addInitScript(()=>{
   window.__bridge={calls:[],pending:[],frames:0};
   const frame=()=>{window.__bridge.frames++;requestAnimationFrame(frame)};
   requestAnimationFrame(frame);
   window.ksu={exec:(cmd,name)=>{
    const root=document.getElementById('loadingProgress'),style=getComputedStyle(root);
    window.__bridge.calls.push({
     cmd,frames:window.__bridge.frames,active:document.body.classList.contains('loading-active'),
     ready:root.classList.contains('mdc-linear-progress--animation-ready'),
     width:root.getBoundingClientRect().width,half:parseFloat(style.getPropertyValue('--mdc-linear-progress-primary-half')),
     animation:getComputedStyle(root.querySelector('.mdc-linear-progress__primary-bar')).animationName
    });
    // Model a native invocation that holds JS before returning. Never used in production.
    const until=performance.now()+150;while(performance.now()<until){}
    if(cmd.includes('dumpsys uimode'))setTimeout(()=>window[name](0,'mComputedNightMode='+matchMedia('(prefers-color-scheme: dark)').matches,''),0);
    else window.__bridge.pending.push(name);
   }};
   window.__releaseStatus=(failed=false)=>{
    const name=window.__bridge.pending.shift();
    if(!name)throw new Error('No pending status request');
    const out='hook=1\nglobal=0\nsystemui=1\nlauncher=1\n__WM_BEGIN__\nBlur supported on device: true\nBlur enabled: true\n__WM_END__\nsystemui.pid=1234\nsystemui.hook=installed\nlauncher.pid=5678\nlauncher.hook=installed';
    window[name](failed?1:0,failed?'':out,failed?'simulated read failure':'');
   };
  });
  await startup.goto('http://127.0.0.1:4173/');
  await startup.waitForFunction(()=>window.__bridge.pending.length===1);
  const initial=await startup.evaluate(()=>window.__bridge.calls);
  for(const call of initial){
   assert.equal(call.active,true,JSON.stringify(call));
   assert.equal(call.ready,true,JSON.stringify(call));
   assert.ok(call.frames>=4,JSON.stringify(call));
   assert.ok(call.width>0&&call.half>0,JSON.stringify(call));
   assert.match(call.animation,/primary-indeterminate/,JSON.stringify(call));
  }
  async function checkMotion(){
   const sample=()=>startup.locator('#loadingProgress .mdc-linear-progress__primary-bar').evaluate(el=>({
    outer:getComputedStyle(el).transform,inner:getComputedStyle(el.firstElementChild).transform
   }));
   const before=await sample();await startup.waitForTimeout(370);const after=await sample();
   assert.notDeepEqual(before,after,'Real initialization must retain MDC translate and scale motion');
   assert.equal(await startup.locator('#operationProgress').isVisible(),false);
  }
  await checkMotion();
  await startup.screenshot({path:'preview-artifacts/webui-startup-'+colorScheme+'.png'});
  await startup.evaluate(()=>window.__releaseStatus(true));
  await startup.waitForSelector('#retryLoad',{state:'visible'});
  assert.equal(await startup.locator('#loadingProgress').isVisible(),false);
  assert.equal(await startup.locator('#loadingProgress').getAttribute('aria-hidden'),'true');
  assert.equal(await startup.locator('#loadingProgress .mdc-linear-progress__secondary-bar').isVisible(),false);
  await startup.waitForFunction(()=>getComputedStyle(document.querySelector('#loadingProgress')).opacity==='0');
  await startup.screenshot({path:'preview-artifacts/webui-startup-error-'+colorScheme+'.png'});
  await startup.locator('#retryLoad').click();
  await startup.waitForFunction(()=>window.__bridge.pending.length===1);
  await startup.waitForFunction(()=>!document.querySelector('#loadingProgress').classList.contains('mdc-linear-progress--closed'));
  await checkMotion();
  await startup.evaluate(()=>window.__releaseStatus());
  await startup.waitForSelector('#main.ready',{state:'visible'});
  await startup.waitForSelector('#loadingShell',{state:'hidden'});
  assert.equal(await startup.locator('#loadingProgress').isVisible(),false);
  assert.equal(await startup.locator('html').getAttribute('data-theme'),colorScheme);
  await startup.locator('#refresh').click();
  await startup.waitForFunction(()=>window.__bridge.pending.length===1);
  const operation=await startup.locator('#operationProgress .mdc-linear-progress__primary-bar').evaluate(el=>getComputedStyle(el).transform);
  await startup.waitForTimeout(370);
  assert.notEqual(await startup.locator('#operationProgress .mdc-linear-progress__primary-bar').evaluate(el=>getComputedStyle(el).transform),operation);
  assert.equal(await startup.locator('#loadingProgress').isVisible(),false);
  await startup.evaluate(()=>{window.__releaseStatus();window.ksu.exec=(cmd,name)=>setTimeout(()=>window[name](0,'diagnostics',''),0)});
  await startup.waitForFunction(()=>!document.body.classList.contains('progress-active'));
  assert.deepEqual(errors,[]);
  await startup.close();
 }

 // Real touch events, not preview rendering: theme and system-write paths must work independently.
 const touch=await browser.newPage({viewport:{width:412,height:900},isMobile:true,hasTouch:true});
 const touchErrors=[];
 touch.on('pageerror',error=>touchErrors.push(error.message));
 await touch.addInitScript(()=>{
  window.__interaction={frames:0,inputFrame:0,calls:[],listeners:{},intervals:[]};
  const original=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(type,listener,options){
   if(this instanceof Element&&this.matches('.mdc-dialog__button')){
    const key=(this.id||this.dataset.mdcDialogAction)+':'+type;
    window.__interaction.listeners[key]=(window.__interaction.listeners[key]||0)+1;
   }
   return original.call(this,type,listener,options);
  };
  let last=performance.now();
  const frame=now=>{window.__interaction.frames++;window.__interaction.intervals.push(now-last);last=now;requestAnimationFrame(frame)};
  requestAnimationFrame(frame);
  document.addEventListener('change',()=>{window.__interaction.inputFrame=window.__interaction.frames},true);
  document.addEventListener('click',()=>{window.__interaction.inputFrame=window.__interaction.frames},true);
  const props={'persist.sys.pixelblur.hook':'1','persist.sys.pixelblur.systemui':'1','persist.sys.pixelblur.launcher':'1'};
  let allowed=true;
  window.ksu={exec:(cmd,name)=>{
   const data=window.__interaction;
   data.calls.push({cmd,frame:data.frames,inputFrame:data.inputFrame,busy:document.body.classList.contains('busy'),
    progress:document.body.classList.contains('progress-active'),width:document.getElementById('operationProgress').getBoundingClientRect().width});
   let out='',match;
   if(cmd.includes('dumpsys uimode'))out='mComputedNightMode=false';
   else if((match=cmd.match(/^\/system\/bin\/setprop (\S+) ([01])$/)))props[match[1]]=match[2];
   else if((match=cmd.match(/^\/system\/bin\/getprop (\S+)$/)))out=props[match[1]]||'';
   else if(cmd.endsWith('global_blur.sh set allow'))allowed=true;
   else if(cmd.endsWith('global_blur.sh set deny'))allowed=false;
   else if(cmd.endsWith('global_blur.sh restore')){allowed=true;out='已恢复'}
   else if(cmd.includes('__WM_BEGIN__'))out='hook='+props['persist.sys.pixelblur.hook']+'\nglobal='+(allowed?'0':'1')+
    '\nsystemui='+props['persist.sys.pixelblur.systemui']+'\nlauncher='+props['persist.sys.pixelblur.launcher']+
    '\n__WM_BEGIN__\nBlur supported on device: true\nBlur enabled: '+allowed+
    '\n__WM_END__\nsystemui.pid=1234\nsystemui.hook=installed\nlauncher.pid=5678\nlauncher.hook=installed';
   else out='模拟诊断';
   // A short synchronous native-entry stall: production never contains this loop.
   const until=performance.now()+60;while(performance.now()<until){}
   setTimeout(()=>window[name](0,out,''),30);
  }};
 });
 await touch.goto('http://127.0.0.1:4173/');
 await touch.waitForSelector('#main.ready',{state:'visible'});
 assert.equal(await touch.locator('.page-header').evaluate(el=>el.getBoundingClientRect().height),56);
 const listeners=await touch.evaluate(()=>window.__interaction.listeners);
 for(const button of ['close','confirmRestore']){
  assert.equal(listeners[button+':focus'],1,JSON.stringify(listeners));
  assert.equal(listeners[button+':touchstart'],1,JSON.stringify(listeners));
 }
 async function tapWrite(id,expected){
  const start=await touch.evaluate(()=>window.__interaction.calls.length);
  await touch.locator('#'+id).tap();
  await touch.waitForFunction(n=>window.__interaction.calls.length>n,start);
  await touch.waitForFunction(()=>!document.body.classList.contains('busy')&&!document.body.classList.contains('progress-active'));
  const calls=await touch.evaluate(n=>window.__interaction.calls.slice(n),start);
  assert.equal(calls[0].cmd,expected,JSON.stringify(calls));
  assert.ok(calls[0].frame-calls[0].inputFrame>=2,'Write must cross painted frames: '+JSON.stringify(calls));
  assert.equal(calls[0].busy,true);assert.equal(calls[0].progress,true);assert.ok(calls[0].width>0);
  assert.equal(await touch.locator('.page-header').evaluate(el=>el.getBoundingClientRect().height),56);
  return calls;
 }
 await touch.locator('#blurMoreToggle').tap();
 for(const id of ['systemui','launcher']){
  const calls=await tapWrite(id,'/system/bin/setprop persist.sys.pixelblur.'+id+' 0');
  assert.equal(calls[1].cmd,'/system/bin/getprop persist.sys.pixelblur.'+id);
  assert.ok(calls[2].cmd.includes('__WM_BEGIN__'));
  assert.equal(await touch.locator('#'+id).isChecked(),false);
 }
 await tapWrite('hook','/system/bin/setprop persist.sys.pixelblur.hook 0');
 assert.equal(await touch.locator('#systemui').isDisabled(),true);
 await tapWrite('hook','/system/bin/setprop persist.sys.pixelblur.hook 1');
 await tapWrite('global','/system/bin/sh /data/adb/modules/pixelblur-controller/global_blur.sh set deny');
 assert.equal(await touch.locator('#launcher').isDisabled(),true);
 await tapWrite('global','/system/bin/sh /data/adb/modules/pixelblur-controller/global_blur.sh set allow');
 const themeStart=await touch.evaluate(()=>window.__interaction.calls.length);
 await touch.locator('#themeAuto').tap();
 assert.equal(await touch.locator('#themeAuto').isChecked(),false);
 assert.equal(await touch.locator('#themeDark').isDisabled(),false);
 await touch.locator('#themeDark').tap();
 assert.equal(await touch.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await touch.evaluate(()=>localStorage.getItem('pixelBlur.theme.manualDark')),'1');
 assert.equal(await touch.evaluate(()=>window.__interaction.calls.length),themeStart,'Local theme taps must not write/read system settings');
 await touch.screenshot({path:'preview-artifacts/webui-interaction-dark.png'});
 await touch.reload();await touch.waitForSelector('#main.ready',{state:'visible'});
 assert.equal(await touch.locator('html').getAttribute('data-theme'),'dark');
 await touch.locator('#themeAuto').tap();
 await touch.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 assert.equal(await touch.locator('#themeDark').isDisabled(),true);
 await touch.locator('#themeAuto').tap();
 assert.equal(await touch.locator('html').getAttribute('data-theme'),'dark','Leaving follow-system restores saved manual dark mode');
 const refreshStart=await touch.evaluate(()=>window.__interaction.calls.length);
 await touch.locator('#refresh').tap();
 await touch.waitForFunction(n=>window.__interaction.calls.length>=n+2,refreshStart);
 await touch.waitForFunction(()=>!document.body.classList.contains('progress-active'));
 const refreshCalls=await touch.evaluate(n=>window.__interaction.calls.slice(n),refreshStart);
 assert.ok(refreshCalls[0].frame-refreshCalls[0].inputFrame>=2);
 assert.equal(refreshCalls[0].progress,true);
 assert.ok(refreshCalls[0].cmd.includes('__WM_BEGIN__'));
 assert.equal(refreshCalls[1].cmd,'/system/bin/sh /data/adb/modules/pixelblur-controller/action.sh');
 await touch.locator('#restoreButton').tap();
 await touch.waitForSelector('#restoreDialog.mdc-dialog--open');
 const restoreStart=await touch.evaluate(()=>window.__interaction.calls.length);
 await touch.locator('#confirmRestore').tap();
 await touch.waitForFunction(n=>window.__interaction.calls.length>=n+3,restoreStart);
 await touch.waitForFunction(()=>!document.body.classList.contains('busy')&&!document.body.classList.contains('progress-active'));
 const restoreCalls=await touch.evaluate(n=>window.__interaction.calls.slice(n),restoreStart);
 assert.equal(restoreCalls[0].cmd,'/system/bin/sh /data/adb/modules/pixelblur-controller/global_blur.sh restore');
 assert.ok(restoreCalls[0].frame-restoreCalls[0].inputFrame>=2);
 assert.equal(restoreCalls[0].busy,true);assert.equal(restoreCalls[0].progress,true);
 // Run an actual compositor touch gesture on a long page, without firing native reads.
 await touch.locator('#blurMoreToggle').tap();
 await touch.locator('#viewDetails').tap();
 await touch.evaluate(()=>{
  document.getElementById('diag').textContent=Array.from({length:120},(_,i)=>'诊断预览 '+i).join('\n');
  document.getElementById('main').scrollTop=0;
  window.__interaction.intervals=[];
 });
 const scrollCalls=await touch.evaluate(()=>window.__interaction.calls.length);
 const session=await touch.context().newCDPSession(touch);
 // Wait for asynchronous scroll hit-testing updates, then dispatch a literal finger swipe.
 await touch.waitForSelector('#restoreDialog.mdc-dialog--closing',{state:'hidden'});
 await touch.waitForTimeout(100);
 const hit=await touch.evaluate(()=>{
  const main=document.getElementById('main'),target=document.elementFromPoint(206,650);
  return{scrollHeight:main.scrollHeight,clientHeight:main.clientHeight,target:target?.outerHTML.slice(0,160),insideMain:!!target?.closest('#main')};
 });
 console.log('Touch scroll hit test:',JSON.stringify(hit));
 assert.ok(hit.scrollHeight>hit.clientHeight,JSON.stringify(hit));
 assert.equal(hit.insideMain,true,JSON.stringify(hit));
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:206,y:650}]});
 for(let y=630;y>=250;y-=20){
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:206,y}]});
  await touch.waitForTimeout(16);
 }
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await touch.waitForTimeout(150);
 const touchScroll=await touch.evaluate(()=>{
  const main=document.getElementById('main'),header=document.querySelector('.page-header').getBoundingClientRect();
  const intervals=window.__interaction.intervals.slice(1).sort((a,b)=>a-b);
  return{scrollTop:main.scrollTop,windowY:window.scrollY,headerTop:header.top,headerHeight:header.height,
   mainTop:main.getBoundingClientRect().top,frames:intervals.length,p95:intervals[Math.floor(intervals.length*.95)],max:intervals.at(-1)};
 });
 console.log('Touch-scroll frame diagnostic (CI, not a device FPS guarantee):',JSON.stringify(touchScroll));
 assert.ok(touchScroll.scrollTop>0,JSON.stringify(touchScroll));
 assert.equal(touchScroll.headerTop,0);assert.equal(touchScroll.windowY,0);
 assert.equal(touchScroll.headerHeight,56);assert.equal(touchScroll.mainTop,56);
 assert.equal(await touch.evaluate(()=>window.__interaction.calls.length),scrollCalls);
 await touch.screenshot({path:'preview-artifacts/webui-touch-scroll.png'});
 await session.detach();
 await touch.setViewportSize({width:900,height:412});
 const landscape=await touch.evaluate(()=>{
  const bar=document.querySelector('.topbar').getBoundingClientRect(),title=document.querySelector('.title').getBoundingClientRect();
  return{height:bar.height,header:document.querySelector('.page-header').getBoundingClientRect().height,
   centerDelta:Math.abs(title.top+title.height/2-bar.top-bar.height/2),main:document.getElementById('main').getBoundingClientRect().top};
 });
 assert.equal(landscape.height,48);assert.equal(landscape.header,48);assert.equal(landscape.main,48);
 assert.ok(landscape.centerDelta<1);
 await touch.screenshot({path:'preview-artifacts/webui-landscape.png'});
 await touch.goto('http://127.0.0.1:4173/?preview=busy');
 await touch.waitForSelector('#main.ready');
 assert.equal(await touch.locator('.page-header').evaluate(el=>el.getBoundingClientRect().height),52);
 assert.equal(await touch.locator('#operationProgress').evaluate(el=>el.getBoundingClientRect().top),48);
 assert.deepEqual(touchErrors,[]);
 await touch.close();
 console.log('Real touch controls, painted feedback before native writes/refresh/restore, independent persisted themes, single dialog ripples, touch scrolling, and portrait/landscape header geometry passed.');

 const hiddenStart=await browser.newPage({viewport:{width:412,height:900}});
 await hiddenStart.addInitScript(()=>{
  window.__hidden=true;window.__nativeCalls=0;
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});
  window.ksu={exec:()=>{window.__nativeCalls++}};
 });
 await hiddenStart.goto('http://127.0.0.1:4173/');
 await hiddenStart.waitForTimeout(150);
 assert.equal(await hiddenStart.evaluate(()=>window.__nativeCalls),0,'No native reads while startup is hidden');
 await hiddenStart.evaluate(()=>{window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'))});
 await hiddenStart.waitForFunction(()=>window.__nativeCalls>0);
 assert.equal(await hiddenStart.locator('#loadingProgress').isVisible(),true);
 await hiddenStart.close();
 const reduced=await browser.newPage({viewport:{width:412,height:900},reducedMotion:'reduce'});
 await reduced.goto('http://127.0.0.1:4173/?preview=loading');
 await reduced.waitForSelector('#loadingProgress.mdc-linear-progress--animation-ready');
 assert.ok(await reduced.locator('#loadingProgress .mdc-linear-progress__primary-bar').evaluate(el=>parseFloat(getComputedStyle(el).animationDuration)<.001));
 await reduced.close();
 console.log('Real startup paint-before-bridge, slow bridge, loading/error/retry/success, operation motion, hidden startup recovery, light/dark, and reduced motion passed.');

 assert.deepEqual(pageErrors,[]);
 console.log('MDC components, light/dark/loading/error/busy/global-off/dialog/snackbar/diagnostics previews, state model, callback timeout/late callback, and manual theme persistence passed.');
}finally{await browser.close();server.close()}

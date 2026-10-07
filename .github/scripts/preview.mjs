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
    const loadingMotion=await page.evaluate(async()=>{
     if(matchMedia('(prefers-reduced-motion: reduce)').matches)return{reduced:true};
     const bar=document.querySelector('#loadingProgress .mdc-linear-progress__primary-bar .mdc-linear-progress__bar-inner');
     const before=getComputedStyle(bar).transform;
     await new Promise(resolve=>setTimeout(resolve,350));
     return{reduced:false,before,after:getComputedStyle(bar).transform};
    });
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
 assert.deepEqual(pageErrors,[]);
 console.log('MDC components, light/dark/loading/error/busy/global-off/dialog/snackbar/diagnostics previews, state model, callback timeout/late callback, and manual theme persistence passed.');
}finally{await browser.close();server.close()}

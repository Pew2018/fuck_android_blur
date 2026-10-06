import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const root=path.resolve('webroot');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
 if(!file.startsWith(root)){res.writeHead(403).end();return}
 try{const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data)}catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
 for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport:{width:412,height:1100},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:4173/?preview='+theme);
  await page.waitForSelector('#runtimeHint');
  assert.match(await page.locator('#runtimeHint').innerText(),/模拟数据/);
  const parsed=await page.evaluate(()=>{
   const m=window.PixelBlurModel;
   return {missing:m.parseGlobal('null','Window blurs are currently enabled'),zero:m.parseGlobal('0',''),one:m.parseGlobal('1',''),fail:m.parseGlobal('__QUERY_FAILED__','Window blurs are currently enabled'),installed:m.targetState(true,'123','installed'),wait:m.targetState(true,'123','not_installed'),bypass:m.targetState(false,'123','installed'),single:m.targetState(true,'','unknown'),unknown:m.targetState(true,'123','unknown')};
  });
  assert.equal(parsed.missing.explicit,null);assert.equal(parsed.missing.allowed,true);
  assert.equal(parsed.zero.explicit,'0');assert.equal(parsed.one.explicit,'1');assert.equal(parsed.fail.allowed,null);
  assert.match(parsed.installed,/Hook 已安装/);assert.match(parsed.wait,/等待目标进程重新启动/);
  assert.match(parsed.bypass,/旁路/);assert.match(parsed.single,/未运行/);assert.match(parsed.unknown,/未确认/);
  if(theme==='light'){
   await page.locator('#themeAuto').click();await page.locator('#themeDark').click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('pixelBlur.theme.followSystem')),'0');
   assert.equal(await page.evaluate(()=>localStorage.getItem('pixelBlur.theme.manualDark')),'1');
  }
  await page.screenshot({path:'preview-artifacts/pixel-blur-'+theme+'.png',fullPage:true});
  await page.close();
 }
 console.log('Model assertions passed; generated light and dark simulated previews.');
}finally{await browser.close();server.close()}

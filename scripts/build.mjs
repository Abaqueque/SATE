import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { page } from '../src/ui.js';
import { browserScript } from '../src/browser.js';
import { skyPage } from '../src/sky-ui.js';

const projectRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));
const distRoot=resolve(projectRoot,'dist');
const modules=[['sky-browser.js','sky.js'],['spectral.js','spectral.js'],['sequence-view.js','sequence-view.js'],['sequence-model.js','sequence-model.js'],['frame-cache.js','frame-cache.js'],['stack.js','stack.js'],['mosaic.js','mosaic.js'],['motion.js','motion.js']];
const sources=await Promise.all(modules.map(async([source,dest])=>[dest,await readFile(resolve(projectRoot,'src',source),'utf8')]));
let demo='{}';
try{demo=await readFile(resolve(projectRoot,'data/motion-demo.json'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
const version=createHash('sha256').update(skyPage+demo+sources.map(([,text])=>text).join('\n')).digest('hex').slice(0,12);
// One build version follows every import, avoiding mixed cached script versions.
await mkdir(resolve(distRoot,'sky'),{recursive:true});
for(const [dest,source] of sources)await writeFile(resolve(distRoot,dest),source.replace(/(from\s+['"])(\.\/[^'"]+\.js)(['"])/g,(_,a,path,b)=>a+path+'?v='+version+b));
await writeFile(resolve(distRoot,'index.html'),page);
await writeFile(resolve(distRoot,'app.js'),browserScript);
// Publish the HTML last, after all corresponding modules are written.
await writeFile(resolve(distRoot,'sky/index.html'),skyPage.replace('src="/sky.js"','src="/sky.js?v='+version+'"').replace('<script id="demo-data" type="application/json">{}</script>','<script id="demo-data" type="application/json">'+demo.replaceAll('<','\\u003c')+'</script>'));
console.log('Built '+distRoot+' · sky version '+version);

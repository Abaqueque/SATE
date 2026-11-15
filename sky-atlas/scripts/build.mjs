import {mkdir,readFile,writeFile,copyFile,cp,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceDir=fileURLToPath(new URL('../dist/',import.meta.url));
const outputDir=fileURLToPath(new URL('../build/',import.meta.url));
const source=await readFile(path.join(sourceDir,'index.html'),'utf8');
for(const [route,title] of [['explore','Sky atlas'],['contribute','Contribute'],['about','About this prototype'],['saved-cells','Saved cells']]){
 const folder=path.join(sourceDir,route);await mkdir(folder,{recursive:true});
 await writeFile(path.join(folder,'index.html'),source.replace('<title>SATE — Explore and compare space observations</title>',`<title>${title} — SATE</title>`));
}
await mkdir(path.join(sourceDir,'science'),{recursive:true});
await copyFile(new URL('../../src/spectral.js',import.meta.url),path.join(sourceDir,'science/spectral.js'));

// Keep each page's CSS, module graph, fonts and vendor dependencies in one
// content-addressed directory. Relative imports inherit the same release URL.
async function filesIn(dir,prefix=''){
 const entries=await readdir(dir,{withFileTypes:true});const files=[];
 for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
  const relative=path.join(prefix,entry.name);
  if(entry.isDirectory())files.push(...await filesIn(path.join(dir,entry.name),relative));
  else files.push(relative);
 }
 return files;
}
const files=await filesIn(sourceDir),hash=createHash('sha256');
for(const file of files){hash.update(file);hash.update('\0');hash.update(await readFile(path.join(sourceDir,file)));hash.update('\0');}
const release=hash.digest('hex').slice(0,20),prefix=`/releases/${release}`;
await rm(outputDir,{recursive:true,force:true});
// Root assets remain available for tabs opened before this deployment.
await cp(sourceDir,outputDir,{recursive:true});
await cp(sourceDir,path.join(outputDir,'releases',release),{recursive:true});
for(const file of files.filter(file=>file.endsWith('.html'))){
 const html=await readFile(path.join(sourceDir,file),'utf8');
 await writeFile(path.join(outputDir,file),html.replace(/\b(src|href)=(['"])(\/(?!\/)[^'"?]+\.(?:js|css))\2/g,(_,attr,quote,url)=>`${attr}=${quote}${prefix}${url}${quote}`));
}
console.log(`Created all four direct-entry routes with asset release ${release}.`);

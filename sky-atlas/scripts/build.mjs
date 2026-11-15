import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const source = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
for (const [route,title] of [['explore','Sky atlas'],['contribute','Contribute'],['about','About this prototype']]) {
 const folder = new URL(`../dist/${route}/`, import.meta.url);await mkdir(folder,{recursive:true});await writeFile(new URL('index.html',folder),source.replace('<title>SATE — Explore and compare space observations</title>',`<title>${title} — SATE</title>`));
}
console.log('Created all three direct-entry routes.');

await mkdir(new URL('../dist/science',import.meta.url),{recursive:true});
await copyFile(new URL('../../src/spectral.js',import.meta.url),new URL('../dist/science/spectral.js',import.meta.url));

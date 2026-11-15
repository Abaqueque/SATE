import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {wavelengthShortcuts,wavelengthOptions} from '../sky-atlas/dist/wavelength-options.js';
const metadata=JSON.parse(await readFile(new URL('../sky-atlas/dist/assets/spherex-survey.json',import.meta.url)));
test('familiar band shortcuts select the nearest real channel with accurate labels',()=>{
 const shortcuts=wavelengthShortcuts(metadata.wavelengths);
 assert.deepEqual(shortcuts.map(s=>s.index),[21,34,45,63,90]);
 assert.deepEqual(shortcuts.map(s=>s.wavelength),[1.224,1.656,2.139,3.383,4.6]);
 for(const shortcut of shortcuts)assert(shortcut.name.startsWith('Near '));
 const markup=wavelengthOptions(metadata.wavelengths,{modes:true});
 const all=markup.split('label="All wavelengths (102)"')[1].split('</optgroup>')[0];
 assert.equal([...all.matchAll(/<option value="\d+"/g)].length,102);
 assert(markup.indexOf('Common wavelengths')<markup.indexOf('All wavelengths (102)'));
 assert(markup.includes('value="all"'));assert(markup.includes('value="mix"'));
});
test('shortcut selection follows metadata changes and excludes unavailable atlas channels',()=>{
 const waves=[1.2,1.25,1.66,2.16,3.4,4.6];
 assert.equal(wavelengthShortcuts(waves)[0].index,1);
 assert.equal(wavelengthShortcuts(waves,[1])[0].index,0);
 assert.deepEqual(wavelengthShortcuts(waves,[0,1,2,3,4,5]),[]);
 assert(wavelengthOptions(waves,{disabled:[1]}).includes('value="1" disabled'));
});

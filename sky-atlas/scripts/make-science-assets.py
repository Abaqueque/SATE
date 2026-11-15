from pathlib import Path
import json,numpy as np
from astropy.io import fits
import matplotlib
matplotlib.use('Agg')
from matplotlib.colors import PowerNorm
import matplotlib.pyplot as plt
root=Path(__file__).resolve().parents[1]
p=root.parent/'work/strong-change-search/1614441617741179008';out=root/'dist/assets'
with fits.open(p/'registered.fits') as h:ims=np.stack([h[1].data,h[2].data])
# Native measured arrays, shared display stretch, fixed sky crop. No synthetic sources.
a=ims[:,60:101,60:101]
norm=PowerNorm(gamma=.65,vmin=0,vmax=float(np.nanmax(a)),clip=True)
cmap=plt.get_cmap('gray').copy();cmap.set_bad('#17252b')
for i in range(2):plt.imsave(out/f'mira-{i+1}.png',np.flipud(a[i]),cmap=cmap,norm=norm) if False else plt.imsave(out/f'mira-{i+1}.png',cmap(norm(np.flipud(a[i]))))
cats=json.loads((p/'catalog-annotations.json').read_text());visible=[]
for ep in cats:
 visible.append([{**{k:e[k] for k in ['catalog','id','position_status']},'x':(e['x']-60)/40*100,'y':(100-e['y'])/40*100} for e in ep if 60<=e['x']<=100 and 60<=e['y']<=100])
info={'name':'J1502099+593125','type':'Known Mira variable','ra':225.5412877331217,'dec':59.52246540221818,'dates':['30 Nov 2025','9–21 Jun 2026'],'ratio':.20812577434207352,'catalogs':visible,'field_arcsec':60,'native_pixel_arcsec':6.15,'notes':'Two matched spectral samples per epoch. Shared stretch and support. June is a 12-day window. Asteroid/comet completeness unresolved.','observations':[{k:r[k] for k in ['date_avg_utc','wcs_wave_approx_um']}|{'obsid':r['exposure']['obs_id'],'url':r['exposure']['url']} for r in json.loads((p/'short-results.json').read_text())]}
(out/'mira.json').write_text(json.dumps(info,separators=(',',':')))
# Compact real bright-star positions used only as atlas context.
stars=json.loads((out/'stars.6.json').read_text())
(out/'stars.json').write_text(json.dumps([[f['geometry']['coordinates'][0]%360,f['geometry']['coordinates'][1],f['properties']['mag']] for f in stars['features']],separators=(',',':')))
print('Exported measured frames, catalog overlays, provenance and',len(stars['features']),'context stars.')

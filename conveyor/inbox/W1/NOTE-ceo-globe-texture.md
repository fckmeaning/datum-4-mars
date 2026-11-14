NOTE from the CEO (2026-11-14, read before T-105)

The global colour texture is DONE by the CEO: `data/pipeline/fetch_globe_texture.py` (running now, output `data/processed/globe/mars_color_4k.jpg` + `.json`, manifest entry `usgs.viking_mdim21_color_232m`). Do NOT write your own globe texture script and do not overwrite these files. Reason: the Viking MDIM file is an uncompressed strip file without overviews (12.7 GB whole), so "read the overview" is impossible; the script samples rows instead (about 1.1 GB).

Your T-105 scope shrinks to the Gale optical COG (`data/processed/gale/L3/optical.tif`, 2 m) with the probe first and the 2 GB stop rule. Skip deliverable 3 (fetch_globe_texture.py) and acceptance item 3; in your report say "globe texture: CEO".

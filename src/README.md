# 3D site atlas (home page)

`atlas.js` is the source for `js/atlas.js`: a procedural construction-site model built with three.js (r187). It has no external 3D assets.

Rebuild after editing:

```bash
npm i three@0.187.0 esbuild
npx esbuild src/atlas.js --bundle --minify --format=iife --target=es2019 --outfile=js/atlas.js
```

The chapter text (test names and IS standards) is plain HTML in `index.html` (`.atlas-ch`). Edit it there; the 3D reads zones from `data-zone`.

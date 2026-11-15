# 3D site atlas (home page)

`atlas.js` is the source for `js/atlas.js`: a procedural construction-site model built with three.js (r187). It has no external 3D assets.

Rebuild after editing:

```bash
npm i three@0.187.0 esbuild
npx esbuild src/atlas.js --bundle --minify --format=iife --target=es2019 --outfile=js/atlas.js
```

The chapter text (test names and IS standards) is plain HTML in `index.html` (`.atlas-ch`). Edit it there; the 3D reads zones from `data-zone`.

# 3D test labs (service pages)

`lab3d.js` is the source for `js/lab3d.js`: 16 animated test demonstrations (two per service). Each page's tabs, steps and explanations are plain HTML in the `<section class="lab">` block of that page; `lab_content.py` is the content source used to generate them. Values shown in the demos are labelled as illustrative.

Build both bundles:

```bash
npx esbuild src/atlas.js --bundle --minify --format=iife --target=es2019 --outfile=js/atlas.js
npx esbuild src/lab3d.js --bundle --minify --format=iife --target=es2019 --outfile=js/lab3d.js
```

`img/3d/*.webp` are studio renders of these same models (used on the home journey, service heroes and page heroes).

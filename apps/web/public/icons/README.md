# PWA icons

The manifest references `/icons/icon.svg` only. Modern Android Chrome accepts
SVG icons, but some older Android browsers and certain app-store flows still
expect rasterised PNGs (`192x192`, `512x512`).

When you're ready to ship, generate the PNG variants from the SVG and add
them back to `public/manifest.json`:

```bash
# Requires ImageMagick installed locally
cd apps/web/public/icons
convert -background none icon.svg -resize 192x192 icon-192.png
convert -background none icon.svg -resize 512x512 icon-512.png
```

Then re-add the icon entries to `manifest.json`:

```json
{ "src": "/icons/icon-192.png", "type": "image/png", "sizes": "192x192", "purpose": "any" },
{ "src": "/icons/icon-512.png", "type": "image/png", "sizes": "512x512", "purpose": "any maskable" }
```

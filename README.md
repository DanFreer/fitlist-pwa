# Fit List PWA

A minimal Progressive Web App shell for organizing family gift and clothing details.

## Project structure

- `public/` — static PWA assets served by the app
  - `index.html` — main app shell
  - `styles.css` — extracted app styles
  - `app.js` — application logic and runtime
  - `sw.js` — service worker for offline caching
  - `manifest.json` — web app manifest
  - `icon-192.png`, `icon-512.png` — PWA icons

## Local development

Install dependencies once:

```bash
npm install
```

Start a local server:

```bash
npm start
```

Then open `http://localhost:4173` in your browser.

## Notes

- The service worker caches the main app shell and fonts.
- `manifest.json` is configured for `standalone` display and local scope.
- Changes to `public/app.js` or `public/styles.css` are loaded directly when the page refreshes.

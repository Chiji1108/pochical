# Try

How the prototype at try.pochical.app (`apps/try`) behaves once it is opened, as an installable web app added to a phone's home screen. The native apps do not read this; it is here because the prototype's offline start and updates are behavior a person sees.

## Offline

- After its first visit, the app opens and works without the network: the calendar, the patterns, the groups and the chat as the prototype draws them, from the data it keeps on the device. Any path opens it, as one opened online does (every path that is no file draws the app).
- A service worker (Workbox's, written by vite-plugin-pwa at build time) keeps the app shell and its build: `index.html`, the scripts and styles, the images the app draws (the icon, the poodle), the manifest and its icons. The prototype uses no web fonts. iOS's launch images are not kept, as iOS reads them only when the app is added.
- Nothing from other sites is kept. Offline, the sample photos (picsum.photos) show as missing, and the emoji picker shows what it last kept itself, or nothing if it never loaded.

## Updates

- A new build is fetched in the background when the app is opened online, and takes effect at the next launch once no page of the old build is open. The person is not told or asked; an open page keeps the build it started with, so it never loses a part it has yet to load.

## Search

- try is kept out of search until release by `index.html`'s `noindex, nofollow`; `robots.txt` lets crawlers in so they read it (a page shut out there can still be listed from links). The service worker adds no pages.

# DebutYard icons

Generated from the mark in `src/config/logo.ts` (a rounded, notched stage
triangle on a brand disc). If the mark changes, regenerate every file here and
`public/favicon.ico` from it.

| File                                                 | Use                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `../favicon.ico`                                     | 16, 32 and 48 px, legacy browsers                               |
| `icon.svg`                                           | Modern browsers; switches to the mint/dark palette in dark mode |
| `favicon-16.png`, `favicon-32.png`, `favicon-48.png` | PNG favicons                                                    |
| `apple-touch-icon.png`                               | iOS home screen (180 px, full bleed)                            |
| `icon-192.png`, `icon-512.png`                       | Web app manifest                                                |
| `maskable-192.png`, `maskable-512.png`               | Android adaptive icons (mark inside the safe zone)              |
| `mstile-150.png`                                     | Windows tiles (`../browserconfig.xml`)                          |
| `safari-pinned-tab.svg`                              | Safari pinned tabs (single colour)                              |
| `logo-mark.svg`, `logo-mark-dark.svg`                | The mark for press kits and embeds                              |

## Logos

`../logos/` holds the full logo, the mark then the name, in the homepage's colours, as SVG and PNG:

| File                                     | Use                                       |
| ---------------------------------------- | ----------------------------------------- |
| `logo-white`                             | On a white background                     |
| `logo-black`                             | On the site's dark background (`#0d1714`) |
| `logo-transparent-for-light-backgrounds` | No background, dark name                  |
| `logo-transparent-for-dark-backgrounds`  | No background, light name                 |

`../og-image.png` (1200×630) is the site's default social share image.

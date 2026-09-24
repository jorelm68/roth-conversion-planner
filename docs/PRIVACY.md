# Privacy and data handling

**Short version:** everything you type is processed in your browser's memory and disappears when you close or reload the tab. The site has no server code, no database, no accounts, no analytics and no tracking. The Excel report is generated in your browser and saved to *your* device, and importing one reads it locally without uploading it.

## How this is enforced (not just promised)

| Layer | What it does |
| --- | --- |
| **Static site** | `next.config.ts` uses `output: "export"`. The deployment is plain HTML/JS/CSS files. There is no API route or server function that could receive your inputs. |
| **Content-Security-Policy** (`vercel.json`) | `connect-src 'none'` makes the browser refuse every `fetch`/XHR/WebSocket/beacon from the page, including from the calculation Web Worker. `form-action 'none'` blocks form posts. `default-src 'self'` blocks third-party scripts, images and fonts. |
| **No storage** | The code never uses cookies, `localStorage`, `sessionStorage`, IndexedDB or caches, and never writes inputs into the URL. Inputs live only in React state. Text fields set `autocomplete="off"` so browsers are less likely to offer to save them. |
| **No third parties** | No analytics, error-reporting, fonts or CDNs. Nothing is loaded from another domain. |
| **Automated guard** | `src/__tests__/privacy.test.ts` fails the build's test run if anyone adds a network call, storage API, external URL, analytics dependency, or weakens the CSP. |
| **Excel export** | Built in memory with `exceljs` from a Blob and saved through the browser's download mechanism. Nothing is uploaded. |
| **Excel import** | The file you pick (or drop) is read with the browser's File API and parsed in memory. It is never uploaded or stored; only the settings are copied into the form. |

## What the hosting provider can still see

Like any website, Vercel's infrastructure processes ordinary web-request metadata when your browser downloads the page (IP address, timestamp, user agent, the URL of the page and its static files). Your **inputs and results are never part of any request**, so they cannot appear in those logs. Do not enable Vercel Analytics / Speed Insights or any logging integration on this project; the privacy test above will flag the npm packages that do that.

## What is outside the site's control

* **Files you download.** The Excel report contains your personal financial details. Store it securely; deleting it is up to you.
* **Your device and browser.** Browser extensions, screen recorders, shared computers, and browser features such as form-autofill history or page-translation services can see what you type. Use a private window on a shared machine.
* **Screenshots / printouts** you make.

## Changing this

If a future feature needs a network call or persistence (for example, saving scenarios), it must be opt-in, disclosed on the page, and this document and the privacy test must be updated deliberately.

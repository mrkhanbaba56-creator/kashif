# kashu.ecomauto

A free, local-first seller workspace for Meesho, Flipkart, Amazon and other marketplaces.

## Included tools

- **Smart Listing Maker** — product title, five feature bullets, description and search terms in English or easy Hinglish.
- **Profit Calculator** — product cost, shipping, packaging, platform fee, GST on fee, returns, RTO and ad-cost estimate.
- **Marketplace Image Studio** — multi-image resize, background canvas, JPG/WebP compression target (35–500 KB), and Pack/Set/New Product stickers.
- **SKU & Rate Card** — local product cost, selling price, margin and stock records with CSV export.
- **Order Analytics** — CSV upload for delivered revenue, estimated profit and return/RTO rate.
- **Smart Autofill Profile** — reusable seller information, workspace backup/restore and a companion Chrome extension.
- **Installable PWA** — works as a lightweight desktop/mobile app after first load.

## Privacy and safety

Business data is stored in the browser with `localStorage`. Uploaded images and CSV files are processed locally and are not sent to a server. The extension fills only matching empty fields on supported pages. It does not read or store passwords, cookies or login tokens.

Always review generated text, fee calculations and autofilled fields before publishing a listing. Marketplace forms, fee slabs and policies can change.

## Run locally

Because the app uses JavaScript modules and a service worker, serve the folder over HTTP:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Test

Requires Node.js 18 or newer:

```bash
npm test
```

## Publish with GitHub Pages

1. Open repository **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose the branch and `/ (root)`, then save.

## Chrome extension

Installation instructions are in [`extension/README.md`](extension/README.md).

## License

MIT — free to use, customize and share.

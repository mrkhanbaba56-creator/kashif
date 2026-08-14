# kashu.ecomauto

A free seller automation and account-handling workspace for Meesho, Flipkart, Amazon and other marketplaces. There are no paid plans, licence checks or trial limits in the code.

## Included tools

- **Smart Listing Maker** — product title, five feature bullets, description and search terms in English or easy Hinglish.
- **Profit Calculator** — product cost, shipping, packaging, platform fee, GST on fee, returns, RTO and ad-cost estimate.
- **Marketplace Image Studio** — multi-image resize, background canvas, JPG/WebP compression target (35–500 KB), and Pack/Set/New Product stickers.
- **SKU & Rate Card** — local product cost, selling price, margin and stock records with CSV export.
- **Order Analytics** — CSV upload for delivered revenue, estimated profit and return/RTO rate.
- **Smart Autofill Profile** — reusable seller information, workspace backup/restore and a companion Chrome extension.
- **Free Signup** — email/password accounts using the Supabase free tier; no payment or card flow.
- **Admin, Agent and Seller roles** — the owner controls roles, seller-to-agent assignments and account-handling requests.
- **Listing Capture Automation** — capture safe filled product fields in one supported seller form and reuse them in another.
- **Installable PWA** — works as a lightweight desktop/mobile app after first load.

## Privacy and safety

Product tools, images and imported CSV files are processed locally in the browser. When the optional free account backend is connected, account profiles, agent assignments and work requests are stored in the owner's Supabase project. The extension fills only matching empty fields and explicitly excludes password, OTP, token, banking and identity fields. It does not read or store cookies or login tokens.

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

## Enable free signup and agent control

Follow [`supabase/SETUP.md`](supabase/SETUP.md). The setup uses Supabase Auth, Row Level Security and the included SQL schema. Every new account starts as a Seller; only the Admin can promote users to Agent or Admin and assign sellers.

## Chrome extension

Installation instructions are in [`extension/README.md`](extension/README.md).

## License

MIT — free to use, customize and share. No payment or subscription system is included.

# LocalSubs Website

The project page for [LocalSubs](https://github.com/aiden1020/localsubs), deployed to Cloudflare Workers at `https://localsubs.aidenw.me`.

## Stack

- React 19 and the Next.js App Router API
- vinext on Vite
- Cloudflare Workers
- Tailwind CSS 4

## Local development

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run lint
npm test
npm run preview
```

## Deployment

The production Worker is named `localsubs-site`. Its source configuration is in `wrangler.jsonc`; vinext generates the production Worker configuration under `dist/server/` during the build.

Deploy manually after authenticating Wrangler:

```bash
npm run deploy
```

Cloudflare Workers Builds should use:

- Root directory: `/website`
- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`
- Included build path: `website/**`

The custom domain route is declared as `localsubs.aidenw.me`. Cloudflare manages the corresponding DNS record and TLS certificate when the Worker is deployed to an account that owns the `aidenw.me` zone.

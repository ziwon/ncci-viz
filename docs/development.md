# Development and deployment

[Back to NCCL Lab](../README.md)

The app is a static React, TypeScript, and Vite project. CI uses Node.js 24.

## Run checks

```sh
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
```

`npm run check` runs the unit tests, TypeScript checks, and production build. Unit tests cover collective results, bandwidth definitions, log parsing, and comparison eligibility.

Chromium tests cover playback, final-frame completion, numeric inputs, transfer scrolling, reduced motion, JSON export, mobile navigation, and benchmark imports. Playwright starts a server on port 5173. Outside CI, it reuses an existing local development server if one is available.

## Deploy to Cloudflare Pages

The production site is [nccl-viz.pages.dev](https://nccl-viz.pages.dev). The Pages project connects to the `main` branch of [ziwon/ncci-viz](https://github.com/ziwon/ncci-viz).

| Setting | Value |
| --- | --- |
| Project | `nccl-viz` |
| Build command | `npm run check` |
| Output directory | `dist` |
| Build environment | `NODE_VERSION=24` |

GitHub Actions runs unit tests, a production build, and Chromium tests on pushes to `main` and pull requests. Cloudflare builds independently and publishes after its own `npm run check` succeeds. It does not wait for the GitHub Actions browser tests. Other repository branches receive preview deployments.

The Git integration does not require a Cloudflare API token in GitHub Actions.

For a manual deployment, authenticate Wrangler and run:

```sh
npx wrangler login
npm run deploy
```

The `predeploy` script runs unit tests and builds the site before Wrangler uploads `dist`. Wrangler uses the current Git branch. Deploy from `main` to update production. Local credentials and Wrangler state are excluded from version control.

## Source map

| File | Responsibility |
| --- | --- |
| [`simulation.ts`](../src/simulation.ts) | Schedules, buffer state, cost model, URL configuration, and NCCL code examples |
| [`App.tsx`](../src/App.tsx) | Simulator, topology, comparison, and collective reference views |
| [`ConfigInputs.tsx`](../src/ConfigInputs.tsx) | Numeric input drafts, validation feedback, and unit conversion |
| [`benchmark.ts`](../src/benchmark.ts) | Log parsing, metadata, and comparison eligibility |
| [`BenchmarkPanel.tsx`](../src/BenchmarkPanel.tsx) | Browser-local imports and measured/model comparison |
| [`styles.css`](../src/styles.css) | Visual tokens, responsive layout, and reduced-motion behavior |
| [`i18n.ts`](../src/i18n.ts) | Initial English message dictionary |
| [`tests/`](../tests/) | Chromium interaction tests |

Additional inline UI strings still need extraction before full localization. The visual direction is documented in [DESIGN.md](../DESIGN.md).

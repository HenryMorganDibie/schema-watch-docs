# Schema-Watch documentation

[![verify-docs](https://github.com/HenryMorganDibie/schema-watch-docs/actions/workflows/verify-docs.yml/badge.svg)](https://github.com/HenryMorganDibie/schema-watch-docs/actions/workflows/verify-docs.yml)

Source for the Schema-Watch documentation site, built with
[Thally](https://docs.thally.io) and published on Thally Cloud.

Schema-Watch itself lives at
[github.com/HenryMorganDibie/schema-watch](https://github.com/HenryMorganDibie/schema-watch).

## Layout

| Path | Purpose |
| --- | --- |
| `src/content/introduction.mdx` | What Schema-Watch does and who it is for |
| `src/content/quickstart.mdx` | Capture a contract and catch a breaking change in five minutes |
| `src/content/guides/ci-contract-check.mdx` | Gate pull requests with GitHub Actions |
| `src/content/reference/cli.mdx` | Commands, flags, and exit codes |
| `src/content/api/introduction.mdx` + `openapi.yaml` | The local dashboard API, one generated page per operation |
| `src/content/guides/how-this-site-was-built.mdx` | How this site was built, step by step |
| `docs.json` | Tabs, sidebar groups, and page order |
| `src/data/site.ts` | Site name, description, links, and brand |

## Work locally

Requires Node.js 22.

```bash
npm install
npm run dev            # http://localhost:3040
```

Before pushing:

```bash
npx --yes @thallylabs/cli@latest check
npm run build
```

Pushing to `main` triggers a managed deployment on Thally Cloud.

## Keeping the docs accurate

`scripts/verify-docs.sh` replays every published command against the real
`schema-watch` npm package and checks 36 documented outputs and exit codes:
the quickstart, its troubleshooting errors, the local API, and the CI guide's
workflow.

```bash
bash scripts/verify-docs.sh          # latest release
bash scripts/verify-docs.sh 0.1.0    # a specific version
```

The `verify-docs` workflow runs it on every pull request that touches content,
on Node.js 22 and 24, and every Monday, so a CLI release that changes a quoted
output fails the build before a reader notices.

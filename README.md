# Schema-Watch documentation

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

Every command on these pages was run against `schema-watch@0.1.0`. After a CLI
release, re-run the quickstart end to end and update any output that changed.

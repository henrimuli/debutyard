<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Production database: hands off

`DATABASE_URL_MASTER` and `DIRECT_DATABASE_URL_MASTER` point at the real production database. They exist only for `pnpm db:migrate --master` (and `pnpm db:status --master`), run by the owner. Never use them for testing of any kind: not tests, seeds, dev servers, scripts or one-off queries, and never run `--master` unless the owner asks for it.

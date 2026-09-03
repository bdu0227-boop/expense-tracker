# Expense Tracker MCP — Cloudflare V1.1

This folder deploys the Expense Tracker as a stateless MCP server on Cloudflare Workers with D1 persistence.

## 1. Create the D1 database

Install/login to Wrangler, then run:

```bash
npx wrangler login
npx wrangler d1 create expense-tracker-db
```

Copy the returned `database_id` into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`.

## 2. Apply the schema

From this directory:

```bash
npx wrangler d1 migrations apply EXPENSES_DB --remote
```

## 3. Install and deploy

```bash
npm install
npm run deploy
```

Cloudflare will return a `workers.dev` URL such as:

`https://expense-tracker-mcp.<your-subdomain>.workers.dev`

The MCP endpoint is:

`https://expense-tracker-mcp.<your-subdomain>.workers.dev/mcp`

Health check:

`https://expense-tracker-mcp.<your-subdomain>.workers.dev/health`

## 4. ChatGPT

Add the `/mcp` URL as a custom MCP app in ChatGPT Developer Mode if that feature is available on your ChatGPT plan/workspace.

## Security

This V1.1 endpoint is intentionally simple. Before treating it as a production personal-finance service, add authentication/OAuth and consider a per-user data partition. Never put API tokens or credentials in GitHub.

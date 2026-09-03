# Expense Tracker MCP — Cloudflare V1.1

This is the Cloudflare Workers + D1 version of the Expense Tracker. It exposes a remote MCP endpoint at `/mcp` and uses D1 for persistent server-side storage.

## Why Cloudflare

The previous Render + SQLite design is not appropriate for a free, persistent deployment because Render Free does not provide persistent disks. Cloudflare Workers can bind directly to D1, and Cloudflare's current MCP guidance recommends `createMcpHandler()` for new stateless remote MCP servers.

## Files

- `src/index.ts` — MCP server and D1 queries
- `wrangler.jsonc` — Worker + D1 configuration
- `package.json` — dependencies/scripts

## Deploy

### 1. Cloudflare account

Create/sign in to a Cloudflare account.

### 2. Connect GitHub

In Cloudflare Dashboard, go to **Workers & Pages → Create application → Import an existing Git repository**, select `bdu0227-boop/expense-tracker`, and set the project root/build working directory to `cloudflare`.

Use:

- Build command: `npm install`
- Deploy command: `npx wrangler deploy`

The Wrangler configuration declares the D1 binding `DB` and database name `expense-tracker-db`. Current Wrangler supports automatic provisioning of D1 resources when the binding has no database ID; if the dashboard asks you to create the database, approve that step.

### 3. Worker URL

After deployment Cloudflare will provide a `*.workers.dev` URL. The MCP endpoint is:

`https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/mcp`

Health check:

`https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/health`

## Important security note

This V1.1 server intentionally starts without OAuth so the infrastructure can be tested first. **Do not put sensitive real household expenses into a public deployment until OAuth is enabled.** The next hardening step should use `@cloudflare/workers-oauth-provider` with an identity provider and user-scoped authorization.

Cloudflare's MCP authorization documentation recommends OAuth 2.1 for protected remote MCP servers.

## ChatGPT

Once the endpoint is live, use ChatGPT's supported custom MCP/App flow to connect the `/mcp` endpoint. Availability of write-capable custom MCP apps depends on the ChatGPT plan/workspace and current OpenAI product permissions.

## Local development

From `cloudflare/`:

```bash
npm install
npx wrangler dev
```

Wrangler can open a local development server. D1 local state is stored by Wrangler during development.

## Production data

D1 is the persistent data layer for this Worker. The schema is initialized automatically on first tool call. All queries use parameter binding.

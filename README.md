# ChatGPT Expense Tracker

MCP backend for a personal/family expense tracker.

## Tools

- add_expense_tool
- get_expenses_tool
- get_monthly_summary_tool
- set_budget_tool
- budget_vs_actual_tool
- forecast_next_three_months_tool

## Deploy

This repo includes a `Dockerfile` and `render.yaml` for Render deployment.

The MCP endpoint is:

`https://YOUR-SERVICE.onrender.com/mcp`

Health check:

`https://YOUR-SERVICE.onrender.com/health`

## Important storage note

V1.1 uses SQLite on a persistent disk. Do not deploy without a persistent disk if you need data to survive restarts. For multi-user production use, replace SQLite with PostgreSQL and add authentication.

## ChatGPT

After deployment, add the remote MCP endpoint as a custom app in ChatGPT Developer Mode if your ChatGPT plan/workspace supports custom MCP apps. Use the `/mcp` endpoint, not `/health`.

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env {
  DB: D1Database;
}

const schema = `
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  purpose TEXT NOT NULL,
  category TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT '未说明',
  scope TEXT NOT NULL DEFAULT '自己',
  person TEXT NOT NULL DEFAULT '自己',
  currency TEXT NOT NULL DEFAULT 'CNY',
  source TEXT NOT NULL DEFAULT 'chat',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_person ON expenses(person);
CREATE TABLE IF NOT EXISTS budgets (
  month TEXT PRIMARY KEY,
  budget REAL NOT NULL CHECK(budget >= 0),
  currency TEXT NOT NULL DEFAULT 'CNY'
);
`;

async function initDb(db: D1Database) {
  await db.exec(schema);
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function serverFor(env: Env) {
  const server = new McpServer({ name: "Expense Tracker", version: "1.1.0" });

  server.registerTool(
    "add_expense",
    {
      description: "Record a personal or family expense. Amount must be positive. Date is YYYY-MM-DD; defaults to today.",
      inputSchema: {
        amount: z.number().positive(),
        purpose: z.string().min(1),
        category: z.enum(["餐饮", "交通", "购物", "娱乐", "账单", "其他"]).default("其他"),
        date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
        payment_method: z.string().default("未说明"),
        scope: z.enum(["自己", "家庭"]).default("自己"),
        person: z.string().default("自己"),
        currency: z.string().default("CNY")
      }
    },
    async ({ amount, purpose, category, date, payment_method, scope, person, currency }) => {
      await initDb(env.DB);
      const expenseDate = date ?? new Date().toISOString().slice(0, 10);
      const result = await env.DB.prepare(`
        INSERT INTO expenses (date, amount, purpose, category, payment_method, scope, person, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(expenseDate, amount, purpose, category, payment_method, scope, person, currency).run();
      return text({ ok: true, id: result.meta.last_row_id, date: expenseDate, amount, purpose, category, payment_method, scope, person, currency });
    }
  );

  server.registerTool(
    "get_expenses",
    {
      description: "Query expense records by optional date range, category, person, and limit.",
      inputSchema: {
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        category: z.string().optional(),
        person: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100)
      }
    },
    async ({ start_date, end_date, category, person, limit }) => {
      await initDb(env.DB);
      let sql = "SELECT * FROM expenses WHERE 1=1";
      const args: unknown[] = [];
      if (start_date) { sql += " AND date >= ?"; args.push(start_date); }
      if (end_date) { sql += " AND date <= ?"; args.push(end_date); }
      if (category) { sql += " AND category = ?"; args.push(category); }
      if (person) { sql += " AND person = ?"; args.push(person); }
      sql += " ORDER BY date DESC, id DESC LIMIT ?";
      args.push(limit);
      const rows = await env.DB.prepare(sql).bind(...args).all();
      return text(rows.results);
    }
  );

  server.registerTool(
    "get_monthly_summary",
    {
      description: "Return total spending and category/person breakdown for a YYYY-MM month.",
      inputSchema: { month: z.string().regex(/^\\d{4}-\\d{2}$/) }
    },
    async ({ month }) => {
      await initDb(env.DB);
      const total = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE substr(date,1,7)=?").bind(month).first();
      const breakdown = await env.DB.prepare(`
        SELECT category, person, SUM(amount) AS total, COUNT(*) AS count
        FROM expenses WHERE substr(date,1,7)=?
        GROUP BY category, person ORDER BY total DESC
      `).bind(month).all();
      return text({ month, total: Number(total?.total ?? 0), breakdown: breakdown.results });
    }
  );

  server.registerTool(
    "set_budget",
    {
      description: "Set or replace a monthly budget for YYYY-MM.",
      inputSchema: { month: z.string().regex(/^\\d{4}-\\d{2}$/), budget: z.number().min(0), currency: z.string().default("CNY") }
    },
    async ({ month, budget, currency }) => {
      await initDb(env.DB);
      await env.DB.prepare(`INSERT INTO budgets(month,budget,currency) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET budget=excluded.budget,currency=excluded.currency`).bind(month, budget, currency).run();
      return text({ ok: true, month, budget, currency });
    }
  );

  server.registerTool(
    "budget_vs_actual",
    {
      description: "Compare actual spending with the saved budget for YYYY-MM.",
      inputSchema: { month: z.string().regex(/^\\d{4}-\\d{2}$/) }
    },
    async ({ month }) => {
      await initDb(env.DB);
      const b = await env.DB.prepare("SELECT * FROM budgets WHERE month=?").bind(month).first();
      const a = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE substr(date,1,7)=?").bind(month).first();
      const actual = Number(a?.total ?? 0);
      if (!b) return text({ month, budget: null, actual, status: "未设置预算" });
      const budget = Number(b.budget);
      return text({ month, budget, actual, variance: budget - actual, status: budget >= actual ? "剩余" : "超支", currency: b.currency });
    }
  );

  server.registerTool(
    "forecast_next_three_months",
    {
      description: "Estimate the next three months from historical monthly spending using a transparent recent-average baseline.",
      inputSchema: {}
    },
    async () => {
      await initDb(env.DB);
      const rows = await env.DB.prepare(`SELECT substr(date,1,7) AS month, SUM(amount) AS total FROM expenses GROUP BY substr(date,1,7) ORDER BY month`).all();
      if (rows.results.length < 2) return text({ status: "insufficient_data", message: "至少需要2个月历史数据才能做基础预测。", history: rows.results });
      const recent = rows.results.slice(-3).map((r: any) => Number(r.total));
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const last = String((rows.results.at(-1) as any).month);
      let [year, month] = last.split("-").map(Number);
      const forecast = [];
      for (let i = 0; i < 3; i++) { month++; if (month === 13) { year++; month = 1; } forecast.push({ month: `${year}-${String(month).padStart(2,"0")}`, estimate: Math.round(avg * 100) / 100 }); }
      return text({ status: "ok", method: "recent_month_average", history: rows.results, forecast, note: "估算，不是保证。" });
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/health") return new Response("ok", { status: 200 });
    const handler = createMcpHandler(() => serverFor(env));
    return handler(request, env, ctx);
  }
};

import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

type Env = { EXPENSES_DB: D1Database };

const category = z.enum(["餐饮", "交通", "购物", "娱乐", "账单", "其他"]);

function text(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function createServer(env: Env) {
  const server = new McpServer({ name: "Expense Tracker", version: "1.1.0" });

  server.registerTool("add_expense", {
    description: "Record a personal or family expense. Amount is positive. Date uses YYYY-MM-DD and defaults to today.",
    inputSchema: {
      amount: z.number().positive(),
      purpose: z.string().min(1),
      category,
      expense_date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
      payment_method: z.string().default("未说明"),
      scope: z.enum(["自己", "家庭"]).default("自己"),
      person: z.string().default("自己"),
      currency: z.string().default("CNY")
    }
  }, async ({ amount, purpose, category, expense_date, payment_method, scope, person, currency }) => {
    const d = expense_date ?? new Date().toISOString().slice(0, 10);
    const result = await env.EXPENSES_DB.prepare(
      `INSERT INTO expenses (date,amount,purpose,category,payment_method,scope,person,currency) VALUES (?,?,?,?,?,?,?,?)`
    ).bind(d, amount, purpose, category, payment_method, scope, person, currency).run();
    return { content: [{ type: "text", text: text({ ok: true, id: result.meta.last_row_id, amount, purpose, category, payment_method, scope, person, currency }) }] };
  });

  server.registerTool("get_expenses", {
    description: "Query expense records by optional date range, category, person, and limit.",
    inputSchema: {
      start_date: z.string().optional(),
      end_date: z.string().optional(),
      category: category.optional(),
      person: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100)
    }
  }, async ({ start_date, end_date, category, person, limit }) => {
    let sql = "SELECT id,date,amount,purpose,category,payment_method,scope,person,currency FROM expenses WHERE 1=1";
    const args: unknown[] = [];
    if (start_date) { sql += " AND date >= ?"; args.push(start_date); }
    if (end_date) { sql += " AND date <= ?"; args.push(end_date); }
    if (category) { sql += " AND category = ?"; args.push(category); }
    if (person) { sql += " AND person = ?"; args.push(person); }
    sql += " ORDER BY date DESC, id DESC LIMIT ?"; args.push(limit);
    const result = await env.EXPENSES_DB.prepare(sql).bind(...args).all();
    return { content: [{ type: "text", text: text(result.results) }] };
  });

  server.registerTool("get_monthly_summary", {
    description: "Return total spending and category/person breakdown for a YYYY-MM month.",
    inputSchema: { month: z.string().regex(/^\\d{4}-\\d{2}$/) }
  }, async ({ month }) => {
    const total = await env.EXPENSES_DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE substr(date,1,7)=?").bind(month).first();
    const breakdown = await env.EXPENSES_DB.prepare("SELECT category,person,SUM(amount) total,COUNT(*) count FROM expenses WHERE substr(date,1,7)=? GROUP BY category,person ORDER BY total DESC").bind(month).all();
    return { content: [{ type: "text", text: text({ month, total: total?.total ?? 0, breakdown: breakdown.results }) }] };
  });

  server.registerTool("set_budget", {
    description: "Set the monthly spending budget for YYYY-MM.",
    inputSchema: { month: z.string().regex(/^\\d{4}-\\d{2}$/), budget: z.number().min(0), currency: z.string().default("CNY") }
  }, async ({ month, budget, currency }) => {
    await env.EXPENSES_DB.prepare("INSERT INTO budgets(month,budget,currency) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET budget=excluded.budget,currency=excluded.currency").bind(month, budget, currency).run();
    return { content: [{ type: "text", text: text({ ok: true, month, budget, currency }) }] };
  });

  server.registerTool("budget_vs_actual", {
    description: "Compare saved budget with actual spending for a YYYY-MM month.",
    inputSchema: { month: z.string().regex(/^\\d{4}-\\d{2}$/) }
  }, async ({ month }) => {
    const b = await env.EXPENSES_DB.prepare("SELECT budget,currency FROM budgets WHERE month=?").bind(month).first<{budget:number,currency:string}>();
    const a = await env.EXPENSES_DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE substr(date,1,7)=?").bind(month).first<{total:number}>();
    const actual = Number(a?.total ?? 0);
    if (!b) return { content: [{ type: "text", text: text({ month, budget: null, actual, status: "未设置预算" }) }] };
    const variance = Number(b.budget) - actual;
    return { content: [{ type: "text", text: text({ month, budget: b.budget, actual, variance, status: variance >= 0 ? "剩余" : "超支", currency: b.currency }) }] };
  });

  server.registerTool("forecast_next_three_months", {
    description: "Estimate the next three months from historical monthly spending. Requires at least two months of history.",
    inputSchema: {}
  }, async () => {
    const rows = await env.EXPENSES_DB.prepare("SELECT substr(date,1,7) month,SUM(amount) total FROM expenses GROUP BY substr(date,1,7) ORDER BY month").all<{month:string,total:number}>();
    if (rows.results.length < 2) return { content: [{ type: "text", text: text({ status: "insufficient_data", message: "至少需要2个月历史数据才能做基础预测。", history: rows.results }) }] };
    const recent = rows.results.slice(-3).map(r => Number(r.total));
    const avg = recent.reduce((a,b)=>a+b,0) / recent.length;
    const last = rows.results[rows.results.length-1].month;
    let [y,m] = last.split("-").map(Number);
    const forecast = [];
    for (let i=0;i<3;i++) { m++; if (m===13){y++;m=1;} forecast.push({month:`${y}-${String(m).padStart(2,"0")}`, estimate:Number(avg.toFixed(2))}); }
    return { content: [{ type: "text", text: text({ status:"ok", method:"recent_month_average", history:rows.results, forecast, note:"估算，不是保证。" }) }] };
  });

  return server;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok", { status: 200 });
    if (url.pathname.startsWith("/mcp")) return createMcpHandler(() => createServer(env))(request, env, ctx);
    return new Response("Expense Tracker MCP V1.1", { status: 200 });
  }
};

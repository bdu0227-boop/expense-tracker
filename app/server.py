import os
from mcp.server.fastmcp import FastMCP
from .db import init_db, add_expense, list_expenses, monthly_summary, set_budget, budget_vs_actual, monthly_totals

mcp = FastMCP("Expense Tracker", stateless_http=True, json_response=True)
init_db()

@mcp.tool()
def add_expense_tool(amount: float, purpose: str, category: str = "其他", expense_date: str = "", payment_method: str = "未说明", scope: str = "自己", person: str = "自己", currency: str = "CNY") -> dict:
    """Record one expense. Amount must be positive."""
    eid=add_expense(amount,purpose,category,expense_date or None,payment_method,scope,person,currency)
    return {"id":eid,"amount":amount,"purpose":purpose,"category":category,"payment_method":payment_method,"scope":scope,"person":person,"currency":currency}

@mcp.tool()
def get_expenses_tool(start_date: str = "", end_date: str = "", category: str = "", person: str = "", limit: int = 100) -> list:
    """Query stored expenses with optional filters."""
    return list_expenses(start_date or None,end_date or None,category or None,person or None,limit)

@mcp.tool()
def get_monthly_summary_tool(month: str) -> dict:
    """Return total and category/person breakdown for YYYY-MM."""
    return monthly_summary(month)

@mcp.tool()
def set_budget_tool(month: str, budget: float, currency: str = "CNY") -> dict:
    """Set the monthly budget for YYYY-MM."""
    if budget < 0: raise ValueError("budget must be non-negative")
    set_budget(month,budget,currency)
    return budget_vs_actual(month)

@mcp.tool()
def budget_vs_actual_tool(month: str) -> dict:
    """Compare actual spending with the saved monthly budget."""
    return budget_vs_actual(month)

@mcp.tool()
def forecast_next_three_months_tool() -> dict:
    """Estimate the next three months using the average of the latest three available months."""
    rows=monthly_totals()
    if len(rows)<2: return {"status":"insufficient_data","message":"至少需要2个月历史数据才能做基础预测。","history":rows}
    values=[float(r["total"]) for r in rows[-3:]]; avg=sum(values)/len(values)
    y,m=map(int,rows[-1]["month"].split("-")); forecast=[]
    for _ in range(3):
        m+=1
        if m==13: y+=1; m=1
        forecast.append({"month":f"{y:04d}-{m:02d}","estimate":round(avg,2)})
    return {"status":"ok","method":"latest_3_month_average","history":rows,"forecast":forecast,"note":"估算，不是保证。"}

@mcp.custom_route("/health", methods=["GET"])
async def health(request):
    from starlette.responses import JSONResponse
    return JSONResponse({"status":"ok","service":"expense-tracker"})

if __name__ == "__main__":
    port=int(os.getenv("PORT","8000"))
    mcp.run(transport="streamable-http",host="0.0.0.0",port=port)

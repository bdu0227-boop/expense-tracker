import os
import sqlite3
from datetime import date
from pathlib import Path

DB_PATH = Path(os.getenv("DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "expenses.db")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

CATEGORIES = {"餐饮", "交通", "购物", "娱乐", "账单", "其他"}

def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    with connect() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            purpose TEXT NOT NULL,
            category TEXT NOT NULL,
            payment_method TEXT NOT NULL DEFAULT '未说明',
            scope TEXT NOT NULL DEFAULT '自己',
            person TEXT NOT NULL DEFAULT '自己',
            currency TEXT NOT NULL DEFAULT 'CNY',
            source TEXT NOT NULL DEFAULT 'chat'
        )""")
        con.execute("""CREATE TABLE IF NOT EXISTS budgets (
            month TEXT PRIMARY KEY,
            budget REAL NOT NULL CHECK(budget >= 0),
            currency TEXT NOT NULL DEFAULT 'CNY'
        )""")

def add_expense(amount, purpose, category="其他", expense_date=None, payment_method="未说明", scope="自己", person="自己", currency="CNY"):
    if amount <= 0: raise ValueError("amount must be positive")
    category = category if category in CATEGORIES else "其他"
    expense_date = expense_date or date.today().isoformat()
    with connect() as con:
        cur = con.execute("INSERT INTO expenses(date,amount,purpose,category,payment_method,scope,person,currency) VALUES(?,?,?,?,?,?,?,?)", (expense_date,amount,purpose,category,payment_method,scope,person,currency))
        return cur.lastrowid

def list_expenses(start_date=None, end_date=None, category=None, person=None, limit=100):
    sql="SELECT * FROM expenses WHERE 1=1"; args=[]
    if start_date: sql += " AND date >= ?"; args.append(start_date)
    if end_date: sql += " AND date <= ?"; args.append(end_date)
    if category: sql += " AND category = ?"; args.append(category)
    if person: sql += " AND person = ?"; args.append(person)
    sql += " ORDER BY date DESC, id DESC LIMIT ?"; args.append(min(max(limit,1),1000))
    with connect() as con: return [dict(r) for r in con.execute(sql,args).fetchall()]

def monthly_summary(month):
    with connect() as con:
        total=con.execute("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE substr(date,1,7)=?",(month,)).fetchone()["total"]
        rows=con.execute("SELECT category,person,SUM(amount) total,COUNT(*) count FROM expenses WHERE substr(date,1,7)=? GROUP BY category,person ORDER BY total DESC",(month,)).fetchall()
    return {"month":month,"total":total,"breakdown":[dict(r) for r in rows]}

def set_budget(month,budget,currency="CNY"):
    with connect() as con: con.execute("INSERT INTO budgets(month,budget,currency) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET budget=excluded.budget,currency=excluded.currency",(month,budget,currency))

def budget_vs_actual(month):
    with connect() as con:
        b=con.execute("SELECT * FROM budgets WHERE month=?",(month,)).fetchone(); actual=con.execute("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE substr(date,1,7)=?",(month,)).fetchone()["total"]
    if not b: return {"month":month,"budget":None,"actual":actual,"variance":None,"status":"未设置预算"}
    variance=b["budget"]-actual
    return {"month":month,"budget":b["budget"],"actual":actual,"variance":variance,"status":"剩余" if variance>=0 else "超支","currency":b["currency"]}

def monthly_totals():
    with connect() as con: return [dict(r) for r in con.execute("SELECT substr(date,1,7) month,SUM(amount) total FROM expenses GROUP BY substr(date,1,7) ORDER BY month").fetchall()]

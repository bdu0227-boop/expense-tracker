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

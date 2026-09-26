# Expense Approval & Department Budget Monitoring Database System

A 3NF-normalized relational database architecture designed to eliminate manual spreadsheet and email processing, enforce department budget limits, identify high-value outflows, and eliminate pending approval bottlenecks.

🌐 **Interactive Live Preview:** [https://ayushhh7.github.io/HACKRONYX_VORTEX/](https://ayushhh7.github.io/HACKRONYX_VORTEX/)

---

## 📁 Submission Directory Structure

```text
├── database/
│   ├── schema_mysql.sql        # Standard MySQL 8.0+ / MariaDB DDL schema
│   ├── schema_postgresql.sql   # PostgreSQL 13+ DDL schema (with PL/pgSQL triggers & views)
│   ├── schema_sqlite.sql       # Portable SQLite 3 DDL schema
│   ├── seed_data.sql           # Realistic enterprise seed data (6 depts, 14 users, Q3 budgets, claims)
│   ├── analytical_queries.sql  # 10 core business queries solving the problem statement
│   └── expense_system.db       # Pre-compiled, ready-to-inspect SQLite database file
│
└── docs/
    ├── DATABASE_DESIGN_DOCUMENT.md # Full technical specification, Mermaid ERD, Normalization proofs
    └── COMPETITION_DEFENSE_GUIDE.md # 60-second judge pitch & answers to tough questions
```

---

## 🗄️ Relational Schema Summary (3NF Certified)

| # | Table Name | Purpose | Primary Key | Foreign Keys & Unique Constraints |
|---|---|---|---|---|
| 1 | `departments` | Cost centers with configurable `high_value_threshold` | `department_id` | `UNIQUE(department_code)`, FK to `users` |
| 2 | `users` | Role-based users with organizational reporting lines | `user_id` | `UNIQUE(employee_code)`, `UNIQUE(email)`, Self-FK `manager_id` |
| 3 | `department_budgets` | Quarterly budget allocations, spent, & reserved amounts | `budget_id` | `UNIQUE(department_id, fiscal_year, quarter)` |
| 4 | `expense_categories`| GL accounting codes and policy rules | `category_id` | `UNIQUE(code)`, `UNIQUE(category_name)` |
| 5 | `expense_claims` | Master claim submissions with auto `is_high_value` flag | `claim_id` | `UNIQUE(claim_number)`, FKs to `users`, `departments`, `budgets` |
| 6 | `expense_items` | 1-to-Many itemized receipts, vendors, dates, and amounts | `item_id` | FK to `expense_claims` (CASCADE), FK to `categories` |
| 7 | `approval_workflows`| Multi-tier sequential approval chain with SLA deadlines | `workflow_id` | `UNIQUE(claim_id, step_order)`, FKs to `claims`, `users` |
| 8 | `budget_ledger` | Double-entry financial audit trail of all allocations & spends | `ledger_id` | FKs to `budgets`, `claims`, `users` |
| 9 | `audit_logs` | Forensic change-capture log recording old/new JSON states | `log_id` | FK to `users` |

---

## 📊 Analytical Views Included

1. **`v_department_budget_health`**: Real-time allocated vs. spent vs. reserved vs. remaining headroom with dynamic status flags (`HEALTHY`, `WARNING`, `CRITICAL`).
2. **`v_pending_approvals`**: Tracks approvals awaiting action, current reviewer, days elapsed, and automated `SLA_BREACHED` flags.
3. **`v_high_value_expenses`**: Filters transactions exceeding department thresholds requiring CFO review.
4. **`v_employee_spending_summary`**: Aggregates employee spending patterns, claim volumes, and approval ratios.

---

## 🚀 How to Execute

### Option A: SQLite (Immediate Inspection)
The database is already built in `database/expense_system.db`.
To inspect or rerun:
```bash
sqlite3 database/expense_system.db < database/schema_sqlite.sql
sqlite3 database/expense_system.db < database/seed_data.sql
```

### Option B: MySQL
```bash
mysql -u root -p < database/schema_mysql.sql
mysql -u root -p < database/seed_data.sql
```

### Option C: PostgreSQL
```bash
psql -U postgres -d postgres -f database/schema_postgresql.sql
psql -U postgres -d postgres -f database/seed_data.sql
```

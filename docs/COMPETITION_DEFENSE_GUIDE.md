# Competition Presentation & Defense Guide
## How to Pitch and Defend Your Database Design to Judges

---

## 🎯 1. The 60-Second Elevator Pitch
> *"Judges, manual spreadsheets and email approval chains fail because they lack real-time state, concurrency control, and auditability. 
> 
> Our database architecture solves this with three core innovations:
> 1. **Automated High-Value Escalation**: Every department defines its own configurable monetary threshold. Any expense exceeding it automatically triggers secondary executive/CFO approvals through our state-machine workflow table.
> 2. **Two-Phase Budget Encumbrance**: Rather than only recording spent money after the fact, our system reserves budget headroom the second an expense is submitted, preventing accidental department overspending.
> 3. **Proactive SLA & Pending Approval Tracking**: Instead of claims rotting in inboxes, our `approval_workflows` table tracks sequential steps with strict SLA deadlines, auto-calculating turnaround time and flagging SLA breaches.
> 
> It is fully 3NF-normalized, fortified with foreign-key constraints and B-tree indexes, and equipped with analytical views providing instant executive visibility."*

---

## 💡 2. Mapping Problem Statements to Schema Features

| Problem In Statement | Specific Schema Solution | Code / Table Reference |
|---|---|---|
| *"Organizations often process through spreadsheets & email"* | Fully centralized 3NF relational model with role-based users and structured claims. | Tables: `departments`, `users`, `expense_claims`, `expense_items` |
| *"Difficult to monitor department budget"* | Quarterly budget ledger with spent vs reserved balances, threshold percentages (80% warning, 95% critical), and live view. | Table: `department_budgets`<br>Table: `budget_ledger`<br>View: `v_department_budget_health` |
| *"Identify high value expenses"* | Dynamic threshold per department + trigger to auto-flag high value + dedicated surveillance view. | Column: `departments.high_value_threshold`<br>Trigger: `trg_update_claim_total`<br>View: `v_high_value_expenses` |
| *"Track pending approval"* | Multi-tier sequential approval workflow with assigned approvers, deadline timestamps, and SLA breach indicators. | Table: `approval_workflows`<br>View: `v_pending_approvals`<br>Query 2: SLA aging monitor |

---

## 🛡️ 3. How to Answer Judges' Tough Questions

### Q1: *"How does your database handle concurrency if two employees submit $10,000 expenses at the exact same second for a budget with only $12,000 left?"*
**Answer**:
> *"We implement a **Two-Phase Budget Encumbrance protocol** inside a transactional boundary (`BEGIN TRANSACTION` with row-level locking `SELECT ... FOR UPDATE` on `department_budgets`). The first transaction locks the budget row, checks `(spent_amount + reserved_amount + proposed_amount) <= allocated_amount`, increments `reserved_amount`, commits, and releases the lock. The second transaction immediately detects that remaining headroom is now only $2,000, and is safely rejected or placed into an over-budget review queue. This prevents race conditions and overdrafts."*

---

### Q2: *"Why did you separate `expense_claims` and `expense_items`?"*
**Answer**:
> *"To maintain **First and Second Normal Form (1NF & 2NF)**. A single business trip or project claim frequently contains multiple itemized expenses across different vendors, dates, tax amounts, and categories (e.g., flight ticket, hotel stay, team meal). Separating them allows:
> 1. Multi-category General Ledger mapping per claim.
> 2. Per-item receipt attachments and item-level validation.
> 3. Independent analytics on merchants and expense categories without duplicate data anomalies."*

---

### Q3: *"How do you handle employees submitting expenses for past or future dates?"*
**Answer**:
> *"We enforce integrity through **CHECK constraints**:
> - `amount > 0` and `tax_amount >= 0`
> - `fiscal_year >= 2020` and `quarter BETWEEN 1 AND 4`
> - Status check constraints guaranteeing only valid states are inserted.
> In addition, application layer rules cross-check `item_date` against the active budget fiscal quarter."*

---

### Q4: *"How is approval tracking better than just a `status` column on the expense table?"*
**Answer**:
> *"A simple status column cannot represent **multi-tier sequential approvals** or provide an audit trail. 
> With our `approval_workflows` table:
> 1. We know exactly which step of the chain we are on (e.g. Step 1: Direct Manager → Step 2: Department Head → Step 3: CFO).
> 2. We record specific approval deadlines (`deadline_at`) for SLA tracking.
> 3. We record individual reviewer comments, timestamps, and escalation flags without overwriting previous approvals."*

---

### Q5: *"Can your design scale to tens of thousands of employees?"*
**Answer**:
> *"Yes. We strategically designed B-Tree indexes on all high-frequency filter paths:
> - Composite index on `(department_id, fiscal_year, quarter)` for instantaneous budget balance lookups.
> - Index on `(approver_id, status)` for sub-millisecond manager inbox rendering.
> - Partial / B-tree index on `is_high_value` and `status` so analytical dashboards bypass scanning millions of historical records."*

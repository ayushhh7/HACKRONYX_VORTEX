-- ==============================================================================
-- ENTERPRISE EXPENSE APPROVAL & DEPARTMENT BUDGET MONITORING SYSTEM
-- Dialect: SQLite 3 (Ultra-portable, zero configuration, instant execution)
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- Drop views if re-running
DROP VIEW IF EXISTS v_employee_spending_summary;
DROP VIEW IF EXISTS v_high_value_expenses;
DROP VIEW IF EXISTS v_department_budget_health;
DROP VIEW IF EXISTS v_pending_approvals;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS budget_ledger;
DROP TABLE IF EXISTS approval_workflows;
DROP TABLE IF EXISTS expense_items;
DROP TABLE IF EXISTS expense_claims;
DROP TABLE IF EXISTS expense_categories;
DROP TABLE IF EXISTS department_budgets;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS departments;

-- ------------------------------------------------------------------------------
-- 1. DEPARTMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE departments (
    department_id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    manager_id INTEGER NULL,
    high_value_threshold REAL NOT NULL DEFAULT 1000.00 CHECK (high_value_threshold > 0),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 2. USERS
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL CHECK (
        role IN ('EMPLOYEE', 'MANAGER', 'DEPARTMENT_HEAD', 'FINANCE_ADMIN', 'CFO', 'AUDITOR')
    ),
    department_id INTEGER NOT NULL,
    manager_id INTEGER NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
    FOREIGN KEY (manager_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 3. EXPENSE CATEGORIES
-- ------------------------------------------------------------------------------
CREATE TABLE expense_categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    category_name TEXT NOT NULL UNIQUE,
    description TEXT,
    gl_account_code TEXT NOT NULL,
    requires_receipt INTEGER NOT NULL DEFAULT 1,
    max_single_item_limit REAL NULL,
    requires_executive_approval INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. DEPARTMENT BUDGETS
-- ------------------------------------------------------------------------------
CREATE TABLE department_budgets (
    budget_id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL,
    fiscal_year INTEGER NOT NULL CHECK (fiscal_year >= 2020),
    quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
    spent_amount REAL NOT NULL DEFAULT 0.00 CHECK (spent_amount >= 0),
    reserved_amount REAL NOT NULL DEFAULT 0.00 CHECK (reserved_amount >= 0),
    warning_threshold_pct REAL NOT NULL DEFAULT 80.00 CHECK (warning_threshold_pct BETWEEN 1 AND 100),
    critical_threshold_pct REAL NOT NULL DEFAULT 95.00 CHECK (critical_threshold_pct BETWEEN 1 AND 100),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'FROZEN', 'CLOSED')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (department_id, fiscal_year, quarter),
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------------------------
-- 5. EXPENSE CLAIMS (REPORTS)
-- ------------------------------------------------------------------------------
CREATE TABLE expense_claims (
    claim_id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_number TEXT NOT NULL UNIQUE,
    employee_id INTEGER NOT NULL,
    department_id INTEGER NOT NULL,
    budget_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (
        status IN (
            'DRAFT',
            'SUBMITTED',
            'PENDING_MANAGER',
            'PENDING_FINANCE',
            'PENDING_CFO',
            'APPROVED',
            'REJECTED',
            'REIMBURSED',
            'CANCELLED'
        )
    ),
    is_high_value INTEGER NOT NULL DEFAULT 0,
    high_value_reason TEXT NULL,
    business_justification TEXT NOT NULL,
    submission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME NULL,
    reimbursed_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
    FOREIGN KEY (budget_id) REFERENCES department_budgets(budget_id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------------------------
-- 6. EXPENSE ITEMS (LINE ITEMS)
-- ------------------------------------------------------------------------------
CREATE TABLE expense_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    item_date DATE NOT NULL,
    merchant_name TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    tax_amount REAL NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    receipt_url TEXT,
    receipt_filename TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES expense_claims(claim_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES expense_categories(category_id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------------------------
-- 7. APPROVAL WORKFLOWS & SLA TRACKING
-- ------------------------------------------------------------------------------
CREATE TABLE approval_workflows (
    workflow_id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_id INTEGER NOT NULL,
    step_order INTEGER NOT NULL CHECK (step_order >= 1),
    approver_id INTEGER NOT NULL,
    approver_role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'DELEGATED')
    ),
    comments TEXT,
    deadline_at DATETIME NOT NULL,
    action_taken_at DATETIME NULL,
    is_escalated INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (claim_id, step_order),
    FOREIGN KEY (claim_id) REFERENCES expense_claims(claim_id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES users(user_id) ON DELETE RESTRICT
);

-- ------------------------------------------------------------------------------
-- 8. BUDGET LEDGER
-- ------------------------------------------------------------------------------
CREATE TABLE budget_ledger (
    ledger_id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_id INTEGER NOT NULL,
    claim_id INTEGER NULL,
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN ('ALLOCATION', 'RESERVATION', 'COMMITMENT', 'RELEASE', 'ADJUSTMENT')
    ),
    amount REAL NOT NULL,
    spent_snapshot REAL NOT NULL,
    reserved_snapshot REAL NOT NULL,
    balance_remaining REAL NOT NULL,
    recorded_by INTEGER NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (budget_id) REFERENCES department_budgets(budget_id) ON DELETE CASCADE,
    FOREIGN KEY (claim_id) REFERENCES expense_claims(claim_id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_name TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    performed_by INTEGER NULL,
    old_state TEXT NULL,
    new_state TEXT NULL,
    client_ip TEXT DEFAULT '127.0.0.1',
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX idx_users_dept ON users(department_id);
CREATE INDEX idx_users_manager ON users(manager_id);
CREATE INDEX idx_dept_budgets_dept ON department_budgets(department_id, fiscal_year, quarter);
CREATE INDEX idx_claims_status ON expense_claims(status);
CREATE INDEX idx_claims_dept ON expense_claims(department_id);
CREATE INDEX idx_claims_employee ON expense_claims(employee_id);
CREATE INDEX idx_claims_high_value ON expense_claims(is_high_value);
CREATE INDEX idx_workflows_claim ON approval_workflows(claim_id);
CREATE INDEX idx_workflows_approver_status ON approval_workflows(approver_id, status);

-- ------------------------------------------------------------------------------
-- VIEW 1: DEPARTMENT BUDGET HEALTH & UTILIZATION
-- ------------------------------------------------------------------------------
CREATE VIEW v_department_budget_health AS
SELECT 
    b.budget_id,
    d.department_code,
    d.name AS department_name,
    u.full_name AS department_manager,
    b.fiscal_year,
    b.quarter,
    b.allocated_amount,
    b.spent_amount,
    b.reserved_amount,
    (b.spent_amount + b.reserved_amount) AS total_committed_amount,
    (b.allocated_amount - (b.spent_amount + b.reserved_amount)) AS available_remaining,
    ROUND(((b.spent_amount + b.reserved_amount) / b.allocated_amount * 100), 2) AS utilization_pct,
    b.warning_threshold_pct,
    b.critical_threshold_pct,
    CASE 
        WHEN (b.spent_amount + b.reserved_amount) > b.allocated_amount THEN 'OVER_BUDGET'
        WHEN ((b.spent_amount + b.reserved_amount) / b.allocated_amount * 100) >= b.critical_threshold_pct THEN 'CRITICAL'
        WHEN ((b.spent_amount + b.reserved_amount) / b.allocated_amount * 100) >= b.warning_threshold_pct THEN 'WARNING'
        ELSE 'HEALTHY'
    END AS budget_health_status,
    b.status AS budget_status
FROM department_budgets b
JOIN departments d ON b.department_id = d.department_id
LEFT JOIN users u ON d.manager_id = u.user_id;

-- ------------------------------------------------------------------------------
-- VIEW 2: PENDING APPROVALS MONITOR WITH SLA & AGING
-- ------------------------------------------------------------------------------
CREATE VIEW v_pending_approvals AS
SELECT 
    w.workflow_id,
    c.claim_id,
    c.claim_number,
    c.title AS claim_title,
    c.total_amount,
    c.is_high_value,
    e.full_name AS submitter_name,
    e.email AS submitter_email,
    d.name AS department_name,
    w.step_order,
    w.approver_role,
    a.full_name AS assigned_approver_name,
    a.email AS assigned_approver_email,
    c.submission_date,
    w.deadline_at,
    ROUND((julianday('now') - julianday(c.submission_date)), 1) AS days_pending,
    CASE 
        WHEN datetime('now') > datetime(w.deadline_at) THEN 'SLA_BREACHED'
        WHEN datetime('now') > datetime(w.deadline_at, '-1 day') THEN 'SLA_WARNING'
        ELSE 'ON_TRACK'
    END AS sla_status,
    w.status AS workflow_status
FROM approval_workflows w
JOIN expense_claims c ON w.claim_id = c.claim_id
JOIN users e ON c.employee_id = e.user_id
JOIN departments d ON c.department_id = d.department_id
JOIN users a ON w.approver_id = a.user_id
WHERE w.status = 'PENDING';

-- ------------------------------------------------------------------------------
-- VIEW 3: HIGH-VALUE EXPENSE SURVEILLANCE
-- ------------------------------------------------------------------------------
CREATE VIEW v_high_value_expenses AS
SELECT 
    c.claim_id,
    c.claim_number,
    c.title,
    c.total_amount,
    d.name AS department_name,
    d.high_value_threshold AS department_threshold,
    u.full_name AS submitted_by,
    c.status AS claim_status,
    c.high_value_reason,
    c.submission_date,
    COUNT(i.item_id) AS total_items,
    MAX(i.amount) AS largest_item_amount
FROM expense_claims c
JOIN departments d ON c.department_id = d.department_id
JOIN users u ON c.employee_id = u.user_id
LEFT JOIN expense_items i ON c.claim_id = i.claim_id
WHERE c.is_high_value = 1 OR c.total_amount >= d.high_value_threshold
GROUP BY c.claim_id;

-- ------------------------------------------------------------------------------
-- VIEW 4: EMPLOYEE SPEND & COMPLIANCE SUMMARY
-- ------------------------------------------------------------------------------
CREATE VIEW v_employee_spending_summary AS
SELECT 
    u.user_id,
    u.employee_code,
    u.full_name,
    d.name AS department_name,
    COUNT(c.claim_id) AS total_claims_submitted,
    COALESCE(SUM(c.total_amount), 0.00) AS total_claimed_amount,
    COALESCE(SUM(CASE WHEN c.status IN ('APPROVED', 'REIMBURSED') THEN c.total_amount ELSE 0 END), 0.00) AS total_approved_amount,
    SUM(CASE WHEN c.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_claims_count,
    SUM(CASE WHEN c.is_high_value = 1 THEN 1 ELSE 0 END) AS high_value_claims_count
FROM users u
JOIN departments d ON u.department_id = d.department_id
LEFT JOIN expense_claims c ON u.user_id = c.employee_id
GROUP BY u.user_id;

-- ------------------------------------------------------------------------------
-- TRIGGERS: AUTO-SYNC TOTAL AMOUNT & HIGH VALUE FLAG
-- ------------------------------------------------------------------------------
CREATE TRIGGER trg_item_insert_update_claim
AFTER INSERT ON expense_items
BEGIN
    UPDATE expense_claims
    SET total_amount = (SELECT COALESCE(SUM(amount), 0.00) FROM expense_items WHERE claim_id = NEW.claim_id),
        is_high_value = CASE 
            WHEN (SELECT COALESCE(SUM(amount), 0.00) FROM expense_items WHERE claim_id = NEW.claim_id) >= (
                SELECT high_value_threshold FROM departments WHERE department_id = expense_claims.department_id
            ) THEN 1 
            ELSE expense_claims.is_high_value 
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE claim_id = NEW.claim_id;
END;

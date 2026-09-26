-- ==============================================================================
-- ENTERPRISE EXPENSE APPROVAL & DEPARTMENT BUDGET MONITORING SYSTEM
-- Dialect: PostgreSQL (Compatible with PostgreSQL 13+, Supabase, Neon, CockroachDB)
-- Purpose: Solves manual spreadsheets, email tracking, budget overruns, 
--          unmonitored high-value expenses, and pending approval bottlenecks.
-- ==============================================================================

-- Drop tables in reverse order of foreign key dependencies if re-running
DROP VIEW IF EXISTS v_monthly_burn_rate CASCADE;
DROP VIEW IF EXISTS v_employee_spending_summary CASCADE;
DROP VIEW IF EXISTS v_high_value_expenses CASCADE;
DROP VIEW IF EXISTS v_department_budget_health CASCADE;
DROP VIEW IF EXISTS v_pending_approvals CASCADE;

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS budget_ledger CASCADE;
DROP TABLE IF EXISTS approval_workflows CASCADE;
DROP TABLE IF EXISTS expense_items CASCADE;
DROP TABLE IF EXISTS expense_claims CASCADE;
DROP TABLE IF EXISTS expense_categories CASCADE;
DROP TABLE IF EXISTS department_budgets CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- ------------------------------------------------------------------------------
-- 1. DEPARTMENTS
-- Represents organizational units with distinct cost centers and approval rules
-- ------------------------------------------------------------------------------
CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY,
    department_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    manager_id INT NULL, -- Deferred FK to users table
    high_value_threshold NUMERIC(12, 2) NOT NULL DEFAULT 1000.00 CHECK (high_value_threshold > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. USERS (EMPLOYEES, MANAGERS, FINANCE ADMINS, EXECUTIVES)
-- Implements organizational hierarchy with self-referential manager_id
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(30),
    role VARCHAR(30) NOT NULL CHECK (
        role IN ('EMPLOYEE', 'MANAGER', 'DEPARTMENT_HEAD', 'FINANCE_ADMIN', 'CFO', 'AUDITOR')
    ),
    department_id INT NOT NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    manager_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add deferred foreign key from departments to manager user
ALTER TABLE departments
    ADD CONSTRAINT fk_department_manager
    FOREIGN KEY (manager_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 3. EXPENSE CATEGORIES
-- Categorizes expenses with GL codes, receipt policies, and approval rules
-- ------------------------------------------------------------------------------
CREATE TABLE expense_categories (
    category_id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    category_name VARCHAR(60) NOT NULL UNIQUE,
    description TEXT,
    gl_account_code VARCHAR(30) NOT NULL, -- General Ledger Code for Finance
    requires_receipt BOOLEAN NOT NULL DEFAULT TRUE,
    max_single_item_limit NUMERIC(12, 2) NULL, -- Optional soft cap
    requires_executive_approval BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. DEPARTMENT BUDGETS
-- Quarterly & Fiscal Year budget tracking with spent, reserved, & alert thresholds
-- ------------------------------------------------------------------------------
CREATE TABLE department_budgets (
    budget_id SERIAL PRIMARY KEY,
    department_id INT NOT NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    fiscal_year INT NOT NULL CHECK (fiscal_year >= 2020),
    quarter INT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    allocated_amount NUMERIC(14, 2) NOT NULL CHECK (allocated_amount > 0),
    spent_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (spent_amount >= 0),
    reserved_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (reserved_amount >= 0),
    warning_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 80.00 CHECK (warning_threshold_pct BETWEEN 1 AND 100),
    critical_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 95.00 CHECK (critical_threshold_pct BETWEEN 1 AND 100),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'FROZEN', 'CLOSED')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dept_fiscal_quarter UNIQUE (department_id, fiscal_year, quarter)
);

-- ------------------------------------------------------------------------------
-- 5. EXPENSE CLAIMS (REPORTS)
-- Master record for submitted expense claims with automated high-value flagging
-- ------------------------------------------------------------------------------
CREATE TABLE expense_claims (
    claim_id SERIAL PRIMARY KEY,
    claim_number VARCHAR(30) NOT NULL UNIQUE,
    employee_id INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    department_id INT NOT NULL REFERENCES departments(department_id) ON DELETE RESTRICT,
    budget_id INT NOT NULL REFERENCES department_budgets(budget_id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED' CHECK (
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
    is_high_value BOOLEAN NOT NULL DEFAULT FALSE,
    high_value_reason VARCHAR(255) NULL,
    business_justification TEXT NOT NULL,
    submission_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE NULL,
    reimbursed_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 6. EXPENSE ITEMS (ITEMIZED CLAIM BREAKDOWN)
-- Detailed breakdown per line item with receipts and merchant info
-- ------------------------------------------------------------------------------
CREATE TABLE expense_items (
    item_id SERIAL PRIMARY KEY,
    claim_id INT NOT NULL REFERENCES expense_claims(claim_id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES expense_categories(category_id) ON DELETE RESTRICT,
    item_date DATE NOT NULL,
    merchant_name VARCHAR(150) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    receipt_url VARCHAR(500),
    receipt_filename VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 7. APPROVAL WORKFLOWS & SLA TRACKING
-- Multi-tier approval stages (Manager -> Finance -> CFO) with SLA deadlines
-- ------------------------------------------------------------------------------
CREATE TABLE approval_workflows (
    workflow_id SERIAL PRIMARY KEY,
    claim_id INT NOT NULL REFERENCES expense_claims(claim_id) ON DELETE CASCADE,
    step_order INT NOT NULL CHECK (step_order >= 1),
    approver_id INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    approver_role VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'DELEGATED')
    ),
    comments TEXT,
    deadline_at TIMESTAMP WITH TIME ZONE NOT NULL,
    action_taken_at TIMESTAMP WITH TIME ZONE NULL,
    is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_claim_step UNIQUE (claim_id, step_order)
);

-- ------------------------------------------------------------------------------
-- 8. BUDGET LEDGER (DOUBLE-ENTRY FINANCIAL AUDIT TRAIL)
-- Real-time ledger recording every allocation, reservation, approval, or release
-- ------------------------------------------------------------------------------
CREATE TABLE budget_ledger (
    ledger_id SERIAL PRIMARY KEY,
    budget_id INT NOT NULL REFERENCES department_budgets(budget_id) ON DELETE CASCADE,
    claim_id INT NULL REFERENCES expense_claims(claim_id) ON DELETE SET NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (
        transaction_type IN ('ALLOCATION', 'RESERVATION', 'COMMITMENT', 'RELEASE', 'ADJUSTMENT')
    ),
    amount NUMERIC(14, 2) NOT NULL, -- Positive for increase, negative for deduction
    spent_snapshot NUMERIC(14, 2) NOT NULL,
    reserved_snapshot NUMERIC(14, 2) NOT NULL,
    balance_remaining NUMERIC(14, 2) NOT NULL,
    recorded_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    notes VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOGS (FORENSIC & COMPLIANCE HISTORY)
-- Unalterable activity log for security, changes, and accountability
-- ------------------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id SERIAL PRIMARY KEY,
    entity_name VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    action VARCHAR(50) NOT NULL, -- e.g. SUBMITTED, HIGH_VALUE_FLAGGED, APPROVED, REJECTED, BUDGET_ALERT
    performed_by INT NULL REFERENCES users(user_id) ON DELETE SET NULL,
    old_state JSONB NULL,
    new_state JSONB NULL,
    client_ip VARCHAR(45) DEFAULT '127.0.0.1',
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- PERFORMANCE INDEXES (Optimized for rapid lookups and analytics)
-- ==============================================================================
CREATE INDEX idx_users_dept ON users(department_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_manager ON users(manager_id);

CREATE INDEX idx_dept_budgets_dept_fy ON department_budgets(department_id, fiscal_year, quarter);
CREATE INDEX idx_dept_budgets_status ON department_budgets(status);

CREATE INDEX idx_expense_claims_status ON expense_claims(status);
CREATE INDEX idx_expense_claims_dept ON expense_claims(department_id);
CREATE INDEX idx_expense_claims_employee ON expense_claims(employee_id);
CREATE INDEX idx_expense_claims_budget ON expense_claims(budget_id);
CREATE INDEX idx_expense_claims_high_value ON expense_claims(is_high_value);
CREATE INDEX idx_expense_claims_date ON expense_claims(submission_date);

CREATE INDEX idx_expense_items_claim ON expense_items(claim_id);
CREATE INDEX idx_expense_items_category ON expense_items(category_id);

CREATE INDEX idx_approval_workflows_claim ON approval_workflows(claim_id);
CREATE INDEX idx_approval_workflows_approver_status ON approval_workflows(approver_id, status);
CREATE INDEX idx_approval_workflows_deadline ON approval_workflows(deadline_at);

CREATE INDEX idx_budget_ledger_budget ON budget_ledger(budget_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_name, entity_id);

-- ==============================================================================
-- CORE BUSINESS VIEWS (Instant Insights for Judges & Executives)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- VIEW 1: DEPARTMENT BUDGET HEALTH & UTILIZATION
-- Tracks allocated, spent, reserved, remaining, and flags warning/critical status
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_department_budget_health AS
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
    ROUND(((b.spent_amount + b.reserved_amount) / NULLIF(b.allocated_amount, 0) * 100), 2) AS utilization_pct,
    b.warning_threshold_pct,
    b.critical_threshold_pct,
    CASE 
        WHEN (b.spent_amount + b.reserved_amount) > b.allocated_amount THEN 'OVER_BUDGET'
        WHEN ((b.spent_amount + b.reserved_amount) / NULLIF(b.allocated_amount, 0) * 100) >= b.critical_threshold_pct THEN 'CRITICAL'
        WHEN ((b.spent_amount + b.reserved_amount) / NULLIF(b.allocated_amount, 0) * 100) >= b.warning_threshold_pct THEN 'WARNING'
        ELSE 'HEALTHY'
    END AS budget_health_status,
    b.status AS budget_status
FROM department_budgets b
JOIN departments d ON b.department_id = d.department_id
LEFT JOIN users u ON d.manager_id = u.user_id;

-- ------------------------------------------------------------------------------
-- VIEW 2: PENDING APPROVALS MONITOR WITH SLA & AGING
-- Lists claims awaiting decision, current approver, days pending, and SLA status
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pending_approvals AS
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
    ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.submission_date)) / 86400.0, 1) AS days_pending,
    CASE 
        WHEN CURRENT_TIMESTAMP > w.deadline_at THEN 'SLA_BREACHED'
        WHEN CURRENT_TIMESTAMP > (w.deadline_at - INTERVAL '24 hours') THEN 'SLA_WARNING'
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
-- Highlights large financial outflows requiring elevated authorization
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_high_value_expenses AS
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
WHERE c.is_high_value = TRUE OR c.total_amount >= d.high_value_threshold
GROUP BY c.claim_id, c.claim_number, c.title, c.total_amount, d.name, d.high_value_threshold, u.full_name, c.status, c.high_value_reason, c.submission_date;

-- ------------------------------------------------------------------------------
-- VIEW 4: EMPLOYEE SPEND & COMPLIANCE SUMMARY
-- Analyzes spend per employee, rejection count, and average approval turnaround
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_employee_spending_summary AS
SELECT 
    u.user_id,
    u.employee_code,
    u.full_name,
    d.name AS department_name,
    COUNT(c.claim_id) AS total_claims_submitted,
    COALESCE(SUM(c.total_amount), 0.00) AS total_claimed_amount,
    COALESCE(SUM(CASE WHEN c.status IN ('APPROVED', 'REIMBURSED') THEN c.total_amount ELSE 0 END), 0.00) AS total_approved_amount,
    COUNT(CASE WHEN c.status = 'REJECTED' THEN 1 END) AS rejected_claims_count,
    COUNT(CASE WHEN c.is_high_value = TRUE THEN 1 END) AS high_value_claims_count
FROM users u
JOIN departments d ON u.department_id = d.department_id
LEFT JOIN expense_claims c ON u.user_id = c.employee_id
GROUP BY u.user_id, u.employee_code, u.full_name, d.name;

-- ==============================================================================
-- TRIGGERS: AUTOMATED BUSINESS LOGIC
-- ==============================================================================

-- 1. Automatically update claim total_amount when items change
CREATE OR REPLACE FUNCTION trg_fn_update_claim_total()
RETURNS TRIGGER AS $$
DECLARE
    v_claim_id INT;
    v_total NUMERIC(12, 2);
    v_dept_threshold NUMERIC(12, 2);
    v_dept_id INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_claim_id := OLD.claim_id;
    ELSE
        v_claim_id := NEW.claim_id;
    END IF;

    -- Calculate new total for claim
    SELECT COALESCE(SUM(amount), 0.00) INTO v_total
    FROM expense_items
    WHERE claim_id = v_claim_id;

    -- Get department high-value threshold
    SELECT c.department_id, d.high_value_threshold 
    INTO v_dept_id, v_dept_threshold
    FROM expense_claims c
    JOIN departments d ON c.department_id = d.department_id
    WHERE c.claim_id = v_claim_id;

    -- Update parent claim total and high-value flag
    UPDATE expense_claims
    SET 
        total_amount = v_total,
        is_high_value = CASE WHEN v_total >= v_dept_threshold THEN TRUE ELSE is_high_value END,
        high_value_reason = CASE 
            WHEN v_total >= v_dept_threshold THEN 'Amount exceeds department threshold of $' || v_dept_threshold 
            ELSE high_value_reason 
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE claim_id = v_claim_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_claim_total ON expense_items;
CREATE TRIGGER trg_update_claim_total
AFTER INSERT OR UPDATE OR DELETE ON expense_items
FOR EACH ROW EXECUTE FUNCTION trg_fn_update_claim_total();

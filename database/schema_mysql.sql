-- ==============================================================================
-- ENTERPRISE EXPENSE APPROVAL & DEPARTMENT BUDGET MONITORING SYSTEM
-- Dialect: MySQL 8.0+ / MariaDB 10.5+
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW IF EXISTS v_employee_spending_summary;
DROP VIEW IF EXISTS v_high_value_expenses;
DROP VIEW IF EXISTS v_department_budget_health;
DROP VIEW IF EXISTS v_pending_approvals;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS budget_ledger;
DROP TABLE IF EXISTS approval_workflows;
DROP TABLE IF EXISTS expense_items;
DROP TABLE IF EXISTS expense_claims;
DROP TABLE IF EXISTS expense_categories;
DROP TABLE IF EXISTS department_budgets;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS departments;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------------------------
-- 1. DEPARTMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE departments (
    department_id INT AUTO_INCREMENT PRIMARY KEY,
    department_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    manager_id INT NULL,
    high_value_threshold DECIMAL(12, 2) NOT NULL DEFAULT 1000.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- 2. USERS
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(30),
    role ENUM('EMPLOYEE', 'MANAGER', 'DEPARTMENT_HEAD', 'FINANCE_ADMIN', 'CFO', 'AUDITOR') NOT NULL,
    department_id INT NOT NULL,
    manager_id INT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
    CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE departments
    ADD CONSTRAINT fk_department_manager
    FOREIGN KEY (manager_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 3. EXPENSE CATEGORIES
-- ------------------------------------------------------------------------------
CREATE TABLE expense_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    category_name VARCHAR(60) NOT NULL UNIQUE,
    description TEXT,
    gl_account_code VARCHAR(30) NOT NULL,
    requires_receipt BOOLEAN NOT NULL DEFAULT TRUE,
    max_single_item_limit DECIMAL(12, 2) NULL,
    requires_executive_approval BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- 4. DEPARTMENT BUDGETS
-- ------------------------------------------------------------------------------
CREATE TABLE department_budgets (
    budget_id INT AUTO_INCREMENT PRIMARY KEY,
    department_id INT NOT NULL,
    fiscal_year INT NOT NULL,
    quarter INT NOT NULL,
    allocated_amount DECIMAL(14, 2) NOT NULL,
    spent_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    reserved_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    warning_threshold_pct DECIMAL(5, 2) NOT NULL DEFAULT 80.00,
    critical_threshold_pct DECIMAL(5, 2) NOT NULL DEFAULT 95.00,
    status ENUM('DRAFT', 'ACTIVE', 'FROZEN', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_dept_fiscal_quarter UNIQUE (department_id, fiscal_year, quarter),
    CONSTRAINT fk_budget_dept FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- 5. EXPENSE CLAIMS (REPORTS)
-- ------------------------------------------------------------------------------
CREATE TABLE expense_claims (
    claim_id INT AUTO_INCREMENT PRIMARY KEY,
    claim_number VARCHAR(30) NOT NULL UNIQUE,
    employee_id INT NOT NULL,
    department_id INT NOT NULL,
    budget_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status ENUM(
        'DRAFT',
        'SUBMITTED',
        'PENDING_MANAGER',
        'PENDING_FINANCE',
        'PENDING_CFO',
        'APPROVED',
        'REJECTED',
        'REIMBURSED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'SUBMITTED',
    is_high_value BOOLEAN NOT NULL DEFAULT FALSE,
    high_value_reason VARCHAR(255) NULL,
    business_justification TEXT NOT NULL,
    submission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME NULL,
    reimbursed_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_claim_user FOREIGN KEY (employee_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_claim_dept FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
    CONSTRAINT fk_claim_budget FOREIGN KEY (budget_id) REFERENCES department_budgets(budget_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- 6. EXPENSE ITEMS (ITEMIZED CLAIM BREAKDOWN)
-- ------------------------------------------------------------------------------
CREATE TABLE expense_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    claim_id INT NOT NULL,
    category_id INT NOT NULL,
    item_date DATE NOT NULL,
    merchant_name VARCHAR(150) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    receipt_url VARCHAR(500),
    receipt_filename VARCHAR(255),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_item_claim FOREIGN KEY (claim_id) REFERENCES expense_claims(claim_id) ON DELETE CASCADE,
    CONSTRAINT fk_item_category FOREIGN KEY (category_id) REFERENCES expense_categories(category_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- 7. APPROVAL WORKFLOWS & SLA TRACKING
-- ------------------------------------------------------------------------------
CREATE TABLE approval_workflows (
    workflow_id INT AUTO_INCREMENT PRIMARY KEY,
    claim_id INT NOT NULL,
    step_order INT NOT NULL,
    approver_id INT NOT NULL,
    approver_role VARCHAR(30) NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'DELEGATED') NOT NULL DEFAULT 'PENDING',
    comments TEXT,
    deadline_at DATETIME NOT NULL,
    action_taken_at DATETIME NULL,
    is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_claim_step UNIQUE (claim_id, step_order),
    CONSTRAINT fk_workflow_claim FOREIGN KEY (claim_id) REFERENCES expense_claims(claim_id) ON DELETE CASCADE,
    CONSTRAINT fk_workflow_approver FOREIGN KEY (approver_id) REFERENCES users(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- 8. BUDGET LEDGER
-- ------------------------------------------------------------------------------
CREATE TABLE budget_ledger (
    ledger_id INT AUTO_INCREMENT PRIMARY KEY,
    budget_id INT NOT NULL,
    claim_id INT NULL,
    transaction_type ENUM('ALLOCATION', 'RESERVATION', 'COMMITMENT', 'RELEASE', 'ADJUSTMENT') NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    spent_snapshot DECIMAL(14, 2) NOT NULL,
    reserved_snapshot DECIMAL(14, 2) NOT NULL,
    balance_remaining DECIMAL(14, 2) NOT NULL,
    recorded_by INT NULL,
    notes VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ledger_budget FOREIGN KEY (budget_id) REFERENCES department_budgets(budget_id) ON DELETE CASCADE,
    CONSTRAINT fk_ledger_claim FOREIGN KEY (claim_id) REFERENCES expense_claims(claim_id) ON DELETE SET NULL,
    CONSTRAINT fk_ledger_user FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    entity_name VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    performed_by INT NULL,
    old_state JSON NULL,
    new_state JSON NULL,
    client_ip VARCHAR(45) DEFAULT '127.0.0.1',
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (performed_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------------------
-- PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX idx_users_dept ON users(department_id);
CREATE INDEX idx_dept_budgets_dept ON department_budgets(department_id, fiscal_year, quarter);
CREATE INDEX idx_claims_status ON expense_claims(status);
CREATE INDEX idx_claims_dept ON expense_claims(department_id);
CREATE INDEX idx_claims_employee ON expense_claims(employee_id);
CREATE INDEX idx_claims_high_val ON expense_claims(is_high_value);
CREATE INDEX idx_workflows_claim ON approval_workflows(claim_id);
CREATE INDEX idx_workflows_approver_status ON approval_workflows(approver_id, status);

-- ------------------------------------------------------------------------------
-- VIEWS
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
    ROUND(TIMESTAMPDIFF(HOUR, c.submission_date, NOW()) / 24.0, 1) AS days_pending,
    CASE 
        WHEN NOW() > w.deadline_at THEN 'SLA_BREACHED'
        WHEN NOW() > DATE_SUB(w.deadline_at, INTERVAL 24 HOUR) THEN 'SLA_WARNING'
        ELSE 'ON_TRACK'
    END AS sla_status,
    w.status AS workflow_status
FROM approval_workflows w
JOIN expense_claims c ON w.claim_id = c.claim_id
JOIN users e ON c.employee_id = e.user_id
JOIN departments d ON c.department_id = d.department_id
JOIN users a ON w.approver_id = a.user_id
WHERE w.status = 'PENDING';

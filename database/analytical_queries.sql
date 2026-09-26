-- ==============================================================================
-- ENTERPRISE EXPENSE APPROVAL & BUDGET MONITORING SYSTEM
-- TOP 12 ANALYTICAL & OPERATIONAL SQL QUERIES (COMPETITION SHOWCASE)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- QUERY 1: REAL-TIME DEPARTMENT BUDGET HEALTH & UTILIZATION DASHBOARD
-- Business Goal: Instantly answers the core problem: "monitor department budget"
-- Calculates committed funds (spent + reserved), remaining headroom, and flags
-- HEALTHY, WARNING (>= 80%), or CRITICAL (>= 95%).
-- ------------------------------------------------------------------------------
SELECT 
    d.department_code,
    d.name AS department_name,
    u.full_name AS department_head,
    b.fiscal_year,
    b.quarter,
    b.allocated_amount,
    b.spent_amount,
    b.reserved_amount,
    (b.spent_amount + b.reserved_amount) AS total_committed,
    (b.allocated_amount - (b.spent_amount + b.reserved_amount)) AS remaining_funds,
    ROUND(((b.spent_amount + b.reserved_amount) / b.allocated_amount * 100), 2) AS utilization_pct,
    CASE 
        WHEN (b.spent_amount + b.reserved_amount) > b.allocated_amount THEN '🚨 CRITICAL OVER-BUDGET'
        WHEN ((b.spent_amount + b.reserved_amount) / b.allocated_amount * 100) >= b.critical_threshold_pct THEN '⚠️ CRITICAL RISK (95%+)'
        WHEN ((b.spent_amount + b.reserved_amount) / b.allocated_amount * 100) >= b.warning_threshold_pct THEN '⚡ WARNING (80%+)'
        ELSE '✅ HEALTHY'
    END AS budget_status_indicator
FROM department_budgets b
JOIN departments d ON b.department_id = d.department_id
LEFT JOIN users u ON d.manager_id = u.user_id
WHERE b.status = 'ACTIVE'
ORDER BY utilization_pct DESC;


-- ------------------------------------------------------------------------------
-- QUERY 2: PENDING APPROVAL BOTTLENECK & SLA ESCALATION MONITOR
-- Business Goal: Solves "track pending approval". Identifies stuck claims,
-- current approver, days pending, and flags SLA breaches.
-- ------------------------------------------------------------------------------
SELECT 
    c.claim_number,
    c.title AS expense_title,
    c.total_amount,
    c.is_high_value,
    sub.full_name AS submitted_by,
    dept.name AS department,
    w.step_order AS current_step,
    w.approver_role,
    app.full_name AS assigned_approver,
    app.email AS approver_contact,
    c.submission_date,
    w.deadline_at,
    CASE 
        WHEN CURRENT_TIMESTAMP > w.deadline_at THEN '🚨 SLA BREACHED'
        ELSE '⏳ ON TRACK'
    END AS urgency_status
FROM approval_workflows w
JOIN expense_claims c ON w.claim_id = c.claim_id
JOIN users sub ON c.employee_id = sub.user_id
JOIN departments dept ON c.department_id = dept.department_id
JOIN users app ON w.approver_id = app.user_id
WHERE w.status = 'PENDING'
ORDER BY w.deadline_at ASC;


-- ------------------------------------------------------------------------------
-- QUERY 3: HIGH-VALUE EXPENSE SURVEILLANCE & POLICY AUDIT
-- Business Goal: Solves "identify high value expenses". Pulls all transactions
-- exceeding department threshold or flagged for CFO / executive review.
-- ------------------------------------------------------------------------------
SELECT 
    c.claim_number,
    c.title,
    c.total_amount,
    d.high_value_threshold AS dept_threshold,
    (c.total_amount - d.high_value_threshold) AS excess_over_threshold,
    c.status AS claim_status,
    c.high_value_reason,
    u.full_name AS employee_name,
    d.name AS department_name,
    c.submission_date
FROM expense_claims c
JOIN departments d ON c.department_id = d.department_id
JOIN users u ON c.employee_id = u.user_id
WHERE c.is_high_value = TRUE OR c.total_amount >= d.high_value_threshold
ORDER BY c.total_amount DESC;


-- ------------------------------------------------------------------------------
-- QUERY 4: APPROVER WORKLOAD & PERFORMANCE METRICS
-- Business Goal: Identifies which managers have approval backlogs and calculate
-- their average turnaround time.
-- ------------------------------------------------------------------------------
SELECT 
    app.user_id,
    app.full_name AS approver_name,
    app.role,
    COUNT(w.workflow_id) AS total_assigned_workflows,
    SUM(CASE WHEN w.status = 'PENDING' THEN 1 ELSE 0 END) AS pending_approvals_count,
    SUM(CASE WHEN w.status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
    SUM(CASE WHEN w.status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
    SUM(CASE WHEN w.status = 'PENDING' AND CURRENT_TIMESTAMP > w.deadline_at THEN 1 ELSE 0 END) AS overdue_sla_breaches
FROM users app
JOIN approval_workflows w ON app.user_id = w.approver_id
GROUP BY app.user_id, app.full_name, app.role
ORDER BY pending_approvals_count DESC;


-- ------------------------------------------------------------------------------
-- QUERY 5: SPEND BREAKDOWN BY EXPENSE CATEGORY ACROSS DEPARTMENTS
-- Business Goal: Finance team insight into where funds are going (e.g. Flights vs Cloud)
-- ------------------------------------------------------------------------------
SELECT 
    cat.category_name,
    cat.gl_account_code,
    COUNT(i.item_id) AS transaction_count,
    SUM(i.amount) AS total_spent,
    ROUND(AVG(i.amount), 2) AS average_receipt_amount,
    MAX(i.amount) AS max_single_transaction
FROM expense_items i
JOIN expense_categories cat ON i.category_id = cat.category_id
JOIN expense_claims c ON i.claim_id = c.claim_id
WHERE c.status IN ('APPROVED', 'REIMBURSED')
GROUP BY cat.category_id, cat.category_name, cat.gl_account_code
ORDER BY total_spent DESC;


-- ------------------------------------------------------------------------------
-- QUERY 6: COMPLETE EXPENSE LIFE-CYCLE AUDIT TRAIL
-- Business Goal: Forensic investigation of a claim from draft to approval & payout
-- ------------------------------------------------------------------------------
SELECT 
    c.claim_number,
    c.title,
    w.step_order,
    w.approver_role,
    u.full_name AS approver_name,
    w.status AS decision,
    w.comments AS approver_notes,
    w.action_taken_at,
    l.transaction_type AS budget_impact,
    l.balance_remaining AS dept_balance_after_action
FROM expense_claims c
LEFT JOIN approval_workflows w ON c.claim_id = w.claim_id
LEFT JOIN users u ON w.approver_id = u.user_id
LEFT JOIN budget_ledger l ON c.claim_id = l.claim_id
WHERE c.claim_number = 'EXP-2026-001'
ORDER BY w.step_order ASC, l.ledger_id ASC;


-- ------------------------------------------------------------------------------
-- QUERY 7: PREVENT OVERSPEND - BUDGET PRE-VALIDATION CHECK
-- Business Goal: Stored Procedure / Logic to execute before allowing a new claim.
-- Evaluates whether a new $5,000 claim would cause department budget breach.
-- ------------------------------------------------------------------------------
SELECT 
    d.name AS department_name,
    b.allocated_amount,
    (b.spent_amount + b.reserved_amount) AS currently_committed,
    (b.allocated_amount - (b.spent_amount + b.reserved_amount)) AS current_headroom,
    5000.00 AS proposed_expense_amount,
    CASE 
        WHEN (b.spent_amount + b.reserved_amount + 5000.00) > b.allocated_amount 
        THEN '❌ REJECT: Expense exceeds remaining department budget!'
        ELSE '✅ APPROVE: Sufficient budget headroom available.'
    END AS validation_result
FROM department_budgets b
JOIN departments d ON b.department_id = d.department_id
WHERE b.department_id = 3 AND b.fiscal_year = 2026 AND b.quarter = 3;


-- ------------------------------------------------------------------------------
-- QUERY 8: TOP 5 EXPENSE CLAIMANTS (EMPLOYEE SPENDING PATTERNS)
-- Business Goal: Auditing employee spending, flag outliers or frequent claimers
-- ------------------------------------------------------------------------------
SELECT 
    u.employee_code,
    u.full_name,
    d.name AS department,
    COUNT(c.claim_id) AS total_claims,
    SUM(c.total_amount) AS total_amount_claimed,
    SUM(CASE WHEN c.status = 'APPROVED' THEN c.total_amount ELSE 0 END) AS approved_amount,
    SUM(CASE WHEN c.status = 'REJECTED' THEN c.total_amount ELSE 0 END) AS rejected_amount,
    ROUND(
        (SUM(CASE WHEN c.status = 'APPROVED' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(c.claim_id), 0)), 
        1
    ) AS approval_success_rate_pct
FROM users u
JOIN departments d ON u.department_id = d.department_id
JOIN expense_claims c ON u.user_id = c.employee_id
GROUP BY u.user_id, u.employee_code, u.full_name, d.name
ORDER BY total_amount_claimed DESC
LIMIT 5;


-- ------------------------------------------------------------------------------
-- QUERY 9: DUPLICATE / FRAUD EXPENSE DETECTION SCANNER
-- Business Goal: Catch potential fraudulent claims with identical amount, 
-- merchant, and date submitted by the same employee.
-- ------------------------------------------------------------------------------
SELECT 
    c.employee_id,
    u.full_name,
    i.merchant_name,
    i.item_date,
    i.amount,
    COUNT(*) AS duplicate_submission_count,
    GROUP_CONCAT(c.claim_number) AS affected_claims
FROM expense_items i
JOIN expense_claims c ON i.claim_id = c.claim_id
JOIN users u ON c.employee_id = u.user_id
GROUP BY c.employee_id, u.full_name, i.merchant_name, i.item_date, i.amount
HAVING COUNT(*) > 1;


-- ------------------------------------------------------------------------------
-- QUERY 10: MONTHLY BURN RATE & OUTFLOW FORECAST
-- Business Goal: For CFO / FP&A budget forecasting
-- ------------------------------------------------------------------------------
SELECT 
    d.name AS department_name,
    strftime('%Y-%m', c.submission_date) AS submission_month,
    COUNT(c.claim_id) AS claim_volume,
    SUM(c.total_amount) AS total_monthly_burn
FROM expense_claims c
JOIN departments d ON c.department_id = d.department_id
WHERE c.status IN ('APPROVED', 'REIMBURSED')
GROUP BY d.name, strftime('%Y-%m', c.submission_date)
ORDER BY submission_month DESC, total_monthly_burn DESC;

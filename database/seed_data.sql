-- ==============================================================================
-- ENTERPRISE EXPENSE APPROVAL & BUDGET MONITORING SYSTEM - SEED DATA
-- Fully compatible with PostgreSQL, SQLite, and MySQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DEPARTMENTS
-- ------------------------------------------------------------------------------
INSERT INTO departments (department_id, department_code, name, description, high_value_threshold, is_active) VALUES
(1, 'ENG', 'Engineering & Product', 'Software development, cloud infrastructure, QA, and platform architecture', 2500.00, 1),
(2, 'MKT', 'Marketing & Growth', 'Brand marketing, digital advertising, conferences, content creation, and PR', 1500.00, 1),
(3, 'SLS', 'Sales & Enterprise Accounts', 'Client meetings, enterprise demos, sales travel, customer entertainment', 1200.00, 1),
(4, 'HR',  'People & Talent Operations', 'Recruiting, employee wellness, training programs, HR software', 800.00, 1),
(5, 'FIN', 'Finance, Legal & Compliance', 'Treasury, compliance, tax, audits, insurance, and executive operations', 3000.00, 1),
(6, 'OPS', 'Customer Operations & Support', 'Customer success, support tooling, logistics, call center operations', 1000.00, 1);

-- ------------------------------------------------------------------------------
-- 2. USERS (ORGANIZATIONAL HIERARCHY)
-- ------------------------------------------------------------------------------
INSERT INTO users (user_id, employee_code, full_name, email, phone, role, department_id, manager_id, is_active) VALUES
-- Executive & Finance Leadership
(1, 'EMP001', 'Sarah Jenkins', 'sarah.jenkins@company.com', '+1-555-0101', 'CFO', 5, NULL, 1),
(2, 'EMP002', 'David Miller', 'david.miller@company.com', '+1-555-0102', 'FINANCE_ADMIN', 5, 1, 1),
(3, 'EMP003', 'Victoria Sterling', 'victoria.s@company.com', '+1-555-0103', 'AUDITOR', 5, 1, 1),

-- Department Heads & Managers
(4, 'EMP010', 'Alex Chen', 'alex.chen@company.com', '+1-555-0201', 'DEPARTMENT_HEAD', 1, 1, 1),
(5, 'EMP011', 'Elena Rostova', 'elena.rostova@company.com', '+1-555-0202', 'MANAGER', 2, 1, 1),
(6, 'EMP012', 'Marcus Brody', 'marcus.brody@company.com', '+1-555-0203', 'MANAGER', 3, 1, 1),
(7, 'EMP013', 'Rachel Green', 'rachel.green@company.com', '+1-555-0204', 'MANAGER', 4, 1, 1),
(8, 'EMP014', 'Carlos Mendez', 'carlos.m@company.com', '+1-555-0205', 'MANAGER', 6, 1, 1),

-- Team Members / Employees
(9,  'EMP101', 'Liam Vance', 'liam.vance@company.com', '+1-555-0301', 'EMPLOYEE', 1, 4, 1),
(10, 'EMP102', 'Chloe Zhao', 'chloe.zhao@company.com', '+1-555-0302', 'EMPLOYEE', 1, 4, 1),
(11, 'EMP103', 'Noah Patel', 'noah.patel@company.com', '+1-555-0303', 'EMPLOYEE', 2, 5, 1),
(12, 'EMP104', 'Sophia Taylor', 'sophia.taylor@company.com', '+1-555-0304', 'EMPLOYEE', 3, 6, 1),
(13, 'EMP105', 'Jordan Lee', 'jordan.lee@company.com', '+1-555-0305', 'EMPLOYEE', 4, 7, 1),
(14, 'EMP106', 'Aiden Walker', 'aiden.walker@company.com', '+1-555-0306', 'EMPLOYEE', 6, 8, 1);

-- Link Department managers
UPDATE departments SET manager_id = 4 WHERE department_id = 1;
UPDATE departments SET manager_id = 5 WHERE department_id = 2;
UPDATE departments SET manager_id = 6 WHERE department_id = 3;
UPDATE departments SET manager_id = 7 WHERE department_id = 4;
UPDATE departments SET manager_id = 1 WHERE department_id = 5;
UPDATE departments SET manager_id = 8 WHERE department_id = 6;

-- ------------------------------------------------------------------------------
-- 3. EXPENSE CATEGORIES
-- ------------------------------------------------------------------------------
INSERT INTO expense_categories (category_id, code, category_name, description, gl_account_code, requires_receipt, max_single_item_limit, requires_executive_approval, is_active) VALUES
(1, 'TRV-AIR', 'Airfare & Flights', 'Domestic and international business flight bookings', 'GL-6100', 1, 5000.00, 1, 1),
(2, 'TRV-LOD', 'Lodging & Hotels', 'Hotel accommodations for corporate business travel', 'GL-6110', 1, 1500.00, 0, 1),
(3, 'TRV-TRN', 'Ground Transportation', 'Rental cars, taxis, Uber/Lyft, train fares, and toll road charges', 'GL-6120', 1, 300.00, 0, 1),
(4, 'MEL-ENT', 'Client Meals & Entertainment', 'Business dinners, client meetings, partner dinners', 'GL-6200', 1, 500.00, 0, 1),
(5, 'IT-CLD',  'Cloud & SaaS Subscriptions', 'AWS, GCP, Azure hosting, SaaS tools, productivity licenses', 'GL-6300', 1, 10000.00, 1, 1),
(6, 'IT-EQP',  'Hardware & Workstation Gear', 'Laptops, monitors, developer peripherals, ergonomic accessories', 'GL-6310', 1, 3000.00, 1, 1),
(7, 'EDU-CNF', 'Conferences & Certifications', 'Industry conference tickets, training seminars, skill certifications', 'GL-6400', 1, 2000.00, 0, 1),
(8, 'OFC-SPL', 'Office Supplies & Logistics', 'Stationery, shipping charges, office refreshments, team printing', 'GL-6500', 0, 250.00, 0, 1);

-- ------------------------------------------------------------------------------
-- 4. DEPARTMENT BUDGETS (FY 2026 Q3 & Q4)
-- Demonstrating Healthy, Warning, and Critical/Overrun states
-- ------------------------------------------------------------------------------
INSERT INTO department_budgets (budget_id, department_id, fiscal_year, quarter, allocated_amount, spent_amount, reserved_amount, warning_threshold_pct, critical_threshold_pct, status, notes) VALUES
-- 1: Engineering Q3 - Healthy (52% utilized)
(1, 1, 2026, 3, 120000.00, 54200.00, 8300.00, 80.00, 95.00, 'ACTIVE', 'Q3 Cloud infrastructure expansion & tech hiring'),
-- 2: Marketing Q3 - Warning Threshold (87.2% committed)
(2, 2, 2026, 3, 75000.00, 58400.00, 7000.00, 80.00, 95.00, 'ACTIVE', 'Major product launch campaign & global summit sponsorships'),
-- 3: Sales Q3 - Critical Alert (96.8% committed!)
(3, 3, 2026, 3, 60000.00, 52100.00, 6000.00, 80.00, 95.00, 'ACTIVE', 'High enterprise client travel quarter'),
-- 4: HR Q3 - Healthy (43.5% utilized)
(4, 4, 2026, 3, 30000.00, 11500.00, 1550.00, 80.00, 95.00, 'ACTIVE', 'Annual employee engagement & health initiatives'),
-- 5: Finance Q3 - Healthy (38.8% utilized)
(5, 5, 2026, 3, 40000.00, 14200.00, 1300.00, 80.00, 95.00, 'ACTIVE', 'Auditing, tax advisory, and compliance tools'),
-- 6: Operations Q3 - Warning Alert (83.3% utilized)
(6, 6, 2026, 3, 35000.00, 26800.00, 2350.00, 80.00, 95.00, 'ACTIVE', 'Customer support platform upgrade'),
-- 7: Engineering Q4 - Early Draft
(7, 1, 2026, 4, 130000.00, 0.00, 0.00, 80.00, 95.00, 'ACTIVE', 'Q4 Planned budget'),
-- 8: Marketing Q4 - Early Draft
(8, 2, 2026, 4, 80000.00, 0.00, 0.00, 80.00, 95.00, 'ACTIVE', 'Q4 Holiday growth campaign');

-- ------------------------------------------------------------------------------
-- 5. EXPENSE CLAIMS (REPORTS)
-- Across multiple statuses: APPROVED, PENDING_MANAGER, PENDING_FINANCE, REJECTED
-- ------------------------------------------------------------------------------
INSERT INTO expense_claims (claim_id, claim_number, employee_id, department_id, budget_id, title, total_amount, currency, status, is_high_value, high_value_reason, business_justification, submission_date, approved_at, reimbursed_at) VALUES
-- Claim 1: High-Value AWS Cloud Reservation (Engineering) - APPROVED
(1, 'EXP-2026-001', 9, 1, 1, 'AWS Annual Cloud Reserved Instances Renewal', 4850.00, 'USD', 'APPROVED', 1, 'Amount ($4,850.00) exceeds department threshold of $2,500.00', '1-year upfront commitment for primary PostgreSQL and Kubernetes cluster saving 38% annual cloud costs.', '2026-08-01 10:30:00', '2026-08-03 14:00:00', '2026-08-05 16:30:00'),

-- Claim 2: Routine Office Tech Peripherals - APPROVED
(2, 'EXP-2026-002', 10, 1, 1, 'Development Dual 4K Monitor Setup & Docking Station', 840.00, 'USD', 'APPROVED', 0, NULL, 'Standard ergonomic equipment upgrade for remote engineering productivity.', '2026-08-10 11:15:00', '2026-08-11 09:20:00', '2026-08-15 12:00:00'),

-- Claim 3: High-Value Marketing Automation Tool - PENDING FINANCE (Awaiting CFO sign-off)
(3, 'EXP-2026-003', 11, 2, 2, 'HubSpot Enterprise Marketing Suite Annual Seat', 3450.00, 'USD', 'PENDING_FINANCE', 1, 'Amount ($3,450.00) exceeds department threshold of $1,500.00', 'Mission critical inbound lead capture and lifecycle email automation tool.', '2026-09-20 14:20:00', NULL, NULL),

-- Claim 4: Sales Client On-site Presentation & Travel - PENDING MANAGER (SLA WARNING)
(4, 'EXP-2026-004', 12, 3, 3, 'Fortune 500 Enterprise Pitch - NYC Travel & Client Dinner', 1850.00, 'USD', 'PENDING_MANAGER', 1, 'Amount ($1,850.00) exceeds department threshold of $1,200.00', 'Closed-door meeting with client procurement VP. Led to $180k ARR contract draft.', '2026-09-22 09:00:00', NULL, NULL),

-- Claim 5: HR Wellness & Team Offsite Logistics - PENDING MANAGER (OVERDUE / SLA BREACHED)
(5, 'EXP-2026-005', 13, 4, 4, 'Annual Company Team Wellness Day Catering & Materials', 950.00, 'USD', 'PENDING_MANAGER', 1, 'Amount ($950.00) exceeds department threshold of $800.00', 'Quarterly team wellness day for 50 attendees including healthy catering and mindfulness coaches.', '2026-09-18 16:45:00', NULL, NULL),

-- Claim 6: Customer Support Desk Headphones & VoIP Kits - APPROVED
(6, 'EXP-2026-006', 14, 6, 6, 'Noise Cancelling Call Center Headsets (x5)', 750.00, 'USD', 'APPROVED', 0, NULL, 'Replacement gear for tier-2 frontline customer support engineers.', '2026-08-25 13:10:00', '2026-08-26 10:00:00', '2026-08-28 17:00:00'),

-- Claim 7: Unauthorized Luxury Dinner - REJECTED
(7, 'EXP-2026-007', 12, 3, 3, 'VIP Luxury Club Dinner with Prospects', 1450.00, 'USD', 'REJECTED', 1, 'Amount exceeds policy limit without pre-authorization', 'Dinner with 2 prospective partners at 5-star venue.', '2026-08-14 20:00:00', NULL, NULL),

-- Claim 8: High-Value Developer Summit Flight & Pass - PENDING MANAGER
(8, 'EXP-2026-008', 9, 1, 1, 'KubeCon North America 2026 Flight & Ticket', 2600.00, 'USD', 'PENDING_MANAGER', 1, 'Amount ($2,600.00) exceeds department threshold of $2,500.00', 'Speaking engagement at KubeCon on distributed systems architecture representing company.', '2026-09-24 15:30:00', NULL, NULL);

-- ------------------------------------------------------------------------------
-- 6. EXPENSE ITEMS (ITEMIZED BILLING)
-- ------------------------------------------------------------------------------
INSERT INTO expense_items (item_id, claim_id, category_id, item_date, merchant_name, amount, tax_amount, receipt_url, receipt_filename, notes) VALUES
-- Items for Claim 1 (AWS Cloud)
(1, 1, 5, '2026-08-01', 'Amazon Web Services Inc.', 4500.00, 350.00, 'https://storage.company.com/receipts/aws_invoice_8829.pdf', 'aws_invoice_8829.pdf', 'Reserved instance compute charges'),

-- Items for Claim 2 (Monitors)
(2, 2, 6, '2026-08-09', 'Dell Technologies Direct', 650.00, 52.00, 'https://storage.company.com/receipts/dell_inv_441.pdf', 'dell_inv_441.pdf', 'UltraSharp 27-inch 4K Monitor'),
(3, 2, 6, '2026-08-09', 'Anker Direct', 138.00, 0.00, 'https://storage.company.com/receipts/anker_hub_99.pdf', 'anker_hub_99.pdf', 'Thunderbolt 4 Docking Station'),

-- Items for Claim 3 (HubSpot)
(4, 3, 5, '2026-09-19', 'HubSpot Inc.', 3200.00, 250.00, 'https://storage.company.com/receipts/hubspot_ann_2026.pdf', 'hubspot_ann_2026.pdf', 'Annual subscription license for marketing automation'),

-- Items for Claim 4 (Sales NYC Pitch)
(5, 4, 1, '2026-09-21', 'Delta Air Lines', 780.00, 62.40, 'https://storage.company.com/receipts/delta_flight_nyc.pdf', 'delta_flight_nyc.pdf', 'Roundtrip SFO to JFK Economy Plus'),
(6, 4, 2, '2026-09-21', 'Marriott Downtown NYC', 680.00, 95.20, 'https://storage.company.com/receipts/marriott_nyc_2nights.pdf', 'marriott_nyc_2nights.pdf', '2 nights business lodging'),
(7, 4, 4, '2026-09-22', 'Gramercy Tavern NYC', 390.00, 34.00, 'https://storage.company.com/receipts/gramercy_dinner.pdf', 'gramercy_dinner.pdf', 'Working dinner with 3 client stakeholders'),

-- Items for Claim 5 (HR Team Wellness)
(8, 5, 8, '2026-09-18', 'Whole Foods Corporate Catering', 620.00, 49.60, 'https://storage.company.com/receipts/wholefoods_catering.pdf', 'wholefoods_catering.pdf', 'Organic lunch buffet for 50 employees'),
(9, 5, 7, '2026-09-18', 'MindfulWorks Workshop Co.', 330.00, 0.00, 'https://storage.company.com/receipts/mindfulworks_invoice.pdf', 'mindfulworks_invoice.pdf', 'Certified wellness instructor fee'),

-- Items for Claim 6 (Call center headsets)
(10, 6, 6, '2026-08-24', 'Jabra Business Solutions', 750.00, 60.00, 'https://storage.company.com/receipts/jabra_biz_5x.pdf', 'jabra_biz_5x.pdf', '5x Jabra Evolve2 65 Headsets'),

-- Items for Claim 7 (Luxury Dinner - Rejected)
(11, 7, 4, '2026-08-13', 'Le Bernardin Luxury Dining', 1450.00, 130.50, 'https://storage.company.com/receipts/lebernardin_rec.pdf', 'lebernardin_rec.pdf', 'Non-compliant expense exceeding reasonable policy thresholds'),

-- Items for Claim 8 (KubeCon Summit)
(12, 8, 1, '2026-09-24', 'United Airlines', 1250.00, 100.00, 'https://storage.company.com/receipts/united_kubecon_flight.pdf', 'united_kubecon_flight.pdf', 'Direct flight to Chicago'),
(13, 8, 7, '2026-09-24', 'Linux Foundation Events', 1350.00, 0.00, 'https://storage.company.com/receipts/kubecon_pass_2026.pdf', 'kubecon_pass_2026.pdf', 'Conference full-access attendee pass');

-- ------------------------------------------------------------------------------
-- 7. APPROVAL WORKFLOWS & SLA TRACKING
-- ------------------------------------------------------------------------------
INSERT INTO approval_workflows (workflow_id, claim_id, step_order, approver_id, approver_role, status, comments, deadline_at, action_taken_at, is_escalated) VALUES
-- Claim 1: Fully approved multi-stage
(1, 1, 1, 4, 'DEPARTMENT_HEAD', 'APPROVED', 'Cloud reservation approved. Critical infrastructure savings.', '2026-08-03 12:00:00', '2026-08-02 11:00:00', 0),
(2, 1, 2, 2, 'FINANCE_ADMIN',   'APPROVED', 'Verified budget availability in Q3 Engineering budget.', '2026-08-05 12:00:00', '2026-08-03 14:00:00', 0),

-- Claim 2: Single manager approved
(3, 2, 1, 4, 'DEPARTMENT_HEAD', 'APPROVED', 'Standard equipment replacement approved.', '2026-08-13 12:00:00', '2026-08-11 09:20:00', 0),

-- Claim 3: Step 1 Approved, Step 2 Pending with Finance (CFO attention required!)
(4, 3, 1, 5, 'MANAGER',         'APPROVED', 'Crucial tool for inbound pipeline generation.', '2026-09-22 12:00:00', '2026-09-21 10:15:00', 0),
(5, 3, 2, 1, 'CFO',             'PENDING',  NULL, '2026-09-27 18:00:00', NULL, 0),

-- Claim 4: Pending Sales Manager (Marcus Brody) - Near SLA deadline
(6, 4, 1, 6, 'MANAGER',         'PENDING',  NULL, '2026-09-26 23:59:59', NULL, 0),

-- Claim 5: Overdue Approval with HR Manager (Rachel Green) - SLA BREACHED!
(7, 5, 1, 7, 'MANAGER',         'PENDING',  NULL, '2026-09-21 12:00:00', NULL, 1),

-- Claim 6: Approved Customer Ops
(8, 6, 1, 8, 'MANAGER',         'APPROVED', 'Approved necessary frontline headsets.', '2026-08-27 12:00:00', '2026-08-26 10:00:00', 0),

-- Claim 7: Rejected by Sales Manager
(9, 7, 1, 6, 'MANAGER',         'REJECTED', 'Violates policy 4.2: Entertainment meals over $500 require prior VP written approval.', '2026-08-16 12:00:00', '2026-08-15 09:00:00', 0),

-- Claim 8: Pending Engineering Dept Head (Alex Chen)
(10, 8, 1, 4, 'DEPARTMENT_HEAD', 'PENDING', NULL, '2026-09-28 17:00:00', NULL, 0);

-- ------------------------------------------------------------------------------
-- 8. BUDGET LEDGER (FINANCIAL INTEGRITY TRAIL)
-- ------------------------------------------------------------------------------
INSERT INTO budget_ledger (ledger_id, budget_id, claim_id, transaction_type, amount, spent_snapshot, reserved_snapshot, balance_remaining, recorded_by, notes) VALUES
(1, 1, NULL, 'ALLOCATION',  120000.00, 0.00, 0.00, 120000.00, 1, 'Initial Q3 Budget allocation authorized by CFO'),
(2, 1, 1,    'RESERVATION', 4850.00, 0.00, 4850.00, 115150.00, 9, 'Funds reserved on claim submission EXP-2026-001'),
(3, 1, 1,    'COMMITMENT',  4850.00, 4850.00, 0.00, 115150.00, 2, 'Claim EXP-2026-001 approved by Finance, shifted to spent'),
(4, 2, NULL, 'ALLOCATION',  75000.00, 0.00, 0.00, 75000.00, 1, 'Initial Q3 Marketing allocation'),
(5, 2, 3,    'RESERVATION', 3450.00, 58400.00, 7000.00, 9600.00, 11, 'Funds reserved for HubSpot license claim EXP-2026-003'),
(6, 3, NULL, 'ALLOCATION',  60000.00, 0.00, 0.00, 60000.00, 1, 'Initial Q3 Sales allocation'),
(7, 3, 4,    'RESERVATION', 1850.00, 52100.00, 6000.00, 1900.00, 12, 'Funds reserved for NYC client pitch claim EXP-2026-004');

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOGS (FORENSIC COMPLIANCE TRAIL)
-- ------------------------------------------------------------------------------
INSERT INTO audit_logs (log_id, entity_name, entity_id, action, performed_by, old_state, new_state, client_ip, user_agent) VALUES
(1, 'EXPENSE_CLAIM', 1, 'SUBMITTED', 9, NULL, '{"status": "SUBMITTED", "amount": 4850.00}', '192.168.1.101', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),
(2, 'EXPENSE_CLAIM', 1, 'HIGH_VALUE_FLAGGED', 9, NULL, '{"flag": true, "threshold": 2500.00, "amount": 4850.00}', '127.0.0.1', 'System Trigger'),
(3, 'EXPENSE_CLAIM', 1, 'APPROVED', 4, '{"status": "SUBMITTED"}', '{"status": "PENDING_FINANCE"}', '192.168.1.104', 'Mozilla/5.0 Chrome/120.0'),
(4, 'EXPENSE_CLAIM', 1, 'APPROVED', 2, '{"status": "PENDING_FINANCE"}', '{"status": "APPROVED"}', '192.168.1.102', 'Mozilla/5.0 Chrome/120.0'),
(5, 'EXPENSE_CLAIM', 7, 'REJECTED', 6, '{"status": "SUBMITTED"}', '{"status": "REJECTED", "reason": "Policy violation"}', '192.168.1.112', 'Mozilla/5.0 Firefox/121.0'),
(6, 'BUDGET', 3, 'WARNING_THRESHOLD_REACHED', 1, '{"utilization": 78.5}', '{"utilization": 96.8}', '127.0.0.1', 'Automated Health Monitor');

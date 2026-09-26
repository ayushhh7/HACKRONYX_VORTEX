import json
import sqlite3
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import sys
from pathlib import Path
_backend_dir = str(Path(__file__).resolve().parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import database
from database import get_db, DB_PATH

app = FastAPI(
    title="Enterprise Expense & Budget System API",
    description="3NF Relational Expense Approval and Budget Monitoring Backend",
    version="1.0.0"
)

# Enable CORS for local Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# PYDANTIC MODELS
# -----------------------------------------------------------------------------

class ExpenseItemCreate(BaseModel):
    category_id: int
    item_date: str
    merchant_name: str
    amount: float = Field(gt=0)
    tax_amount: float = Field(default=0.0, ge=0)
    receipt_url: Optional[str] = None
    notes: Optional[str] = None

class ClaimCreate(BaseModel):
    employee_id: int
    department_id: int
    title: str
    business_justification: str
    currency: str = "USD"
    items: List[ExpenseItemCreate]

class ValidateBudgetRequest(BaseModel):
    department_id: int
    total_amount: float

class ApprovalActionRequest(BaseModel):
    action: str  # 'APPROVE' or 'REJECT'
    approver_id: int
    comments: Optional[str] = None


# -----------------------------------------------------------------------------
# HELPER FUNCTIONS
# -----------------------------------------------------------------------------

def dict_from_row(row):
    return dict(row) if row else None

def record_audit(conn: sqlite3.Connection, entity_name: str, entity_id: int, action: str, performed_by: Optional[int], old_state: Optional[dict] = None, new_state: Optional[dict] = None):
    conn.execute(
        """
        INSERT INTO audit_logs (entity_name, entity_id, action, performed_by, old_state, new_state, client_ip, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, '127.0.0.1', 'API-Client')
        """,
        (
            entity_name,
            entity_id,
            action,
            performed_by,
            json.dumps(old_state) if old_state else None,
            json.dumps(new_state) if new_state else None
        )
    )

# -----------------------------------------------------------------------------
# ROOT & HEALTH CHECK
# -----------------------------------------------------------------------------

@app.get("/")
def read_root():
    return {
        "status": "online",
        "system": "Enterprise Expense Approval & Department Budget Monitoring System",
        "db": str(DB_PATH)
    }

# -----------------------------------------------------------------------------
# 1. USERS & PERSONAS
# -----------------------------------------------------------------------------

@app.get("/api/users")
def get_users():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT u.user_id, u.employee_code, u.full_name, u.email, u.phone, u.role, 
                   u.department_id, d.name AS department_name, d.department_code,
                   u.manager_id, m.full_name AS manager_name, u.is_active
            FROM users u
            JOIN departments d ON u.department_id = d.department_id
            LEFT JOIN users m ON u.manager_id = m.user_id
            ORDER BY u.user_id ASC
        """).fetchall()
        return [dict_from_row(r) for r in rows]

# -----------------------------------------------------------------------------
# 2. DEPARTMENTS & CATEGORIES
# -----------------------------------------------------------------------------

@app.get("/api/departments")
def get_departments():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.department_id, d.department_code, d.name, d.description, 
                   d.high_value_threshold, d.manager_id, u.full_name AS manager_name,
                   b.budget_id, b.allocated_amount, b.spent_amount, b.reserved_amount,
                   (b.allocated_amount - (b.spent_amount + b.reserved_amount)) AS remaining_funds
            FROM departments d
            LEFT JOIN users u ON d.manager_id = u.user_id
            LEFT JOIN department_budgets b ON d.department_id = b.department_id 
                 AND b.fiscal_year = 2026 AND b.quarter = 3 AND b.status = 'ACTIVE'
            WHERE d.is_active = 1
            ORDER BY d.department_id ASC
        """).fetchall()
        return [dict_from_row(r) for r in rows]

@app.get("/api/categories")
def get_categories():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT category_id, code, category_name, description, gl_account_code,
                   requires_receipt, max_single_item_limit, requires_executive_approval
            FROM expense_categories
            WHERE is_active = 1
            ORDER BY category_name ASC
        """).fetchall()
        return [dict_from_row(r) for r in rows]

# -----------------------------------------------------------------------------
# 3. BUDGET HEALTH & LEDGER
# -----------------------------------------------------------------------------

@app.get("/api/budgets/health")
def get_budgets_health():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM v_department_budget_health ORDER BY utilization_pct DESC").fetchall()
        data = [dict_from_row(r) for r in rows]
        
        # Calculate summary metrics
        total_allocated = sum(r["allocated_amount"] for r in data if r["allocated_amount"])
        total_spent = sum(r["spent_amount"] for r in data if r["spent_amount"])
        total_reserved = sum(r["reserved_amount"] for r in data if r["reserved_amount"])
        total_available = total_allocated - (total_spent + total_reserved)
        
        return {
            "summary": {
                "total_allocated": total_allocated,
                "total_spent": total_spent,
                "total_reserved": total_reserved,
                "total_available": total_available,
                "utilization_pct": round(((total_spent + total_reserved) / total_allocated * 100), 2) if total_allocated > 0 else 0
            },
            "departments": data
        }

@app.get("/api/budgets/{budget_id}/ledger")
def get_budget_ledger(budget_id: int):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT l.*, u.full_name as recorded_by_name, c.claim_number
            FROM budget_ledger l
            LEFT JOIN users u ON l.recorded_by = u.user_id
            LEFT JOIN expense_claims c ON l.claim_id = c.claim_id
            WHERE l.budget_id = ?
            ORDER BY l.ledger_id DESC
        """, (budget_id,)).fetchall()
        return [dict_from_row(r) for r in rows]

# -----------------------------------------------------------------------------
# 4. BUDGET VALIDATION (PRE-CHECK)
# -----------------------------------------------------------------------------

@app.post("/api/claims/validate-budget")
def validate_budget(req: ValidateBudgetRequest):
    with get_db() as conn:
        budget = conn.execute("""
            SELECT budget_id, department_id, allocated_amount, spent_amount, reserved_amount,
                   (allocated_amount - spent_amount - reserved_amount) AS available_headroom
            FROM department_budgets
            WHERE department_id = ? AND status = 'ACTIVE' AND fiscal_year = 2026 AND quarter = 3
            ORDER BY budget_id ASC LIMIT 1
        """, (req.department_id,)).fetchone()
        
        if not budget:
            raise HTTPException(status_code=404, detail="No active budget found for this department")
            
        available = budget["available_headroom"]
        is_valid = req.total_amount <= available
        
        return {
            "valid": is_valid,
            "budget_id": budget["budget_id"],
            "allocated_amount": budget["allocated_amount"],
            "spent_amount": budget["spent_amount"],
            "reserved_amount": budget["reserved_amount"],
            "available_headroom": available,
            "requested_amount": req.total_amount,
            "headroom_after": available - req.total_amount if is_valid else available,
            "message": "Budget headroom available." if is_valid else f"Claim total (${req.total_amount:,.2f}) exceeds available headroom (${available:,.2f})!"
        }

# -----------------------------------------------------------------------------
# 5. EXPENSE CLAIMS (CREATE & RETRIEVE)
# -----------------------------------------------------------------------------

@app.get("/api/claims")
def get_claims(
    department_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    status: Optional[str] = None,
    is_high_value: Optional[int] = None
):
    with get_db() as conn:
        query = """
            SELECT c.*, 
                   u.full_name AS employee_name, u.employee_code, u.email AS employee_email,
                   d.name AS department_name, d.department_code, d.high_value_threshold,
                   (SELECT COUNT(*) FROM expense_items i WHERE i.claim_id = c.claim_id) AS item_count
            FROM expense_claims c
            JOIN users u ON c.employee_id = u.user_id
            JOIN departments d ON c.department_id = d.department_id
            WHERE 1=1
        """
        params = []
        if department_id:
            query += " AND c.department_id = ?"
            params.append(department_id)
        if employee_id:
            query += " AND c.employee_id = ?"
            params.append(employee_id)
        if status:
            query += " AND c.status = ?"
            params.append(status)
        if is_high_value is not None:
            query += " AND c.is_high_value = ?"
            params.append(is_high_value)
            
        query += " ORDER BY c.claim_id DESC"
        rows = conn.execute(query, params).fetchall()
        return [dict_from_row(r) for r in rows]

@app.get("/api/claims/{claim_id}")
def get_claim_details(claim_id: int):
    with get_db() as conn:
        claim = conn.execute("""
            SELECT c.*, 
                   u.full_name AS employee_name, u.employee_code, u.email AS employee_email,
                   d.name AS department_name, d.department_code, d.high_value_threshold,
                   b.fiscal_year, b.quarter, b.allocated_amount, b.spent_amount, b.reserved_amount
            FROM expense_claims c
            JOIN users u ON c.employee_id = u.user_id
            JOIN departments d ON c.department_id = d.department_id
            JOIN department_budgets b ON c.budget_id = b.budget_id
            WHERE c.claim_id = ?
        """, (claim_id,)).fetchone()
        
        if not claim:
            raise HTTPException(status_code=404, detail="Expense claim not found")
            
        # Items
        items = conn.execute("""
            SELECT i.*, cat.category_name, cat.code AS category_code, cat.gl_account_code
            FROM expense_items i
            JOIN expense_categories cat ON i.category_id = cat.category_id
            WHERE i.claim_id = ?
            ORDER BY i.item_id ASC
        """, (claim_id,)).fetchall()
        
        # Workflows
        workflows = conn.execute("""
            SELECT w.*, u.full_name AS approver_name, u.email AS approver_email
            FROM approval_workflows w
            JOIN users u ON w.approver_id = u.user_id
            WHERE w.claim_id = ?
            ORDER BY w.step_order ASC
        """, (claim_id,)).fetchall()
        
        # Ledger movements
        ledger = conn.execute("""
            SELECT l.*, u.full_name AS recorded_by_name
            FROM budget_ledger l
            LEFT JOIN users u ON l.recorded_by = u.user_id
            WHERE l.claim_id = ?
            ORDER BY l.ledger_id ASC
        """, (claim_id,)).fetchall()
        
        claim_dict = dict_from_row(claim)
        claim_dict["items"] = [dict_from_row(i) for i in items]
        claim_dict["workflows"] = [dict_from_row(w) for w in workflows]
        claim_dict["ledger"] = [dict_from_row(l) for l in ledger]
        return claim_dict

@app.post("/api/claims", status_code=status.HTTP_201_CREATED)
def create_claim(claim_data: ClaimCreate):
    if not claim_data.items:
        raise HTTPException(status_code=400, detail="A claim must contain at least one line item")

    with get_db() as conn:
        # 1. Fetch Department & Active Budget
        dept = conn.execute("""
            SELECT d.*, u.user_id AS head_id, u.full_name AS head_name
            FROM departments d
            LEFT JOIN users u ON d.manager_id = u.user_id
            WHERE d.department_id = ?
        """, (claim_data.department_id,)).fetchone()
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found")

        budget = conn.execute("""
            SELECT budget_id, allocated_amount, spent_amount, reserved_amount
            FROM department_budgets
            WHERE department_id = ? AND status = 'ACTIVE' AND fiscal_year = 2026 AND quarter = 3
            ORDER BY budget_id ASC LIMIT 1
        """, (claim_data.department_id,)).fetchone()
        if not budget:
            raise HTTPException(status_code=400, detail="No active budget envelope exists for this department")

        # 2. Compute total amount
        total_amount = sum(item.amount for item in claim_data.items)
        available_headroom = budget["allocated_amount"] - (budget["spent_amount"] + budget["reserved_amount"])
        
        # 3. Two-Phase Budget Check: Validate Headroom
        if total_amount > available_headroom:
            raise HTTPException(
                status_code=400, 
                detail=f"Budget headroom exceeded. Claim total is ${total_amount:,.2f}, but only ${available_headroom:,.2f} is available in department budget."
            )

        # 4. Check High-Value Rules
        is_high_value = 0
        high_value_reason = None
        if total_amount >= dept["high_value_threshold"]:
            is_high_value = 1
            high_value_reason = f"Total amount (${total_amount:,.2f}) exceeds department threshold of ${dept['high_value_threshold']:,.2f}"
        else:
            # Check individual item category rules
            for item in claim_data.items:
                cat = conn.execute("SELECT * FROM expense_categories WHERE category_id = ?", (item.category_id,)).fetchone()
                if cat and cat["requires_executive_approval"]:
                    is_high_value = 1
                    high_value_reason = f"Category '{cat['category_name']}' requires executive sign-off"
                    break
                if cat and cat["max_single_item_limit"] and item.amount > cat["max_single_item_limit"]:
                    is_high_value = 1
                    high_value_reason = f"Item amount (${item.amount:,.2f}) exceeds category limit (${cat['max_single_item_limit']:,.2f})"
                    break

        # 5. Fetch submitter and find Step 1 Approver
        submitter = conn.execute("SELECT * FROM users WHERE user_id = ?", (claim_data.employee_id,)).fetchone()
        if not submitter:
            raise HTTPException(status_code=404, detail="Employee user not found")

        # Step 1 Approver: submitter's manager, or dept manager, or CFO
        step1_approver_id = submitter["manager_id"] or dept["manager_id"] or 1
        approver_row = conn.execute("SELECT role FROM users WHERE user_id = ?", (step1_approver_id,)).fetchone()
        step1_approver_role = approver_row["role"] if approver_row else "MANAGER"

        # Generate unique claim number
        current_year = datetime.now().year
        max_row = conn.execute("SELECT MAX(claim_id) as max_id FROM expense_claims").fetchone()
        claim_seq = (max_row["max_id"] or 0) + 1
        claim_number = f"EXP-{current_year}-{claim_seq:04d}"
        while conn.execute("SELECT 1 FROM expense_claims WHERE claim_number = ?", (claim_number,)).fetchone():
            claim_seq += 1
            claim_number = f"EXP-{current_year}-{claim_seq:04d}"

        # 6. Execute Database Writes inside Transaction
        try:
            # Encumbrance: increment reserved_amount
            new_reserved = budget["reserved_amount"] + total_amount
            conn.execute(
                "UPDATE department_budgets SET reserved_amount = ? WHERE budget_id = ?",
                (new_reserved, budget["budget_id"])
            )

            # Insert master claim
            cur = conn.execute(
                """
                INSERT INTO expense_claims (
                    claim_number, employee_id, department_id, budget_id, title,
                    total_amount, currency, status, is_high_value, high_value_reason,
                    business_justification, submission_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING_MANAGER', ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    claim_number,
                    claim_data.employee_id,
                    claim_data.department_id,
                    budget["budget_id"],
                    claim_data.title,
                    total_amount,
                    claim_data.currency,
                    is_high_value,
                    high_value_reason,
                    claim_data.business_justification
                )
            )
            claim_id = cur.lastrowid

            # Insert expense items
            for it in claim_data.items:
                conn.execute(
                    """
                    INSERT INTO expense_items (
                        claim_id, category_id, item_date, merchant_name, amount,
                        tax_amount, receipt_url, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        claim_id,
                        it.category_id,
                        it.item_date,
                        it.merchant_name,
                        it.amount,
                        it.tax_amount,
                        it.receipt_url,
                        it.notes
                    )
                )

            # Insert Budget Ledger Reservation Entry
            new_balance_remaining = budget["allocated_amount"] - (budget["spent_amount"] + new_reserved)
            conn.execute(
                """
                INSERT INTO budget_ledger (
                    budget_id, claim_id, transaction_type, amount,
                    spent_snapshot, reserved_snapshot, balance_remaining, recorded_by, notes
                ) VALUES (?, ?, 'RESERVATION', ?, ?, ?, ?, ?, ?)
                """,
                (
                    budget["budget_id"],
                    claim_id,
                    total_amount,
                    budget["spent_amount"],
                    new_reserved,
                    new_balance_remaining,
                    claim_data.employee_id,
                    f"Funds encumbered for submission {claim_number}"
                )
            )

            # Insert Step 1 into approval_workflows (Deadline: +48h)
            deadline = (datetime.now() + timedelta(hours=48)).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                """
                INSERT INTO approval_workflows (
                    claim_id, step_order, approver_id, approver_role, status, deadline_at
                ) VALUES (?, 1, ?, ?, 'PENDING', ?)
                """,
                (claim_id, step1_approver_id, step1_approver_role, deadline)
            )

            # Audit Log
            record_audit(
                conn, 
                "EXPENSE_CLAIM", 
                claim_id, 
                "SUBMITTED", 
                claim_data.employee_id,
                old_state=None,
                new_state={
                    "claim_number": claim_number,
                    "total_amount": total_amount,
                    "is_high_value": is_high_value,
                    "status": "PENDING_MANAGER"
                }
            )

            conn.commit()
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Database transaction error: {str(e)}")

        return {
            "success": True,
            "claim_id": claim_id,
            "claim_number": claim_number,
            "total_amount": total_amount,
            "is_high_value": bool(is_high_value),
            "status": "PENDING_MANAGER",
            "message": "Expense claim submitted and budget funds reserved successfully."
        }

# -----------------------------------------------------------------------------
# 6. APPROVAL WORKFLOWS & ACTION
# -----------------------------------------------------------------------------

@app.get("/api/approvals/pending")
def get_pending_approvals(approver_id: Optional[int] = None):
    with get_db() as conn:
        query = "SELECT * FROM v_pending_approvals WHERE 1=1"
        params = []
        if approver_id:
            query += " AND assigned_approver_id = ?" if "assigned_approver_id" in [c["name"] for c in conn.execute("PRAGMA table_info(v_pending_approvals)").fetchall()] else ""
            # Let's check columns of v_pending_approvals directly:
            # We know from view definition: w.workflow_id, c.claim_id, c.claim_number, c.title, c.total_amount, c.is_high_value,
            # e.full_name submitter_name, d.name department_name, w.step_order, w.approver_role, a.full_name assigned_approver_name, w.approver_id isn't directly named, let's select from raw tables joined with view info!
        
        # Let's query approval_workflows joined with claims & users directly to guarantee having approver_id:
        rows = conn.execute("""
            SELECT 
                w.workflow_id,
                w.claim_id,
                c.claim_number,
                c.title AS claim_title,
                c.total_amount,
                c.is_high_value,
                c.high_value_reason,
                c.status AS claim_status,
                e.full_name AS submitter_name,
                e.email AS submitter_email,
                d.name AS department_name,
                d.department_code,
                w.step_order,
                w.approver_id,
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
            WHERE w.status = 'PENDING'
            ORDER BY w.deadline_at ASC
        """).fetchall()
        
        results = [dict_from_row(r) for r in rows]
        if approver_id:
            # Filter in Python so client can see assigned or all if finance/cfo
            user = conn.execute("SELECT role FROM users WHERE user_id = ?", (approver_id,)).fetchone()
            user_role = user["role"] if user else ""
            if user_role not in ["FINANCE_ADMIN", "CFO", "AUDITOR"]:
                results = [r for r in results if r["approver_id"] == approver_id]
                
        return results

@app.post("/api/approvals/{workflow_id}/action")
def take_approval_action(workflow_id: int, req: ApprovalActionRequest):
    action = req.action.upper()
    if action not in ["APPROVE", "REJECT"]:
        raise HTTPException(status_code=400, detail="Action must be 'APPROVE' or 'REJECT'")

    with get_db() as conn:
        # 1. Fetch Workflow & Claim
        wf = conn.execute("""
            SELECT w.*, c.claim_id, c.claim_number, c.department_id, c.budget_id, 
                   c.total_amount, c.is_high_value, c.status AS claim_status,
                   b.allocated_amount, b.spent_amount, b.reserved_amount
            FROM approval_workflows w
            JOIN expense_claims c ON w.claim_id = c.claim_id
            JOIN department_budgets b ON c.budget_id = b.budget_id
            WHERE w.workflow_id = ?
        """, (workflow_id,)).fetchone()

        if not wf:
            raise HTTPException(status_code=404, detail="Approval workflow step not found")
        if wf["status"] != "PENDING":
            raise HTTPException(status_code=400, detail=f"Step is already {wf['status']}")

        claim_id = wf["claim_id"]
        budget_id = wf["budget_id"]
        amount = wf["total_amount"]
        is_high_value = bool(wf["is_high_value"])
        current_step = wf["step_order"]

        try:
            # Update current workflow step
            conn.execute(
                """
                UPDATE approval_workflows 
                SET status = ?, comments = ?, action_taken_at = CURRENT_TIMESTAMP
                WHERE workflow_id = ?
                """,
                ("APPROVED" if action == "APPROVE" else "REJECTED", req.comments, workflow_id)
            )

            # -------------------------------------------------------------
            # CASE A: REJECTION
            # -------------------------------------------------------------
            if action == "REJECT":
                # Release reserved funds
                new_reserved = max(0.0, wf["reserved_amount"] - amount)
                conn.execute(
                    "UPDATE department_budgets SET reserved_amount = ? WHERE budget_id = ?",
                    (new_reserved, budget_id)
                )

                # Set claim status = REJECTED
                conn.execute(
                    "UPDATE expense_claims SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE claim_id = ?",
                    (claim_id,)
                )

                # Ledger Release entry
                bal_remaining = wf["allocated_amount"] - (wf["spent_amount"] + new_reserved)
                conn.execute(
                    """
                    INSERT INTO budget_ledger (
                        budget_id, claim_id, transaction_type, amount,
                        spent_snapshot, reserved_snapshot, balance_remaining, recorded_by, notes
                    ) VALUES (?, ?, 'RELEASE', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        budget_id,
                        claim_id,
                        amount,
                        wf["spent_amount"],
                        new_reserved,
                        bal_remaining,
                        req.approver_id,
                        f"Funds released upon claim {wf['claim_number']} rejection. Reason: {req.comments or 'None provided'}"
                    )
                )

                record_audit(
                    conn, "EXPENSE_CLAIM", claim_id, "REJECTED", req.approver_id,
                    old_state={"status": wf["claim_status"]},
                    new_state={"status": "REJECTED", "comments": req.comments}
                )

                conn.commit()
                return {
                    "success": True,
                    "action": "REJECTED",
                    "claim_id": claim_id,
                    "claim_number": wf["claim_number"],
                    "message": "Claim rejected and encumbered budget funds released."
                }

            # -------------------------------------------------------------
            # CASE B: APPROVAL - DETERMINE IF NEXT STEP OR FINAL
            # -------------------------------------------------------------
            # Routing:
            # Standard: Step 1 (Manager) -> Step 2 (Finance Admin, id=2) -> APPROVED
            # High-Value: Step 1 (Manager) -> Step 2 (Finance Admin, id=2) -> Step 3 (CFO, id=1) -> APPROVED
            
            is_final = False
            next_step_order = current_step + 1

            if not is_high_value:
                # Standard claim
                if current_step >= 2:
                    is_final = True
                else:
                    # Advance to Step 2: Finance
                    next_approver_id = 2  # David Miller, FINANCE_ADMIN
                    next_role = "FINANCE_ADMIN"
                    next_claim_status = "PENDING_FINANCE"
            else:
                # High-value claim
                if current_step == 1:
                    # Step 2: Finance
                    next_approver_id = 2  # David Miller
                    next_role = "FINANCE_ADMIN"
                    next_claim_status = "PENDING_FINANCE"
                elif current_step == 2:
                    # Step 3: CFO
                    next_approver_id = 1  # Sarah Jenkins, CFO
                    next_role = "CFO"
                    next_claim_status = "PENDING_CFO"
                else:
                    # Step 3 approved by CFO -> Final
                    is_final = True

            if not is_final:
                # Advance claim to next pending step
                conn.execute(
                    "UPDATE expense_claims SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE claim_id = ?",
                    (next_claim_status, claim_id)
                )

                deadline = (datetime.now() + timedelta(hours=48)).strftime("%Y-%m-%d %H:%M:%S")
                conn.execute(
                    """
                    INSERT INTO approval_workflows (
                        claim_id, step_order, approver_id, approver_role, status, deadline_at
                    ) VALUES (?, ?, ?, ?, 'PENDING', ?)
                    """,
                    (claim_id, next_step_order, next_approver_id, next_role, deadline)
                )

                record_audit(
                    conn, "EXPENSE_CLAIM", claim_id, f"STEP_{current_step}_APPROVED", req.approver_id,
                    old_state={"status": wf["claim_status"]},
                    new_state={"status": next_claim_status, "next_approver_id": next_approver_id}
                )

                conn.commit()
                return {
                    "success": True,
                    "action": "APPROVED_STEP",
                    "claim_id": claim_id,
                    "claim_number": wf["claim_number"],
                    "next_step": next_step_order,
                    "next_role": next_role,
                    "claim_status": next_claim_status,
                    "message": f"Step {current_step} approved. Workflow advanced to {next_role}."
                }

            else:
                # FINAL APPROVAL!
                # 1. Update department budget: reserved -= amount, spent += amount
                new_reserved = max(0.0, wf["reserved_amount"] - amount)
                new_spent = wf["spent_amount"] + amount
                conn.execute(
                    "UPDATE department_budgets SET reserved_amount = ?, spent_amount = ? WHERE budget_id = ?",
                    (new_reserved, new_spent, budget_id)
                )

                # 2. Update claim to APPROVED
                conn.execute(
                    """
                    UPDATE expense_claims 
                    SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
                    WHERE claim_id = ?
                    """,
                    (claim_id,)
                )

                # 3. Create Budget Ledger COMMITMENT entry
                bal_remaining = wf["allocated_amount"] - (new_spent + new_reserved)
                conn.execute(
                    """
                    INSERT INTO budget_ledger (
                        budget_id, claim_id, transaction_type, amount,
                        spent_snapshot, reserved_snapshot, balance_remaining, recorded_by, notes
                    ) VALUES (?, ?, 'COMMITMENT', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        budget_id,
                        claim_id,
                        amount,
                        new_spent,
                        new_reserved,
                        bal_remaining,
                        req.approver_id,
                        f"Final approval granted for claim {wf['claim_number']}. Funds committed to spent."
                    )
                )

                # 4. Audit Log
                record_audit(
                    conn, "EXPENSE_CLAIM", claim_id, "FINAL_APPROVED", req.approver_id,
                    old_state={"status": wf["claim_status"]},
                    new_state={"status": "APPROVED", "spent_impact": amount}
                )

                conn.commit()
                return {
                    "success": True,
                    "action": "FINAL_APPROVED",
                    "claim_id": claim_id,
                    "claim_number": wf["claim_number"],
                    "claim_status": "APPROVED",
                    "message": "Final approval granted! Budget committed from reserved to spent."
                }

        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Approval action failed: {str(e)}")

# -----------------------------------------------------------------------------
# 7. ANALYTICS & AUDIT LOGS
# -----------------------------------------------------------------------------

@app.get("/api/analytics/high-value")
def get_high_value_analytics():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM v_high_value_expenses ORDER BY total_amount DESC").fetchall()
        return [dict_from_row(r) for r in rows]

@app.get("/api/audit-logs")
def get_audit_logs(limit: int = 50):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT a.*, u.full_name AS performed_by_name, u.role AS performed_by_role
            FROM audit_logs a
            LEFT JOIN users u ON a.performed_by = u.user_id
            ORDER BY a.log_id DESC
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict_from_row(r) for r in rows]

@app.get("/api/analytics/fraud-detection")
def get_fraud_detection():
    with get_db() as conn:
        rows = conn.execute("""
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
            HAVING COUNT(*) > 1
        """).fetchall()
        return [dict_from_row(r) for r in rows]

# -----------------------------------------------------------------------------
# 8. AI EXPENSE RISK & REVIEW ASSISTANT (GEMINI)
# -----------------------------------------------------------------------------

class AIAnalyzeRequest(BaseModel):
    claim_id: int

@app.post("/api/ai/analyze-expense")
def ai_analyze_expense(req: AIAnalyzeRequest):
    with get_db() as conn:
        # 1. Fetch claim with department & budget details
        claim = conn.execute("""
            SELECT c.*, 
                   u.full_name AS employee_name, u.employee_code, u.email AS employee_email,
                   d.name AS department_name, d.department_code, d.high_value_threshold,
                   b.fiscal_year, b.quarter, b.allocated_amount, b.spent_amount, b.reserved_amount,
                   (b.allocated_amount - (b.spent_amount + b.reserved_amount)) AS available_headroom
            FROM expense_claims c
            JOIN users u ON c.employee_id = u.user_id
            JOIN departments d ON c.department_id = d.department_id
            JOIN department_budgets b ON c.budget_id = b.budget_id
            WHERE c.claim_id = ?
        """, (req.claim_id,)).fetchone()

        if not claim:
            raise HTTPException(status_code=404, detail="Expense claim not found")

        # 2. Fetch line items
        items = conn.execute("""
            SELECT i.*, cat.category_name, cat.code AS category_code, cat.gl_account_code, 
                   cat.requires_receipt, cat.max_single_item_limit, cat.requires_executive_approval
            FROM expense_items i
            JOIN expense_categories cat ON i.category_id = cat.category_id
            WHERE i.claim_id = ?
            ORDER BY i.item_id ASC
        """, (req.claim_id,)).fetchall()

        # 3. Check duplicate anomalies
        duplicate_alerts = []
        for it in items:
            dup = conn.execute("""
                SELECT COUNT(*) as cnt, GROUP_CONCAT(c.claim_number) as other_claims
                FROM expense_items i2
                JOIN expense_claims c ON i2.claim_id = c.claim_id
                WHERE c.employee_id = ? AND i2.merchant_name = ? AND i2.item_date = ? AND i2.amount = ? AND c.claim_id != ?
            """, (claim["employee_id"], it["merchant_name"], it["item_date"], it["amount"], req.claim_id)).fetchone()
            if dup and dup["cnt"] > 0:
                duplicate_alerts.append(f"Identical expense of ${it['amount']:,.2f} on {it['item_date']} at '{it['merchant_name']}' also present in claim(s): {dup['other_claims']}")

        claim_payload = dict_from_row(claim)
        claim_payload["items"] = [dict_from_row(i) for i in items]
        claim_payload["duplicate_alerts"] = duplicate_alerts

    # 4. Invoke isolated AI Service
    from services.ai_service import analyze_expense
    try:
        analysis = analyze_expense(claim_payload)
        return {
            "claim_id": req.claim_id,
            "analysis": analysis
        }
    except ValueError as ve:
        raise HTTPException(status_code=503, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

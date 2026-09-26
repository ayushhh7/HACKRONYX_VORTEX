import sqlite3
from pathlib import Path

db_path = Path(__file__).resolve().parent.parent / "database" / "expense_system.db"
conn = sqlite3.connect(str(db_path))
conn.execute("UPDATE department_budgets SET reserved_amount = 8300.0, spent_amount = 54200.0 WHERE budget_id = 1")
conn.execute("UPDATE department_budgets SET reserved_amount = 0.0 WHERE budget_id = 7")

conn.execute("""
    DELETE FROM approval_workflows WHERE claim_id IN (
        SELECT claim_id FROM expense_claims WHERE title LIKE '%End-to-End%' OR title LIKE '%Test Rejection%'
    )
""")
conn.execute("""
    DELETE FROM expense_items WHERE claim_id IN (
        SELECT claim_id FROM expense_claims WHERE title LIKE '%End-to-End%' OR title LIKE '%Test Rejection%'
    )
""")
conn.execute("DELETE FROM budget_ledger WHERE notes LIKE '%End-to-End%' OR notes LIKE '%Test Rejection%'")
conn.execute("DELETE FROM audit_logs WHERE new_state LIKE '%End-to-End%' OR new_state LIKE '%Test Rejection%'")
conn.execute("DELETE FROM expense_claims WHERE title LIKE '%End-to-End%' OR title LIKE '%Test Rejection%'")
conn.commit()
conn.close()
print("Cleaned up test claims successfully.")

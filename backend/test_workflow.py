import urllib.request
import json

def post(url, data):
    req = urllib.request.Request(
        url, 
        data=json.dumps(data).encode('utf-8'), 
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read().decode('utf-8'))

def get(url):
    with urllib.request.urlopen(url) as res:
        return json.loads(res.read().decode('utf-8'))

print("=== STARTING FULL END-TO-END VERIFICATION ===")

# Clean up previous test run
post('http://127.0.0.1:8000/api/claims/validate-budget', {'department_id': 1, 'total_amount': 10.0})

# 1. Check Initial Budget for Department 1 (Engineering, Q3)
health_data = get('http://127.0.0.1:8000/api/budgets/health')['departments']
b_init = next(d for d in health_data if d['department_code'] == 'ENG' and d['quarter'] == 3)
print(f"[CHECK 1] Initial Eng Q3 Budget: Allocated={b_init['allocated_amount']}, Spent={b_init['spent_amount']}, Reserved={b_init['reserved_amount']}")

# 2. Validate Budget for $1,200.00
val = post('http://127.0.0.1:8000/api/claims/validate-budget', {'department_id': 1, 'total_amount': 1200.0})
print(f"[CHECK 2] Validate Budget result: valid={val['valid']}, Available Headroom={val['available_headroom']}")
assert val['valid'] is True

# 3. Submit Claim as Liam Vance (Employee, user_id=9)
claim_data = {
    'employee_id': 9,
    'department_id': 1,
    'title': 'End-to-End Test Engineering Tools',
    'business_justification': 'Verification of Two-Phase Budget Commitment Protocol',
    'currency': 'USD',
    'items': [{
        'category_id': 6, # Hardware category requires executive CFO approval
        'item_date': '2026-09-26',
        'merchant_name': 'DevTools Direct',
        'amount': 1200.0,
        'tax_amount': 96.0,
        'receipt_url': 'https://storage.company.com/receipts/test_rec.pdf',
        'notes': 'Developer hardware upgrade'
    }]
}
claim_res = post('http://127.0.0.1:8000/api/claims', claim_data)
print(f"[CHECK 3] Claim Created: {claim_res['claim_number']}, High Value: {claim_res['is_high_value']}, Status: {claim_res['status']}")

# 4. Verify Budget Reserved Increased in Eng Q3
health_after_res = get('http://127.0.0.1:8000/api/budgets/health')['departments']
b_after_res = next(d for d in health_after_res if d['department_code'] == 'ENG' and d['quarter'] == 3)
diff_res = b_after_res['reserved_amount'] - b_init['reserved_amount']
print(f"[CHECK 4] Budget after reservation - Reserved: {b_after_res['reserved_amount']} (Delta: +{diff_res})")
assert b_after_res['reserved_amount'] == b_init['reserved_amount'] + 1200.0

# 5. Check Pending Approvals
pending = get('http://127.0.0.1:8000/api/approvals/pending')
claim_wf = [p for p in pending if p['claim_number'] == claim_res['claim_number']]
print(f"[CHECK 5] Pending step found with approver: {claim_wf[0]['assigned_approver_name']} ({claim_wf[0]['approver_role']})")
wf_step1_id = claim_wf[0]['workflow_id']

# 6. Step 1 Approval (Alex Chen, Dept Head)
act1 = post(f'http://127.0.0.1:8000/api/approvals/{wf_step1_id}/action', {
    'action': 'APPROVE',
    'approver_id': 4,
    'comments': 'Step 1 Approved by Engineering Dept Head'
})
print(f"[CHECK 6] Step 1 Action: {act1['action']}, Next Role: {act1.get('next_role')}")

# 7. Step 2 Approval (David Miller - Finance Admin)
pending2 = get('http://127.0.0.1:8000/api/approvals/pending')
claim_wf2 = [p for p in pending2 if p['claim_number'] == claim_res['claim_number']]
wf_step2_id = claim_wf2[0]['workflow_id']
print(f"[CHECK 7] Step 2 Pending with: {claim_wf2[0]['assigned_approver_name']} ({claim_wf2[0]['approver_role']})")

act2 = post(f'http://127.0.0.1:8000/api/approvals/{wf_step2_id}/action', {
    'action': 'APPROVE',
    'approver_id': 2,
    'comments': 'Step 2 Approved by Finance Admin'
})
print(f"[CHECK 8] Step 2 Action: {act2['action']}, Claim Status: {act2.get('claim_status')}, Next Role: {act2.get('next_role')}")

# 8. Step 3 Approval (Sarah Jenkins - CFO)
pending3 = get('http://127.0.0.1:8000/api/approvals/pending')
claim_wf3 = [p for p in pending3 if p['claim_number'] == claim_res['claim_number']]
wf_step3_id = claim_wf3[0]['workflow_id']
print(f"[CHECK 9] Step 3 Pending with CFO: {claim_wf3[0]['assigned_approver_name']} ({claim_wf3[0]['approver_role']})")

act3 = post(f'http://127.0.0.1:8000/api/approvals/{wf_step3_id}/action', {
    'action': 'APPROVE',
    'approver_id': 1,
    'comments': 'Step 3 Final Executive Sign-off by CFO'
})
print(f"[CHECK 10] Step 3 Action: {act3['action']}, Claim Status: {act3.get('claim_status')}")
assert act3['action'] == 'FINAL_APPROVED'

# 9. Check Final Budget Commitment in Eng Q3
health_final = get('http://127.0.0.1:8000/api/budgets/health')['departments']
b_final = next(d for d in health_final if d['department_code'] == 'ENG' and d['quarter'] == 3)
spent_diff = b_final['spent_amount'] - b_init['spent_amount']
print(f"[CHECK 11] Final Budget: Spent={b_final['spent_amount']} (Delta: +{spent_diff}), Reserved={b_final['reserved_amount']}")
assert b_final['spent_amount'] == b_init['spent_amount'] + 1200.0
assert b_final['reserved_amount'] == b_init['reserved_amount']

# 10. Verify Double-Entry Ledger Entries
claim_detail = get(f"http://127.0.0.1:8000/api/claims/{claim_res['claim_id']}")
ledger_types = [l['transaction_type'] for l in claim_detail['ledger']]
print(f"[CHECK 12] Budget Ledger Movements: {ledger_types}")
assert 'RESERVATION' in ledger_types and 'COMMITMENT' in ledger_types

print("\n>>> APPROVAL CHAIN VERIFIED! NOW TESTING REJECTION PROTOCOL... <<<")

# Rejection Test: Submit a $250.00 claim, verify reservation, then reject and verify release
b_before_rej = next(d for d in get('http://127.0.0.1:8000/api/budgets/health')['departments'] if d['department_code'] == 'ENG' and d['quarter'] == 3)

rej_claim_data = {
    'employee_id': 9,
    'department_id': 1,
    'title': 'Test Rejection & Release Protocol',
    'business_justification': 'Verification of budget release upon rejection',
    'currency': 'USD',
    'items': [{
        'category_id': 8,
        'item_date': '2026-09-26',
        'merchant_name': 'Luxury Desk Accessories',
        'amount': 250.0,
        'tax_amount': 20.0,
        'notes': 'Non-compliant expense'
    }]
}
rej_claim = post('http://127.0.0.1:8000/api/claims', rej_claim_data)
b_during_rej = next(d for d in get('http://127.0.0.1:8000/api/budgets/health')['departments'] if d['department_code'] == 'ENG' and d['quarter'] == 3)
assert b_during_rej['reserved_amount'] == b_before_rej['reserved_amount'] + 250.0

pending_rej = get('http://127.0.0.1:8000/api/approvals/pending')
rej_wf = next(p for p in pending_rej if p['claim_number'] == rej_claim['claim_number'])

rej_act = post(f"http://127.0.0.1:8000/api/approvals/{rej_wf['workflow_id']}/action", {
    'action': 'REJECT',
    'approver_id': 4,
    'comments': 'Policy 4.1 violation - non-standard luxury desk gear'
})
assert rej_act['action'] == 'REJECTED'

b_after_rej = next(d for d in get('http://127.0.0.1:8000/api/budgets/health')['departments'] if d['department_code'] == 'ENG' and d['quarter'] == 3)
assert b_after_rej['reserved_amount'] == b_before_rej['reserved_amount']

rej_detail = get(f"http://127.0.0.1:8000/api/claims/{rej_claim['claim_id']}")
assert rej_detail['status'] == 'REJECTED'
assert any(l['transaction_type'] == 'RELEASE' for l in rej_detail['ledger'])
print(f"[REJECTION TEST PASSED] Claim {rej_claim['claim_number']} rejected. Headroom restored. Ledger logged RELEASE.")

print("\n=======================================================")
print(">>> ALL APPROVAL AND REJECTION PROTOCOLS FULLY PASS! <<<")
print("=======================================================")

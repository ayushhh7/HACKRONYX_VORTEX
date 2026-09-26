// In-memory mock service simulating backend logic for GitHub Pages live preview
import {
  initialUsers,
  initialDepartments,
  initialCategories,
  initialDepartmentBudgets,
  initialClaims,
  initialItems,
  initialWorkflows,
  initialLedger,
  initialAuditLogs,
  initialFraudDetections
} from './mockData';

// Clone working data into state
let users = JSON.parse(JSON.stringify(initialUsers));
let departments = JSON.parse(JSON.stringify(initialDepartments));
let categories = JSON.parse(JSON.stringify(initialCategories));
let budgets = JSON.parse(JSON.stringify(initialDepartmentBudgets));
let claims = JSON.parse(JSON.stringify(initialClaims));
let items = JSON.parse(JSON.stringify(initialItems));
let workflows = JSON.parse(JSON.stringify(initialWorkflows));
let ledger = JSON.parse(JSON.stringify(initialLedger));
let auditLogs = JSON.parse(JSON.stringify(initialAuditLogs));
let fraudDetections = JSON.parse(JSON.stringify(initialFraudDetections));

export const mockApi = {
  getUsers: async () => users,
  
  getDepartments: async () => departments,
  
  getCategories: async () => categories,
  
  getBudgetsHealth: async () => {
    const total_allocated = budgets.reduce((s, b) => s + (b.allocated_amount || 0), 0);
    const total_spent = budgets.reduce((s, b) => s + (b.spent_amount || 0), 0);
    const total_reserved = budgets.reduce((s, b) => s + (b.reserved_amount || 0), 0);
    const total_available = total_allocated - (total_spent + total_reserved);
    const utilization_pct = total_allocated > 0 ? Math.round(((total_spent + total_reserved) / total_allocated) * 10000) / 100 : 0;

    return {
      summary: {
        total_allocated,
        total_spent,
        total_reserved,
        total_available,
        utilization_pct
      },
      departments: budgets.map(b => {
        const comm = (b.spent_amount || 0) + (b.reserved_amount || 0);
        const avail = Math.max(0, (b.allocated_amount || 0) - comm);
        const util = b.allocated_amount > 0 ? Math.round((comm / b.allocated_amount) * 10000) / 100 : 0;
        let status = 'HEALTHY';
        if (util >= 95) status = 'CRITICAL';
        else if (util >= 80) status = 'WARNING';

        return {
          ...b,
          total_committed: comm,
          available_headroom: avail,
          utilization_pct: util,
          budget_health_status: status
        };
      })
    };
  },

  getBudgetLedger: async (budgetId) => {
    return ledger.filter(l => l.budget_id === Number(budgetId));
  },

  validateBudget: async ({ department_id, total_amount }) => {
    const b = budgets.find(x => x.department_id === Number(department_id));
    if (!b) throw new Error("Department budget not found");
    const comm = (b.spent_amount || 0) + (b.reserved_amount || 0);
    const available = Math.max(0, (b.allocated_amount || 0) - comm);
    const isValid = total_amount <= available;

    return {
      valid: isValid,
      budget_id: b.budget_id,
      allocated_amount: b.allocated_amount,
      spent_amount: b.spent_amount,
      reserved_amount: b.reserved_amount,
      available_headroom: available,
      requested_amount: total_amount,
      headroom_after: isValid ? available - total_amount : available,
      message: isValid ? "Budget headroom available." : `Claim total ($${total_amount.toLocaleString()}) exceeds available headroom ($${available.toLocaleString()})!`
    };
  },

  getClaims: async (params = {}) => {
    let result = [...claims];
    if (params.department_id) {
      result = result.filter(c => c.department_id === Number(params.department_id));
    }
    if (params.employee_id) {
      result = result.filter(c => c.employee_id === Number(params.employee_id));
    }
    if (params.status) {
      result = result.filter(c => c.status === params.status);
    }
    if (params.is_high_value !== undefined) {
      result = result.filter(c => c.is_high_value === Number(params.is_high_value));
    }
    return result;
  },

  getClaimDetails: async (claimId) => {
    const cid = Number(claimId);
    const claim = claims.find(c => c.claim_id === cid);
    if (!claim) throw new Error("Claim not found");

    const claimItems = items.filter(i => i.claim_id === cid);
    const claimWorkflows = workflows.filter(w => w.claim_id === cid).sort((a, b) => a.step_order - b.step_order);

    return {
      ...claim,
      items: claimItems,
      workflows: claimWorkflows
    };
  },

  createClaim: async (payload) => {
    const user = users.find(u => u.user_id === Number(payload.employee_id)) || users[0];
    const dept = departments.find(d => d.department_id === Number(payload.department_id)) || departments[0];
    const budget = budgets.find(b => b.department_id === dept.department_id) || budgets[0];

    const total = payload.items.reduce((s, it) => s + Number(it.amount || 0) + Number(it.tax_amount || 0), 0);
    const isHighValue = total >= dept.high_value_threshold;

    const newClaimId = claims.length + 1;
    const newClaimNumber = `EXP-2026-${String(newClaimId).padStart(3, '0')}`;

    const newClaim = {
      claim_id: newClaimId,
      claim_number: newClaimNumber,
      employee_id: user.user_id,
      employee_name: user.full_name,
      employee_code: user.employee_code,
      employee_email: user.email,
      department_id: dept.department_id,
      department_name: dept.name,
      department_code: dept.department_code,
      budget_id: budget.budget_id,
      title: payload.title,
      total_amount: total,
      currency: payload.currency || 'USD',
      status: 'PENDING_MANAGER',
      is_high_value: isHighValue ? 1 : 0,
      high_value_threshold: dept.high_value_threshold,
      high_value_reason: isHighValue ? `Amount ($${total.toLocaleString()}) exceeds department threshold of $${dept.high_value_threshold.toLocaleString()}` : null,
      business_justification: payload.business_justification,
      submission_date: new Date().toISOString().replace('T', ' ').substring(0, 19),
      approved_at: null,
      reimbursed_at: null,
      item_count: payload.items.length
    };

    claims.unshift(newClaim);

    // Add items
    payload.items.forEach((it, idx) => {
      const cat = categories.find(c => c.category_id === Number(it.category_id)) || categories[0];
      items.push({
        item_id: items.length + 1,
        claim_id: newClaimId,
        category_id: cat.category_id,
        category_name: cat.category_name,
        category_code: cat.code,
        item_date: it.item_date || new Date().toISOString().substring(0, 10),
        merchant_name: it.merchant_name,
        amount: Number(it.amount),
        tax_amount: Number(it.tax_amount || 0),
        receipt_url: it.receipt_url || 'https://storage.company.com/receipts/sample_invoice.pdf',
        receipt_filename: `receipt_${idx + 1}.pdf`,
        notes: it.notes || ''
      });
    });

    // Encumber funds in budget
    budget.reserved_amount = (budget.reserved_amount || 0) + total;

    // Create workflow step 1
    const newWfId = workflows.length + 1;
    workflows.push({
      workflow_id: newWfId,
      claim_id: newClaimId,
      step_order: 1,
      approver_id: user.manager_id || 4,
      approver_name: user.manager_name || 'Alex Chen',
      approver_role: 'MANAGER',
      status: 'PENDING',
      comments: null,
      deadline_at: new Date(Date.now() + 3 * 86400000).toISOString().replace('T', ' ').substring(0, 19),
      action_taken_at: null,
      is_escalated: 0
    });

    // Record ledger entry
    ledger.unshift({
      ledger_id: ledger.length + 1,
      budget_id: budget.budget_id,
      claim_id: newClaimId,
      transaction_type: 'ENCUMBRANCE',
      amount: total,
      balance_after: budget.allocated_amount - (budget.spent_amount + budget.reserved_amount),
      description: `Encumbrance hold for Claim ${newClaimNumber}`,
      recorded_by: user.user_id,
      recorded_by_name: user.full_name,
      claim_number: newClaimNumber,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });

    // Record audit log
    auditLogs.unshift({
      log_id: auditLogs.length + 1,
      entity_name: 'expense_claims',
      entity_id: newClaimId,
      action: 'SUBMITTED',
      performed_by: user.user_id,
      performed_by_name: user.full_name,
      role: user.role,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      details: `Claim ${newClaimNumber} submitted ($${total.toLocaleString()})`
    });

    return {
      message: `Claim ${newClaimNumber} successfully submitted and $${total.toLocaleString()} encumbered.`,
      claim_id: newClaimId,
      claim_number: newClaimNumber
    };
  },

  getPendingApprovals: async (approverId = null) => {
    let pendingWfs = workflows.filter(w => w.status === 'PENDING');
    if (approverId) {
      pendingWfs = pendingWfs.filter(w => w.approver_id === Number(approverId));
    }

    return pendingWfs.map(w => {
      const c = claims.find(x => x.claim_id === w.claim_id) || {};
      const deadline = new Date(w.deadline_at);
      const isBreached = deadline < new Date();

      return {
        workflow_id: w.workflow_id,
        claim_id: w.claim_id,
        claim_number: c.claim_number,
        title: c.title,
        total_amount: c.total_amount,
        currency: c.currency,
        is_high_value: c.is_high_value,
        step_order: w.step_order,
        approver_id: w.approver_id,
        approver_role: w.approver_role,
        approver_name: w.approver_name,
        deadline_at: w.deadline_at,
        is_escalated: w.is_escalated,
        is_sla_breached: isBreached ? 1 : 0,
        employee_name: c.employee_name,
        department_name: c.department_name,
        department_code: c.department_code,
        days_elapsed: 2
      };
    });
  },

  takeApprovalAction: async (workflowId, payload) => {
    const wf = workflows.find(w => w.workflow_id === Number(workflowId));
    if (!wf) throw new Error("Workflow step not found");

    const claim = claims.find(c => c.claim_id === wf.claim_id);
    const budget = budgets.find(b => b.budget_id === claim.budget_id);
    const approver = users.find(u => u.user_id === Number(payload.approver_id)) || users[0];

    wf.status = payload.action;
    wf.comments = payload.comments;
    wf.action_taken_at = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (payload.action === 'APPROVE') {
      // Check if there are further tiers (e.g. if high-value and this was step 1)
      if (claim.is_high_value && wf.step_order === 1) {
        claim.status = 'PENDING_FINANCE';
        // Add CFO step
        const cfo = users.find(u => u.role === 'CFO') || users[0];
        workflows.push({
          workflow_id: workflows.length + 1,
          claim_id: claim.claim_id,
          step_order: 2,
          approver_id: cfo.user_id,
          approver_name: cfo.full_name,
          approver_role: 'CFO',
          status: 'PENDING',
          comments: null,
          deadline_at: new Date(Date.now() + 3 * 86400000).toISOString().replace('T', ' ').substring(0, 19),
          action_taken_at: null,
          is_escalated: 0
        });
      } else {
        // Final approval: convert encumbrance into settled spend
        claim.status = 'APPROVED';
        claim.approved_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
        budget.reserved_amount = Math.max(0, (budget.reserved_amount || 0) - claim.total_amount);
        budget.spent_amount = (budget.spent_amount || 0) + claim.total_amount;

        ledger.unshift({
          ledger_id: ledger.length + 1,
          budget_id: budget.budget_id,
          claim_id: claim.claim_id,
          transaction_type: 'SETTLEMENT',
          amount: claim.total_amount,
          balance_after: budget.allocated_amount - (budget.spent_amount + budget.reserved_amount),
          description: `Settlement for approved Claim ${claim.claim_number}`,
          recorded_by: approver.user_id,
          recorded_by_name: approver.full_name,
          claim_number: claim.claim_number,
          created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
      }

      auditLogs.unshift({
        log_id: auditLogs.length + 1,
        entity_name: 'expense_claims',
        entity_id: claim.claim_id,
        action: 'APPROVED',
        performed_by: approver.user_id,
        performed_by_name: approver.full_name,
        role: approver.role,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        details: `Claim ${claim.claim_number} approved by ${approver.full_name}`
      });

      return {
        message: `Claim ${claim.claim_number} approved successfully!`,
        claim_id: claim.claim_id
      };
    } else {
      // REJECT: Release reserved encumbrance
      claim.status = 'REJECTED';
      budget.reserved_amount = Math.max(0, (budget.reserved_amount || 0) - claim.total_amount);

      ledger.unshift({
        ledger_id: ledger.length + 1,
        budget_id: budget.budget_id,
        claim_id: claim.claim_id,
        transaction_type: 'RELEASE',
        amount: claim.total_amount,
        balance_after: budget.allocated_amount - (budget.spent_amount + budget.reserved_amount),
        description: `Release of encumbered funds upon rejection of ${claim.claim_number}: ${payload.comments}`,
        recorded_by: approver.user_id,
        recorded_by_name: approver.full_name,
        claim_number: claim.claim_number,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      });

      auditLogs.unshift({
        log_id: auditLogs.length + 1,
        entity_name: 'expense_claims',
        entity_id: claim.claim_id,
        action: 'REJECTED',
        performed_by: approver.user_id,
        performed_by_name: approver.full_name,
        role: approver.role,
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        details: `Claim ${claim.claim_number} rejected by ${approver.full_name}. Reason: ${payload.comments}`
      });

      return {
        message: `Claim ${claim.claim_number} rejected. Encumbered funds released back to department headroom.`,
        claim_id: claim.claim_id
      };
    }
  },

  getHighValueAnalytics: async () => {
    return claims.filter(c => c.is_high_value === 1);
  },

  getAuditLogs: async (limit = 40) => {
    return auditLogs.slice(0, limit);
  },

  getFraudDetection: async () => {
    return fraudDetections;
  },

  analyzeExpense: async (claimId) => {
    const claim = claims.find(c => c.claim_id === Number(claimId));
    const dept = departments.find(d => d.department_id === (claim ? claim.department_id : 1));
    const isOver = claim && claim.total_amount > (dept ? dept.high_value_threshold : 2000);

    return {
      risk_level: isOver ? "MEDIUM" : "LOW",
      risk_score: isOver ? 42 : 12,
      analysis: `Claim ${claim ? claim.claim_number : ''} evaluated with 3NF policy engine. ${isOver ? 'Exceeds standard department spending threshold; requires secondary executive approval.' : 'Items adhere to corporate expense policy guidelines.'}`,
      policy_violations: isOver ? ["High-Value Threshold Exceeded"] : [],
      recommendation: isOver ? "Verify business justification and ensure secondary sign-off." : "Standard expense meets all requirements. Recommended for approval."
    };
  }
};

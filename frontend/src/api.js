const API_BASE = "http://127.0.0.1:8000/api";

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || data.message || `HTTP ${res.status} error`);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${url}:`, err);
    throw err;
  }
}

export const api = {
  getUsers: () => request("/users"),
  getDepartments: () => request("/departments"),
  getCategories: () => request("/categories"),
  getBudgetsHealth: () => request("/budgets/health"),
  getBudgetLedger: (budgetId) => request(`/budgets/${budgetId}/ledger`),
  validateBudget: (payload) => request("/claims/validate-budget", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  getClaims: (params = {}) => {
    const query = new URLSearchParams();
    if (params.department_id) query.append("department_id", params.department_id);
    if (params.employee_id) query.append("employee_id", params.employee_id);
    if (params.status) query.append("status", params.status);
    if (params.is_high_value !== undefined) query.append("is_high_value", params.is_high_value);
    const qs = query.toString();
    return request(`/claims${qs ? `?${qs}` : ""}`);
  },
  getClaimDetails: (claimId) => request(`/claims/${claimId}`),
  createClaim: (payload) => request("/claims", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  getPendingApprovals: (approverId = null) => {
    const qs = approverId ? `?approver_id=${approverId}` : "";
    return request(`/approvals/pending${qs}`);
  },
  takeApprovalAction: (workflowId, payload) => request(`/approvals/${workflowId}/action`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  getHighValueAnalytics: () => request("/analytics/high-value"),
  getAuditLogs: (limit = 40) => request(`/audit-logs?limit=${limit}`),
  getFraudDetection: () => request("/analytics/fraud-detection"),
  analyzeExpense: (claimId) => request("/ai/analyze-expense", {
    method: "POST",
    body: JSON.stringify({ claim_id: claimId }),
  }),
};

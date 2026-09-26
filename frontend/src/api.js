import { mockApi } from "./mockService";

const API_BASE = "http://127.0.0.1:8001/api";

let isMockMode = typeof window !== "undefined" && window.location.hostname.includes("github.io");

async function checkBackendConnection() {
  if (isMockMode) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${API_BASE}/users`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    isMockMode = true;
    return false;
  }
}

async function request(path, options = {}) {
  if (isMockMode) {
    throw new Error("MOCK_FALLBACK");
  }

  const url = `${API_BASE}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || data.message || `HTTP ${res.status} error`);
    }
    return data;
  } catch (err) {
    console.warn(`Backend unreachable on ${url}, falling back to Demo Mock Mode.`);
    isMockMode = true;
    throw err;
  }
}

// Wrapper that falls back to mockApi if backend request fails
function withFallback(apiCall, mockCall) {
  return async (...args) => {
    if (isMockMode) {
      return mockCall(...args);
    }
    try {
      return await apiCall(...args);
    } catch {
      isMockMode = true;
      return await mockCall(...args);
    }
  };
}

export const api = {
  isDemoMode: () => isMockMode,

  getUsers: withFallback(
    () => request("/users"),
    () => mockApi.getUsers()
  ),

  getDepartments: withFallback(
    () => request("/departments"),
    () => mockApi.getDepartments()
  ),

  getCategories: withFallback(
    () => request("/categories"),
    () => mockApi.getCategories()
  ),

  getBudgetsHealth: withFallback(
    () => request("/budgets/health"),
    () => mockApi.getBudgetsHealth()
  ),

  getBudgetLedger: withFallback(
    (budgetId) => request(`/budgets/${budgetId}/ledger`),
    (budgetId) => mockApi.getBudgetLedger(budgetId)
  ),

  validateBudget: withFallback(
    (payload) => request("/claims/validate-budget", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    (payload) => mockApi.validateBudget(payload)
  ),

  getClaims: withFallback(
    (params = {}) => {
      const query = new URLSearchParams();
      if (params.department_id) query.append("department_id", params.department_id);
      if (params.employee_id) query.append("employee_id", params.employee_id);
      if (params.status) query.append("status", params.status);
      if (params.is_high_value !== undefined) query.append("is_high_value", params.is_high_value);
      const qs = query.toString();
      return request(`/claims${qs ? `?${qs}` : ""}`);
    },
    (params) => mockApi.getClaims(params)
  ),

  getClaimDetails: withFallback(
    (claimId) => request(`/claims/${claimId}`),
    (claimId) => mockApi.getClaimDetails(claimId)
  ),

  createClaim: withFallback(
    (payload) => request("/claims", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    (payload) => mockApi.createClaim(payload)
  ),

  getPendingApprovals: withFallback(
    (approverId = null) => {
      const qs = approverId ? `?approver_id=${approverId}` : "";
      return request(`/approvals/pending${qs}`);
    },
    (approverId) => mockApi.getPendingApprovals(approverId)
  ),

  takeApprovalAction: withFallback(
    (workflowId, payload) => request(`/approvals/${workflowId}/action`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    (workflowId, payload) => mockApi.takeApprovalAction(workflowId, payload)
  ),

  getHighValueAnalytics: withFallback(
    () => request("/analytics/high-value"),
    () => mockApi.getHighValueAnalytics()
  ),

  getAuditLogs: withFallback(
    (limit = 40) => request(`/audit-logs?limit=${limit}`),
    (limit) => mockApi.getAuditLogs(limit)
  ),

  getFraudDetection: withFallback(
    () => request("/analytics/fraud-detection"),
    () => mockApi.getFraudDetection()
  ),

  analyzeExpense: withFallback(
    (claimId) => request("/ai/analyze-expense", {
      method: "POST",
      body: JSON.stringify({ claim_id: claimId }),
    }),
    (claimId) => mockApi.analyzeExpense(claimId)
  ),
};

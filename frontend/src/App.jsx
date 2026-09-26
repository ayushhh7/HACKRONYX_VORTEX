import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, Receipt, CheckCircle2, XCircle, AlertTriangle, 
  Clock, ShieldAlert, ArrowRight, Plus, Trash2, Search, Filter,
  TrendingUp, DollarSign, RefreshCw, Eye, AlertCircle, FileText, ChevronRight, Sparkles
} from 'lucide-react';
import { api } from './api';

// Currency formatter
const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

export default function App() {
  // Navigation & User Context
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'claims' | 'new-claim' | 'approvals' | 'high-value' | 'audit'
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Data States
  const [budgetsData, setBudgetsData] = useState({ summary: {}, departments: [] });
  const [claims, setClaims] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [highValueClaims, setHighValueClaims] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [fraudDetections, setFraudDetections] = useState([]);
  
  // UI / Modal States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [selectedClaimDetails, setSelectedClaimDetails] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, workflowId: null, claimNumber: '', comments: '' });
  const [approvalScope, setApprovalScope] = useState('assigned'); // 'assigned' | 'all'
  const [selectedBudgetLedger, setSelectedBudgetLedger] = useState(null);

  // Initial Load
  useEffect(() => {
    loadInitialData();
  }, []);

  // Reload pending approvals when currentUser or approvalScope changes
  useEffect(() => {
    if (currentUser) {
      loadPendingApprovals();
    }
  }, [currentUser, approvalScope]);

  async function loadInitialData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [u, b, c, cat, d, hv, logs, fraud] = await Promise.all([
        api.getUsers(),
        api.getBudgetsHealth(),
        api.getClaims(),
        api.getCategories(),
        api.getDepartments(),
        api.getHighValueAnalytics(),
        api.getAuditLogs(30),
        api.getFraudDetection(),
      ]);

      setUsers(u);
      // Default to Liam Vance (EMPLOYEE, user_id=9) or first user
      const defaultUser = u.find(x => x.employee_code === 'EMP101') || u[0];
      setCurrentUser(defaultUser);
      setBudgetsData(b);
      setClaims(c);
      setCategories(cat);
      setDepartments(d);
      setHighValueClaims(hv);
      setAuditLogs(logs);
      setFraudDetections(fraud);
    } catch (err) {
      setErrorMsg("Failed to connect to backend: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshData() {
    setRefreshing(true);
    try {
      const [b, c, hv, logs] = await Promise.all([
        api.getBudgetsHealth(),
        api.getClaims(),
        api.getHighValueAnalytics(),
        api.getAuditLogs(30),
      ]);
      setBudgetsData(b);
      setClaims(c);
      setHighValueClaims(hv);
      setAuditLogs(logs);
      await loadPendingApprovals();
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadPendingApprovals() {
    try {
      const approverId = approvalScope === 'assigned' && currentUser ? currentUser.user_id : null;
      const data = await api.getPendingApprovals(approverId);
      setPendingApprovals(data);
    } catch (err) {
      console.error("Failed to load approvals:", err);
    }
  }

  async function viewClaimDetails(claimId) {
    try {
      const details = await api.getClaimDetails(claimId);
      setSelectedClaimDetails(details);
    } catch (err) {
      alert("Error loading claim details: " + err.message);
    }
  }

  async function viewBudgetLedger(budgetId) {
    try {
      const ledger = await api.getBudgetLedger(budgetId);
      const dept = budgetsData.departments.find(d => d.budget_id === budgetId);
      setSelectedBudgetLedger({ dept, ledger });
    } catch (err) {
      alert("Error loading budget ledger: " + err.message);
    }
  }

  async function handleApprove(workflowId, claimNumber) {
    if (!currentUser) return;
    try {
      const res = await api.takeApprovalAction(workflowId, {
        action: 'APPROVE',
        approver_id: currentUser.user_id,
        comments: `Approved by ${currentUser.full_name} (${currentUser.role})`
      });
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(null), 4000);
      await refreshData();
      if (selectedClaimDetails && selectedClaimDetails.claim_id === res.claim_id) {
        viewClaimDetails(res.claim_id);
      }
    } catch (err) {
      setErrorMsg("Approval failed: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    }
  }

  async function handleRejectSubmit() {
    if (!currentUser || !rejectModal.workflowId) return;
    try {
      const res = await api.takeApprovalAction(rejectModal.workflowId, {
        action: 'REJECT',
        approver_id: currentUser.user_id,
        comments: rejectModal.comments || "Rejected by reviewer without extra notes"
      });
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(null), 4000);
      setRejectModal({ open: false, workflowId: null, claimNumber: '', comments: '' });
      await refreshData();
      if (selectedClaimDetails) {
        viewClaimDetails(selectedClaimDetails.claim_id);
      }
    } catch (err) {
      setErrorMsg("Rejection failed: " + err.message);
      setTimeout(() => setErrorMsg(null), 5000);
    }
  }

  // Preset demo personas
  const demoPersonas = [
    { label: "Liam Vance — EMPLOYEE (Engineering)", code: "EMP101" },
    { label: "Elena Rostova — MANAGER (Marketing)", code: "EMP011" },
    { label: "Alex Chen — DEPT HEAD (Engineering)", code: "EMP010" },
    { label: "David Miller — FINANCE ADMIN", code: "EMP002" },
    { label: "Sarah Jenkins — CFO (Executive)", code: "EMP001" },
    { label: "Victoria Sterling — AUDITOR", code: "EMP003" },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-bold">Connecting to Expense & Budget System...</h2>
          <p className="text-slate-400 text-sm mt-1">Inspecting SQLite Database & Initializing Roles</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* ============================================================== */}
      {/* TOP NAVBAR & PERSONA SWITCHER */}
      {/* ============================================================== */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                Enterprise Expense & Budget System
                <span className="text-[10px] uppercase font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700/60 px-2 py-0.5 rounded">3NF Engine</span>
              </span>
              <p className="text-xs text-slate-400">Two-Phase Commitment & SLA Protocol</p>
            </div>
          </div>

          {/* Persona Switcher Dropdown */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-slate-800/80 rounded-lg p-1.5 border border-slate-700">
              <Users className="w-4 h-4 text-indigo-400 ml-2 mr-2" />
              <div className="flex flex-col text-left mr-2">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Active Persona</span>
                <select
                  value={currentUser ? currentUser.employee_code : ''}
                  onChange={(e) => {
                    const selected = users.find(u => u.employee_code === e.target.value);
                    if (selected) setCurrentUser(selected);
                  }}
                  className="bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer pr-2"
                >
                  {demoPersonas.map(dp => {
                    const exists = users.find(u => u.employee_code === dp.code);
                    return exists ? (
                      <option key={dp.code} value={dp.code} className="bg-slate-900 text-white">
                        {dp.label}
                      </option>
                    ) : null;
                  })}
                  <option disabled>──────────</option>
                  {users.map(u => (
                    <option key={u.user_id} value={u.employee_code} className="bg-slate-900 text-white">
                      {u.full_name} ({u.role} - {u.department_code})
                    </option>
                  ))}
                </select>
              </div>

              {currentUser && (
                <div className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold px-2 py-1 rounded">
                  {currentUser.role}
                </div>
              )}
            </div>

            <button 
              onClick={refreshData}
              disabled={refreshing}
              title="Refresh Data"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {successMsg && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center space-x-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="bg-rose-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center space-x-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}
      </header>

      {/* ============================================================== */}
      {/* MAIN LAYOUT (SIDEBAR + CONTENT) */}
      {/* ============================================================== */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 gap-6">
        
        {/* Navigation Sidebar */}
        <aside className="w-60 flex-shrink-0">
          <nav className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <TrendingUp className="w-4 h-4" />
                <span>Dashboard</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('claims')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'claims' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Receipt className="w-4 h-4" />
                <span>Expense Claims</span>
              </div>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{claims.length}</span>
            </button>

            <button
              onClick={() => setActiveTab('new-claim')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'new-claim' ? 'bg-indigo-600 text-white shadow-sm font-semibold' : 'text-slate-700 hover:bg-slate-50 border border-indigo-200 bg-indigo-50/50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Plus className="w-4 h-4" />
                <span>Submit New Claim</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-700 text-white px-1.5 py-0.5 rounded">Action</span>
            </button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'approvals' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Clock className="w-4 h-4" />
                <span>Approvals Queue</span>
              </div>
              {pendingApprovals.length > 0 && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold animate-pulse">
                  {pendingApprovals.length}
                </span>
              )}
            </button>

            <div className="pt-2 border-t border-slate-100 mt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3">Advanced Radar</span>
            </div>

            <button
              onClick={() => setActiveTab('high-value')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'high-value' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span>High-Value Radar</span>
              </div>
              <span className="text-xs bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                {highValueClaims.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'audit' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Audit & Ledger</span>
              </div>
            </button>
          </nav>

          {/* Quick Context Card */}
          <div className="mt-4 bg-slate-900 text-slate-300 rounded-xl p-4 text-xs shadow-sm border border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Current Submitter Info</span>
            <p className="font-semibold text-white mt-1 text-sm">{currentUser?.full_name}</p>
            <p className="text-slate-400">{currentUser?.email}</p>
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Department:</span>
                <span className="font-medium text-white">{currentUser?.department_name} ({currentUser?.department_code})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Manager:</span>
                <span className="font-medium text-white">{currentUser?.manager_name || 'N/A (Director)'}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          {activeTab === 'dashboard' && (
            <DashboardView 
              budgetsData={budgetsData} 
              claims={claims} 
              pendingCount={pendingApprovals.length} 
              onViewClaim={viewClaimDetails}
              onViewLedger={viewBudgetLedger}
            />
          )}

          {activeTab === 'claims' && (
            <ClaimsListView 
              claims={claims} 
              onViewClaim={viewClaimDetails} 
              onNewClaim={() => setActiveTab('new-claim')}
            />
          )}

          {activeTab === 'new-claim' && (
            <NewClaimFormView 
              currentUser={currentUser} 
              departments={departments} 
              categories={categories}
              onSuccess={() => {
                refreshData();
                setActiveTab('claims');
              }}
            />
          )}

          {activeTab === 'approvals' && (
            <ApprovalsQueueView 
              approvals={pendingApprovals}
              currentUser={currentUser}
              approvalScope={approvalScope}
              setApprovalScope={setApprovalScope}
              onApprove={handleApprove}
              onReject={(wfId, cNum) => setRejectModal({ open: true, workflowId: wfId, claimNumber: cNum, comments: '' })}
              onViewClaim={viewClaimDetails}
            />
          )}

          {activeTab === 'high-value' && (
            <HighValueRadarView 
              claims={highValueClaims}
              onViewClaim={viewClaimDetails}
            />
          )}

          {activeTab === 'audit' && (
            <AuditHubView 
              auditLogs={auditLogs}
              fraudDetections={fraudDetections}
            />
          )}
        </main>
      </div>

      {/* ============================================================== */}
      {/* CLAIM DETAILS MODAL */}
      {/* ============================================================== */}
      {selectedClaimDetails && (
        <ClaimDetailsModal 
          claim={selectedClaimDetails} 
          onClose={() => setSelectedClaimDetails(null)} 
          onApprove={handleApprove}
          onReject={(wfId, cNum) => {
            setSelectedClaimDetails(null);
            setRejectModal({ open: true, workflowId: wfId, claimNumber: cNum, comments: '' });
          }}
          currentUser={currentUser}
        />
      )}

      {/* ============================================================== */}
      {/* BUDGET LEDGER MODAL */}
      {/* ============================================================== */}
      {selectedBudgetLedger && (
        <BudgetLedgerModal 
          data={selectedBudgetLedger} 
          onClose={() => setSelectedBudgetLedger(null)} 
        />
      )}

      {/* ============================================================== */}
      {/* REJECT COMMENT MODAL */}
      {/* ============================================================== */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-scaleIn">
            <div className="flex items-center space-x-3 text-rose-600 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-900">Reject Expense Claim</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Please specify the reason for rejecting claim <span className="font-mono font-bold text-slate-900">{rejectModal.claimNumber}</span>.
              This will release encumbered funds back into the department budget ledger.
            </p>
            <textarea
              rows={4}
              value={rejectModal.comments}
              onChange={(e) => setRejectModal({ ...rejectModal, comments: e.target.value })}
              placeholder="e.g., Missing itemized tax invoice; exceeds quarterly entertainment allowance..."
              className="w-full text-sm border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-rose-500 mb-4"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setRejectModal({ open: false, workflowId: null, claimNumber: '', comments: '' })}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition"
              >
                Confirm Rejection & Release Funds
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 1. DASHBOARD COMPONENT
// ============================================================================
function DashboardView({ budgetsData, claims, pendingCount, onViewClaim, onViewLedger }) {
  const summary = budgetsData.summary || {};
  const depts = budgetsData.departments || [];

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Financial & Budget Overview</h1>
          <p className="text-sm text-slate-500">Real-time budget headroom, two-phase encumbrance, and pending approval metrics.</p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <span>Fiscal Period: FY 2026 - Q3</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Allocated</span>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt(summary.total_allocated)}</p>
          <span className="text-[10px] text-slate-500">Authorized Q3 funds</span>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Spent</span>
          <p className="text-xl font-bold text-indigo-600 mt-1">{fmt(summary.total_spent)}</p>
          <span className="text-[10px] text-slate-500">Settled & approved</span>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Reserved (Locked)</span>
          <p className="text-xl font-bold text-amber-600 mt-1">{fmt(summary.total_reserved)}</p>
          <span className="text-[10px] text-amber-600 font-medium">Encumbered in queue</span>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Available Headroom</span>
          <p className="text-xl font-bold text-emerald-600 mt-1">{fmt(summary.total_available)}</p>
          <span className="text-[10px] text-emerald-600 font-medium">Free for new claims</span>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Pending Approvals</span>
          <p className="text-xl font-bold text-slate-900 mt-1">{pendingCount}</p>
          <span className="text-[10px] text-slate-500">Awaiting reviewer sign-off</span>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Overall Committed</span>
          <p className="text-xl font-bold text-slate-900 mt-1">{summary.utilization_pct || 0}%</p>
          <span className="text-[10px] text-slate-500">Spent + Reserved ratio</span>
        </div>
      </div>

      {/* Department Budget Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Department Budget Health & Headroom</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-normal">Live 3NF View</span>
          </h2>
          <span className="text-xs text-slate-500">Thresholds: 80% Warning, 95% Critical</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {depts.map((d) => {
            const spentPct = Math.min(100, Math.round((d.spent_amount / d.allocated_amount) * 100));
            const reservedPct = Math.min(100 - spentPct, Math.round((d.reserved_amount / d.allocated_amount) * 100));
            
            // Status pill styling
            let statusBadge = { bg: "bg-emerald-100 text-emerald-800 border-emerald-300", label: "HEALTHY" };
            if (d.budget_health_status === 'WARNING') {
              statusBadge = { bg: "bg-amber-100 text-amber-800 border-amber-300", label: "⚡ WARNING (80%+)" };
            } else if (d.budget_health_status === 'CRITICAL' || d.budget_health_status === 'OVER_BUDGET') {
              statusBadge = { bg: "bg-rose-100 text-rose-800 border-rose-300 animate-pulse", label: "🚨 CRITICAL (95%+)" };
            }

            return (
              <div key={d.budget_id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col justify-between hover:shadow-md transition">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                        {d.department_code}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm mt-1">{d.department_name}</h3>
                      <p className="text-xs text-slate-500">Head: {d.department_manager || 'Vacant'}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBadge.bg}`}>
                      {statusBadge.label}
                    </span>
                  </div>

                  {/* Progress Bar (Dual Stacked: Spent + Reserved) */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700">Committed: {d.utilization_pct}%</span>
                      <span className="text-slate-500">Allocated: {fmt(d.allocated_amount)}</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                      <div 
                        style={{ width: `${spentPct}%` }} 
                        className="bg-indigo-600 h-full"
                        title={`Spent: ${fmt(d.spent_amount)} (${spentPct}%)`}
                      />
                      <div 
                        style={{ width: `${reservedPct}%` }} 
                        className="bg-amber-500 h-full"
                        title={`Reserved: ${fmt(d.reserved_amount)} (${reservedPct}%)`}
                      />
                    </div>
                    <div className="flex items-center space-x-3 text-[10px] text-slate-500 mt-1">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span> Spent ({fmt(d.spent_amount)})</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Reserved ({fmt(d.reserved_amount)})</span>
                    </div>
                  </div>

                  {/* Numbers grid */}
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-semibold">Remaining Headroom</span>
                      <p className={`font-bold ${d.available_remaining < 5000 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {fmt(d.available_remaining)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-semibold">Status / Period</span>
                      <p className="font-medium text-slate-700">{d.budget_status} • Q{d.quarter}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onViewLedger(d.budget_id)}
                  className="mt-4 w-full py-1.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center space-x-1.5 transition"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Inspect Double-Entry Ledger</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Claims Preview */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Recent Expense Submissions</h3>
          <span className="text-xs text-slate-400">Click row for full line-item & SLA breakdown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Claim #</th>
                <th className="py-2.5 px-4">Title & Description</th>
                <th className="py-2.5 px-4">Employee</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claims.slice(0, 6).map((c) => (
                <tr key={c.claim_id} className="hover:bg-slate-50 transition cursor-pointer" onClick={() => onViewClaim(c.claim_id)}>
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{c.claim_number}</td>
                  <td className="py-3 px-4 font-medium text-slate-800 max-w-xs truncate">{c.title}</td>
                  <td className="py-3 px-4 text-slate-600">{c.employee_name}</td>
                  <td className="py-3 px-4 text-slate-600">{c.department_code}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {fmt(c.total_amount)}
                    {c.is_high_value === 1 && (
                      <span className="ml-1 text-[9px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded">High Value</span>
                    )}
                  </td>
                  <td className="py-3 px-4"><StatusBadge status={c.status} /></td>
                  <td className="py-3 px-4 text-right">
                    <button className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center text-xs">
                      Inspect <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. CLAIMS LIST VIEW
// ============================================================================
function ClaimsListView({ claims, onViewClaim, onNewClaim }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [highValueOnly, setHighValueOnly] = useState(false);

  const filtered = claims.filter(c => {
    const matchesSearch = c.claim_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.department_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesHighVal = !highValueOnly || c.is_high_value === 1;
    return matchesSearch && matchesStatus && matchesHighVal;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Expense Claims</h1>
          <p className="text-sm text-slate-500">Browse, filter, and audit itemized employee expense reports.</p>
        </div>
        <button
          onClick={onNewClaim}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center space-x-2 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Expense Claim</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by claim #, employee, title, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent focus:outline-none text-slate-800 text-xs"
          />
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-500 font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_MANAGER">Pending Manager</option>
              <option value="PENDING_FINANCE">Pending Finance</option>
              <option value="PENDING_CFO">Pending CFO</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          <label className="flex items-center space-x-1.5 cursor-pointer font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
            <input
              type="checkbox"
              checked={highValueOnly}
              onChange={(e) => setHighValueOnly(e.target.checked)}
              className="rounded text-rose-600 focus:ring-rose-500"
            />
            <span>High Value Only</span>
          </label>
        </div>
      </div>

      {/* Claims Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Claim Number</th>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">High Value?</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Submitted</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-slate-400">
                    No expense claims found matching filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.claim_id} className="hover:bg-slate-50 transition cursor-pointer" onClick={() => onViewClaim(c.claim_id)}>
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">{c.claim_number}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-xs truncate">{c.title}</td>
                    <td className="py-3.5 px-4 text-slate-700">{c.employee_name}</td>
                    <td className="py-3.5 px-4 text-slate-600">{c.department_code}</td>
                    <td className="py-3.5 px-4 text-slate-500">{c.item_count || 1} receipt(s)</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{fmt(c.total_amount)}</td>
                    <td className="py-3.5 px-4">
                      {c.is_high_value === 1 ? (
                        <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]">
                          ⚡ High Value
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">Standard</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4"><StatusBadge status={c.status} /></td>
                    <td className="py-3.5 px-4 text-slate-500">{c.submission_date?.split(' ')[0]}</td>
                    <td className="py-3.5 px-4 text-right">
                      <button className="p-1 text-slate-400 hover:text-indigo-600 transition">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. NEW CLAIM FORM VIEW (WITH LIVE HEADROOM VALIDATION & MULTI-ITEMS)
// ============================================================================
function NewClaimFormView({ currentUser, departments, categories, onSuccess }) {
  const [selectedDeptId, setSelectedDeptId] = useState(currentUser?.department_id || (departments[0]?.department_id || 1));
  const [title, setTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [items, setItems] = useState([
    {
      category_id: categories[0]?.category_id || 1,
      item_date: new Date().toISOString().split('T')[0],
      merchant_name: '',
      amount: '',
      tax_amount: '0.00',
      receipt_url: '',
      notes: ''
    }
  ]);

  const [validationState, setValidationState] = useState({ checking: false, valid: true, message: '', headroom: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Compute live total
  const totalAmount = items.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

  // Find active department object
  const activeDept = departments.find(d => d.department_id === parseInt(selectedDeptId));
  const isHighValue = activeDept && totalAmount >= activeDept.high_value_threshold;

  // Validate budget with backend whenever department or total changes
  useEffect(() => {
    if (selectedDeptId && totalAmount > 0) {
      validateBudgetWithServer();
    }
  }, [selectedDeptId, totalAmount]);

  async function validateBudgetWithServer() {
    setValidationState(prev => ({ ...prev, checking: true }));
    try {
      const res = await api.validateBudget({
        department_id: parseInt(selectedDeptId),
        total_amount: totalAmount,
      });
      setValidationState({
        checking: false,
        valid: res.valid,
        message: res.message,
        headroom: res.available_headroom,
        headroomAfter: res.headroom_after,
      });
    } catch (err) {
      setValidationState({
        checking: false,
        valid: false,
        message: err.message,
        headroom: 0,
      });
    }
  }

  function handleAddItem() {
    setItems([
      ...items,
      {
        category_id: categories[0]?.category_id || 1,
        item_date: new Date().toISOString().split('T')[0],
        merchant_name: '',
        amount: '',
        tax_amount: '0.00',
        receipt_url: '',
        notes: ''
      }
    ]);
  }

  function handleRemoveItem(index) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function handleItemChange(index, field, value) {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Please enter a claim title.");
      return;
    }
    if (!justification.trim()) {
      setFormError("Please provide a business justification.");
      return;
    }
    if (totalAmount <= 0) {
      setFormError("Total claim amount must be greater than $0.");
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (!items[i].merchant_name.trim()) {
        setFormError(`Please enter a merchant name for item #${i + 1}`);
        return;
      }
      if (!items[i].amount || parseFloat(items[i].amount) <= 0) {
        setFormError(`Please enter a valid amount for item #${i + 1}`);
        return;
      }
    }

    if (!validationState.valid) {
      setFormError("Cannot submit: " + validationState.message);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        employee_id: currentUser ? currentUser.user_id : 9,
        department_id: parseInt(selectedDeptId),
        title,
        business_justification: justification,
        currency: "USD",
        items: items.map(it => ({
          category_id: parseInt(it.category_id),
          item_date: it.item_date,
          merchant_name: it.merchant_name,
          amount: parseFloat(it.amount),
          tax_amount: parseFloat(it.tax_amount || 0),
          receipt_url: it.receipt_url || "https://storage.company.com/receipts/placeholder.pdf",
          notes: it.notes || ""
        }))
      };

      const res = await api.createClaim(payload);
      alert(`Success! Claim ${res.claim_number} created.\nBudget funds encumbered: ${fmt(res.total_amount)}.\nStatus: PENDING_MANAGER.`);
      onSuccess();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Submit New Expense Claim</h1>
          <p className="text-sm text-slate-500">Two-phase budget encumbrance will automatically reserve funds upon submission.</p>
        </div>
      </div>

      {formError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs font-semibold flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Claim Header Card */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">1</span>
            <span>Claim Details & Department Cost Center</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Claim Title / Purpose *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Client Pitch in Chicago / Cloud Database Cluster"
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Funding Department *</label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>
                    {d.name} ({d.department_code}) — High-Value Threshold: {fmt(d.high_value_threshold)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs">
            <label className="block font-semibold text-slate-700 mb-1">Business Justification *</label>
            <textarea
              rows={2}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="State the commercial or operational business justification for this expense..."
              className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Step 2: Line Items Card */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center">2</span>
              <span>Itemized Receipts & Expenses</span>
            </h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="py-1 px-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold flex items-center space-x-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Line Item</span>
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-700">Receipt Item #{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-rose-500 hover:text-rose-700 text-xs flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Expense Category *</label>
                    <select
                      value={item.category_id}
                      onChange={(e) => handleItemChange(idx, 'category_id', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {categories.map((cat) => (
                        <option key={cat.category_id} value={cat.category_id}>
                          {cat.category_name} ({cat.gl_account_code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Merchant / Vendor *</label>
                    <input
                      type="text"
                      placeholder="e.g. Delta Air Lines, AWS"
                      value={item.merchant_name}
                      onChange={(e) => handleItemChange(idx, 'merchant_name', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Transaction Date *</label>
                    <input
                      type="date"
                      value={item.item_date}
                      onChange={(e) => handleItemChange(idx, 'item_date', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Pre-Tax Amount ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={item.amount}
                      onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-1.5 font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Receipt Cloud URL / Invoice File</label>
                    <input
                      type="text"
                      placeholder="https://storage.company.com/receipts/inv_2026.pdf"
                      value={item.receipt_url}
                      onChange={(e) => handleItemChange(idx, 'receipt_url', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-1.5 font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Item Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 2 nights accommodation, SFO-JFK"
                      value={item.notes}
                      onChange={(e) => handleItemChange(idx, 'notes', e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded p-1.5"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step 3: Live Financial Headroom & Verification Box */}
        <div className="bg-slate-900 text-white p-5 rounded-xl shadow-md border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Protocol Verification</span>
              <h3 className="text-base font-bold text-white">Two-Phase Budget Pre-Commitment Check</h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Total Claim Amount</span>
              <p className="text-2xl font-mono font-bold text-indigo-300">{fmt(totalAmount)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
              <span className="text-slate-400 block text-[10px] uppercase">Available Dept Headroom</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {fmt(validationState.headroom || (activeDept ? activeDept.remaining_funds : 0))}
              </span>
            </div>

            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
              <span className="text-slate-400 block text-[10px] uppercase">Headroom After Encumbrance</span>
              <span className={`text-base font-bold font-mono ${validationState.valid ? 'text-white' : 'text-rose-400'}`}>
                {fmt(validationState.headroomAfter || 0)}
              </span>
            </div>

            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
              <span className="text-slate-400 block text-[10px] uppercase">Department High-Value Cap</span>
              <span className="text-base font-bold text-amber-400 font-mono">
                {fmt(activeDept?.high_value_threshold)}
              </span>
            </div>
          </div>

          {/* Validation Status Notice */}
          {totalAmount > 0 && (
            <div className={`p-3 rounded-lg text-xs font-semibold flex items-center space-x-2 ${
              validationState.valid ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-rose-950/80 border border-rose-800 text-rose-300'
            }`}>
              {validationState.valid ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
              <span>{validationState.message || "Validating headroom..."}</span>
            </div>
          )}

          {isHighValue && (
            <div className="p-3 bg-amber-950/80 border border-amber-800 rounded-lg text-xs text-amber-300 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-400" />
              <span>
                <strong>High-Value Escalation Triggered:</strong> Claim exceeds {fmt(activeDept?.high_value_threshold)}. 
                Workflow will require secondary Department Head / Finance and CFO sign-off.
              </span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting || !validationState.valid || totalAmount <= 0}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center space-x-2 shadow-lg transition ${
                submitting || !validationState.valid || totalAmount <= 0
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
              }`}
            >
              <span>{submitting ? 'Encumbering & Submitting...' : 'Confirm Submission & Lock Headroom'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// 4. APPROVALS QUEUE VIEW
// ============================================================================
function ApprovalsQueueView({ 
  approvals, 
  currentUser, 
  approvalScope, 
  setApprovalScope, 
  onApprove, 
  onReject, 
  onViewClaim 
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Approvals & SLA Queue</h1>
          <p className="text-sm text-slate-500">Sequential multi-tier review chain with strict SLA deadline tracking.</p>
        </div>

        {/* Scope switcher (Assigned to Me vs All Org) */}
        <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm text-xs font-semibold">
          <button
            onClick={() => setApprovalScope('assigned')}
            className={`px-3 py-1.5 rounded-md transition ${
              approvalScope === 'assigned' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Assigned to {currentUser?.full_name?.split(' ')[0]} ({currentUser?.role})
          </button>
          <button
            onClick={() => setApprovalScope('all')}
            className={`px-3 py-1.5 rounded-md transition ${
              approvalScope === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Pending Across Org
          </button>
        </div>
      </div>

      {approvals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">Inbox Zero: No Pending Approvals</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            All submitted expense reports in this view have been processed or routed to the next reviewer.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((item) => {
            const isBreached = item.sla_status === 'SLA_BREACHED';
            const isWarning = item.sla_status === 'SLA_WARNING';

            return (
              <div 
                key={item.workflow_id} 
                className={`bg-white rounded-xl shadow-sm border p-4 transition ${
                  isBreached ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Claim info */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-indigo-600 text-sm">{item.claim_number}</span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="font-bold text-slate-900 text-sm">{item.claim_title}</span>
                      {item.is_high_value === 1 && (
                        <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          ⚡ High Value
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Submitter: <strong className="text-slate-700">{item.submitter_name}</strong></span>
                      <span>Dept: <strong className="text-slate-700">{item.department_name}</strong></span>
                      <span>Assigned Reviewer: <strong className="text-indigo-700">{item.assigned_approver_name} ({item.approver_role})</strong></span>
                      <span>Step Order: <strong>Step {item.step_order}</strong></span>
                    </div>
                  </div>

                  {/* Middle: Amount & SLA */}
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Amount</span>
                      <span className="text-lg font-bold font-mono text-slate-900">{fmt(item.total_amount)}</span>
                    </div>

                    {/* SLA Badge */}
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">SLA Aging</span>
                      {isBreached ? (
                        <span className="bg-rose-600 text-white font-bold text-[10px] px-2 py-1 rounded inline-flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> SLA BREACHED
                        </span>
                      ) : isWarning ? (
                        <span className="bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10px] px-2 py-1 rounded inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> &lt;24h Remaining
                        </span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] px-2 py-1 rounded inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> ON TRACK
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                      <button
                        onClick={() => onViewClaim(item.claim_id)}
                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                        title="View Full Itemized Receipts"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onApprove(item.workflow_id, item.claim_number)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center space-x-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>APPROVE</span>
                      </button>

                      <button
                        onClick={() => onReject(item.workflow_id, item.claim_number)}
                        className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-xs rounded-lg transition flex items-center space-x-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>REJECT</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. HIGH-VALUE RADAR VIEW
// ============================================================================
function HighValueRadarView({ claims, onViewClaim }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
            <span>High-Value Expense Radar</span>
          </h1>
          <p className="text-sm text-slate-500">Automated executive surveillance of transactions exceeding department policy caps.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Claim #</th>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Dept Threshold</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">Excess Amount</th>
                <th className="py-3 px-4">Submitter</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {claims.map((c) => {
                const excess = c.total_amount - c.department_threshold;
                return (
                  <tr key={c.claim_id} className="hover:bg-slate-50 transition cursor-pointer" onClick={() => onViewClaim(c.claim_id)}>
                    <td className="py-3 px-4 font-mono font-bold text-rose-600">{c.claim_number}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs truncate">{c.title}</td>
                    <td className="py-3 px-4 text-slate-600">{c.department_name}</td>
                    <td className="py-3 px-4 text-slate-500 font-mono">{fmt(c.department_threshold)}</td>
                    <td className="py-3 px-4 font-bold text-slate-900 font-mono">{fmt(c.total_amount)}</td>
                    <td className="py-3 px-4 font-bold text-rose-600 font-mono">+{fmt(excess > 0 ? excess : 0)}</td>
                    <td className="py-3 px-4 text-slate-700">{c.submitted_by}</td>
                    <td className="py-3 px-4"><StatusBadge status={c.claim_status} /></td>
                    <td className="py-3 px-4 text-right">
                      <button className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs inline-flex items-center">
                        Audit <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 6. AUDIT & LEDGER HUB VIEW
// ============================================================================
function AuditHubView({ auditLogs, fraudDetections }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Audit Trail & Forensic Compliance</h1>
        <p className="text-sm text-slate-500">Immutable change-capture logs, JSON state history, and duplicate detection scanner.</p>
      </div>

      {/* Fraud / Duplicate Scanner Warning Card */}
      {fraudDetections.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span>Duplicate Submission Scanner (Query 9 Alert)</span>
          </div>
          <p className="text-xs text-amber-800 mb-3">
            Potential duplicate submissions detected with identical employee, merchant, date, and monetary amount:
          </p>
          <div className="bg-white rounded-lg border border-amber-200 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-amber-100 text-amber-900 font-semibold">
                <tr>
                  <th className="p-2">Employee</th>
                  <th className="p-2">Merchant</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Duplicate Count</th>
                  <th className="p-2">Affected Claim #s</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {fraudDetections.map((f, i) => (
                  <tr key={i} className="hover:bg-amber-50">
                    <td className="p-2 font-medium">{f.full_name}</td>
                    <td className="p-2">{f.merchant_name}</td>
                    <td className="p-2">{f.item_date}</td>
                    <td className="p-2 font-bold font-mono">{fmt(f.amount)}</td>
                    <td className="p-2 font-bold text-rose-600">{f.duplicate_submission_count}x</td>
                    <td className="p-2 font-mono text-indigo-700">{f.affected_claims}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">System Forensic Audit Logs</h3>
          <span className="text-xs text-slate-400">Recording old vs new JSON states</span>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Log ID</th>
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Entity</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Actor</th>
                <th className="py-2.5 px-4">Captured State / Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <tr key={log.log_id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono text-slate-400">#{log.log_id}</td>
                  <td className="py-2.5 px-4 text-slate-500">{log.created_at}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-700">{log.entity_name} #{log.entity_id}</td>
                  <td className="py-2.5 px-4">
                    <span className="bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded text-[10px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-700">{log.performed_by_name || 'System Protocol'}</td>
                  <td className="py-2.5 px-4 font-mono text-[11px] max-w-md truncate text-slate-600">
                    {log.new_state || log.old_state || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 7. CLAIM DETAILS MODAL COMPONENT (WITH STEPPER TIMELINE & LEDGER)
// ============================================================================
function ClaimDetailsModal({ claim, onClose, onApprove, onReject, currentUser }) {
  const pendingStep = claim.workflows?.find(w => w.status === 'PENDING');
  const canAct = pendingStep && (
    currentUser?.user_id === pendingStep.approver_id || 
    ['FINANCE_ADMIN', 'CFO'].includes(currentUser?.role)
  );

  // Gemini AI Analysis States
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiError, setAiError] = useState(null);

  async function handleAiAnalyze() {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await api.analyzeExpense(claim.claim_id);
      setAiAnalysis(res.analysis);
    } catch (err) {
      console.error("AI Analysis error:", err);
      if (err.message && err.message.includes("Gemini API key is not configured")) {
        setAiError("AI analysis is currently unavailable. Please configure the Gemini API key.");
      } else {
        setAiError("AI analysis failed. Please try again.");
      }
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-8 animate-scaleIn">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="font-mono font-bold text-lg text-indigo-400">{claim.claim_number}</span>
            <StatusBadge status={claim.status} />
            {claim.is_high_value === 1 && (
              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold px-2 py-0.5 rounded">
                ⚡ High Value
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">✕ Close</button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 uppercase text-[10px] font-semibold">Claim Submitter</span>
              <p className="font-bold text-slate-800 text-sm mt-0.5">{claim.employee_name}</p>
              <p className="text-slate-500">{claim.employee_email}</p>
            </div>
            <div>
              <span className="text-slate-400 uppercase text-[10px] font-semibold">Department</span>
              <p className="font-bold text-slate-800 text-sm mt-0.5">{claim.department_name}</p>
              <p className="text-slate-500">Threshold: {fmt(claim.high_value_threshold)}</p>
            </div>
            <div>
              <span className="text-slate-400 uppercase text-[10px] font-semibold">Total Amount</span>
              <p className="font-bold text-indigo-600 text-lg font-mono mt-0.5">{fmt(claim.total_amount)}</p>
            </div>
            <div>
              <span className="text-slate-400 uppercase text-[10px] font-semibold">Submission Date</span>
              <p className="font-bold text-slate-800 text-sm mt-0.5">{claim.submission_date?.split(' ')[0]}</p>
              <p className="text-slate-500">{claim.submission_date?.split(' ')[1] || ''}</p>
            </div>
          </div>

          {/* Business Justification */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Business Justification</h4>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700">
              {claim.business_justification}
            </div>
            {claim.high_value_reason && (
              <p className="mt-2 text-xs text-rose-600 font-semibold bg-rose-50 p-2 rounded border border-rose-200">
                Escalation Notice: {claim.high_value_reason}
              </p>
            )}
          </div>

          {/* AI Expense Risk & Review Assistant Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-lg shadow-xs">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Gemini AI Expense Review Assistant</h4>
                  <p className="text-[11px] text-slate-500">Autonomous risk analysis, anomaly scan, and budget impact assessment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAiAnalyze}
                disabled={aiLoading}
                className="py-1.5 px-3.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center space-x-1.5 disabled:opacity-60 cursor-pointer"
              >
                <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : 'text-amber-300'}`} />
                <span>{aiLoading ? 'Analyzing...' : '✨ AI Analyze Expense'}</span>
              </button>
            </div>

            {/* Error Message */}
            {aiError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-900 flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            {/* AI Review Card */}
            {aiAnalysis && (
              <div className="bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/60 border border-indigo-200 rounded-xl p-5 shadow-sm space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 text-sm">AI Expense Review</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded">Gemini Powered</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-slate-600">Risk Level:</span>
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${
                      aiAnalysis.risk_level === 'HIGH' ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse' :
                      aiAnalysis.risk_level === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                      'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}>
                      {aiAnalysis.risk_level}
                    </span>
                  </div>
                </div>

                {/* Risk Reasons */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Risk Reasons</span>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-700">
                    {aiAnalysis.risk_reasons?.map((reason, idx) => (
                      <li key={idx} className="leading-relaxed">{reason}</li>
                    ))}
                  </ul>
                </div>

                {/* Budget Context */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Budget Context</span>
                  <p className="text-xs text-slate-700 bg-white/90 p-2.5 rounded-lg border border-indigo-100 leading-relaxed">
                    {aiAnalysis.budget_context}
                  </p>
                </div>

                {/* Potential Anomalies */}
                {aiAnalysis.potential_anomalies && aiAnalysis.potential_anomalies.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block mb-1">Potential Anomalies</span>
                    <ul className="list-disc list-inside space-y-1 text-xs text-amber-950 bg-amber-50/90 p-2.5 rounded-lg border border-amber-200">
                      {aiAnalysis.potential_anomalies.map((anom, idx) => (
                        <li key={idx} className="leading-relaxed">{anom}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendation */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Recommendation</span>
                  <p className="text-xs font-medium text-slate-800 bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100 leading-relaxed">
                    {aiAnalysis.recommendation}
                  </p>
                </div>

                {/* Small Assisted Review Label */}
                <div className="pt-2 border-t border-indigo-100 text-[10px] text-slate-400 italic text-center">
                  AI-assisted review — final approval remains with authorized users.
                </div>
              </div>
            )}
          </div>

          {/* Itemized Line Items Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Itemized Expense Receipts</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Merchant</th>
                    <th className="py-2 px-3">Pre-Tax</th>
                    <th className="py-2 px-3">Tax</th>
                    <th className="py-2 px-3">Receipt Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {claim.items?.map((item) => (
                    <tr key={item.item_id}>
                      <td className="py-2.5 px-3 text-slate-600">{item.item_date}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {item.category_name} <span className="text-[10px] text-slate-400">({item.gl_account_code})</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{item.merchant_name}</td>
                      <td className="py-2.5 px-3 font-bold font-mono text-slate-900">{fmt(item.amount)}</td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">{fmt(item.tax_amount)}</td>
                      <td className="py-2.5 px-3">
                        {item.receipt_url ? (
                          <a href={item.receipt_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-mono text-[11px]">
                            {item.receipt_filename || 'receipt.pdf'}
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Approval Stepper Timeline */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Multi-Tier Approval Chain</h4>
            <div className="space-y-3">
              {claim.workflows?.map((wf, idx) => (
                <div key={wf.workflow_id} className="flex items-start space-x-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                    wf.status === 'APPROVED' ? 'bg-emerald-600 text-white' :
                    wf.status === 'REJECTED' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        Step {wf.step_order}: {wf.approver_role} — {wf.approver_name}
                      </span>
                      <StatusBadge status={wf.status} />
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5">
                      Deadline: {wf.deadline_at} {wf.action_taken_at && `• Action taken: ${wf.action_taken_at}`}
                    </div>
                    {wf.comments && (
                      <p className="mt-1.5 p-2 bg-white rounded border border-slate-200 text-slate-700 italic">
                        "{wf.comments}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Linked Budget Ledger Movements */}
          {claim.ledger && claim.ledger.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Double-Entry Budget Ledger Entries</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Amount</th>
                      <th className="py-2 px-3">Spent Snapshot</th>
                      <th className="py-2 px-3">Reserved Snapshot</th>
                      <th className="py-2 px-3">Remaining Headroom</th>
                      <th className="py-2 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {claim.ledger.map((l) => (
                      <tr key={l.ledger_id}>
                        <td className="py-2 px-3">
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            l.transaction_type === 'COMMITMENT' ? 'bg-indigo-100 text-indigo-800' :
                            l.transaction_type === 'RESERVATION' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {l.transaction_type}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">{fmt(l.amount)}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{fmt(l.spent_snapshot)}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{fmt(l.reserved_snapshot)}</td>
                        <td className="py-2 px-3 font-mono text-emerald-700 font-bold">{fmt(l.balance_remaining)}</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">{l.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Current Reviewer: <strong className="text-slate-800">{currentUser?.full_name} ({currentUser?.role})</strong>
          </span>

          <div className="flex space-x-3">
            {canAct && (
              <>
                <button
                  onClick={() => onReject(pendingStep.workflow_id, claim.claim_number)}
                  className="px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold text-xs rounded-lg transition"
                >
                  Reject Claim
                </button>
                <button
                  onClick={() => onApprove(pendingStep.workflow_id, claim.claim_number)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition"
                >
                  Approve Claim
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium text-xs rounded-lg hover:bg-slate-50 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 8. BUDGET LEDGER MODAL COMPONENT
// ============================================================================
function BudgetLedgerModal({ data, onClose }) {
  const { dept, ledger } = data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-8 animate-scaleIn">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Double-Entry Financial Audit Ledger</h3>
            <p className="text-xs text-slate-400">{dept?.department_name} ({dept?.department_code}) — FY 2026 Q3</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">✕ Close</button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Ledger ID</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Claim #</th>
                  <th className="py-2.5 px-3">Transaction</th>
                  <th className="py-2.5 px-3">Delta Amount</th>
                  <th className="py-2.5 px-3">Spent Snapshot</th>
                  <th className="py-2.5 px-3">Reserved Snapshot</th>
                  <th className="py-2.5 px-3">Remaining Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((l) => (
                  <tr key={l.ledger_id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-slate-400">#{l.ledger_id}</td>
                    <td className="py-2.5 px-3 text-slate-500">{l.created_at?.split(' ')[0]}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">{l.claim_number || 'ALLOCATION'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        l.transaction_type === 'ALLOCATION' ? 'bg-blue-100 text-blue-800' :
                        l.transaction_type === 'COMMITMENT' ? 'bg-indigo-100 text-indigo-800' :
                        l.transaction_type === 'RESERVATION' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
                      }`}>
                        {l.transaction_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{fmt(l.amount)}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{fmt(l.spent_snapshot)}</td>
                    <td className="py-2.5 px-3 font-mono text-amber-700">{fmt(l.reserved_snapshot)}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{fmt(l.balance_remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-300">
            Close Ledger
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STATUS BADGE UTILITY
// ============================================================================
function StatusBadge({ status }) {
  switch (status) {
    case 'APPROVED':
      return <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">APPROVED</span>;
    case 'REJECTED':
      return <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]">REJECTED</span>;
    case 'PENDING_MANAGER':
      return <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">PENDING MANAGER</span>;
    case 'PENDING_FINANCE':
      return <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded text-[10px]">PENDING FINANCE</span>;
    case 'PENDING_CFO':
      return <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px]">PENDING CFO</span>;
    case 'PENDING':
      return <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">PENDING</span>;
    default:
      return <span className="bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded text-[10px]">{status}</span>;
  }
}

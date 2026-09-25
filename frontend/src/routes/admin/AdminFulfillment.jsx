import { useEffect, useMemo, useState } from "react";
import { Search, Truck, PackageCheck, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { useAdmin } from "../../context/AdminContext";
import StatusPill from "../../components/admin/StatusPill";
import { mapOrderRows } from "../../services/dashboard";

/**
 * Fulfillment board backed by the live order list (REQ-SD-02: 30s refresh).
 * Pickup tab = TO PROCESS + TO CLAIM, Courier tab = TO RECEIVE,
 * History = CLAIMED / CANCELLED / RETURNED.
 */
const FULFILLMENT_STAGES = [
  { key: "pickup", label: "Pickup", icon: PackageCheck, color: "bg-emerald-50 text-emerald-700", stage: "Pickup" },
  { key: "courier", label: "Courier", icon: Truck, color: "bg-blue-50 text-blue-700", stage: "Courier" },
  { key: "history", label: "Completed", icon: PackageCheck, color: "bg-slate-50 text-slate-700", stage: "Completed" },
];

const KPI = [
  { key: "total", label: "Total Orders", icon: PackageCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  { key: "inprod", label: "In Production", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  { key: "ready", label: "Ready for Pickup", icon: PackageCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  { key: "issues", label: "Issues", icon: AlertCircle, color: "text-rose-600", bg: "bg-rose-50" },
];

const CATEGORY_OPTIONS = ["All Categories", "Regular", "Pre-order"];

const timeSince = (date) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

/**
 * Derived row fields: category chip + the 24h SLA flag (measured against
 * ord_created). Module-level so the impure clock call stays out of render.
 */
function enrichOrder(order) {
  const created = order.createdAt ? new Date(order.createdAt).getTime() : null;
  return {
    ...order,
    category: order.preorder ? "Pre-order" : "Regular",
    exceeds24h: created !== null && Date.now() - created > 24 * 60 * 60 * 1000,
  };
}

export default function AdminFulfillment() {
  const { orders, refreshOrders, updateOrderStatus } = useAdmin();
  const { showToast } = useToast();
  const [activeStage, setActiveStage] = useState("pickup");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const itemsPerPage = 10;

  // REQ-SD-02: poll the order list on mount and every 30 seconds.
  useEffect(() => {
    refreshOrders();
    const interval = setInterval(() => refreshOrders().catch(() => {}), 30000);
    return () => clearInterval(interval);
  }, [refreshOrders]);

  const allOrders = mapOrderRows(orders);

  const enrichedOrders = useMemo(() => allOrders.map(enrichOrder), [allOrders]);

  const filteredOrders = useMemo(() => {
    const stageKeys = {
      pickup: ["TO PROCESS", "TO CLAIM"],
      courier: ["TO RECEIVE"],
      history: ["CLAIMED", "CANCELLED", "RETURNED"],
    }[activeStage];

    return enrichedOrders.filter((order) => {
      if (!stageKeys.includes(order.rawStatus)) return false;

      if (selectedCategory !== "All Categories" && order.category !== selectedCategory) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          order.id.toLowerCase().includes(query) ||
          order.studentId.toLowerCase().includes(query) ||
          order.customer.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [enrichedOrders, activeStage, selectedCategory, searchQuery]);

  const stageCounts = useMemo(
    () => ({
      pickup: allOrders.filter((o) => ["TO PROCESS", "TO CLAIM"].includes(o.rawStatus)).length,
      courier: allOrders.filter((o) => o.rawStatus === "TO RECEIVE").length,
      history: allOrders.filter((o) => ["CLAIMED", "CANCELLED", "RETURNED"].includes(o.rawStatus)).length,
    }),
    [allOrders],
  );

  const stats = useMemo(() => {
    const production = allOrders.filter((o) => o.rawStatus === "TO PROCESS").length;
    const ready = allOrders.filter((o) => o.rawStatus === "TO CLAIM").length;
    const issues = allOrders.filter((o) => ["CANCELLED", "RETURNED"].includes(o.rawStatus)).length;
    return { total: allOrders.length, inprod: production, ready, issues };
  }, [allOrders]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const rangeStart = filteredOrders.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const rangeEnd = Math.min(currentPage * itemsPerPage, filteredOrders.length);

  const handleSelectOrder = (orderId) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    );
  };

  const handleSelectAll = () => {
    const pageIds = paginatedOrders.map((o) => o.id);
    const allSelected = pageIds.every((id) => selectedOrders.includes(id));
    setSelectedOrders((prev) => (allSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])]));
  };

  const handleRefresh = async () => {
    try {
      await refreshOrders();
      showToast("Fulfillment list refreshed", "success");
    } catch {
      showToast("Could not refresh fulfillment list", "error");
    }
  };

  /** Bulk move — SRS status vocabulary only. */
  const handleBulkAction = async (action) => {
    if (selectedOrders.length === 0) return;
    const targets = {
      ready: { statuses: ["TO PROCESS", "TO CLAIM"], next: "TO CLAIM", label: "Mark ready" },
      claimed: { statuses: ["TO CLAIM"], next: "CLAIMED", label: "Mark claimed" },
      cancel: { statuses: ["TO PROCESS", "TO CLAIM", "TO RECEIVE"], next: "CANCELLED", label: "Cancel orders" },
    }[action];
    if (!targets) return;

    const applicable = allOrders.filter(
      (o) => selectedOrders.includes(o.id) && targets.statuses.includes(o.rawStatus),
    );
    if (applicable.length === 0) {
      showToast(`No selected orders are eligible to ${targets.label.toLowerCase()}`, "error");
      return;
    }

    let ok = 0;
    for (const order of applicable) {
      const result = await updateOrderStatus(order.ordId, targets.next);
      if (result.success) ok += 1;
    }
    setSelectedOrders([]);
    showToast(
      ok === applicable.length
        ? `${targets.label}: ${ok} order${ok === 1 ? "" : "s"} updated`
        : `${targets.label}: ${ok}/${applicable.length} updated`,
      ok === applicable.length ? "success" : "error",
    );
  };

  const handleSingleAction = async (order, next) => {
    setBusyId(order.id);
    try {
      const result = await updateOrderStatus(order.ordId, next);
      if (result.success) {
        showToast(`${order.id} updated to ${next}`, "success");
      } else {
        showToast(result.error || "Could not update order", "error");
      }
    } finally {
      setBusyId(null);
    }
  };

  /** Handover for pickup is QR-verified (REQ-APC-02); this screen only
   *  mirrors the bulk status action through the order-status endpoint. */
  const handleSingleClaim = async (order) => {
    setBusyId(order.id);
    try {
      const result = await updateOrderStatus(order.ordId, "CLAIMED");
      if (result.success) {
        showToast(`${order.id} updated to CLAIMED`, "success");
        await refreshOrders();
      } else {
        showToast(result.error || "Could not claim order", "error");
      }
    } finally {
      setBusyId(null);
    }
  };

  const renderBatchActions = () => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500 mr-1">{selectedOrders.length} selected</span>
      <button
        onClick={() => handleBulkAction("ready")}
        disabled={selectedOrders.length === 0}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Mark ready
      </button>
      <button
        onClick={() => handleBulkAction("claimed")}
        disabled={selectedOrders.length === 0}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Mark claimed
      </button>
      <button
        onClick={() => handleBulkAction("cancel")}
        disabled={selectedOrders.length === 0}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
    </div>
  );

  const renderActions = (order) => {
    if (activeStage === "pickup") {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSingleAction(order, "TO CLAIM")}
            disabled={order.rawStatus !== "TO PROCESS" || busyId === order.id}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mark ready
          </button>
          <button
            onClick={() => handleSingleClaim(order)}
            disabled={order.rawStatus !== "TO CLAIM" || busyId === order.id}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mark claimed
          </button>
        </div>
      );
    }
    if (activeStage === "courier") {
      return (
        <button
          onClick={() => handleSingleAction(order, "CLAIMED")}
          disabled={busyId === order.id}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Mark delivered
        </button>
      );
    }
    return <span className="text-xs text-slate-400">No actions</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fulfillment Center</h1>
          <p className="text-sm text-slate-500 mt-1">Manage pickup and courier batch processing</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 w-64"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI.map((stat) => {
          const Icon = stat.icon;
          const delta = stat.key === "issues" ? "-0.3%" : stat.key === "total" ? "+100%" : "+30%";
          const positive = stat.key !== "issues";
          return (
            <div key={stat.key} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <span className={`text-xs font-medium ${positive ? "text-emerald-600" : "text-rose-600"}`}>{delta}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats[stat.key]}</p>
              <p className="text-sm text-slate-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200">
        {FULFILLMENT_STAGES.map((stage) => {
          const Icon = stage.icon;
          const isActive = activeStage === stage.key;
          const count = stageCounts[stage.key];
          return (
            <button
              key={stage.key}
              onClick={() => { setActiveStage(stage.key); setSelectedOrders([]); setCurrentPage(1); }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {stage.label}
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">
              {FULFILLMENT_STAGES.find((s) => s.key === activeStage)?.label} Queue
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{filteredOrders.length} orders</p>
          </div>
          {renderBatchActions()}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedOrders.includes(o.id))}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Order ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Customer</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Stage</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Time in Stage</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <input
                      type="checkbox"
                      checked={selectedOrders.includes(order.id)}
                      onChange={() => handleSelectOrder(order.id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-900 text-sm">{order.id}</span>
                    <span className="block text-xs text-slate-500">Batch: {order.batch}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="text-sm text-slate-900">{order.customer}</div>
                    <div className="text-xs text-slate-500">{order.studentId}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        order.type === "Pre-order" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {order.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">{order.fulfillment}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-medium ${
                          order.exceeds24h ? "text-rose-600" : "text-slate-700"
                        }`}
                      >
                        {timeSince(order.createdAt)}
                      </span>
                      {order.exceeds24h && (
                        <span className="text-xs text-rose-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Exceeds 24h
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="px-5 py-3 text-right">{renderActions(order)}</td>
                </tr>
              ))}
              {paginatedOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                    No orders in this queue
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-slate-500">
            Showing {rangeStart}–{rangeEnd} of {filteredOrders.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

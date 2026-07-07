"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD"];

const EXPENSE_CATEGORIES = [
  "Inventory / Parts Purchase",
  "Packaging & Supplies",
  "Shipping Costs",
  "Postage/Labels",
  "Software & Tools",
  "Fees (BrickLink/Payment)",
  "Storage/Shelving",
  "Office Supplies",
  "Other",
];

const COLORS = {
  primary: "#4f46e5",     // indigo-600
  primaryHover: "#4338ca",
  success: "#059669",     // emerald-600
  successHover: "#047857",
  danger: "#dc2626",
  dangerHover: "#b91c1c",
  green: "#16a34a",
  red: "#ef4444",
};

function sixMonthsAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function n(v) {
  return Number.isFinite(v) ? v : 0;
}

// ============================================================
// Stable top-level components (defined OUTSIDE Dashboard so
// they never lose identity across re-renders)
// ============================================================

function theme(dark) {
  return {
    page: dark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900",
    card: dark ? "bg-slate-900 border border-slate-800" : "bg-white border border-slate-200",
    subtle: dark ? "text-slate-400" : "text-slate-500",
    input: dark
      ? "bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:border-indigo-400"
      : "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500",
    tableHeadText: dark ? "text-slate-400" : "text-slate-500",
    rowBorder: dark ? "border-slate-800" : "border-slate-100",
    rowHover: dark ? "hover:bg-slate-800/40" : "hover:bg-slate-50",
    pillWrap: dark ? "bg-slate-800" : "bg-slate-200/70",
    pillActive: dark ? "bg-slate-700 text-indigo-300 shadow" : "bg-white text-indigo-700 shadow",
    pillInactive: dark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700",
    dividerColor: dark ? "#27303f" : "#e9edf2",
  };
}

function Card({ t, children, className = "" }) {
  return (
    <div className={`rounded-2xl ${t.card} shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
      {children}
    </div>
  );
}

function TabPills({ t, options, value, onChange }) {
  return (
    <div className={`inline-flex gap-1 p-1 rounded-xl ${t.pillWrap}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${value === opt.value ? t.pillActive : t.pillInactive}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Stat({ t, label, value, emphasis, color }) {
  const colorHex = color === "green" ? COLORS.green : color === "red" ? COLORS.red : undefined;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className={`text-sm ${t.subtle}`}>{label}</span>
      <span
        className={emphasis ? "text-2xl font-extrabold tracking-tight" : "text-xl font-bold tracking-tight"}
        style={colorHex ? { color: colorHex } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Divider({ t }) {
  return <div className="mx-1" style={{ borderTop: `1px solid ${t.dividerColor}` }} />;
}

function SortHeader({ t, label, sortKey, sort, setSort, align = "left" }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`py-2 pr-3 cursor-pointer select-none whitespace-nowrap font-medium text-xs uppercase tracking-wide transition-colors hover:text-indigo-500 ${t.tableHeadText} ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => setSort({ key: sortKey, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
    >
      {label} {active ? (sort.dir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function SolidButton({ bg, bgHover, children, className = "", style = {}, ...props }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      {...props}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`rounded-lg text-sm font-semibold text-white transition-transform duration-150 active:scale-95 disabled:opacity-50 ${className}`}
      style={{
        backgroundColor: hover ? bgHover : bg,
        transform: hover ? "translateY(-1px)" : "none",
        boxShadow: hover ? "0 4px 12px rgba(0,0,0,0.15)" : "0 1px 2px rgba(0,0,0,0.06)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SetupScreen({ t, dark, onDone }) {
  const [form, setForm] = useState({
    consumerKey: "", consumerSecret: "", tokenValue: "", tokenSecret: "", storeName: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Something went wrong.");
      } else {
        onDone();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`min-h-screen w-full ${t.page} flex items-center justify-center p-6`}>
      <Card t={t} className="p-8 max-w-lg w-full">
        <h1 className="text-xl font-bold mb-1">Welcome to StudBalance</h1>
        <p className={`text-sm ${t.subtle} mb-6`}>
          Enter your BrickLink API credentials to get started. You can find or create these under{" "}
          <strong>BrickLink → Settings → BrickLink API</strong>. Set both "Allowed IP" and "Mask IP" to{" "}
          <code>0.0.0.0</code>.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={`block text-xs mb-1 ${t.subtle}`}>Store Name (just a label for this app)</label>
            <input type="text" placeholder="My BrickLink Store" value={form.storeName}
              onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
              className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
          </div>
          <div>
            <label className={`block text-xs mb-1 ${t.subtle}`}>Consumer Key</label>
            <input type="text" value={form.consumerKey} required
              onChange={(e) => setForm((f) => ({ ...f, consumerKey: e.target.value }))}
              className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
          </div>
          <div>
            <label className={`block text-xs mb-1 ${t.subtle}`}>Consumer Secret</label>
            <input type="password" value={form.consumerSecret} required
              onChange={(e) => setForm((f) => ({ ...f, consumerSecret: e.target.value }))}
              className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
          </div>
          <div>
            <label className={`block text-xs mb-1 ${t.subtle}`}>Token Value</label>
            <input type="text" value={form.tokenValue} required
              onChange={(e) => setForm((f) => ({ ...f, tokenValue: e.target.value }))}
              className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
          </div>
          <div>
            <label className={`block text-xs mb-1 ${t.subtle}`}>Token Secret</label>
            <input type="password" value={form.tokenSecret} required
              onChange={(e) => setForm((f) => ({ ...f, tokenSecret: e.target.value }))}
              className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
          </div>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm p-3">{error}</div>
          )}

          <SolidButton bg={COLORS.success} bgHover={COLORS.successHover} type="submit" disabled={saving} className="w-full py-2.5 mt-2">
            {saving ? "Testing connection..." : "Connect & Continue"}
          </SolidButton>
        </form>
      </Card>
    </div>
  );
}

function ModalShell({ dark, onClose, children }) {
  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(15,23,42,0.65)",
        backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 9999, padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl shadow-2xl p-6 w-full"
        style={{ maxWidth: 440, backgroundColor: dark ? "#0f172a" : "#ffffff", border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}` }}
      >
        {children}
      </div>
    </div>
  );
}

function EditApiModal({ t, dark, onClose, onSaved }) {
  const [form, setForm] = useState({ consumerKey: "", consumerSecret: "", tokenValue: "", tokenSecret: "" });
  const [clearData, setClearData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, clearExistingData: clearData }),
      });
      const json = await res.json();
      if (!json.success) setError(json.error || "Something went wrong.");
      else onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell dark={dark} onClose={onClose}>
      <p className="font-semibold text-base mb-1">Change BrickLink API Info</p>
      <p className={`text-sm ${t.subtle} mb-4`}>Use this to switch this app to a different BrickLink store's keys.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" placeholder="Consumer Key" value={form.consumerKey} required
          onChange={(e) => setForm((f) => ({ ...f, consumerKey: e.target.value }))}
          className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
        <input type="password" placeholder="Consumer Secret" value={form.consumerSecret} required
          onChange={(e) => setForm((f) => ({ ...f, consumerSecret: e.target.value }))}
          className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
        <input type="text" placeholder="Token Value" value={form.tokenValue} required
          onChange={(e) => setForm((f) => ({ ...f, tokenValue: e.target.value }))}
          className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
        <input type="password" placeholder="Token Secret" value={form.tokenSecret} required
          onChange={(e) => setForm((f) => ({ ...f, tokenSecret: e.target.value }))}
          className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />

        <label className={`flex items-center gap-2 text-sm ${t.subtle}`}>
          <input type="checkbox" checked={clearData} onChange={(e) => setClearData(e.target.checked)} />
          Clear previously synced orders (recommended when switching to a different store)
        </label>

        {error && <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm p-3">{error}</div>}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className={`rounded-lg px-4 py-2 text-sm font-medium ${t.input}`}>Cancel</button>
          <SolidButton bg={COLORS.success} bgHover={COLORS.successHover} type="submit" disabled={saving} className="px-4 py-2">
            {saving ? "Testing..." : "Save & Test"}
          </SolidButton>
        </div>
      </form>
    </ModalShell>
  );
}

function EditStoreNameModal({ t, dark, currentName, onClose, onSaved }) {
  const [storeName, setStoreName] = useState(currentName || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName }),
      });
      onSaved(storeName);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell dark={dark} onClose={onClose}>
      <p className="font-semibold text-base mb-4">Change Store Name</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" placeholder="My BrickLink Store" value={storeName} autoFocus
          onChange={(e) => setStoreName(e.target.value)}
          className={`w-full rounded-lg px-3 py-2 text-sm ${t.input}`} />
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className={`rounded-lg px-4 py-2 text-sm font-medium ${t.input}`}>Cancel</button>
          <SolidButton bg={COLORS.primary} bgHover={COLORS.primaryHover} type="submit" disabled={saving} className="px-4 py-2">
            Save
          </SolidButton>
        </div>
      </form>
    </ModalShell>
  );
}

// ============================================================
// Dashboard
// ============================================================

export default function Dashboard() {
  const [settingsStatus, setSettingsStatus] = useState(null); // null = loading, {configured, storeName}
  const [dark, setDark] = useState(false);
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [showApiModal, setShowApiModal] = useState(false);
  const [showStoreNameModal, setShowStoreNameModal] = useState(false);
  const [from, setFrom] = useState(sixMonthsAgo());
  const [to, setTo] = useState(todayStr());
  const [currency, setCurrency] = useState("CAD");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);

  const [listTab, setListTab] = useState("orders");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
  const [orderDirectionFilter, setOrderDirectionFilter] = useState("ALL");
  const [orderSort, setOrderSort] = useState({ key: "dateOrdered", dir: "desc" });

  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("ALL");
  const [expenseSort, setExpenseSort] = useState({ key: "date", dir: "desc" });

  const [expenseForm, setExpenseForm] = useState({
    date: todayStr(),
    description: "",
    category: EXPENSE_CATEGORIES[0],
    customCategory: "",
    amount: "",
    currencyCode: "CAD",
  });

  const t = theme(dark);

  async function loadData() {
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/orders?from=${from}&to=${to}&currency=${currency}`);
      const json = await res.json();
      if (json.error) setErrorBanner(json.error);
      setData(json);
    } catch (err) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettingsStatus)
      .catch(() => setSettingsStatus({ configured: false, storeName: "" }));
  }, []);

  useEffect(() => {
    if (settingsStatus?.configured) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, settingsStatus?.configured]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const json = await res.json();
      if (!json.success) setErrorBanner("Sync failed: " + json.error);
      await loadData();
    } finally {
      setSyncing(false);
    }
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    const category = expenseForm.category === "Other" ? expenseForm.customCategory || "Other" : expenseForm.category;
    await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...expenseForm, category }),
    });
    setExpenseForm((f) => ({ ...f, description: "", amount: "", customCategory: "" }));
    await loadData();
  }

  async function confirmDeleteExpense() {
    if (!deleteTarget) return;
    await fetch(`/api/expenses/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    await loadData();
  }

  function handleExport(format) {
    window.location.href = `/api/export?from=${from}&to=${to}&currency=${currency}&format=${format}`;
  }

  const statusOptions = useMemo(() => (data?.orders ? [...new Set(data.orders.map((o) => o.status))].sort() : []), [data]);
  const categoryOptions = useMemo(() => (data?.expenses ? [...new Set(data.expenses.map((e) => e.category))].sort() : []), [data]);

  function sortRows(rows, sort, dateField) {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av = a[sort.key], bv = b[sort.key];
      if (sort.key === dateField) { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      if (typeof av === "string") return (av || "").localeCompare(bv || "") * dir;
      return (n(av) - n(bv)) * dir;
    });
  }

  const filteredOrders = useMemo(() => {
    if (!data?.orders) return [];
    let rows = data.orders;
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      rows = rows.filter((o) => String(o.blOrderId).includes(q) || o.buyerOrSeller?.toLowerCase().includes(q));
    }
    if (orderStatusFilter !== "ALL") rows = rows.filter((o) => o.status === orderStatusFilter);
    if (orderDirectionFilter !== "ALL") rows = rows.filter((o) => o.direction === orderDirectionFilter);
    return sortRows(rows, orderSort, "dateOrdered");
  }, [data, orderSearch, orderStatusFilter, orderDirectionFilter, orderSort]);

  const filteredExpenses = useMemo(() => {
    if (!data?.expenses) return [];
    let rows = data.expenses;
    if (expenseSearch.trim()) {
      const q = expenseSearch.trim().toLowerCase();
      rows = rows.filter((e) => e.description?.toLowerCase().includes(q));
    }
    if (expenseCategoryFilter !== "ALL") rows = rows.filter((e) => e.category === expenseCategoryFilter);
    return sortRows(rows, expenseSort, "date");
  }, [data, expenseSearch, expenseCategoryFilter, expenseSort]);

  const storeName = settingsStatus?.storeName || null;
  const summary = data?.summary;
  const insights = data?.insights;

  if (settingsStatus === null) {
    return (
      <div className={`min-h-screen w-full ${t.page} flex items-center justify-center`}>
        <p className={`text-sm ${t.subtle}`}>Loading...</p>
      </div>
    );
  }

  if (!settingsStatus.configured) {
    return (
      <SetupScreen
        t={t}
        dark={dark}
        onDone={() => {
          fetch("/api/settings").then((r) => r.json()).then(setSettingsStatus);
        }}
      />
    );
  }

  return (
    <div className={`min-h-screen w-full ${t.page} transition-colors duration-300`}>
      <main className="max-w-5xl mx-auto px-6 md:px-10 pt-8 pb-32 space-y-5">

        {/* ---- Top bar ---- */}
        <Card t={t} className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setDark(!dark)}
                aria-label="Toggle dark mode"
                className="relative w-12 h-6 rounded-full transition-colors duration-300"
                style={{ backgroundColor: dark ? COLORS.primary : "#cbd5e1" }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-300 shadow"
                  style={{ transform: dark ? "translateX(24px)" : "translateX(0)" }}
                />
              </button>
              <div>
                <h1 className="text-lg font-bold tracking-tight leading-tight">StudBalance</h1>
                {storeName && <p className={`text-xs ${t.subtle}`}>{storeName}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowStoreNameModal(true)} className={`rounded-lg px-3 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 ${t.input}`}>
                Store Name
              </button>
              <button onClick={() => setShowApiModal(true)} className={`rounded-lg px-3 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 ${t.input}`}>
                API Settings
              </button>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`rounded-lg px-3 py-2 text-sm transition-colors ${t.input}`}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <SolidButton bg={COLORS.success} bgHover={COLORS.successHover} onClick={handleSync} disabled={syncing} className="px-4 py-2">
                {syncing ? "Syncing..." : "Sync Now"}
              </SolidButton>
            </div>
          </div>
          {data?.lastSync && (
            <p className={`text-xs ${t.subtle} mt-3`}>
              Last synced: {new Date(data.lastSync.syncedAt).toLocaleString()} · Sales based on item total, purchases on order total, cancelled orders excluded
            </p>
          )}
        </Card>

        {errorBanner && (
          <div className="rounded-xl border border-red-300 bg-red-50 text-red-700 text-sm p-3">
            {errorBanner}
          </div>
        )}

        {/* ---- Date range ---- */}
        <Card t={t} className="p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className={`block text-xs mb-1 ${t.subtle}`}>From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${t.input}`} />
            </div>
            <div>
              <label className={`block text-xs mb-1 ${t.subtle}`}>To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${t.input}`} />
            </div>
            <button onClick={loadData} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all hover:-translate-y-0.5 ${t.input}`}>Apply</button>
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} className={`rounded-lg px-3 py-1.5 text-sm ${t.input}`}>
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="html">HTML (.html)</option>
              <option value="csv">CSV (.csv)</option>
              <option value="xml">XML (.xml)</option>
            </select>
            <SolidButton bg={COLORS.primary} bgHover={COLORS.primaryHover} onClick={() => handleExport(exportFormat)} className="px-4 py-1.5">
              Export
            </SolidButton>
          </div>
        </Card>

        {loading && <p className={`text-sm ${t.subtle}`}>Loading...</p>}

        {/* ---- Compact summary rectangles ---- */}
        {summary && insights && (
          <div className="grid gap-5 md:grid-cols-2">
            <Card t={t} className="p-4">
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${t.subtle}`}>Financial Summary</p>
              <div>
                <Stat t={t} label="Sales" value={`${currency} ${n(summary.sales).toFixed(2)}`} color="green" />
                <Divider t={t} />
                <Stat t={t} label="Purchases" value={`${currency} ${n(summary.purchases).toFixed(2)}`} color="red" />
                <Divider t={t} />
                <Stat t={t} label="Other Expenses" value={`${currency} ${n(summary.other).toFixed(2)}`} color="red" />
                <Divider t={t} />
                <Stat t={t} label="Net" value={`${currency} ${n(summary.net).toFixed(2)}`} emphasis color={n(summary.net) >= 0 ? "green" : "red"} />
              </div>
            </Card>
            <Card t={t} className="p-4">
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${t.subtle}`}>Averages</p>
              <div>
                <Stat t={t} label="Avg Order Value" value={`${currency} ${n(insights.avgOrderValue).toFixed(2)}`} />
                <Divider t={t} />
                <Stat t={t} label="Avg Monthly Expense" value={`${currency} ${n(insights.avgMonthlyExpense).toFixed(2)}`} color="red" />
              </div>
            </Card>
          </div>
        )}

        {/* ---- Profit by month ---- */}
        {insights && (
          <Card t={t} className="p-4">
            <p className="text-sm font-semibold mb-3">Profit by Month</p>
            {insights.monthlyProfit.length === 0 ? (
              <p className={`text-sm ${t.subtle}`}>No data in this range.</p>
            ) : (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={insights.monthlyProfit}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#334155" : "#e2e8f0"} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: dark ? "#94a3b8" : "#64748b" }} />
                    <YAxis tick={{ fontSize: 12, fill: dark ? "#94a3b8" : "#64748b" }} />
                    <Tooltip
                      contentStyle={dark ? { backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9", borderRadius: 8 } : { borderRadius: 8 }}
                      formatter={(value, name) => [`${currency} ${n(value).toFixed(2)}`, name === "profit" ? "Profit" : "Expenses"]}
                    />
                    <Legend
                      formatter={(value) => (value === "profit" ? "Profit" : "Expenses")}
                      wrapperStyle={{ fontSize: 12, color: dark ? "#94a3b8" : "#64748b" }}
                    />
                    <Line type="monotone" dataKey="profit" stroke={COLORS.primary} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="other" stroke={COLORS.red} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        )}

        {/* ---- Orders / Expenses ---- */}
        <Card t={t} className="p-4">
          <div className="mb-4">
            <TabPills t={t} value={listTab} onChange={setListTab} options={[
              { value: "orders", label: `Orders (${filteredOrders.length})` },
              { value: "expenses", label: `Manual Expenses (${filteredExpenses.length})` },
            ]} />
          </div>

          {listTab === "orders" && (
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap items-center">
                <input type="text" placeholder="Search order ID or buyer/seller..." value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} className={`rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px] transition-colors ${t.input}`} />
                <select value={orderDirectionFilter} onChange={(e) => setOrderDirectionFilter(e.target.value)} className={`rounded-lg px-3 py-1.5 text-sm ${t.input}`}>
                  <option value="ALL">All types</option>
                  <option value="in">Sales only</option>
                  <option value="out">Purchases only</option>
                </select>
                <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} className={`rounded-lg px-3 py-1.5 text-sm ${t.input}`}>
                  <option value="ALL">All statuses</option>
                  {statusOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className={`border-b ${t.rowBorder}`}>
                      <SortHeader t={t} label="Order ID" sortKey="blOrderId" sort={orderSort} setSort={setOrderSort} />
                      <SortHeader t={t} label="Date" sortKey="dateOrdered" sort={orderSort} setSort={setOrderSort} />
                      <th className={`py-2 pr-3 text-xs uppercase tracking-wide font-medium ${t.tableHeadText}`}>Type</th>
                      <th className={`py-2 pr-3 text-xs uppercase tracking-wide font-medium ${t.tableHeadText}`}>Who</th>
                      <SortHeader t={t} label="Status" sortKey="status" sort={orderSort} setSort={setOrderSort} />
                      <SortHeader t={t} label="Item Total" sortKey="itemTotal" sort={orderSort} setSort={setOrderSort} align="right" />
                      <SortHeader t={t} label={`Converted (${currency})`} sortKey="convertedItemTotal" sort={orderSort} setSort={setOrderSort} align="right" />
                      <SortHeader t={t} label="Order Total" sortKey="grandTotal" sort={orderSort} setSort={setOrderSort} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((o) => (
                      <tr key={o.id} className={`border-b ${t.rowBorder} ${t.rowHover} transition-colors`} style={o.cancelled ? { opacity: 0.5 } : undefined}>
                        <td className="py-1.5 pr-3" style={o.cancelled ? { textDecoration: "line-through" } : undefined}>{o.blOrderId}</td>
                        <td className="py-1.5 pr-3" style={o.cancelled ? { textDecoration: "line-through" } : undefined}>{new Date(o.dateOrdered).toLocaleDateString()}</td>
                        <td className="py-1.5 pr-3">{o.direction === "in" ? "Sale" : "Purchase"}</td>
                        <td className="py-1.5 pr-3" style={o.cancelled ? { textDecoration: "line-through" } : undefined}>{o.buyerOrSeller}</td>
                        <td className="py-1.5 pr-3">{o.status}</td>
                        <td className="py-1.5 pr-3 text-right font-bold" style={o.cancelled ? { textDecoration: "line-through" } : undefined}>{o.currencyCode} {n(o.itemTotal).toFixed(2)}</td>
                        <td className="py-1.5 pr-3 text-right font-bold" style={o.cancelled ? { textDecoration: "line-through" } : undefined}>{currency} {n(o.convertedItemTotal).toFixed(2)}</td>
                        <td className={`py-1.5 pr-3 text-right ${t.subtle}`} style={o.cancelled ? { textDecoration: "line-through" } : undefined}>{o.currencyCode} {n(o.grandTotal).toFixed(2)}</td>
                      </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                      <tr><td colSpan={8} className={`py-6 text-center ${t.subtle}`}>No orders match your filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredOrders.some((o) => o.cancelled) && (
                <p className={`text-xs ${t.subtle}`}>Cancelled orders are struck-through and excluded from all totals.</p>
              )}
            </div>
          )}

          {listTab === "expenses" && (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 ${dark ? "bg-slate-800/50" : "bg-slate-50"}`}>
                <h2 className={`text-xs font-semibold uppercase tracking-wide mb-3 ${t.subtle}`}>Add Manual Expense</h2>
                <form onSubmit={handleAddExpense} className="flex gap-3 flex-wrap items-center">
                  <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${t.input}`} />
                  <input type="text" placeholder="Description" value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} className={`rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[150px] transition-colors ${t.input}`} required />
                  <select value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))} className={`rounded-lg px-3 py-1.5 text-sm ${t.input}`}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  {expenseForm.category === "Other" && (
                    <input type="text" placeholder="Specify category..." value={expenseForm.customCategory} onChange={(e) => setExpenseForm((f) => ({ ...f, customCategory: e.target.value }))} className={`rounded-lg px-3 py-1.5 text-sm ${t.input}`} required />
                  )}
                  <input type="number" step="0.01" placeholder="Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} className={`rounded-lg px-3 py-1.5 text-sm w-28 transition-colors ${t.input}`} required />
                  <select value={expenseForm.currencyCode} onChange={(e) => setExpenseForm((f) => ({ ...f, currencyCode: e.target.value }))} className={`rounded-lg px-3 py-1.5 text-sm ${t.input}`}>
                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <SolidButton bg={COLORS.success} bgHover={COLORS.successHover} type="submit" className="px-4 py-1.5">
                    Add
                  </SolidButton>
                </form>
              </div>

              <div className="flex gap-3 flex-wrap items-center">
                <input type="text" placeholder="Search description..." value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} className={`rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px] transition-colors ${t.input}`} />
                <select value={expenseCategoryFilter} onChange={(e) => setExpenseCategoryFilter(e.target.value)} className={`rounded-lg px-3 py-1.5 text-sm ${t.input}`}>
                  <option value="ALL">All categories</option>
                  {categoryOptions.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className={`border-b ${t.rowBorder}`}>
                    <SortHeader t={t} label="Date" sortKey="date" sort={expenseSort} setSort={setExpenseSort} />
                    <th className={`py-2 pr-3 text-xs uppercase tracking-wide font-medium ${t.tableHeadText}`}>Description</th>
                    <SortHeader t={t} label="Category" sortKey="category" sort={expenseSort} setSort={setExpenseSort} />
                    <th className={`py-2 pr-3 text-xs uppercase tracking-wide font-medium ${t.tableHeadText} text-right`}>Original</th>
                    <SortHeader t={t} label={`Converted (${currency})`} sortKey="converted" sort={expenseSort} setSort={setExpenseSort} align="right" />
                    <th className="py-2 pr-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((e) => (
                    <tr key={e.id} className={`border-b ${t.rowBorder} ${t.rowHover} transition-colors`}>
                      <td className="py-1.5 pr-3">{new Date(e.date).toLocaleDateString()}</td>
                      <td className="py-1.5 pr-3">{e.description}</td>
                      <td className="py-1.5 pr-3">{e.category}</td>
                      <td className={`py-1.5 pr-3 text-right ${t.subtle}`}>{e.currencyCode} {n(e.amount).toFixed(2)}</td>
                      <td className="py-1.5 pr-3 text-right font-bold">{currency} {n(e.converted).toFixed(2)}</td>
                      <td className="py-1.5 pr-1 text-right">
                        <button
                          onClick={() => setDeleteTarget(e)}
                          aria-label="Delete expense"
                          className="p-1.5 rounded-lg transition-all hover:scale-110"
                          style={{ color: dark ? "#64748b" : "#94a3b8" }}
                          onMouseEnter={(ev) => (ev.currentTarget.style.color = COLORS.danger)}
                          onMouseLeave={(ev) => (ev.currentTarget.style.color = dark ? "#64748b" : "#94a3b8")}
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredExpenses.length === 0 && (
                    <tr><td colSpan={6} className={`py-6 text-center ${t.subtle}`}>No expenses match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>

      {/* ---- API / Store Name modals ---- */}
      {showApiModal && (
        <EditApiModal
          t={t}
          dark={dark}
          onClose={() => setShowApiModal(false)}
          onSaved={async () => {
            setShowApiModal(false);
            await loadData();
          }}
        />
      )}
      {showStoreNameModal && (
        <EditStoreNameModal
          t={t}
          dark={dark}
          currentName={storeName}
          onClose={() => setShowStoreNameModal(false)}
          onSaved={(newName) => {
            setSettingsStatus((s) => ({ ...s, storeName: newName }));
            setShowStoreNameModal(false);
          }}
        />
      )}

      {/* ---- Delete confirmation modal ---- */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(15,23,42,0.65)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999, padding: "1rem",
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl shadow-2xl p-6 w-full"
            style={{ maxWidth: 420, backgroundColor: dark ? "#0f172a" : "#ffffff", border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}` }}
          >
            <p className="font-semibold text-base mb-2">Delete this expense?</p>
            <p className={`text-sm ${t.subtle} mb-5`}>
              &ldquo;{deleteTarget.description}&rdquo; — {deleteTarget.currencyCode} {n(deleteTarget.amount).toFixed(2)} on {new Date(deleteTarget.date).toLocaleDateString()}.
              This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-0.5 ${t.input}`}
              >
                Cancel
              </button>
              <SolidButton bg={COLORS.danger} bgHover={COLORS.dangerHover} onClick={confirmDeleteExpense} className="px-4 py-2">
                Delete
              </SolidButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
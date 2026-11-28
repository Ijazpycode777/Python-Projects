/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// SmartCampus 360 — Frontend (index.tsx)
// =============================================================================
// A monolithic React application. This single file consolidates:
//   - App entry + routing (React Router)
//   - API client (fetch wrapper with CSRF + cookie credentials)
//   - Auth context + Login + role-based layouts
//   - Reusable UI primitives (Card, Button, Input, Table, Modal, Badge)
//   - Admin Portal (10 modules + 10 advanced features)
//   - Teacher Portal (10 features)
//   - Student Portal (10 features)
//   - Charts (Recharts) + dark/light theme
//
// Styling uses Tailwind utility classes loaded by Vite. Tailwind config is
// imported via a `tailwind.config.js` + `postcss.config.js` pair alongside
// a tiny injected `<style>` that imports Tailwind from a CDN-only fallback
// when running in dev without a built CSS pipeline. In production, the
// `npm run build` step compiles Tailwind to static CSS.
// =============================================================================

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useLocation,
  Outlet
} from "react-router-dom";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from "recharts";
import {
  LayoutDashboard, Users, GraduationCap, CalendarDays, ClipboardCheck, FileText,
  Wallet, CalendarRange, BookOpen, Bell, BarChart3, Shield, LogOut, Menu, X,
  Sun, Moon, ChevronRight, Plus, Check, AlertTriangle, Search, FileCheck,
  Building2, Brain, MapPin, Send, MessageSquare, FolderKanban, Award,
  Compass, BookMarked, Calendar, Clock, ClipboardList, PenLine, Lightbulb,
  FlaskConical, UserCog, IdCard, ThumbsUp, ListChecks, Settings as SettingsIcon, Info, Eye,
  ChevronLeft, Upload, Printer, Lock
} from "lucide-react";

// -----------------------------------------------------------------------------
// Tailwind + base styles injected directly (no build-time CSS required for dev)
// -----------------------------------------------------------------------------
// We import the compiled `tailwind.css` if present; otherwise inject a minimal
// utility stylesheet so the app is still usable. The production build compiles
// Tailwind via PostCSS into dist/assets/*.css.
import "./src/styles.css";

// -----------------------------------------------------------------------------
// API client
// -----------------------------------------------------------------------------
const API = {
  token: null as string | null,
  async init() {
    const r = await fetch("/api/csrf", { credentials: "include" });
    const j = await r.json();
    this.token = j.csrfToken;
  },
  async req(method: string, path: string, body?: any): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers["X-CSRF-Token"] = this.token;
    const r = await fetch(path, {
      method,
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 204) return null;
    const text = await r.text();
    let j: any = null;
    try { j = text ? JSON.parse(text) : null; } catch { j = { raw: text }; }
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  },
  upload(path: string, formData: FormData) {
    const headers: Record<string, string> = {};
    if (this.token) headers["X-CSRF-Token"] = this.token;
    return fetch(path, { method: "POST", headers, credentials: "include", body: formData })
      .then(async r => { const t = await r.text(); try { return t ? JSON.parse(t) : null; } catch { return null; } });
  },
  get: (p: string) => API.req("GET", p),
  post: (p: string, b: any) => API.req("POST", p, b),
  patch: (p: string, b: any) => API.req("PATCH", p, b),
  del: (p: string) => API.req("DELETE", p)
};

// -----------------------------------------------------------------------------
// Theme context
// -----------------------------------------------------------------------------
type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light", toggle: () => {}
});
function useTheme() { return useContext(ThemeCtx); }
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("sc-theme") as Theme) || "light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("sc-theme", theme);
  }, [theme]);
  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme(t => t === "light" ? "dark" : "light") }}>
      {children}
    </ThemeCtx.Provider>
  );
}

// -----------------------------------------------------------------------------
// Auth context
// -----------------------------------------------------------------------------
type Role = "ADMIN" | "TEACHER" | "STUDENT";
type User = { id: number; username: string; fullName: string; role: Role; email?: string; phone?: string };
type AuthState = { user: User | null; loading: boolean };
const AuthCtx = createContext<{
  state: AuthState; login: (u: string, p: string) => Promise<User>;
  logout: () => Promise<void>; refresh: () => Promise<void>;
}>({ state: { user: null, loading: true }, login: async () => ({} as User), logout: async () => {}, refresh: async () => {} });
function useAuth() { return useContext(AuthCtx); }

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  const refresh = useCallback(async () => {
    try {
      const me = await API.get("/api/auth/me");
      if (me?.user) setState({ user: me.user, loading: false });
      else setState({ user: null, loading: false });
    } catch { setState({ user: null, loading: false }); }
  }, []);
  useEffect(() => { (async () => { await API.init(); await refresh(); })(); }, [refresh]);
  const login = useCallback(async (username: string, password: string) => {
    const r = await API.post("/api/auth/login", { username, password });
    if (!r?.user) throw new Error("Login failed");
    await API.init();
    setState({ user: r.user, loading: false });
    return r.user as User;
  }, []);
  const logout = useCallback(async () => {
    try { await API.post("/api/auth/logout", {}); } catch {}
    setState({ user: null, loading: false });
  }, []);
  return <AuthCtx.Provider value={{ state, login, logout, refresh }}>{children}</AuthCtx.Provider>;
}

// -----------------------------------------------------------------------------
// Reusable UI primitives
// -----------------------------------------------------------------------------
function cn(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(" "); }

function Card({ title, subtitle, icon: Icon, actions, children, className }: any) {
  return (
    <div className={cn("rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {Icon && <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-300"><Icon size={18} /></div>}
            <div>
              {title && <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function Button({ variant = "primary", size = "md", className, children, ...rest }: any) {
  const variants: Record<string, string> = {
    primary: "bg-sky-600 hover:bg-sky-700 text-white",
    secondary: "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200",
    ghost: "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200",
    danger: "bg-rose-600 hover:bg-rose-700 text-white",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white",
    outline: "border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
  };
  const sizes: Record<string, string> = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-2 text-sm", lg: "px-5 py-2.5 text-base" };
  return (
    <button className={cn("rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2", variants[variant], sizes[size], className)} {...rest}>
      {children}
    </button>
  );
}

function Input({ label, error, className, ...rest }: any) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>}
      <input className={cn("w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500", error && "border-rose-400", className)} {...rest} />
      {error && <span className="block text-xs text-rose-500 mt-1">{error}</span>}
    </label>
  );
}

function Select({ label, children, className, ...rest }: any) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>}
      <select className={cn("w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500", className)} {...rest}>
        {children}
      </select>
    </label>
  );
}

function Textarea({ label, className, ...rest }: any) {
  return (
    <label className="block">
      {label && <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>}
      <textarea className={cn("w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500", className)} rows={4} {...rest} />
    </label>
  );
}

function Badge({ color = "slate", children }: any) {
  const colors: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    red: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    blue: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    purple: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
  };
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", colors[color])}>{children}</span>;
}

function Table({ columns, rows, empty = "No records" }: any) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
          <tr>
            {columns.map((c: any) => <th key={c.key} className="text-left px-4 py-3 font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">{empty}</td></tr>
          ) : rows.map((r: any, i: number) => (
            <tr key={r.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
              {columns.map((c: any) => <td key={c.key} className="px-4 py-3 text-slate-700 dark:text-slate-200">{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ open, onClose, title, children, size = "md" }: any) {
  if (!open) return null;
  const sizes: Record<string, string> = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className={cn("w-full bg-white dark:bg-slate-900 rounded-xl shadow-xl max-h-[90vh] overflow-auto", sizes[size])} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = "sky", hint }: any) {
  const colors: Record<string, string> = {
    sky: "from-sky-500 to-blue-600", emerald: "from-emerald-500 to-green-600",
    violet: "from-violet-500 to-purple-600", amber: "from-amber-500 to-orange-600",
    rose: "from-rose-500 to-pink-600", slate: "from-slate-500 to-slate-700"
  };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>
          {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
        </div>
        <div className={cn("p-2.5 rounded-lg bg-gradient-to-br text-white", colors[color])}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function Empty({ icon: Icon = Info, text }: any) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-slate-400">
      <Icon size={32} className="mb-2" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function Loader({ label = "Loading…" }: any) {
  return (
    <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
      <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mr-3" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Toast / inline messages
// -----------------------------------------------------------------------------
function Toast({ kind = "info", children }: any) {
  const colors: any = {
    info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    error: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800"
  };
  return <div className={cn("text-sm px-3 py-2 rounded-lg border", colors[kind])}>{children}</div>;
}

// -----------------------------------------------------------------------------
// Layout: sidebar shell with role-based nav
// -----------------------------------------------------------------------------
function SidebarLink({ to, icon: Icon, label, active }: any) {
  return (
    <Link to={to} className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
      active ? "bg-sky-600 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    )}>
      <Icon size={18} />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}

function Shell({ role, nav, title }: { role: Role; nav: { to: string; icon: any; label: string }[]; title: string }) {
  const { state, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav2 = useNavigate();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadNotifs = useCallback(async () => {
    try { const r = await API.get("/api/notifications"); setNotifs(r?.notifications || []); } catch {}
  }, []);
  useEffect(() => { loadNotifs(); const t = setInterval(loadNotifs, 30000); return () => clearInterval(t); }, [loadNotifs]);

  const unread = notifs.filter(n => !n.is_read).length;
  const portal = role === "ADMIN" ? "Admin Portal" : role === "TEACHER" ? "Teacher Portal" : "Student Portal";
  const accent = role === "ADMIN" ? "from-sky-600 to-blue-700" : role === "TEACHER" ? "from-violet-600 to-purple-700" : "from-emerald-600 to-green-700";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(o => !o)} className="md:hidden p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className={cn("bg-gradient-to-br p-1.5 rounded-lg text-white", accent)}>
              <GraduationCap size={20} />
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100 leading-none">SmartCampus 360</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{portal} · {title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300" title="Toggle theme">
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="relative">
              <button onClick={() => setNotifOpen(o => !o)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 relative">
                <Bell size={18} />
                {unread > 0 && <span className="absolute top-1 right-1 bg-rose-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{unread}</span>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500">Notifications ({unread} unread)</div>
                  {notifs.length === 0 ? <div className="p-4 text-center text-sm text-slate-400">No notifications</div> :
                    notifs.map(n => (
                      <div key={n.id} className={cn("px-3 py-2 border-b border-slate-50 dark:border-slate-800", !n.is_read && "bg-sky-50/50 dark:bg-sky-950/30")}>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{n.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{n.body}</p>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{state.user?.fullName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">@{state.user?.username}</p>
              </div>
              <button onClick={async () => { await logout(); nav2("/login"); }} className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-600" title="Sign out">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={cn(
          "fixed md:sticky top-14 z-30 md:z-auto h-[calc(100vh-3.5rem)] w-16 md:w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-y-auto transition-transform",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          <nav className="p-2 space-y-1">
            {nav.map(item => (
              <SidebarLink key={item.to} to={item.to} icon={item.icon} label={item.label} active={loc.pathname === item.to} />
            ))}
            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
              <Link to="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                <SettingsIcon size={18} /><span className="hidden md:inline">Settings</span>
              </Link>
            </div>
          </nav>
        </aside>
        {/* Main */}
        <main className="flex-1 min-w-0 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Login
// -----------------------------------------------------------------------------
function Login() {
  const { state, login } = useAuth();
  const nav = useNavigate();
  const [u, setU] = useState("admin");
  const [p, setP] = useState("Admin@12345");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!state.loading && state.user) return <Navigate to={state.user.role === "ADMIN" ? "/admin" : state.user.role === "TEACHER" ? "/teacher" : "/student"} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const user = await login(u, p);
      nav(user.role === "ADMIN" ? "/admin" : user.role === "TEACHER" ? "/teacher" : "/student", { replace: true });
    } catch (e: any) { setErr(e.message || "Login failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-sky-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-sky-600 to-blue-700 text-white mb-3">
            <GraduationCap size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">SmartCampus 360</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">AI-Powered Intermediate College Management · Punjab, Pakistan</p>
        </div>
        <Card title="Sign in to your portal" icon={Lock}>
          <form onSubmit={submit} className="space-y-4">
            {err && <Toast kind="error">{err}</Toast>}
            <Input label="Username" value={u} onChange={(e: any) => setU(e.target.value)} placeholder="admin / teacher username / student username" required />
            <Input label="Password" type="password" value={p} onChange={(e: any) => setP(e.target.value)} required />
            <Button type="submit" className="w-full justify-center" disabled={busy}>
              {busy ? "Signing in…" : <>Sign in <ChevronRight size={16} /></>}
            </Button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Default admin: <code className="px-1 bg-slate-100 dark:bg-slate-800 rounded">admin</code> / <code className="px-1 bg-slate-100 dark:bg-slate-800 rounded">Admin@12345</code> — change it after first login.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Settings (change password + profile)
// -----------------------------------------------------------------------------
function Settings() {
  const { state } = useAuth();
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (n1 !== n2) return setMsg({ kind: "error", text: "New passwords do not match" });
    if (n1.length < 8) return setMsg({ kind: "error", text: "Password must be at least 8 characters" });
    try { await API.post("/api/auth/change-password", { currentPassword: cur, newPassword: n1 }); setMsg({ kind: "success", text: "Password changed. Other sessions were signed out." }); setCur(""); setN1(""); setN2(""); }
    catch (e: any) { setMsg({ kind: "error", text: e.message }); }
  };
  return (
    <div className="max-w-xl mx-auto space-y-4">
      <Card title="Account" subtitle={state.user?.username} icon={UserCog}>
        <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <p><b>Name:</b> {state.user?.fullName}</p>
          <p><b>Role:</b> {state.user?.role}</p>
          <p><b>Email:</b> {state.user?.email || "—"}</p>
          <p><b>Phone:</b> {state.user?.phone || "—"}</p>
        </div>
      </Card>
      <Card title="Change password" icon={Lock}>
        <form onSubmit={submit} className="space-y-4">
          {msg && <Toast kind={msg.kind as any}>{msg.text}</Toast>}
          <Input label="Current password" type="password" value={cur} onChange={(e: any) => setCur(e.target.value)} required />
          <Input label="New password (min 8 chars)" type="password" value={n1} onChange={(e: any) => setN1(e.target.value)} required />
          <Input label="Confirm new password" type="password" value={n2} onChange={(e: any) => setN2(e.target.value)} required />
          <Button type="submit"><Lock size={16} /> Update password</Button>
        </form>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Reference data hook (shared lookups)
// -----------------------------------------------------------------------------
function useReference() {
  const [ref, setRef] = useState<any>(null);
  useEffect(() => {
    (async () => {
      try {
        const [g, p, s, sub, sess, cls] = await Promise.all([
          API.get("/api/reference/groups"), API.get("/api/reference/parts"),
          API.get("/api/reference/sessions"), API.get("/api/reference/subjects"),
          API.get("/api/reference/sessions"), API.get("/api/reference/classrooms")
        ]);
        setRef({ groups: g?.groups || [], parts: p?.parts || [], sections: s?.sections || [], subjects: sub?.subjects || [], sessions: sess?.sessions || [], classrooms: cls?.classrooms || [] });
      } catch {}
    })();
  }, []);
  return ref;
}

// ============================================================================
// ADMIN PORTAL
// ============================================================================
const adminNav = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/ai-intelligence", icon: Brain, label: "AI Intelligence" },
  { to: "/admin/admissions", icon: FileCheck, label: "Admissions" },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/students", icon: GraduationCap, label: "Students" },
  { to: "/admin/teachers", icon: UserCog, label: "Teachers" },
  { to: "/admin/attendance", icon: ClipboardCheck, label: "Attendance" },
  { to: "/admin/examinations", icon: FileText, label: "Examinations" },
  { to: "/admin/results", icon: Award, label: "Results" },
  { to: "/admin/fees", icon: Wallet, label: "Fees" },
  { to: "/admin/timetables", icon: CalendarRange, label: "Timetable" },
  { to: "/admin/materials", icon: BookOpen, label: "Materials" },
  { to: "/admin/notices", icon: Bell, label: "Notices" },
  { to: "/admin/sessions", icon: CalendarDays, label: "Sessions" },
  { to: "/admin/promotions", icon: ThumbsUp, label: "Promotions" },
  { to: "/admin/complaints", icon: AlertTriangle, label: "Complaints" },
  { to: "/admin/campus-map", icon: MapPin, label: "Campus Map" },
  { to: "/admin/analytics", icon: BarChart3, label: "Analytics" }
];

function AdminShell() { return <Shell role="ADMIN" nav={adminNav} title="Administration" />; }

function useFetch(path: string, deps: any[] = []) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try { const r = await API.get(path); setData(r); setErr(""); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [reload, ...deps]);
  return { data, err, loading, reload };
}

function AdminDashboard() {
  const { data, loading } = useFetch("/api/admin/dashboard");
  if (loading || !data) return <Loader />;
  const groupData = (data.byGroup || []).map((g: any) => ({ name: g.group_name, students: g.count }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Campus Overview</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Real-time metrics computed from the live database.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Students" value={data.totalStudents} icon={GraduationCap} color="sky" hint={`${data.part1} Part 1 · ${data.part2} Part 2`} />
        <StatCard label="Teachers" value={data.totalTeachers} icon={UserCog} color="violet" />
        <StatCard label="Today's Attendance" value={data.todayAttendance} icon={ClipboardCheck} color="emerald" />
        <StatCard label="Pending Approvals" value={data.pendingApprovals} icon={AlertTriangle} color="amber" />
        <StatCard label="Fees Collected" value={`PKR ${Number(data.feeCollected).toLocaleString()}`} icon={Wallet} color="emerald" />
        <StatCard label="Fees Pending" value={`PKR ${Number(data.feePending).toLocaleString()}`} icon={Wallet} color="rose" />
        <StatCard label="Upcoming Exams" value={data.upcomingExams} icon={FileText} color="amber" />
        <StatCard label="Pending Admissions" value={data.pendingAdmissions} icon={FileCheck} color="sky" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Enrollment by Group" icon={BarChart3} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={groupData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="students" fill="#0ea5e9" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="AI Administrative Summary" icon={Brain}>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{data.aiSummary}</p>
          <Badge color="blue"><Info size={12} className="inline mr-1" /> Locally generated · rule-based</Badge>
        </Card>
      </div>
      <Card title="Recent Activity" icon={Clock}>
        <Table columns={[
          { key: "action", label: "Action", render: r => <Badge color="blue">{r.action}</Badge> },
          { key: "entity", label: "Entity" },
          { key: "detail", label: "Detail" },
          { key: "created_at", label: "Time", render: r => new Date(r.created_at * 1000).toLocaleString() }
        ]} rows={data.recentActivity || []} />
      </Card>
    </div>
  );
}

// Admissions
function AdminAdmissions() {
  const { data, loading, reload } = useFetch("/api/admissions");
  const [modal, setModal] = useState<number | null>(null);
  const ref = useReference();
  const [pub, setPub] = useState(false);
  const decide = async (id: number, status: string) => {
    try { await API.post(`/api/admin/admissions/${id}/decision`, { status }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  const ocr = async (id: number) => {
    try { const r = await API.post(`/api/admin/admissions/${id}/ocr`, {}); alert(`${r.summary}\nMissing: ${r.missingFields?.join(", ") || "none"}`); reload(); }
    catch (e: any) { alert(e.message); }
  };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Admissions</h1><p className="text-sm text-slate-500 dark:text-slate-400">Online applications + document verification.</p></div>
        <Button variant="secondary" onClick={() => setPub(true)}><Plus size={16} /> Public application</Button>
      </div>
      <Table columns={[
        { key: "id", label: "#" },
        { key: "applicant_name", label: "Applicant" },
        { key: "father_name", label: "Father" },
        { key: "phone", label: "Phone" },
        { key: "group_name", label: "Group" },
        { key: "part_name", label: "Part" },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "amber"}>{r.status}</Badge> },
        { key: "actions", label: "Actions", render: r => (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => ocr(r.id)}><Eye size={14} /></Button>
            <Button size="sm" variant="success" onClick={() => decide(r.id, "approved")}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => decide(r.id, "rejected")}>Reject</Button>
          </div>
        ) }
      ]} rows={data.admissions} />
      <Modal open={pub} onClose={() => setPub(false)} title="Submit admission application">
        <PublicAdmissionForm ref={ref} onDone={() => { setPub(false); reload(); }} />
      </Modal>
    </div>
  );
}

function PublicAdmissionForm({ ref, onDone }: any) {
  const [f, setF] = useState<any>({});
  const [msg, setMsg] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await API.post("/api/admissions", f); setMsg("Application submitted. An administrator will review it."); onDone(); }
    catch (e: any) { setMsg(e.message); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {msg && <Toast kind="success">{msg}</Toast>}
      <Input label="Applicant name" value={f.applicantName || ""} onChange={(e: any) => setF({ ...f, applicantName: e.target.value })} required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Father name" value={f.fatherName || ""} onChange={(e: any) => setF({ ...f, fatherName: e.target.value })} />
        <Input label="CNIC" value={f.cnic || ""} onChange={(e: any) => setF({ ...f, cnic: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Phone" value={f.phone || ""} onChange={(e: any) => setF({ ...f, phone: e.target.value })} />
        <Input label="Email" value={f.email || ""} onChange={(e: any) => setF({ ...f, email: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Group" value={f.groupId || ""} onChange={(e: any) => setF({ ...f, groupId: e.target.value })}>
          <option value="">— select —</option>
          {(ref?.groups || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Select label="Part" value={f.partId || ""} onChange={(e: any) => setF({ ...f, partId: e.target.value })}>
          <option value="">— select —</option>
          {(ref?.parts || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <Input label="Previous school + marks" value={f.previousSchool || ""} onChange={(e: any) => setF({ ...f, previousSchool: e.target.value })} />
      <Button type="submit" className="w-full justify-center">Submit application</Button>
    </form>
  );
}

// Users
function AdminUsers() {
  const { data, loading, reload } = useFetch("/api/admin/users");
  const [open, setOpen] = useState(false);
  const ref = useReference();
  const [f, setF] = useState<any>({ role: "TEACHER" });
  const [msg, setMsg] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    try { const r = await API.post("/api/admin/users", f); setMsg(`Created ${r.username}${r.collegeRollNo ? " (roll no " + r.collegeRollNo + ")" : ""}.`); setF({ role: f.role }); reload(); }
    catch (e: any) { setMsg(e.message); }
  };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">User Management</h1><p className="text-sm text-slate-500 dark:text-slate-400">Admins can create teacher and student accounts.</p></div>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> New account</Button>
      </div>
      <Table columns={[
        { key: "id", label: "#" },
        { key: "username", label: "Username" },
        { key: "full_name", label: "Name" },
        { key: "role", label: "Role", render: r => <Badge color={r.role === "ADMIN" ? "purple" : r.role === "TEACHER" ? "blue" : "green"}>{r.role}</Badge> },
        { key: "email", label: "Email" },
        { key: "is_active", label: "Active", render: r => <Badge color={r.is_active ? "green" : "red"}>{r.is_active ? "Yes" : "No"}</Badge> },
        { key: "actions", label: "Toggle", render: r => <Button size="sm" variant="ghost" onClick={async () => { await API.patch(`/api/admin/users/${r.id}/toggle`, {}); reload(); }}>{r.is_active ? "Deactivate" : "Activate"}</Button> }
      ]} rows={data.users} />
      <Modal open={open} onClose={() => setOpen(false)} title="Create account" size="lg">
        <form onSubmit={submit} className="space-y-3">
          {msg && <Toast kind="success">{msg}</Toast>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Username" value={f.username || ""} onChange={(e: any) => setF({ ...f, username: e.target.value })} required />
            <Input label="Temporary password" value={f.password || ""} onChange={(e: any) => setF({ ...f, password: e.target.value })} required />
            <Input label="Full name" value={f.fullName || ""} onChange={(e: any) => setF({ ...f, fullName: e.target.value })} required />
            <Select label="Role" value={f.role} onChange={(e: any) => setF({ ...f, role: e.target.value })}>
              <option value="TEACHER">Teacher</option>
              <option value="STUDENT">Student</option>
            </Select>
            <Input label="Email" value={f.email || ""} onChange={(e: any) => setF({ ...f, email: e.target.value })} />
            <Input label="Phone" value={f.phone || ""} onChange={(e: any) => setF({ ...f, phone: e.target.value })} />
          </div>
          {f.role === "STUDENT" && (
            <div className="grid grid-cols-3 gap-3 border-t pt-3 border-slate-100 dark:border-slate-800">
              <Select label="Group" value={f.extra?.groupId || ""} onChange={(e: any) => setF({ ...f, extra: { ...f.extra, groupId: e.target.value } })}>
                <option value="">—</option>
                {(ref?.groups || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
              <Select label="Part" value={f.extra?.partId || ""} onChange={(e: any) => setF({ ...f, extra: { ...f.extra, partId: e.target.value } })}>
                <option value="">—</option>
                {(ref?.parts || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input label="Father's name" value={f.extra?.fatherName || ""} onChange={(e: any) => setF({ ...f, extra: { ...f.extra, fatherName: e.target.value } })} />
            </div>
          )}
          {f.role === "TEACHER" && (
            <div className="grid grid-cols-2 gap-3 border-t pt-3 border-slate-100 dark:border-slate-800">
              <Input label="Employee code" value={f.extra?.employeeCode || ""} onChange={(e: any) => setF({ ...f, extra: { ...f.extra, employeeCode: e.target.value } })} />
              <Input label="Qualification" value={f.extra?.qualification || ""} onChange={(e: any) => setF({ ...f, extra: { ...f.extra, qualification: e.target.value } })} />
              <Input label="Designation" value={f.extra?.designation || ""} onChange={(e: any) => setF({ ...f, extra: { ...f.extra, designation: e.target.value } })} />
              <Input label="Joining date" type="date" value={f.extra?.joiningDate || ""} onChange={(e: any) => setF({ ...f, extra: { ...f.extra, joiningDate: e.target.value } })} />
            </div>
          )}
          <Button type="submit" className="w-full justify-center">Create account (user must change password at first login)</Button>
        </form>
      </Modal>
    </div>
  );
}

// Students
function AdminStudents() {
  const { data, loading } = useFetch("/api/students");
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Students</h1>
      <Table columns={[
        { key: "id", label: "#" },
        { key: "college_roll_no", label: "Roll No" },
        { key: "full_name", label: "Name" },
        { key: "group_name", label: "Group" },
        { key: "part_name", label: "Part" },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "active" ? "green" : "red"}>{r.status}</Badge> }
      ]} rows={data.students} empty="No students yet. Create one in Users." />
    </div>
  );
}

function AdminTeachers() {
  const { data, loading } = useFetch("/api/teachers");
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Teachers</h1>
      <Table columns={[
        { key: "id", label: "#" },
        { key: "employee_code", label: "Employee" },
        { key: "full_name", label: "Name" },
        { key: "qualification", label: "Qualification" },
        { key: "designation", label: "Designation" },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "active" ? "green" : "red"}>{r.status}</Badge> }
      ]} rows={data.teachers} empty="No teachers yet." />
    </div>
  );
}

// Attendance
function AdminAttendance() {
  const { data, loading, reload } = useFetch("/api/attendance");
  const { data: studs } = useFetch("/api/students");
  const ref = useReference();
  const [f, setF] = useState<any>({ status: "present" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await API.post("/api/attendance", f); setF({ status: "present" }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Attendance</h1>
      <Card title="Mark attendance" icon={ClipboardCheck}>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3">
          <Select label="Student" value={f.studentId || ""} onChange={(e: any) => setF({ ...f, studentId: e.target.value })} required>
            <option value="">— select —</option>
            {(studs?.students || []).map((s: any) => <option key={s.id} value={s.id}>{s.college_roll_no} — {s.full_name}</option>)}
          </Select>
          <Select label="Subject" value={f.subjectId || ""} onChange={(e: any) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">— general —</option>
            {(ref?.subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Date" type="date" value={f.date || ""} onChange={(e: any) => setF({ ...f, date: e.target.value })} required />
          <Select label="Status" value={f.status} onChange={(e: any) => setF({ ...f, status: e.target.value })}>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="authorized_leave">Authorized leave</option>
          </Select>
          <div className="sm:col-span-4"><Button type="submit">Mark</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "date", label: "Date" },
        { key: "student_name", label: "Student" },
        { key: "subject_name", label: "Subject" },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "present" ? "green" : r.status === "absent" ? "red" : "amber"}>{r.status}</Badge> }
      ]} rows={data.attendance} />
    </div>
  );
}

// Examinations
function AdminExaminations() {
  const { data, loading, reload } = useFetch("/api/examinations");
  const ref = useReference();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ category: "monthly_test" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await API.post("/api/admin/examinations", f); setOpen(false); setF({ category: "monthly_test" }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Examinations</h1>
        <Button onClick={() => setOpen(true)}><Plus size={16} /> New exam</Button>
      </div>
      <Table columns={[
        { key: "id", label: "#" },
        { key: "name", label: "Name" },
        { key: "category", label: "Category", render: r => <Badge color="blue">{r.category}</Badge> },
        { key: "group_name", label: "Group" },
        { key: "part_name", label: "Part" },
        { key: "start_date", label: "Start" },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "scheduled" ? "amber" : "green"}>{r.status}</Badge> }
      ]} rows={data.examinations} />
      <Modal open={open} onClose={() => setOpen(false)} title="Create examination">
        <form onSubmit={submit} className="space-y-3">
          <Input label="Name" value={f.name || ""} onChange={(e: any) => setF({ ...f, name: e.target.value })} required />
          <Select label="Category" value={f.category} onChange={(e: any) => setF({ ...f, category: e.target.value })}>
            {["monthly_test","weekly_test","send_up","pre_board","practical","theory","board"].map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Group" value={f.groupId || ""} onChange={(e: any) => setF({ ...f, groupId: e.target.value })}>
              <option value="">— all —</option>
              {(ref?.groups || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Select label="Part" value={f.partId || ""} onChange={(e: any) => setF({ ...f, partId: e.target.value })}>
              <option value="">— all —</option>
              {(ref?.parts || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input label="Start date" type="date" value={f.startDate || ""} onChange={(e: any) => setF({ ...f, startDate: e.target.value })} />
            <Input label="End date" type="date" value={f.endDate || ""} onChange={(e: any) => setF({ ...f, endDate: e.target.value })} />
          </div>
          <Input label="Room" value={f.room || ""} onChange={(e: any) => setF({ ...f, room: e.target.value })} />
          <Button type="submit" className="w-full justify-center">Create</Button>
        </form>
      </Modal>
    </div>
  );
}

// Results + grade config
function AdminResults() {
  const { data, loading, reload } = useFetch("/api/results");
  const { data: studs } = useFetch("/api/students");
  const { data: exams } = useFetch("/api/examinations");
  const { data: grades } = useFetch("/api/grades");
  const [f, setF] = useState<any>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { const r = await API.post("/api/admin/results/calculate", f); alert(`${r.percentage.toFixed(1)}% — Grade ${r.grade} (${r.status})`); reload(); }
    catch (e: any) { alert(e.message); }
  };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Results & Grading</h1>
      <Card title="Calculate + publish a result" icon={Award}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Select label="Student" value={f.studentId || ""} onChange={(e: any) => setF({ ...f, studentId: e.target.value })} required>
            <option value="">—</option>
            {(studs?.students || []).map((s: any) => <option key={s.id} value={s.id}>{s.college_roll_no} — {s.full_name}</option>)}
          </Select>
          <Select label="Examination" value={f.examinationId || ""} onChange={(e: any) => setF({ ...f, examinationId: e.target.value })} required>
            <option value="">—</option>
            {(exams?.examinations || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <div className="flex items-end"><Button type="submit">Calculate & publish</Button></div>
        </form>
      </Card>
      <Card title="Configurable grade policy" subtitle="Adjust freely — not hardcoded">
        <Table columns={[
          { key: "name", label: "Grade", render: r => <Badge color="purple">{r.name}</Badge> },
          { key: "min_percent", label: "Min %" },
          { key: "max_percent", label: "Max %" },
          { key: "gpa", label: "GPA" },
          { key: "remarks", label: "Remarks" }
        ]} rows={grades?.grades || []} />
      </Card>
      <Table columns={[
        { key: "student_name", label: "Student" },
        { key: "exam_name", label: "Exam" },
        { key: "obtained_marks", label: "Obtained", render: r => `${r.obtained_marks}/${r.total_marks}` },
        { key: "percentage", label: "%", render: r => `${r.percentage.toFixed(1)}%` },
        { key: "grade", label: "Grade", render: r => <Badge color="blue">{r.grade}</Badge> },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "pass" ? "green" : "red"}>{r.status}</Badge> }
      ]} rows={data.results} />
    </div>
  );
}

// Fees
function AdminFees() {
  const { data, loading, reload } = useFetch("/api/fees");
  const { data: studs } = useFetch("/api/students");
  const [f, setF] = useState<any>({ type: "monthly" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await API.post("/api/admin/fees", f); setF({ type: "monthly" }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  const pay = async (id: number) => {
    const amt = prompt("Amount paid:");
    if (!amt) return;
    try { await API.post(`/api/admin/fees/${id}/payment`, { amountPaid: parseFloat(amt) }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Fees</h1>
      <Card title="Generate challan" icon={Wallet}>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3">
          <Select label="Student" value={f.studentId || ""} onChange={(e: any) => setF({ ...f, studentId: e.target.value })} required>
            <option value="">—</option>
            {(studs?.students || []).map((s: any) => <option key={s.id} value={s.id}>{s.college_roll_no} — {s.full_name}</option>)}
          </Select>
          <Select label="Type" value={f.type} onChange={(e: any) => setF({ ...f, type: e.target.value })}>
            {["admission","monthly","examination","laboratory","other"].map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input label="Amount" type="number" value={f.amount || ""} onChange={(e: any) => setF({ ...f, amount: e.target.value })} required />
          <Input label="Due date" type="date" value={f.dueDate || ""} onChange={(e: any) => setF({ ...f, dueDate: e.target.value })} />
          <div className="sm:col-span-4"><Button type="submit">Generate</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "challan_no", label: "Challan" },
        { key: "student_name", label: "Student" },
        { key: "type", label: "Type" },
        { key: "amount", label: "Amount", render: r => `PKR ${r.amount}` },
        { key: "paid_amount", label: "Paid", render: r => `PKR ${r.paid_amount}` },
        { key: "actions", label: "Record payment", render: r => <Button size="sm" variant="success" onClick={() => pay(r.id)}><Wallet size={14} /> Pay</Button> }
      ]} rows={data.fees} />
    </div>
  );
}

// Timetable
function AdminTimetables() {
  const { data, loading, reload } = useFetch("/api/timetables");
  const { data: studs } = useFetch("/api/students");
  const { data: teach } = useFetch("/api/teachers");
  const ref = useReference();
  const [f, setF] = useState<any>({ day: "Monday", period: 1 });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await API.post("/api/admin/timetables", f); setF({ ...f, day: "Monday", period: 1 }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  const generate = async () => {
    if (!f.sectionId) return alert("Pick a section first");
    try { const r = await API.post("/api/admin/timetables/generate", { sectionId: f.sectionId, academicSessionId: f.academicSessionId }); reload(); alert(`Generated ${r.suggestions?.length || 0} suggestions (open the table to view).`); }
    catch (e: any) { alert(e.message); }
  };
  if (loading || !data) return <Loader />;
  const sections = ref?.sections || [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Timetable</h1>
      <Card title="Add slot (with conflict detection)" icon={CalendarRange}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Select label="Section" value={f.sectionId || ""} onChange={(e: any) => setF({ ...f, sectionId: e.target.value })} required>
            <option value="">—</option>
            {sections.map((s: any) => <option key={s.id} value={s.id}>{s.name} · {s.group_name} · {s.part_name}</option>)}
          </Select>
          <Select label="Subject" value={f.subjectId || ""} onChange={(e: any) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">—</option>
            {(ref?.subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Teacher" value={f.teacherId || ""} onChange={(e: any) => setF({ ...f, teacherId: e.target.value })}>
            <option value="">—</option>
            {(teach?.teachers || []).map((t: any) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
          <Select label="Day" value={f.day} onChange={(e: any) => setF({ ...f, day: e.target.value })}>
            {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(d => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Select label="Period" value={f.period} onChange={(e: any) => setF({ ...f, period: e.target.value })}>
            {[1,2,3,4,5,6].map(p => <option key={p} value={p}>Period {p}</option>)}
          </Select>
          <Input label="Start time" type="time" value={f.startTime || ""} onChange={(e: any) => setF({ ...f, startTime: e.target.value })} />
          <div className="sm:col-span-3 flex gap-2"><Button type="submit">Add slot</Button><Button type="button" variant="secondary" onClick={generate}><Brain size={16} /> AI Architect suggest</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "day", label: "Day" },
        { key: "period", label: "Period" },
        { key: "subject_name", label: "Subject" },
        { key: "teacher_name", label: "Teacher" },
        { key: "classroom_name", label: "Classroom" },
        { key: "start_time", label: "Start" }
      ]} rows={data.timetables} />
    </div>
  );
}

// Materials
function AdminMaterials() {
  const { data, loading, reload } = useFetch("/api/study-materials");
  const ref = useReference();
  const [f, setF] = useState<any>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("title", f.title || "");
    fd.append("description", f.description || "");
    fd.append("subjectId", f.subjectId || "");
    fd.append("groupId", f.groupId || "");
    fd.append("partId", f.partId || "");
    fd.append("chapter", f.chapter || "");
    fd.append("file", f.file);
    try { await API.upload("/api/study-materials", fd); setF({}); reload(); }
    catch (e: any) { alert(e.message); }
  };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Study Materials</h1>
      <Card title="Upload material" icon={Upload}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Input label="Title" value={f.title || ""} onChange={(e: any) => setF({ ...f, title: e.target.value })} required />
          <Select label="Subject" value={f.subjectId || ""} onChange={(e: any) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">—</option>
            {(ref?.subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Chapter" value={f.chapter || ""} onChange={(e: any) => setF({ ...f, chapter: e.target.value })} />
          <Select label="Group" value={f.groupId || ""} onChange={(e: any) => setF({ ...f, groupId: e.target.value })}>
            <option value="">—</option>
            {(ref?.groups || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select label="Part" value={f.partId || ""} onChange={(e: any) => setF({ ...f, partId: e.target.value })}>
            <option value="">—</option>
            {(ref?.parts || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input label="Description" value={f.description || ""} onChange={(e: any) => setF({ ...f, description: e.target.value })} />
          <div className="sm:col-span-2"><label className="block"><span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">File (PDF, image, doc — max 10MB)</span><input type="file" required onChange={(e: any) => setF({ ...f, file: e.target.files[0] })} className="text-sm" /></label></div>
          <div className="sm:col-span-3"><Button type="submit"><Upload size={16} /> Upload</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "title", label: "Title" },
        { key: "subject_name", label: "Subject" },
        { key: "chapter", label: "Chapter" },
        { key: "uploaded_by_name", label: "By" },
        { key: "file_path", label: "File", render: r => <a href={r.file_path} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">Open</a> }
      ]} rows={data.materials} />
    </div>
  );
}

// Notices
function AdminNotices() {
  const { data, loading, reload } = useFetch("/api/notices");
  const ref = useReference();
  const [f, setF] = useState<any>({ category: "college_wide", audience: "all", priority: "normal" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await API.post("/api/notices", f); setF({ category: "college_wide", audience: "all", priority: "normal" }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Notices & Announcements</h1>
      <Card title="Publish notice" icon={Bell}>
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
          <Input label="Title" value={f.title || ""} onChange={(e: any) => setF({ ...f, title: e.target.value })} required />
          <Select label="Audience" value={f.audience} onChange={(e: any) => setF({ ...f, audience: e.target.value })}>
            <option value="all">All</option>
            <option value="teachers">Teachers</option>
            <option value="students">Students</option>
          </Select>
          <Select label="Category" value={f.category} onChange={(e: any) => setF({ ...f, category: e.target.value })}>
            {["college_wide","group","part","section","teacher","exam","fee","event","urgent"].map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label="Priority" value={f.priority} onChange={(e: any) => setF({ ...f, priority: e.target.value })}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
          <div className="sm:col-span-2"><Textarea label="Body" value={f.body || ""} onChange={(e: any) => setF({ ...f, body: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="submit"><Send size={16} /> Publish + notify</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "title", label: "Title" },
        { key: "category", label: "Category", render: r => <Badge color="blue">{r.category}</Badge> },
        { key: "audience", label: "Audience" },
        { key: "priority", label: "Priority", render: r => <Badge color={r.priority === "urgent" ? "red" : r.priority === "high" ? "amber" : "slate"}>{r.priority}</Badge> },
        { key: "created_by_name", label: "By" }
      ]} rows={data.notices} />
    </div>
  );
}

// Sessions (academic year)
function AdminSessions() {
  const { data, loading, reload } = useFetch("/api/reference/sessions");
  const [f, setF] = useState<any>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await API.post("/api/admin/sessions", { ...f, activate: true }); setF({}); reload(); }
    catch (e: any) { alert(e.message); }
  };
  const activate = async (id: number) => { await API.post(`/api/admin/sessions/${id}/activate`, {}); reload(); };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Academic Sessions</h1>
      <Card title="Create session" icon={CalendarDays}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Input label="Name (e.g. 2026-2027)" value={f.name || ""} onChange={(e: any) => setF({ ...f, name: e.target.value })} required />
          <Input label="Start date" type="date" value={f.startDate || ""} onChange={(e: any) => setF({ ...f, startDate: e.target.value })} />
          <Input label="End date" type="date" value={f.endDate || ""} onChange={(e: any) => setF({ ...f, endDate: e.target.value })} />
          <div className="sm:col-span-3"><Button type="submit">Create + activate</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "name", label: "Session" },
        { key: "start_date", label: "Start" },
        { key: "end_date", label: "End" },
        { key: "is_active", label: "Active", render: r => r.is_active ? <Badge color="green">Active</Badge> : <Badge>Inactive</Badge> },
        { key: "actions", label: "Activate", render: r => !r.is_active ? <Button size="sm" variant="secondary" onClick={() => activate(r.id)}>Activate</Button> : null }
      ]} rows={data.sessions} />
    </div>
  );
}

// Promotions
function AdminPromotions() {
  const { data, loading, reload } = useFetch("/api/admin/promotions");
  const { data: studs } = useFetch("/api/students");
  const ref = useReference();
  const [f, setF] = useState<any>({ toPartId: 2 });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await API.post("/api/admin/promotions", f); setF({ toPartId: 2 }); reload(); }
    catch (e: any) { alert(e.message); }
  };
  const approve = async (id: number) => { try { await API.post(`/api/admin/promotions/${id}/approve`, {}); reload(); } catch (e: any) { alert(e.message); } };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Part 1 → Part 2 Promotion</h1>
      <Card title="Initiate promotion" icon={ThumbsUp}>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3">
          <Select label="Student" value={f.studentId || ""} onChange={(e: any) => setF({ ...f, studentId: e.target.value })} required>
            <option value="">—</option>
            {(studs?.students || []).map((s: any) => <option key={s.id} value={s.id}>{s.college_roll_no} — {s.full_name}</option>)}
          </Select>
          <Select label="From part" value={f.fromPartId || ""} onChange={(e: any) => setF({ ...f, fromPartId: e.target.value })}>
            <option value="">—</option>
            {(ref?.parts || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select label="To part" value={f.toPartId} onChange={(e: any) => setF({ ...f, toPartId: e.target.value })}>
            {(ref?.parts || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <div className="flex items-end"><Button type="submit">Initiate</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "student_name", label: "Student" },
        { key: "from_part_id", label: "From → To", render: r => `${r.from_part_id} → ${r.to_part_id}` },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "amber"}>{r.status}</Badge> },
        { key: "actions", label: "Approve", render: r => r.status === "pending" ? <Button size="sm" variant="success" onClick={() => approve(r.id)}><Check size={14} /> Approve</Button> : null }
      ]} rows={data.promotions} />
    </div>
  );
}

// Complaints
function AdminComplaints() {
  const { data, loading, reload } = useFetch("/api/complaints");
  const update = async (id: number, status: string) => { try { await API.post(`/api/admin/complaints/${id}`, { status }); reload(); } catch (e: any) { alert(e.message); } };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Complaints</h1>
      <Table columns={[
        { key: "title", label: "Title" },
        { key: "category", label: "Category" },
        { key: "priority", label: "Priority", render: r => <Badge color={r.priority === "urgent" ? "red" : "slate"}>{r.priority}</Badge> },
        { key: "raised_by_name", label: "By" },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "resolved" ? "green" : r.status === "open" ? "amber" : "slate"}>{r.status}</Badge> },
        { key: "actions", label: "Update", render: r => (
          <select className="text-sm border rounded px-2 py-1" onChange={(e) => update(r.id, e.target.value)} defaultValue={r.status}>
            <option value="open">Open</option><option value="assigned">Assigned</option>
            <option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select>
        ) }
      ]} rows={data.complaints} />
    </div>
  );
}

// Campus map
function AdminCampusMap() {
  const { data, loading, reload } = useFetch("/api/campus-map");
  const [f, setF] = useState<any>({ type: "classroom" });
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await API.post("/api/admin/campus-map", f); setF({ type: "classroom" }); reload(); } catch (e: any) { alert(e.message); } };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Digital Campus Map</h1>
      <Card title="Add location" icon={MapPin}>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3">
          <Input label="Name" value={f.name || ""} onChange={(e: any) => setF({ ...f, name: e.target.value })} required />
          <Select label="Type" value={f.type} onChange={(e: any) => setF({ ...f, type: e.target.value })}>
            {["classroom","lab","library","office","facility"].map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input label="Floor" value={f.floor || ""} onChange={(e: any) => setF({ ...f, floor: e.target.value })} />
          <Input label="Description" value={f.description || ""} onChange={(e: any) => setF({ ...f, description: e.target.value })} />
          <div className="sm:col-span-4"><Button type="submit">Add</Button></div>
        </form>
      </Card>
      <div className="grid sm:grid-cols-3 gap-3">
        {(data.locations || []).map((l: any) => (
          <Card key={l.id} title={l.name} icon={Building2}>
            <Badge color="blue">{l.type}</Badge>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{l.description || "—"}</p>
            <p className="text-xs text-slate-400 mt-2">Floor: {l.floor || "—"}</p>
          </Card>
        ))}
        {data.locations?.length === 0 && <Empty icon={MapPin} text="No locations yet." />}
      </div>
    </div>
  );
}

// Analytics (Admin feature 1 + 2)
function AdminAnalytics() {
  const { data } = useFetch("/api/admin/dashboard");
  const grp = (data?.byGroup || []).map((g: any) => ({ name: g.group_name, value: g.count }));
  const COLORS = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Analytics & Intelligence</h1>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Group enrollment distribution" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={grp} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {grp.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Predictive student analytics" subtitle="Transparent indicators" icon={Brain}>
          <p className="text-sm text-slate-600 dark:text-slate-300">Students with attendance below 75% or recent exam averages below 50% are flagged as potentially benefiting from additional academic support. These are transparent indicators, not certainty-based predictions.</p>
          <div className="mt-3"><Badge color="amber"><AlertTriangle size={12} className="inline mr-1" /> Review flagged students via the Students list</Badge></div>
        </Card>
      </div>
    </div>
  );
}

function AdminIntelligence() {
  const { data, loading } = useFetch("/api/admin/dashboard");
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">AI Campus Intelligence</h1>
      <Card title="Daily administrative summary" icon={Brain}>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{data.aiSummary}</p>
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          <StatCard label="Attendance today" value={data.todayAttendance} icon={ClipboardCheck} color="emerald" />
          <StatCard label="Pending approvals" value={data.pendingApprovals} icon={AlertTriangle} color="amber" />
          <StatCard label="Pending admissions" value={data.pendingAdmissions} icon={FileCheck} color="sky" />
        </div>
        <Badge color="blue"><Info size={12} className="inline mr-1" /> Locally generated, transparent rule-based summary. Configure AI_API_KEY to upgrade to a hosted LLM provider.</Badge>
      </Card>
    </div>
  );
}

// ============================================================================
// TEACHER PORTAL
// ============================================================================
const teacherNav = [
  { to: "/teacher", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/teacher/classes", icon: BookOpen, label: "My Classes" },
  { to: "/teacher/attendance", icon: ClipboardCheck, label: "Attendance" },
  { to: "/teacher/marks", icon: FileText, label: "Marks" },
  { to: "/teacher/materials", icon: BookOpen, label: "Materials" },
  { to: "/teacher/heatmap", icon: BarChart3, label: "Heatmap" },
  { to: "/teacher/syllabus", icon: ListChecks, label: "Syllabus" },
  { to: "/teacher/copilot", icon: Brain, label: "AI Co-Pilot" },
  { to: "/teacher/assessment", icon: PenLine, label: "Assessment Studio" },
  { to: "/teacher/messages", icon: MessageSquare, label: "Messages" },
  { to: "/teacher/support", icon: ThumbsUp, label: "Student Support" },
  { to: "/teacher/classroom", icon: Lightbulb, label: "Digital Classroom" }
];
function TeacherShell() { return <Shell role="TEACHER" nav={teacherNav} title="Teacher Workspace" />; }

function TeacherDashboard() {
  const { data, loading } = useFetch("/api/teacher/me");
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Welcome, {data.teacher?.full_name}</h1><p className="text-sm text-slate-500 dark:text-slate-400">{data.teacher?.designation} · {data.teacher?.qualification}</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="My Classes" value={data.classes?.length || 0} icon={BookOpen} color="violet" />
        <StatCard label="Weekly Periods" value={data.workload || 0} icon={Clock} color="sky" />
        <StatCard label="Employee Code" value={data.teacher?.employee_code} icon={IdCard} color="emerald" />
        <StatCard label="Status" value={data.teacher?.status} icon={Shield} color="amber" />
      </div>
      <Card title="My assigned classes" icon={BookOpen}>
        <Table columns={[
          { key: "subject_name", label: "Subject" },
          { key: "section_name", label: "Section" },
          { key: "group_name", label: "Group" },
          { key: "part_name", label: "Part" }
        ]} rows={data.classes} empty="No class assignments yet. Ask an admin to assign you to subjects." />
      </Card>
    </div>
  );
}

function TeacherAttendance() { return <AdminAttendance />; }
function TeacherMarks() {
  const { data: exams } = useFetch("/api/examinations");
  const { data: studs } = useFetch("/api/students");
  const ref = useReference();
  const [f, setF] = useState<any>({});
  const [msg, setMsg] = useState("");
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await API.post("/api/marks", f); setMsg("Marks saved."); setF({}); } catch (e: any) { setMsg(e.message); } };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Marks Entry</h1>
      {msg && <Toast kind={msg.includes("saved") ? "success" : "error"}>{msg}</Toast>}
      <Card title="Enter marks" icon={FileText}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Select label="Examination" value={f.examinationId || ""} onChange={(e: any) => setF({ ...f, examinationId: e.target.value })} required>
            <option value="">—</option>
            {(exams?.examinations || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Select label="Subject" value={f.subjectId || ""} onChange={(e: any) => setF({ ...f, subjectId: e.target.value })} required>
            <option value="">—</option>
            {(ref?.subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Student" value={f.studentId || ""} onChange={(e: any) => setF({ ...f, studentId: e.target.value })} required>
            <option value="">—</option>
            {(studs?.students || []).map((s: any) => <option key={s.id} value={s.id}>{s.college_roll_no} — {s.full_name}</option>)}
          </Select>
          <Input label="Obtained" type="number" value={f.obtained || ""} onChange={(e: any) => setF({ ...f, obtained: e.target.value })} required />
          <Input label="Practical obtained" type="number" value={f.practicalObtained || ""} onChange={(e: any) => setF({ ...f, practicalObtained: e.target.value })} />
          <div className="flex items-end"><Button type="submit">Save marks</Button></div>
        </form>
      </Card>
    </div>
  );
}

function TeacherMaterials() { return <AdminMaterials />; }

function TeacherHeatmap() {
  const { data, loading } = useFetch("/api/teacher/heatmap");
  if (loading || !data) return <Loader />;
  const rows = (data.heatmap || []).map((r: any) => ({ name: r.subject_name, average: Math.round(r.avg_obtained || 0) }));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Classroom Learning Heatmap</h1>
      <Card title="Subject performance (avg obtained)" icon={BarChart3}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
            <Tooltip />
            <Bar dataKey="average" fill="#8b5cf6" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Table columns={[
        { key: "subject_name", label: "Subject" },
        { key: "avg_obtained", label: "Average", render: r => Math.round(r.avg_obtained || 0) },
        { key: "max_obtained", label: "Max" },
        { key: "min_obtained", label: "Min" },
        { key: "count", label: "Entries" }
      ]} rows={data.heatmap} />
    </div>
  );
}

function TeacherSyllabus() {
  const { data, loading, reload } = useFetch("/api/syllabus");
  const ref = useReference();
  const [f, setF] = useState<any>({});
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await API.post("/api/syllabus", f); setF({}); reload(); } catch (e: any) { alert(e.message); } };
  const toggle = async (id: number, completed: boolean) => { await API.patch(`/api/syllabus/${id}`, { isCompleted: !completed }); reload(); };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Syllabus Velocity Tracker</h1>
      <Card title="Add topic" icon={ListChecks}>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3">
          <Select label="Subject" value={f.subjectId || ""} onChange={(e: any) => setF({ ...f, subjectId: e.target.value })} required>
            <option value="">—</option>
            {(ref?.subjects || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Chapter" value={f.chapter || ""} onChange={(e: any) => setF({ ...f, chapter: e.target.value })} />
          <Input label="Topic" value={f.topic || ""} onChange={(e: any) => setF({ ...f, topic: e.target.value })} required />
          <Input label="Target date" type="date" value={f.targetDate || ""} onChange={(e: any) => setF({ ...f, targetDate: e.target.value })} />
          <div className="sm:col-span-4"><Button type="submit">Add</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "subject_name", label: "Subject" },
        { key: "chapter", label: "Chapter" },
        { key: "topic", label: "Topic" },
        { key: "target_date", label: "Target" },
        { key: "is_completed", label: "Status", render: r => r.is_completed ? <Badge color="green">Completed</Badge> : <Badge color="amber">Pending</Badge> },
        { key: "actions", label: "Toggle", render: r => <Button size="sm" variant="ghost" onClick={() => toggle(r.id, r.is_completed)}>{r.is_completed ? "Undo" : "Complete"}</Button> }
      ]} rows={data.topics} />
    </div>
  );
}

function TeacherCopilot() {
  const [topic, setTopic] = useState(""); const [kind, setKind] = useState("lesson plan");
  const [out, setOut] = useState("");
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { const r = await API.post("/api/ai/teacher-copilot", { topic, kind }); setOut(r.plan); } catch (e: any) { setOut(e.message); } };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">AI Teacher Co-Pilot</h1>
      <Card title="Generate teaching assistance" icon={Brain}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Input label="Topic" value={topic} onChange={(e: any) => setTopic(e.target.value)} required />
          <Select label="Output" value={kind} onChange={(e: any) => setKind(e.target.value)}>
            {["lesson plan","learning objectives","topic explanation","classroom activity","revision plan","resource suggestions"].map(k => <option key={k} value={k}>{k}</option>)}
          </Select>
          <div className="flex items-end"><Button type="submit"><Brain size={16} /> Generate</Button></div>
        </form>
      </Card>
      {out && <Card title="Output (review and approve before use)" icon={Lightbulb}><pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{out}</pre></Card>}
    </div>
  );
}

function TeacherAssessment() {
  const [topic, setTopic] = useState(""); const [count, setCount] = useState(5);
  const [qs, setQs] = useState<any[]>([]);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { const r = await API.post("/api/ai/assessment-studio", { topic, count, type: "mcq" }); setQs(r.questions || []); } catch (e: any) { alert(e.message); } };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Intelligent Assessment Studio</h1>
      <Card title="Generate practice questions" icon={PenLine}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Input label="Topic" value={topic} onChange={(e: any) => setTopic(e.target.value)} required />
          <Input label="Count" type="number" min={1} max={10} value={count} onChange={(e: any) => setCount(parseInt(e.target.value, 10))} />
          <div className="flex items-end"><Button type="submit">Generate</Button></div>
        </form>
      </Card>
      {qs.length > 0 && (
        <Card title="Generated questions — review & edit before publishing" icon={ListChecks}>
          {qs.map((q, i) => (
            <div key={i} className="mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <p className="font-medium text-slate-700 dark:text-slate-200">{q.q}</p>
              <ul className="mt-1 text-sm text-slate-600 dark:text-slate-300">{q.options.map((o: any, j: number) => <li key={j}>{o}</li>)}</ul>
              <Badge color="green">Answer: {q.answer}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function TeacherMessages() {
  const { data, loading, reload } = useFetch("/api/messages");
  const [f, setF] = useState<any>({});
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await API.post("/api/messages", f); setF({}); reload(); } catch (e: any) { alert(e.message); } };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Unified Communication Center</h1>
      <Card title="Send message" icon={Send}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Input label="To (user id)" type="number" value={f.toUser || ""} onChange={(e: any) => setF({ ...f, toUser: e.target.value })} required />
          <div className="sm:col-span-3"><Textarea label="Message" value={f.body || ""} onChange={(e: any) => setF({ ...f, body: e.target.value })} /></div>
          <div className="sm:col-span-3"><Button type="submit"><Send size={16} /> Send</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "from_name", label: "From" },
        { key: "to_name", label: "To" },
        { key: "body", label: "Message" },
        { key: "created_at", label: "When", render: r => new Date(r.created_at * 1000).toLocaleString() }
      ]} rows={data.messages} />
    </div>
  );
}

function TeacherSupport() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Student Support Case Manager</h1>
      <Card title="Confidential case records" icon={Shield}>
        <p className="text-sm text-slate-600 dark:text-slate-300">Create academic support records (concern, plan, follow-up date, progress notes, recommended resources). Sensitive notes are kept confidential and visible only to authorized users — enforced on the backend via role checks.</p>
        <Badge color="blue"><Lock size={12} className="inline mr-1" /> Confidential by default</Badge>
      </Card>
    </div>
  );
}

function TeacherClassroom() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Interactive Digital Classroom</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card title="Digital Whiteboard" icon={PenLine}><p className="text-sm text-slate-500 dark:text-slate-400">Sketch concepts live during class. (Canvas-based interactive surface — ready for content.)</p></Card>
        <Card title="Quick polls & quizzes" icon={Lightbulb}><p className="text-sm text-slate-500 dark:text-slate-400">Run a class poll in one click; results stream via Socket.IO.</p></Card>
        <Card title="Shared resources" icon={BookMarked}><p className="text-sm text-slate-500 dark:text-slate-400">Drop a link to a study material — students see it in real time.</p></Card>
      </div>
    </div>
  );
}

function TeacherClasses() {
  const { data, loading } = useFetch("/api/teacher/me");
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">My Classes</h1>
      <Table columns={[
        { key: "subject_name", label: "Subject" },
        { key: "section_name", label: "Section" },
        { key: "group_name", label: "Group" },
        { key: "part_name", label: "Part" }
      ]} rows={data.classes} empty="No class assignments yet." />
    </div>
  );
}

// ============================================================================
// STUDENT PORTAL
// ============================================================================
const studentNav = [
  { to: "/student", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/student/attendance", icon: ClipboardCheck, label: "Attendance" },
  { to: "/student/results", icon: Award, label: "Results" },
  { to: "/student/fees", icon: Wallet, label: "Fees" },
  { to: "/student/materials", icon: BookOpen, label: "Materials" },
  { to: "/student/timetable", icon: CalendarRange, label: "Timetable" },
  { to: "/student/study-companion", icon: Brain, label: "AI Study Companion" },
  { to: "/student/exam-simulator", icon: FlaskConical, label: "Exam Simulator" },
  { to: "/student/passport", icon: Award, label: "Achievements" },
  { to: "/student/projects", icon: FolderKanban, label: "Projects" },
  { to: "/student/reservations", icon: Calendar, label: "Book Service" },
  { to: "/student/career", icon: Compass, label: "Career" },
  { to: "/student/timeline", icon: Clock, label: "Timeline" },
  { to: "/student/identity", icon: IdCard, label: "Digital ID" }
];
function StudentShell() { return <Shell role="STUDENT" nav={studentNav} title="Student Portal" />; }

function StudentDashboard() {
  const { data, loading } = useFetch("/api/student/me");
  if (loading || !data) return <Loader />;
  const s = data.student;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Salam, {s?.full_name}</h1><p className="text-sm text-slate-500 dark:text-slate-400">{s?.group_name} · {s?.part_name} · Roll {s?.college_roll_no}</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Attendance" value={`${data.attendanceRate}%`} icon={ClipboardCheck} color="emerald" />
        <StatCard label="Pending Fees" value={`PKR ${Number(data.pendingFees).toLocaleString()}`} icon={Wallet} color={data.pendingFees > 0 ? "rose" : "emerald"} />
        <StatCard label="Upcoming Exams" value={data.upcoming?.length || 0} icon={FileText} color="amber" />
        <StatCard label="Session" value={s?.session_name || "—"} icon={CalendarDays} color="sky" />
      </div>
      <Card title="Upcoming examinations" icon={FileText}>
        {data.upcoming?.length ? (
          <Table columns={[
            { key: "name", label: "Exam" }, { key: "start_date", label: "Date" }
          ]} rows={data.upcoming} />
        ) : <Empty icon={FileText} text="No upcoming exams." />}
      </Card>
    </div>
  );
}

function StudentAttendance() {
  const { state } = useAuth();
  const { data: studs } = useFetch("/api/students");
  const me = (studs?.students || []).find((s: any) => s.username === state.user?.username);
  const { data, loading } = useFetch(`/api/attendance?studentId=${me?.id || 0}`, [me?.id]);
  if (loading || !data) return <Loader />;
  const present = data.attendance.filter((a: any) => a.status === "present").length;
  const total = data.attendance.length;
  const rate = total ? Math.round((present / total) * 100) : 0;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">My Attendance</h1>
      <StatCard label="Overall rate" value={`${rate}%`} icon={ClipboardCheck} color={rate >= 75 ? "emerald" : "rose"} hint={`${present}/${total} days present`} />
      <Table columns={[
        { key: "date", label: "Date" },
        { key: "subject_name", label: "Subject" },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "present" ? "green" : r.status === "absent" ? "red" : "amber"}>{r.status}</Badge> }
      ]} rows={data.attendance} empty="No attendance records yet." />
    </div>
  );
}

function StudentResults() {
  const { state } = useAuth();
  const { data: studs } = useFetch("/api/students");
  const me = (studs?.students || []).find((s: any) => s.username === state.user?.username);
  const { data, loading } = useFetch(`/api/results?studentId=${me?.id || 0}`, [me?.id]);
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">My Results</h1>
      <Table columns={[
        { key: "exam_name", label: "Examination" },
        { key: "obtained_marks", label: "Marks", render: r => `${r.obtained_marks}/${r.total_marks}` },
        { key: "percentage", label: "%", render: r => `${r.percentage.toFixed(1)}%` },
        { key: "grade", label: "Grade", render: r => <Badge color="purple">{r.grade}</Badge> },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "pass" ? "green" : "red"}>{r.status}</Badge> }
      ]} rows={data.results} empty="No published results yet." />
    </div>
  );
}

function StudentFees() {
  const { state } = useAuth();
  const { data: studs } = useFetch("/api/students");
  const me = (studs?.students || []).find((s: any) => s.username === state.user?.username);
  const { data, loading } = useFetch(`/api/fees?studentId=${me?.id || 0}`, [me?.id]);
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">My Fees</h1>
      <Table columns={[
        { key: "challan_no", label: "Challan" },
        { key: "type", label: "Type" },
        { key: "amount", label: "Amount", render: r => `PKR ${r.amount}` },
        { key: "paid_amount", label: "Paid", render: r => `PKR ${r.paid_amount}` },
        { key: "due_date", label: "Due" }
      ]} rows={data.fees} empty="No fee records." />
    </div>
  );
}

function StudentMaterials() {
  const { data, loading } = useFetch("/api/study-materials");
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Study Materials</h1>
      <Table columns={[
        { key: "title", label: "Title" },
        { key: "subject_name", label: "Subject" },
        { key: "chapter", label: "Chapter" },
        { key: "uploaded_by_name", label: "By" },
        { key: "file_path", label: "Open", render: r => <a href={r.file_path} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">View</a> }
      ]} rows={data.materials} />
    </div>
  );
}

function StudentTimetable() {
  const { data, loading } = useFetch("/api/timetables");
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">My Timetable</h1>
      <Table columns={[
        { key: "day", label: "Day" },
        { key: "period", label: "Period" },
        { key: "subject_name", label: "Subject" },
        { key: "teacher_name", label: "Teacher" },
        { key: "classroom_name", label: "Room" },
        { key: "start_time", label: "Start" }
      ]} rows={data.timetables} />
    </div>
  );
}

function StudentStudyCompanion() {
  const [q, setQ] = useState(""); const [sid, setSid] = useState("");
  const [out, setOut] = useState<any>(null);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { const r = await API.post("/api/ai/study-companion", { question: q, subjectId: sid || undefined }); setOut(r); } catch (e: any) { alert(e.message); } };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">AI Personal Study Companion</h1>
      <Card title="Ask a question" icon={Brain}>
        <form onSubmit={submit} className="space-y-3">
          <Textarea label="Your question" value={q} onChange={(e: any) => setQ(e.target.value)} />
          <Input label="Subject (optional id)" value={sid} onChange={(e: any) => setSid(e.target.value)} />
          <Button type="submit"><Brain size={16} /> Ask</Button>
        </form>
      </Card>
      {out && (
        <Card title="Answer" icon={Lightbulb}>
          <p className="text-sm text-slate-700 dark:text-slate-200">{out.answer}</p>
          {out.sources?.length > 0 && <div className="mt-3"><p className="text-xs font-medium text-slate-500 mb-1">Sources:</p>{out.sources.map((s: any, i: number) => <Badge key={i} color="blue">{s.title}</Badge>)}</div>}
          <Badge color="blue"><Info size={12} className="inline mr-1" /> Provider: {out.provider}</Badge>
        </Card>
      )}
    </div>
  );
}

function StudentExamSimulator() {
  const [topic, setTopic] = useState(""); const [qs, setQs] = useState<any[]>([]);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { const r = await API.post("/api/ai/assessment-studio", { topic, count: 5, type: "mcq" }); setQs(r.questions || []); } catch (e: any) { alert(e.message); } };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Exam Readiness Simulator</h1>
      <Card title="Practice quiz" subtitle="Practice results — distinct from official exam results" icon={FlaskConical}>
        <form onSubmit={submit} className="flex gap-3">
          <Input label="Topic" value={topic} onChange={(e: any) => setTopic(e.target.value)} required />
          <div className="flex items-end"><Button type="submit">Start practice</Button></div>
        </form>
      </Card>
      {qs.length > 0 && (
        <Card title="Practice questions" icon={ListChecks}>
          {qs.map((q, i) => (
            <div key={i} className="mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <p className="font-medium text-slate-700 dark:text-slate-200">{q.q}</p>
              <ul className="mt-1 text-sm text-slate-600 dark:text-slate-300">{q.options.map((o: any, j: number) => <li key={j}>{o}</li>)}</ul>
              <Badge color="green">Answer: {q.answer}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function StudentPassport() {
  const { state } = useAuth();
  const { data: studs } = useFetch("/api/students");
  const me = (studs?.students || []).find((s: any) => s.username === state.user?.username);
  const { data, loading, reload } = useFetch(`/api/achievements?studentId=${me?.id || 0}`, [me?.id]);
  const [f, setF] = useState<any>({});
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await API.post("/api/achievements", { ...f, studentId: me?.id }); setF({}); reload(); } catch (e: any) { alert(e.message); } };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Achievement & Skill Passport</h1>
      <Card title="Record an achievement" icon={Award}>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3">
          <Input label="Title" value={f.title || ""} onChange={(e: any) => setF({ ...f, title: e.target.value })} required />
          <Input label="Category" value={f.category || ""} onChange={(e: any) => setF({ ...f, category: e.target.value })} />
          <Input label="Issuer" value={f.issuer || ""} onChange={(e: any) => setF({ ...f, issuer: e.target.value })} />
          <Input label="Date" type="date" value={f.date || ""} onChange={(e: any) => setF({ ...f, date: e.target.value })} />
          <div className="sm:col-span-4"><Button type="submit">Add</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "title", label: "Title" },
        { key: "category", label: "Category" },
        { key: "issuer", label: "Issuer" },
        { key: "date", label: "Date" },
        { key: "verified", label: "Verified", render: r => r.verified ? <Badge color="green">Yes</Badge> : <Badge color="amber">Pending</Badge> }
      ]} rows={data.achievements} empty="No achievements recorded yet." />
    </div>
  );
}

function StudentProjects() {
  const { data, loading, reload } = useFetch("/api/projects");
  const [f, setF] = useState<any>({});
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await API.post("/api/projects", f); setF({}); reload(); } catch (e: any) { alert(e.message); } };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Collaborative Project Hub</h1>
      <Card title="Start a project" icon={FolderKanban}>
        <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3">
          <Input label="Title" value={f.title || ""} onChange={(e: any) => setF({ ...f, title: e.target.value })} required />
          <Input label="Description" value={f.description || ""} onChange={(e: any) => setF({ ...f, description: e.target.value })} />
          <Input label="Deadline" type="date" value={f.deadline || ""} onChange={(e: any) => setF({ ...f, deadline: e.target.value })} />
          <div className="sm:col-span-3"><Button type="submit">Create</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "title", label: "Title" },
        { key: "owner_name", label: "Owner" },
        { key: "member_count", label: "Members" },
        { key: "deadline", label: "Deadline" }
      ]} rows={data.projects} empty="No projects yet." />
    </div>
  );
}

function StudentReservations() {
  const { data, loading, reload } = useFetch("/api/campus-reservations");
  const [f, setF] = useState<any>({ facility: "library" });
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await API.post("/api/campus-reservations", f); setF({ facility: "library" }); reload(); } catch (e: any) { alert(e.message); } };
  if (loading || !data) return <Loader />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Campus Service Booking</h1>
      <Card title="Reserve a facility" icon={Calendar}>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3">
          <Select label="Facility" value={f.facility} onChange={(e: any) => setF({ ...f, facility: e.target.value })}>
            {["library","study_room","lab","sports","other"].map(x => <option key={x} value={x}>{x}</option>)}
          </Select>
          <Input label="Date" type="date" value={f.reservedDate || ""} onChange={(e: any) => setF({ ...f, reservedDate: e.target.value })} required />
          <Input label="Start" type="time" value={f.startTime || ""} onChange={(e: any) => setF({ ...f, startTime: e.target.value })} />
          <Input label="End" type="time" value={f.endTime || ""} onChange={(e: any) => setF({ ...f, endTime: e.target.value })} />
          <div className="sm:col-span-4"><Input label="Purpose" value={f.purpose || ""} onChange={(e: any) => setF({ ...f, purpose: e.target.value })} /></div>
          <div className="sm:col-span-4"><Button type="submit">Request reservation</Button></div>
        </form>
      </Card>
      <Table columns={[
        { key: "facility", label: "Facility" },
        { key: "reserved_date", label: "Date" },
        { key: "start_time", label: "Start" },
        { key: "end_time", label: "End" },
        { key: "status", label: "Status", render: r => <Badge color={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "amber"}>{r.status}</Badge> }
      ]} rows={data.reservations} />
    </div>
  );
}

function StudentCareer() {
  const pathways: Record<string, string[]> = {
    ICS: ["BS Computer Science", "BS Software Engineering", "BS Data Science", "BS IT", "BS AI"],
    "FSc Pre-Medical": ["MBBS", "BDS", "Pharm-D", "BS Nursing", "BS Biotechnology"],
    "FSc Pre-Engineering": ["BS Electrical Eng", "BS Mechanical Eng", "BS Civil Eng", "BS Mechatronics"],
    FA: ["BA English", "BA Political Science", "BA Mass Communication", "LLB"],
    ICom: ["B.Com", "ACCA", "BS Accounting & Finance", "BS Economics"]
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Career & Skill Navigator</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Relevant educational pathways for each Intermediate group — career guidance, not guaranteed predictions.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(pathways).map(([g, list]) => (
          <Card key={g} title={g} icon={Compass}>
            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
              {list.map(p => <li key={p} className="flex items-center gap-2"><ChevronRight size={14} className="text-sky-500" /> {p}</li>)}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StudentTimeline() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Academic Journey Timeline</h1>
      <Card title="Your milestones" icon={Clock}>
        <ol className="relative border-l border-slate-200 dark:border-slate-700 pl-4 space-y-4">
          {["Admission to Part 1", "Academic session enrollment", "Monthly tests & attendance", "Send-up examinations", "Part 1 → Part 2 promotion", "Part 2 annual / board exams", "Certificates & achievements"].map((t, i) => (
            <li key={i} className="text-sm text-slate-600 dark:text-slate-300">
              <span className="absolute -left-2 w-3 h-3 rounded-full bg-sky-500 border-2 border-white dark:border-slate-900" />
              <p className="font-medium text-slate-700 dark:text-slate-200">{t}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-slate-400 mt-3">Milestones preserve your academic history across sessions.</p>
      </Card>
    </div>
  );
}

function StudentIdentity() {
  const { data, loading } = useFetch("/api/student/me");
  if (loading || !data) return <Loader />;
  const s = data.student;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Digital Campus Identity Wallet</h1>
      <Card title="Digital Student ID" icon={IdCard}>
        <div className="rounded-xl bg-gradient-to-br from-sky-600 to-blue-700 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">SmartCampus 360 · Punjab, Pakistan</p>
              <p className="text-xl font-bold mt-2">{s?.full_name}</p>
              <p className="text-sm opacity-90">{s?.group_name} · {s?.part_name}</p>
            </div>
            <GraduationCap size={48} className="opacity-80" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div><p className="opacity-70 text-xs">Roll No</p><p className="font-mono">{s?.college_roll_no}</p></div>
            <div><p className="opacity-70 text-xs">Father</p><p>{s?.father_name || "—"}</p></div>
            <div><p className="opacity-70 text-xs">Session</p><p>{s?.session_name || "—"}</p></div>
            <div><p className="opacity-70 text-xs">Status</p><p>{s?.status}</p></div>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">QR-based identity verification can be issued by administration on request.</div>
      </Card>
    </div>
  );
}

// ============================================================================
// Campus AI Agent (shared)
// ============================================================================
function CampusAgent() {
  const [q, setQ] = useState(""); const [out, setOut] = useState("");
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { const r = await API.post("/api/ai/campus-agent", { query: q }); setOut(r.answer); } catch (e: any) { setOut(e.message); } };
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card title="Global Campus AI Agent" subtitle="Role-scoped — uses only authorized data" icon={Brain}>
        <form onSubmit={submit} className="space-y-3">
          <Textarea label="Ask anything (within your role)" value={q} onChange={(e: any) => setQ(e.target.value)} />
          <Button type="submit"><Brain size={16} /> Ask</Button>
        </form>
      </Card>
      {out && <Card title="Response" icon={MessageSquare}><p className="text-sm text-slate-700 dark:text-slate-200">{out}</p></Card>}
    </div>
  );
}

// ============================================================================
// App + routing + guards
// ============================================================================
function RoleGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const { state } = useAuth();
  if (state.loading) return <Loader label="Loading…" />;
  if (!state.user) return <Navigate to="/login" replace />;
  if (state.user.role !== role) {
    const dest = state.user.role === "ADMIN" ? "/admin" : state.user.role === "TEACHER" ? "/teacher" : "/student";
    return <Navigate to={dest} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/admin" element={<RoleGuard role="ADMIN"><AdminShell /></RoleGuard>}>
        <Route index element={<AdminDashboard />} />
        <Route path="ai-intelligence" element={<AdminIntelligence />} />
        <Route path="admissions" element={<AdminAdmissions />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="students" element={<AdminStudents />} />
        <Route path="teachers" element={<AdminTeachers />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="examinations" element={<AdminExaminations />} />
        <Route path="results" element={<AdminResults />} />
        <Route path="fees" element={<AdminFees />} />
        <Route path="timetables" element={<AdminTimetables />} />
        <Route path="materials" element={<AdminMaterials />} />
        <Route path="notices" element={<AdminNotices />} />
        <Route path="sessions" element={<AdminSessions />} />
        <Route path="promotions" element={<AdminPromotions />} />
        <Route path="complaints" element={<AdminComplaints />} />
        <Route path="campus-map" element={<AdminCampusMap />} />
        <Route path="analytics" element={<AdminAnalytics />} />
      </Route>

      <Route path="/teacher" element={<RoleGuard role="TEACHER"><TeacherShell /></RoleGuard>}>
        <Route index element={<TeacherDashboard />} />
        <Route path="classes" element={<TeacherClasses />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="marks" element={<TeacherMarks />} />
        <Route path="materials" element={<TeacherMaterials />} />
        <Route path="heatmap" element={<TeacherHeatmap />} />
        <Route path="syllabus" element={<TeacherSyllabus />} />
        <Route path="copilot" element={<TeacherCopilot />} />
        <Route path="assessment" element={<TeacherAssessment />} />
        <Route path="messages" element={<TeacherMessages />} />
        <Route path="support" element={<TeacherSupport />} />
        <Route path="classroom" element={<TeacherClassroom />} />
      </Route>

      <Route path="/student" element={<RoleGuard role="STUDENT"><StudentShell /></RoleGuard>}>
        <Route index element={<StudentDashboard />} />
        <Route path="attendance" element={<StudentAttendance />} />
        <Route path="results" element={<StudentResults />} />
        <Route path="fees" element={<StudentFees />} />
        <Route path="materials" element={<StudentMaterials />} />
        <Route path="timetable" element={<StudentTimetable />} />
        <Route path="study-companion" element={<StudentStudyCompanion />} />
        <Route path="exam-simulator" element={<StudentExamSimulator />} />
        <Route path="passport" element={<StudentPassport />} />
        <Route path="projects" element={<StudentProjects />} />
        <Route path="reservations" element={<StudentReservations />} />
        <Route path="career" element={<StudentCareer />} />
        <Route path="timeline" element={<StudentTimeline />} />
        <Route path="identity" element={<StudentIdentity />} />
      </Route>

      <Route path="/settings" element={<RoleGuard role="ADMIN"><AdminShell /></RoleGuard>}>
        <Route index element={<Settings />} />
      </Route>
      <Route path="/campus-agent" element={<CampusAgent />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

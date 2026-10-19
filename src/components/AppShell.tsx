import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Activity,
  Building2,
  BrainCircuit,
  FlaskConical,
  History,
  Bell,
  User,
  Settings,
  HelpCircle,
  Menu,
  X,
  Wind,
  Sun,
  Moon,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BackendBadge } from "@/components/aq";
import { api, type SystemHealth, type AlertsSummary } from "@/lib/api";

const NAV = [
  { to: "/", label: "Home Dashboard", icon: LayoutDashboard },
] as const;

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, setDark };
}

interface AppShellProps {
  children: ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function AppShell({ children, activeTab, onTabChange }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { dark, setDark } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [alertSummary, setAlertSummary] = useState<AlertsSummary | null>(null);

  useEffect(() => {
    api
      .getHealth()
      .then(setHealth)
      .catch(() => {
        setHealth({
          status: "offline",
          service: "AirPurify AI",
          version: "1.0.0",
          aqi_standard: "CPCB",
          database: {
            connected: false,
            type: "disconnected",
            db_name: "airpurify_ai",
            details: "Backend unreachable",
          },
          models: {
            indoor_outdoor_classifier: {
              configured: false,
              status: "model_not_configured",
              version: "none",
              path: "",
            },
            aqi_forecaster_1d_cnn_bigru: {
              configured: false,
              status: "model_not_configured",
              version: "none",
              path: "",
            },
          },
        });
      });

    api
      .getAlertsSummary()
      .then(setAlertSummary)
      .catch(() => {});
  }, [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-shell text-shell-foreground">
      <div className="flex h-14 items-center gap-2.5 border-b border-shell-border px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Wind className="size-4" />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-display text-sm font-bold tracking-tight">AirPurify AI</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
        {onTabChange ? (
          <>
            <button
              type="button"
              onClick={() => {
                onTabChange("overview");
                setMobileOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all cursor-pointer text-left",
                activeTab !== "simulator"
                  ? "bg-shell-accent font-semibold text-shell-foreground shadow-inner"
                  : "text-shell-muted hover:bg-shell-accent/60 hover:text-shell-foreground",
              )}
              title="Home Dashboard"
            >
              <LayoutDashboard className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">Home Dashboard</span>}
            </button>
            <button
              type="button"
              onClick={() => {
                onTabChange("simulator");
                setMobileOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all cursor-pointer text-left",
                activeTab === "simulator"
                  ? "bg-shell-accent font-semibold text-shell-foreground shadow-inner"
                  : "text-shell-muted hover:bg-shell-accent/60 hover:text-shell-foreground",
              )}
              title="Classifier Simulator"
            >
              <BrainCircuit className="size-4 shrink-0 text-primary" />
              {!collapsed && <span className="truncate">Classifier Simulator</span>}
            </button>
          </>
        ) : (
          NAV.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all",
                  active
                    ? "bg-shell-accent font-semibold text-shell-foreground shadow-inner"
                    : "text-shell-muted hover:bg-shell-accent/60 hover:text-shell-foreground",
                )}
                title={label}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })
        )}
      </nav>

      {!collapsed && (
        <div className="border-t border-shell-border p-3 text-[10px] leading-relaxed text-shell-muted">
          <p className="font-medium text-shell-foreground">AirPurify AI Environmental Intelligence</p>
          <p className="mt-0.5">CPCB NAQI · Random Forest ML · IoT PMS7003 Telemetry</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 transition-all duration-200 md:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 backdrop-blur-sm">
          <button
            className="rounded-md p-2 hover:bg-accent md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </button>
          <button
            className="hidden rounded-md p-2 hover:bg-accent md:block text-muted-foreground hover:text-foreground"
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Collapse sidebar"
          >
            {collapsed ? <Menu className="size-4" /> : <X className="size-4" />}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:inline">
              Standard:
            </span>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {health?.aqi_standard || "CPCB"} NAQI
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <BackendBadge
              connected={health?.database.connected ?? false}
              type={health?.database.type}
            />

            <button
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => setDark(!dark)}
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>

            <div
              className="flex size-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary select-none"
              title="AirPurify AI Session"
            >
              AP
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 bg-background/50">
          {children}
        </main>
      </div>
    </div>
  );
}

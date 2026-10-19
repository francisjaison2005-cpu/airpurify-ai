import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { TrendingUp, TrendingDown, Minus, Database, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface AqiBadgeInfo {
  category: string;
  hex: string;
}

export function getAqiCategoryInfo(aqi: number): AqiBadgeInfo {
  if (aqi <= 50) return { category: "Good", hex: "#22b573" };
  if (aqi <= 100) return { category: "Satisfactory", hex: "#7cb342" };
  if (aqi <= 200) return { category: "Moderate", hex: "#d9a81c" };
  if (aqi <= 300) return { category: "Poor", hex: "#e08a1e" };
  if (aqi <= 400) return { category: "Very Poor", hex: "#d9542b" };
  return { category: "Severe", hex: "#8a2f22" };
}

export function AqiBadge({ aqi, className }: { aqi: number; className?: string }) {
  const info = getAqiCategoryInfo(aqi);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      style={{ backgroundColor: `${info.hex}22`, color: info.hex }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: info.hex }} />
      {info.category}
    </span>
  );
}

export function BackendBadge({
  connected,
  type,
  className,
}: {
  connected: boolean;
  type?: string | undefined;
  className?: string | undefined;
}) {
  const isAtlas = type === "mongodb_atlas";
  const isLocal = type === "mongodb_standalone";
  const isMock = type === "mongomock_fallback";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border",
        connected
          ? isAtlas || isLocal
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-sky-500/30 bg-sky-500/10 text-sky-400"
          : "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
      title={
        connected
          ? isAtlas
            ? "Connected to MongoDB Atlas Primary Cluster"
            : isLocal
              ? "Connected to Local MongoDB Server (Port 27017)"
              : "Running on Mock DB Fallback (MongoDB offline)"
          : "Database connection offline"
      }
    >
      <Database className="size-3" />
      {connected
        ? isAtlas
          ? "MongoDB Atlas"
          : isLocal
            ? "MongoDB Local"
            : "MongoDB (Mock Mode)"
        : "DB Disconnected"}
    </span>
  );
}

export function StatusDot({
  status,
}: {
  status: "online" | "delayed" | "offline" | "maintenance";
}) {
  const map = {
    online: { c: "var(--aqi-good)", label: "Online" },
    delayed: { c: "var(--warning)", label: "Delayed" },
    offline: { c: "var(--aqi-unhealthy)", label: "Offline" },
    maintenance: { c: "var(--ai)", label: "Maintenance" },
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full" style={{ backgroundColor: map.c }} />
      {map.label}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function KpiCard({
  title,
  value,
  unit,
  badge,
  trend,
  spark,
  tooltip,
  to,
}: {
  title: string;
  value: string;
  unit?: string;
  badge?: ReactNode;
  trend?: number;
  spark?: number[];
  tooltip: string;
  to?: string;
}) {
  const body = (
    <Card className="h-full transition-all hover:shadow-md hover:border-primary/40">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          {badge}
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="font-display text-2xl font-semibold text-foreground">{value}</span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {typeof trend === "number" ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                trend > 0
                  ? "text-aqi-unhealthy"
                  : trend < 0
                    ? "text-aqi-good"
                    : "text-muted-foreground",
              )}
            >
              {trend > 0 ? (
                <TrendingUp className="size-3" />
              ) : trend < 0 ? (
                <TrendingDown className="size-3" />
              ) : (
                <Minus className="size-3" />
              )}
              {Math.abs(trend)}% vs prev. period
            </span>
          ) : (
            <span />
          )}
          {spark && <Sparkline data={spark} />}
        </div>
      </CardContent>
    </Card>
  );
  const wrapped = to ? <Link to={to}>{body}</Link> : body;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="h-full">{wrapped}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Sparkline({ data, color = "var(--primary)" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const w = 72;
  const h = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/40 p-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mb-3">
        <AlertCircle className="size-6 text-muted-foreground/80" />
      </div>
      <p className="text-base font-semibold text-foreground">{title}</p>
      {hint && (
        <p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">{hint}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

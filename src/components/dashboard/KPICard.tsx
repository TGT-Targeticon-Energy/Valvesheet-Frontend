import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: "up" | "down";
    label: string;
  };
  variant?: "primary" | "validated" | "accent" | "assumption";
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "primary",
}: KPICardProps) {
  const variantClasses = {
    primary: "kpi-card-primary",
    validated: "kpi-card-validated",
    accent: "kpi-card-accent",
    assumption: "kpi-card-assumption",
  };

  const iconBgClasses = {
    primary: "bg-primary/10 text-primary",
    validated: "bg-validated-bg text-validated",
    accent: "bg-accent/10 text-accent",
    assumption: "bg-assumption-bg text-assumption",
  };

  return (
    <div
      className={cn(
        "kpi-card bg-card border border-border rounded-lg p-5 shadow-kpi hover:shadow-panel-hover transition-shadow",
        variantClasses[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {title}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1.5 mt-2">
              {trend.direction === "up" ? (
                <TrendingUp className="w-4 h-4 text-validated" />
              ) : (
                <TrendingDown className="w-4 h-4 text-conflict" />
              )}
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.direction === "up" ? "text-validated" : "text-conflict"
                )}
              >
                {trend.value}%
              </span>
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex items-center justify-center w-11 h-11 rounded-lg",
            iconBgClasses[variant]
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

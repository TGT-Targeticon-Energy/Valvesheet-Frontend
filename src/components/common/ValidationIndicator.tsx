import { Check, AlertTriangle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ValidationType = "validated" | "assumption" | "conflict" | "info";

interface ValidationIndicatorProps {
  type: ValidationType;
  message?: string;
  source?: string;
  standard?: string;
  size?: "sm" | "md";
}

const config: Record<ValidationType, { icon: typeof Check; className: string; label: string }> = {
  validated: {
    icon: Check,
    className: "validation-validated",
    label: "Validated",
  },
  assumption: {
    icon: AlertTriangle,
    className: "validation-assumption",
    label: "Assumption",
  },
  conflict: {
    icon: X,
    className: "validation-conflict",
    label: "Conflict",
  },
  info: {
    icon: Info,
    className: "bg-primary/10 text-primary border border-primary/20",
    label: "Info",
  },
};

export function ValidationIndicator({ type, message, source, standard, size = "sm" }: ValidationIndicatorProps) {
  const { icon: Icon, className, label } = config[type];
  const sizeClasses = size === "sm" ? "w-5 h-5" : "w-6 h-6";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";

  const indicator = (
    <div className={cn("inline-flex items-center justify-center rounded", className, sizeClasses)}>
      <Icon className={iconSize} />
    </div>
  );

  if (!message && !source && !standard) {
    return indicator;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="cursor-help">{indicator}</button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <div className="space-y-1.5">
          <p className="font-medium text-sm">{label}</p>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
          /*{" "}
          {source && (
            <p className="text-xs">
              <span className="text-muted-foreground">Source:</span> <span className="font-mono">{source}</span>
            </p>
          )}{" "}
          */
          {standard && (
            <p className="text-xs">
              <span className="text-muted-foreground">Standard:</span> <span className="font-mono">{standard}</span>
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

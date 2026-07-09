import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PanelProps {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Panel({ title, description, children, actions, className }: PanelProps) {
  return (
    <div className={cn("panel-section", className)}>
      <div className="panel-header flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="panel-content">{children}</div>
    </div>
  );
}

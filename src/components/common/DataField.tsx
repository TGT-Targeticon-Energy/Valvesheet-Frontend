import { ValidationIndicator } from "./ValidationIndicator";
import { cn } from "@/lib/utils";
import { Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataFieldProps {
  label: string;
  value: string | number;
  unit?: string;
  validation?: {
    type: "validated" | "assumption" | "conflict";
    message?: string;
    source?: string;
    standard?: string;
  };
  autoFilled?: boolean;
  editable?: boolean;
  onEdit?: () => void;
}

export function DataField({
  label,
  value,
  unit,
  validation,
  autoFilled = false,
  editable = false,
  onEdit,
}: DataFieldProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 px-3 rounded",
        autoFilled ? "field-auto-filled" : "field-manual"
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="font-mono text-sm font-medium text-foreground">
            {value}
          </span>
          {unit && (
            <span className="text-xs text-muted-foreground">{unit}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {validation && (
          <ValidationIndicator
            type={validation.type}
            message={validation.message}
            source={validation.source}
            standard={validation.standard}
          />
        )}
        {editable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onEdit}
          >
            <Edit2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

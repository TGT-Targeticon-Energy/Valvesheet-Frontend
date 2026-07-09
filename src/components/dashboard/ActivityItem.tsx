import { StatusBadge } from "./StatusBadge";
import { Clock } from "lucide-react";

interface ActivityItemProps {
  tagNumber: string;
  description: string;
  status: "draft" | "generated" | "approved" | "pending" | "conflict";
  timestamp: string;
  user: string;
}

export function ActivityItem({
  tagNumber,
  description,
  status,
  timestamp,
  user,
}: ActivityItemProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-medium text-foreground">
            {tagNumber}
          </span>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 truncate">
          {description}
        </p>
      </div>
      <div className="flex flex-col items-end ml-4">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{timestamp}</span>
        </div>
        <span className="text-xs text-muted-foreground mt-0.5">{user}</span>
      </div>
    </div>
  );
}

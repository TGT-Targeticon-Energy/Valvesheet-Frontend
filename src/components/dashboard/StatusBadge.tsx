import { cn } from "@/lib/utils";

type StatusType = "draft" | "generated" | "approved" | "pending" | "conflict";

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "status-draft",
  },
  generated: {
    label: "Generated",
    className: "status-generated",
  },
  approved: {
    label: "Approved",
    className: "status-approved",
  },
  pending: {
    label: "Pending Review",
    className: "status-pending",
  },
  conflict: {
    label: "Has Conflicts",
    className: "bg-conflict-bg text-conflict",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className={cn("status-badge", config.className, className)}>
      {config.label}
    </span>
  );
}

/**
 * Legacy entry point — the monolithic Generate Valvesheet page has been
 * split into three routed pages:
 *
 *   /valvesheet-workflow        → ValvesheetListPage    (table + filters)
 *   /valvesheet-workflow/new    → ValvesheetCreatePage  (new valvesheet form)
 *   /valvesheet-workflow/:id    → ValvesheetDetailPage  (revisions + signatures)
 *
 * This stub keeps the old import path working if anything still references
 * `ValvesheetWorkflowPage`, by redirecting to the list page.
 */
import { Navigate } from "react-router-dom";

export default function ValvesheetWorkflowPage() {
  return <Navigate to="/valvesheet-workflow" replace />;
}

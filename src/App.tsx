import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
// Route guards use ACCESS LEVEL (admin-managed) rather than role_code.
// Access level → page mapping:
//   Admin    → everything (incl. /admin, /projects)
//   Reviewer → /valvesheet-workflow, dashboard
//   Creator  → /agent, /valvesheet-workflow, dashboard
//   Viewer   → dashboard only
//
// Legacy pages removed in the unified-workflow cleanup:
//   /approval, /downloads, /generator, /revision, /assistant, /bulk-assistant
// The Generate Valvesheet page is now the single source of truth for
// revision + signature handling. The Valve AI Agent stays but its
// "save to workflow" button feeds into the same VSW system.

// Pages
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import AutomationPage from "./pages/AutomationPage";
import PreviewPage from "./pages/PreviewPage";
import StandardsPage from "./pages/StandardsPage";
import ValidationPage from "./pages/ValidationPage";
import ValvesheetListPage from "./pages/ValvesheetListPage";
import ValvesheetCreatePage from "./pages/ValvesheetCreatePage";
import ValvesheetDetailPage from "./pages/ValvesheetDetailPage";
import AdminPage from "./pages/AdminPage";
import ProjectMasterPage from "./pages/ProjectMasterPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";
import AgentChatPage from "./pages/AgentChatPage";
import PMSAgentPage from "./pages/PMSAgentPage";
import PMSGeneratorPage from "./pages/PMSGeneratorPage";
import PMSWorkflowListPage from "./pages/PMSWorkflowListPage";
import PMSWorkflowCreatePage from "./pages/PMSWorkflowCreatePage";
import PMSWorkflowDetailPage from "./pages/PMSWorkflowDetailPage";

import ProjectsPage from "./pages/ProjectMasterPage";
import Administration from "./pages/AdminPage";
import DatabaseExplorerPage from "./pages/DatabaseExplorerPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Public to all authenticated users (incl. Viewer) */}
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<ProfilePage />} />

              {/* Generate Valvesheet — split into three pages:
                    • list   /valvesheet-workflow
                    • create /valvesheet-workflow/new
                    • detail /valvesheet-workflow/:id
                  Replaces /approval, /downloads, /generator, /revision. */}
              <Route
                path="/valvesheet-workflow"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Reviewer", "Creator"]}>
                    <ValvesheetListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/valvesheet-workflow/new"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Creator"]}>
                    <ValvesheetCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/valvesheet-workflow/:id"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Reviewer", "Creator"]}>
                    <ValvesheetDetailPage />
                  </ProtectedRoute>
                }
              />

              {/* Valve AI Agent — Admin + Creator only.
                  Now feeds into the Generate Valvesheet via "Save to Workflow"
                  button on each generated datasheet card. */}
              <Route
                path="/agent"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Creator"]}>
                    <AgentChatPage />
                  </ProtectedRoute>
                }
              />

              {/* PMS generators — Admin + Creator */}
              <Route
                path="/PMS_generator"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Creator"]}>
                    <PMSGeneratorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pms-agent"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Creator"]}>
                    <PMSAgentPage />
                  </ProtectedRoute>
                }
              />

              {/* Generate PMS Datasheet — three pages mirroring the
                  Valvesheet pattern: list / create / detail. */}
              <Route
                path="/pms-workflow"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Reviewer", "Creator"]}>
                    <PMSWorkflowListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pms-workflow/new"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Creator"]}>
                    <PMSWorkflowCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pms-workflow/:id"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Reviewer", "Creator"]}>
                    <PMSWorkflowDetailPage />
                  </ProtectedRoute>
                }
              />

              {/* Internal / diagnostic tools */}
              <Route
                path="/automation"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Creator"]}>
                    <AutomationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/preview"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Reviewer", "Creator"]}>
                    <PreviewPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/standards"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Reviewer", "Creator"]}>
                    <StandardsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/validation"
                element={
                  <ProtectedRoute requiredAccess={["Admin", "Reviewer", "Creator"]}>
                    <ValidationPage />
                  </ProtectedRoute>
                }
              />

              {/* Admin-only */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredAccess="Admin">
                    <Administration />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects"
                element={
                  <ProtectedRoute requiredAccess="Admin">
                    <ProjectsPage />
                  </ProtectedRoute>
                }
              />

              {/* Hidden admin diagnostic — Admin only, deep-link only */}
              <Route
                path="/database"
                element={
                  <ProtectedRoute requiredAccess="Admin">
                    <DatabaseExplorerPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

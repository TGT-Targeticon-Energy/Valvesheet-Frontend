import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/layout/AppHeader";
import { authService } from "@/services/authService";

const API_BASE_URL = import.meta.env.VITE_USER_MGMT_API;

if (!API_BASE_URL || API_BASE_URL.trim() === "") {
  console.error("❌ VITE_USER_MGMT_API is not configured! Check your .env file.");
}

interface Project {
  project_id: string;
  project_name: string;
  sap_project_code: string;
  client_name: string;
  contract_type: string;
  field_name: string;
  location: string;
  remarks: string;
  created_date: string;
  is_active: boolean;
}

const EMPTY_FORM = {
  project_id: "",
  project_name: "",
  sap_project_code: "",
  client_name: "",
  contract_type: "",
  field_name: "",
  location: "",
  remarks: "",
};

export default function ProjectMasterPage() {
  const { user, userRole } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const canManageProjects =
    userRole?.role_code === "ENG_ADMIN" ||
    userRole?.role_code === "PROJECT_MGR";

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authService.authenticatedFetch(`${API_BASE_URL}/projects`);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.detail || `Failed to fetch projects (${response.status})`);
      }

      const data = await response.json();
      setProjects(data);
    } catch (err: any) {
      console.error("Error fetching projects:", err);
      setError(err.message || "Failed to load projects. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getNextProjectId = (): string => {
    const prefix = "FPSO-";
    const numbers = projects
      .map((project) => project.project_id)
      .filter((projectId) => projectId && projectId.startsWith(prefix))
      .map((projectId) => parseInt(projectId.slice(prefix.length), 10))
      .filter((value) => !Number.isNaN(value));

    const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
    return `${prefix}${String(next).padStart(3, "0")}`;
  };

  const handleCreateProject = async () => {
    try {
      setSubmitting(true);
      setSubmitError(null);

      const response = await authService.authenticatedFetch(`${API_BASE_URL}/projects`, {
        method: "POST",
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.detail || `Failed to create project (${response.status})`);
      }

      setIsCreateDialogOpen(false);
      setFormData(EMPTY_FORM);
      fetchProjects();
    } catch (err: any) {
      console.error("Error creating project:", err);
      setSubmitError(err.message || "Failed to create project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject) return;

    try {
      setSubmitting(true);
      setSubmitError(null);

      const response = await authService.authenticatedFetch(
        `${API_BASE_URL}/projects/${editingProject.project_id}`,
        {
          method: "PUT",
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.detail || `Failed to update project (${response.status})`);
      }

      setEditingProject(null);
      setFormData(EMPTY_FORM);
      fetchProjects();
    } catch (err: any) {
      console.error("Error updating project:", err);
      setSubmitError(err.message || "Failed to update project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!editingProject) return;

    try {
      setDeleteSubmitting(true);
      setSubmitError(null);

      const response = await authService.authenticatedFetch(
        `${API_BASE_URL}/projects/${editingProject.project_id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok && response.status !== 204) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.detail || `Failed to delete project (${response.status})`);
      }

      setEditingProject(null);
      setFormData(EMPTY_FORM);
      fetchProjects();
    } catch (err: any) {
      console.error("Error deleting project:", err);
      setSubmitError(err.message || "Failed to delete project. Please try again.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openEditDialog = (project: Project) => {
    setEditingProject(project);
    setSubmitError(null);
    setFormData({
      project_id: project.project_id,
      project_name: project.project_name,
      sap_project_code: project.sap_project_code,
      client_name: project.client_name,
      contract_type: project.contract_type,
      field_name: project.field_name,
      location: project.location,
      remarks: project.remarks,
    });
  };

  const closeEditDialog = () => {
    setEditingProject(null);
    setFormData(EMPTY_FORM);
    setSubmitError(null);
  };

  const openCreateDialog = () => {
    setFormData({ ...EMPTY_FORM, project_id: getNextProjectId() });
    setSubmitError(null);
    setIsCreateDialogOpen(true);
  };

  const ProjectForm = (
    <div className="space-y-4">
      <Input
        placeholder="Project ID"
        value={formData.project_id}
        disabled
        onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
      />
      <Input
        placeholder="Project Name"
        value={formData.project_name}
        onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
      />
      <Input
        placeholder="SAP Project Code"
        value={formData.sap_project_code}
        onChange={(e) => setFormData({ ...formData, sap_project_code: e.target.value })}
      />
      <Input
        placeholder="Client Name"
        value={formData.client_name}
        onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
      />
      <Input
        placeholder="Contract Type (e.g., EPIC, EPC, O&M)"
        value={formData.contract_type}
        onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
      />
      <Input
        placeholder="Field Name"
        value={formData.field_name}
        onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
      />
      <Input
        placeholder="Location"
        value={formData.location}
        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
      />
      <Input
        placeholder="Remarks"
        value={formData.remarks}
        onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
      />
      {submitError && (
        <p className="text-sm text-red-600">{submitError}</p>
      )}
      <div className="flex flex-col md:flex-row gap-2">
        <Button
          onClick={editingProject ? handleUpdateProject : handleCreateProject}
          className="flex-1"
          disabled={submitting || deleteSubmitting}
        >
          {submitting
            ? editingProject ? "Saving..." : "Creating..."
            : editingProject ? "Save Changes" : "Create Project"}
        </Button>
        {editingProject && (
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeleteProject}
            disabled={submitting || deleteSubmitting}
            className="flex-1"
          >
            {deleteSubmitting ? "Deleting..." : "Delete Project"}
          </Button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        <AppHeader
          title="Project Master"
          breadcrumbs={[{ label: "FPSO Prosperity", href: "/" }, { label: "Project Master" }]}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-lg text-gray-500">Loading projects...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        <AppHeader
          title="Project Master"
          breadcrumbs={[{ label: "FPSO Prosperity", href: "/" }, { label: "Project Master" }]}
        />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-red-600">{error}</p>
          <Button onClick={fetchProjects}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <AppHeader
        title="Project Master"
        breadcrumbs={[{ label: "FPSO Prosperity", href: "/" }, { label: "Project Master" }]}
      />

      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Project Master</h1>
          {/* <p className="text-sm text-gray-600 mt-1">
            Manage all FPSO and engineering projects
          </p> */}
        </div>
        {canManageProjects && (
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={(open) => {
              if (!open) { setIsCreateDialogOpen(false); setSubmitError(null); }
              else openCreateDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={openCreateDialog}>
                <Plus className="w-4 h-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Add a new project to the system</DialogDescription>
              </DialogHeader>
              {ProjectForm}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Projects ({projects.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project ID</TableHead>
                  <TableHead>Project Name</TableHead>
                  <TableHead>Project Code</TableHead>
                  {/* <TableHead>Client</TableHead>
                  <TableHead>Contract Type</TableHead>
                  <TableHead>Location</TableHead> */}
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                      No projects found.
                    </TableCell>
                  </TableRow>
                ) : (
                  projects.map((project) => (
                    <TableRow key={project.project_id}>
                      <TableCell className="font-medium">{project.project_id}</TableCell>
                      <TableCell>{project.project_name}</TableCell>
                      <TableCell className="text-sm">{project.sap_project_code}</TableCell>
                      {/* <TableCell>{project.client_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{project.contract_type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{project.location}</TableCell> */}
                      <TableCell>
                        <Badge variant={project.is_active ? "default" : "secondary"}>
                          {project.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedProject(project)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canManageProjects && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(project)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* View Project Details Dialog */}
      {selectedProject && (
        <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedProject.project_name}</DialogTitle>
              <DialogDescription>
                {selectedProject.project_id} • {selectedProject.sap_project_code}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Client Name</label>
                  <p className="mt-1">{selectedProject.client_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Contract Type</label>
                  <p className="mt-1">{selectedProject.contract_type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Field Name</label>
                  <p className="mt-1">{selectedProject.field_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Location</label>
                  <p className="mt-1">{selectedProject.location}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Remarks</label>
                <p className="mt-1 text-sm">{selectedProject.remarks || "—"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Created Date</label>
                <p className="mt-1 text-sm">
                  {new Date(selectedProject.created_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Project Dialog */}
      {editingProject && (
        <Dialog open={!!editingProject} onOpenChange={closeEditDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
              <DialogDescription>
                Editing: {editingProject.project_name}
              </DialogDescription>
            </DialogHeader>
            {ProjectForm}
          </DialogContent>
        </Dialog>
      )}
        </div>
      </div>
    </div>
  );
}

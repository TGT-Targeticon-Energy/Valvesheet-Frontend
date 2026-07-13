/**
 * Admin Page
 * Administrative dashboard for system management
 */

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import {
  authService,
  User,
  FPSORole,
  CreateUserRequest,
  UpdateUserRequest,
  PasswordResetRequestItem,
} from "@/services/authService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AlertCircle, Users, Settings, BookOpen, Edit, Trash2, KeyRound } from "lucide-react";
import {
  ACCESS_LEVEL_OPTIONS,
  DISABLED_ACCESS_LEVELS,
} from "@/lib/roles";

interface LocalUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role_code: string;
  approval_limit_usd: number;
  is_active: boolean;
}

type NewUserForm = CreateUserRequest & {
  confirmPassword: string;
};

type EditUserForm = {
  first_name: string;
  last_name: string;
  email: string;
  department?: string;
  designation?: string;
  project_id?: string;
  role_code: string;
  access_level?: string;
  is_active: boolean;
};

const EMPTY_NEW_USER: NewUserForm = {
  user_id: "",
  first_name: "",
  last_name: "",
  email: "",
  role_code: "",
  access_level: "Viewer",
  password: "",
  confirmPassword: "",
  department: "",
  designation: "",
  project_id: "",
};

const AdminPage = () => {
  const [currentUser, setCurrentUser] = useState<LocalUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<FPSORole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>(EMPTY_NEW_USER);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequestItem[]>([]);
  const [resolvingRequest, setResolvingRequest] = useState<PasswordResetRequestItem | null>(null);
  const [resolveNewPassword, setResolveNewPassword] = useState("");
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      setIsAdmin(false);
      setIsLoading(false);
      return;
    }

    try {
      const parsedUser: LocalUser = JSON.parse(storedUser);
      setCurrentUser(parsedUser);

      if ((parsedUser.role_code ?? "").toUpperCase() === "ENG_ADMIN") {
        setIsAdmin(true);
        void loadData();
      } else {
        setIsAdmin(false);
        setIsLoading(false);
      }
    } catch {
      console.error("Invalid user in localStorage");
      setIsAdmin(false);
      setIsLoading(false);
    }
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError("");

    try {
      const [usersData, rolesData, resetRequestsData] = await Promise.all([
        authService.getAllUsers(),
        authService.getRoles(),
        authService.listPasswordResetRequests().catch(() => []),
      ]);

      setUsers(usersData || []);
      setRoles(rolesData || []);
      setResetRequests(resetRequestsData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const openResolveRequest = (request: PasswordResetRequestItem) => {
    setResolvingRequest(request);
    setResolveNewPassword("");
    setResolveNotes("");
    setResolveError(null);
  };

  const closeResolveRequest = () => {
    setResolvingRequest(null);
    setResolveNewPassword("");
    setResolveNotes("");
    setResolveError(null);
    setResolveSubmitting(false);
  };

  const handleResolveRequest = async () => {
    if (!resolvingRequest) return;
    setResolveSubmitting(true);
    setResolveError(null);
    try {
      await authService.resolvePasswordResetRequest(resolvingRequest.id, {
        new_password: resolveNewPassword || undefined,
        notes: resolveNotes || undefined,
      });
      await loadData();
      closeResolveRequest();
    } catch (err) {
      setResolveError(
        err instanceof Error ? err.message : "Failed to resolve request. Please try again."
      );
    } finally {
      setResolveSubmitting(false);
    }
  };

  const handleOpenCreateUser = () => {
    setNewUser(EMPTY_NEW_USER);
    setSubmitError(null);
    setIsCreateDialogOpen(true);
  };

  const handleCreateUser = async () => {
    if (!newUser.user_id || !newUser.first_name || !newUser.last_name || !newUser.email || !newUser.role_code) {
      setSubmitError("User ID, name, email and role are required.");
      return;
    }
    if (!newUser.password || !newUser.confirmPassword) {
      setSubmitError("Password and confirm password are required.");
      return;
    }
    if (newUser.password !== newUser.confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    const payload: CreateUserRequest = {
      user_id: newUser.user_id.trim(),
      first_name: newUser.first_name.trim(),
      last_name: newUser.last_name.trim(),
      email: newUser.email.trim().toLowerCase(),
      role_code: newUser.role_code,
      access_level: newUser.access_level || "Viewer",
      password: newUser.password,
      department: newUser.department || undefined,
      designation: newUser.designation || undefined,
      project_id: newUser.project_id || undefined,
    };

    try {
      setSubmitting(true);
      setSubmitError(null);
      await authService.createUser(payload);
      setIsCreateDialogOpen(false);
      setNewUser(EMPTY_NEW_USER);
      await loadData();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create user. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setEditError(null);
    setEditForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      department: user.department,
      designation: user.designation,
      project_id: user.project_id,
      role_code: user.role_code,
      access_level: user.access_level ?? "Viewer",
      is_active: user.is_active,
    });
  };

  const closeEditUser = () => {
    setEditingUser(null);
    setEditForm(null);
    setEditError(null);
    setEditSubmitting(false);
  };

  const handleUpdateUser = async () => {
    if (!editingUser || !editForm) return;

    if (!editForm.first_name || !editForm.last_name || !editForm.email) {
      setEditError("First name, last name and email are required.");
      return;
    }

    const payload: UpdateUserRequest = {
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      email: editForm.email.trim().toLowerCase(),
      department: editForm.department || undefined,
      designation: editForm.designation || undefined,
      project_id: editForm.project_id || undefined,
      role_code: editForm.role_code,
      access_level: editForm.access_level || "Viewer",
      is_active: editForm.is_active,
    };

    try {
      setEditSubmitting(true);
      setEditError(null);
      await authService.updateUser(editingUser.user_id, payload);
      await loadData();
      closeEditUser();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update user. Please try again."
      );
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!editingUser) return;

    try {
      setDeleteSubmitting(true);
      setEditError(null);
      await authService.deleteUser(editingUser.user_id);
      await loadData();
      closeEditUser();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to delete user. Please try again."
      );
    } finally {
      setDeleteSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader title="Administration" breadcrumbs={[{ label: "Admin Panel" }]} />
        <div className="flex-1 overflow-auto p-6">
          <Alert variant="destructive" className="max-w-xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Only Engineering Admins can access the administration panel.
              <span className="block text-xs mt-1 opacity-70">
                Your current role: <strong>{currentUser?.role_code ?? "None"}</strong>
              </span>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title="Administration" breadcrumbs={[{ label: "Admin Panel" }]} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{users.length}</div>
                <p className="text-xs text-gray-500 mt-1">
                  {users.filter((user) => user.is_active).length} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Roles</CardTitle>
                <Settings className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roles.length}</div>
                <p className="text-xs text-gray-500 mt-1">role types configured</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <BookOpen className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {users.filter((user) => user.is_active).length}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {users.length > 0
                    ? ((users.filter((user) => user.is_active).length / users.length) * 100).toFixed(0)
                    : 0}
                  % of users
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>View and manage users and roles</CardDescription>
              </div>
              <Dialog
                open={isCreateDialogOpen}
                onOpenChange={(open) => {
                  setIsCreateDialogOpen(open);
                  if (!open) {
                    setSubmitError(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button onClick={handleOpenCreateUser} className="mt-2 md:mt-0">
                    New User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>
                      Add a new user account for your organisation.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                          User ID <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={newUser.user_id}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, user_id: e.target.value }))
                          }
                          placeholder="EMP001"
                          required
                          aria-required="true"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="email"
                          value={newUser.email}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, email: e.target.value }))
                          }
                          placeholder="user@spe.com"
                          required
                          aria-required="true"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={newUser.first_name}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, first_name: e.target.value }))
                          }
                          required
                          aria-required="true"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={newUser.last_name}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, last_name: e.target.value }))
                          }
                          required
                          aria-required="true"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                          Role <span className="text-red-500">*</span>
                        </label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={newUser.role_code}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, role_code: e.target.value }))
                          }
                          required
                          aria-required="true"
                        >
                          <option value="">Select role</option>
                          {roles.map((role) => (
                            <option key={role.role_code} value={role.role_code}>
                              {role.role_name} ({role.role_code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Access Level</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={newUser.access_level ?? "Creator"}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, access_level: e.target.value }))
                          }
                        >
                          {ACCESS_LEVEL_OPTIONS.map((opt) => {
                            const disabled = DISABLED_ACCESS_LEVELS.has(opt);
                            return (
                              <option key={opt} value={opt} disabled={disabled}>
                                {opt}{disabled ? " (disabled)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Department</label>
                        <Input
                          value={newUser.department ?? ""}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, department: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Designation</label>
                        <Input
                          value={newUser.designation ?? ""}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, designation: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">Project ID</label>
                      <Input
                        value={newUser.project_id ?? ""}
                        onChange={(e) =>
                          setNewUser((prev) => ({ ...prev, project_id: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                          Password <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="password"
                          value={newUser.password}
                          onChange={(e) =>
                            setNewUser((prev) => ({ ...prev, password: e.target.value }))
                          }
                          required
                          aria-required="true"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                          Confirm Password <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="password"
                          value={newUser.confirmPassword}
                          onChange={(e) =>
                            setNewUser((prev) => ({
                              ...prev,
                              confirmPassword: e.target.value,
                            }))
                          }
                          required
                          aria-required="true"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      <span className="text-red-500">*</span> Required fields
                    </p>
                    {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                    <Button onClick={handleCreateUser} disabled={submitting} className="w-full">
                      {submitting ? "Creating user..." : "Create User"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="users">
                <TabsList>
                  <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
                  <TabsTrigger value="reset-requests">
                    Password Reset Requests (
                    {resetRequests.filter((r) => r.status === "pending").length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="reset-requests">
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin h-8 w-8 border-b-2 border-amber-600 rounded-full" />
                    </div>
                  ) : resetRequests.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      No password reset requests.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left">Email</th>
                            <th className="px-4 py-3 text-left">Matched User</th>
                            <th className="px-4 py-3 text-left">Requested</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {resetRequests.map((req) => (
                            <tr key={req.id}>
                              <td className="px-4 py-3">{req.email}</td>
                              <td className="px-4 py-3">{req.user_id ?? "— no match —"}</td>
                              <td className="px-4 py-3">
                                {new Date(req.requested_at).toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`px-2 py-1 rounded text-xs ${
                                    req.status === "pending"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  {req.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {req.status === "pending" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => openResolveRequest(req)}
                                  >
                                    <KeyRound className="w-3 h-3" />
                                    Resolve
                                  </Button>
                                ) : (
                                  <span className="text-xs text-gray-500">
                                    by {req.resolved_by ?? "—"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="users">
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin h-8 w-8 border-b-2 border-amber-600 rounded-full" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left">Name</th>
                            <th className="px-4 py-3 text-left">Email</th>
                            <th className="px-4 py-3 text-left">Role</th>
                            <th className="px-4 py-3 text-left">Status</th>
                            <th className="px-4 py-3 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {users.map((user) => (
                            <tr key={user.user_id}>
                              <td className="px-4 py-3 font-medium">
                                {user.first_name} {user.last_name}
                              </td>
                              <td className="px-4 py-3">{user.email}</td>
                              <td className="px-4 py-3">{user.role_code}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`px-2 py-1 rounded text-xs ${
                                    user.is_active
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {user.is_active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => openEditUser(user)}
                                >
                                  <Edit className="w-3 h-3" />
                                  Edit
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {editingUser && editForm && (
            <Dialog open={!!editingUser} onOpenChange={(open) => !open && closeEditUser()}>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Edit User</DialogTitle>
                  <DialogDescription>
                    Update user details and project assignment.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={editForm.first_name}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, first_name: e.target.value } : prev
                          )
                        }
                        required
                        aria-required="true"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={editForm.last_name}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, last_name: e.target.value } : prev
                          )
                        }
                        required
                        aria-required="true"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="email"
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm((prev) => (prev ? { ...prev, email: e.target.value } : prev))
                      }
                      required
                      aria-required="true"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">Department</label>
                      <Input
                        value={editForm.department ?? ""}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, department: e.target.value } : prev
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">Designation</label>
                      <Input
                        value={editForm.designation ?? ""}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, designation: e.target.value } : prev
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">Project ID</label>
                      <Input
                        value={editForm.project_id ?? ""}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, project_id: e.target.value } : prev
                          )
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">
                        Role <span className="text-red-500">*</span>
                      </label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={editForm.role_code}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, role_code: e.target.value } : prev
                          )
                        }
                        required
                        aria-required="true"
                      >
                        {roles.map((role) => (
                          <option key={role.role_code} value={role.role_code}>
                            {role.role_name} ({role.role_code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">Access Level</label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={editForm.access_level ?? "Creator"}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, access_level: e.target.value } : prev
                          )
                        }
                      >
                        {ACCESS_LEVEL_OPTIONS.map((opt) => {
                          // When editing, allow keeping a disabled value if
                          // the user already had it (legacy data) — disable
                          // only re-selection of a different disabled level.
                          const isCurrent = (editForm.access_level ?? "") === opt;
                          const disabled = DISABLED_ACCESS_LEVELS.has(opt) && !isCurrent;
                          return (
                            <option key={opt} value={opt} disabled={disabled}>
                              {opt}{disabled ? " (disabled)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 self-end pb-2">
                      <input
                        type="checkbox"
                        checked={editForm.is_active}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, is_active: e.target.checked } : prev
                          )
                        }
                      />
                      Active
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="text-red-500">*</span> Required fields
                  </p>
                  {editError && <p className="text-sm text-red-600">{editError}</p>}
                  <div className="flex flex-col md:flex-row gap-2">
                    <Button
                      onClick={handleUpdateUser}
                      disabled={editSubmitting || deleteSubmitting}
                      className="flex-1"
                    >
                      {editSubmitting ? "Saving changes..." : "Save Changes"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDeleteUser}
                      disabled={editSubmitting || deleteSubmitting}
                      className="flex-1 flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      {deleteSubmitting ? "Deleting..." : "Delete User"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {resolvingRequest && (
            <Dialog open={!!resolvingRequest} onOpenChange={(open) => !open && closeResolveRequest()}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Resolve Password Reset Request</DialogTitle>
                  <DialogDescription>
                    {resolvingRequest.email}
                    {resolvingRequest.user_id
                      ? ` — matched user ${resolvingRequest.user_id}`
                      : " — no matching user account, cannot set a password"}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  {resolvingRequest.user_id && (
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">
                        New Password (optional)
                      </label>
                      <Input
                        type="password"
                        value={resolveNewPassword}
                        onChange={(e) => setResolveNewPassword(e.target.value)}
                        placeholder="Leave blank to just mark resolved"
                      />
                      <p className="text-xs text-gray-500">
                        Min 8 characters, with uppercase, lowercase, digit and special character.
                      </p>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
                    <Input
                      value={resolveNotes}
                      onChange={(e) => setResolveNotes(e.target.value)}
                      placeholder="e.g. Reset over phone call"
                    />
                  </div>
                  {resolveError && <p className="text-sm text-red-600">{resolveError}</p>}
                  <Button onClick={handleResolveRequest} disabled={resolveSubmitting} className="w-full">
                    {resolveSubmitting ? "Saving..." : "Mark Resolved"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;

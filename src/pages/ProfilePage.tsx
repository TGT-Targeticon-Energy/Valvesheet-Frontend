/**
 * Profile Page
 * Lets the logged-in user edit their own details and change their password.
 */

import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/services/authService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle } from "lucide-react";

const ProfilePage = () => {
  const { user, refreshUser } = useAuth();

  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    email: user?.email ?? "",
    designation: user?.designation ?? "",
    department: user?.department ?? "",
  });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  if (!user) return null;

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);

    if (!profileForm.first_name.trim() || !profileForm.last_name.trim() || !profileForm.email.trim()) {
      setProfileError("First name, last name and email are required.");
      return;
    }

    setProfileSubmitting(true);
    try {
      await authService.updateProfile({
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        email: profileForm.email.trim().toLowerCase(),
        designation: profileForm.designation.trim() || undefined,
        department: profileForm.department.trim() || undefined,
      });
      refreshUser();
      setProfileSuccess(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    const { current_password, new_password, confirm_password } = passwordForm;
    if (!current_password || !new_password || !confirm_password) {
      setPasswordError("All password fields are required.");
      return;
    }
    if (new_password !== confirm_password) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordSubmitting(true);
    try {
      const message = await authService.changePassword(current_password, new_password, confirm_password);
      setPasswordSuccess(message);
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AppHeader title="My Profile" breadcrumbs={[{ label: "Profile" }]} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
              <CardDescription>
                Update your name, email and work details. Role, access level and project
                assignment are managed by an administrator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={profileForm.first_name}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))
                      }
                      disabled={profileSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={profileForm.last_name}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))
                      }
                      disabled={profileSubmitting}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={profileSubmitting}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Designation</label>
                    <Input
                      value={profileForm.designation}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, designation: e.target.value }))
                      }
                      disabled={profileSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Department</label>
                    <Input
                      value={profileForm.department}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, department: e.target.value }))
                      }
                      disabled={profileSubmitting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
                  <div>
                    <span className="font-medium text-gray-700">Employee ID:</span> {user.user_id}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Role:</span> {user.role_code}
                  </div>
                </div>

                {profileError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{profileError}</AlertDescription>
                  </Alert>
                )}
                {profileSuccess && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>Profile updated successfully.</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" disabled={profileSubmitting}>
                  {profileSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                You'll need your current password to set a new one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Current Password</label>
                  <Input
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(e) =>
                      setPasswordForm((prev) => ({ ...prev, current_password: e.target.value }))
                    }
                    disabled={passwordSubmitting}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">New Password</label>
                    <Input
                      type="password"
                      value={passwordForm.new_password}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, new_password: e.target.value }))
                      }
                      disabled={passwordSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Confirm New Password</label>
                    <Input
                      type="password"
                      value={passwordForm.confirm_password}
                      onChange={(e) =>
                        setPasswordForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                      }
                      disabled={passwordSubmitting}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Min 8 characters, with an uppercase letter, lowercase letter, digit and special character.
                </p>

                {passwordError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}
                {passwordSuccess && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>{passwordSuccess}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" disabled={passwordSubmitting}>
                  {passwordSubmitting ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

# Authentication System Documentation

## Overview

The SPE-Valvesheet Frontend now includes a comprehensive authentication system with role-based access control. The system integrates with the User Management API running on port 8002.

## Key Features

### ✅ User Authentication
- Email-based login
- Session persistence using localStorage
- Automatic login state recovery on page reload

### ✅ Role-Based Access Control (RBAC)
- 8 predefined user roles
- Permission-based feature access
- Role-specific dashboards and UI elements

### ✅ Admin Panel
- User management (view all users)
- Role management (view all roles and permissions)
- System statistics

### ✅ Protected Routes
- Authentication required for all app pages
- Automatic redirection to login for unauthenticated users
- Permission-based page access restrictions

### ✅ User-Specific Pages
- Different dashboard layouts based on user role
- Role-specific feature access
- Admin-only pages and functions

## User Roles Available

| Role | Code | Can Create DS | Can Approve DS | Can Create PR | Can Approve PR | Can View Cost | Can Modify User | Use Case |
|------|------|---|---|---|---|---|---|---|
| **Engineering Admin** | ENG_ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Full system access, admin panel |
| **Piping Lead** | PIP_LEAD | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Lead piping datasheets, approvals |
| **Process Engineer** | PROC_ENG | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | Create process datasheets |
| **Mechanical Engineer** | MECH_ENG | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | Create mechanical datasheets |
| **Procurement Manager** | PROC_MGR | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | PR creation and approval |
| **QA Manager** | QA_MGR | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | QA approvals |
| **Project Manager** | PROJECT_MGR | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | Project-level approvals |
| **Viewer** | VIEW_ONLY | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Read-only access |

## File Structure

```
src/
├── contexts/
│   └── AuthContext.tsx          # Global authentication state
├── pages/
│   ├── LoginPage.tsx            # Login page with logo and demo users
│   ├── AdminPage.tsx            # Admin dashboard (ENG_ADMIN only)
│   └── Dashboard.tsx            # Role-based dashboard
├── components/
│   ├── ProtectedRoute.tsx       # Route protection wrapper
│   ├── RoleBasedDashboard.tsx   # Role-specific dashboard views
│   └── layout/
│       ├── TopNavBar.tsx        # User info and logout dropdown
│       └── AppLayout.tsx        # Main layout with nav
├── services/
│   └── authService.ts           # Authentication API calls
└── types/
    └── auth.ts                  # TypeScript type definitions
```

## Authentication Flow

### 1. Login Page
- User navigates to `/login`
- Enters email and password (or clicks demo user)
- System authenticates against User Management API
- On success: User stored in localStorage, redirected to dashboard

### 2. Protected Routes
- All app pages require login
- Unauthenticated users redirected to `/login`
- Routes check user permissions before rendering

### 3. Admin Panel
- Only accessible to `ENG_ADMIN` users
- Available at `/admin`
- Shows user list and role configuration
- Can manage system users and roles

### 4. Logout
- Click user dropdown → Logout
- Clears localStorage and auth state
- Redirects to `/login`

## Demo Users for Testing

The login page includes quick-fill buttons for demo users:

```
Email: eng.admin@spe.com          → ENG_ADMIN (Full Access)
Email: pip.lead@spe.com           → PIP_LEAD (Piping Lead)
Email: process.engineer@spe.com   → PROC_ENG (Process Engineer)
Email: mech.engineer@spe.com      → MECH_ENG (Mechanical Engineer)
```

**Password:** `demo123` (for any demo user)

## API Integration

### User Management API (Port 8002)

The authentication system connects to:

- **GET /api/users** - Get all users
- **GET /api/users/{user_id}** - Get user details
- **GET /api/roles** - Get all roles
- **GET /api/roles/{role_code}** - Get role details

### Environment Configuration

Set the User Management API URL in `.env`:

```env
VITE_USER_MGMT_API=http://localhost:8002/api
```

Or it defaults to `http://localhost:8002/api`

## Usage Examples

### Using Authentication Hook

```tsx
import { useAuth } from "@/contexts/AuthContext";

function MyComponent() {
  const { user, login, logout, hasPermission, isAuthenticated } = useAuth();

  // Check if user has permission
  if (hasPermission("can_create_ds")) {
    // Show datasheet creation UI
  }

  // Check if authenticated
  if (!isAuthenticated) {
    // Show login prompt
  }
}
```

### Protecting a Route

```tsx
<Route 
  path="/admin" 
  element={
    <ProtectedRoute>
      <AdminPage />
    </ProtectedRoute>
  }
/>
```

### Checking User Role

```tsx
const { userRole } = useAuth();

if (userRole?.role_code === "ENG_ADMIN") {
  // Show admin-only UI
}
```

## Components

### LoginPage.tsx
- Email/password form
- Logo display
- Demo user quick-fill buttons
- Error message display
- Loading states

### ProtectedRoute.tsx
- Wraps protected pages
- Checks authentication status
- Validates required permissions
- Handles unauthenticated redirects

### AdminPage.tsx
- User administration interface
- Role management dashboard
- System statistics
- User list with details
- Role permission matrix

### TopNavBar.tsx
- User profile dropdown
- Current role display
- Quick access to admin panel
- Logout button

### RoleBasedDashboard.tsx
- Conditional dashboard based on role
- Different cards/actions for each role
- Quick-access buttons to role-specific features

## Security Notes

### Current Implementation (Demo)
- Passwords not validated (for demo purposes)
- User authentication done against User Management API
- Session stored in localStorage (client-side)

### Production Recommendations
- Implement backend password validation
- Use JWT tokens for API calls
- Implement token refresh mechanism
- Use httpOnly cookies instead of localStorage
- Add CSRF protection
- Implement rate limiting on login

## Troubleshooting

### Login not working
1. Verify User Management API is running on port 8002
2. Check that user exists in database
3. Verify CORS is enabled on API
4. Check browser console for error messages

### Admin panel not visible
1. Confirm user role is `ENG_ADMIN`
2. Check that user roles loaded correctly
3. Verify API call to get user roles succeeded

### Session not persisting
1. Check localStorage is enabled in browser
2. Verify browser isn't in private/incognito mode
3. Check no extensions blocking localStorage

## Future Enhancements

- [ ] Two-factor authentication
- [ ] OAuth/SSO integration
- [ ] Better password management
- [ ] Permission editing in admin panel
- [ ] User role assignment UI
- [ ] Session expiry and refresh
- [ ] Audit logging
- [ ] Advanced user permissions

## Support

For issues or questions, contact the development team.

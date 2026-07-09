# 🎨 SPE-Valvesheet Frontend - Quick Start Guide

## 🚀 Get Started in 2 Minutes

### Prerequisites
- **Node.js** 18 or higher
- **User Management API** running on port 8002 (for authentication)

### Quick Setup

```bash
# 1. Navigate to frontend directory
cd SPE-Valvesheet-Frontend-Staging

# 2. Install dependencies (first time only)
npm install

# 3. Start development server
npm run dev

# ✅ Frontend is now running at http://localhost:8080
```

### Login Immediately
Click the **"Quick Login"** buttons on the login page:
- **ENG_ADMIN** → Full system access + Admin panel
- **PIP_LEAD** → Create & approve datasheets
- **PROC_ENG** → Create datasheets  
- **MECH_ENG** → Create datasheets

---

## 🔑 Authentication System

### What You Get
✅ **Professional Login Page** with logo  
✅ **Role-Based Dashboards** customized per user  
✅ **Admin Panel** for user & role management  
✅ **Protected Routes** - auto-redirect to login  
✅ **User Profile Dropdown** with logout  
✅ **Session Persistence** across page refreshes  

### How It Works

**1. User enters credentials at `/login`**
```
Email: eng.admin@spe.com
Password: demo123
```

**2. Click Demo User button or Login**
↓

**3. System fetches user from User Management API (8002)**
↓

**4. User stored in browser localStorage**
↓

**5. Redirects to `/` → Role-based dashboard displays**
↓

**6. Click user dropdown → Admin Panel, Profile, or Logout**

---

## 👥 Available Demo Users

### Full System Access
```
Email: eng.admin@spe.com
Password: demo123
Role: ENG_ADMIN 
Access: ✅ All features + Admin Panel
```

### Piping Lead
```
Email: pip.lead@spe.com
Password: demo123
Role: PIP_LEAD
Access: ✅ Create & approve datasheets, manage PRs
```

### Process Engineer (Datasheet Creator)
```
Email: process.engineer@spe.com
Password: demo123
Role: PROC_ENG
Access: ✅ Create datasheets only
```

### Mechanical Engineer (Datasheet Creator)
```
Email: mech.engineer@spe.com
Password: demo123
Role: MECH_ENG
Access: ✅ Create datasheets only
```

---

## 📍 Key Pages After Login

### Dashboard (`/`)
**Shows different content based on user role:**
- **ENG_ADMIN:** System stats + quick access to admin panel
- **PIP_LEAD:** Create datasheet, manage PRs, approval queue
- **Engineers:** Create datasheet, datasheet generator
- **VIEW_ONLY:** Read-only dashboards, reports only

### Admin Panel (`/admin`)
**ENG_ADMIN only:**
- View all users with details (email, SAP ID, approval limits)
- View all roles and their permissions
- System statistics

### Profile Dropdown
Click user name → Options:
- Profile (view user info)
- Admin Panel (if ENG_ADMIN)
- Logout (clears session)

---

## 🔧 Configuration

### Environment Variables (`.env`)

```env
# Main Backend API
VITE_API_URL=http://localhost:8000/api

# ML Prediction Service
VITE_ML_API_URL=http://localhost:8001/api

# User Management (Authentication)
VITE_USER_MGMT_API=http://localhost:8002/api
```

**Default values are already set** - no changes needed unless you're running services on different ports.

---

## 📁 Frontend Structure

```
src/
├── pages/
│   ├── LoginPage.tsx              ← Login UI with demo users
│   ├── AdminPage.tsx              ← Admin dashboard (ENG_ADMIN only)
│   ├── Dashboard.tsx              ← Role-based dashboard
│   └── ... other pages
│
├── components/
│   ├── ProtectedRoute.tsx         ← Authentication wrapper
│   ├── RoleBasedDashboard.tsx     ← Role-specific views
│   ├── layout/
│   │   ├── TopNavBar.tsx          ← User profile dropdown
│   │   ├── AppLayout.tsx          ← Main layout
│   │   └── AppSidebar.tsx         ← Navigation menu
│   └── ... other components
│
├── contexts/
│   └── AuthContext.tsx            ← Global auth state
│
├── services/
│   └── authService.ts             ← API calls for auth
│
├── types/
│   └── auth.ts                    ← TypeScript types
│
└── App.tsx                        ← Main router + providers
```

---

## 🎯 Common Tasks

### Clear Login & Start Fresh
```bash
# Option 1: Browser DevTools
# Press F12 → Application → Local Storage → Clear All

# Option 2: Hard Refresh
# Windows: Ctrl + Shift + R
# Mac: Cmd + Shift + R
```

### Check Server Status
```bash
# All 4 services should respond:
curl http://localhost:8002/health  # User Management
curl http://localhost:8000/health  # Backend
curl http://localhost:8001/health  # AI Service
curl http://localhost:8080/         # Frontend
```

### Build for Production
```bash
npm run build

# Output: dist/ folder
# Deploy dist/ to web server
```

### Debug Issues
```bash
# 1. Open browser DevTools (F12)
# 2. Check Console tab for errors
# 3. Check Network tab for failed API calls
# 4. Check Application tab → Local Storage for user session

# 4. Check terminal for build errors
```

---

## 🔐 8 User Roles & Permissions

### 1. Engineering Admin (ENG_ADMIN)
✅ Create datasheets  
✅ Approve datasheets  
✅ Create purchase requests  
✅ Approve purchase requests  
✅ View costs  
✅ Modify users & roles  
**Admin Panel:** Yes  

### 2. Piping Lead (PIP_LEAD)
✅ Create datasheets  
✅ Approve datasheets  
✅ Create purchase requests  
✅ Approve purchase requests  
✅ View costs  
❌ Modify users  

### 3. Process Engineer (PROC_ENG)
✅ Create datasheets  
❌ Everything else  

### 4. Mechanical Engineer (MECH_ENG)
✅ Create datasheets  
❌ Everything else  

### 5. Procurement Manager (PROC_MGR)
✅ Create purchase requests  
✅ Approve purchase requests  
✅ View costs  
❌ Datasheets  

### 6. QA Manager (QA_MGR)
✅ Approve datasheets  
❌ Everything else  

### 7. Project Manager (PROJECT_MGR)
✅ Approve datasheets  
✅ Create purchase requests  
✅ Approve purchase requests  
✅ View costs  
❌ Create datasheets  

### 8. Viewer (VIEW_ONLY)
✅ Read-only access only  

---

## 🚨 Troubleshooting

### "Cannot login" or "User not found"
**Solution:** Make sure User Management API (8002) is running
```bash
# Check if running
curl http://localhost:8002/health

# If not, start it in another terminal:
cd SPE-Valvesheet-User-Staging
docker-compose up -d
# or
source venv/bin/activate && uvicorn app.main:app --port 8002
```

### "Page is blank" after login
**Solution:** 
1. Open DevTools (F12)
2. Check Console for errors
3. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
4. Clear localStorage and try again

### Admin panel shows "Access Denied"
**Solution:** You must be logged in as **ENG_ADMIN**
- Use `eng.admin@spe.com` to login
- Check user dropdown shows "Engineering_Admin"

### Styles not loading properly
**Solution:**
```bash
# Restart dev server
npm run dev

# Or clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

## 📚 Files Modified for Authentication

### New Files Created
- `src/types/auth.ts` - TypeScript types
- `src/services/authService.ts` - Auth API service
- `src/contexts/AuthContext.tsx` - Global auth context
- `src/pages/LoginPage.tsx` - Login page UI
- `src/pages/AdminPage.tsx` - Admin dashboard
- `src/components/ProtectedRoute.tsx` - Route protection
- `src/components/RoleBasedDashboard.tsx` - Role-specific views
- `src/components/layout/TopNavBar.tsx` - User dropdown nav
- `AUTHENTICATION.md` - Detailed docs
- `.env` - Environment configuration

### Modified Files
- `src/App.tsx` - Added AuthProvider + login route
- `src/components/layout/AppLayout.tsx` - Added TopNavBar
- `src/pages/Dashboard.tsx` - Shows role-based dashboard
- `.env.example` - Added User Management API URL

---

## 🔄 Authentication Flow

```
┌─────────────────────────────────────────┐
│  User visits http://localhost:8080      │
└────────────────┬────────────────────────┘
                 ↓
        ┌────────────────────┐
        │ Is user logged in? │
        └────────┬───────────┘
                 │
        ┌────────▼──────────┐
        │ YES: Show App    │  NO: Show Login Page
        │ Dashboard        │  └──────┬──────────┐
        └─────────┬────────┘         │          │
                  │            ┌─────▼────┐  ┌──▼──────┐
                  │            │Enter     │  │Click    │
                  │            │Credentials│  │Quick    │
                  │            └─────┬────┘  │Fill     │
                  │                  │       └──┬──────┘
                  │                  └─────┬────┘
                  │                        │
                  │              ┌─────────▼─────────┐
                  │              │POST to 8002 API   │
                  │              │Authenticate user  │
                  │              └─────────┬─────────┘
                  │                        │
                  │         ┌──────────────▼──┐
                  │         │User found &     │
                  │         │stored in local  │
                  │         │storage          │
                  │         └──────────┬──────┘
                  │                    │
                  └────────┬───────────┘
                           ↓
            ┌──────────────────────────┐
            │Show Dashboard            │
            │- Role-based layout       │
            │- User dropdown visible   │
            │- Protected routes work   │
            └──────────────────────────┘
```

---

## ✅ Verification Checklist

- [ ] Node.js installed (`node --version`)
- [ ] Frontend files exist in `SPE-Valvesheet-Frontend-Staging/`
- [ ] User Management API running on port 8002
- [ ] Frontend started with `npm run dev`
- [ ] Can access http://localhost:8080 in browser
- [ ] Login page loads with logo and demo users
- [ ] Can click demo user button and login successfully
- [ ] Dashboard displays after login
- [ ] User dropdown shows in top right
- [ ] Admin panel accessible with ENG_ADMIN account
- [ ] Logout clears session and redirects to login

---

## 🎓 Learning Resources

### Understand the Code
1. **Login Flow:** Read `src/pages/LoginPage.tsx`
2. **Auth State:** Read `src/contexts/AuthContext.tsx`
3. **API Calls:** Read `src/services/authService.ts`
4. **Route Protection:** Read `src/components/ProtectedRoute.tsx`
5. **Dashboard Views:** Read `src/components/RoleBasedDashboard.tsx`

### Make Changes
- Add new user roles in `authService.ts`
- Update dashboards in `RoleBasedDashboard.tsx`
- Modify admin features in `AdminPage.tsx`
- Add new protected pages using `<ProtectedRoute>`

---

## 🎉 You're All Set!

**Frontend is ready to start.** Run it with:
```bash
npm run dev
```

**Then navigate to:** http://localhost:8080

**Login with:** eng.admin@spe.com / demo123

Enjoy! 🚀

---

**For complete system setup guide, see:** `COMPLETE_SETUP_GUIDE.md`

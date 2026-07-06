import { Route, Routes, Navigate } from 'react-router-dom'
import AppointmentsPage from './pages/AppointmentsPage.jsx'
import DashboardLayout from './components/DashboardLayout.jsx'
import { GuestRoute, ProtectedRoute } from './components/ProtectedRoute.jsx'
import LandingPage from './pages/LandingPage.jsx'
import AdminStaffPage from './pages/admin/AdminStaffPage.jsx'
import AdminPatientsPage from './pages/admin/AdminPatientsPage.jsx'
import AdminInventoryPage from './pages/admin/AdminInventoryPage.jsx'
import PortalSectionPage from './pages/PortalSectionPage.jsx'
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage.jsx'
import AdminLandingPage from './pages/admin/AdminLandingPage.jsx'
import AdminReportsPage from './pages/admin/AdminReportsPage.jsx'
import AdminSettingsPage from './pages/admin/AdminSettingsPage.jsx'
import BookAppointmentPage from './pages/patient/BookAppointmentPage.jsx'
import PatientLandingPage from './pages/patient/PatientLandingPage.jsx'
import PatientRecordsPage from './pages/patient/PatientRecordsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import SignInPage from './pages/SignInPage.jsx'
import StaffLandingPage from './pages/staff/StaffLandingPage.jsx'

const adminNavItems = [
  { label: 'Dashboard', to: '/admin', end: true, icon: 'dashboard' },
  { label: 'Patients', to: '/admin/patients', icon: 'patients' },
  { label: 'Staff', to: '/admin/staff', icon: 'staff', preserveFrom: true },
  { label: 'Appointments', to: '/admin/appointments', icon: 'appointments' },
  { label: 'Analytics', to: '/admin/analytics', icon: 'analytics' },
  { label: 'Reports', to: '/admin/reports', icon: 'reports' },
  { label: 'Inventory', to: '/admin/inventory', icon: 'inventory' },
  { label: 'Settings', to: '/admin/settings', icon: 'settings' },
  { label: 'Logout', action: 'logout', icon: 'logout' },
]

const staffNavItems = [
  { label: 'Dashboard', to: '/staff', end: true, icon: 'dashboard' },
  { label: 'Appointments', to: '/staff/appointments', icon: 'appointments' },
  { label: 'Patients', to: '/staff/patients', icon: 'patients' },
  { label: 'Notifications', to: '/staff/notifications', icon: 'notifications' },
  { label: 'Logout', action: 'logout', icon: 'logout' },
]

const patientNavItems = [
  { label: 'Dashboard', to: '/patient', end: true, icon: 'dashboard' },
  { label: 'Book Appointment', to: '/patient/book-appointment', icon: 'appointments' },
  { label: 'Records', to: '/patient/records', icon: 'records' },
  { label: 'Logout', action: 'logout', icon: 'logout' },
]

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route
        path="/login"
        element={
          <GuestRoute>
            <SignInPage />
          </GuestRoute>
        }
      />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/patient"
        element={
          <ProtectedRoute allowedRoles={['patient']}>
            <DashboardLayout portalLabel="Patient Portal" navItems={patientNavItems} />
          </ProtectedRoute>
        }
      >
        <Route index element={<PatientLandingPage />} />
        <Route path="book-appointment" element={<BookAppointmentPage />} />
        <Route path="records" element={<PatientRecordsPage />} />
        <Route
          path="notifications"
          element={
            <PortalSectionPage
              title="Notifications"
              description="View appointment updates and clinic reminders."
            />
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="/book-appointment" element={<Navigate to="/patient/book-appointment" replace />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DashboardLayout portalLabel="Admin Portal" navItems={adminNavItems} />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminLandingPage />} />
        <Route path="patients" element={<AdminPatientsPage />} />
        <Route path="staff" element={<AdminStaffPage />} />
        <Route
          path="appointments"
          element={
            <AppointmentsPage
              title="All Appointments"
              description="View and manage every appointment booked in the clinic system."
              allowApproval
            />
          }
        />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="inventory" element={<AdminInventoryPage />} />
        <Route
          path="notifications"
          element={
            <PortalSectionPage
              title="Notifications"
              description="View appointment updates, clinic alerts, and system messages."
            />
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      <Route
        path="/staff"
        element={
          <ProtectedRoute allowedRoles={['staff', 'dentist']}>
            <DashboardLayout portalLabel="Staff Portal" navItems={staffNavItems} />
          </ProtectedRoute>
        }
      >
        <Route index element={<StaffLandingPage />} />
        <Route
          path="appointments"
          element={
            <AppointmentsPage
              title="Appointments"
              description="Review scheduled visits and pending booking requests."
            />
          }
        />
        <Route
          path="patients"
          element={
            <PortalSectionPage
              title="Patients"
              description="Browse patient records and recent registrations."
            />
          }
        />
        <Route
          path="notifications"
          element={
            <PortalSectionPage
              title="Notifications"
              description="View appointment updates, patient messages, and clinic alerts."
            />
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}

export default App

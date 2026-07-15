import { Route, Routes, Navigate } from 'react-router-dom'
import AppointmentsPage from './pages/AppointmentsPage.jsx'
import DashboardLayout from './components/DashboardLayout.jsx'
import { GuestRoute, ProtectedRoute } from './components/ProtectedRoute.jsx'
import LandingPage from './pages/LandingPage.jsx'
import AdminStaffPage from './pages/admin/AdminStaffPage.jsx'
import AdminPatientsPage from './pages/admin/AdminPatientsPage.jsx'
import AdminInventoryPage from './pages/admin/AdminInventoryPage.jsx'
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage.jsx'
import AdminLandingPage from './pages/admin/AdminLandingPage.jsx'
import AdminNotificationsPage from './pages/admin/AdminNotificationsPage.jsx'
import AdminPromotionsPage from './pages/admin/AdminPromotionsPage.jsx'
import AdminReportsPage from './pages/admin/AdminReportsPage.jsx'
import AdminSettingsPage from './pages/admin/AdminSettingsPage.jsx'
import BookAppointmentPage from './pages/patient/BookAppointmentPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import PatientLandingPage from './pages/patient/PatientLandingPage.jsx'
import PatientNotificationsPage from './pages/patient/PatientNotificationsPage.jsx'
import PatientPromotionsPage from './pages/patient/PatientPromotionsPage.jsx'
import PatientRecordsPage from './pages/patient/PatientRecordsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import SignInPage from './pages/SignInPage.jsx'
import StaffClinicalNotesPage from './pages/staff/StaffClinicalNotesPage.jsx'
import StaffInventoryPage from './pages/staff/StaffInventoryPage.jsx'
import StaffLandingPage from './pages/staff/StaffLandingPage.jsx'
import StaffPatientsPage from './pages/staff/StaffPatientsPage.jsx'
import StaffReportsPage from './pages/staff/StaffReportsPage.jsx'
import StaffSettingsPage from './pages/staff/StaffSettingsPage.jsx'
import StaffTreatmentRecordsPage from './pages/staff/StaffTreatmentRecordsPage.jsx'

const adminNavItems = [
  { label: 'Dashboard', to: '/admin', end: true, icon: 'dashboard' },
  { label: 'Patients', to: '/admin/patients', icon: 'patients' },
  { label: 'Staff', to: '/admin/staff', icon: 'staff', preserveFrom: true },
  { label: 'Appointments', to: '/admin/appointments', icon: 'appointments' },
  { label: 'Treatment Records', to: '/admin/treatment-records', icon: 'treatmentRecords' },
  { label: 'Clinical Notes', to: '/admin/clinical-notes', icon: 'clinicalNotes' },
  { label: 'Analytics', to: '/admin/analytics', icon: 'analytics' },
  { label: 'Reports', to: '/admin/reports', icon: 'reports' },
  { label: 'Inventory', to: '/admin/inventory', icon: 'inventory' },
  { label: 'Promotions', to: '/admin/promotions', icon: 'promotions' },
  { label: 'Settings', to: '/admin/settings', icon: 'settings' },
  { label: 'Logout', action: 'logout', icon: 'logout' },
]

const staffNavItems = [
  { label: 'Dashboard', to: '/staff', end: true, icon: 'dashboard' },
  { label: 'Appointments', to: '/staff/appointments', icon: 'appointments' },
  { label: 'Patients', to: '/staff/patients', icon: 'patients' },
  { label: 'Treatment Records', to: '/staff/treatment-records', icon: 'treatmentRecords' },
  { label: 'Clinical Notes', to: '/staff/clinical-notes', icon: 'clinicalNotes' },
  { label: 'Reports', to: '/staff/reports', icon: 'reports' },
  { label: 'Inventory', to: '/staff/inventory', icon: 'inventory' },
  { label: 'Promotions', to: '/staff/promotions', icon: 'promotions' },
  { label: 'Settings', to: '/staff/settings', icon: 'settings' },
  { label: 'Logout', action: 'logout', icon: 'logout' },
]

const dentistNavItems = [
  { label: 'Dashboard', to: '/dentist', end: true, icon: 'dashboard' },
  { label: 'Appointments', to: '/dentist/appointments', icon: 'appointments' },
  { label: 'Patients', to: '/dentist/patients', icon: 'patients' },
  { label: 'Treatment Records', to: '/dentist/treatment-records', icon: 'treatmentRecords' },
  { label: 'Clinical Notes', to: '/dentist/clinical-notes', icon: 'clinicalNotes' },
  { label: 'Reports', to: '/dentist/reports', icon: 'reports' },
  { label: 'Inventory', to: '/dentist/inventory', icon: 'inventory' },
  { label: 'Promotions', to: '/dentist/promotions', icon: 'promotions' },
  { label: 'Settings', to: '/dentist/settings', icon: 'settings' },
  { label: 'Logout', action: 'logout', icon: 'logout' },
]

const patientNavItems = [
  { label: 'Dashboard', to: '/patient', end: true, icon: 'dashboard' },
  { label: 'Book Appointment', to: '/patient/book-appointment', icon: 'appointments' },
  { label: 'Records', to: '/patient/records', icon: 'records' },
  { label: 'Clinic Promotions', to: '/patient/promotions', icon: 'promotions' },
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
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

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
        <Route path="promotions" element={<PatientPromotionsPage />} />
        <Route
          path="notifications"
          element={<PatientNotificationsPage />}
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
        <Route path="treatment-records" element={<StaffTreatmentRecordsPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="clinical-notes" element={<StaffClinicalNotesPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="inventory" element={<AdminInventoryPage />} />
        <Route path="promotions" element={<AdminPromotionsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
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
              allowApproval
            />
          }
        />
        <Route path="patients" element={<StaffPatientsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="treatment-records" element={<StaffTreatmentRecordsPage />} />
        <Route path="clinical-notes" element={<StaffClinicalNotesPage />} />
        <Route path="reports" element={<StaffReportsPage />} />
        <Route path="inventory" element={<StaffInventoryPage />} />
        <Route path="promotions" element={<PatientPromotionsPage />} />
        <Route path="settings" element={<StaffSettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route
        path="/dentist"
        element={
          <ProtectedRoute allowedRoles={['dentist']}>
            <DashboardLayout portalLabel="Dentist Portal" navItems={dentistNavItems} />
          </ProtectedRoute>
        }
      >
        <Route index element={<StaffLandingPage />} />
        <Route
          path="appointments"
          element={
            <AppointmentsPage
              title="Appointments"
              description="Review scheduled visits and patient appointment requests."
              allowApproval
            />
          }
        />
        <Route path="patients" element={<StaffPatientsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="treatment-records" element={<StaffTreatmentRecordsPage />} />
        <Route path="clinical-notes" element={<StaffClinicalNotesPage />} />
        <Route path="reports" element={<StaffReportsPage />} />
        <Route path="inventory" element={<StaffInventoryPage />} />
        <Route path="promotions" element={<PatientPromotionsPage />} />
        <Route path="settings" element={<StaffSettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}

export default App

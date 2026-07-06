import { useEffect, useState } from 'react'
import { fdmstApi } from '../../api/fdmstApi.js'
import AppointmentsTable from '../../components/AppointmentsTable.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

function StaffLandingPage() {
  const toast = useToast()
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const data = await fdmstApi.getStaffDashboard()
        setDashboard(data)
      } catch (loadError) {
        toast.error(loadError.message || 'Failed to load staff dashboard.')
      } finally {
        setIsLoading(false)
      }
    }

    loadDashboard()
  }, [toast])

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm font-medium text-slate-500">Loading staff dashboard...</p>
      </main>
    )
  }

  return (
    <main className="px-6 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Staff Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-sky-950">Today at the Clinic</h1>
        <p className="mt-2 text-slate-500">
          Review today&apos;s schedule, upcoming visits, and recently registered patients.
        </p>
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-sky-950">Today&apos;s Appointments</h2>
          <div className="mt-4">
            <AppointmentsTable
              appointments={dashboard?.todaysAppointments}
              emptyMessage="No appointments scheduled for today."
            />
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-sky-950">Upcoming Appointments</h2>
          <div className="mt-4">
            <AppointmentsTable
              appointments={dashboard?.upcomingAppointments}
              emptyMessage="No upcoming appointments."
            />
          </div>
        </article>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-sky-950">Recent Patients</h2>
        <p className="mt-1 text-sm text-slate-500">Newly registered patients in the system.</p>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          {dashboard?.recentPatients?.length ? (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Patient ID</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Registered</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentPatients.map((patient) => (
                  <tr key={patient.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-4 py-3 font-medium text-sky-950">{patient.patientId || '—'}</td>
                    <td className="px-4 py-3">{patient.patientName}</td>
                    <td className="px-4 py-3">{patient.email || '—'}</td>
                    <td className="px-4 py-3">{formatDate(patient.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-slate-500">No recent patients found.</div>
          )}
        </div>
      </section>
    </main>
  )
}

export default StaffLandingPage

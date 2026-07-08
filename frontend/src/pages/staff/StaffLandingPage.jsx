import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaBullhorn } from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import AppointmentsTable from '../../components/AppointmentsTable.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

function StaffLandingPage() {
  const toast = useToast()
  const [dashboard, setDashboard] = useState(null)
  const [promotions, setPromotions] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [data, promotionResponse] = await Promise.all([
          fdmstApi.getStaffDashboard(),
          fdmstApi.list('promotions'),
        ])
        setDashboard(data)
        setPromotions(Array.isArray(promotionResponse.data) ? promotionResponse.data : [])
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

      <section className="mt-10 rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <FaBullhorn aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Clinic Promotions</h2>
              <p className="mt-1 text-sm text-slate-500">Active offers visible to portal users.</p>
            </div>
          </div>
          <Link to="/staff/promotions" className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-900">
            View All
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {promotions.slice(0, 3).length ? promotions.slice(0, 3).map((promotion) => (
            <article key={promotion._id} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-amber-600">{promotion.discountLabel || promotion.promoCode || 'Clinic Offer'}</p>
              <h3 className="mt-2 font-semibold text-sky-950">{promotion.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{promotion.description || 'No additional details.'}</p>
            </article>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 md:col-span-3">
              No active promotions right now.
            </div>
          )}
        </div>
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

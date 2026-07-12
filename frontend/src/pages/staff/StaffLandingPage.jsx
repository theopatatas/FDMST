import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaBullhorn, FaCalendarCheck, FaCheckCircle, FaClock, FaPlay, FaUserCheck, FaUsers } from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import AppointmentsTable from '../../components/AppointmentsTable.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

function StaffLandingPage() {
  const toast = useToast()
  const [dashboard, setDashboard] = useState(null)
  const [promotions, setPromotions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const userRole = authStorage.getUser()?.role
  const appointmentsPath = userRole === 'dentist' ? '/dentist/appointments' : '/staff/appointments'

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    try {
      const [data, promotionResponse] = await Promise.all([
        fdmstApi.getStaffDashboard(),
        fdmstApi.list('promotions'),
      ])
      setDashboard(data)
      setPromotions(Array.isArray(promotionResponse.data) ? promotionResponse.data : [])
    } catch (loadError) {
      if (!silent) toast.error(loadError.message || 'Failed to load staff dashboard.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadDashboard()
    const timer = setInterval(() => loadDashboard({ silent: true }), 30000)
    return () => clearInterval(timer)
  }, [loadDashboard])

  const handleQueueAction = async (appointmentId, status) => {
    try {
      await fdmstApi.updateAppointmentStatus(appointmentId, { status })
      toast.success('Queue updated.')
      loadDashboard({ silent: true })
    } catch (error) {
      toast.error(error.message || 'Unable to update queue.')
    }
  }

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
        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              [FaCalendarCheck, "Today's Appointments", dashboard?.stats?.todaysAppointments || 0],
              [FaUserCheck, 'Checked-In Patients', dashboard?.stats?.checkedInPatients || 0],
              [FaPlay, 'In Consultation', dashboard?.stats?.patientsInConsultation || 0],
              [FaCheckCircle, 'Completed Today', dashboard?.stats?.completedToday || 0],
              [FaClock, 'Cancelled Today', dashboard?.stats?.cancelledToday || 0],
            ].map(([Icon, label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Icon className="h-5 w-5 text-sky-950" />
                <p className="mt-3 text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-sky-950">{value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h2 className="text-xl font-semibold text-sky-950">Today&apos;s Queue</h2>
          <p className="mt-1 text-sm text-slate-500">Patients are ordered by appointment time.</p>
          <div className="mt-4 grid gap-3">
            {dashboard?.todaysQueue?.length ? dashboard.todaysQueue.map((appointment, index) => (
              <div key={appointment.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[5rem_1fr_auto] lg:items-center">
                <div className="text-sm font-semibold text-sky-950">#{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <p className="font-semibold text-sky-950">{appointment.patientName}</p>
                  <p className="mt-1 text-sm text-slate-500">{appointment.appointmentTime} • {appointment.service} • {appointment.status?.replaceAll('_', ' ')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {appointment.status === 'confirmed' ? <button className="rounded-xl bg-sky-950 px-3 py-2 text-xs font-semibold text-white" onClick={() => handleQueueAction(appointment.id, 'checked_in')}>Check In</button> : null}
                  {appointment.status === 'checked_in' ? <button className="rounded-xl bg-sky-950 px-3 py-2 text-xs font-semibold text-white" onClick={() => handleQueueAction(appointment.id, 'in_consultation')}>Start Consultation</button> : null}
                  {appointment.status === 'in_consultation' ? <Link to={appointmentsPath} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Complete Treatment</Link> : null}
                  {['confirmed', 'checked_in', 'in_consultation'].includes(appointment.status) ? <button className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700" onClick={() => handleQueueAction(appointment.id, 'rescheduled')}>Skip Patient</button> : null}
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">No patients in today&apos;s queue.</div>
            )}
          </div>
        </article>

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
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
            <FaUsers />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-sky-950">Recent Activity</h2>
            <p className="mt-1 text-sm text-slate-500">Latest queue and appointment workflow actions.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {dashboard?.recentActivity?.length ? dashboard.recentActivity.map((activity) => (
            <div key={activity._id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <p className="font-semibold text-sky-950">{activity.action?.replace('Appointment ', 'Appointment ')}</p>
              <p className="mt-1 text-xs text-slate-500">{activity.performedByEmail || 'System'} • {formatDate(activity.createdAt)}</p>
            </div>
          )) : <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No recent activity yet.</p>}
        </div>
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

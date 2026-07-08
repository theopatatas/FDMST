import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaCalendarCheck,
  FaCalendarDay,
  FaCalendarPlus,
  FaCheckCircle,
  FaClock,
  FaTimesCircle,
  FaUserClock,
  FaUsers,
} from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { fdmstApi } from '../../api/fdmstApi.js'
import AppointmentsTable from '../../components/AppointmentsTable.jsx'
import { useToast } from '../../context/ToastContext.jsx'

function OverviewCard({ label, value, helper, icon: Icon, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    red: 'bg-red-50 text-red-600 ring-red-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    slate: 'bg-slate-50 text-slate-600 ring-slate-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }

  return (
    <article className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-sky-950">{value}</p>
          {helper ? <p className="mt-2 text-xs font-medium text-slate-400">{helper}</p> : null}
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function InfoPanel({ title, children, scrollable = false }) {
  return (
    <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-sky-950">{title}</h2>
      <div className={`mt-4 ${scrollable ? 'max-h-[23rem] overflow-y-auto pr-2' : ''}`}>{children}</div>
    </article>
  )
}

function StaffActivityList({ items = [] }) {
  if (!items.length) {
    return <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No staff activity recorded.</p>
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm" key={item._id || item.id}>
          <p className="font-semibold capitalize text-sky-950">{(item.action || 'Staff activity').replaceAll('_', ' ')}</p>
          <p className="mt-1 text-slate-500">
            {item.performedByEmail || 'System'} • {new Date(item.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  )
}

function AdminLandingPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    try {
      const data = await fdmstApi.getAdminDashboard()
      setDashboard(data)
    } catch (loadError) {
      if (!silent) toast.error(loadError.message || 'Unable to load admin dashboard.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    Promise.resolve().then(loadDashboard)
    const timer = setInterval(() => loadDashboard({ silent: true }), 30000)
    return () => clearInterval(timer)
  }, [loadDashboard])

  const stats = useMemo(() => dashboard?.stats || {}, [dashboard?.stats])
  const cards = useMemo(
    () => [
      { label: 'Total Appointments', value: stats.totalAppointments || 0, helper: 'All booking records', icon: FaCalendarCheck, tone: 'sky' },
      { label: "Today's Appointments", value: stats.todaysAppointments || 0, helper: 'Scheduled for today', icon: FaCalendarDay, tone: 'amber' },
      { label: 'Upcoming Appointments', value: stats.upcomingAppointments || 0, helper: 'Pending or confirmed future visits', icon: FaCalendarPlus, tone: 'violet' },
      { label: 'Completed', value: stats.completedAppointments || 0, helper: 'Finished appointments', icon: FaCheckCircle, tone: 'emerald' },
      { label: 'Pending', value: stats.pendingAppointments || 0, helper: 'Awaiting clinic action', icon: FaClock, tone: 'amber' },
      { label: 'Cancelled', value: stats.cancelledAppointments || 0, helper: 'Cancelled appointments', icon: FaTimesCircle, tone: 'red' },
      { label: 'No-Show', value: stats.noShowAppointments || 0, helper: 'Marked in appointment notes', icon: FaUserClock, tone: 'slate' },
      { label: 'Registered Patients', value: stats.totalPatients || 0, helper: 'Patient profiles in the system', icon: FaUsers, tone: 'sky' },
    ],
    [stats],
  )

  if (isLoading) {
    return <main className="flex min-h-[60vh] items-center justify-center px-6 text-sm text-slate-500">Loading admin dashboard...</main>
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <OverviewCard key={card.label} {...card} />)}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <InfoPanel title="Today's Appointment Schedule" scrollable>
          <AppointmentsTable
            appointments={dashboard?.todaysSchedule || []}
            emptyMessage="No appointments scheduled for today."
            onRowClick={() => navigate('/admin/appointments')}
          />
        </InfoPanel>

        <InfoPanel title="Staff Activity" scrollable>
          <StaffActivityList items={dashboard?.staffActivity || []} />
        </InfoPanel>
      </section>
    </main>
  )
}

export default AdminLandingPage

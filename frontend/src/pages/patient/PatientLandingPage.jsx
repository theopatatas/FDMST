import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  FaArrowRight,
  FaCalendarCheck,
  FaCheckCircle,
  FaClock,
  FaFileMedical,
  FaGift,
  FaRegCalendarAlt,
  FaTimesCircle,
  FaTooth,
} from 'react-icons/fa'
import { AUTH_CHANGED_EVENT, authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate, formatStatus } from '../../utils/auth.js'

const quickActions = [
  {
    title: 'Book Appointment',
    description: 'Choose your preferred visit date, dentist, and dental service.',
    href: '/patient/book-appointment',
    icon: FaCalendarCheck,
    accent: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  },
  {
    title: 'My Records',
    description: 'Review your treatment history, dental files, and care notes.',
    href: '/patient/records',
    icon: FaFileMedical,
    accent: 'bg-sky-50 text-sky-950 ring-sky-100',
  },
  {
    title: 'Clinic Promos',
    description: 'See current patient offers without leaving your portal.',
    href: '/patient/promotions',
    icon: FaGift,
    accent: 'bg-amber-50 text-amber-600 ring-amber-100',
  },
]

const statusStyles = {
  cancelled: {
    icon: FaTimesCircle,
    pill: 'bg-red-50 text-red-700 ring-red-100',
  },
  completed: {
    icon: FaCheckCircle,
    pill: 'bg-sky-50 text-sky-700 ring-sky-100',
  },
  confirmed: {
    icon: FaCheckCircle,
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  pending: {
    icon: FaClock,
    pill: 'bg-amber-50 text-amber-700 ring-amber-100',
  },
}

function getDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Patient'
}

function getFirstName(user) {
  return user?.firstName || getDisplayName(user).split(' ')[0] || 'Patient'
}

function isUpcoming(appointment) {
  const status = appointment.status
  if (status === 'cancelled' || status === 'completed') return false

  if (!appointment.appointmentDate) return true

  const appointmentDate = new Date(appointment.appointmentDate)
  appointmentDate.setHours(23, 59, 59, 999)
  return appointmentDate >= new Date()
}

function SummaryCard({ icon: Icon, label, value, helper, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-sky-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{helper}</p>
        </div>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function AppointmentStatus({ status }) {
  const style = statusStyles[status] || {
    icon: FaClock,
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
  }

  const Icon = style.icon

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${style.pill}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {formatStatus(status)}
    </span>
  )
}

function AppointmentsPreview({ appointments, isLoading, onSelect }) {
  if (isLoading) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">Loading appointments...</div>
  }

  if (!appointments.length) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
          <FaRegCalendarAlt className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 font-semibold text-sky-950">No upcoming appointments</p>
        <p className="mt-2 text-sm text-slate-500">Book your next visit and it will appear here.</p>
        <Link to="/patient/book-appointment" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-sky-900">
          Book Now
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="min-w-[52rem] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Dentist</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {appointments.slice(0, 6).map((appointment) => (
              <tr key={appointment.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
                      <FaTooth aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-semibold text-sky-950">{appointment.service || 'Dental Visit'}</p>
                      <p className="text-xs text-slate-500">{appointment.reason || 'Clinic appointment'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">{formatDate(appointment.appointmentDate)}</td>
                <td className="px-4 py-4">{appointment.appointmentTime}</td>
                <td className="px-4 py-4">{appointment.dentistName || 'Any available dentist'}</td>
                <td className="px-4 py-4"><AppointmentStatus status={appointment.status} /></td>
                <td className="px-4 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => onSelect(appointment)}
                    className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 transition hover:bg-sky-100"
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:hidden">
        {appointments.slice(0, 6).map((appointment) => (
          <article key={appointment.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sky-950">{appointment.service || 'Dental Visit'}</p>
                <p className="mt-1 text-sm text-slate-500">{formatDate(appointment.appointmentDate)} at {appointment.appointmentTime}</p>
              </div>
              <AppointmentStatus status={appointment.status} />
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">{appointment.dentistName || 'Any available dentist'}</p>
              <button type="button" onClick={() => onSelect(appointment)} className="h-10 rounded-xl bg-sky-50 px-4 text-sm font-semibold text-sky-950">
                View Details
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function PatientLandingPage() {
  const toast = useToast()
  const location = useLocation()
  const [user, setUser] = useState(() => authStorage.getUser())
  const [appointments, setAppointments] = useState([])
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadDashboard = useCallback(({ silent = false } = {}) => {
    let isActive = true

    setIsLoading(true)

    const currentUser = authStorage.getUser()
    setUser(currentUser)

    if (!currentUser) {
      setAppointments([])
      setIsLoading(false)
      return () => {
        isActive = false
      }
    }

    Promise.all([
      fdmstApi.getMyAppointments(),
    ])
      .then(([appointmentResponse]) => {
        if (!isActive) return
        setAppointments(Array.isArray(appointmentResponse.data) ? appointmentResponse.data : [])
      })
      .catch((loadError) => {
        if (!isActive) return
        if (!silent) toast.error(loadError.message || 'Failed to load your dashboard.')
        setAppointments([])
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [toast])

  useEffect(() => {
    window.scrollTo(0, 0)
    let cleanup
    queueMicrotask(() => {
      cleanup = loadDashboard()
    })

    return () => {
      cleanup?.()
    }
  }, [loadDashboard, location.state?.refreshDashboard])

  useEffect(() => {
    const syncUser = () => setUser(authStorage.getUser())

    window.addEventListener(AUTH_CHANGED_EVENT, syncUser)
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, syncUser)
  }, [])

  const firstName = getFirstName(user)
  const upcomingAppointments = useMemo(() => appointments.filter(isUpcoming), [appointments])
  const nextAppointment = upcomingAppointments[0]
  const pendingCount = useMemo(() => appointments.filter((appointment) => appointment.status === 'pending').length, [appointments])
  const completedCount = useMemo(() => appointments.filter((appointment) => appointment.status === 'completed').length, [appointments])

  if (!user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <p className="text-sm font-medium text-slate-500">Loading your dashboard...</p>
      </main>
    )
  }

  return (
    <main className="text-slate-700">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <section className="overflow-hidden rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">Patient Portal</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Welcome back, {firstName}!</h1>
              <p className="mt-3 max-w-2xl text-sky-100">
                Manage appointments, records, reminders, and patient offers from your Flores-Dizon Dental dashboard.
              </p>
            </div>

            <aside className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/10">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 text-sky-950 shadow-lg">
                  <FaRegCalendarAlt className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-sky-100">Next Appointment</p>
                  <p className="mt-1 text-lg font-semibold">{nextAppointment ? formatDate(nextAppointment.appointmentDate) : 'No appointment yet'}</p>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-sky-900/50 p-4 text-sm leading-6 text-sky-100">
                {nextAppointment
                  ? `${nextAppointment.appointmentTime} - ${nextAppointment.service || 'Dental Visit'}`
                  : 'Book a visit when you are ready. Your confirmed schedule will appear here.'}
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={FaCalendarCheck} label="Upcoming Appointment" value={upcomingAppointments.length ? upcomingAppointments.length : 0} helper={nextAppointment ? formatDate(nextAppointment.appointmentDate) : 'No active schedule'} />
          <SummaryCard icon={FaRegCalendarAlt} label="Total Appointments" value={appointments.length} helper="All booking records" tone="violet" />
          <SummaryCard icon={FaClock} label="Pending Requests" value={pendingCount} helper="Awaiting clinic confirmation" tone="amber" />
          <SummaryCard icon={FaCheckCircle} label="Completed Treatments" value={completedCount} helper="Finished appointments" tone="emerald" />
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-sky-950">Quick Actions</h2>
              <p className="mt-2 text-slate-500">Everything you need for your next visit at Flores-Dizon Dental.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.title}
                  to={action.href}
                  className="group flex min-h-44 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-sky-200 hover:shadow-lg"
                >
                  <span className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${action.accent}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-sky-950 group-hover:text-amber-500">{action.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{action.description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-950">
                    Open <FaArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="mt-10">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Upcoming Appointments</h2>
                <p className="mt-2 text-sm text-slate-500">Your scheduled visits and pending booking requests.</p>
              </div>
              <Link to="/patient/book-appointment" className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-sky-900">
                Book Appointment
              </Link>
            </div>
            <div className="mt-6">
              <AppointmentsPreview appointments={upcomingAppointments} isLoading={isLoading} onSelect={setSelectedAppointment} />
            </div>
          </article>
        </section>
      </div>

      {selectedAppointment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Appointment Details</p>
                <h3 className="mt-2 text-2xl font-semibold text-sky-950">{selectedAppointment.service || 'Dental Visit'}</h3>
              </div>
              <button type="button" onClick={() => setSelectedAppointment(null)} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close appointment details">
                x
              </button>
            </div>
            <dl className="mt-6 grid gap-4 text-sm">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Date</dt><dd className="font-semibold text-sky-950">{formatDate(selectedAppointment.appointmentDate)}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Time</dt><dd className="font-semibold text-sky-950">{selectedAppointment.appointmentTime}</dd></div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-slate-500">Dentist</dt><dd className="font-semibold text-sky-950">{selectedAppointment.dentistName || 'Any available dentist'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd><AppointmentStatus status={selectedAppointment.status} /></dd></div>
            </dl>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default PatientLandingPage

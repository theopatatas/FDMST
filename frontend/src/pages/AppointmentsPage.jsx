import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaClipboardList,
  FaNotesMedical,
  FaRegCalendarAlt,
  FaSearch,
  FaTimes,
  FaUserCheck,
  FaUserClock,
  FaUserInjured,
  FaUserTimes,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../api/fdmstApi.js'
import { inputClass } from '../components/AdminUi.jsx'
import AppointmentsTable from '../components/AppointmentsTable.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatStatus } from '../utils/auth.js'

const statusBadgeClass = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-100',
  confirmed: 'bg-blue-50 text-blue-700 ring-blue-100',
  checked_in: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  in_consultation: 'bg-violet-50 text-violet-700 ring-violet-100',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  cancelled: 'bg-red-50 text-red-700 ring-red-100',
  declined: 'bg-red-50 text-red-700 ring-red-100',
  no_show: 'bg-slate-100 text-slate-700 ring-slate-200',
  rescheduled: 'bg-slate-100 text-slate-700 ring-slate-200',
}

const calendarStatusStyles = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  confirmed: 'border-blue-200 bg-blue-50 text-blue-800',
  checked_in: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  in_consultation: 'border-violet-200 bg-violet-50 text-violet-800',
  completed: 'border-emerald-300 bg-emerald-100 text-emerald-900',
  cancelled: 'border-red-200 bg-red-50 text-red-800',
  declined: 'border-red-200 bg-red-50 text-red-800',
  no_show: 'border-slate-950 bg-slate-900 text-white',
  rescheduled: 'border-slate-200 bg-slate-50 text-slate-700',
}

const calendarLegend = [
  ['pending', '🟡 Pending'],
  ['confirmed', '🔵 Confirmed'],
  ['checked_in', '🟢 Checked In'],
  ['in_consultation', '🟣 In Consultation'],
  ['completed', '✅ Completed'],
  ['cancelled', '🔴 Cancelled'],
  ['no_show', '⚫ No Show'],
]

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const officialClinicServices = [
  'Dental Radiographs',
  'Oral Surgery',
  'Veneers',
  'Tooth Sealant',
  'Fluoride Treatment',
  'Braces / Orthodontic Treatment',
  'Tooth Extraction',
  'Dental Restoration',
  'Crowns / Caps',
  'Fixed Partial Dentures (FPD)',
  'Dentures',
  'Oral Prophylaxis / Cleaning',
  'Root Canal Therapy (RCT)',
  'Oral Check-up',
]

function formatAppointmentDate(value) {
  if (!value) return 'Not scheduled'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not scheduled'
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function calculateAge(value) {
  if (!value) return 'Not recorded'
  const birthDate = new Date(value)
  if (Number.isNaN(birthDate.getTime())) return 'Not recorded'
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthOffset = today.getMonth() - birthDate.getMonth()
  if (monthOffset < 0 || (monthOffset === 0 && today.getDate() < birthDate.getDate())) age -= 1
  return age >= 0 ? `${age} years old` : 'Not recorded'
}

function toDateKey(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function SummaryCard({ icon: Icon, label, value, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-sky-950">{value}</p>
        </div>
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function AppointmentsPage({ allowApproval = false }) {
  const toast = useToast()
  const navigate = useNavigate()
  const currentUser = authStorage.getUser()
  const isAdmin = currentUser?.role === 'admin'
  const isStaff = currentUser?.role === 'staff'
  const basePath = isAdmin ? '/admin' : currentUser?.role === 'dentist' ? '/dentist' : '/staff'
  const [appointments, setAppointments] = useState([])
  const [dentists, setDentists] = useState([])
  const [serviceOptions, setServiceOptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)
  const [view, setView] = useState('table')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [filters, setFilters] = useState({
    date: '',
    dentist: 'all',
    status: 'all',
    patient: '',
    search: '',
    service: 'all',
    period: 'default',
    startDate: '',
    endDate: '',
  })
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 })
  const [declineTarget, setDeclineTarget] = useState(null)
  const [selectedAppointment, setSelectedAppointment] = useState(null)
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [scheduleDraft, setScheduleDraft] = useState({ appointmentDate: '', appointmentTime: '', dentistName: '' })
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [documentationPrompt, setDocumentationPrompt] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineError, setDeclineError] = useState('')
  const [outcomeTarget, setOutcomeTarget] = useState(null)
  const [completionForm, setCompletionForm] = useState({
    servicePerformed: '',
    chiefComplaint: '',
    diagnosis: '',
    treatmentPerformed: '',
    recommendations: '',
    nextVisitRecommendation: '',
    dentistNotes: '',
    observation: '',
    assessment: '',
    clinicalRecommendations: '',
    additionalNotes: '',
    followUpDate: '',
    followUpTime: '',
    followUpReason: '',
  })

  const loadAppointments = useCallback(async ({ silent = false } = {}) => {
    try {
      const [appointmentResponse, dentistResponse] = await Promise.all([
        fdmstApi.getAppointments({
          ...filters,
          page: pagination.page,
          limit: pagination.limit,
        }),
        fdmstApi.getDentists(),
      ])
      setAppointments(appointmentResponse.data || [])
      setPagination((current) => ({
        ...current,
        ...(appointmentResponse.pagination || {}),
      }))
      setServiceOptions([...new Set([...officialClinicServices, ...(appointmentResponse.filters?.services || [])])])
      setDentists((dentistResponse.data || []).filter((dentist) => dentist.role === 'dentist'))
    } catch (loadError) {
      if (!silent) toast.error(loadError.message || 'Unable to load appointments.')
    } finally {
      setIsLoading(false)
    }
  }, [filters, pagination.page, pagination.limit, toast])

  useEffect(() => {
    Promise.resolve().then(loadAppointments)
    const timer = setInterval(() => loadAppointments({ silent: true }), 30000)
    return () => clearInterval(timer)
  }, [loadAppointments])

  useEffect(() => {
    if (!filters.date) return
    const selectedDate = new Date(`${filters.date}T00:00:00`)
    if (!Number.isNaN(selectedDate.getTime())) setCalendarMonth(selectedDate)
  }, [filters.date])

  const calendarData = useMemo(() => {
    const anchor = filters.date
      ? new Date(`${filters.date}T00:00:00`)
      : calendarMonth
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    const gridStart = new Date(monthStart)
    gridStart.setDate(monthStart.getDate() - monthStart.getDay())
    const gridEnd = new Date(monthEnd)
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()))
    const grouped = appointments.reduce((groups, appointment) => {
      const key = toDateKey(appointment.appointmentDate)
      if (!key) return groups
      return { ...groups, [key]: [...(groups[key] || []), appointment] }
    }, {})
    const days = []
    const cursor = new Date(gridStart)

    while (cursor <= gridEnd) {
      const key = toDateKey(cursor)
      days.push({
        date: new Date(cursor),
        key,
        inMonth: cursor.getMonth() === monthStart.getMonth(),
        appointments: (grouped[key] || []).sort((left, right) => String(left.appointmentTime || '').localeCompare(String(right.appointmentTime || ''))),
      })
      cursor.setDate(cursor.getDate() + 1)
    }

    return {
      days,
      title: monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    }
  }, [appointments, calendarMonth, filters.date])

  const summary = useMemo(() => {
    const today = new Date()
    const todayKey = today.toISOString().slice(0, 10)
    const countStatus = (status) => appointments.filter((appointment) => appointment.status === status).length

    return {
      today: appointments.filter((appointment) => appointment.appointmentDate?.slice(0, 10) === todayKey).length,
      pending: countStatus('pending'),
      confirmed: countStatus('confirmed'),
      checkedIn: countStatus('checked_in'),
      completed: countStatus('completed'),
      noShow: countStatus('no_show'),
      cancelled: countStatus('cancelled'),
    }
  }, [appointments])

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPagination((current) => ({ ...current, page: 1 }))
  }

  const handleCalendarDayCountClick = (day) => {
    if (!day.appointments.length) return
    if (day.appointments.length === 1) {
      openAppointmentDetails(day.appointments[0])
      return
    }
    setSelectedCalendarDay(day)
  }

  const goToPage = (page) => {
    setPagination((current) => ({
      ...current,
      page: Math.min(Math.max(page, 1), current.pages || 1),
    }))
  }

  const moveCalendarMonth = (offset) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  const showCurrentCalendarMonth = () => {
    setCalendarMonth(new Date())
  }

  const openAppointmentDetails = (appointment) => {
    setSelectedCalendarDay(null)
    setSelectedAppointment(appointment)
    setNotesDraft(appointment.notes || '')
    setScheduleDraft({
      appointmentDate: appointment.appointmentDate?.slice(0, 10) || '',
      appointmentTime: appointment.appointmentTime || '',
      dentistName: appointment.dentistName || '',
    })
  }

  const closeAppointmentDetails = () => {
    if (isSavingNotes) return
    setSelectedAppointment(null)
    setNotesDraft('')
    setScheduleDraft({ appointmentDate: '', appointmentTime: '', dentistName: '' })
  }

  const saveAppointmentNotes = async () => {
    if (!selectedAppointment) return
    setIsSavingNotes(true)
    try {
      const response = await fdmstApi.updateAppointmentNotes(selectedAppointment.id, { notes: notesDraft })
      const saved = response.appointment
      setAppointments((current) => current.map((appointment) => appointment.id === saved.id ? { ...appointment, ...saved } : appointment))
      setSelectedAppointment((current) => current ? { ...current, ...saved } : current)
      toast.success(response.message || 'Appointment notes saved.')
    } catch (error) {
      toast.error(error.message || 'Unable to save appointment notes.')
    } finally {
      setIsSavingNotes(false)
    }
  }

  const saveAppointmentSchedule = async () => {
    if (!selectedAppointment) return
    setIsSavingSchedule(true)
    try {
      const response = await fdmstApi.updateAppointmentSchedule(selectedAppointment.id, scheduleDraft)
      const saved = response.appointment
      setAppointments((current) => current.map((appointment) => appointment.id === saved.id ? { ...appointment, ...saved } : appointment))
      setSelectedAppointment((current) => current ? { ...current, ...saved } : current)
      toast.success(response.message || 'Appointment schedule updated.')
    } catch (error) {
      toast.error(error.message || 'Unable to update appointment schedule.')
    } finally {
      setIsSavingSchedule(false)
    }
  }

  const openDocumentationModule = (type, appointment) => {
    const path = type === 'treatment' ? `${basePath}/treatment-records` : `${basePath}/clinical-notes`
    navigate(`${path}?appointment=${appointment.id}`)
    setDocumentationPrompt(null)
  }

  const handleUpdateStatus = async (appointmentId, status) => {
    if (status === 'declined') {
      const appointment = appointments.find((item) => item.id === appointmentId)
      setDeclineTarget(appointment || { id: appointmentId })
      setDeclineReason('')
      setDeclineError('')
      return
    }

    if (status === 'completed' || status === 'no_show') {
      const appointment = appointments.find((item) => item.id === appointmentId)
      setOutcomeTarget({ appointment: appointment || { id: appointmentId }, status })
      setCompletionForm((current) => ({
        ...current,
        servicePerformed: appointment?.service || '',
      }))
      return
    }

    setUpdatingId(appointmentId)
    try {
      const response = await fdmstApi.updateAppointmentStatus(appointmentId, { status })
      toast.success(response.message || 'Appointment status updated.')
      setAppointments((current) => current.map((appointment) => appointment.id === appointmentId ? { ...appointment, ...response.appointment } : appointment))
    } catch (updateError) {
      toast.error(updateError.message || 'Unable to update appointment.')
    } finally {
      setUpdatingId(null)
    }
  }

  const closeOutcomeModal = () => {
    if (updatingId) return
    setOutcomeTarget(null)
  }

  const handleCompletionChange = (event) => {
    const { name, value } = event.target
    setCompletionForm((current) => ({ ...current, [name]: value }))
  }

  const confirmOutcome = async () => {
    if (!outcomeTarget) return

    const { appointment, status } = outcomeTarget
    setUpdatingId(appointment.id)

    try {
      const payload = { status }
      if (status === 'completed') {
        payload.treatmentRecord = {
          servicePerformed: completionForm.servicePerformed,
          chiefComplaint: completionForm.chiefComplaint,
          diagnosis: completionForm.diagnosis,
          treatmentPerformed: completionForm.treatmentPerformed,
          recommendations: completionForm.recommendations,
          nextVisitRecommendation: completionForm.nextVisitRecommendation,
          dentistNotes: completionForm.dentistNotes,
        }
        payload.clinicalNotes = {
          observation: completionForm.observation,
          assessment: completionForm.assessment,
          recommendations: completionForm.clinicalRecommendations,
          additionalNotes: completionForm.additionalNotes,
        }
        if (completionForm.followUpDate && completionForm.followUpTime) {
          payload.followUp = {
            date: completionForm.followUpDate,
            time: completionForm.followUpTime,
            reason: completionForm.followUpReason,
          }
        }
      }
      const response = await fdmstApi.updateAppointmentStatus(appointment.id, payload)
      toast.success(response.message || 'Appointment status updated.', { duration: 5000 })
      setAppointments((current) => current.map((item) => (
        item.id === appointment.id ? { ...item, ...response.appointment } : item
      )))
      setOutcomeTarget(null)
      if (status === 'completed') {
        setDocumentationPrompt(response.appointment)
      }
      setCompletionForm({
        servicePerformed: '',
        chiefComplaint: '',
        diagnosis: '',
        treatmentPerformed: '',
        recommendations: '',
        nextVisitRecommendation: '',
        dentistNotes: '',
        observation: '',
        assessment: '',
        clinicalRecommendations: '',
        additionalNotes: '',
        followUpDate: '',
        followUpTime: '',
        followUpReason: '',
      })
      loadAppointments({ silent: true })
    } catch (updateError) {
      toast.error(updateError.message || 'Unable to update appointment.', { duration: 5000 })
    } finally {
      setUpdatingId(null)
    }
  }

  const closeDeclineModal = () => {
    if (updatingId) return
    setDeclineTarget(null)
    setDeclineReason('')
    setDeclineError('')
  }

  const confirmDecline = async () => {
    const reason = declineReason.trim()

    if (!reason) {
      setDeclineError('Please enter a reason for declining this appointment.')
      return
    }

    setUpdatingId(declineTarget.id)
    try {
      const response = await fdmstApi.updateAppointmentStatus(declineTarget.id, {
        status: 'declined',
        declineReason: reason,
      })
      toast.success(response.message || 'Appointment declined.')
      setAppointments((current) => current.map((appointment) => (
        appointment.id === declineTarget.id
          ? { ...appointment, status: response.appointment.status, declineReason: response.appointment.declineReason }
          : appointment
      )))
      closeDeclineModal()
    } catch (updateError) {
      setDeclineError(updateError.message || 'Unable to decline appointment.')
      toast.error(updateError.message || 'Unable to decline appointment.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <SummaryCard icon={FaRegCalendarAlt} label="Today" value={isLoading ? '...' : summary.today} />
        <SummaryCard icon={FaUserClock} label="Pending" value={isLoading ? '...' : summary.pending} tone="amber" />
        <SummaryCard icon={FaCalendarAlt} label="Confirmed" value={isLoading ? '...' : summary.confirmed} tone="blue" />
        <SummaryCard icon={FaUserCheck} label="Checked In" value={isLoading ? '...' : summary.checkedIn} tone="emerald" />
        <SummaryCard icon={FaCheckCircle} label="Completed" value={isLoading ? '...' : summary.completed} tone="emerald" />
        <SummaryCard icon={FaUserTimes} label="No Show" value={isLoading ? '...' : summary.noShow} tone="slate" />
        <SummaryCard icon={FaTimes} label="Cancelled" value={isLoading ? '...' : summary.cancelled} tone="red" />
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="relative block min-w-0 flex-1">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className={`${inputClass} w-full pl-11`} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder={isAdmin ? 'Search patient, appointment ID, service, or dentist...' : 'Search patient, appointment ID, or service...'} />
          </label>
          <div className="grid w-full shrink-0 grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 md:w-auto">
            <button type="button" onClick={() => setView('table')} className={`h-10 rounded-lg px-4 text-sm font-bold transition ${view === 'table' ? 'bg-white text-sky-950 shadow-sm' : 'text-slate-500 hover:text-sky-950'}`}>List View</button>
            <button type="button" onClick={() => setView('calendar')} className={`h-10 rounded-lg px-4 text-sm font-bold transition ${view === 'calendar' ? 'bg-white text-sky-950 shadow-sm' : 'text-slate-500 hover:text-sky-950'}`}>Calendar View</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select className={`${inputClass} min-w-[11rem] flex-1 xl:flex-none`} value={filters.period} onChange={(event) => updateFilter('period', event.target.value)}>
            <option value="default">Current and upcoming</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past Appointments</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom Date Range</option>
            <option value="all">All Appointments</option>
          </select>
          {isAdmin ? <select className={`${inputClass} min-w-[11rem] flex-1 xl:flex-none`} value={filters.dentist} onChange={(event) => updateFilter('dentist', event.target.value)}><option value="all">All dentists</option>{dentists.map((dentist) => <option key={dentist.id} value={dentist.name}>{dentist.name}</option>)}</select> : null}
          <select className={`${inputClass} min-w-[14rem] flex-1 xl:flex-none`} value={filters.service} onChange={(event) => updateFilter('service', event.target.value)}><option value="all">All services</option>{serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}</select>
          <select className={`${inputClass} min-w-[11rem] flex-1 xl:flex-none`} value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="checked_in">Checked In</option><option value="in_consultation">In Consultation</option><option value="completed">Completed</option><option value="no_show">No Show</option><option value="cancelled">Cancelled</option><option value="declined">Declined</option><option value="rescheduled">Rescheduled</option></select>
          <input className={`${inputClass} min-w-[10.5rem] flex-1 xl:flex-none`} type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} title="Exact appointment date" />
          <button type="button" onClick={() => { setFilters({ date: '', dentist: 'all', status: 'all', patient: '', search: '', service: 'all', period: 'default', startDate: '', endDate: '' }); setPagination((current) => ({ ...current, page: 1 })) }} className="inline-flex h-12 min-w-[8rem] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 sm:flex-none">
            <FaTimes className="h-4 w-4" />
            Clear
          </button>
          {filters.period === 'custom' ? (
            <>
              <input className={`${inputClass} min-w-[10.5rem] flex-1 xl:flex-none`} type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} title="Start date" />
              <input className={`${inputClass} min-w-[10.5rem] flex-1 xl:flex-none`} type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} title="End date" />
            </>
          ) : null}
          <select className={`${inputClass} min-w-[9rem] flex-1 xl:flex-none`} value={pagination.limit} onChange={(event) => setPagination((current) => ({ ...current, page: 1, limit: Number(event.target.value) }))}>
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </section>

      {isLoading ? <p className="mt-8 text-sm text-slate-500">Loading appointments...</p> : view === 'table' ? (
        <AppointmentsTable appointments={appointments} showActions={allowApproval} onUpdateStatus={handleUpdateStatus} onRowClick={openAppointmentDetails} updatingId={updatingId} />
      ) : (
        <section className="grid gap-5">
          <div className="rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-sky-950">{calendarData.title}</h2>
                <p className="mt-1 text-sm text-slate-500">Click any appointment to view details.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl border border-slate-200 bg-white p-1">
                  <button type="button" onClick={() => moveCalendarMonth(-1)} className="h-9 rounded-lg px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Previous</button>
                  <button type="button" onClick={showCurrentCalendarMonth} className="h-9 rounded-lg px-3 text-xs font-bold text-sky-950 transition hover:bg-sky-50">Today</button>
                  <button type="button" onClick={() => moveCalendarMonth(1)} className="h-9 rounded-lg px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Next</button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              {calendarLegend.map(([status, label]) => (
                <span key={status} className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${calendarStatusStyles[status]}`}>
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto">
              <div className="min-w-[920px] overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-7 bg-slate-50">
                  {weekdayLabels.map((day) => (
                    <div key={day} className="border-r border-slate-200 px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500 last:border-r-0">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calendarData.days.map((day) => (
                    <div key={day.key} className={`min-h-36 border-r border-t border-slate-200 p-2 last:border-r-0 ${day.inMonth ? 'bg-white' : 'bg-slate-50/70'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${day.key === toDateKey(new Date()) ? 'bg-sky-950 text-white' : day.inMonth ? 'text-sky-950' : 'text-slate-400'}`}>{day.date.getDate()}</span>
                        {day.appointments.length ? (
                          <button
                            type="button"
                            onClick={() => handleCalendarDayCountClick(day)}
                            className="rounded-full bg-sky-50 px-2 py-0.5 text-[0.65rem] font-bold text-sky-800 ring-1 ring-sky-100 transition hover:bg-sky-100"
                            title={day.appointments.length === 1 ? 'Open appointment details' : `Show ${day.appointments.length} appointments on this date`}
                          >
                            {day.appointments.length}
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid gap-1.5">
                        {day.appointments.slice(0, 4).map((appointment) => (
                          <button
                            type="button"
                            onClick={() => openAppointmentDetails(appointment)}
                            key={appointment.id}
                            className={`min-w-0 rounded-xl border px-2 py-1.5 text-left text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-sm ${calendarStatusStyles[appointment.status] || calendarStatusStyles.pending}`}
                            title={`${appointment.appointmentTime} • ${appointment.patientName} • ${formatStatus(appointment.status)}`}
                          >
                            <span className="block truncate">{appointment.appointmentTime} • {appointment.patientName}</span>
                            <span className="block truncate text-[0.65rem] opacity-80">{appointment.service}</span>
                          </button>
                        ))}
                        {day.appointments.length > 4 ? (
                          <button type="button" className="rounded-lg bg-slate-100 px-2 py-1 text-left text-xs font-bold text-slate-600 transition hover:bg-slate-200" onClick={() => setSelectedCalendarDay(day)}>
                            +{day.appointments.length - 4} more
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedCalendarDay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-sky-950/20">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Calendar Appointments</p>
                <h2 className="mt-1 text-xl font-semibold text-sky-950">
                  {selectedCalendarDay.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedCalendarDay.appointments.length} appointment{selectedCalendarDay.appointments.length === 1 ? '' : 's'} scheduled
                </p>
              </div>
              <button type="button" onClick={() => setSelectedCalendarDay(null)} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close day appointments">
                <FaTimes className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              <div className="grid gap-3">
                {selectedCalendarDay.appointments.map((appointment) => (
                  <button
                    type="button"
                    key={appointment.id}
                    onClick={() => openAppointmentDetails(appointment)}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-sky-950">{appointment.appointmentTime} • {appointment.patientName}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{appointment.service} • {appointment.dentistName || 'Any available dentist'}</p>
                    </div>
                    <span className={`inline-flex w-fit whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusBadgeClass[appointment.status] || statusBadgeClass.pending}`}>
                      {formatStatus(appointment.status)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading ? (
        <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing page <span className="font-semibold text-sky-950">{pagination.page}</span> of <span className="font-semibold text-sky-950">{pagination.pages}</span>
            {' '}• <span className="font-semibold text-sky-950">{pagination.total}</span> appointment{pagination.total === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(pagination.pages || 1, 5) }, (_, index) => {
              const start = Math.max(Math.min((pagination.page || 1) - 2, Math.max((pagination.pages || 1) - 4, 1)), 1)
              const pageNumber = start + index
              if (pageNumber > (pagination.pages || 1)) return null
              return (
                <button
                  type="button"
                  key={pageNumber}
                  onClick={() => goToPage(pageNumber)}
                  className={`h-10 min-w-10 rounded-xl px-3 text-sm font-semibold transition ${
                    pagination.page === pageNumber ? 'bg-sky-950 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {pageNumber}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>
      ) : null}

      {selectedAppointment ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={closeAppointmentDetails} aria-label="Close appointment details" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl min-w-0 flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{selectedAppointment.appointmentId || `APT-${String(selectedAppointment.id).slice(-6).toUpperCase()}`}</p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-sky-950">{selectedAppointment.patientName}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedAppointment.service} • {formatAppointmentDate(selectedAppointment.appointmentDate)} at {selectedAppointment.appointmentTime}</p>
              </div>
              <button type="button" onClick={closeAppointmentDetails} className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close drawer">
                <FaTimes className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="font-semibold text-sky-950">Patient Information</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>Name: {selectedAppointment.patientName}</p>
                    <p>Age: {calculateAge(selectedAppointment.patientSnapshot?.dateOfBirth)}</p>
                    <p>Gender: {(selectedAppointment.patientSnapshot?.gender || 'Not recorded').replaceAll('_', ' ')}</p>
                    <p>Contact: {selectedAppointment.contactNumber || 'Not provided'}</p>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="font-semibold text-sky-950">Appointment Information</h3>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>ID: {selectedAppointment.appointmentId || `APT-${String(selectedAppointment.id).slice(-6).toUpperCase()}`}</p>
                    <p>Dentist: {selectedAppointment.dentistName || 'Any available dentist'}</p>
                    <p>Status: <span className={`ml-1 inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusBadgeClass[selectedAppointment.status] || statusBadgeClass.pending}`}>{formatStatus(selectedAppointment.status)}</span></p>
                    <p>Reason: {selectedAppointment.reason || 'Not recorded'}</p>
                  </div>
                </section>
                {isAdmin ? (
                  <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
                    <h3 className="font-semibold text-sky-950">Admin Schedule Controls</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <input className={inputClass} type="date" value={scheduleDraft.appointmentDate} onChange={(event) => setScheduleDraft((current) => ({ ...current, appointmentDate: event.target.value }))} />
                      <input className={inputClass} type="time" value={scheduleDraft.appointmentTime} onChange={(event) => setScheduleDraft((current) => ({ ...current, appointmentTime: event.target.value }))} />
                      <select className={inputClass} value={scheduleDraft.dentistName} onChange={(event) => setScheduleDraft((current) => ({ ...current, dentistName: event.target.value }))}>
                        <option value="">Any available dentist</option>
                        {dentists.map((dentist) => <option key={dentist.id} value={dentist.name}>{dentist.name}</option>)}
                      </select>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={saveAppointmentSchedule} disabled={isSavingSchedule} className="h-11 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-60">{isSavingSchedule ? 'Saving...' : 'Save Schedule'}</button>
                    </div>
                  </section>
                ) : null}
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
                  <h3 className="font-semibold text-sky-950">Patient Snapshot</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-white p-3 text-sm text-slate-600"><FaUserInjured className="mb-2 text-sky-700" /> Medical Alerts<br /><span className="font-semibold text-sky-950">{selectedAppointment.patientSnapshot?.allergies?.length ? `Allergies: ${selectedAppointment.patientSnapshot.allergies.join(', ')}` : selectedAppointment.patientSnapshot?.medicalConditions || 'No alerts recorded'}</span></div>
                    <div className="rounded-xl bg-white p-3 text-sm text-slate-600"><FaClock className="mb-2 text-sky-700" /> Last Visit<br /><span className="font-semibold text-sky-950">View patient profile</span></div>
                    <div className="rounded-xl bg-white p-3 text-sm text-slate-600"><FaClipboardList className="mb-2 text-sky-700" /> Last Treatment<br /><span className="font-semibold text-sky-950">View records</span></div>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
                  <h3 className="font-semibold text-sky-950">Quick Actions</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <button type="button" onClick={() => navigate(`${basePath}/patients`)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-sky-950 hover:bg-sky-50">View Patient Profile</button>
                    <button type="button" onClick={() => navigate(`${basePath}/treatment-records?appointment=${selectedAppointment.id}`)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-sky-950 hover:bg-sky-50">View Treatment Records</button>
                    <button type="button" onClick={() => navigate(`${basePath}/clinical-notes?appointment=${selectedAppointment.id}`)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-sky-950 hover:bg-sky-50">View Clinical Notes</button>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
                  <h3 className="font-semibold text-sky-950">Appointment Timeline</h3>
                  <div className="mt-4 grid gap-3">
                    {[
                      { action: 'Appointment Created', status: 'pending', recordedAt: selectedAppointment.requestSubmittedAt || selectedAppointment.createdAt },
                      ...(selectedAppointment.timeline || []),
                    ].filter((item) => item.recordedAt || item.action).map((item, index) => (
                      <div key={`${item.action}-${item.recordedAt || index}`} className="flex gap-3">
                        <span className="mt-1 flex h-3 w-3 shrink-0 rounded-full bg-sky-700" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-sky-950">{item.action || `Appointment ${formatStatus(item.status)}`}</p>
                          <p className="text-xs text-slate-500">{item.recordedAt ? new Date(item.recordedAt).toLocaleString() : 'Timestamp unavailable'}{item.performedByEmail ? ` • ${item.performedByEmail}` : ''}</p>
                          {item.note ? <p className="mt-1 text-sm text-slate-600">{item.note}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4 md:col-span-2">
                  <h3 className="font-semibold text-sky-950">Internal Appointment Notes</h3>
                  <p className="mt-1 text-sm text-slate-500">Administrative reminders only. These notes are not shown to patients.</p>
                  <textarea className={`${inputClass} mt-3 min-h-28 resize-none py-3`} value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Patient requested earlier schedule, special assistance, reminders..." />
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={saveAppointmentNotes} disabled={isSavingNotes} className="h-11 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-60">{isSavingNotes ? 'Saving...' : 'Save Notes'}</button>
                  </div>
                </section>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {declineTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/20">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Decline Appointment</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Add a clear reason before declining {declineTarget.patientName ? `${declineTarget.patientName}'s` : 'this'} appointment.
              </p>
            </div>

            <label className="mt-5 grid gap-2 text-sm font-semibold text-slate-600">
              Reason
              <textarea
                className={`${inputClass} min-h-28 resize-none py-3 leading-6`}
                value={declineReason}
                onChange={(event) => {
                  setDeclineReason(event.target.value)
                  setDeclineError('')
                }}
                placeholder="Example: Dentist is unavailable for the selected schedule."
                maxLength={300}
              />
            </label>
            {declineError ? <p className="mt-2 text-sm font-medium text-red-600">{declineError}</p> : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeclineModal}
                disabled={updatingId === declineTarget.id}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDecline}
                disabled={updatingId === declineTarget.id}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updatingId === declineTarget.id ? 'Declining...' : 'Decline Appointment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {outcomeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/20">
            <h2 className="text-xl font-semibold text-sky-950">
              {outcomeTarget.status === 'completed' ? 'Confirm Appointment Completion' : 'Confirm No-Show Status'}
            </h2>
            {outcomeTarget.status === 'completed' ? (
              <>
                <div className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm font-medium leading-6 text-sky-800">
                  <p>
                    You are about to mark {outcomeTarget.appointment.patientName ? `${outcomeTarget.appointment.patientName}'s` : "this patient's"} appointment as Completed.
                  </p>
                  <p className="mt-3">
                    This action confirms that the scheduled dental service has been successfully performed. The appointment will be recorded as completed, the patient will be notified, and the service amount will be included in the clinic's Estimated Revenue. Related Analytics, Reports, and the appointment activity history will also be updated.
                  </p>
                  <p className="mt-3">
                    This action cannot be undone without administrative intervention.
                  </p>
                </div>
                <div className="mt-4 max-h-[24rem] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-sky-950">Treatment Record</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input className={inputClass} name="servicePerformed" value={completionForm.servicePerformed} onChange={handleCompletionChange} placeholder="Service performed" />
                    <input className={inputClass} name="chiefComplaint" value={completionForm.chiefComplaint} onChange={handleCompletionChange} placeholder="Chief complaint" />
                    <input className={inputClass} name="diagnosis" value={completionForm.diagnosis} onChange={handleCompletionChange} placeholder="Diagnosis" />
                    <input className={inputClass} name="treatmentPerformed" value={completionForm.treatmentPerformed} onChange={handleCompletionChange} placeholder="Treatment performed" />
                    <input className={inputClass} name="recommendations" value={completionForm.recommendations} onChange={handleCompletionChange} placeholder="Recommendations" />
                    <input className={inputClass} name="nextVisitRecommendation" value={completionForm.nextVisitRecommendation} onChange={handleCompletionChange} placeholder="Next visit recommendation" />
                  </div>
                  <textarea className={`${inputClass} mt-3 min-h-24 py-3`} name="dentistNotes" value={completionForm.dentistNotes} onChange={handleCompletionChange} placeholder="Dentist notes" />
                  <h3 className="mt-4 text-sm font-semibold text-sky-950">Private Clinical Notes</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input className={inputClass} name="observation" value={completionForm.observation} onChange={handleCompletionChange} placeholder="Observation" />
                    <input className={inputClass} name="assessment" value={completionForm.assessment} onChange={handleCompletionChange} placeholder="Assessment" />
                    <input className={inputClass} name="clinicalRecommendations" value={completionForm.clinicalRecommendations} onChange={handleCompletionChange} placeholder="Clinical recommendations" />
                    <input className={inputClass} name="additionalNotes" value={completionForm.additionalNotes} onChange={handleCompletionChange} placeholder="Additional notes" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-sky-950">Follow-up Appointment</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <input className={inputClass} type="date" name="followUpDate" value={completionForm.followUpDate} onChange={handleCompletionChange} />
                    <input className={inputClass} type="time" name="followUpTime" value={completionForm.followUpTime} onChange={handleCompletionChange} />
                    <input className={inputClass} name="followUpReason" value={completionForm.followUpReason} onChange={handleCompletionChange} placeholder="Reason" />
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700">
                <p>
                  You are about to mark {outcomeTarget.appointment.patientName ? `${outcomeTarget.appointment.patientName}'s` : "this patient's"} appointment as No Show.
                </p>
                <p className="mt-3">
                  This action confirms that the patient did not attend the scheduled appointment. The appointment status will be updated, the patient will be notified, and the record will be included in the clinic's attendance statistics, Analytics, and Reports. No estimated revenue will be recorded for this appointment.
                </p>
                <p className="mt-3">
                  This action cannot be undone without administrative intervention.
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeOutcomeModal}
                disabled={updatingId === outcomeTarget.appointment.id}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmOutcome}
                disabled={updatingId === outcomeTarget.appointment.id}
                className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  outcomeTarget.status === 'completed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {updatingId === outcomeTarget.appointment.id ? 'Saving...' : outcomeTarget.status === 'completed' ? 'Completed' : 'No Show'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {documentationPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/40 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-sky-950/20">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <FaCheckCircle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Appointment Completed</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Would you like to complete the patient's clinical documentation?</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              {!isStaff ? (
                <>
                  <button type="button" onClick={() => openDocumentationModule('treatment', documentationPrompt)} className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-bold text-white hover:bg-sky-900">Add Treatment Record</button>
                  <button type="button" onClick={() => openDocumentationModule('clinical', documentationPrompt)} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-bold text-sky-950 hover:bg-sky-50">Add Clinical Note</button>
                </>
              ) : (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Clinical documentation is restricted to Admin and Dentist accounts.</p>
              )}
              <button type="button" onClick={() => setDocumentationPrompt(null)} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50">Finish</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default AppointmentsPage

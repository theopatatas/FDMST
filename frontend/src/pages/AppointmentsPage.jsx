import { useCallback, useEffect, useMemo, useState } from 'react'
import { fdmstApi } from '../api/fdmstApi.js'
import { inputClass } from '../components/AdminUi.jsx'
import AppointmentsTable from '../components/AppointmentsTable.jsx'
import { useToast } from '../context/ToastContext.jsx'

function AppointmentsPage({ allowApproval = false }) {
  const toast = useToast()
  const [appointments, setAppointments] = useState([])
  const [dentists, setDentists] = useState([])
  const [serviceOptions, setServiceOptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)
  const [view, setView] = useState('table')
  const [filters, setFilters] = useState({
    date: '',
    dentist: 'all',
    status: 'all',
    patient: '',
    service: 'all',
    period: 'default',
    startDate: '',
    endDate: '',
  })
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 })
  const [declineTarget, setDeclineTarget] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineError, setDeclineError] = useState('')
  const [outcomeTarget, setOutcomeTarget] = useState(null)

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
      setServiceOptions(appointmentResponse.filters?.services || [])
      setDentists(dentistResponse.data || [])
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

  const calendarGroups = useMemo(() => appointments.reduce((groups, appointment) => {
    const key = appointment.appointmentDate?.slice(0, 10) || 'Unscheduled'
    return { ...groups, [key]: [...(groups[key] || []), appointment] }
  }, {}), [appointments])

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPagination((current) => ({ ...current, page: 1 }))
  }

  const goToPage = (page) => {
    setPagination((current) => ({
      ...current,
      page: Math.min(Math.max(page, 1), current.pages || 1),
    }))
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

  const confirmOutcome = async () => {
    if (!outcomeTarget) return

    const { appointment, status } = outcomeTarget
    setUpdatingId(appointment.id)

    try {
      const response = await fdmstApi.updateAppointmentStatus(appointment.id, { status })
      toast.success(response.message || 'Appointment status updated.', { duration: 5000 })
      setAppointments((current) => current.map((item) => (
        item.id === appointment.id ? { ...item, ...response.appointment } : item
      )))
      setOutcomeTarget(null)
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
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select className={inputClass} value={filters.period} onChange={(event) => updateFilter('period', event.target.value)}>
            <option value="default">Current and upcoming</option>
            <option value="today">Today</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past Appointments</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom Date Range</option>
            <option value="all">All Appointments</option>
          </select>
          <input className={inputClass} type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} title="Exact appointment date" />
          <select className={inputClass} value={filters.dentist} onChange={(event) => updateFilter('dentist', event.target.value)}><option value="all">All dentists</option>{dentists.map((dentist) => <option key={dentist.id} value={dentist.name}>{dentist.name}</option>)}</select>
          <select className={inputClass} value={filters.service} onChange={(event) => updateFilter('service', event.target.value)}><option value="all">All services</option>{serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}</select>
          <select className={inputClass} value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="no_show">No Show</option><option value="cancelled">Cancelled</option><option value="declined">Declined</option></select>
          <input className={inputClass} value={filters.patient} onChange={(event) => updateFilter('patient', event.target.value)} placeholder="Patient or email" />
          {filters.period === 'custom' ? (
            <>
              <input className={inputClass} type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} title="Start date" />
              <input className={inputClass} type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} title="End date" />
            </>
          ) : null}
          <select className={inputClass} value={view} onChange={(event) => setView(event.target.value)}><option value="table">Table view</option><option value="calendar">Calendar view</option></select>
          <select className={inputClass} value={pagination.limit} onChange={(event) => setPagination((current) => ({ ...current, page: 1, limit: Number(event.target.value) }))}>
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </section>

      {isLoading ? <p className="mt-8 text-sm text-slate-500">Loading appointments...</p> : view === 'table' ? (
        <div className="mt-8"><AppointmentsTable appointments={appointments} showActions={allowApproval} onUpdateStatus={handleUpdateStatus} updatingId={updatingId} /></div>
      ) : (
        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          {Object.entries(calendarGroups).map(([date, items]) => (
            <article key={date} className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-sky-950">{date === 'Unscheduled' ? date : new Date(date).toLocaleDateString()}</h2>
              <div className="mt-4 grid gap-3">{items.map((appointment) => <div key={appointment.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm"><p className="font-semibold text-sky-950">{appointment.appointmentTime} • {appointment.patientName}</p><p className="text-slate-500">{appointment.service} • {appointment.dentistName || 'Any dentist'} • {appointment.status}</p></div>)}</div>
            </article>
          ))}
        </section>
      )}

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
    </main>
  )
}

export default AppointmentsPage

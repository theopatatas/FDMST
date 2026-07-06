import { useCallback, useEffect, useMemo, useState } from 'react'
import { fdmstApi } from '../api/fdmstApi.js'
import { inputClass, PageHeader, StatusPill } from '../components/AdminUi.jsx'
import AppointmentsTable from '../components/AppointmentsTable.jsx'
import { useToast } from '../context/ToastContext.jsx'

function AppointmentsPage({ title, description, allowApproval = false }) {
  const toast = useToast()
  const [appointments, setAppointments] = useState([])
  const [dentists, setDentists] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)
  const [view, setView] = useState('table')
  const [filters, setFilters] = useState({ date: '', dentist: 'all', status: 'all', patient: '' })

  const loadAppointments = useCallback(async ({ silent = false } = {}) => {
    try {
      const [appointmentResponse, dentistResponse] = await Promise.all([
        fdmstApi.getAppointments(),
        fdmstApi.getDentists(),
      ])
      setAppointments(appointmentResponse.data || [])
      setDentists(dentistResponse.data || [])
    } catch (loadError) {
      if (!silent) toast.error(loadError.message || 'Unable to load appointments.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    Promise.resolve().then(loadAppointments)
    const timer = setInterval(() => loadAppointments({ silent: true }), 30000)
    return () => clearInterval(timer)
  }, [loadAppointments])

  const filteredAppointments = useMemo(() => appointments.filter((appointment) => {
    const date = appointment.appointmentDate?.slice(0, 10)
    const matchesDate = !filters.date || date === filters.date
    const matchesDentist = filters.dentist === 'all' || appointment.dentistName === filters.dentist
    const matchesStatus = filters.status === 'all' || appointment.status === filters.status
    const matchesPatient = !filters.patient || [appointment.patientName, appointment.email].filter(Boolean).some((value) => value.toLowerCase().includes(filters.patient.toLowerCase()))
    return matchesDate && matchesDentist && matchesStatus && matchesPatient
  }), [appointments, filters])

  const calendarGroups = useMemo(() => filteredAppointments.reduce((groups, appointment) => {
    const key = appointment.appointmentDate?.slice(0, 10) || 'Unscheduled'
    return { ...groups, [key]: [...(groups[key] || []), appointment] }
  }, {}), [filteredAppointments])

  const handleUpdateStatus = async (appointmentId, status) => {
    setUpdatingId(appointmentId)
    try {
      const response = await fdmstApi.updateAppointmentStatus(appointmentId, status)
      toast.success(response.message || 'Appointment status updated.')
      setAppointments((current) => current.map((appointment) => appointment.id === appointmentId ? { ...appointment, status: response.appointment.status } : appointment))
    } catch (updateError) {
      toast.error(updateError.message || 'Unable to update appointment.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Appointments" title={title} description={description} action={<StatusPill tone="sky">{filteredAppointments.length} shown</StatusPill>} />
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <input className={inputClass} type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} />
          <select className={inputClass} value={filters.dentist} onChange={(event) => setFilters((current) => ({ ...current, dentist: event.target.value }))}><option value="all">All dentists</option>{dentists.map((dentist) => <option key={dentist.id} value={dentist.name}>{dentist.name}</option>)}</select>
          <select className={inputClass} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
          <input className={inputClass} value={filters.patient} onChange={(event) => setFilters((current) => ({ ...current, patient: event.target.value }))} placeholder="Patient or email" />
          <select className={inputClass} value={view} onChange={(event) => setView(event.target.value)}><option value="table">Table view</option><option value="calendar">Calendar view</option></select>
        </div>
      </section>

      {isLoading ? <p className="mt-8 text-sm text-slate-500">Loading appointments...</p> : view === 'table' ? (
        <div className="mt-8"><AppointmentsTable appointments={filteredAppointments} showActions={allowApproval} onUpdateStatus={handleUpdateStatus} updatingId={updatingId} /></div>
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
    </main>
  )
}

export default AppointmentsPage

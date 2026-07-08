import { formatDate, formatStatus } from '../utils/auth.js'

const statusStyles = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-sky-50 text-sky-700',
  cancelled: 'bg-red-50 text-red-700',
}

function AppointmentsTable({
  appointments,
  emptyMessage = 'No appointments found.',
  showActions = false,
  onUpdateStatus,
  onRowClick,
  updatingId = null,
}) {
  if (!appointments?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-gray-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Patient</th>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 font-semibold">Time</th>
            <th className="px-4 py-3 font-semibold">Service</th>
            <th className="px-4 py-3 font-semibold">Dentist</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            {showActions && <th className="px-4 py-3 font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => (
            <tr
              key={appointment.id}
              onClick={() => onRowClick?.(appointment)}
              className={`border-b border-gray-100 last:border-b-0 ${onRowClick ? 'cursor-pointer transition hover:bg-slate-50' : ''}`}
            >
              <td className="px-4 py-3 font-medium text-sky-950">{appointment.patientName}</td>
              <td className="px-4 py-3">{formatDate(appointment.appointmentDate)}</td>
              <td className="px-4 py-3">{appointment.appointmentTime}</td>
              <td className="px-4 py-3">{appointment.service}</td>
              <td className="px-4 py-3">{appointment.dentistName || '—'}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    statusStyles[appointment.status] || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {formatStatus(appointment.status)}
                </span>
              </td>
              {showActions && (
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                  {appointment.status === 'pending' ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onUpdateStatus?.(appointment.id, 'confirmed')}
                        disabled={updatingId === appointment.id}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingId === appointment.id ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus?.(appointment.id, 'cancelled')}
                        disabled={updatingId === appointment.id}
                        className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingId === appointment.id ? 'Declining...' : 'Decline'}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default AppointmentsTable

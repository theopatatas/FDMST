import { useEffect, useMemo, useState } from 'react'
import { FaCalendarCheck, FaChartLine, FaFileAlt, FaUserCheck } from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

function StaffReportsPage() {
  const toast = useToast()
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadReports = async () => {
      try {
        const [appointmentResponse, recordResponse] = await Promise.all([
          fdmstApi.getAppointments({ period: 'all', limit: 50 }),
          fdmstApi.list('dentalrecords?limit=50'),
        ])

        if (isMounted) {
          setAppointments(appointmentResponse.data || [])
          setRecords(recordResponse.data || [])
        }
      } catch (error) {
        if (isMounted) toast.error(error.message || 'Unable to load reports.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadReports()
    return () => {
      isMounted = false
    }
  }, [toast])

  const stats = useMemo(() => {
    const completed = appointments.filter((appointment) => appointment.status === 'completed').length
    const noShow = appointments.filter((appointment) => appointment.status === 'no_show').length
    const active = appointments.filter((appointment) => ['pending', 'confirmed', 'checked_in', 'in_consultation'].includes(appointment.status)).length

    return [
      [FaCalendarCheck, 'Appointments', appointments.length],
      [FaUserCheck, 'Active Visits', active],
      [FaFileAlt, 'Treatment Records', records.length],
      [FaChartLine, 'Completed / No Show', `${completed} / ${noShow}`],
    ]
  }, [appointments, records])

  return (
    <main className="px-6 py-8">
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-sky-950">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">Quick operational summary for appointments and treatment records.</p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(([Icon, label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Icon className="h-5 w-5 text-sky-950" />
              <p className="mt-3 text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-sky-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Dentist</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="5">Loading reports...</td></tr>
              ) : appointments.length ? appointments.slice(0, 10).map((appointment) => (
                <tr key={appointment.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-4 text-slate-600">{formatDate(appointment.appointmentDate)}</td>
                  <td className="px-4 py-4 font-semibold text-sky-950">{appointment.patientName}</td>
                  <td className="px-4 py-4 text-slate-600">{appointment.service}</td>
                  <td className="px-4 py-4 text-slate-600">{appointment.dentistName || 'Unassigned'}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-600">{appointment.status?.replaceAll('_', ' ')}</span></td>
                </tr>
              )) : (
                <tr><td className="px-4 py-10 text-center text-slate-500" colSpan="5">No report data available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export default StaffReportsPage

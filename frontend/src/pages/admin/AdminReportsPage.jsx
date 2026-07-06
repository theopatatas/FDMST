import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaFileCsv, FaFileExcel, FaPrint } from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { inputClass, PageHeader, StatusPill } from '../../components/AdminUi.jsx'
import { useToast } from '../../context/ToastContext.jsx'

function inRange(dateValue, start, end) {
  const date = new Date(dateValue)
  if (start && date < new Date(start)) return false
  if (end) {
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59, 999)
    if (date > endDate) return false
  }
  return true
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function getPresetRange(period) {
  const now = new Date()
  const start = new Date(now)

  if (period === 'daily') start.setHours(0, 0, 0, 0)
  if (period === 'weekly') start.setDate(now.getDate() - 6)
  if (period === 'monthly') start.setMonth(now.getMonth() - 1)
  if (period === 'quarterly') start.setMonth(now.getMonth() - 3)
  if (period === 'yearly') start.setFullYear(now.getFullYear() - 1)

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  }
}

function AdminReportsPage() {
  const toast = useToast()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [period, setPeriod] = useState('custom')
  const [appointments, setAppointments] = useState([])
  const [patients, setPatients] = useState([])
  const [records, setRecords] = useState([])
  const [inventory, setInventory] = useState([])
  const [staff, setStaff] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const loadReports = useCallback(async () => {
    try {
      const [appointmentResponse, patientResponse, recordResponse, inventoryResponse, staffResponse] = await Promise.all([
        fdmstApi.getAppointments(),
        fdmstApi.list('patients'),
        fdmstApi.list('dentalrecords'),
        fdmstApi.list('inventory'),
        fdmstApi.getStaff(),
      ])
      setAppointments(appointmentResponse.data || [])
      setPatients(patientResponse.data || [])
      setRecords(recordResponse.data || [])
      setInventory(inventoryResponse.data || [])
      setStaff(staffResponse.data || [])
    } catch (error) {
      toast.error(error.message || 'Unable to load reports.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => { Promise.resolve().then(loadReports) }, [loadReports])

  const filteredAppointments = useMemo(() => appointments.filter((item) => inRange(item.appointmentDate, startDate, endDate)), [appointments, startDate, endDate])
  const filteredPatients = useMemo(() => patients.filter((item) => inRange(item.createdAt, startDate, endDate)), [patients, startDate, endDate])
  const filteredRecords = useMemo(() => records.filter((item) => inRange(item.visitDate || item.createdAt, startDate, endDate)), [records, startDate, endDate])
  const completed = filteredAppointments.filter((item) => item.status === 'completed').length
  const estimatedRevenue = completed * 800
  const lowStock = inventory.filter((item) => ['low_stock', 'out_of_stock'].includes(item.status)).length

  const summary = [
    ['Appointments', filteredAppointments.length],
    ['Completed Appointments', completed],
    ['Revenue Estimate', `PHP ${estimatedRevenue}`],
    ['New Patients', filteredPatients.length],
    ['Treatments', filteredRecords.length],
    ['Inventory Alerts', lowStock],
    ['Active Staff', staff.filter((item) => item.status === 'active').length],
  ]

  const reportRows = useMemo(() => [
    ['Metric', 'Value'],
    ...summary,
    [],
    ['Appointment Date', 'Patient', 'Service', 'Dentist', 'Status'],
    ...filteredAppointments.map((item) => [
      item.appointmentDate ? new Date(item.appointmentDate).toLocaleDateString() : '',
      item.patientName || '',
      item.service || '',
      item.dentistName || '',
      item.status || '',
    ]),
  ], [filteredAppointments, summary])

  const exportReport = (type = 'csv') => downloadCsv(`fdmst-${period}-admin-report.${type === 'excel' ? 'xls' : 'csv'}`, reportRows)

  const applyPeriod = (nextPeriod) => {
    setPeriod(nextPeriod)
    if (nextPeriod === 'custom') return
    const range = getPresetRange(nextPeriod)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Reports" title="Clinic Reports" description="Generate operational reports for appointments, patients, treatments, inventory, revenue, and staff." action={<StatusPill tone="sky">{filteredAppointments.length} appointments</StatusPill>} />
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          {['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'].map((item) => (
            <button
              className={`rounded-full px-4 py-2 text-xs font-semibold capitalize transition ${period === item ? 'bg-sky-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              key={item}
              onClick={() => applyPeriod(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto_auto]">
          <label className="grid gap-2 text-sm font-semibold text-slate-500">Start Date<input className={inputClass} type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPeriod('custom') }} /></label>
          <label className="grid gap-2 text-sm font-semibold text-slate-500">End Date<input className={inputClass} type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPeriod('custom') }} /></label>
          <button onClick={() => exportReport('csv')} className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white"><FaFileCsv /> Export CSV</button>
          <button onClick={() => exportReport('excel')} className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white"><FaFileExcel /> Export Excel</button>
          <button onClick={() => window.print()} className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 px-5 text-sm font-semibold text-slate-600"><FaPrint /> Print/PDF</button>
        </div>
      </section>
      {isLoading ? <p className="mt-8 text-sm text-slate-500">Loading reports...</p> : (
        <>
          <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{summary.map(([label, value]) => <article key={label} className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-sky-950">{value}</p></article>)}</section>
          <section className="mt-8 overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-sky-950">Appointment Report Details</h2>
              <p className="mt-1 text-sm text-slate-500">Filtered appointment records for export and print review.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Patient</th>
                    <th className="px-4 py-3 font-semibold">Service</th>
                    <th className="px-4 py-3 font-semibold">Dentist</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAppointments.length ? filteredAppointments.map((item) => (
                    <tr className="border-t border-gray-100" key={item.id || item._id}>
                      <td className="px-4 py-3">{item.appointmentDate ? new Date(item.appointmentDate).toLocaleDateString() : 'Not set'}</td>
                      <td className="px-4 py-3 font-medium text-sky-950">{item.patientName || 'Unknown patient'}</td>
                      <td className="px-4 py-3">{item.service || 'Not specified'}</td>
                      <td className="px-4 py-3">{item.dentistName || 'Unassigned'}</td>
                      <td className="px-4 py-3 capitalize">{item.status || 'Unknown'}</td>
                    </tr>
                  )) : (
                    <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="5">No appointment records found for this report.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

export default AdminReportsPage

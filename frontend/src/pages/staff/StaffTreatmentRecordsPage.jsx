import { useEffect, useMemo, useState } from 'react'
import { FaFileMedicalAlt, FaSearch } from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'

function StaffTreatmentRecordsPage() {
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadRecords = async () => {
      try {
        const response = await fdmstApi.list('dentalrecords?limit=100')
        if (isMounted) setRecords(Array.isArray(response.data) ? response.data : [])
      } catch (error) {
        if (isMounted) toast.error(error.message || 'Unable to load treatment records.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadRecords()
    return () => {
      isMounted = false
    }
  }, [toast])

  const filteredRecords = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return records

    return records.filter((record) => [
      record.patientName,
      record.dentistName,
      record.servicePerformed,
      record.procedure,
      record.treatment,
      record.diagnosis,
      record.treatmentPerformed,
    ].some((value) => String(value || '').toLowerCase().includes(term)))
  }, [query, records])

  return (
    <main className="px-6 py-8">
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <FaFileMedicalAlt />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-sky-950">Treatment Records</h1>
              <p className="mt-1 text-sm text-slate-500">Review completed patient treatments and clinical summaries.</p>
            </div>
          </div>
          <label className="relative w-full lg:max-w-sm">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-11`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search treatment records..." />
          </label>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Dentist</th>
                <th className="px-4 py-3">Diagnosis</th>
                <th className="px-4 py-3">Treatment Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td className="px-4 py-8 text-center text-slate-500" colSpan="6">Loading treatment records...</td></tr>
              ) : filteredRecords.length ? filteredRecords.map((record) => (
                <tr key={record._id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-4 text-slate-600">{formatDate(record.visitDate || record.createdAt)}</td>
                  <td className="px-4 py-4 font-semibold text-sky-950">{record.patientName || 'Unknown patient'}</td>
                  <td className="px-4 py-4 text-slate-600">{record.servicePerformed || record.procedure || record.treatment || 'Dental Treatment'}</td>
                  <td className="px-4 py-4 text-slate-600">{record.dentistName || 'Not specified'}</td>
                  <td className="px-4 py-4 text-slate-600">{record.diagnosis || 'No diagnosis recorded'}</td>
                  <td className="px-4 py-4 text-slate-600">{record.treatmentPerformed || record.notes || record.recommendations || 'No summary recorded'}</td>
                </tr>
              )) : (
                <tr><td className="px-4 py-10 text-center text-slate-500" colSpan="6">No treatment records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export default StaffTreatmentRecordsPage

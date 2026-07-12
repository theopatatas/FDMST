import { useEffect, useMemo, useState } from 'react'
import { FaNotesMedical, FaSearch } from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100'

function hasClinicalNotes(record) {
  const notes = record.clinicalNotes || {}
  return [notes.observation, notes.assessment, notes.recommendations, notes.additionalNotes]
    .some((value) => String(value || '').trim())
}

function StaffClinicalNotesPage() {
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
        if (isMounted) toast.error(error.message || 'Unable to load clinical notes.')
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
    return records
      .filter(hasClinicalNotes)
      .filter((record) => {
        if (!term) return true
        const notes = record.clinicalNotes || {}
        return [
          record.patientName,
          record.dentistName,
          record.servicePerformed,
          notes.observation,
          notes.assessment,
          notes.recommendations,
          notes.additionalNotes,
        ].some((value) => String(value || '').toLowerCase().includes(term))
      })
  }, [query, records])

  return (
    <main className="px-6 py-8">
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-100">
              <FaNotesMedical />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-sky-950">Clinical Notes</h1>
              <p className="mt-1 text-sm text-slate-500">Private observations and assessments for clinic personnel only.</p>
            </div>
          </div>
          <label className="relative w-full lg:max-w-sm">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-11`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clinical notes..." />
          </label>
        </div>

        <div className="mt-6 grid gap-4">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Loading clinical notes...</div>
          ) : filteredRecords.length ? filteredRecords.map((record) => {
            const notes = record.clinicalNotes || {}
            return (
              <article key={record._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-sky-950">{record.patientName || 'Unknown patient'}</h2>
                    <p className="mt-1 text-sm text-slate-500">{record.servicePerformed || record.procedure || 'Dental Treatment'} • {record.dentistName || 'Not specified'}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">{formatDate(record.visitDate || record.createdAt)}</span>
                </div>
                <dl className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observation</dt><dd className="mt-2 text-sm text-slate-700">{notes.observation || 'None recorded'}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assessment</dt><dd className="mt-2 text-sm text-slate-700">{notes.assessment || 'None recorded'}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recommendations</dt><dd className="mt-2 text-sm text-slate-700">{notes.recommendations || 'None recorded'}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Additional Notes</dt><dd className="mt-2 text-sm text-slate-700">{notes.additionalNotes || 'None recorded'}</dd></div>
                </dl>
              </article>
            )
          }) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">No clinical notes found.</div>
          )}
        </div>
      </section>
    </main>
  )
}

export default StaffClinicalNotesPage

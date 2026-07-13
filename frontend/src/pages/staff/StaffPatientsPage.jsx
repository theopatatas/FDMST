import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaCalendarAlt,
  FaClipboardList,
  FaEye,
  FaFileMedical,
  FaNotesMedical,
  FaPlus,
  FaSearch,
  FaTimes,
  FaUserInjured,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'

const inputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function initials(patient) {
  return String(patient.fullName || `${patient.firstName || ''} ${patient.lastName || ''}` || 'Patient')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'PT'
}

function statusBadge(status) {
  const label = status || 'New'
  const className = label === 'Verified'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
    : label === 'Inactive'
      ? 'bg-red-50 text-red-700 ring-red-100'
      : 'bg-amber-50 text-amber-700 ring-amber-100'

  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${className}`}>{label}</span>
}

function SectionCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-sky-950">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  )
}

function StaffPatientsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const user = authStorage.getUser()
  const basePath = user?.role === 'dentist' ? '/dentist' : '/staff'
  const isStaff = user?.role === 'staff'
  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPatient, setSelectedPatient] = useState(null)

  const loadPatients = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fdmstApi.getMyCarePatients()
      setPatients(response.data || [])
    } catch (error) {
      toast.error(error.message || `Unable to load ${isStaff ? 'patients' : 'your patients'}.`)
    } finally {
      setIsLoading(false)
    }
  }, [isStaff, toast])

  useEffect(() => {
    Promise.resolve().then(loadPatients)
  }, [loadPatients])

  const filteredPatients = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) return patients
    return patients.filter((patient) => [
      patient.fullName,
      patient.patientId,
      patient.contactNumber,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized)))
  }, [patients, search])

  const openPatient = async (patient) => {
    try {
      const detail = await fdmstApi.getMyCarePatient(patient._id)
      setSelectedPatient(detail)
    } catch (error) {
      toast.error(error.message || 'Unable to open this patient profile.')
    }
  }

  const quickActions = [
    ['Create Appointment', FaCalendarAlt, `${basePath}/appointments`],
    ['Add Clinical Note', FaNotesMedical, `${basePath}/clinical-notes`],
    ['Add Treatment Record', FaFileMedical, `${basePath}/treatment-records`],
    ['View Appointment History', FaClipboardList, null],
  ]

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.35rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
              <FaUserInjured className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-sky-950">{isStaff ? 'Patients' : 'My Patients'}</h2>
              <p className="mt-1 text-sm text-slate-500">{isStaff ? 'All clinic patient records available for care support.' : 'Patients assigned to, scheduled with, or treated by you.'}</p>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-100 px-5 pb-5">
          <label className="relative block max-w-2xl">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className={`${inputClass} pl-12`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient name, Patient ID, or contact number..." />
          </label>
        </div>

        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading patients...</p>
        ) : filteredPatients.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Patient Name</th>
                  <th className="px-5 py-4">Patient ID</th>
                  <th className="px-5 py-4">Last Visit</th>
                  <th className="px-5 py-4">Next Appointment</th>
                  <th className="px-5 py-4">Patient Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient, index) => (
                  <tr key={patient._id} className="border-t border-slate-100">
                    <td className="px-5 py-5">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white ${index % 2 ? 'bg-violet-600' : 'bg-sky-700'}`}>{initials(patient)}</span>
                        <div>
                          <p className="font-bold text-sky-950">{patient.fullName}</p>
                          <p className="text-xs text-slate-500">{patient.contactNumber || 'No contact number'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-5 text-slate-600">{patient.patientId || '—'}</td>
                    <td className="px-5 py-5 text-slate-600">{patient.lastVisit || '—'}</td>
                    <td className="px-5 py-5 text-slate-600">{patient.nextAppointment || '—'}</td>
                    <td className="px-5 py-5">{statusBadge(patient.displayStatus)}</td>
                    <td className="px-5 py-5">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => openPatient(patient)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-50 px-4 text-sm font-bold text-sky-950 transition hover:bg-sky-100">
                          <FaEye className="h-4 w-4" aria-hidden="true" />
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="m-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <FaUserInjured className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-bold text-sky-950">No patients found.</p>
            <p className="mt-1 text-sm text-slate-500">{isStaff ? 'No clinic patient records match your search.' : 'Patients will appear here after they are assigned to you, booked with you, or treated by you.'}</p>
          </div>
        )}
      </section>

      {selectedPatient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-sky-950">{selectedPatient.fullName}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedPatient.patientId || 'No Patient ID'} • {selectedPatient.contactNumber || 'No contact number'}</p>
              </div>
              <button type="button" onClick={() => setSelectedPatient(null)} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close patient profile">
                <FaTimes className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <SectionCard title="Personal Information">
                <p>Age: {selectedPatient.dateOfBirth ? Math.max(new Date().getFullYear() - new Date(selectedPatient.dateOfBirth).getFullYear(), 0) : '—'}</p>
                <p>Gender: {(selectedPatient.gender || 'prefer_not_to_say').replaceAll('_', ' ')}</p>
                <p>Contact Number: {selectedPatient.contactNumber || '—'}</p>
              </SectionCard>
              <SectionCard title="Medical Information">
                <p>Allergies: {selectedPatient.allergies?.length ? selectedPatient.allergies.join(', ') : 'None recorded'}</p>
                <p>Medical Conditions: {selectedPatient.medicalConditions || selectedPatient.medicalHistory || 'None recorded'}</p>
                <p>Emergency Contact: {[selectedPatient.emergencyContact, selectedPatient.emergencyContactName, selectedPatient.emergencyContactNumber].filter(Boolean).join(' • ') || '—'}</p>
              </SectionCard>
              <SectionCard title="Patient Quick Actions">
                <div className="grid gap-2 sm:grid-cols-2">
                  {quickActions.map(([label, Icon, to]) => (
                    <button key={label} type="button" onClick={() => to && navigate(to)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-sky-950 transition hover:bg-sky-50">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
              </SectionCard>
              <SectionCard title="Patient Visit History">
                {selectedPatient.appointmentHistory?.length ? selectedPatient.appointmentHistory.slice(0, 6).map((appointment) => (
                  <p key={appointment._id || appointment.id}>{formatDate(appointment.appointmentDate)} • {appointment.service || 'Appointment'} • {appointment.status}</p>
                )) : <p>No appointment history found.</p>}
              </SectionCard>
              <SectionCard title="Treatment Records">
                {selectedPatient.treatmentRecords?.length ? selectedPatient.treatmentRecords.slice(0, 6).map((record) => (
                  <p key={record._id}>{formatDate(record.visitDate || record.createdAt)} • {record.procedure || record.treatment || record.servicePerformed || 'Treatment'} • {record.treatmentStatus || 'completed'}</p>
                )) : <p>No treatment records found.</p>}
              </SectionCard>
              <SectionCard title="Clinical Notes">
                {selectedPatient.clinicalNotes?.length ? selectedPatient.clinicalNotes.slice(0, 6).map((record) => (
                  <p key={record._id}>{formatDate(record.visitDate || record.createdAt)} • {record.noteType || 'Clinical Note'} • {record.createdByName || record.dentistName || 'Provider'}</p>
                )) : <p>No clinical notes found.</p>}
              </SectionCard>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default StaffPatientsPage

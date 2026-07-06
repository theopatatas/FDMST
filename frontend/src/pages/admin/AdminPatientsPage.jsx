import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaEdit, FaEye, FaPowerOff, FaShieldAlt, FaTimes, FaUndo } from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { inputClass, PageHeader, StatusPill, textareaClass } from '../../components/AdminUi.jsx'
import PasswordField from '../../components/PasswordField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  dateOfBirth: '',
  gender: 'prefer_not_to_say',
  address: '',
  medicalHistory: '',
  dentalHistory: '',
  billingNotes: '',
  registrationStatus: 'unverified',
  status: 'active',
}

const initialConfirmation = {
  type: '',
  title: '',
  description: '',
  submitLabel: '',
  payload: null,
  target: null,
}

function fullName(patient) {
  return [patient.firstName, patient.lastName].filter(Boolean).join(' ')
}

function AdminPatientsPage() {
  const toast = useToast()
  const [patients, setPatients] = useState([])
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isConfirming, setIsConfirming] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmation, setConfirmation] = useState(initialConfirmation)
  const [fieldErrors, setFieldErrors] = useState({})

  const loadData = useCallback(async () => {
    try {
      const [patientResponse, appointmentResponse, recordResponse] = await Promise.all([
        fdmstApi.list('patients'),
        fdmstApi.getAppointments(),
        fdmstApi.list('dentalrecords'),
      ])
      setPatients(patientResponse.data || [])
      setAppointments(appointmentResponse.data || [])
      setRecords(recordResponse.data || [])
    } catch (error) {
      toast.error(error.message || 'Unable to load patient records.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    Promise.resolve().then(loadData)
  }, [loadData])

  const filteredPatients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return patients.filter((patient) => {
      const matchesQuery = !normalizedQuery || [fullName(patient), patient.email, patient.patientId, patient.contactNumber]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
      const matchesStatus = statusFilter === 'all' || (patient.status || 'active') === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [patients, query, statusFilter])

  const selectedAppointments = useMemo(
    () => appointments.filter((appointment) => {
      if (!selectedPatient) return false
      return appointment.email === selectedPatient.email || appointment.patientName === fullName(selectedPatient)
    }),
    [appointments, selectedPatient],
  )

  const selectedRecords = useMemo(
    () => records.filter((record) => {
      if (!selectedPatient) return false
      return record.patient === selectedPatient.id || record.patientName === fullName(selectedPatient)
    }),
    [records, selectedPatient],
  )

  const resetForm = () => {
    setForm(initialForm)
    setEditingId('')
    setFieldErrors({})
  }

  const closeConfirmation = () => {
    setAdminPassword('')
    setConfirmation(initialConfirmation)
  }

  const openConfirmation = (nextConfirmation) => {
    setAdminPassword('')
    setConfirmation(nextConfirmation)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: name === 'contactNumber' ? digitsOnly(value) : value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const validate = () => {
    const errors = {}
    if (!form.firstName.trim()) errors.firstName = 'First name is required.'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address.'
    const mobileError = validateMobileNumber(form.contactNumber)
    if (mobileError) errors.contactNumber = mobileError
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    const payload = {
      ...form,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      contactNumber: form.contactNumber.trim(),
    }

    openConfirmation({
      type: 'save',
      title: editingId ? 'Confirm Patient Update' : 'Confirm Patient Creation',
      description: editingId
        ? 'Re-enter your admin password to save changes to this patient profile.'
        : 'Re-enter your admin password to add this patient record.',
      submitLabel: editingId ? 'Verify and Save' : 'Verify and Add',
      payload,
      target: editingId,
    })
  }

  const applyEdit = (patient) => {
    setEditingId(patient._id)
    setForm({
      ...initialForm,
      ...patient,
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : '',
      status: patient.status || 'active',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleViewPrompt = (patient) => {
    openConfirmation({
      type: 'view',
      title: 'Unlock Patient Details',
      description: `Re-enter your admin password to view detailed information for ${fullName(patient)}.`,
      submitLabel: 'Verify and View',
      target: patient,
    })
  }

  const handleEditPrompt = (patient) => {
    openConfirmation({
      type: 'edit_open',
      title: 'Unlock Patient Editing',
      description: `Re-enter your admin password to edit ${fullName(patient)}'s patient profile.`,
      submitLabel: 'Verify and Edit',
      target: patient,
    })
  }

  const handleToggleStatus = async (patient) => {
    const nextStatus = (patient.status || 'active') === 'active' ? 'inactive' : 'active'
    openConfirmation({
      type: 'status',
      title: nextStatus === 'active' ? 'Reactivate Patient Account' : 'Deactivate Patient Account',
      description:
        nextStatus === 'active'
          ? `Re-enter your admin password to reactivate ${fullName(patient)}.`
          : `Re-enter your admin password to deactivate ${fullName(patient)} and restrict patient access.`,
      submitLabel: nextStatus === 'active' ? 'Verify and Reactivate' : 'Verify and Deactivate',
      target: patient,
      payload: { status: nextStatus },
    })
  }

  const handleConfirmedAction = async (event) => {
    event.preventDefault()
    if (!adminPassword) {
      toast.error('Admin password is required.')
      return
    }

    setIsConfirming(true)

    try {
      if (confirmation.type === 'view') {
        await fdmstApi.verifyAdminPassword(adminPassword)
        setSelectedPatient(confirmation.target)
        toast.success('Patient details unlocked.')
        closeConfirmation()
        return
      }

      if (confirmation.type === 'edit_open') {
        await fdmstApi.verifyAdminPassword(adminPassword)
        applyEdit(confirmation.target)
        toast.success('Patient editing unlocked.')
        closeConfirmation()
        return
      }

      if (confirmation.type === 'status') {
        const saved = await fdmstApi.update('patients', confirmation.target._id, {
          ...confirmation.payload,
          adminPassword,
        })
        setPatients((current) => current.map((item) => item._id === saved._id ? saved : item))
        toast.success(`Patient ${confirmation.payload.status === 'active' ? 'reactivated' : 'deactivated'} successfully.`)
        closeConfirmation()
        return
      }

      if (confirmation.type === 'save') {
        const saved = confirmation.target
          ? await fdmstApi.update('patients', confirmation.target, { ...confirmation.payload, adminPassword })
          : await fdmstApi.create('patients', { ...confirmation.payload, adminPassword })

        toast.success(confirmation.target ? 'Patient updated successfully.' : 'Patient added successfully.')
        setPatients((current) => confirmation.target ? current.map((patient) => patient._id === saved._id ? saved : patient) : [saved, ...current])
        resetForm()
        closeConfirmation()
      }
    } catch (error) {
      setFieldErrors(error.errors || {})
      toast.error(error.message || 'Admin password could not be verified. No changes were saved.')
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Patients" title="Patient Management" description="Search, maintain profiles, and review appointment, treatment, billing, and medical history." />

      <section className="grid gap-8 xl:grid-cols-[24rem_1fr]">
        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-sky-950">{editingId ? 'Edit Patient' : 'Add Patient'}</h2>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-gray-200 p-2 text-slate-500"><FaUndo /></button> : null}
          </div>
          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            {['firstName', 'lastName', 'email'].map((name) => (
              <label key={name} className="grid gap-2 text-sm font-semibold text-slate-500">
                {name === 'firstName' ? 'First Name' : name === 'lastName' ? 'Last Name' : 'Email'}
                <input className={inputClass} name={name} type={name === 'email' ? 'email' : 'text'} value={form[name]} onChange={handleChange} required={name !== 'email'} />
                {fieldErrors[name] ? <span className="text-xs text-red-600">{fieldErrors[name]}</span> : null}
              </label>
            ))}
            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Mobile Number
              <input className={inputClass} name="contactNumber" inputMode="numeric" maxLength={11} value={form.contactNumber} onChange={handleChange} placeholder="09XXXXXXXXX" />
              {fieldErrors.contactNumber ? <span className="text-xs text-red-600">{fieldErrors.contactNumber}</span> : null}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-500">Birth Date<input className={inputClass} name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} /></label>
              <label className="grid gap-2 text-sm font-semibold text-slate-500">Gender<select className={inputClass} name="gender" value={form.gender} onChange={handleChange}><option value="prefer_not_to_say">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-slate-500">Address<input className={inputClass} name="address" value={form.address || ''} onChange={handleChange} /></label>
            <label className="grid gap-2 text-sm font-semibold text-slate-500">Medical History<textarea className={textareaClass} name="medicalHistory" value={form.medicalHistory || ''} onChange={handleChange} /></label>
            <label className="grid gap-2 text-sm font-semibold text-slate-500">Dental History<textarea className={textareaClass} name="dentalHistory" value={form.dentalHistory || ''} onChange={handleChange} /></label>
            <label className="grid gap-2 text-sm font-semibold text-slate-500">Billing Notes<textarea className={textareaClass} name="billingNotes" value={form.billingNotes || ''} onChange={handleChange} /></label>
            <button className="h-12 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white">{editingId ? 'Save Patient' : 'Add Patient'}</button>
          </form>
        </article>

        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patients..." />
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
          {isLoading ? <p className="mt-6 text-sm text-slate-500">Loading patients...</p> : (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient._id} className="border-t border-gray-100">
                      <td className="px-4 py-3"><p className="font-semibold text-sky-950">{fullName(patient)}</p><p className="text-xs text-slate-500">{patient.patientId || 'No Patient ID'}</p></td>
                      <td className="px-4 py-3">{patient.email || patient.contactNumber || 'Not provided'}</td>
                      <td className="px-4 py-3"><StatusPill tone={(patient.status || 'active') === 'active' ? 'emerald' : 'red'}>{patient.status || 'active'}</StatusPill></td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => handleViewPrompt(patient)} className="rounded-xl bg-slate-100 px-3 py-2 text-slate-600" aria-label={`View ${fullName(patient)}`}><FaEye /></button><button type="button" onClick={() => handleEditPrompt(patient)} className="rounded-xl bg-sky-50 px-3 py-2 text-sky-950" aria-label={`Edit ${fullName(patient)}`}><FaEdit /></button><button type="button" onClick={() => handleToggleStatus(patient)} className="rounded-xl bg-red-50 px-3 py-2 text-red-600" aria-label={`Change status for ${fullName(patient)}`}><FaPowerOff /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      {selectedPatient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <div className="flex justify-between gap-4"><div><h2 className="text-2xl font-semibold text-sky-950">{fullName(selectedPatient)}</h2><p className="text-sm text-slate-500">{selectedPatient.email || 'No email'}</p></div><button onClick={() => setSelectedPatient(null)} className="h-10 rounded-xl border px-4 text-sm font-semibold">Close</button></div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl bg-slate-50 p-4"><h3 className="font-semibold text-sky-950">Medical / Dental History</h3><p className="mt-3 text-sm text-slate-600">{selectedPatient.medicalHistory || 'No medical history recorded.'}</p><p className="mt-2 text-sm text-slate-600">{selectedPatient.dentalHistory || 'No dental history recorded.'}</p><p className="mt-2 text-sm text-slate-600">{selectedPatient.billingNotes || 'No billing notes recorded.'}</p></section>
              <section className="rounded-2xl bg-slate-50 p-4"><h3 className="font-semibold text-sky-950">Appointment History</h3>{selectedAppointments.length ? selectedAppointments.map((item) => <p key={item.id} className="mt-2 text-sm text-slate-600">{new Date(item.appointmentDate).toLocaleDateString()} • {item.service} • {item.status}</p>) : <p className="mt-3 text-sm text-slate-500">No appointments found.</p>}</section>
              <section className="rounded-2xl bg-slate-50 p-4 lg:col-span-2"><h3 className="font-semibold text-sky-950">Treatment Records</h3>{selectedRecords.length ? selectedRecords.map((item) => <p key={item._id} className="mt-2 text-sm text-slate-600">{new Date(item.visitDate).toLocaleDateString()} • {item.procedure || item.treatment || 'Treatment'} • {item.dentistName || 'No dentist listed'}</p>) : <p className="mt-3 text-sm text-slate-500">No dental records found.</p>}</section>
            </div>
          </div>
        </div>
      ) : null}

      {confirmation.type ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <form onSubmit={handleConfirmedAction} className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                  <FaShieldAlt className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-sky-950">{confirmation.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{confirmation.description}</p>
                </div>
              </div>
              <button type="button" onClick={closeConfirmation} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close confirmation">
                <FaTimes className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6">
              <PasswordField
                inputClassName={inputClass}
                label="Admin Password"
                name="adminPassword"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeConfirmation} className="h-12 rounded-2xl border border-gray-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={isConfirming} className="h-12 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60">
                {isConfirming ? 'Verifying...' : confirmation.submitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

export default AdminPatientsPage

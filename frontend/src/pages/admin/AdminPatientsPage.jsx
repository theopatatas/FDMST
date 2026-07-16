import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaCalendarAlt,
  FaEdit,
  FaEnvelope,
  FaEye,
  FaMapMarkerAlt,
  FaNotesMedical,
  FaPhone,
  FaPlus,
  FaPowerOff,
  FaRedo,
  FaSearch,
  FaShieldAlt,
  FaTimes,
  FaUser,
  FaUserMd,
  FaUserPlus,
  FaUsers,
  FaVenusMars,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { inputClass } from '../../components/AdminUi.jsx'
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
  allergies: '',
  medicalConditions: '',
  medicalHistory: '',
  dentalHistory: '',
  emergencyContact: '',
  emergencyContactName: '',
  emergencyContactNumber: '',
  username: '',
  assignedDentist: '',
  assignedDentistName: '',
  registrationStatus: 'unverified',
  status: 'active',
}

const patientInputClass =
  'h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const patientIconInputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-12 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const patientTextareaClass =
  'h-12 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const initialConfirmation = {
  type: '',
  title: '',
  description: '',
  submitLabel: '',
  payload: null,
  target: null,
}

function fullName(patient) {
  return [patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Unnamed Patient'
}

function initials(patient) {
  return [patient?.firstName, patient?.lastName].filter(Boolean).map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'FD'
}

function PatientAvatar({ patient, index = 0 }) {
  const colors = ['bg-violet-600', 'bg-pink-500', 'bg-blue-500', 'bg-orange-500', 'bg-teal-500', 'bg-amber-400']

  return (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${colors[index % colors.length]}`}>
      {initials(patient)}
    </span>
  )
}

function patientDisplayStatus(patient) {
  if ((patient?.status || 'active') === 'inactive') return 'Inactive'
  return patient?.registrationStatus === 'verified' ? 'Verified' : 'New'
}

function PatientStatusBadge({ status, registrationStatus }) {
  const normalized = status || 'active'
  if (normalized === 'inactive') {
    return <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-100">Inactive</span>
  }

  if (registrationStatus === 'verified') {
    return <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">Verified</span>
  }

  return (
    <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
      New
    </span>
  )
}

function formatDateTime(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function IconField({ children, icon: Icon }) {
  return (
    <span className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      {children}
    </span>
  )
}

function AdminPatientsPage() {
  const toast = useToast()
  const [patients, setPatients] = useState([])
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [dentists, setDentists] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [dentistFilter, setDentistFilter] = useState('all')
  const [registrationDateFilter, setRegistrationDateFilter] = useState('')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isConfirming, setIsConfirming] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmation, setConfirmation] = useState(initialConfirmation)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [patientResponse, appointmentResponse, recordResponse, dentistResponse] = await Promise.all([
        fdmstApi.list('patients'),
        fdmstApi.getAppointments(),
        fdmstApi.list('dentalrecords'),
        fdmstApi.getDentists(),
      ])
      setPatients(patientResponse.data || [])
      setAppointments(appointmentResponse.data || [])
      setRecords(recordResponse.data || [])
      setDentists(dentistResponse.data || [])
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
      const normalizedStatus = patientDisplayStatus(patient).toLowerCase()
      const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter
      const matchesGender = genderFilter === 'all' || patient.gender === genderFilter
      const matchesDentist = dentistFilter === 'all' || String(patient.assignedDentist || '') === dentistFilter
      const matchesRegistrationDate = !registrationDateFilter || (patient.createdAt || '').slice(0, 10) === registrationDateFilter
      return matchesQuery && matchesStatus && matchesGender && matchesDentist && matchesRegistrationDate
    })
  }, [dentistFilter, genderFilter, patients, query, registrationDateFilter, statusFilter])

  const pageSize = 6
  const totalPages = Math.max(Math.ceil(filteredPatients.length / pageSize), 1)
  const visiblePatients = filteredPatients.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    queueMicrotask(() => setPage(1))
  }, [dentistFilter, genderFilter, query, registrationDateFilter, statusFilter])

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
      return record.patient === selectedPatient.id || record.patient === selectedPatient._id || record.patientName === fullName(selectedPatient)
    }),
    [records, selectedPatient],
  )

  const resetForm = () => {
    setForm(initialForm)
    setEditingId('')
    setFieldErrors({})
  }

  const openCreate = () => {
    resetForm()
    setIsDrawerOpen(true)
  }

  const closeDrawer = () => {
    resetForm()
    setIsDrawerOpen(false)
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
    const nextValue = ['contactNumber', 'emergencyContactNumber'].includes(name) ? digitsOnly(value) : value
    if (name === 'assignedDentist') {
      const dentist = dentists.find((item) => String(item.id) === value)
      setForm((current) => ({ ...current, assignedDentist: value, assignedDentistName: dentist?.name || '' }))
      return
    }
    setForm((current) => ({ ...current, [name]: nextValue }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const validate = () => {
    const errors = {}
    if (!form.firstName.trim()) errors.firstName = 'First name is required.'
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address.'
    const mobileError = validateMobileNumber(form.contactNumber)
    if (mobileError) errors.contactNumber = mobileError
    const emergencyMobileError = form.emergencyContactNumber ? validateMobileNumber(form.emergencyContactNumber) : ''
    if (emergencyMobileError) errors.emergencyContactNumber = emergencyMobileError
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
      allergies: form.allergies.trim(),
      medicalConditions: form.medicalConditions.trim(),
      emergencyContact: form.emergencyContact.trim(),
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactNumber: form.emergencyContactNumber.trim(),
      username: form.username.trim(),
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
      allergies: Array.isArray(patient.allergies) ? patient.allergies.join(', ') : patient.allergies || '',
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : '',
      status: patient.status || 'active',
      medicalConditions: patient.medicalConditions || '',
      emergencyContact: patient.emergencyContact || '',
      emergencyContactName: patient.emergencyContactName || '',
      emergencyContactNumber: patient.emergencyContactNumber || '',
      username: patient.username || '',
      assignedDentist: patient.assignedDentist || '',
      assignedDentistName: patient.assignedDentistName || '',
    })
    setIsDrawerOpen(true)
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
        closeDrawer()
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
      <section className="flex min-h-[52rem] flex-col rounded-[1.35rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
                <FaUsers className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-sky-950">Patient List</h2>
                <p className="mt-1 text-sm text-slate-500">View and manage all patient records.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 px-5 pb-4 xl:grid-cols-[minmax(360px,1fr)_auto] xl:items-center">
            <label className="relative block">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input className={`${patientIconInputClass} h-11 pl-11`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, contact, or email..." />
            </label>
            <button type="button" onClick={openCreate} className="inline-flex h-11 whitespace-nowrap items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-bold text-white transition hover:bg-sky-900">
              <FaPlus className="h-4 w-4" aria-hidden="true" />
              Add Patient
            </button>
          </div>

          <div className="grid items-center gap-3 border-b border-slate-100 px-5 pb-5 md:grid-cols-2 xl:grid-cols-[170px_170px_190px_190px_auto_auto]">
            <select className={`${patientInputClass} h-11`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Statuses</option><option value="new">New</option><option value="verified">Verified</option><option value="inactive">Inactive</option>
            </select>
            <select className={`${patientInputClass} h-11`} value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}>
              <option value="all">All Genders</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            <select className={`${patientInputClass} h-11`} value={dentistFilter} onChange={(event) => setDentistFilter(event.target.value)}>
              <option value="all">All Dentists</option>
              {dentists.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>{dentist.name}</option>
              ))}
            </select>
            <input className={`${patientInputClass} h-11`} type="date" value={registrationDateFilter} onChange={(event) => setRegistrationDateFilter(event.target.value)} aria-label="Registration date" />
            <button type="button" onClick={loadData} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-sky-950" aria-label="Refresh patients"><FaRedo className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" onClick={() => { setQuery(''); setStatusFilter('all'); setGenderFilter('all'); setDentistFilter('all'); setRegistrationDateFilter('') }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-sky-950">
              <FaTimes className="h-4 w-4" aria-hidden="true" />
              Clear
            </button>
          </div>

          {isLoading ? <p className="p-6 text-sm text-slate-500">Loading patients...</p> : filteredPatients.length ? (
            <>
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Patient ID</th><th className="px-5 py-4">Patient Name</th><th className="px-5 py-4">Contact Number</th><th className="px-5 py-4">Email</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Registration Date</th><th className="px-5 py-4">Assigned Dentist</th><th className="px-5 py-4 text-right">Actions</th></tr></thead>
                <tbody>
                  {visiblePatients.map((patient, index) => {
                    return (
                    <tr key={patient._id} className="border-t border-slate-100">
                      <td className="px-5 py-5"><div className="flex items-center gap-3"><PatientAvatar patient={patient} index={index} /><span className="text-xs font-medium text-slate-500">{patient.patientId || 'No Patient ID'}</span></div></td>
                      <td className="px-5 py-5 font-semibold text-sky-950">{fullName(patient)}</td>
                      <td className="px-5 py-5 text-slate-700">{patient.contactNumber || 'Not provided'}</td>
                      <td className="px-5 py-5 text-slate-700">{patient.email || 'Not provided'}</td>
                      <td className="px-5 py-5"><PatientStatusBadge status={patient.status} registrationStatus={patient.registrationStatus} /></td>
                      <td className="px-5 py-5 text-slate-600">{formatDateTime(patient.createdAt)}</td>
                      <td className="px-5 py-5 text-slate-600">{patient.assignedDentistName || 'Unassigned'}</td>
                      <td className="px-5 py-5"><div className="flex justify-end gap-2"><button type="button" onClick={() => handleViewPrompt(patient)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label={`View ${fullName(patient)}`}><FaEye /></button><button type="button" onClick={() => handleEditPrompt(patient)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-950 transition hover:bg-sky-100" aria-label={`Edit ${fullName(patient)}`}><FaEdit /></button><button type="button" onClick={() => handleToggleStatus(patient)} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${(patient.status || 'active') === 'active' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`} aria-label={`Change status for ${fullName(patient)}`}><FaPowerOff /></button></div></td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-auto flex flex-col gap-3 border-t border-slate-100 px-5 py-5 text-sm font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <p>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredPatients.length)} of {filteredPatients.length} patients</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page === 1} className="h-10 rounded-xl border border-slate-200 px-3 text-sky-950 disabled:opacity-40">‹</button>
                {Array.from({ length: totalPages }).slice(0, 3).map((_, index) => {
                  const pageNumber = index + 1
                  return <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={`h-10 min-w-10 rounded-xl border px-3 font-semibold ${page === pageNumber ? 'border-sky-950 bg-sky-950 text-white' : 'border-slate-200 text-sky-950'}`}>{pageNumber}</button>
                })}
                <button type="button" onClick={() => setPage((current) => Math.min(current + 1, totalPages))} disabled={page === totalPages} className="h-10 rounded-xl border border-slate-200 px-3 text-sky-950 disabled:opacity-40">›</button>
              </div>
            </div>
            </>
          ) : (
            <div className="m-5 rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
              No patient records match your filters.
            </div>
          )}
      </section>

      {selectedPatient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <div className="flex justify-between gap-4"><div><h2 className="text-2xl font-semibold text-sky-950">{fullName(selectedPatient)}</h2><p className="text-sm text-slate-500">{selectedPatient.email || 'No email'}</p></div><button onClick={() => setSelectedPatient(null)} className="h-10 rounded-xl border px-4 text-sm font-semibold">Close</button></div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl bg-slate-50 p-4">
                <h3 className="font-semibold text-sky-950">Personal Information</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <p>Patient ID: {selectedPatient.patientId || '—'}</p>
                  <p>Date of Birth: {selectedPatient.dateOfBirth ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : '—'}</p>
                  <p>Gender: {(selectedPatient.gender || 'prefer_not_to_say').replaceAll('_', ' ')}</p>
                  <p>Contact: {selectedPatient.contactNumber || '—'}</p>
                  <p>Address: {selectedPatient.address || '—'}</p>
                </div>
              </section>
              <section className="rounded-2xl bg-slate-50 p-4">
                <h3 className="font-semibold text-sky-950">Account Information</h3>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <p>Status: {patientDisplayStatus(selectedPatient)}</p>
                  <p>Verification: {selectedPatient.registrationStatus === 'verified' ? 'Verified' : 'New'}</p>
                  <p>Verified At: {selectedPatient.verifiedAt ? formatDateTime(selectedPatient.verifiedAt) : '—'}</p>
                  <p>Assigned Dentist: {selectedPatient.assignedDentistName || 'Unassigned'}</p>
                  <p>Registered: {formatDateTime(selectedPatient.createdAt)}</p>
                </div>
              </section>
              <section className="rounded-2xl bg-slate-50 p-4 lg:col-span-2"><h3 className="font-semibold text-sky-950">Medical / Dental History</h3><p className="mt-3 text-sm text-slate-600">{selectedPatient.allergies?.length ? `Allergies: ${selectedPatient.allergies.join(', ')}` : 'No allergies recorded.'}</p><p className="mt-2 text-sm text-slate-600">{selectedPatient.medicalConditions ? `Medical Conditions: ${selectedPatient.medicalConditions}` : 'No medical conditions recorded.'}</p><p className="mt-2 text-sm text-slate-600">{selectedPatient.emergencyContact || selectedPatient.emergencyContactName || selectedPatient.emergencyContactNumber ? `Emergency Contact: ${[selectedPatient.emergencyContact, selectedPatient.emergencyContactName, selectedPatient.emergencyContactNumber].filter(Boolean).join(' • ')}` : 'No emergency contact recorded.'}</p><p className="mt-2 text-sm text-slate-600">{selectedPatient.medicalHistory || 'No medical history recorded.'}</p><p className="mt-2 text-sm text-slate-600">{selectedPatient.dentalHistory || 'No dental history recorded.'}</p></section>
              <section className="rounded-2xl bg-slate-50 p-4"><h3 className="font-semibold text-sky-950">Appointment History</h3>{selectedAppointments.length ? selectedAppointments.map((item) => <p key={item.id} className="mt-2 text-sm text-slate-600">{new Date(item.appointmentDate).toLocaleDateString()} • {item.service} • {item.status}</p>) : <p className="mt-3 text-sm text-slate-500">No appointments found.</p>}</section>
              <section className="rounded-2xl bg-slate-50 p-4"><h3 className="font-semibold text-sky-950">Clinical Notes</h3>{selectedRecords.filter((item) => item.recordType === 'clinical_note' || item.clinicalNotes).length ? selectedRecords.filter((item) => item.recordType === 'clinical_note' || item.clinicalNotes).map((item) => <p key={item._id} className="mt-2 text-sm text-slate-600">{new Date(item.visitDate || item.createdAt).toLocaleDateString()} • {item.noteType || 'Clinical Note'} • {item.createdByName || item.dentistName || 'Provider'}</p>) : <p className="mt-3 text-sm text-slate-500">No clinical notes found.</p>}</section>
              <section className="rounded-2xl bg-slate-50 p-4 lg:col-span-2"><h3 className="font-semibold text-sky-950">Treatment Records</h3>{selectedRecords.length ? selectedRecords.filter((item) => item.recordType !== 'clinical_note').map((item) => <p key={item._id} className="mt-2 text-sm text-slate-600">{new Date(item.visitDate).toLocaleDateString()} • {item.procedure || item.treatment || 'Treatment'} • {item.dentistName || 'No dentist listed'}</p>) : <p className="mt-3 text-sm text-slate-500">No dental records found.</p>}</section>
            </div>
          </div>
        </div>
      ) : null}

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={closeDrawer} aria-label="Close patient drawer" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl min-w-0 flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Patients</p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-sky-950">{editingId ? 'Edit Patient' : 'Add Patient'}</h2>
                <p className="mt-1 text-sm text-slate-500">Patient account changes require admin password verification.</p>
              </div>
              <button type="button" onClick={closeDrawer} className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close drawer">
                <FaTimes className="h-5 w-5" />
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
              <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-6 sm:grid-cols-2 sm:px-6">
                <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm font-semibold leading-6 text-blue-800 sm:col-span-2">
                  <FaShieldAlt className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>Sensitive patient changes require admin password verification before saving.</p>
                </div>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  First Name
                  <IconField icon={FaUser}>
                    <input className={patientIconInputClass} name="firstName" value={form.firstName} onChange={handleChange} placeholder="Enter first name" required />
                  </IconField>
                  {fieldErrors.firstName ? <span className="text-xs font-medium text-red-600">{fieldErrors.firstName}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Last Name
                  <IconField icon={FaUser}>
                    <input className={patientIconInputClass} name="lastName" value={form.lastName} onChange={handleChange} placeholder="Enter last name" required />
                  </IconField>
                  {fieldErrors.lastName ? <span className="text-xs font-medium text-red-600">{fieldErrors.lastName}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Birth Date
                  <IconField icon={FaCalendarAlt}>
                    <input className={patientIconInputClass} name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Gender
                  <IconField icon={FaVenusMars}>
                    <select className={patientIconInputClass} name="gender" value={form.gender} onChange={handleChange}>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Email
                  <IconField icon={FaEnvelope}>
                    <input className={patientIconInputClass} type="email" name="email" value={form.email} onChange={handleChange} placeholder="Enter email address" />
                  </IconField>
                  {fieldErrors.email ? <span className="text-xs font-medium text-red-600">{fieldErrors.email}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Mobile Number
                  <IconField icon={FaPhone}>
                    <input className={patientIconInputClass} name="contactNumber" inputMode="numeric" maxLength={11} value={form.contactNumber} onChange={handleChange} placeholder="09XXXXXXXXX" />
                  </IconField>
                  {fieldErrors.contactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Address
                  <IconField icon={FaMapMarkerAlt}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="address" value={form.address || ''} onChange={handleChange} placeholder="Enter full address" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Assigned Dentist
                  <IconField icon={FaUserMd}>
                    <select className={patientIconInputClass} name="assignedDentist" value={form.assignedDentist || ''} onChange={handleChange}>
                      <option value="">No assigned dentist</option>
                      {dentists.map((dentist) => (
                        <option key={dentist.id} value={dentist.id}>{dentist.name}</option>
                      ))}
                    </select>
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Allergies
                  <IconField icon={FaNotesMedical}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="allergies" value={form.allergies || ''} onChange={handleChange} placeholder="Enter allergies (optional)" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Medical Conditions
                  <IconField icon={FaNotesMedical}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="medicalConditions" value={form.medicalConditions || ''} onChange={handleChange} placeholder="Enter medical conditions (optional)" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Medical History
                  <IconField icon={FaNotesMedical}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="medicalHistory" value={form.medicalHistory || ''} onChange={handleChange} placeholder="Enter medical history (optional)" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Dental History
                  <IconField icon={FaNotesMedical}>
                    <textarea className={`${patientTextareaClass} min-h-24 pl-12`} name="dentalHistory" value={form.dentalHistory || ''} onChange={handleChange} placeholder="Enter dental history (optional)" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Emergency Contact
                  <IconField icon={FaPhone}>
                    <input className={patientIconInputClass} name="emergencyContact" value={form.emergencyContact || ''} onChange={handleChange} placeholder="Name and relationship" />
                  </IconField>
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Emergency Contact Number
                  <IconField icon={FaPhone}>
                    <input className={patientIconInputClass} name="emergencyContactNumber" inputMode="numeric" maxLength={11} value={form.emergencyContactNumber || ''} onChange={handleChange} placeholder="09XXXXXXXXX" />
                  </IconField>
                  {fieldErrors.emergencyContactNumber ? <span className="text-xs font-medium text-red-600">{fieldErrors.emergencyContactNumber}</span> : null}
                </label>
                <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Username
                  <IconField icon={FaUser}>
                    <input className={patientIconInputClass} name="username" value={form.username || ''} onChange={handleChange} placeholder="Optional account username" />
                  </IconField>
                  {fieldErrors.username ? <span className="text-xs font-medium text-red-600">{fieldErrors.username}</span> : null}
                </label>
              </div>

              <div className="grid gap-3 border-t border-slate-100 bg-white px-5 py-5 sm:flex sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={closeDrawer} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-900">
                  {editingId ? 'Save Patient' : 'Create Patient'}
                </button>
              </div>
            </form>
          </aside>
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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaEdit, FaPowerOff, FaShieldAlt, FaUndo } from 'react-icons/fa'
import { FaTimes } from 'react-icons/fa'
import { useLocation, useNavigate } from 'react-router-dom'
import { fdmstApi } from '../../api/fdmstApi.js'
import PasswordField from '../../components/PasswordField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const inputClass =
  'h-12 rounded-2xl border border-gray-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'staff',
  contactNumber: '',
}

const initialConfirmation = {
  action: '',
  title: '',
  description: '',
  submitLabel: '',
  target: null,
  status: '',
}

function formatRole(role) {
  return role === 'dentist' ? 'Dentist' : 'Staff'
}

function StatusBadge({ status }) {
  const isActive = status === 'active'

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        isActive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-red-50 text-red-700 ring-1 ring-red-100'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  )
}

function AdminStaffPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [staff, setStaff] = useState([])
  const [form, setForm] = useState(initialForm)
  const [isAccessVerified, setIsAccessVerified] = useState(false)
  const [accessPassword, setAccessPassword] = useState('')
  const [accessError, setAccessError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [editingStaffId, setEditingStaffId] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmation, setConfirmation] = useState(initialConfirmation)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isEditing = Boolean(editingStaffId)

  const sortedStaff = useMemo(
    () =>
      [...staff].sort((left, right) => {
        if (left.status !== right.status) return left.status === 'active' ? -1 : 1
        return `${left.firstName} ${left.lastName}`.localeCompare(`${right.firstName} ${right.lastName}`)
      }),
    [staff],
  )

  const loadStaff = useCallback(async () => {
    try {
      const response = await fdmstApi.getStaff()
      setStaff(response.data || [])
    } catch (loadError) {
      toast.error(loadError.message || 'Unable to load staff accounts right now.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  const lockedFallbackPath = location.state?.from && location.state.from !== '/admin/staff'
    ? location.state.from
    : '/admin'

  useEffect(() => {
    if (!isAccessVerified) return

    Promise.resolve().then(loadStaff)
  }, [isAccessVerified, loadStaff])

  const handleAccessSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setAccessError('')

    try {
      await fdmstApi.verifyAdminPassword(accessPassword)
      setIsAccessVerified(true)
      setAccessPassword('')
      toast.success('Staff Management access verified.')
    } catch (accessVerifyError) {
      const message = accessVerifyError.message || 'Admin password could not be verified.'
      setAccessError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAccessDismiss = useCallback(() => {
    setAccessPassword('')
    setAccessError('')
    toast.info('Staff Management remains locked.')
    navigate(lockedFallbackPath, { replace: true })
  }, [lockedFallbackPath, navigate, toast])

  useEffect(() => {
    if (isAccessVerified) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleAccessDismiss()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleAccessDismiss, isAccessVerified])

  const resetForm = () => {
    setForm(initialForm)
    setEditingStaffId('')
    setFieldErrors({})
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    const nextValue = name === 'contactNumber' ? digitsOnly(value) : value

    setForm((currentForm) => ({
      ...currentForm,
      [name]: nextValue,
    }))

    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: '',
    }))
  }

  const validateForm = () => {
    const nextErrors = {}

    if (!form.firstName.trim()) nextErrors.firstName = 'First name is required.'
    if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required.'
    if (!form.email.trim()) nextErrors.email = 'Email is required.'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address.'
    }

    if (!isEditing && form.password.length < 8) {
      nextErrors.password = 'Temporary password must be at least 8 characters long.'
    }

    const mobileError = validateMobileNumber(form.contactNumber)

    if (mobileError) {
      nextErrors.contactNumber = mobileError
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const openConfirmation = (nextConfirmation) => {
    setAdminPassword('')
    setConfirmation(nextConfirmation)
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!validateForm()) {
      toast.error('Please fix the highlighted fields.')
      return
    }

    openConfirmation({
      action: isEditing ? 'update' : 'create',
      title: isEditing ? 'Confirm Staff Update' : 'Confirm Staff Creation',
      description: isEditing
        ? 'Re-enter your admin password to save changes to this staff account.'
        : `Re-enter your admin password to create this ${formatRole(form.role).toLowerCase()} account.`,
      submitLabel: isEditing ? 'Verify and Save' : 'Verify and Create',
      target: editingStaffId,
      status: '',
    })
  }

  const handleEdit = (member) => {
    setEditingStaffId(member.id)
    setForm({
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: member.email || '',
      password: '',
      role: member.role === 'dentist' ? 'dentist' : 'staff',
      contactNumber: member.contactNumber || '',
    })
    setFieldErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleStatusPrompt = (member) => {
    const nextStatus = member.status === 'active' ? 'inactive' : 'active'

    openConfirmation({
      action: 'status',
      title: nextStatus === 'active' ? 'Activate Staff Account' : 'Deactivate Staff Account',
      description:
        nextStatus === 'active'
          ? `Re-enter your admin password to restore access for ${member.firstName} ${member.lastName}.`
          : `Re-enter your admin password to block portal access for ${member.firstName} ${member.lastName}.`,
      submitLabel: nextStatus === 'active' ? 'Verify and Activate' : 'Verify and Deactivate',
      target: member,
      status: nextStatus,
    })
  }

  const applyServerErrors = (error) => {
    setFieldErrors(error.errors || {})
    toast.error(error.message || 'Unable to save changes. Please review the form and try again.')
  }

  const handleConfirmedAction = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      let response

      if (confirmation.action === 'status') {
        response = await fdmstApi.updateStaffStatus(confirmation.target.id, {
          status: confirmation.status,
          adminPassword,
        })

        setStaff((currentStaff) =>
          currentStaff.map((member) =>
            member.id === response.user.id ? response.user : member,
          ),
        )
      } else if (confirmation.action === 'update') {
        response = await fdmstApi.updateStaff(editingStaffId, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          role: form.role,
          contactNumber: form.contactNumber,
          adminPassword,
        })

        setStaff((currentStaff) =>
          currentStaff.map((member) =>
            member.id === response.user.id ? response.user : member,
          ),
        )
        resetForm()
      } else {
        response = await fdmstApi.createStaff({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          contactNumber: form.contactNumber,
          adminPassword,
        })

        setStaff((currentStaff) => [response.user, ...currentStaff])
        resetForm()
      }

      toast.success(response.message || 'Staff account updated successfully.')
      setAdminPassword('')
      setConfirmation(initialConfirmation)
    } catch (submitError) {
      applyServerErrors(submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Staff Management</p>
        <h1 className="mt-2 text-3xl font-semibold text-sky-950">Clinic Staff</h1>
        <p className="mt-2 text-slate-500">
          Manage staff and dentist accounts with admin-verified security checks.
        </p>
      </div>

      {!isAccessVerified ? (
        <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800 shadow-sm">
          Staff Management is locked. Re-enter your admin password to continue.
        </div>
      ) : null}

      <section className={`grid gap-8 xl:grid-cols-[24rem_1fr] ${isAccessVerified ? '' : 'pointer-events-none mt-6 opacity-35 blur-[1px]'}`}>
        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-sky-950">
                {isEditing ? 'Edit Staff Account' : 'Add Staff Account'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Sensitive staff changes require admin password verification.
              </p>
            </div>
            {isEditing ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-gray-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-sky-950"
                aria-label="Cancel editing"
              >
                <FaUndo className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              First Name
              <input
                className={inputClass}
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                required
              />
              {fieldErrors.firstName ? <span className="text-xs font-medium text-red-600">{fieldErrors.firstName}</span> : null}
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Last Name
              <input
                className={inputClass}
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                required
              />
              {fieldErrors.lastName ? <span className="text-xs font-medium text-red-600">{fieldErrors.lastName}</span> : null}
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Email
              <input
                className={inputClass}
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
              />
              {fieldErrors.email ? <span className="text-xs font-medium text-red-600">{fieldErrors.email}</span> : null}
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Mobile Number
              <input
                className={inputClass}
                type="tel"
                name="contactNumber"
                inputMode="numeric"
                maxLength={11}
                placeholder="09XXXXXXXXX"
                value={form.contactNumber}
                onChange={handleChange}
              />
              {fieldErrors.contactNumber ? (
                <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span>
              ) : null}
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Role
              <select className={inputClass} name="role" value={form.role} onChange={handleChange}>
                <option value="staff">Staff</option>
                <option value="dentist">Dentist</option>
              </select>
            </label>

            {!isEditing ? (
              <>
                <PasswordField
                  inputClassName={inputClass}
                  label="Temporary Password"
                  name="password"
                  minLength={8}
                  value={form.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  required
                />
                {fieldErrors.password ? <span className="-mt-2 text-xs font-medium text-red-600">{fieldErrors.password}</span> : null}
              </>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-12 rounded-2xl bg-sky-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isEditing ? 'Save Staff Changes' : 'Create Staff Account'}
            </button>
          </form>
        </article>

        <article className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-sky-950">Current Staff</h2>
              <p className="mt-2 text-sm text-slate-500">Activate, deactivate, and update staff access.</p>
            </div>
            <span className="text-sm font-medium text-slate-400">{staff.length} accounts</span>
          </div>

          {isLoading ? (
            <p className="mt-6 text-sm text-slate-500">Loading staff accounts...</p>
          ) : sortedStaff.length ? (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Mobile</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStaff.map((member) => (
                    <tr key={member.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-3 font-medium text-sky-950">
                        {[member.firstName, member.lastName].filter(Boolean).join(' ')}
                      </td>
                      <td className="px-4 py-3">{member.email}</td>
                      <td className="px-4 py-3">{member.contactNumber || 'Not provided'}</td>
                      <td className="px-4 py-3">{formatRole(member.role)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={member.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(member)}
                            className="inline-flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 transition hover:bg-sky-100"
                          >
                            <FaEdit className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusPrompt(member)}
                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                              member.status === 'active'
                                ? 'border-red-100 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            <FaPowerOff className="h-3.5 w-3.5" aria-hidden="true" />
                            {member.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
              No staff accounts yet. Create the first one using the form.
            </div>
          )}
        </article>
      </section>

      {!isAccessVerified ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleAccessDismiss()
            }
          }}
        >
          <form
            className="w-full max-w-md animate-[fadeIn_180ms_ease-out] rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-2xl"
            onSubmit={handleAccessSubmit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <FaShieldAlt className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                    Admin Verification
                  </p>
                  <h2 className="text-xl font-semibold text-sky-950">Unlock Staff Management</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAccessDismiss}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-100"
                aria-label="Close Staff Management unlock modal"
              >
                <FaTimes className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">
              Re-enter your admin password before viewing or managing staff accounts.
            </p>

            <div className="mt-6">
              <PasswordField
                inputClassName={inputClass}
                label="Admin Password"
                name="staffAccessPassword"
                value={accessPassword}
                onChange={(event) => {
                  setAccessPassword(event.target.value)
                  setAccessError('')
                }}
                autoComplete="current-password"
                required
              />
              {accessError ? <p className="mt-2 text-xs font-medium text-red-600">{accessError}</p> : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleAccessDismiss}
                disabled={isSubmitting}
                className="h-12 rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Verifying...' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {confirmation.action ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <form
            className="w-full max-w-md rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-2xl"
            onSubmit={handleConfirmedAction}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <FaShieldAlt className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                  Admin Verification
                </p>
                <h2 className="text-xl font-semibold text-sky-950">{confirmation.title}</h2>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">{confirmation.description}</p>

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
              <button
                type="button"
                onClick={() => {
                  setConfirmation(initialConfirmation)
                  setAdminPassword('')
                }}
                disabled={isSubmitting}
                className="h-12 rounded-2xl border border-gray-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 rounded-2xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Verifying...' : confirmation.submitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

export default AdminStaffPage

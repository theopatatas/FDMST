import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  FaAddressCard,
  FaBirthdayCake,
  FaCamera,
  FaEnvelope,
  FaHeart,
  FaIdBadge,
  FaLock,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaSave,
  FaShieldAlt,
  FaTrash,
  FaUser,
  FaUserEdit,
  FaVenusMars,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../api/fdmstApi.js'
import PasswordField from '../components/PasswordField.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../utils/validation.js'

const inputClass =
  'h-14 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const emptyPasswordFields = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

function userToForm(user) {
  return {
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    contactNumber: user?.contactNumber || '',
    profilePhoto: user?.profilePhoto || '',
    ...emptyPasswordFields,
  }
}

function getDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'FDMST User'
}

function getInitials(user) {
  return [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((name) => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'FD'
}

function formatAccountStatus(status) {
  const labels = {
    active_admin: 'Active Admin',
    active_staff: 'Active Staff',
    inactive: 'Inactive',
    unverified_user: 'Pending Verification',
    verified_patient: 'Verified Patient',
  }

  return labels[status] || status || 'Not provided'
}

function formatDate(value) {
  if (!value) return 'Not provided'

  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatGender(value) {
  const labels = {
    female: 'Female',
    male: 'Male',
    other: 'Other',
    prefer_not_to_say: 'Prefer not to say',
  }

  return labels[value] || 'Not provided'
}

function DetailCard({ icon: Icon, label, value, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    slate: 'bg-slate-50 text-slate-600 ring-slate-100',
  }

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 break-words text-sm font-semibold leading-6 text-sky-950">{value || 'Not provided'}</p>
        </div>
      </div>
    </article>
  )
}

function ProfilePage() {
  const toast = useToast()
  const outletContext = useOutletContext()
  const layoutUser = outletContext?.user
  const setLayoutUser = outletContext?.setUser
  const [form, setForm] = useState(() => userToForm(layoutUser || authStorage.getUser()))
  const [isSaving, setIsSaving] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const user = useMemo(() => layoutUser || authStorage.getUser(), [layoutUser])
  const patient = user?.patient || {}

  useEffect(() => {
    if (!user) return

    let isActive = true

    queueMicrotask(() => {
      if (!isActive) return
      setForm((currentForm) => ({
        ...userToForm(user),
        profilePhoto: currentForm.profilePhoto || user.profilePhoto || '',
        ...emptyPasswordFields,
      }))
    })

    return () => {
      isActive = false
    }
  }, [user])

  const handleChange = useCallback((event) => {
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
  }, [])

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    setPhotoError('')

    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Use a JPG, PNG, or WebP image.')
      event.target.value = ''
      return
    }

    if (file.size > 550 * 1024) {
      setPhotoError('Use an image under 550 KB.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      setForm((currentForm) => ({
        ...currentForm,
        profilePhoto: reader.result,
      }))
    }

    reader.readAsDataURL(file)
  }

  const validateForm = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      return 'First name, last name, and email are required.'
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Enter a valid email address.'
    }

    const mobileError = validateMobileNumber(form.contactNumber)

    if (mobileError) {
      setFieldErrors({ contactNumber: mobileError })
      return mobileError
    }

    const wantsPasswordChange =
      form.currentPassword || form.newPassword || form.confirmPassword

    if (wantsPasswordChange) {
      if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
        return 'Fill in all password fields to change your password.'
      }

      if (form.newPassword.length < 8) {
        return 'New password must be at least 8 characters long.'
      }

      if (form.newPassword !== form.confirmPassword) {
        return 'New password and confirmation do not match.'
      }

      if (form.currentPassword === form.newPassword) {
        return 'New password must be different from your current password.'
      }
    }

    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const validationError = validateForm()

    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSaving(true)

    try {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        contactNumber: form.contactNumber.trim(),
        profilePhoto: form.profilePhoto,
      }

      if (form.newPassword) {
        payload.currentPassword = form.currentPassword
        payload.newPassword = form.newPassword
        payload.confirmPassword = form.confirmPassword
      }

      const response = await fdmstApi.updateProfile(payload)

      setForm((currentForm) => ({
        ...currentForm,
        ...emptyPasswordFields,
      }))

      if (response.user) {
        setLayoutUser?.(response.user)
      }

      setFieldErrors({})
      toast.success(response.message || 'Profile updated successfully.')
    } catch (saveError) {
      setFieldErrors(saveError.errors || {})
      toast.error(saveError.message || 'Failed to update profile.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 overflow-hidden rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">Profile</p>
              <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Account Overview</h2>
              <p className="mt-3 max-w-2xl text-sky-100">
                View your patient profile, contact details, account status, and security settings in one place.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href="#profile-form"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-sky-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-50"
              >
                <FaUserEdit className="h-4 w-4" aria-hidden="true" />
                Edit Profile
              </a>
              <a
                href="#password-section"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-semibold text-sky-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-300"
              >
                <FaLock className="h-4 w-4" aria-hidden="true" />
                Change Password
              </a>
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailCard icon={FaIdBadge} label="Patient ID" value={patient.patientId || user?.id} tone="amber" />
          <DetailCard icon={FaShieldAlt} label="Account Status" value={formatAccountStatus(user?.accountStatus)} tone="emerald" />
          <DetailCard icon={FaPhoneAlt} label="Contact Number" value={user?.contactNumber} />
          <DetailCard icon={FaEnvelope} label="Email Address" value={user?.email} />
          <DetailCard icon={FaBirthdayCake} label="Date of Birth" value={formatDate(patient.dateOfBirth)} tone="rose" />
          <DetailCard icon={FaVenusMars} label="Gender" value={formatGender(patient.gender)} tone="slate" />
          <DetailCard icon={FaMapMarkerAlt} label="Address" value={patient.address} />
          <DetailCard
            icon={FaAddressCard}
            label="Emergency Contact"
            value={[patient.emergencyContactName, patient.emergencyContactNumber].filter(Boolean).join(' - ')}
            tone="amber"
          />
        </section>

        <section className="mb-8 grid gap-4 lg:grid-cols-2">
          <DetailCard
            icon={FaHeart}
            label="Medical Information"
            value={patient.medicalHistory || (patient.allergies?.length ? `Allergies: ${patient.allergies.join(', ')}` : '')}
            tone="rose"
          />
          <DetailCard
            icon={FaUser}
            label="Dental Information"
            value={patient.dentalHistory}
            tone="sky"
          />
        </section>

        <form id="profile-form" className="grid gap-6 xl:grid-cols-[20rem_1fr]" onSubmit={handleSubmit}>
          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              {form.profilePhoto ? (
                <img
                  src={form.profilePhoto}
                  alt=""
                  className="h-32 w-32 rounded-full object-cover ring-4 ring-sky-50"
                />
              ) : (
                <span className="flex h-32 w-32 items-center justify-center rounded-full bg-sky-950 text-3xl font-semibold text-amber-400 ring-4 ring-sky-50">
                  {getInitials(user)}
                </span>
              )}

              <h3 className="mt-4 text-lg font-semibold text-sky-950">{getDisplayName(user)}</h3>
              <p className="mt-1 text-sm capitalize text-slate-500">{user?.role || 'User'}</p>

              <div className="mt-6 grid w-full gap-3">
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 transition hover:border-sky-200 hover:bg-sky-100">
                  <FaCamera className="h-4 w-4" aria-hidden="true" />
                  Change Photo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={handlePhotoChange}
                  />
                </label>

                {form.profilePhoto ? (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        profilePhoto: '',
                      }))
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    <FaTrash className="h-4 w-4" aria-hidden="true" />
                    Remove Photo
                  </button>
                ) : null}
              </div>

              {photoError ? <p className="mt-3 text-sm font-medium text-red-600">{photoError}</p> : null}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-950">
                <FaUser className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-sky-950">Personal Information</h3>
                <p className="text-sm text-slate-500">Changes are saved to your account.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                First Name
                <input
                  className={inputClass}
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                />
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
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Phone Number
                <input
                  className={inputClass}
                  type="tel"
                  name="contactNumber"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.contactNumber}
                  onChange={handleChange}
                  placeholder="09XXXXXXXXX"
                />
                {fieldErrors.contactNumber ? (
                  <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span>
                ) : null}
              </label>
            </div>

            <div id="password-section" className="mt-8 flex items-center gap-3 border-b border-gray-100 pb-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <FaLock className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-sky-950">Password</h3>
                <p className="text-sm text-slate-500">Leave blank to keep your current password.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-5">
              <PasswordField
                inputClassName={inputClass}
                label="Current Password"
                name="currentPassword"
                value={form.currentPassword}
                onChange={handleChange}
                autoComplete="current-password"
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <PasswordField
                  inputClassName={inputClass}
                  label="New Password"
                  name="newPassword"
                  value={form.newPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />

                <PasswordField
                  inputClassName={inputClass}
                  label="Confirm New Password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-sky-950 px-6 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FaSave className="h-4 w-4" aria-hidden="true" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </section>
        </form>
      </div>
    </main>
  )
}

export default ProfilePage

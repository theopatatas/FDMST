import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fdmstApi } from '../api/fdmstApi.js'
import { useToast } from '../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../utils/validation.js'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  dateOfBirth: '',
  password: '',
  confirmPassword: '',
  acceptedPrivacy: false,
}

const inputClass =
  'h-14 rounded-2xl border border-gray-200 bg-white px-5 text-base font-normal text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return ''

  const birthDate = new Date(dateOfBirth)
  const today = new Date()

  if (Number.isNaN(birthDate.getTime()) || birthDate > today) return ''

  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDifference = today.getMonth() - birthDate.getMonth()
  const hasBirthdayPassed =
    monthDifference > 0 ||
    (monthDifference === 0 && today.getDate() >= birthDate.getDate())

  if (!hasBirthdayPassed) {
    age -= 1
  }

  return age >= 0 ? String(age) : ''
}

function EyeIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function UserPlusIcon() {
  return (
    <svg
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  )
}

function ToothIcon() {
  return (
    <svg
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8.5 3.5c1.7 0 2.3.8 3.5.8s1.8-.8 3.5-.8C18.4 3.5 20 6 20 8.5c0 3.4-2.2 5.2-3 9-.4 1.9-1.2 3-2.3 3-1.3 0-1.3-1.7-2.7-1.7s-1.4 1.7-2.7 1.7c-1.1 0-1.9-1.1-2.3-3-.8-3.8-3-5.6-3-9C4 6 5.6 3.5 8.5 3.5Z" />
    </svg>
  )
}

function RegisterPage() {
  const toast = useToast()
  const [form, setForm] = useState(initialForm)
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const age = useMemo(() => calculateAge(form.dateOfBirth), [form.dateOfBirth])

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target
    const nextValue = name === 'contactNumber' ? digitsOnly(value) : value

    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'checkbox' ? checked : nextValue,
    }))
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.acceptedPrivacy) {
      toast.error('Please agree to the personal information consent before creating an account.')
      return
    }

    if (!age) {
      toast.error('Please enter a valid birth date.')
      return
    }

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }

    const mobileError = validateMobileNumber(form.contactNumber)

    if (mobileError) {
      setFieldErrors({ contactNumber: mobileError })
      toast.error(mobileError)
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fdmstApi.register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        contactNumber: form.contactNumber.trim(),
        dateOfBirth: form.dateOfBirth,
        password: form.password,
      })

      toast.success(
        `Registration successful. Your Patient ID is ${response.patient.patientId}. Your account is currently unverified until your first completed clinic appointment.`,
      )
      setForm(initialForm)
      setFieldErrors({})
    } catch (registerError) {
      setFieldErrors(registerError.errors || {})
      toast.error(registerError.message || 'Registration failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-700 lg:grid lg:grid-cols-2">
      <section className="relative min-h-[48rem] overflow-hidden bg-sky-950 px-8 py-10 text-white sm:px-12 lg:min-h-screen lg:px-16">
        <div className="absolute left-28 top-28 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-36 right-20 h-[34rem] w-[34rem] rounded-full bg-white/5" />

        <div className="relative z-10 flex min-h-full flex-col">
          <Link
            className="inline-flex w-fit items-center gap-3 text-sm font-medium text-sky-200 transition hover:text-white"
            to="/"
          >
            <span className="text-2xl leading-none">←</span>
            Back to Clinic Website
          </Link>

          <div className="mt-16 flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg">
              <ToothIcon />
            </span>
            <div>
              <p className="text-2xl font-semibold leading-tight">Flores-Dizon Dental</p>
              <p className="mt-1 text-base font-medium text-sky-200">Clinic Management System</p>
            </div>
          </div>

          <div className="mt-20 max-w-xl">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Create your patient account today.
            </h1>
            <p className="mt-8 text-lg font-normal leading-9 text-sky-100">
              Register to book appointments online, access your dental records, view promotions,
              and track your oral health journey with Flores-Dizon Dental Clinic.
            </p>
          </div>

          <div className="mt-16 grid gap-7 text-base font-medium text-sky-100">
            <p className="flex items-center gap-4">
              <span className="text-2xl">🦷</span>
              Book appointments online anytime
            </p>
            <p className="flex items-center gap-4">
              <span className="text-2xl">📋</span>
              View your dental history & odontogram
            </p>
            <p className="flex items-center gap-4">
              <span className="text-2xl">🏷️</span>
              Access exclusive patient promotions
            </p>
            <p className="flex items-center gap-4">
              <span className="text-2xl">⭐</span>
              Submit feedback after each visit
            </p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center rounded-t-[2rem] bg-white px-6 py-10 shadow-2xl sm:px-10 lg:rounded-l-[2rem] lg:rounded-t-none lg:px-24">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sky-950">
              <UserPlusIcon />
            </span>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-sky-950">
                Create Patient Account
              </h2>
              <p className="mt-3 text-base font-normal text-slate-400">
                Already have an account?{' '}
                <Link className="font-semibold text-sky-950 hover:text-amber-500" to="/login">
                  Sign in here
                </Link>
              </p>
            </div>
          </div>

          <form className="mt-10 grid gap-6" onSubmit={handleSubmit}>
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                First Name *
                <input
                  className={inputClass}
                  name="firstName"
                  onChange={handleChange}
                  placeholder="Maria"
                  required
                  type="text"
                  value={form.firstName}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Last Name *
                <input
                  className={inputClass}
                  name="lastName"
                  onChange={handleChange}
                  placeholder="Santos"
                  required
                  type="text"
                  value={form.lastName}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Email Address *
              <input
                className={inputClass}
                name="email"
                onChange={handleChange}
                placeholder="maria.santos@email.com"
                required
                type="email"
                value={form.email}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Mobile Number <span className="font-normal text-slate-300">(optional)</span>
              <input
                className={inputClass}
                name="contactNumber"
                onChange={handleChange}
                placeholder="09XXXXXXXXX"
                inputMode="numeric"
                maxLength={11}
                type="tel"
                value={form.contactNumber}
              />
              {fieldErrors.contactNumber ? (
                <span className="text-xs font-medium text-red-600">{fieldErrors.contactNumber}</span>
              ) : null}
            </label>

            <div className="grid gap-6 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Birth Date *
                <input
                  className={inputClass}
                  name="dateOfBirth"
                  onChange={handleChange}
                  required
                  type="date"
                  value={form.dateOfBirth}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-500">
                Age
                <input
                  className={`${inputClass} bg-slate-50 text-slate-400`}
                  disabled
                  placeholder="Auto-computed"
                  type="text"
                  value={age}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Password *
              <span className="relative">
                <input
                  className={`${inputClass} w-full pr-14`}
                  minLength={8}
                  name="password"
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                />
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-sky-950"
                  onClick={() => setShowPassword((currentValue) => !currentValue)}
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon />
                </button>
              </span>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-500">
              Confirm Password *
              <span className="relative">
                <input
                  className={`${inputClass} w-full pr-14`}
                  minLength={8}
                  name="confirmPassword"
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                />
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-sky-950"
                  onClick={() => setShowConfirmPassword((currentValue) => !currentValue)}
                  type="button"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <EyeIcon />
                </button>
              </span>
            </label>

            <label className="flex items-start gap-4 text-sm font-semibold leading-7 text-slate-500">
              <input
                checked={form.acceptedPrivacy}
                className="mt-1 h-5 w-5 rounded border-gray-300 text-sky-950 focus:ring-sky-900"
                name="acceptedPrivacy"
                onChange={handleChange}
                required
                type="checkbox"
              />
              <span>
                I agree that my personal information will be used by Flores-Dizon Dental Clinic for
                appointment scheduling and patient care purposes only.
              </span>
            </label>

            <button
              className="h-14 rounded-2xl bg-sky-950 px-8 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Creating Account...' : 'Create Patient Account'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

export default RegisterPage

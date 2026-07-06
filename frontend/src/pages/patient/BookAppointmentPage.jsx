import { useEffect, useMemo, useState } from 'react'
import {
  FaCalendarCheck,
  FaClock,
  FaEnvelope,
  FaInfoCircle,
  FaNotesMedical,
  FaPhoneAlt,
  FaRegCalendarAlt,
  FaStethoscope,
  FaTooth,
  FaUser,
  FaUserMd,
} from 'react-icons/fa'
import { authStorage, fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const inputClass =
  'h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition duration-200 placeholder:text-slate-400 focus:border-sky-950 focus:ring-4 focus:ring-sky-100'

const iconInputClass =
  `${inputClass} pl-11`

const textareaClass =
  'min-h-36 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-medium leading-6 text-slate-700 outline-none transition duration-200 placeholder:text-slate-400 focus:border-sky-950 focus:ring-4 focus:ring-sky-100'

const services = [
  'Dental Prophylaxis (Cleaning)',
  'Composite Tooth Filling',
  'Tooth Extraction (Simple)',
  'Tooth Extraction (Surgical)',
  'Root Canal Treatment',
  'Dental Crown',
  'Dental Bridge',
  'Orthodontic Consultation',
  'Orthodontic Braces / Adjustment',
  'Teeth Whitening (In-Office)',
  'Dental Implant Consultation',
  'Periapical X-Ray',
  'Panoramic X-Ray (OPG)',
  'Pit & Fissure Sealant',
  'Oral Prophylaxis + Fluoride',
  'Gum Treatment (Scaling & Root Planing)',
  'TMJ Consultation',
  'Pediatric Dental Check-Up',
  'Denture Fitting & Adjustment',
  'Post-Treatment Follow-Up',
]

const timeSlots = [
  '09:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '01:00 PM',
  '02:00 PM',
  '03:00 PM',
  '04:00 PM',
  '05:00 PM',
]

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-sky-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
    </div>
  )
}

function Field({ label, icon: Icon, error, children }) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
      {label}
      <span className="relative block">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        ) : null}
        {children}
      </span>
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  )
}

function BookAppointmentPage() {
  const toast = useToast()
  const user = authStorage.getUser()
  const [dentists, setDentists] = useState([])
  const [form, setForm] = useState({
    patientName: '',
    contactNumber: '',
    email: '',
    appointmentDate: '',
    appointmentTime: '',
    dentistName: '',
    service: '',
    notes: '',
    reason: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const minDate = useMemo(() => new Date().toISOString().split('T')[0], [])

  useEffect(() => {
    if (!user) return

    Promise.resolve().then(() => {
      setForm((currentForm) => ({
        ...currentForm,
        patientName: [user.firstName, user.lastName].filter(Boolean).join(' '),
        email: user.email || '',
        contactNumber: digitsOnly(user.contactNumber || ''),
      }))
    })
  }, [user])

  useEffect(() => {
    const loadDentists = async () => {
      try {
        const response = await fdmstApi.getDentists()
        setDentists(response.data || [])
      } catch {
        setDentists([])
      }
    }

    loadDentists()
  }, [])

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

  const handleSubmit = async (event) => {
    event.preventDefault()

    const mobileError = validateMobileNumber(form.contactNumber, { required: true })

    if (mobileError) {
      setFieldErrors({ contactNumber: mobileError })
      toast.error(mobileError)
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fdmstApi.bookAppointment(form)
      toast.success(response.message || 'Appointment booked successfully.')
      setFieldErrors({})
      setForm((currentForm) => ({
        ...currentForm,
        appointmentDate: '',
        appointmentTime: '',
        dentistName: '',
        service: '',
        notes: '',
        reason: '',
      }))
    } catch (submitError) {
      setFieldErrors(submitError.errors || {})
      toast.error(submitError.message || 'Failed to book appointment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="px-4 py-6 text-slate-700 sm:px-6 lg:py-8">
      <div className="mx-auto max-w-6xl animate-[fadeIn_0.35s_ease-out]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="bg-sky-950 px-6 py-8 text-white sm:px-8 lg:px-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">Flores-Dizon Dental Clinic</p>
                <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Book an Appointment</h1>
                <p className="mt-3 max-w-xl text-base leading-7 text-sky-100">
                  Schedule your dental appointment quickly and easily. Your request will remain pending until confirmed by the clinic.
                </p>
              </div>
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-amber-300 ring-1 ring-white/15 shadow-lg">
                <FaCalendarCheck className="h-9 w-9" aria-hidden="true" />
              </div>
            </div>
          </div>

          <form className="grid gap-8 p-6 sm:p-8 lg:p-10" onSubmit={handleSubmit}>
            <section className="grid gap-5">
              <SectionHeader
                icon={FaUser}
                title="Personal Information"
                description="Confirm the contact details the clinic will use for appointment updates."
              />
              <div className="grid gap-5 lg:grid-cols-3">
                <Field label="Full Name" icon={FaUser} error={fieldErrors.patientName}>
                  <input
                    className={iconInputClass}
                    type="text"
                    name="patientName"
                    value={form.patientName}
                    onChange={handleChange}
                    placeholder="Juan Dela Cruz"
                    required
                  />
                </Field>

                <Field label="Contact Number" icon={FaPhoneAlt} error={fieldErrors.contactNumber}>
                  <input
                    className={iconInputClass}
                    type="tel"
                    name="contactNumber"
                    inputMode="numeric"
                    maxLength={11}
                    value={form.contactNumber}
                    onChange={handleChange}
                    placeholder="09XXXXXXXXX"
                    required
                  />
                </Field>

                <Field label="Email" icon={FaEnvelope} error={fieldErrors.email}>
                  <input
                    className={iconInputClass}
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="name@example.com"
                    required
                  />
                </Field>
              </div>
            </section>

            <div className="h-px bg-slate-100" />

            <section className="grid gap-5">
              <SectionHeader
                icon={FaRegCalendarAlt}
                title="Appointment Schedule"
                description="Choose your preferred visit date, time, dentist, and dental service."
              />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Preferred Date" icon={FaRegCalendarAlt} error={fieldErrors.appointmentDate}>
                  <input
                    className={iconInputClass}
                    type="date"
                    name="appointmentDate"
                    min={minDate}
                    value={form.appointmentDate}
                    onChange={handleChange}
                    required
                  />
                </Field>

                <Field label="Preferred Time" icon={FaClock} error={fieldErrors.appointmentTime}>
                  <select
                    className={iconInputClass}
                    name="appointmentTime"
                    value={form.appointmentTime}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select a time</option>
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Dentist" icon={FaUserMd} error={fieldErrors.dentistName}>
                  <select
                    className={iconInputClass}
                    name="dentistName"
                    value={form.dentistName}
                    onChange={handleChange}
                  >
                    <option value="">Any available dentist</option>
                    {dentists.map((dentist) => (
                      <option key={dentist.id} value={dentist.name}>
                        {dentist.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Service" icon={FaTooth} error={fieldErrors.service}>
                  <select
                    className={iconInputClass}
                    name="service"
                    value={form.service}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select a dental service</option>
                    {services.map((service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            <div className="h-px bg-slate-100" />

            <section className="grid gap-5">
              <SectionHeader
                icon={FaNotesMedical}
                title="Visit Details"
                description="Share symptoms, concerns, or notes that can help the clinic prepare."
              />
              <label className="grid gap-2 text-sm font-semibold text-slate-600">
                Reason for Visit
                <span className="relative block">
                  <FaStethoscope className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <textarea
                    className={`${textareaClass} pl-11`}
                    name="reason"
                    value={form.reason}
                    onChange={handleChange}
                    placeholder="Example: tooth pain, routine cleaning, braces adjustment, follow-up checkup"
                  />
                </span>
                {fieldErrors.reason ? <span className="text-xs font-medium text-red-600">{fieldErrors.reason}</span> : null}
              </label>
            </section>

            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-950">
              <div className="flex gap-3">
                <FaInfoCircle className="mt-1 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
                <p>
                  Please arrive 10-15 minutes before your scheduled appointment. Bring any previous dental records if applicable.
                </p>
              </div>
            </div>

            <div className="flex justify-stretch sm:justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-sky-950 px-8 text-base font-semibold text-white shadow-lg shadow-sky-950/20 transition duration-200 hover:-translate-y-0.5 hover:bg-sky-900 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <FaCalendarCheck className="h-4 w-4" aria-hidden="true" />
                {isSubmitting ? 'Requesting Appointment...' : 'Request Appointment'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}

export default BookAppointmentPage

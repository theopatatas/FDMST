import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const defaultAppointmentSettings = {
  openingTime: '09:00',
  closingTime: '18:00',
  appointmentDuration: 30,
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  bufferTime: 10,
  allowWeekendAppointments: true,
  allowOnlineBooking: true,
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toMinutes(value) {
  const [hours = 0, minutes = 0] = String(value || '').split(':').map(Number)
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0)
}

function formatTime(minutes, timeFormat = '12') {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (timeFormat === '24') {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }

  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${String(displayHours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${period}`
}

function generateTimeSlots(appointmentSettings = defaultAppointmentSettings, timeFormat = '12') {
  const opening = toMinutes(appointmentSettings.openingTime || defaultAppointmentSettings.openingTime)
  const closing = toMinutes(appointmentSettings.closingTime || defaultAppointmentSettings.closingTime)
  const duration = Math.max(Number(appointmentSettings.appointmentDuration) || 30, 5)
  const buffer = Math.max(Number(appointmentSettings.bufferTime) || 0, 0)
  const step = duration + buffer
  const slots = []

  if (!Number.isFinite(opening) || !Number.isFinite(closing) || closing <= opening || step <= 0) {
    return slots
  }

  for (let current = opening; current + duration <= closing && slots.length < 96; current += step) {
    slots.push(formatTime(current, timeFormat))
  }

  return slots
}

function isWorkingDate(dateValue, appointmentSettings = defaultAppointmentSettings) {
  if (!dateValue) return true

  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return true

  const dayName = dayNames[date.getDay()]
  const isWeekend = dayName === 'Saturday' || dayName === 'Sunday'

  if (isWeekend && appointmentSettings.allowWeekendAppointments === false) {
    return false
  }

  const workingDays = appointmentSettings.workingDays?.length
    ? appointmentSettings.workingDays
    : defaultAppointmentSettings.workingDays

  return workingDays.includes(dayName)
}

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
    <div className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
      <span>{label}</span>
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
    </div>
  )
}

function BookAppointmentPage() {
  const toast = useToast()
  const [user] = useState(() => authStorage.getUser())
  const availabilityRequestRef = useRef(0)
  const [dentists, setDentists] = useState([])
  const [clinicSettings, setClinicSettings] = useState(null)
  const [availableTimeSlots, setAvailableTimeSlots] = useState([])
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false)
  const [availabilityMessage, setAvailabilityMessage] = useState('')
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
  const settingsSource = clinicSettings?.appointmentSettings
  const workingDaysKey = Array.isArray(settingsSource?.workingDays)
    ? settingsSource.workingDays.join('|')
    : defaultAppointmentSettings.workingDays.join('|')
  const appointmentSettings = useMemo(() => ({
    ...defaultAppointmentSettings,
    ...(settingsSource || {}),
    workingDays: Array.isArray(settingsSource?.workingDays) && settingsSource.workingDays.length
      ? settingsSource.workingDays
      : defaultAppointmentSettings.workingDays,
  }), [
    settingsSource,
  ])
  const timeFormat = clinicSettings?.systemPreferences?.timeFormat || '12'
  const availableServices = useMemo(() => {
    const configuredServices = clinicSettings?.services
      ?.filter((service) => service.status !== 'inactive')
      ?.map((service) => service.serviceName)
      ?.filter(Boolean)

    return configuredServices?.length ? configuredServices : services
  }, [clinicSettings])
  const fallbackTimeSlots = useMemo(
    () => generateTimeSlots(appointmentSettings, timeFormat),
    [
      appointmentSettings,
      timeFormat,
    ],
  )

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
    const loadBookingData = async () => {
      try {
        const [dentistsResponse, settingsResponse] = await Promise.all([
          fdmstApi.getDentists(),
          fdmstApi.getPublicSettings(),
        ])
        setDentists(dentistsResponse.data || [])
        setClinicSettings(settingsResponse || null)
      } catch {
        setDentists([])
      }
    }

    loadBookingData()
  }, [])

  useEffect(() => {
    const requestId = availabilityRequestRef.current + 1
    availabilityRequestRef.current = requestId

    if (!form.appointmentDate) {
      const timeoutId = window.setTimeout(() => {
        if (availabilityRequestRef.current !== requestId) return
        setAvailableTimeSlots([])
        setAvailabilityMessage('')
        setIsLoadingAvailability(false)
        setForm((currentForm) => currentForm.appointmentTime ? { ...currentForm, appointmentTime: '' } : currentForm)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    if (!isWorkingDate(form.appointmentDate, appointmentSettings)) {
      const timeoutId = window.setTimeout(() => {
        if (availabilityRequestRef.current !== requestId) return
        setAvailableTimeSlots([])
        setAvailabilityMessage('No available appointments for this date. Please select another date.')
        setIsLoadingAvailability(false)
        setForm((currentForm) => currentForm.appointmentTime ? { ...currentForm, appointmentTime: '' } : currentForm)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    let isMounted = true

    const loadAvailability = async () => {
      setIsLoadingAvailability(true)
      setAvailabilityMessage('Loading available appointments...')

      try {
        const response = await fdmstApi.getAppointmentAvailability({
          date: form.appointmentDate,
          dentistName: form.dentistName,
        })

        if (!isMounted || availabilityRequestRef.current !== requestId) return

        const slots = Array.isArray(response.slots) ? response.slots : fallbackTimeSlots
        setAvailableTimeSlots(slots)
        setAvailabilityMessage(slots.length ? '' : (response.message || 'No available appointments for this date. Please select another date.'))
        setForm((currentForm) => (
          currentForm.appointmentTime && !slots.includes(currentForm.appointmentTime)
            ? { ...currentForm, appointmentTime: '' }
            : currentForm
        ))
      } catch (error) {
        if (!isMounted || availabilityRequestRef.current !== requestId) return

        setAvailableTimeSlots([])
        setAvailabilityMessage(error.message || 'Unable to load available appointments. Please try again.')
        setForm((currentForm) => currentForm.appointmentTime ? { ...currentForm, appointmentTime: '' } : currentForm)
      } finally {
        if (isMounted && availabilityRequestRef.current === requestId) {
          setIsLoadingAvailability(false)
        }
      }
    }

    const timeoutId = window.setTimeout(loadAvailability, 180)

    return () => {
      isMounted = false
      window.clearTimeout(timeoutId)
    }
  }, [
    form.appointmentDate,
    form.dentistName,
    appointmentSettings,
    appointmentSettings.openingTime,
    appointmentSettings.closingTime,
    appointmentSettings.appointmentDuration,
    appointmentSettings.bufferTime,
    appointmentSettings.allowWeekendAppointments,
    appointmentSettings.allowOnlineBooking,
    fallbackTimeSlots,
    workingDaysKey,
    timeFormat,
  ])

  const handleChange = useCallback((event) => {
    const { name, value } = event.target
    const nextValue = name === 'contactNumber' ? digitsOnly(value) : value

    setForm((currentForm) => ({
      ...currentForm,
      [name]: nextValue,
      ...(name === 'appointmentDate' && !nextValue ? { appointmentTime: '' } : {}),
    }))
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [name]: '',
    }))
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()

    const mobileError = validateMobileNumber(form.contactNumber, { required: true })
    const dateError = !form.appointmentDate
      ? 'Please select an appointment date.'
      : ''
    const scheduleError = form.appointmentDate && !isWorkingDate(form.appointmentDate, appointmentSettings)
      ? 'The selected date is outside the clinic schedule.'
      : ''
    const timeError = !form.appointmentTime
      ? 'Please select an available appointment time.'
      : ''

    if (mobileError) {
      setFieldErrors({ contactNumber: mobileError })
      toast.error(mobileError)
      return
    }

    if (dateError) {
      setFieldErrors({ appointmentDate: dateError })
      toast.error(dateError)
      return
    }

    if (scheduleError) {
      setFieldErrors({ appointmentDate: scheduleError })
      toast.error(scheduleError)
      return
    }

    if (isLoadingAvailability) {
      toast.info('Loading available appointments. Please wait a moment.')
      return
    }

    if (timeError) {
      setFieldErrors({ appointmentTime: timeError })
      toast.error(timeError)
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
        <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="bg-sky-950 px-6 py-8 text-white sm:px-8 lg:px-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">
                  {clinicSettings?.clinicName || 'Flores-Dizon Dental Clinic'}
                </p>
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
                    disabled={!form.appointmentDate || isLoadingAvailability || !availableTimeSlots.length}
                    required
                  >
                    <option value="">
                      {isLoadingAvailability ? 'Loading available appointments...' : 'Select a time'}
                    </option>
                    {availableTimeSlots.map((slot) => (
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
                    {availableServices.map((service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="min-h-7">
                {availabilityMessage && form.appointmentDate ? (
                  <span
                    className={`inline-flex min-h-7 items-center rounded-full px-3 text-xs font-semibold ring-1 ${
                      isLoadingAvailability
                        ? 'bg-sky-50 text-sky-700 ring-sky-100'
                        : availableTimeSlots.length
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                          : 'bg-amber-50 text-amber-700 ring-amber-100'
                    }`}
                  >
                    {availabilityMessage}
                  </span>
                ) : null}
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
                disabled={isSubmitting || isLoadingAvailability}
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

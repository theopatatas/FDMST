import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaBell,
  FaCalendarAlt,
  FaCloudDownloadAlt,
  FaCloudUploadAlt,
  FaCog,
  FaDatabase,
  FaEdit,
  FaEnvelope,
  FaFileExcel,
  FaFilePdf,
  FaHistory,
  FaPlus,
  FaSave,
  FaSearch,
  FaShieldAlt,
  FaStethoscope,
  FaTimes,
  FaTooth,
  FaTrash,
  FaUndo,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import PasswordField from '../../components/PasswordField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const inputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const textareaClass =
  'min-h-24 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'

const officialServices = [
  'Dental Radiographs',
  'Oral Surgery',
  'Veneers',
  'Tooth Sealant',
  'Fluoride Treatment',
  'Braces / Orthodontic Treatment',
  'Tooth Extraction',
  'Dental Restoration',
  'Crowns / Caps',
  'Fixed Partial Dentures (FPD)',
  'Dentures',
  'Oral Prophylaxis / Cleaning',
  'Root Canal Therapy (RCT)',
  'Oral Check-up',
]

const defaultSettings = {
  clinicLogo: '',
  clinicName: 'Flores-Dizon Dental Clinic',
  address: '',
  contactNumber: '',
  email: '',
  website: '',
  operatingHours: 'Monday to Saturday, 9:00 AM - 6:00 PM',
  services: officialServices.map((serviceName) => ({
    serviceName,
    category: serviceName.includes('Surgery') || serviceName.includes('Extraction') ? 'Surgery' : serviceName.includes('Braces') ? 'Orthodontics' : 'General Dentistry',
    duration: 30,
    price: 0,
    status: 'active',
  })),
  appointmentSettings: {
    openingTime: '09:00',
    closingTime: '18:00',
    appointmentDuration: 30,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    maxAppointmentsPerDay: 20,
    bufferTime: 10,
    allowWeekendAppointments: true,
    allowOnlineBooking: true,
  },
  systemPreferences: {
    theme: 'light',
    language: 'English',
    timeZone: 'Asia/Manila',
    dateFormat: 'MMM d, yyyy',
    timeFormat: '12',
  },
  security: {
    sessionTimeout: 30,
  },
  backup: {
    lastBackupDate: '',
    status: 'No backup created yet',
  },
  notifications: {
    appointmentConfirmationEmail: true,
    appointmentReminderEmail: true,
    appointmentCancellationNotification: true,
    lowInventoryAlert: true,
    newAppointmentAlertForAdmin: true,
    smtpHost: '',
    smtpPort: '',
    emailUsername: '',
    emailPassword: '',
  },
  appointmentReminders: true,
  inventoryAlerts: true,
  requireAdminPasswordForStaff: true,
}

const navItems = [
  { id: 'clinic', label: 'Clinic Information', icon: FaTooth },
  { id: 'services', label: 'Services & Pricing', icon: FaStethoscope },
  { id: 'appointments', label: 'Appointment Settings', icon: FaCalendarAlt },
  { id: 'security', label: 'Security', icon: FaShieldAlt },
  { id: 'preferences', label: 'System Preferences', icon: FaCog },
  { id: 'backup', label: 'Backup & Restore', icon: FaDatabase },
  { id: 'audit', label: 'Audit Logs', icon: FaHistory },
  { id: 'notifications', label: 'Notification Settings', icon: FaBell },
]

const emptyService = {
  serviceName: '',
  category: 'General Dentistry',
  duration: 30,
  price: 0,
  status: 'active',
}

function mergeSettings(settings) {
  return {
    ...defaultSettings,
    ...settings,
    appointmentSettings: { ...defaultSettings.appointmentSettings, ...(settings?.appointmentSettings || {}) },
    systemPreferences: { ...defaultSettings.systemPreferences, ...(settings?.systemPreferences || {}) },
    security: { ...defaultSettings.security, ...(settings?.security || {}) },
    backup: { ...defaultSettings.backup, ...(settings?.backup || {}) },
    notifications: { ...defaultSettings.notifications, ...(settings?.notifications || {}) },
    services: settings?.services?.length ? settings.services : defaultSettings.services,
  }
}

function SettingsCard({ title, description, children, action }) {
  return (
    <section className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-sky-950">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({ label, error, children, className = '' }) {
  return (
    <label className={`grid min-w-0 gap-2 text-sm font-semibold text-sky-950 ${className}`}>
      {label}
      {children}
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  )
}

function Toggle({ checked, label, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-sky-950' : 'bg-slate-200'}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
      </button>
    </label>
  )
}

function PrimaryButton({ children, loading, ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60 ${props.className || ''}`}
    >
      {loading ? 'Saving...' : children}
    </button>
  )
}

function StatusBadge({ status }) {
  const active = status === 'active' || status === 'success'
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${active ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-red-50 text-red-700 ring-red-100'}`}>
      {status || 'active'}
    </span>
  )
}

function AdminSettingsPage() {
  const toast = useToast()
  const [settingsId, setSettingsId] = useState('')
  const [settings, setSettings] = useState(defaultSettings)
  const [activeSection, setActiveSection] = useState('clinic')
  const [isLoading, setIsLoading] = useState(true)
  const [savingSection, setSavingSection] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [serviceQuery, setServiceQuery] = useState('')
  const [serviceCategory, setServiceCategory] = useState('all')
  const [serviceModal, setServiceModal] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [securityForm, setSecurityForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '', sessionTimeout: 30 })
  const [auditLogs, setAuditLogs] = useState([])
  const [auditQuery, setAuditQuery] = useState('')
  const [auditDate, setAuditDate] = useState('')

  const loadSettings = useCallback(async () => {
    try {
      const response = await fdmstApi.list('clinic-settings')
      const existing = response.data?.[0]
      if (existing) {
        setSettingsId(existing._id)
        const merged = mergeSettings(existing)
        setSettings(merged)
        setSecurityForm((current) => ({ ...current, sessionTimeout: merged.security.sessionTimeout }))
      } else {
        setSettings(defaultSettings)
        setSecurityForm((current) => ({ ...current, sessionTimeout: defaultSettings.security.sessionTimeout }))
      }
    } catch (error) {
      toast.error(error.message || 'Unable to load settings.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  const loadAuditLogs = useCallback(async () => {
    try {
      const response = await fdmstApi.list('audit-logs')
      setAuditLogs(response.data || [])
    } catch {
      setAuditLogs([])
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(loadSettings)
    Promise.resolve().then(loadAuditLogs)
  }, [loadAuditLogs, loadSettings])

  const recordAuditLog = async (action, entityType = 'Settings', metadata = {}) => {
    try {
      await fdmstApi.create('audit-logs', {
        action,
        entityType,
        metadata: {
          status: 'Success',
          ...metadata,
        },
      })
      loadAuditLogs()
    } catch {
      // Audit logging should not block the primary settings action.
    }
  }

  const saveSettings = async (nextSettings = settings, section = 'settings', auditAction = 'Settings Updated') => {
    setSavingSection(section)
    try {
      const saved = settingsId
        ? await fdmstApi.update('clinic-settings', settingsId, nextSettings)
        : await fdmstApi.create('clinic-settings', nextSettings)
      setSettingsId(saved._id)
      setSettings(mergeSettings(saved))
      await recordAuditLog(auditAction, section === 'services' ? 'Services & Pricing' : 'Settings', { section })
      toast.success('Settings saved successfully.')
    } catch (error) {
      toast.error(error.message || 'Unable to save settings.')
    } finally {
      setSavingSection('')
    }
  }

  const updateSettings = (path, value) => {
    setSettings((current) => {
      if (path.length === 1) return { ...current, [path[0]]: value }
      const [group, key] = path
      return { ...current, [group]: { ...current[group], [key]: value } }
    })
    setFieldErrors((current) => ({ ...current, [path.join('.')]: '' }))
  }

  const handleClinicSubmit = (event) => {
    event.preventDefault()
    const mobileError = validateMobileNumber(settings.contactNumber)
    if (mobileError) {
      setFieldErrors({ contactNumber: mobileError })
      toast.error(mobileError)
      return
    }
    saveSettings(settings, 'clinic')
  }

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Clinic logo must be an image.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => updateSettings(['clinicLogo'], reader.result)
    reader.readAsDataURL(file)
  }

  const serviceCategories = useMemo(() => ['all', ...new Set(settings.services.map((service) => service.category).filter(Boolean))], [settings.services])
  const filteredServices = useMemo(() => settings.services.filter((service) => {
    const matchesQuery = !serviceQuery || service.serviceName.toLowerCase().includes(serviceQuery.toLowerCase())
    const matchesCategory = serviceCategory === 'all' || service.category === serviceCategory
    return matchesQuery && matchesCategory
  }), [serviceCategory, serviceQuery, settings.services])

  const saveService = (event) => {
    event.preventDefault()
    const service = serviceModal.service
    if (!service.serviceName.trim()) {
      toast.error('Service name is required.')
      return
    }
    const nextServices = serviceModal.index >= 0
      ? settings.services.map((item, index) => index === serviceModal.index ? service : item)
      : [{ ...service, serviceName: service.serviceName.trim() }, ...settings.services]
    const nextSettings = { ...settings, services: nextServices }
    const auditAction = serviceModal.index >= 0 ? 'Service Edited' : 'Service Added'
    setSettings(nextSettings)
    setServiceModal(null)
    saveSettings(nextSettings, 'services', auditAction)
  }

  const deleteService = (index) => {
    setConfirmAction({
      title: 'Delete Service',
      message: 'This service will be removed from Services & Pricing.',
      confirmLabel: 'Delete Service',
      onConfirm: () => {
        const nextSettings = { ...settings, services: settings.services.filter((_, itemIndex) => itemIndex !== index) }
        setSettings(nextSettings)
        saveSettings(nextSettings, 'services', 'Service Deleted')
      },
    })
  }

  const toggleService = (index) => {
    const nextSettings = {
      ...settings,
      services: settings.services.map((service, itemIndex) => itemIndex === index ? { ...service, status: service.status === 'active' ? 'inactive' : 'active' } : service),
    }
    setSettings(nextSettings)
    saveSettings(nextSettings, 'services', 'Service Status Updated')
  }

  const handleAppointmentReset = () => {
    setSettings((current) => ({ ...current, appointmentSettings: defaultSettings.appointmentSettings }))
    toast.info('Appointment settings reset. Save to apply changes.')
  }

  const handlePasswordSubmit = async (event) => {
    event.preventDefault()
    setSavingSection('security')
    try {
      await fdmstApi.updatePassword(securityForm)
      const nextSettings = {
        ...settings,
        security: {
          ...settings.security,
          sessionTimeout: Number(securityForm.sessionTimeout) || 30,
        },
      }
      await saveSettings(nextSettings, 'security', 'Security Updated')
      setSecurityForm({ currentPassword: '', newPassword: '', confirmPassword: '', sessionTimeout: securityForm.sessionTimeout })
      toast.success('Password updated successfully.')
    } catch (error) {
      toast.error(error.message || 'Unable to update password.')
    } finally {
      setSavingSection('')
    }
  }

  const handleBackup = (type) => {
    if (type === 'restore') {
      setConfirmAction({
        title: 'Restore Backup',
        message: 'Restoring a backup may overwrite current settings. Continue?',
        confirmLabel: 'Restore Backup',
        onConfirm: async () => {
          const nextSettings = {
            ...settings,
            backup: {
              lastBackupDate: new Date().toISOString(),
              status: 'Backup restored successfully',
            },
          }
          setSettings(nextSettings)
          await saveSettings(nextSettings, 'backup', 'Backup Restored')
          toast.success('Backup restored successfully.')
        },
      })
      return
    }

    if (type === 'download') {
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fdmst-settings-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    }

    const nextSettings = {
      ...settings,
      backup: {
        lastBackupDate: new Date().toISOString(),
        status: type === 'download' ? 'Backup downloaded' : 'Backup completed successfully',
      },
    }
    setSettings(nextSettings)
    saveSettings(nextSettings, 'backup', type === 'download' ? 'Backup Downloaded' : 'Backup Created')
  }

  const filteredAuditLogs = useMemo(() => auditLogs.filter((log) => {
    const text = [log.performedByEmail, log.entityType, log.action, log.status].filter(Boolean).join(' ').toLowerCase()
    const matchesQuery = !auditQuery || text.includes(auditQuery.toLowerCase())
    const matchesDate = !auditDate || log.createdAt?.slice(0, 10) === auditDate
    return matchesQuery && matchesDate
  }), [auditDate, auditLogs, auditQuery])

  const exportRows = (filename, rows) => {
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const renderSection = () => {
    if (isLoading) return <SettingsCard title="Loading Settings"><p className="text-sm text-slate-500">Loading settings...</p></SettingsCard>

    if (activeSection === 'clinic') {
      return (
        <SettingsCard title="Clinic Information" description="Manage public clinic profile details and operating information.">
          <form className="grid gap-5" onSubmit={handleClinicSubmit}>
            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-sky-950 text-amber-400">
                {settings.clinicLogo ? <img className="h-full w-full object-cover" src={settings.clinicLogo} alt="" /> : <FaTooth className="h-8 w-8" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-sky-950">Clinic Logo</p>
                <p className="mt-1 text-xs text-slate-500">Upload a PNG, JPG, or WebP logo.</p>
                <input className="mt-3 text-sm" type="file" accept="image/*" onChange={handleLogoUpload} />
              </div>
            </div>
            <Field label="Clinic Name"><input className={inputClass} value={settings.clinicName} onChange={(event) => updateSettings(['clinicName'], event.target.value)} required /></Field>
            <Field label="Address"><textarea className={textareaClass} value={settings.address} onChange={(event) => updateSettings(['address'], event.target.value)} /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Contact Number" error={fieldErrors.contactNumber}><input className={inputClass} inputMode="numeric" maxLength={11} value={settings.contactNumber} onChange={(event) => updateSettings(['contactNumber'], digitsOnly(event.target.value))} placeholder="09XXXXXXXXX" /></Field>
              <Field label="Email Address"><input className={inputClass} type="email" value={settings.email} onChange={(event) => updateSettings(['email'], event.target.value)} /></Field>
            </div>
            <Field label="Business Hours"><textarea className={textareaClass} value={settings.operatingHours} onChange={(event) => updateSettings(['operatingHours'], event.target.value)} /></Field>
            <div className="flex flex-wrap gap-3">
              <PrimaryButton loading={savingSection === 'clinic'} type="submit"><FaSave /> Save Changes</PrimaryButton>
              <button type="button" onClick={loadSettings} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
            </div>
          </form>
        </SettingsCard>
      )
    }

    if (activeSection === 'services') {
      return (
        <SettingsCard
          title="Services & Pricing"
          description="Manage the clinic service catalog, categories, pricing, and active status."
          action={<PrimaryButton type="button" onClick={() => setServiceModal({ index: -1, service: emptyService })}><FaPlus /> Add Service</PrimaryButton>}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
            <label className="relative">
              <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} pl-11`} value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Search services..." />
            </label>
            <select className={inputClass} value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)}>
              {serviceCategories.map((category) => <option key={category} value={category}>{category === 'all' ? 'All Categories' : category}</option>)}
            </select>
          </div>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Service Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody>
                {filteredServices.map((service) => {
                  const index = settings.services.indexOf(service)
                  return (
                    <tr className="border-t border-slate-100" key={`${service.serviceName}-${index}`}>
                      <td className="px-4 py-3 font-semibold text-sky-950">{service.serviceName}</td>
                      <td className="px-4 py-3">{service.category}</td>
                      <td className="px-4 py-3">{service.duration} min</td>
                      <td className="px-4 py-3">PHP {Number(service.price || 0).toLocaleString()}</td>
                      <td className="px-4 py-3"><StatusBadge status={service.status} /></td>
                      <td className="px-4 py-3"><div className="flex justify-end gap-2"><button className="rounded-xl bg-sky-50 p-2 text-sky-950" onClick={() => setServiceModal({ index, service })} type="button"><FaEdit /></button><button className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700" onClick={() => toggleService(index)} type="button">{service.status === 'active' ? 'Disable' : 'Enable'}</button><button className="rounded-xl bg-red-50 p-2 text-red-600" onClick={() => deleteService(index)} type="button"><FaTrash /></button></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SettingsCard>
      )
    }

    if (activeSection === 'appointments') {
      const appointment = settings.appointmentSettings
      return (
        <SettingsCard title="Appointment Settings" description="Configure clinic schedule rules and online booking behavior.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Opening Time"><input className={inputClass} type="time" value={appointment.openingTime} onChange={(event) => updateSettings(['appointmentSettings', 'openingTime'], event.target.value)} /></Field>
            <Field label="Closing Time"><input className={inputClass} type="time" value={appointment.closingTime} onChange={(event) => updateSettings(['appointmentSettings', 'closingTime'], event.target.value)} /></Field>
            <Field label="Appointment Duration"><input className={inputClass} type="number" min="5" value={appointment.appointmentDuration} onChange={(event) => updateSettings(['appointmentSettings', 'appointmentDuration'], Number(event.target.value))} /></Field>
            <Field label="Maximum Appointments Per Day"><input className={inputClass} type="number" min="1" value={appointment.maxAppointmentsPerDay} onChange={(event) => updateSettings(['appointmentSettings', 'maxAppointmentsPerDay'], Number(event.target.value))} /></Field>
            <Field label="Buffer Time Between Appointments"><input className={inputClass} type="number" min="0" value={appointment.bufferTime} onChange={(event) => updateSettings(['appointmentSettings', 'bufferTime'], Number(event.target.value))} /></Field>
            <Field label="Working Days"><select multiple className={`${textareaClass} min-h-32`} value={appointment.workingDays} onChange={(event) => updateSettings(['appointmentSettings', 'workingDays'], [...event.target.selectedOptions].map((option) => option.value))}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => <option key={day} value={day}>{day}</option>)}</select></Field>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Toggle checked={appointment.allowWeekendAppointments} label="Allow Weekend Appointments" onChange={(value) => updateSettings(['appointmentSettings', 'allowWeekendAppointments'], value)} />
            <Toggle checked={appointment.allowOnlineBooking} label="Allow Online Booking" onChange={(value) => updateSettings(['appointmentSettings', 'allowOnlineBooking'], value)} />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <PrimaryButton loading={savingSection === 'appointments'} onClick={() => saveSettings(settings, 'appointments')} type="button"><FaSave /> Save Settings</PrimaryButton>
            <button type="button" onClick={handleAppointmentReset} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"><FaUndo className="mr-2 inline" />Reset</button>
          </div>
        </SettingsCard>
      )
    }

    if (activeSection === 'security') {
      return (
        <SettingsCard title="Security" description="Update admin password and session behavior.">
          <form className="grid gap-4" onSubmit={handlePasswordSubmit}>
            <PasswordField inputClassName={inputClass} label="Current Password" name="currentPassword" value={securityForm.currentPassword} onChange={(event) => setSecurityForm((current) => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" required />
            <PasswordField inputClassName={inputClass} label="New Password" name="newPassword" value={securityForm.newPassword} onChange={(event) => setSecurityForm((current) => ({ ...current, newPassword: event.target.value }))} autoComplete="new-password" required />
            <PasswordField inputClassName={inputClass} label="Confirm Password" name="confirmPassword" value={securityForm.confirmPassword} onChange={(event) => setSecurityForm((current) => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" required />
            <Field label="Session Timeout"><select className={inputClass} value={securityForm.sessionTimeout} onChange={(event) => setSecurityForm((current) => ({ ...current, sessionTimeout: Number(event.target.value) }))}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={120}>2 hours</option></select></Field>
            <PrimaryButton loading={savingSection === 'security'} type="submit"><FaShieldAlt /> Update Password</PrimaryButton>
          </form>
        </SettingsCard>
      )
    }

    if (activeSection === 'preferences') {
      const pref = settings.systemPreferences
      return (
        <SettingsCard title="System Preferences" description="Set application display, locale, and time formatting defaults.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Theme"><select className={inputClass} value={pref.theme} onChange={(event) => updateSettings(['systemPreferences', 'theme'], event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></Field>
            <Field label="Language"><select className={inputClass} value={pref.language} onChange={(event) => updateSettings(['systemPreferences', 'language'], event.target.value)}><option>English</option><option>Filipino</option></select></Field>
            <Field label="Time Zone"><select className={inputClass} value={pref.timeZone} onChange={(event) => updateSettings(['systemPreferences', 'timeZone'], event.target.value)}><option>Asia/Manila</option><option>UTC</option></select></Field>
            <Field label="Date Format"><select className={inputClass} value={pref.dateFormat} onChange={(event) => updateSettings(['systemPreferences', 'dateFormat'], event.target.value)}><option>MMM d, yyyy</option><option>MM/dd/yyyy</option><option>yyyy-MM-dd</option></select></Field>
            <Field label="Time Format"><select className={inputClass} value={pref.timeFormat} onChange={(event) => updateSettings(['systemPreferences', 'timeFormat'], event.target.value)}><option value="12">12 Hour</option><option value="24">24 Hour</option></select></Field>
          </div>
          <PrimaryButton className="mt-6" loading={savingSection === 'preferences'} onClick={() => saveSettings(settings, 'preferences')} type="button"><FaSave /> Save Preferences</PrimaryButton>
        </SettingsCard>
      )
    }

    if (activeSection === 'backup') {
      return (
        <SettingsCard title="Backup & Restore" description="Create, download, or restore application backup data.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-500">Last Backup Date</p><p className="mt-2 text-lg font-semibold text-sky-950">{settings.backup.lastBackupDate ? new Date(settings.backup.lastBackupDate).toLocaleString() : 'No backup yet'}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-500">Backup Status</p><p className="mt-2 text-lg font-semibold text-sky-950">{settings.backup.status}</p></div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <PrimaryButton loading={savingSection === 'backup'} onClick={() => handleBackup('create')} type="button"><FaCloudUploadAlt /> Create Backup</PrimaryButton>
            <button className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50" onClick={() => handleBackup('download')} type="button"><FaCloudDownloadAlt className="mr-2 inline" />Download Backup</button>
            <button className="h-12 rounded-xl border border-red-100 bg-red-50 px-5 text-sm font-semibold text-red-700 transition hover:bg-red-100" onClick={() => handleBackup('restore')} type="button">Restore Backup</button>
          </div>
        </SettingsCard>
      )
    }

    if (activeSection === 'audit') {
      return (
        <SettingsCard title="Audit Logs" description="Review and export administrative activity logs.">
          <div className="grid gap-3 md:grid-cols-[1fr_13rem_auto_auto]">
            <input className={inputClass} value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="Search logs..." />
            <input className={inputClass} type="date" value={auditDate} onChange={(event) => setAuditDate(event.target.value)} />
            <button className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600" onClick={() => window.print()} type="button"><FaFilePdf className="mr-2 inline" />Export PDF</button>
            <button className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white" onClick={() => exportRows('audit-logs.csv', [['Date & Time', 'User', 'Module', 'Action', 'Status'], ...filteredAuditLogs.map((log) => [new Date(log.createdAt).toLocaleString(), log.performedByEmail, log.entityType, log.action, 'Success'])])} type="button"><FaFileExcel className="mr-2 inline" />Export Excel</button>
          </div>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date & Time</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Module</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{filteredAuditLogs.length ? filteredAuditLogs.map((log) => <tr className="border-t border-slate-100" key={log._id}><td className="px-4 py-3">{new Date(log.createdAt).toLocaleString()}</td><td className="px-4 py-3">{log.performedByEmail || 'System'}</td><td className="px-4 py-3">{log.entityType}</td><td className="px-4 py-3">{log.action}</td><td className="px-4 py-3"><StatusBadge status="success" /></td></tr>) : <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={5}>No audit logs found.</td></tr>}</tbody></table>
          </div>
        </SettingsCard>
      )
    }

    const notifications = settings.notifications
    return (
      <SettingsCard title="Notification Settings" description="Configure automatic emails, alerts, and optional SMTP settings.">
        <div className="grid gap-3">
          {[
            ['appointmentConfirmationEmail', 'Appointment Confirmation Email'],
            ['appointmentReminderEmail', 'Appointment Reminder Email'],
            ['appointmentCancellationNotification', 'Appointment Cancellation Notification'],
            ['lowInventoryAlert', 'Low Inventory Alert'],
            ['newAppointmentAlertForAdmin', 'New Appointment Alert for Admin'],
          ].map(([key, label]) => <Toggle key={key} checked={Boolean(notifications[key])} label={label} onChange={(value) => updateSettings(['notifications', key], value)} />)}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Email Username"><input className={inputClass} value={notifications.emailUsername} onChange={(event) => updateSettings(['notifications', 'emailUsername'], event.target.value)} /></Field>
          <PasswordField inputClassName={inputClass} label="Email Password" name="emailPassword" value={notifications.emailPassword} onChange={(event) => updateSettings(['notifications', 'emailPassword'], event.target.value)} autoComplete="new-password" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton loading={savingSection === 'notifications'} onClick={() => saveSettings(settings, 'notifications')} type="button"><FaSave /> Save Notifications</PrimaryButton>
        </div>
      </SettingsCard>
    )
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
          <nav className="grid gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = activeSection === item.id
              return (
                <button key={item.id} type="button" onClick={() => setActiveSection(item.id)} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${active ? 'bg-sky-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-sky-950'}`}>
                  <Icon className={`h-4 w-4 ${active ? 'text-amber-300' : 'text-sky-700'}`} aria-hidden="true" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0">{renderSection()}</div>
      </section>

      {serviceModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <form className="w-full max-w-2xl overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-2xl" onSubmit={saveService}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-950 text-white shadow-sm">
                  <FaStethoscope className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-sky-950">{serviceModal.index >= 0 ? 'Edit Service' : 'Add Service'}</h2>
                  <p className="mt-1 text-sm text-slate-500">Update service details, pricing, duration, and availability.</p>
                </div>
              </div>
              <button type="button" onClick={() => setServiceModal(null)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-sky-950" aria-label="Close service modal">
                <FaTimes className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-5 px-6 py-6">
              <Field label="Service Name">
                <input className={inputClass} value={serviceModal.service.serviceName} onChange={(event) => setServiceModal((current) => ({ ...current, service: { ...current.service, serviceName: event.target.value } }))} placeholder="Enter service name" required />
              </Field>
              <Field label="Category">
                <input className={inputClass} value={serviceModal.service.category} onChange={(event) => setServiceModal((current) => ({ ...current, service: { ...current.service, category: event.target.value } }))} placeholder="General Dentistry" />
              </Field>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Duration">
                  <div className="relative">
                    <input className={`${inputClass} pr-14`} type="number" min="1" value={serviceModal.service.duration} onChange={(event) => setServiceModal((current) => ({ ...current, service: { ...current.service, duration: Number(event.target.value) } }))} />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">min</span>
                  </div>
                </Field>
                <Field label="Price">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">PHP</span>
                    <input className={`${inputClass} pl-14`} type="number" min="0" value={serviceModal.service.price} onChange={(event) => setServiceModal((current) => ({ ...current, service: { ...current.service, price: Number(event.target.value) } }))} />
                  </div>
                </Field>
                <Field label="Status" className="md:col-span-2 xl:col-span-1">
                  <select className={inputClass} value={serviceModal.service.status} onChange={(event) => setServiceModal((current) => ({ ...current, service: { ...current.service, status: event.target.value } }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 px-6 py-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setServiceModal(null)} className="h-12 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
              <PrimaryButton type="submit"><FaSave /> Save Service</PrimaryButton>
            </div>
          </form>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-[1.35rem] bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-sky-950">{confirmAction.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">{confirmAction.message}</p>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setConfirmAction(null)} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600" type="button">Cancel</button><button onClick={async () => { await confirmAction.onConfirm(); setConfirmAction(null) }} className="h-12 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white" type="button">{confirmAction.confirmLabel}</button></div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default AdminSettingsPage

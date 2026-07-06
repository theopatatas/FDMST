import { useCallback, useEffect, useState } from 'react'
import { fdmstApi } from '../../api/fdmstApi.js'
import { inputClass, textareaClass } from '../../components/AdminUi.jsx'
import ProfilePage from '../ProfilePage.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { digitsOnly, validateMobileNumber } from '../../utils/validation.js'

const defaultSettings = {
  clinicName: 'Flores-Dizon Dental Clinic',
  address: '',
  contactNumber: '',
  email: '',
  operatingHours: 'Monday to Saturday, 9:00 AM - 6:00 PM',
  appointmentReminders: true,
  inventoryAlerts: true,
  requireAdminPasswordForStaff: true,
}

function AdminSettingsPage() {
  const toast = useToast()
  const [settingsId, setSettingsId] = useState('')
  const [settings, setSettings] = useState(defaultSettings)
  const [activeTab, setActiveTab] = useState('clinic')
  const [isLoading, setIsLoading] = useState(true)
  const [fieldErrors, setFieldErrors] = useState({})

  const loadSettings = useCallback(async () => {
    try {
      const response = await fdmstApi.list('clinic-settings')
      const existing = response.data?.[0]
      if (existing) {
        setSettingsId(existing._id)
        setSettings({ ...defaultSettings, ...existing })
      }
    } catch (error) {
      toast.error(error.message || 'Unable to load settings.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => { Promise.resolve().then(loadSettings) }, [loadSettings])

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target
    setSettings((current) => ({ ...current, [name]: type === 'checkbox' ? checked : name === 'contactNumber' ? digitsOnly(value) : value }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const mobileError = validateMobileNumber(settings.contactNumber)
    if (mobileError) {
      setFieldErrors({ contactNumber: mobileError })
      toast.error(mobileError)
      return
    }

    try {
      const saved = settingsId
        ? await fdmstApi.update('clinic-settings', settingsId, settings)
        : await fdmstApi.create('clinic-settings', settings)
      setSettingsId(saved._id)
      setSettings({ ...defaultSettings, ...saved })
      toast.success('Clinic settings saved.')
    } catch (error) {
      toast.error(error.message || 'Unable to save settings.')
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {['clinic', 'account', 'preferences'].map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-2xl px-5 py-2.5 text-sm font-semibold capitalize ${activeTab === tab ? 'bg-sky-950 text-white' : 'bg-white text-slate-600 ring-1 ring-gray-200'}`}>{tab}</button>)}
      </div>
      {activeTab === 'account' ? <ProfilePage /> : (
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
          {isLoading ? <p className="text-sm text-slate-500">Loading settings...</p> : (
            <form className="grid gap-5" onSubmit={handleSubmit}>
              {activeTab === 'clinic' ? (
                <>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">Clinic Name<input className={inputClass} name="clinicName" value={settings.clinicName} onChange={handleChange} required /></label>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">Address<textarea className={textareaClass} name="address" value={settings.address} onChange={handleChange} /></label>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-slate-500">Contact Number<input className={inputClass} name="contactNumber" inputMode="numeric" maxLength={11} value={settings.contactNumber} onChange={handleChange} placeholder="09XXXXXXXXX" />{fieldErrors.contactNumber ? <span className="text-xs text-red-600">{fieldErrors.contactNumber}</span> : null}</label>
                    <label className="grid gap-2 text-sm font-semibold text-slate-500">Email<input className={inputClass} type="email" name="email" value={settings.email} onChange={handleChange} /></label>
                  </div>
                  <label className="grid gap-2 text-sm font-semibold text-slate-500">Operating Hours<input className={inputClass} name="operatingHours" value={settings.operatingHours} onChange={handleChange} /></label>
                </>
              ) : (
                <div className="grid gap-4">
                  {[
                    ['appointmentReminders', 'Appointment reminders'],
                    ['inventoryAlerts', 'Low inventory alerts'],
                    ['requireAdminPasswordForStaff', 'Require admin password for staff actions'],
                  ].map(([name, label]) => (
                    <label key={name} className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-slate-600">
                      {label}
                      <input type="checkbox" name={name} checked={Boolean(settings[name])} onChange={handleChange} className="h-5 w-5 rounded border-gray-300 text-sky-950" />
                    </label>
                  ))}
                </div>
              )}
              <button className="h-12 w-fit rounded-2xl bg-sky-950 px-6 text-sm font-semibold text-white">Save Settings</button>
            </form>
          )}
        </section>
      )}
    </main>
  )
}

export default AdminSettingsPage

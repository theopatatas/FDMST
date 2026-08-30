import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaBullhorn,
  FaEdit,
  FaImage,
  FaPlus,
  FaPowerOff,
  FaSearch,
  FaTag,
  FaTrash,
  FaUndo,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { inputClass } from '../../components/AdminUi.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/auth.js'
import { uploadImageFile } from '../../utils/imageUpload.js'

const initialForm = {
  title: '',
  description: '',
  imageUrl: '',
  discountLabel: '',
  discountType: 'fixed',
  discountValue: '',
  serviceType: 'All Services',
  applicableServices: ['All Services'],
  promoCode: '',
  startDate: '',
  endDate: '',
  maxRedemptions: '',
  status: 'active',
  audience: 'all',
}

const promotionInputClass = `${inputClass} w-full min-w-0 rounded-xl`
const promotionTextareaClass = `${promotionInputClass} min-h-24 resize-none py-3`
const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const maxImageSize = 750000
const promoServices = [
  'All Services',
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

function statusBadge(status) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
    expired: 'bg-red-50 text-red-700 ring-red-100',
  }

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${styles[status] || styles.inactive}`}>
      {status || 'inactive'}
    </span>
  )
}

function AdminPromotionsPage() {
  const toast = useToast()
  const [promotions, setPromotions] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [fieldErrors, setFieldErrors] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadPromotions = useCallback(async () => {
    try {
      const response = await fdmstApi.list('promotions')
      setPromotions(response.data || [])
    } catch (error) {
      toast.error(error.message || 'Unable to load promotions.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    Promise.resolve().then(loadPromotions)
    const timer = setInterval(loadPromotions, 30000)
    return () => clearInterval(timer)
  }, [loadPromotions])

  const filteredPromotions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return promotions.filter((promotion) => {
      const matchesQuery = !normalizedQuery || [
        promotion.title,
        promotion.description,
        promotion.discountLabel,
        promotion.serviceType,
        promotion.promoCode,
      ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedQuery))
      const matchesStatus = statusFilter === 'all' || promotion.status === statusFilter
      return matchesQuery && matchesStatus
    })
  }, [promotions, query, statusFilter])

  const resetForm = () => {
    setForm(initialForm)
    setEditingId('')
    setFieldErrors({})
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => {
      const next = { ...current, [name]: value }
      if (name === 'endDate' && current.status === 'expired') {
        const selectedEndDate = value ? new Date(`${value}T23:59:59`) : null
        if (!selectedEndDate || selectedEndDate > new Date()) {
          next.status = 'active'
        }
      }
      return next
    })
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const handleServiceChange = (event) => {
    const selectedValues = Array.from(event.target.selectedOptions || []).map((option) => option.value)
    const selected = selectedValues.includes('All Services') || !selectedValues.length ? ['All Services'] : selectedValues
    setForm((current) => ({
      ...current,
      serviceType: selected[0],
      applicableServices: selected,
    }))
  }

  const handleImageFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!acceptedImageTypes.includes(file.type)) {
      setFieldErrors((current) => ({ ...current, imageUrl: 'Please select a JPG, PNG, WEBP, or GIF image.' }))
      toast.error('Only image files can be uploaded.')
      return
    }

    if (file.size > maxImageSize) {
      setFieldErrors((current) => ({ ...current, imageUrl: 'Image must be 750 KB or smaller.' }))
      toast.error('Image must be 750 KB or smaller.')
      return
    }

    try {
      const imageUrl = await uploadImageFile(file, { folder: 'promotions', maxSizeBytes: maxImageSize })
      setForm((current) => ({ ...current, imageUrl }))
      setFieldErrors((current) => ({ ...current, imageUrl: '' }))
      toast.success('Promotion banner uploaded.')
    } catch (error) {
      setFieldErrors((current) => ({ ...current, imageUrl: error.message || 'Unable to upload the selected image.' }))
      toast.error(error.message || 'Unable to upload the selected image.')
    }
  }

  const validate = () => {
    const errors = {}
    if (!form.title.trim()) errors.title = 'Promotion title is required.'
    if (!form.promoCode.trim()) errors.promoCode = 'Promo code is required.'
    const discountValue = Number(form.discountValue)
    if (!Number.isFinite(discountValue) || discountValue <= 0 || (form.discountType === 'percentage' && discountValue > 100)) {
      errors.discountValue = form.discountType === 'percentage'
        ? 'Percentage discount must be greater than 0 and no more than 100.'
        : 'Fixed discount must be greater than 0.'
    }
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      errors.endDate = 'End date must be after the start date.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    setIsSaving(true)
    const payload = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      imageUrl: form.imageUrl.trim(),
      discountLabel: form.discountLabel.trim(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue || 0),
      serviceType: form.serviceType.trim(),
      applicableServices: form.applicableServices?.length ? form.applicableServices : [form.serviceType],
      promoCode: form.promoCode.trim(),
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
    }

    try {
      const saved = editingId
        ? await fdmstApi.update('promotions', editingId, payload)
        : await fdmstApi.create('promotions', payload)
      setPromotions((current) => editingId
        ? current.map((promotion) => promotion._id === saved._id ? saved : promotion)
        : [saved, ...current])
      toast.success(editingId ? 'Promotion updated successfully.' : 'Promotion created successfully.')
      resetForm()
    } catch (error) {
      setFieldErrors(error.errors || {})
      toast.error(error.message || 'Unable to save promotion.')
    } finally {
      setIsSaving(false)
    }
  }

  const editPromotion = (promotion) => {
    setEditingId(promotion._id)
    setForm({
      ...initialForm,
      ...promotion,
      startDate: promotion.startDate ? promotion.startDate.slice(0, 10) : '',
      endDate: promotion.endDate ? promotion.endDate.slice(0, 10) : '',
      discountValue: promotion.discountValue ?? '',
      maxRedemptions: promotion.maxRedemptions ?? '',
      applicableServices: promotion.applicableServices?.length ? promotion.applicableServices : [promotion.serviceType || 'All Services'],
    })
    setFieldErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const updateStatus = async (promotion) => {
    const nextStatus = promotion.status === 'active' ? 'inactive' : 'active'
    try {
      const saved = await fdmstApi.update('promotions', promotion._id, { ...promotion, status: nextStatus })
      setPromotions((current) => current.map((item) => item._id === saved._id ? saved : item))
      toast.success(`Promotion ${nextStatus === 'active' ? 'activated' : 'deactivated'}.`)
    } catch (error) {
      toast.error(error.message || 'Unable to update promotion status.')
    }
  }

  const deletePromotion = async (promotion) => {
    if (!window.confirm(`Delete "${promotion.title}"?`)) return

    try {
      await fdmstApi.remove('promotions', promotion._id)
      setPromotions((current) => current.filter((item) => item._id !== promotion._id))
      toast.success('Promotion deleted.')
    } catch (error) {
      toast.error(error.message || 'Unable to delete promotion.')
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(24rem,28rem)_minmax(0,1fr)]">
        <article className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-200">
                <FaBullhorn className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="text-xl font-semibold text-sky-950">{editingId ? 'Edit Promotion' : 'Create Promotion'}</h2>
            </div>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-gray-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-sky-950" aria-label="Cancel editing"><FaUndo /></button> : null}
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Title
              <input className={promotionInputClass} name="title" value={form.title} onChange={handleChange} placeholder="e.g. Free Dental Check-up" required />
              {fieldErrors.title ? <span className="text-xs text-red-600">{fieldErrors.title}</span> : null}
            </label>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Description
              <textarea className={promotionTextareaClass} name="description" value={form.description} onChange={handleChange} placeholder="Brief promotion details" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Image / Banner
              <div className="grid gap-3">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="" className="h-32 w-full rounded-xl object-cover ring-1 ring-slate-200" />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                    <FaImage className="h-6 w-6" aria-hidden="true" />
                  </div>
                )}
                <input
                  accept={acceptedImageTypes.join(',')}
                  className="block w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-600 file:mr-4 file:h-11 file:border-0 file:bg-sky-950 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-900"
                  onChange={handleImageFileChange}
                  type="file"
                />
                <span className="relative">
                  <FaImage className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input className={`${promotionInputClass} pl-11`} name="imageUrl" value={form.imageUrl} onChange={handleChange} placeholder="Or paste image URL" />
                </span>
                {fieldErrors.imageUrl ? <span className="text-xs text-red-600">{fieldErrors.imageUrl}</span> : null}
              </div>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Discount / Details
              <input className={promotionInputClass} name="discountLabel" value={form.discountLabel} onChange={handleChange} placeholder="20% off, Free consultation, etc." />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Discount Type
                <select className={promotionInputClass} name="discountType" value={form.discountType} onChange={handleChange}>
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Discount Value
                <input
                  className={promotionInputClass}
                  name="discountValue"
                  type="number"
                  min="0"
                  max={form.discountType === 'percentage' ? 100 : undefined}
                  step="0.01"
                  value={form.discountValue}
                  onChange={handleChange}
                  placeholder={form.discountType === 'percentage' ? '20' : '500'}
                  required
                />
                {fieldErrors.discountValue ? <span className="text-xs text-red-600">{fieldErrors.discountValue}</span> : null}
              </label>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Applicable Service(s)
                <select
                  className={`${promotionInputClass} h-32 py-3`}
                  name="applicableServices"
                  value={form.applicableServices || ['All Services']}
                  onChange={handleServiceChange}
                  multiple
                >
                  {promoServices.map((service) => (
                    <option key={service} value={service}>{service}</option>
                  ))}
                </select>
                <span className="text-xs font-medium text-slate-400">Hold Cmd/Ctrl to select multiple services. Choose All Services to apply clinic-wide.</span>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Promo Code
                <input className={promotionInputClass} name="promoCode" value={form.promoCode} onChange={handleChange} placeholder="FD2026" required />
                {fieldErrors.promoCode ? <span className="text-xs text-red-600">{fieldErrors.promoCode}</span> : null}
              </label>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                Start Date
                <input className={promotionInputClass} type="date" name="startDate" value={form.startDate} onChange={handleChange} />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-sky-950">
                End Date
                <input className={promotionInputClass} type="date" name="endDate" value={form.endDate} onChange={handleChange} />
                {fieldErrors.endDate ? <span className="text-xs text-red-600">{fieldErrors.endDate}</span> : null}
              </label>
            </div>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Maximum Redemption
              <input className={promotionInputClass} name="maxRedemptions" type="number" min="1" value={form.maxRedemptions} onChange={handleChange} placeholder="Optional" />
              {fieldErrors.maxRedemptions ? <span className="text-xs text-red-600">{fieldErrors.maxRedemptions}</span> : null}
            </label>
            <label className="grid gap-2 text-sm font-semibold text-sky-950">
              Status
              <select className={promotionInputClass} name="status" value={form.status} onChange={handleChange}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
            </label>
            <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving}>
              <FaPlus className="h-4 w-4" aria-hidden="true" />
              {isSaving ? 'Saving...' : editingId ? 'Save Promotion' : 'Create Promotion'}
            </button>
          </form>
        </article>

        <article className="rounded-[1.35rem] border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Promotions Management</h2>
              <p className="mt-1 text-sm text-slate-500">Create, update, deactivate, or remove clinic promotions.</p>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-100 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="relative">
              <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input className={`${inputClass} pl-11`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search promotions..." />
            </label>
            <select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">Loading promotions...</p>
          ) : filteredPromotions.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Promotion</th>
                    <th className="px-5 py-4">Details</th>
                    <th className="px-5 py-4">Promo Code</th>
                    <th className="px-5 py-4">Dates</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPromotions.map((promotion) => (
                    <tr key={promotion._id} className="border-t border-slate-100">
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          {promotion.imageUrl ? (
                            <img src={promotion.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200" />
                          ) : (
                            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100"><FaTag /></span>
                          )}
                          <div>
                            <p className="font-semibold text-sky-950">{promotion.title}</p>
                            <p className="mt-1 line-clamp-1 text-xs text-slate-500">{promotion.description || 'No description'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-5 text-slate-600">
                        <div className="font-semibold text-slate-700">
                          {promotion.discountLabel || (promotion.discountType === 'percentage' ? `${promotion.discountValue || 0}% off` : `₱${promotion.discountValue || 0} off`) || 'General offer'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {(promotion.applicableServices?.length ? promotion.applicableServices : [promotion.serviceType || 'All Services']).join(', ')}
                        </div>
                      </td>
                      <td className="px-5 py-5">
                        {promotion.promoCode ? (
                          <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-950 ring-1 ring-sky-100">
                            {promotion.promoCode}
                          </span>
                        ) : (
                          <span className="text-slate-400">No code</span>
                        )}
                      </td>
                      <td className="px-5 py-5 text-slate-600">{promotion.startDate ? formatDate(promotion.startDate) : 'Anytime'} - {promotion.endDate ? formatDate(promotion.endDate) : 'No end date'}</td>
                      <td className="px-5 py-5">{statusBadge(promotion.status)}</td>
                      <td className="px-5 py-5">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => editPromotion(promotion)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-950 transition hover:bg-sky-100" aria-label={`Edit ${promotion.title}`}><FaEdit /></button>
                          <button type="button" onClick={() => updateStatus(promotion)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 transition hover:bg-amber-100" aria-label={`Toggle ${promotion.title}`}><FaPowerOff /></button>
                          <button type="button" onClick={() => deletePromotion(promotion)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600 transition hover:bg-red-100" aria-label={`Delete ${promotion.title}`}><FaTrash /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="m-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No promotions found.
            </div>
          )}
        </article>
      </section>
    </main>
  )
}

export default AdminPromotionsPage

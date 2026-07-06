import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FaBoxOpen,
  FaBoxes,
  FaChartLine,
  FaEdit,
  FaEye,
  FaFilter,
  FaLayerGroup,
  FaPlus,
  FaSearch,
  FaTimes,
  FaTrash,
  FaTruck,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { StatusPill, textareaClass } from '../../components/AdminUi.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const initialForm = {
  itemName: '',
  category: '',
  quantity: '',
  unit: 'pcs',
  reorderLevel: '',
  supplier: '',
  purchasePrice: '',
  notes: '',
}

const numberFields = ['quantity', 'reorderLevel', 'purchasePrice']
const pageSize = 10

const inputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-950 focus:ring-4 focus:ring-sky-100'

const iconButtonClass =
  'inline-flex h-10 w-10 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-60'

const filterControlClass =
  'min-w-0 flex-1 basis-full sm:basis-[calc(50%-0.375rem)] xl:basis-0'

function normalizeStatus(status) {
  return status || 'available'
}

function statusLabel(status) {
  const labels = {
    available: 'In Stock',
    low_stock: 'Low Stock',
    out_of_stock: 'Out of Stock',
  }

  return labels[normalizeStatus(status)] || 'In Stock'
}

function statusTone(status) {
  if (status === 'out_of_stock') return 'red'
  if (status === 'low_stock') return 'amber'
  return 'emerald'
}

function numericInput(value, allowDecimal = false) {
  const pattern = allowDecimal ? /[^\d.]/g : /\D/g
  const cleaned = value.replace(pattern, '')
  if (!allowDecimal) return cleaned

  const [whole, ...rest] = cleaned.split('.')
  return rest.length ? `${whole}.${rest.join('')}` : cleaned
}

function currency(value) {
  return new Intl.NumberFormat('en-PH', {
    currency: 'PHP',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(Number(value) || 0)
}

function dateLabel(value) {
  if (!value) return 'Not recorded'

  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function SummaryCard({ icon: Icon, label, value, tone = 'sky' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    red: 'bg-red-50 text-red-600 ring-red-100',
    sky: 'bg-sky-50 text-sky-950 ring-sky-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }

  return (
    <article className="flex min-h-32 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-semibold text-sky-950">{value}</p>
        </div>
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${tones[tone] || tones.sky}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function Field({ label, error, children }) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
      {label}
      {children}
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  )
}

function AdminInventoryPage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [form, setForm] = useState(initialForm)
  const [mode, setMode] = useState('create')
  const [selectedItem, setSelectedItem] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [sortBy, setSortBy] = useState('updatedAt_desc')
  const [page, setPage] = useState(1)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const loadInventory = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fdmstApi.list('inventory')
      setItems(response.data || [])
    } catch (error) {
      toast.error(error.message || 'Unable to load inventory.')
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    Promise.resolve().then(loadInventory)
  }, [loadInventory])

  const categories = useMemo(() => uniqueValues(items, 'category'), [items])
  const suppliers = useMemo(() => uniqueValues(items, 'supplier'), [items])

  const summary = useMemo(() => {
    const lowStock = items.filter((item) => normalizeStatus(item.status) === 'low_stock').length
    const outOfStock = items.filter((item) => normalizeStatus(item.status) === 'out_of_stock').length
    const inventoryValue = items.reduce((total, item) => total + (Number(item.purchasePrice) || 0) * (Number(item.quantity) || 0), 0)

    return {
      categories: categories.length,
      inventoryValue,
      lowStock,
      outOfStock,
      suppliers: suppliers.length,
      total: items.length,
    }
  }, [categories.length, items, suppliers.length])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const matches = items.filter((item) => {
      const matchesQuery = !normalizedQuery || [item.itemName, item.category, item.supplier, item.unit]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
      const matchesStatus = statusFilter === 'all' || normalizeStatus(item.status) === statusFilter
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter
      const matchesSupplier = supplierFilter === 'all' || item.supplier === supplierFilter
      return matchesQuery && matchesStatus && matchesCategory && matchesSupplier
    })

    const [field, direction] = sortBy.split('_')
    const multiplier = direction === 'asc' ? 1 : -1

    return [...matches].sort((a, b) => {
      if (field === 'quantity' || field === 'reorderLevel') {
        return ((Number(a[field]) || 0) - (Number(b[field]) || 0)) * multiplier
      }

      if (field === 'updatedAt') {
        return (new Date(a.updatedAt || a.createdAt || 0) - new Date(b.updatedAt || b.createdAt || 0)) * multiplier
      }

      return String(a[field] || '').localeCompare(String(b[field] || '')) * multiplier
    })
  }, [categoryFilter, items, query, sortBy, statusFilter, supplierFilter])

  const totalPages = Math.max(Math.ceil(filtered.length / pageSize), 1)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [categoryFilter, query, sortBy, statusFilter, supplierFilter])

  const hasFilters = query || statusFilter !== 'all' || categoryFilter !== 'all' || supplierFilter !== 'all' || sortBy !== 'updatedAt_desc'

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: numberFields.includes(name) ? numericInput(value, name === 'purchasePrice') : value,
    }))
    setFieldErrors((current) => ({ ...current, [name]: '' }))
  }

  const validate = () => {
    const errors = {}
    const quantity = Number(form.quantity)
    const reorderLevel = Number(form.reorderLevel)
    const purchasePrice = form.purchasePrice === '' ? 0 : Number(form.purchasePrice)

    if (!form.itemName.trim()) errors.itemName = 'Item name is required.'
    if (!form.category.trim()) errors.category = 'Category is required.'
    if (!form.unit.trim()) errors.unit = 'Unit is required.'
    if (form.quantity === '') errors.quantity = 'Quantity is required.'
    if (form.reorderLevel === '') errors.reorderLevel = 'Reorder level is required.'
    if (form.quantity !== '' && (!Number.isInteger(quantity) || quantity < 0)) errors.quantity = 'Quantity must be a whole number.'
    if (form.reorderLevel !== '' && (!Number.isInteger(reorderLevel) || reorderLevel < 0)) errors.reorderLevel = 'Reorder level must be a whole number.'
    if (form.purchasePrice !== '' && (Number.isNaN(purchasePrice) || purchasePrice < 0)) errors.purchasePrice = 'Purchase price must be zero or greater.'

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const closeDrawer = () => {
    setIsDrawerOpen(false)
    setSelectedItem(null)
    setMode('create')
    setForm(initialForm)
    setFieldErrors({})
  }

  const openCreate = () => {
    setMode('create')
    setSelectedItem(null)
    setForm(initialForm)
    setFieldErrors({})
    setIsDrawerOpen(true)
  }

  const openEdit = (item) => {
    setMode('edit')
    setSelectedItem(item)
    setForm({
      ...initialForm,
      ...item,
      purchasePrice: item.purchasePrice === undefined || item.purchasePrice === null ? '' : String(item.purchasePrice),
      quantity: String(item.quantity ?? ''),
      reorderLevel: String(item.reorderLevel ?? ''),
    })
    setFieldErrors({})
    setIsDrawerOpen(true)
  }

  const openView = (item) => {
    setMode('view')
    setSelectedItem(item)
    setForm({
      ...initialForm,
      ...item,
      purchasePrice: item.purchasePrice === undefined || item.purchasePrice === null ? '' : String(item.purchasePrice),
      quantity: String(item.quantity ?? ''),
      reorderLevel: String(item.reorderLevel ?? ''),
    })
    setFieldErrors({})
    setIsDrawerOpen(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (mode === 'view') return
    if (!validate()) return

    const payload = {
      ...form,
      category: form.category.trim(),
      itemName: form.itemName.trim(),
      notes: form.notes.trim(),
      purchasePrice: form.purchasePrice === '' ? undefined : Number(form.purchasePrice),
      quantity: Number(form.quantity),
      reorderLevel: Number(form.reorderLevel),
      supplier: form.supplier.trim(),
      unit: form.unit.trim(),
    }

    setIsSaving(true)
    try {
      const saved = mode === 'edit'
        ? await fdmstApi.update('inventory', selectedItem._id, payload)
        : await fdmstApi.create('inventory', payload)
      setItems((current) => mode === 'edit' ? current.map((item) => item._id === saved._id ? saved : item) : [saved, ...current])
      toast.success(mode === 'edit' ? 'Inventory item updated successfully.' : 'Inventory item added successfully.')
      closeDrawer()
    } catch (error) {
      setFieldErrors(error.errors || {})
      toast.error(error.message || 'Unable to save inventory item.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (item) => {
    const shouldDelete = window.confirm(`Delete ${item.itemName}? This removes the item from the inventory list.`)
    if (!shouldDelete) return

    setDeletingId(item._id)
    try {
      await fdmstApi.remove('inventory', item._id)
      setItems((current) => current.filter((entry) => entry._id !== item._id))
      toast.success('Inventory item deleted successfully.')
      if (selectedItem?._id === item._id) closeDrawer()
    } catch (error) {
      toast.error(error.message || 'Unable to delete inventory item.')
    } finally {
      setDeletingId('')
    }
  }

  const clearFilters = () => {
    setQuery('')
    setStatusFilter('all')
    setCategoryFilter('all')
    setSupplierFilter('all')
    setSortBy('updatedAt_desc')
  }

  return (
    <main className="min-w-0 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Inventory</p>
            <h1 className="mt-2 text-3xl font-semibold text-sky-950 sm:text-4xl">Inventory Management</h1>
            <p className="mt-2 max-w-2xl text-slate-500">Manage clinic supplies, equipment, stock levels, suppliers, and reorder alerts.</p>
            <div className="mt-5 flex max-w-full flex-wrap gap-3">
              <StatusPill tone="sky">{summary.total} total items</StatusPill>
              <StatusPill tone={summary.lowStock ? 'amber' : 'emerald'}>{summary.lowStock} low stock</StatusPill>
              <StatusPill tone={summary.outOfStock ? 'red' : 'emerald'}>{summary.outOfStock} out of stock</StatusPill>
              <StatusPill tone="slate">{currency(summary.inventoryValue)} value</StatusPill>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:-translate-y-0.5 hover:bg-sky-900 sm:w-auto"
          >
            <FaPlus className="h-4 w-4" aria-hidden="true" />
            Add Item
          </button>
        </div>
      </section>

      <section className="mt-6 grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <SummaryCard icon={FaBoxes} label="Total Items" value={summary.total} />
        <SummaryCard icon={FaChartLine} label="Low Stock" value={summary.lowStock} tone="amber" />
        <SummaryCard icon={FaBoxOpen} label="Out of Stock" value={summary.outOfStock} tone="red" />
        <SummaryCard icon={FaLayerGroup} label="Categories" value={summary.categories} tone="violet" />
        <SummaryCard icon={FaTruck} label="Suppliers" value={summary.suppliers} tone="emerald" />
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap">
          <label className={`relative ${filterControlClass} xl:min-w-[18rem] xl:flex-[2_1_18rem]`}>
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputClass} pl-11`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, category, supplier..." />
          </label>
          <select className={`${inputClass} ${filterControlClass}`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
            <option value="all">All status</option>
            <option value="available">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
          <select className={`${inputClass} ${filterControlClass}`} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select className={`${inputClass} ${filterControlClass}`} value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} aria-label="Filter by supplier">
            <option value="all">All suppliers</option>
            {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
          </select>
          <select className={`${inputClass} ${filterControlClass}`} value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort inventory">
            <option value="updatedAt_desc">Recently updated</option>
            <option value="itemName_asc">Item name A-Z</option>
            <option value="itemName_desc">Item name Z-A</option>
            <option value="quantity_asc">Quantity low-high</option>
            <option value="quantity_desc">Quantity high-low</option>
            <option value="reorderLevel_desc">Reorder level high-low</option>
          </select>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto xl:min-w-28"
          >
            <FaFilter className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <p>{filtered.length} of {items.length} items shown</p>
        </div>

        {isLoading ? (
          <div className="mt-6 flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">Loading inventory...</div>
        ) : filtered.length ? (
          <>
            <div className="mt-6 hidden max-w-full max-h-[34rem] overflow-auto rounded-2xl border border-slate-200 lg:block">
              <table className="min-w-[72rem] w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-sm">
                  <tr>
                    <th className="px-4 py-3">Item Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Quantity</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Reorder Level</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((item) => (
                    <tr key={item._id} className="border-t border-slate-100 align-middle transition hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                            <FaBoxOpen aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-sky-950">{item.itemName}</p>
                            <p className="max-w-64 truncate text-xs text-slate-500">{item.notes || 'No notes'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">{item.category || 'Uncategorized'}</td>
                      <td className="px-4 py-4 font-semibold text-slate-700">{item.quantity ?? 0}</td>
                      <td className="px-4 py-4">{item.unit || 'pcs'}</td>
                      <td className="px-4 py-4">{item.reorderLevel ?? 0}</td>
                      <td className="px-4 py-4">{item.supplier || 'Not provided'}</td>
                      <td className="px-4 py-4"><StatusPill tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusPill></td>
                      <td className="px-4 py-4">{dateLabel(item.updatedAt || item.createdAt)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button type="button" className={`${iconButtonClass} bg-slate-100 text-slate-600 hover:bg-slate-200`} onClick={() => openView(item)} aria-label={`View ${item.itemName}`}><FaEye /></button>
                          <button type="button" className={`${iconButtonClass} bg-sky-50 text-sky-950 hover:bg-sky-100`} onClick={() => openEdit(item)} aria-label={`Edit ${item.itemName}`}><FaEdit /></button>
                          <button type="button" disabled={deletingId === item._id} className={`${iconButtonClass} bg-red-50 text-red-600 hover:bg-red-100`} onClick={() => handleDelete(item)} aria-label={`Delete ${item.itemName}`}><FaTrash /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-4 lg:hidden">
              {paginated.map((item) => (
                <article key={item._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-sky-950">{item.itemName}</p>
                      <p className="mt-1 break-words text-sm text-slate-500">{item.category || 'Uncategorized'} - {item.supplier || 'No supplier'}</p>
                    </div>
                    <div className="shrink-0"><StatusPill tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusPill></div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Quantity</p><p className="font-semibold text-sky-950">{item.quantity ?? 0} {item.unit || 'pcs'}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Reorder</p><p className="font-semibold text-sky-950">{item.reorderLevel ?? 0}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Updated</p><p className="font-semibold text-sky-950">{dateLabel(item.updatedAt || item.createdAt)}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Value</p><p className="font-semibold text-sky-950">{currency((Number(item.purchasePrice) || 0) * (Number(item.quantity) || 0))}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button type="button" className={`${iconButtonClass} bg-slate-100 text-slate-600`} onClick={() => openView(item)}><FaEye /></button>
                    <button type="button" className={`${iconButtonClass} bg-sky-50 text-sky-950`} onClick={() => openEdit(item)}><FaEdit /></button>
                    <button type="button" disabled={deletingId === item._id} className={`${iconButtonClass} bg-red-50 text-red-600`} onClick={() => handleDelete(item)}><FaTrash /></button>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                <button type="button" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center sm:p-10">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-sky-950 ring-1 ring-sky-100">
              <FaBoxOpen className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="mt-5 text-lg font-semibold text-sky-950">No inventory items found.</p>
            <p className="mt-2 text-sm text-slate-500">{items.length ? 'Try clearing filters or changing your search.' : 'Start by adding your first inventory item.'}</p>
            <button type="button" onClick={openCreate} className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-sky-900">
              <FaPlus aria-hidden="true" />
              Add Item
            </button>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={openCreate}
        className="fixed bottom-5 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-sky-950 text-white shadow-xl shadow-sky-950/30 transition hover:-translate-y-0.5 hover:bg-sky-900 lg:hidden"
        aria-label="Add inventory item"
      >
        <FaPlus aria-hidden="true" />
      </button>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={closeDrawer} aria-label="Close inventory drawer" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl min-w-0 flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Inventory</p>
                <h2 className="mt-1 break-words text-2xl font-semibold text-sky-950">
                  {mode === 'view' ? 'View Item' : mode === 'edit' ? 'Edit Item' : 'Add Item'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Stock status updates automatically from quantity and reorder level.</p>
              </div>
              <button type="button" onClick={closeDrawer} className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close drawer">
                <FaTimes className="h-5 w-5" />
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
              <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-6 sm:grid-cols-2 sm:px-6">
                <Field label="Item Name" error={fieldErrors.itemName}>
                  <input className={inputClass} name="itemName" value={form.itemName} onChange={handleChange} disabled={mode === 'view'} required />
                </Field>
                <Field label="Category" error={fieldErrors.category}>
                  <input className={inputClass} name="category" value={form.category} onChange={handleChange} disabled={mode === 'view'} required />
                </Field>
                <Field label="Quantity" error={fieldErrors.quantity}>
                  <input className={inputClass} inputMode="numeric" name="quantity" value={form.quantity} onChange={handleChange} disabled={mode === 'view'} required />
                </Field>
                <Field label="Unit" error={fieldErrors.unit}>
                  <input className={inputClass} name="unit" value={form.unit} onChange={handleChange} disabled={mode === 'view'} required />
                </Field>
                <Field label="Reorder Level" error={fieldErrors.reorderLevel}>
                  <input className={inputClass} inputMode="numeric" name="reorderLevel" value={form.reorderLevel} onChange={handleChange} disabled={mode === 'view'} required />
                </Field>
                <Field label="Supplier">
                  <input className={inputClass} name="supplier" value={form.supplier} onChange={handleChange} disabled={mode === 'view'} />
                </Field>
                <Field label="Purchase Price" error={fieldErrors.purchasePrice}>
                  <input className={inputClass} inputMode="decimal" name="purchasePrice" value={form.purchasePrice} onChange={handleChange} disabled={mode === 'view'} placeholder="0.00" />
                </Field>
                <div className="grid min-w-0 gap-2 text-sm font-semibold text-slate-600">
                  Current Status
                  <div className="flex min-h-12 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2">
                    <StatusPill tone={statusTone(selectedItem?.status)}>{statusLabel(selectedItem?.status)}</StatusPill>
                  </div>
                </div>
                <label className="grid gap-2 text-sm font-semibold text-slate-600 sm:col-span-2">
                  Notes
                  <textarea className={textareaClass} name="notes" value={form.notes} onChange={handleChange} disabled={mode === 'view'} placeholder="Supplier details, storage notes, or usage reminders" />
                </label>
              </div>

              <div className="grid gap-3 border-t border-slate-100 bg-white px-5 py-5 sm:flex sm:flex-row sm:justify-end sm:px-6">
                <button type="button" onClick={closeDrawer} className="h-12 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
                {mode === 'view' ? (
                  <button type="button" onClick={() => openEdit(selectedItem)} className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white transition hover:bg-sky-900">
                    Edit Item
                  </button>
                ) : (
                  <button type="submit" disabled={isSaving} className="h-12 rounded-xl bg-sky-950 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-950/20 transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60">
                    {isSaving ? 'Saving...' : 'Save Item'}
                  </button>
                )}
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </main>
  )
}

export default AdminInventoryPage

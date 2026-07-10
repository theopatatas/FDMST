import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  FaCalendarAlt,
  FaCalendarCheck,
  FaCalendarDay,
  FaCalendarPlus,
  FaChevronDown,
  FaCheckCircle,
  FaClock,
  FaDownload,
  FaTimes,
  FaTimesCircle,
  FaUserClock,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip)

const chartColors = ['#16a34a', '#f59e0b', '#2563eb', '#ef4444', '#7c3aed', '#14b8a6', '#f97316', '#0c4a6e']
const serviceColorMap = {
  'Dental Prophylaxis / Cleaning': '#065f46',
  'Braces / Orthodontic Treatment': '#92400e',
  'Crowns / Caps': '#1e3a8a',
  'Fixed Partial Dentures (FPD)': '#581c87',
  'Dental Radiographs': '#991b1b',
  'Dental Restoration': '#5b21b6',
  Dentures: '#0f766e',
  'Oral Surgery': '#9a3412',
  'Fluoride Treatment': '#0f172a',
  'Oral Check-up': '#3f6212',
  'Oral Prophylaxis / Cleaning': '#7c2d12',
  Veneers: '#1d4ed8',
  'Root Canal Therapy (RCT)': '#9d174d',
  'Tooth Extraction': '#3730a3',
  'Tooth Sealant': '#115e59',
}
const officialServices = [
  'Dental Prophylaxis / Cleaning',
  'Braces / Orthodontic Treatment',
  'Crowns / Caps',
  'Fixed Partial Dentures (FPD)',
  'Dental Radiographs',
  'Dental Restoration',
  'Dentures',
  'Oral Surgery',
  'Fluoride Treatment',
  'Oral Check-up',
  'Oral Prophylaxis / Cleaning',
  'Veneers',
  'Root Canal Therapy (RCT)',
  'Tooth Extraction',
  'Tooth Sealant',
]
const statusOptions = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled', 'declined']
const kpiMeta = [
  { key: 'totalAppointments', label: 'Total Appointments', icon: FaCalendarCheck, tone: 'blue' },
  { key: 'todaysAppointments', label: "Today's Appointments", icon: FaCalendarDay, tone: 'green' },
  { key: 'upcomingAppointments', label: 'Upcoming Appointments', icon: FaCalendarPlus, tone: 'violet' },
  { key: 'completedAppointments', label: 'Completed Appointments', icon: FaCheckCircle, tone: 'green' },
  { key: 'pendingAppointments', label: 'Pending Appointments', icon: FaClock, tone: 'orange' },
  { key: 'cancelledAppointments', label: 'Cancelled Appointments', icon: FaTimesCircle, tone: 'red' },
  { key: 'noShowAppointments', label: 'No-Show Appointments', icon: FaUserClock, tone: 'slate' },
]

function exportCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function chartData(series = [], label = 'Total') {
  const safeSeries = Array.isArray(series) ? series : []

  return {
    labels: safeSeries.map((item) => item.label || 'Unspecified'),
    datasets: [
      {
        label,
        data: safeSeries.map((item) => Number(item.value || 0)),
        backgroundColor: chartColors,
        borderColor: chartColors,
        borderRadius: 6,
        borderWidth: 2,
        tension: 0.35,
      },
    ],
  }
}

function EmptyState({ message = 'No analytics data available for this filter.' }) {
  return (
    <div className="flex h-52 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-medium text-slate-500">
      {message}
    </div>
  )
}

function formatPercent(value, total) {
  if (!total) return '0%'
  return `${((Number(value || 0) / total) * 100).toFixed(1)}%`
}

function getServiceRows(series = []) {
  const safeSeries = Array.isArray(series) ? series : []
  const values = new Map(safeSeries.map((item) => [item.label, Number(item.value || 0)]))
  const extraRows = safeSeries
    .filter((item) => item.label && !officialServices.includes(item.label))
    .map((item, index) => ({
      color: chartColors[index % chartColors.length],
      label: item.label,
      value: Number(item.value || 0),
    }))

  return [
    ...officialServices.map((service) => ({
      color: serviceColorMap[service],
      label: service,
      value: values.get(service) || 0,
    })),
    ...extraRows,
  ]
}

function SkeletonCard() {
  return (
    <div className="h-28 animate-pulse rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="h-9 w-9 rounded-xl bg-slate-100" />
      <div className="mt-4 h-7 w-14 rounded bg-slate-100" />
      <div className="mt-3 h-3 w-24 rounded bg-slate-100" />
    </div>
  )
}

function SkeletonSection() {
  return (
    <section className="mt-6 animate-pulse rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm">
      <div className="h-6 w-48 rounded bg-slate-100" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div className="h-64 rounded-2xl bg-slate-100" key={item} />)}
      </div>
    </section>
  )
}

function normalizeKpiChange(change) {
  if (change && typeof change === 'object') {
    const status = change.status || 'neutral'
    const value = typeof change.value === 'number' ? change.value : null

    return {
      value,
      status,
      label: `${Number(value || 0) > 0 ? '+' : ''}${Number(value || 0)}%`,
      icon: status === 'increase' || status === 'new' ? '↑' : status === 'decrease' ? '↓' : '−',
    }
  }

  const value = Number(change || 0)
  return {
    value,
    status: value > 0 ? 'increase' : value < 0 ? 'decrease' : 'neutral',
    label: `${value > 0 ? '+' : ''}${value}%`,
    icon: value > 0 ? '↑' : value < 0 ? '↓' : '−',
  }
}

function KpiCard({ item, value, change = 0 }) {
  const Icon = item.icon
  const tones = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    orange: 'bg-orange-50 text-orange-600 ring-orange-100',
    red: 'bg-red-50 text-red-600 ring-red-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  }
  const changeState = normalizeKpiChange(change)
  const changeClass = changeState.status === 'increase' || changeState.status === 'new'
    ? 'text-emerald-600'
    : changeState.status === 'decrease'
      ? 'text-red-600'
      : 'text-slate-400'

  return (
    <article className="min-h-28 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[item.tone] || tones.blue}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-500">{item.label}</p>
          <p className="mt-1 text-2xl font-semibold leading-tight text-sky-950">{value || 0}</p>
        </div>
      </div>
      <p className={`mt-4 text-xs font-semibold ${changeClass}`}>
        {changeState.icon} {changeState.label} <span className="font-medium text-slate-400">vs previous period</span>
      </p>
    </article>
  )
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <article className={`min-h-[16.5rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${className}`}>
      <div className="mb-3">
        <h3 className="text-base font-semibold leading-tight text-sky-950">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </article>
  )
}

function AnalyticsSection({ title, children }) {
  return (
    <section className="mt-6 rounded-[1.75rem] border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="px-1 text-xl font-semibold tracking-tight text-sky-950">{title}</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {children}
      </div>
    </section>
  )
}

function AnalyticsChart({ type = 'bar', series = [], label, horizontal = false, emptyMessage, compact = true }) {
  const safeSeries = Array.isArray(series) ? series : []

  if (!safeSeries.some((item) => Number(item.value) > 0)) return <EmptyState message={emptyMessage} />

  const data = chartData(safeSeries, label)
  if (type === 'line') {
    data.datasets[0].backgroundColor = 'rgba(37, 99, 235, 0.12)'
    data.datasets[0].borderColor = '#2563eb'
    data.datasets[0].pointBackgroundColor = '#2563eb'
    data.datasets[0].fill = true
  }

  const options = {
    indexAxis: horizontal ? 'y' : 'x',
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: type === 'doughnut',
        position: 'bottom',
        labels: { boxWidth: 9, color: '#475569', font: { size: 11 }, padding: 12, usePointStyle: true },
      },
      tooltip: { intersect: false, mode: 'index' },
    },
    scales: type === 'doughnut' ? undefined : {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 0, autoSkip: true } },
      y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { color: '#64748b', font: { size: 10 }, precision: 0 } },
    },
  }

  return (
    <div className={`${compact ? 'h-52' : 'h-60'} min-w-0`}>
      {type === 'doughnut' ? <Doughnut data={data} options={options} /> : null}
      {type === 'line' ? <Line data={data} options={options} /> : null}
      {type === 'bar' ? <Bar data={data} options={options} /> : null}
    </div>
  )
}

const servicePercentLabelsPlugin = {
  id: 'servicePercentLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const dataset = chart.data.datasets[0]
    const total = dataset.data.reduce((sum, value) => sum + Number(value || 0), 0)
    if (!total) return

    ctx.save()
    ctx.font = '700 14px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    chart.getDatasetMeta(0).data.forEach((arc, index) => {
      const value = Number(dataset.data[index] || 0)
      const percent = (value / total) * 100
      if (percent < 3) return
      const position = arc.tooltipPosition()
      ctx.fillText(`${percent.toFixed(1)}%`, position.x, position.y)
    })

    ctx.restore()
  },
}

function ServiceDistributionChart({ series = [] }) {
  const rows = getServiceRows(series)
  const chartRows = rows.filter((item) => Number(item.value) > 0)
  const total = chartRows.reduce((sum, item) => sum + Number(item.value || 0), 0)

  if (!total) return <EmptyState message="No service distribution yet." />

  const data = {
    labels: chartRows.map((item) => item.label),
    datasets: [
      {
        data: chartRows.map((item) => item.value),
        backgroundColor: chartRows.map((item) => item.color),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  }

  const options = {
    cutout: '44%',
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = Number(context.raw || 0)
            return `${context.label}: ${value} appointment${value === 1 ? '' : 's'} (${formatPercent(value, total)})`
          },
        },
      },
    },
  }

  return (
    <div className="grid min-w-0 gap-8">
      <div className="mx-auto h-[22rem] w-full max-w-[22rem] sm:h-[25rem] sm:max-w-[25rem]">
        <Doughnut data={data} options={options} plugins={[servicePercentLabelsPlugin]} />
      </div>

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map((item) => (
          <div className="flex min-w-0 items-center gap-3 text-sm font-semibold text-slate-700" key={item.label}>
            <span className="h-4 w-4 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
            <span className="truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniBars({ items = [], emptyMessage = 'No ranking data yet.' }) {
  const safeItems = Array.isArray(items) ? items : []

  if (!safeItems.length) return <EmptyState message={emptyMessage} />
  const visible = safeItems.slice(0, 5)
  const max = Math.max(...visible.map((item) => Number(item.value || 0)), 1)

  return (
    <div className="grid gap-3 pt-1">
      {visible.map((item) => (
        <div className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-3 text-xs" key={item.label}>
          <span className="truncate font-semibold text-sky-950">{item.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-blue-600" style={{ width: `${(Number(item.value || 0) / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold text-slate-600">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function GrowthList({ growing = [], declining = [] }) {
  const safeGrowing = Array.isArray(growing) ? growing : []
  const safeDeclining = Array.isArray(declining) ? declining : []
  const rows = [
    ...safeGrowing.map((item) => ({ ...item, tone: 'bg-emerald-50 text-emerald-600', prefix: '↑ +' })),
    ...safeDeclining.map((item) => ({ ...item, tone: 'bg-red-50 text-red-600', prefix: '↓ ' })),
  ].slice(0, 5)

  if (!rows.length) return <EmptyState message="No service growth movement yet." />

  return (
    <div className="grid gap-3 pt-1">
      {rows.map((item) => (
        <div className="flex items-center justify-between gap-3 text-xs" key={`${item.label}-${item.value}`}>
          <span className="min-w-0 truncate font-semibold text-sky-950">{item.label}</span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 font-semibold ${item.tone}`}>{item.prefix}{item.value}%</span>
        </div>
      ))}
    </div>
  )
}

function CompactTable({ columns, rows, emptyMessage }) {
  const safeRows = Array.isArray(rows) ? rows : []

  if (!safeRows.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100">
      <table className="min-w-[520px] w-full text-left text-xs">
        <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => <th className="px-3 py-2 font-semibold" key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row) => (
            <tr className="border-t border-gray-100" key={row.id || row.label || row.dentist}>
              {columns.map((column) => (
                <td className="px-3 py-2" key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilterToolbar({ filters, options, onChange, onExport }) {
  const update = (key, value) => onChange((current) => ({ ...current, [key]: value }))
  const formatDate = (value) => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Any'
  const dateLabel = filters.startDate || filters.endDate ? `${formatDate(filters.startDate)} - ${formatDate(filters.endDate)}` : 'All dates'
  const controlClass = 'h-12 min-w-0 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-sky-900 focus:ring-4 focus:ring-sky-100'
  const clearFilters = () => onChange({ startDate: '', endDate: '', dentist: '', service: '', status: '' })

  return (
    <section className="mb-7">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1.35fr)_minmax(9.5rem,0.75fr)_minmax(10rem,0.85fr)_minmax(9.5rem,0.75fr)_auto_auto] xl:items-center">
        <details className="group relative min-w-0">
          <summary className={`${controlClass} flex w-full cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden`}>
            <span className="flex min-w-0 items-center gap-3">
              <FaCalendarAlt className="shrink-0 text-slate-500" aria-hidden="true" />
              <span className="truncate">{dateLabel}</span>
            </span>
            <FaChevronDown className="shrink-0 text-xs text-slate-500 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="absolute left-0 z-30 mt-2 grid w-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:w-[20rem]">
            <label className="grid gap-2 text-xs font-semibold text-slate-500">
              Start Date
              <input aria-label={`Start date. Current range: ${dateLabel}`} className={controlClass} type="date" value={filters.startDate} onChange={(event) => update('startDate', event.target.value)} />
            </label>
            <label className="grid gap-2 text-xs font-semibold text-slate-500">
              End Date
              <input aria-label={`End date. Current range: ${dateLabel}`} className={controlClass} type="date" value={filters.endDate} onChange={(event) => update('endDate', event.target.value)} />
            </label>
          </div>
        </details>

        <select className={controlClass} value={filters.dentist} onChange={(event) => update('dentist', event.target.value)}>
          <option value="">All Dentists</option>
          {(options.dentists || []).map((dentist) => <option key={dentist} value={dentist}>{dentist}</option>)}
        </select>
        <select className={controlClass} value={filters.service} onChange={(event) => update('service', event.target.value)}>
          <option value="">All Services</option>
          {(options.services || []).map((service) => <option key={service} value={service}>{service}</option>)}
        </select>
        <select className={`${controlClass} capitalize`} value={filters.status} onChange={(event) => update('status', event.target.value)}>
          <option value="">All Status</option>
          {[...new Set([...(options.statuses || []), ...statusOptions])].map((status) => <option className="capitalize" key={status} value={status}>{status}</option>)}
        </select>
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-red-100 hover:bg-red-50 hover:text-red-600" onClick={clearFilters} type="button">
          <FaTimes aria-hidden="true" />
          Clear
        </button>
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-950" onClick={onExport} type="button">
          <FaDownload aria-hidden="true" />
          Export
        </button>
      </div>
    </section>
  )
}

function AdminAnalyticsPage() {
  const toast = useToast()
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filters, setFilters] = useState({ startDate: '', endDate: '', dentist: '', service: '', status: '' })

  const loadAnalytics = useCallback(async ({ silent = false } = {}) => {
    try {
      const data = await fdmstApi.getAdminAnalytics(filters)
      setDashboard(data)
      setLoadError('')
    } catch (loadError) {
      const message = loadError.message && loadError.message !== 'Something went wrong. Please try again.'
        ? loadError.message
        : 'No analytics data available.'
      setLoadError(message)
      if (!silent) toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [filters, toast])

  useEffect(() => {
    setIsLoading(true)
    Promise.resolve().then(loadAnalytics)
  }, [loadAnalytics])

  const stats = dashboard?.stats || {}
  const analytics = dashboard?.analytics || {}
  const appointmentAnalytics = analytics.appointments || {}
  const serviceAnalytics = analytics.services || {}
  const dentistAnalytics = analytics.dentists || []
  const patientAnalytics = analytics.patients || {}
  const treatmentAnalytics = analytics.treatments || {}
  const revenueAnalytics = analytics.revenue || {}
  const dentistPatientSeries = dentistAnalytics.map((item) => ({ label: item.dentist, value: item.patientsHandled }))
  const dentistProcedureSeries = dentistAnalytics.map((item) => ({ label: item.dentist, value: item.proceduresPerformed }))
  const dentistWorkloadSeries = dentistAnalytics.map((item) => ({ label: item.dentist, value: item.workload }))
  const dentistOutcomeSeries = dentistAnalytics.flatMap((item) => [
    { label: `${item.dentist} completed`, value: item.completed },
    { label: `${item.dentist} cancelled`, value: item.cancelled },
  ]).slice(0, 10)
  const frequentPatientColumns = [
    { key: 'label', label: 'Patient', render: (row) => <span className="font-semibold text-sky-950">{row.label}</span> },
    { key: 'value', label: 'Appointments' },
  ]

  const exportAnalytics = () => {
    exportCsv('fdmst-analytics-summary.csv', [
      ['Metric', 'Value'],
      ...kpiMeta.map((item) => [item.label, stats[item.key] || 0]),
      ['Completion Rate', `${appointmentAnalytics.completionRate || 0}%`],
      ['Cancellation Rate', `${appointmentAnalytics.cancellationRate || 0}%`],
      ['No-Show Rate', `${appointmentAnalytics.noShowRate || 0}%`],
      ['Follow-up Compliance', `${treatmentAnalytics.followUpCompliance || 0}%`],
    ])
  }

  return (
    <main className="bg-slate-50/60 px-4 py-5 sm:px-6 lg:px-8">
      <FilterToolbar filters={filters} options={dashboard?.filters || {}} onChange={setFilters} onExport={exportAnalytics} />

      {isLoading ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            {kpiMeta.map((item) => <SkeletonCard key={item.key} />)}
          </section>
          <SkeletonSection />
          <SkeletonSection />
        </>
      ) : loadError && !dashboard ? (
        <section className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-sky-950">No analytics data available.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
            The analytics service could not load data for this view. Please check the selected filters or try again once the server is available.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            {kpiMeta.map((item) => (
              <KpiCard change={stats.monthlyChange?.[item.key] || 0} item={item} key={item.key} value={stats[item.key]} />
            ))}
          </section>

          <AnalyticsSection title="Appointment Analytics">
            <ChartCard title="Daily Appointment Trend" subtitle="Last 30 days">
              <AnalyticsChart type="line" series={appointmentAnalytics.dailyTrend} label="Appointments" emptyMessage="No daily appointment trend data yet." />
            </ChartCard>
            <ChartCard title="Appointment Status Distribution" subtitle={`Total: ${stats.totalAppointments || 0} appointments`}>
              <AnalyticsChart type="doughnut" series={appointmentAnalytics.statusDistribution} label="Appointments" emptyMessage="No appointment status data yet." />
            </ChartCard>
            <ChartCard title="Peak Clinic Hours" subtitle="Average appointments by hour">
              <AnalyticsChart horizontal series={appointmentAnalytics.peakHours} label="Appointments" emptyMessage="No peak hour data yet." />
            </ChartCard>
            <ChartCard title="Busiest Days of Week" subtitle="By total appointments">
              <AnalyticsChart horizontal series={appointmentAnalytics.busiestDays} label="Appointments" emptyMessage="No busiest-day data yet." />
            </ChartCard>
          </AnalyticsSection>

          <AnalyticsSection title="Service Analytics">
            <ChartCard title="Service Distribution" subtitle="Share of completed appointments" className="lg:col-span-2 2xl:col-span-4 min-h-[42rem] p-6 sm:p-7">
              <ServiceDistributionChart series={serviceAnalytics.distribution} />
            </ChartCard>
            <ChartCard title="Most Requested Services" subtitle="By total completed appointments">
              <MiniBars items={serviceAnalytics.mostRequested} emptyMessage="No requested service data yet." />
            </ChartCard>
            <ChartCard title="Monthly Service Trend" subtitle="Top services over time">
              <AnalyticsChart type="line" series={serviceAnalytics.monthlyTrend} label="Services" emptyMessage="No monthly service trend yet." />
            </ChartCard>
            <ChartCard title="Service Growth" subtitle="Compared to previous 30 days">
              <GrowthList declining={serviceAnalytics.fastestDeclining} growing={serviceAnalytics.fastestGrowing} />
            </ChartCard>
          </AnalyticsSection>

          <AnalyticsSection title="Dentist Analytics">
            <ChartCard title="Patients per Dentist" subtitle="Total patients handled">
              <AnalyticsChart horizontal series={dentistPatientSeries} label="Patients" emptyMessage="No dentist patient data yet." />
            </ChartCard>
            <ChartCard title="Procedures per Dentist" subtitle="Total procedures performed">
              <AnalyticsChart horizontal series={dentistProcedureSeries} label="Procedures" emptyMessage="No dentist procedure data yet." />
            </ChartCard>
            <ChartCard title="Completed vs Cancelled" subtitle="Appointments by dentist">
              <AnalyticsChart horizontal series={dentistOutcomeSeries} label="Appointments" emptyMessage="No dentist outcome data yet." />
            </ChartCard>
            <ChartCard title="Dentist Workload Comparison" subtitle="Based on total appointments">
              <AnalyticsChart horizontal series={dentistWorkloadSeries} label="Appointments" emptyMessage="No dentist workload data yet." />
            </ChartCard>
          </AnalyticsSection>

          <AnalyticsSection title="Patient Analytics">
            <ChartCard title="New vs Returning Patients" subtitle="Patient visit behavior">
              <AnalyticsChart type="doughnut" series={patientAnalytics.newVsReturning} label="Patients" emptyMessage="No patient mix data yet." />
            </ChartCard>
            <ChartCard title="Age Distribution" subtitle="Registered patient age groups">
              <AnalyticsChart series={patientAnalytics.ageDistribution} label="Patients" emptyMessage="No age data yet." />
            </ChartCard>
            <ChartCard title="Gender Distribution" subtitle="Registered patient profile data">
              <AnalyticsChart type="doughnut" series={patientAnalytics.genderDistribution} label="Patients" emptyMessage="No gender data yet." />
            </ChartCard>
            <ChartCard title="Frequent Patients" subtitle="Patients with the most appointments">
              <CompactTable columns={frequentPatientColumns} emptyMessage="No frequent patient data yet." rows={patientAnalytics.frequentPatients || []} />
            </ChartCard>
          </AnalyticsSection>

          <AnalyticsSection title="Treatment Analytics">
            <ChartCard title="Follow-up Compliance" subtitle="Completed follow-ups compared with requests">
              <div className="rounded-2xl bg-sky-50 p-5 text-center ring-1 ring-sky-100">
                <p className="text-5xl font-semibold text-sky-950">{treatmentAnalytics.followUpCompliance || 0}%</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">Compliance Rate</p>
              </div>
            </ChartCard>
            <ChartCard title="Preventive vs Corrective" subtitle="Treatment type distribution">
              <AnalyticsChart type="doughnut" series={treatmentAnalytics.preventiveVsCorrective} label="Care type" emptyMessage="No treatment type data yet." />
            </ChartCard>
            <ChartCard title="Most Common Procedures" subtitle="Dental record procedure count" className="2xl:col-span-2">
              <MiniBars items={treatmentAnalytics.mostCommonProcedures} emptyMessage="No treatment record data yet." />
            </ChartCard>
          </AnalyticsSection>

          {revenueAnalytics.available ? (
            <AnalyticsSection title="Revenue Analytics">
              <ChartCard title="Monthly Revenue Trend" subtitle="Revenue over time">
                <AnalyticsChart type="line" series={revenueAnalytics.byMonth} label="Revenue" emptyMessage="No revenue data yet." />
              </ChartCard>
              <ChartCard title="Revenue by Service" subtitle="Service-level revenue">
                <AnalyticsChart horizontal series={revenueAnalytics.byService} label="Revenue" emptyMessage="No service revenue yet." />
              </ChartCard>
              <ChartCard title="Revenue by Dentist" subtitle="Provider-level revenue">
                <AnalyticsChart horizontal series={revenueAnalytics.byDentist} label="Revenue" emptyMessage="No dentist revenue yet." />
              </ChartCard>
              <ChartCard title="Payment Method Distribution" subtitle="Cash, GCash, Maya, and card payments">
                <AnalyticsChart type="doughnut" series={revenueAnalytics.byPaymentMethod} label="Payments" emptyMessage="No payment method data yet." />
              </ChartCard>
            </AnalyticsSection>
          ) : null}
        </>
      )}
    </main>
  )
}

export default AdminAnalyticsPage

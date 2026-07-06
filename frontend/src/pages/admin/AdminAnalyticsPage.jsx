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
  FaCheckCircle,
  FaClock,
  FaDownload,
  FaTimesCircle,
  FaUserClock,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { PageHeader } from '../../components/AdminUi.jsx'
import { useToast } from '../../context/ToastContext.jsx'

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip)

const chartColors = ['#16a34a', '#f59e0b', '#2563eb', '#ef4444', '#7c3aed', '#14b8a6', '#f97316', '#0c4a6e']
const statusOptions = ['pending', 'confirmed', 'completed', 'cancelled']
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
  return {
    labels: series.map((item) => item.label),
    datasets: [
      {
        label,
        data: series.map((item) => Number(item.value || 0)),
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
  const isPositive = change > 0
  const isNegative = change < 0
  const changeClass = isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-slate-400'

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
        {isPositive ? '↑' : isNegative ? '↓' : '−'} {isPositive ? '+' : ''}{change}% <span className="font-medium text-slate-400">vs last month</span>
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
  if (!series?.some((item) => Number(item.value) > 0)) return <EmptyState message={emptyMessage} />

  const data = chartData(series, label)
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

function MiniBars({ items = [], emptyMessage = 'No ranking data yet.' }) {
  if (!items?.length) return <EmptyState message={emptyMessage} />
  const visible = items.slice(0, 5)
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
  const rows = [
    ...(growing || []).map((item) => ({ ...item, tone: 'bg-emerald-50 text-emerald-600', prefix: '↑ +' })),
    ...(declining || []).map((item) => ({ ...item, tone: 'bg-red-50 text-red-600', prefix: '↓ ' })),
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
  if (!rows?.length) return <EmptyState message={emptyMessage} />

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100">
      <table className="min-w-[520px] w-full text-left text-xs">
        <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => <th className="px-3 py-2 font-semibold" key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
  const dateLabel = filters.startDate || filters.endDate ? `${filters.startDate || 'Any'} - ${filters.endDate || 'Any'}` : 'All dates'

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[1.8fr_1fr_1fr_1fr_auto]">
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
          <span className="hidden h-10 items-center justify-center rounded-xl bg-slate-50 px-3 text-slate-500 ring-1 ring-slate-100 sm:inline-flex">
            <FaCalendarAlt aria-hidden="true" />
          </span>
          <input aria-label={`Start date. Current range: ${dateLabel}`} className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-sky-900 focus:ring-4 focus:ring-sky-100" type="date" value={filters.startDate} onChange={(event) => update('startDate', event.target.value)} />
          <input aria-label={`End date. Current range: ${dateLabel}`} className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-sky-900 focus:ring-4 focus:ring-sky-100" type="date" value={filters.endDate} onChange={(event) => update('endDate', event.target.value)} />
        </div>
        <select className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-sky-900 focus:ring-4 focus:ring-sky-100" value={filters.dentist} onChange={(event) => update('dentist', event.target.value)}>
          <option value="">All Dentists</option>
          {(options.dentists || []).map((dentist) => <option key={dentist} value={dentist}>{dentist}</option>)}
        </select>
        <select className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-sky-900 focus:ring-4 focus:ring-sky-100" value={filters.service} onChange={(event) => update('service', event.target.value)}>
          <option value="">All Services</option>
          {(options.services || []).map((service) => <option key={service} value={service}>{service}</option>)}
        </select>
        <select className="h-10 rounded-xl border border-gray-200 px-3 text-sm capitalize outline-none focus:border-sky-900 focus:ring-4 focus:ring-sky-100" value={filters.status} onChange={(event) => update('status', event.target.value)}>
          <option value="">All Status</option>
          {[...new Set([...(options.statuses || []), ...statusOptions])].map((status) => <option className="capitalize" key={status} value={status}>{status}</option>)}
        </select>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-800 px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-950" onClick={onExport} type="button">
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
  const [filters, setFilters] = useState({ startDate: '', endDate: '', dentist: '', service: '', status: '' })

  const loadAnalytics = useCallback(async ({ silent = false } = {}) => {
    try {
      const data = await fdmstApi.getAdminAnalytics(filters)
      setDashboard(data)
    } catch (loadError) {
      if (!silent) toast.error(loadError.message || 'Unable to load admin analytics.')
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
      <PageHeader
        eyebrow="Analytics"
        title="Analytics Dashboard"
        description="Monitor clinic performance and key insights."
      />

      <FilterToolbar filters={filters} options={dashboard?.filters || {}} onChange={setFilters} onExport={exportAnalytics} />

      {isLoading ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            {kpiMeta.map((item) => <SkeletonCard key={item.key} />)}
          </section>
          <SkeletonSection />
          <SkeletonSection />
        </>
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
            <ChartCard title="Most Requested Services" subtitle="By total completed appointments">
              <MiniBars items={serviceAnalytics.mostRequested} emptyMessage="No requested service data yet." />
            </ChartCard>
            <ChartCard title="Service Distribution" subtitle="Share of completed appointments">
              <AnalyticsChart type="doughnut" series={serviceAnalytics.distribution} label="Services" emptyMessage="No service distribution yet." />
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

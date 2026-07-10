import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FaAngleDown,
  FaBars,
  FaBell,
  FaBoxOpen,
  FaBullhorn,
  FaCalendarCheck,
  FaChartLine,
  FaCheckCircle,
  FaCog,
  FaCreditCard,
  FaFileAlt,
  FaHome,
  FaMoneyBillWave,
  FaSignOutAlt,
  FaTimes,
  FaTooth,
  FaUser,
  FaUserMd,
  FaUsers,
  FaUserTie,
} from 'react-icons/fa'
import { AUTH_CHANGED_EVENT, authStorage, fdmstApi } from '../api/fdmstApi.js'

const iconMap = {
  analytics: FaChartLine,
  appointments: FaCalendarCheck,
  billing: FaCreditCard,
  dashboard: FaHome,
  dentists: FaUserMd,
  inventory: FaBoxOpen,
  logout: FaSignOutAlt,
  notifications: FaBell,
  patients: FaUsers,
  profile: FaUser,
  promotions: FaBullhorn,
  reports: FaChartLine,
  records: FaFileAlt,
  settings: FaCog,
  staff: FaUserTie,
}

const iconColorMap = {
  analytics: 'text-teal-700 bg-teal-50 ring-teal-100',
  appointments: 'text-emerald-600 bg-emerald-50 ring-emerald-100',
  billing: 'text-amber-600 bg-amber-50 ring-amber-100',
  dashboard: 'text-sky-950 bg-sky-50 ring-sky-100',
  dentists: 'text-cyan-700 bg-cyan-50 ring-cyan-100',
  inventory: 'text-indigo-700 bg-indigo-50 ring-indigo-100',
  logout: 'text-red-600 bg-red-50 ring-red-100',
  notifications: 'text-amber-600 bg-amber-50 ring-amber-100',
  patients: 'text-violet-700 bg-violet-50 ring-violet-100',
  profile: 'text-slate-700 bg-slate-50 ring-slate-100',
  promotions: 'text-amber-600 bg-amber-50 ring-amber-100',
  reports: 'text-teal-700 bg-teal-50 ring-teal-100',
  records: 'text-blue-700 bg-blue-50 ring-blue-100',
  settings: 'text-slate-700 bg-slate-50 ring-slate-100',
  staff: 'text-rose-700 bg-rose-50 ring-rose-100',
}

const roleLabels = {
  admin: 'Administrator',
  dentist: 'Dentist',
  patient: 'Patient',
  staff: 'Staff',
}

const adminPageMeta = [
  { path: '/admin/analytics', title: 'Analytics Dashboard', subtitle: 'Monitor clinic performance and key insights.' },
  { path: '/admin/appointments', title: 'Appointments', subtitle: 'View, filter, and manage clinic appointments.' },
  { path: '/admin/inventory', title: 'Inventory Management', subtitle: 'Manage clinic supplies, stock levels, and reorder alerts.' },
  { path: '/admin/notifications', title: 'Notifications', subtitle: 'Review appointment updates, clinic alerts, and system messages.' },
  { path: '/admin/patients', title: 'Patients', subtitle: 'Manage patient records and information.' },
  { path: '/admin/profile', title: 'Profile', subtitle: 'View and update your account information.' },
  { path: '/admin/promotions', title: 'Promotions', subtitle: 'Manage clinic promotions, offers, and patient announcements.' },
  { path: '/admin/reports', title: 'Reports', subtitle: 'Generate, export, and print clinic operational reports.' },
  { path: '/admin/settings', title: 'Settings', subtitle: 'Manage clinic profile, account, notification, and security preferences.' },
  { path: '/admin/staff', title: 'Staff Management', subtitle: 'Manage staff and dentist accounts securely.' },
  { path: '/admin', title: 'Dashboard', subtitle: "Overview of today's clinic operations." },
]

function getDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'FDMST User'
}

function getAdminPageMeta(pathname) {
  return adminPageMeta.find((item) => (item.path === '/admin' ? pathname === item.path : pathname.startsWith(item.path))) || adminPageMeta[adminPageMeta.length - 1]
}

function getProfilePath(role) {
  if (role === 'admin') return '/admin/profile'
  if (role === 'patient') return '/patient/profile'
  if (role === 'dentist') return '/dentist/profile'
  return '/staff/profile'
}

function getNotificationsPath(role) {
  if (role === 'admin') return '/admin/notifications'
  if (role === 'patient') return '/patient/notifications'
  if (role === 'dentist') return '/dentist/notifications'
  return '/staff/notifications'
}

function getPromotionsPath(role) {
  if (role === 'admin') return '/admin/promotions'
  if (role === 'patient') return '/patient/promotions'
  if (role === 'dentist') return '/dentist/promotions'
  return '/staff/promotions'
}

function formatRelativeTime(value) {
  if (!value) return 'Just now'

  const elapsed = Date.now() - new Date(value).getTime()
  const minutes = Math.max(Math.floor(elapsed / 60000), 0)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function getNotificationIcon(notification) {
  const text = `${notification?.title || ''} ${notification?.message || ''}`.toLowerCase()

  if (text.includes('payment')) return FaMoneyBillWave
  if (text.includes('cancel')) return FaTimes
  if (text.includes('confirm')) return FaCheckCircle
  if (text.includes('appointment') || text.includes('reminder')) return FaCalendarCheck
  return FaBullhorn
}

function Avatar({ user, size = 'md' }) {
  const initials = useMemo(() => {
    const names = [user?.firstName, user?.lastName].filter(Boolean)
    return names.length ? names.map((name) => name[0]).join('').slice(0, 2).toUpperCase() : 'FD'
  }, [user])

  const sizeClass = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm'

  if (user?.profilePhoto) {
    return (
      <img
        src={user.profilePhoto}
        alt=""
        className={`${sizeClass} rounded-full object-cover ring-2 ring-white shadow-sm`}
      />
    )
  }

  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-sky-950 font-semibold text-amber-400 ring-2 ring-white shadow-sm`}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

function DashboardLayout({ portalLabel, navItems }) {
  const navigate = useNavigate()
  const location = useLocation()
  const dropdownRef = useRef(null)
  const notificationRef = useRef(null)
  const [user, setUser] = useState(() => authStorage.getUser())
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [clinicSettings, setClinicSettings] = useState(null)

  useEffect(() => {
    const syncUser = () => setUser(authStorage.getUser())

    window.addEventListener(AUTH_CHANGED_EVENT, syncUser)
    window.addEventListener('storage', syncUser)

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser)
      window.removeEventListener('storage', syncUser)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        const settings = await fdmstApi.getPublicSettings()

        if (isMounted) {
          setClinicSettings(settings || null)
        }
      } catch {
        if (isMounted) {
          setClinicSettings(null)
        }
      }
    }

    loadSettings()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        const data = await fdmstApi.getProfile()

        if (isMounted && data?.user) {
          authStorage.saveSession({ user: data.user })
          setUser(data.user)
        }
      } catch {
        // Keep the locally cached session if the profile request is temporarily unavailable.
      }
    }

    loadProfile()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const handleClickAway = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }

      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setIsNotificationOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickAway)
    return () => document.removeEventListener('mousedown', handleClickAway)
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadNotifications = async () => {
      if (!authStorage.isAuthenticated()) return

      try {
        const response = await fdmstApi.getNotifications()

        if (isMounted) {
          setNotifications(response.data || [])
          setUnreadCount(response.unreadCount || 0)
        }
      } catch {
        if (isMounted) {
          setNotifications([])
          setUnreadCount(0)
        }
      }
    }

    loadNotifications()
    const timer = setInterval(loadNotifications, 30000)

    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [location.pathname])

  const handleLogout = async () => {
    try {
      await fdmstApi.logout()
    } catch {
      // Logging out should still succeed locally if the audit request fails.
    }

    authStorage.clearSession()
    navigate('/login', { replace: true })
  }

  const handleMarkNotificationsRead = async () => {
    try {
      await fdmstApi.markNotificationsRead()
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })))
      setUnreadCount(0)
    } catch {
      // The dropdown stays usable even if the server cannot update read state.
    }
  }

  const handleOpenNotification = async (notification) => {
    if (!notification) return

    if (!notification.isRead) {
      try {
        await fdmstApi.markNotificationRead(notification.id)
      } catch {
        // Navigation should still work if the read-state update is temporarily unavailable.
      }

      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item),
      )
      setUnreadCount((current) => Math.max(current - 1, 0))
    }

    setIsNotificationOpen(false)

    if (notification.type === 'promotion' || notification.metadata?.target === 'promotion') {
      const promotionId = notification.metadata?.promotionId
      const query = promotionId ? `?promotion=${encodeURIComponent(promotionId)}` : ''
      navigate(`${getPromotionsPath(user?.role)}${query}`)
      return
    }

    navigate(getNotificationsPath(user?.role))
  }

  const profilePath = getProfilePath(user?.role)
  const isAdminPortal = user?.role === 'admin' || portalLabel === 'Admin Portal'
  const isPatientPortal = user?.role === 'patient' || portalLabel === 'Patient Portal'
  const headerMeta = useMemo(() => {
    if (isAdminPortal) return getAdminPageMeta(location.pathname)
    if (isPatientPortal) return { title: 'Patient Portal', subtitle: 'Access appointments, records, promotions, and profile details.' }
    return { title: portalLabel, subtitle: `${roleLabels[user?.role] || 'User'} workspace for daily clinic operations.` }
  }, [isAdminPortal, isPatientPortal, location.pathname, portalLabel, user?.role])
  const clinicName = clinicSettings?.clinicName || 'Flores-Dizon Dental Clinic'
  const [brandLead, ...brandRestParts] = clinicName.split(' ')
  const brandRest = brandRestParts.join(' ')

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-700 lg:grid lg:grid-cols-[17rem_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0 lg:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-5">
          <div className="flex items-center gap-3">
            {clinicSettings?.clinicLogo ? (
              <img
                src={clinicSettings.clinicLogo}
                alt=""
                className="h-11 w-11 rounded-2xl object-cover shadow-md ring-1 ring-slate-200"
              />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-950 text-amber-500 shadow-md">
                <FaTooth className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <div>
              <p className="text-sm font-semibold text-sky-950">
                {brandLead || 'Flores-Dizon'} {brandRest ? <span className="text-amber-500">{brandRest}</span> : null}
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                {portalLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <FaTimes className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-5">
          {navItems.map((item) => {
            const iconKey = item.icon || item.action
            const Icon = iconMap[iconKey] || FaFileAlt
            const iconColor = iconColorMap[iconKey] || 'text-slate-700 bg-slate-50 ring-slate-100'

            return item.action === 'logout' ? (
              <button
                key={item.label}
                type="button"
                onClick={handleLogout}
                className="mt-auto flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-600"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${iconColor}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>{item.label}</span>
              </button>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                state={item.preserveFrom ? { from: location.pathname } : undefined}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-sky-950 text-white shadow-lg shadow-sky-950/15 ring-1 ring-sky-900'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-sky-950'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${
                        isActive ? 'bg-amber-400 text-sky-950 ring-amber-300' : iconColor
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>
      </aside>

      {isSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close navigation overlay"
        />
      ) : null}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm shadow-slate-200/40 backdrop-blur">
          <div className="flex min-h-24 items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition hover:border-sky-200 hover:text-sky-950 lg:hidden"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Open navigation"
              >
                <FaBars className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-sky-950 sm:text-3xl">
                  {headerMeta.title}
                </h1>
                <p className="mt-1 hidden max-w-2xl truncate text-sm font-medium text-slate-500 sm:block">
                  {headerMeta.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative" ref={notificationRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsNotificationOpen((current) => !current)
                    setIsDropdownOpen(false)
                  }}
                  className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600"
                  aria-label="Open notifications"
                  aria-haspopup="menu"
                  aria-expanded={isNotificationOpen}
                >
                  <FaBell className="h-5 w-5" aria-hidden="true" />
                  {unreadCount ? (
                    <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[0.65rem] font-bold text-white ring-2 ring-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  ) : null}
                </button>

                {isNotificationOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
                      <div>
                        <p className="text-sm font-semibold text-sky-950">Notifications</p>
                        <p className="text-xs text-slate-500">{unreadCount} unread update{unreadCount === 1 ? '' : 's'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleMarkNotificationsRead}
                        className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 transition hover:bg-sky-100"
                      >
                        Mark all as read
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto py-2">
                      {notifications.length ? notifications.map((notification) => {
                        const Icon = getNotificationIcon(notification)

                        return (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => handleOpenNotification(notification)}
                            className={`mx-2 flex w-[calc(100%-1rem)] gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50 ${
                              notification.isRead ? 'bg-white' : 'bg-sky-50'
                            }`}
                          >
                            {notification.metadata?.promotionImageUrl ? (
                              <img
                                src={notification.metadata.promotionImageUrl}
                                alt=""
                                className="mt-0.5 h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-slate-100"
                              />
                            ) : (
                              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                notification.isRead ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
                              }`}>
                                <Icon className="h-4 w-4" aria-hidden="true" />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-sky-950">{notification.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">{notification.message}</p>
                              <p className="mt-1 text-xs font-medium text-slate-400">{formatRelativeTime(notification.createdAt || notification.scheduledFor)}</p>
                            </div>
                          </button>
                        )
                      }) : (
                        <div className="px-5 py-8 text-center">
                          <p className="text-sm font-semibold text-sky-950">No notifications yet</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">Appointment updates and clinic announcements will appear here.</p>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsNotificationOpen(false)
                        navigate(getNotificationsPath(user?.role))
                      }}
                      className="block w-full border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-sky-950 transition hover:bg-slate-50 hover:text-amber-600"
                    >
                      View All Notifications
                    </button>
                  </div>
                ) : null}
              </div>

            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen((current) => !current)
                  setIsNotificationOpen(false)
                }}
                className="flex max-w-[15rem] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-slate-50 sm:max-w-none sm:px-3"
                aria-haspopup="menu"
                aria-expanded={isDropdownOpen}
              >
                <Avatar user={user} />
                <span className="hidden min-w-0 text-left sm:block">
                  <span className="block truncate text-sm font-semibold text-sky-950">
                    {getDisplayName(user)}
                  </span>
                  <span className="block truncate text-xs font-medium text-slate-500">
                    {roleLabels[user?.role] || user?.role || 'User'}
                  </span>
                </span>
                <FaAngleDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" aria-hidden="true" />
              </button>

              {isDropdownOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-3 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
                    <Avatar user={user} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-sky-950">{getDisplayName(user)}</p>
                      <p className="truncate text-xs text-slate-500">{user?.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsDropdownOpen(false)
                      navigate(profilePath)
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-sky-950"
                  >
                    <FaUser className="h-4 w-4" aria-hidden="true" />
                    Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    <FaSignOutAlt className="h-4 w-4" aria-hidden="true" />
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
            </div>
          </div>
        </header>

        <Outlet context={{ user, setUser }} />
      </div>
    </div>
  )
}

export default DashboardLayout

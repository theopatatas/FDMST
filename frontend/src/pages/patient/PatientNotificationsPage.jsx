import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaBell,
  FaBullhorn,
  FaCalendarCheck,
  FaCheckCircle,
  FaClock,
  FaTimes,
} from 'react-icons/fa'
import { fdmstApi } from '../../api/fdmstApi.js'
import { useToast } from '../../context/ToastContext.jsx'

function formatRelativeTime(value) {
  if (!value) return 'Just now'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'

  const minutes = Math.max(Math.floor((Date.now() - date.getTime()) / 60000), 0)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function getNotificationIcon(notification) {
  const text = `${notification?.title || ''} ${notification?.message || ''}`.toLowerCase()

  if (text.includes('cancel')) return FaTimes
  if (text.includes('confirm')) return FaCheckCircle
  if (text.includes('appointment') || text.includes('reminder')) return FaCalendarCheck
  return FaBullhorn
}

function PatientNotificationsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const loadNotifications = useCallback(() => {
    let isActive = true
    setIsLoading(true)
    setErrorMessage('')

    fdmstApi.getNotifications()
      .then((response) => {
        if (!isActive) return
        setNotifications(Array.isArray(response.data) ? response.data : [])
        setUnreadCount(Number(response.unreadCount) || 0)
      })
      .catch((error) => {
        if (!isActive) return
        setNotifications([])
        setUnreadCount(0)
        setErrorMessage(error.message || 'Unable to load notifications.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let cleanup
    queueMicrotask(() => {
      cleanup = loadNotifications()
    })
    return () => cleanup?.()
  }, [loadNotifications])

  const groupedNotifications = useMemo(() => notifications, [notifications])

  const handleMarkAllRead = async () => {
    try {
      await fdmstApi.markNotificationsRead()
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })))
      setUnreadCount(0)
      toast.success('Notifications marked as read.')
    } catch (error) {
      toast.error(error.message || 'Unable to update notifications.')
    }
  }

  const handleOpenNotification = async (notification) => {
    if (!notification) return

    try {
      await fdmstApi.markNotificationRead(notification.id)
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item),
      )
      if (!notification.isRead) {
        setUnreadCount((current) => Math.max(current - 1, 0))
      }
    } catch (error) {
      toast.error(error.message || 'Unable to update notification.')
    }

    if (notification.type === 'promotion' || notification.metadata?.target === 'promotion') {
      const promotionId = notification.metadata?.promotionId
      navigate(`/patient/promotions${promotionId ? `?promotion=${encodeURIComponent(promotionId)}` : ''}`)
    }
  }

  return (
    <main className="px-4 py-6 text-slate-700 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-2xl bg-sky-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-200">Patient Portal</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Notifications</h1>
              <p className="mt-3 max-w-2xl text-sky-100">
                Review appointment updates, reminders, payment notices, and clinic announcements.
              </p>
            </div>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400 text-sky-950 shadow-lg">
              <FaBell className="h-7 w-7" aria-hidden="true" />
            </span>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-sky-950">Latest Updates</h2>
              <p className="mt-1 text-sm text-slate-500">{unreadCount} unread notification{unreadCount === 1 ? '' : 's'}</p>
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={!notifications.length || !unreadCount}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-950 px-4 text-sm font-semibold text-white transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaCheckCircle className="h-4 w-4" aria-hidden="true" />
              Mark All as Read
            </button>
          </div>

          {isLoading ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
              Loading notifications...
            </div>
          ) : errorMessage ? (
            <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          ) : groupedNotifications.length ? (
            <div className="mt-6 grid gap-3">
              {groupedNotifications.map((notification) => {
                const Icon = getNotificationIcon(notification)

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleOpenNotification(notification)}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                      notification.isRead
                        ? 'border-slate-200 bg-white'
                        : 'border-sky-100 bg-sky-50'
                    }`}
                  >
                    <div className="flex gap-4">
                      {notification.metadata?.promotionImageUrl ? (
                        <img
                          src={notification.metadata.promotionImageUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-2xl object-cover ring-1 ring-slate-100"
                        />
                      ) : (
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${
                          notification.isRead
                            ? 'bg-slate-50 text-slate-500 ring-slate-100'
                            : 'bg-amber-50 text-amber-600 ring-amber-100'
                        }`}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="font-semibold text-sky-950">{notification.title || 'Clinic update'}</h3>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                            <FaClock className="h-3 w-3" aria-hidden="true" />
                            {formatRelativeTime(notification.createdAt || notification.scheduledFor)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{notification.message || 'No additional details.'}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <FaBell className="h-7 w-7" aria-hidden="true" />
              </span>
              <p className="mt-5 text-lg font-semibold text-sky-950">No notifications yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Appointment confirmations, reminders, and clinic announcements will appear here.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default PatientNotificationsPage

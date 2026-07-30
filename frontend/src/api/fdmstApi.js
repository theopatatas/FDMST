const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5050/api'
export const SOCKET_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '')
const AUTH_TOKEN_KEY = 'fdmst_auth_token'
const AUTH_USER_KEY = 'fdmst_auth_user'
export const AUTH_CHANGED_EVENT = 'fdmst-auth-changed'

export const authStorage = {
  saveSession({ token, user }) {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
    }

    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    }

    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  },
  clearSession() {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  },
  getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  },
  getUser() {
    const storedUser = localStorage.getItem(AUTH_USER_KEY)

    if (!storedUser) {
      return null
    }

    try {
      return JSON.parse(storedUser)
    } catch {
      return null
    }
  },
  isAuthenticated() {
    return Boolean(authStorage.getToken())
  },
}

const parseResponse = async (response) => {
  const text = await response.text()
  let data

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!response.ok) {
    const error = new Error(data?.message || 'Something went wrong. Please try again.')
    error.status = response.status
    error.errors = data?.errors || {}
    throw error
  }

  return data
}

const request = async (path, options = {}) => {
  const token = authStorage.getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    })
  } catch {
    throw new Error('Unable to reach the server. Please check your connection and try again.')
  }

  return parseResponse(response)
}

export const fdmstApi = {
  health: () => request('/health'),
  register: (payload) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestRegistrationOtp: (payload) =>
    request('/auth/register/request-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  verifyRegistrationOtp: (payload) =>
    request('/auth/register/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestPasswordResetOtp: (payload) =>
    request('/auth/forgot-password/request-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetPasswordWithOtp: (payload) =>
    request('/auth/forgot-password/reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: async (payload) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    authStorage.saveSession(data)
    return data
  },
  logout: () =>
    request('/auth/logout', {
      method: 'POST',
    }),
  getAdminDashboard: () => request('/dashboard/admin'),
  getPublicSettings: () => request('/public-settings'),
  getAdminAnalytics: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    const query = params.toString()
    return request(`/dashboard/admin/analytics${query ? `?${query}` : ''}`)
  },
  getStaffDashboard: () => request('/dashboard/staff'),
  getProfile: () => request('/users/me'),
  getUserSettings: () => request('/users/me/settings'),
  updateUserSettings: (payload) =>
    request('/users/me/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  logReportAction: (payload) =>
    request('/users/me/report-action', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getNotifications: () => request('/users/me/notifications'),
  markNotificationsRead: () =>
    request('/users/me/notifications/read', {
      method: 'PATCH',
    }),
  markNotificationRead: (id) =>
    request(`/users/me/notifications/${id}/read`, {
      method: 'PATCH',
    }),
  getMessageRecipients: () => request('/messages/recipients'),
  getConversations: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    const query = params.toString()
    return request(`/messages/conversations${query ? `?${query}` : ''}`)
  },
  startConversation: (payload = {}) =>
    request('/messages/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getConversationMessages: (id) => request(`/messages/conversations/${id}/messages`),
  sendConversationMessage: (id, payload) =>
    request(`/messages/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  markConversationRead: (id) =>
    request(`/messages/conversations/${id}/read`, {
      method: 'PATCH',
    }),
  updateProfile: async (payload) => {
    const data = await request('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })

    authStorage.saveSession(data)
    return data
  },
  updatePassword: (payload) =>
    request('/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getClinicDentist: () => request('/appointments/clinic-dentist'),
  getAppointmentAvailability: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    const query = params.toString()
    return request(`/appointments/availability${query ? `?${query}` : ''}`)
  },
  bookAppointment: (payload) =>
    request('/appointments/book', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  validateAppointmentPromo: (payload) =>
    request('/appointments/promo/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getMyAppointments: () => request('/appointments/my'),
  cancelMyAppointment: (id) =>
    request(`/appointments/my/${id}/cancel`, {
      method: 'PATCH',
    }),
  rescheduleMyAppointment: (id, payload) =>
    request(`/appointments/my/${id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getMyDentalRecords: () => request('/dentalrecords/my'),
  getMyCarePatients: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/patients/my-care${query ? `?${query}` : ''}`)
  },
  getMyCarePatient: (id) => request(`/patients/my-care/${id}`),
  getStaff: () => request('/users/staff'),
  verifyAdminPassword: (adminPassword) =>
    request('/users/admin/verify-password', {
      method: 'POST',
      body: JSON.stringify({ adminPassword }),
    }),
  createStaff: (payload) =>
    request('/users/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStaff: (id, payload) =>
    request(`/users/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateStaffStatus: (id, payload) =>
    request(`/users/staff/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getAppointments: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/appointments${query ? `?${query}` : ''}`)
  },
  getAppointment: (id) => request(`/appointments/${id}`),
  getProviderReportAppointments: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/appointments/provider/reports${query ? `?${query}` : ''}`)
  },
  getProviderTreatmentRecords: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/provider/reports${query ? `?${query}` : ''}`)
  },
  getClinicalNotes: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/clinical-notes${query ? `?${query}` : ''}`)
  },
  createClinicalNote: (payload) =>
    request('/dentalrecords/clinical-notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateClinicalNote: (id, payload) =>
    request(`/dentalrecords/clinical-notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  viewClinicalNote: (id, filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/clinical-notes/${id}${query ? `?${query}` : ''}`)
  },
  exportClinicalNotes: (payload) =>
    request('/dentalrecords/clinical-notes/export', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getTreatmentRecords: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/treatment-records${query ? `?${query}` : ''}`)
  },
  createTreatmentRecord: (payload) =>
    request('/dentalrecords/treatment-records', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateTreatmentRecord: (id, payload) =>
    request(`/dentalrecords/treatment-records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  viewTreatmentRecord: (id, filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value)
    })
    const query = params.toString()
    return request(`/dentalrecords/treatment-records/${id}${query ? `?${query}` : ''}`)
  },
  exportTreatmentRecords: (payload) =>
    request('/dentalrecords/treatment-records/export', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAppointmentStatus: (id, payload) =>
    request(`/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(typeof payload === 'string' ? { status: payload } : payload),
    }),
  updateAppointmentNotes: (id, payload) =>
    request(`/appointments/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateAppointmentSchedule: (id, payload) =>
    request(`/appointments/${id}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  recordInventoryUsage: (id, payload) =>
    request(`/inventory/${id}/usage`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sellInventoryItem: (id, payload) =>
    request(`/inventory/${id}/sale`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adjustInventoryStock: (id, payload) =>
    request(`/inventory/${id}/adjust`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  list: (resource) => request(`/${resource}`),
  getById: (resource, id) => request(`/${resource}/${id}`),
  create: (resource, payload) =>
    request(`/${resource}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (resource, id, payload) =>
    request(`/${resource}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remove: (resource, id) =>
    request(`/${resource}/${id}`, {
      method: 'DELETE',
    }),
}

export { API_BASE_URL }

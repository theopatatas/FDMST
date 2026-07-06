export const getRoleHomePath = (role) => {
  if (role === 'admin') return '/admin'
  if (role === 'staff' || role === 'dentist') return '/staff'
  return '/patient'
}

export const formatDate = (value) => {
  if (!value) return '—'

  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const formatStatus = (status) => {
  if (!status) return '—'

  return status.charAt(0).toUpperCase() + status.slice(1)
}

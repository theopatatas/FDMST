import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { authStorage } from '../api/fdmstApi.js'
import { getRoleHomePath } from '../utils/auth.js'

function ProtectedRoute({ allowedRoles, children }) {
  const location = useLocation()
  const user = authStorage.getUser()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={getRoleHomePath(user.role)} replace />
  }

  return children
}

function GuestRoute({ children }) {
  const user = authStorage.getUser()

  if (user) {
    return <Navigate to={getRoleHomePath(user.role)} replace />
  }

  return children
}

function AuthRedirect({ children }) {
  const user = authStorage.getUser()

  useEffect(() => {
    if (user && window.location.pathname === '/login') {
      window.history.replaceState(null, '', getRoleHomePath(user.role))
    }
  }, [user])

  return children
}

export { ProtectedRoute, GuestRoute, AuthRedirect }

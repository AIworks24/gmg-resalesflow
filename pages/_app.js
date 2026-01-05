import '../styles/globals.css'
import { useRouter } from 'next/router'
import { AppProvider } from '../lib/AppContext'
import QueryProvider from '../providers/QueryProvider'
import { AdminAuthProvider } from '../providers/AdminAuthProvider'
import { ApplicantAuthProvider } from '../providers/ApplicantAuthProvider'
import ConnectionStatusIndicator from '../components/ConnectionStatusIndicator'

function AppWithAuth({ Component, pageProps }) {
  const router = useRouter()
  const isAdminRoute = router.pathname.startsWith('/admin')
  
  if (isAdminRoute) {
    return (
      <AdminAuthProvider>
        <Component {...pageProps} />
      </AdminAuthProvider>
    )
  }
  
  return (
    <ApplicantAuthProvider>
      <Component {...pageProps} />
    </ApplicantAuthProvider>
  )
}

export default function App({ Component, pageProps }) {
  return (
    <QueryProvider>
      <AppProvider>
        {/* Connection Status Indicator */}
        <ConnectionStatusIndicator />
        
        <AppWithAuth Component={Component} pageProps={pageProps} />
      </AppProvider>
    </QueryProvider>
  )
}

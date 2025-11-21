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
        {/* Development Environment Warning */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed top-0 left-0 right-0 z-[9999] bg-orange-500 text-white text-center py-2 px-4 font-medium shadow-lg">
            <div className="flex items-center justify-center gap-2">
              <span className="animate-pulse">[DEV]</span>
              <span>DEVELOPMENT ENVIRONMENT</span>
              <span className="animate-pulse">[DEV]</span>
            </div>
          </div>
        )}
        
        {/* Connection Status Indicator */}
        <ConnectionStatusIndicator />
        
        {/* Add top margin when development banner is shown */}
        <div className={process.env.NODE_ENV === 'development' ? 'mt-12' : ''}>
          <AppWithAuth Component={Component} pageProps={pageProps} />
        </div>
      </AppProvider>
    </QueryProvider>
  )
}

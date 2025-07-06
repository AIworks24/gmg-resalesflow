import '../styles/globals.css'
import { AppProvider } from '../lib/AppContext'
import { AuthProvider } from '../lib/AuthContext'

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AppProvider>
        <Component {...pageProps} />
      </AppProvider>
    </AuthProvider>
  )
}

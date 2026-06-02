import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { lazy, Suspense } from 'react'
import { PageSpinner } from '@/components/ui/Spinner'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'

// Lazy load pages for better performance
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const AccountsPage = lazy(() => import('@/pages/AccountsPage'))
const TransactionsPage = lazy(() => import('@/pages/TransactionsPage'))
const CategoriesPage = lazy(() => import('@/pages/CategoriesPage'))
const CreditsPage = lazy(() => import('@/pages/CreditsPage'))
const RecurringPage = lazy(() => import('@/pages/RecurringPage'))
const SchedulePage = lazy(() => import('@/pages/SchedulePage'))
const ProjectionsPage = lazy(() => import('@/pages/ProjectionsPage'))
const SimulationsPage = lazy(() => import('@/pages/SimulationsPage'))
const BankSyncPage = lazy(() => import('@/pages/BankSyncPage'))
const BankSyncCallbackPage = lazy(() => import('@/pages/BankSyncCallbackPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <Suspense fallback={<PageSpinner />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="accounts"
            element={
              <Suspense fallback={<PageSpinner />}>
                <AccountsPage />
              </Suspense>
            }
          />
          <Route
            path="transactions"
            element={
              <Suspense fallback={<PageSpinner />}>
                <TransactionsPage />
              </Suspense>
            }
          />
          <Route
            path="categories"
            element={
              <Suspense fallback={<PageSpinner />}>
                <CategoriesPage />
              </Suspense>
            }
          />
          <Route
            path="credits"
            element={
              <Suspense fallback={<PageSpinner />}>
                <CreditsPage />
              </Suspense>
            }
          />
          <Route
            path="recurring"
            element={
              <Suspense fallback={<PageSpinner />}>
                <RecurringPage />
              </Suspense>
            }
          />
          <Route
            path="schedule"
            element={
              <Suspense fallback={<PageSpinner />}>
                <SchedulePage />
              </Suspense>
            }
          />
          <Route
            path="projections"
            element={
              <Suspense fallback={<PageSpinner />}>
                <ProjectionsPage />
              </Suspense>
            }
          />
          <Route
            path="simulations"
            element={
              <Suspense fallback={<PageSpinner />}>
                <SimulationsPage />
              </Suspense>
            }
          />
          <Route
            path="bank-sync"
            element={
              <Suspense fallback={<PageSpinner />}>
                <BankSyncPage />
              </Suspense>
            }
          />
          <Route
            path="bank-sync/callback"
            element={
              <Suspense fallback={<PageSpinner />}>
                <BankSyncCallbackPage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageSpinner />}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import AdminLayout from './components/admin/AdminLayout.jsx'
import NotFound from './pages/NotFound.jsx'
import DashboardPage from './features/dashboard/DashboardPage.jsx'
import ClassesPage from './features/classes/pages/ClassesPage.jsx'
import ClassDetailsPage from './features/classes/pages/ClassDetailsPage.jsx'
import ParentLayout from './features/parent/components/ParentLayout.jsx'
import WelcomePage from './features/parent/pages/WelcomePage.jsx'
import BrowseClassesPage from './features/parent/pages/BrowseClassesPage.jsx'
import ParentClassDetailsPage from './features/parent/pages/ParentClassDetailsPage.jsx'
import HoldPage from './features/parent/pages/HoldPage.jsx'
import ConfirmPage from './features/parent/pages/ConfirmPage.jsx'
import ConfirmationSuccessPage from './features/parent/pages/ConfirmationSuccessPage.jsx'
import MyApplicationsPage from './features/parent/pages/MyApplicationsPage.jsx'

const router = createBrowserRouter([
  {
    path: '/parent', element: <ParentLayout />,
    children: [
      { index: true, element: <WelcomePage /> },
      { path: 'classes', element: <BrowseClassesPage /> },
      { path: 'classes/:classId', element: <ParentClassDetailsPage /> },
      { path: 'holds/:holdId', element: <HoldPage /> },
      { path: 'holds/:holdId/review', element: <ConfirmPage /> },
      { path: 'holds/:holdId/success', element: <ConfirmationSuccessPage /> },
      { path: 'applications', element: <MyApplicationsPage /> },
    ],
  },
  {
    element: <AdminLayout />,
    children: [
      { path: '/', element: <Navigate to="/admin" replace /> },
      {
        path: '/admin',
        handle: { title: 'Dashboard' },
        element: <DashboardPage />,
      },
      {
        path: '/admin/classes',
        handle: { title: 'Admission Classes' },
        element: <ClassesPage />,
      },
      {
        path: '/admin/classes/new',
        handle: { title: 'Create Class' },
        element: <Navigate to="/admin/classes?create=class" replace />,
      },
      {
        path: '/admin/classes/:classId',
        handle: { title: 'Class Details' },
        element: <ClassDetailsPage />,
      },
      { path: '*', handle: { title: 'Page not found' }, element: <NotFound /> },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App

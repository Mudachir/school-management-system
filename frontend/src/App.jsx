import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import AdminLayout from './components/admin/AdminLayout.jsx'
import NotFound from './pages/NotFound.jsx'
import DashboardPage from './features/dashboard/DashboardPage.jsx'
import ClassesPage from './features/classes/pages/ClassesPage.jsx'
import ClassDetailsPage from './features/classes/pages/ClassDetailsPage.jsx'

const router = createBrowserRouter([
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

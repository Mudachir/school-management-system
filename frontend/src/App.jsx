import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import AdminLayout from './components/admin/AdminLayout.jsx'
import MilestonePlaceholder from './pages/MilestonePlaceholder.jsx'
import NotFound from './pages/NotFound.jsx'

const router = createBrowserRouter([
  {
    element: <AdminLayout />,
    children: [
      { path: '/', element: <Navigate to="/admin" replace /> },
      {
        path: '/admin',
        handle: { title: 'Dashboard' },
        element: (
          <MilestonePlaceholder
            title="Dashboard overview"
            milestone="F2"
            description="The admission overview will be available here in the next milestone."
          />
        ),
      },
      {
        path: '/admin/classes',
        handle: { title: 'Admission Classes' },
        element: (
          <MilestonePlaceholder
            title="Admission Classes"
            milestone="F3"
            description="Class listings and search will be available here in a later milestone."
          />
        ),
      },
      {
        path: '/admin/classes/new',
        handle: { title: 'Create Class' },
        element: (
          <MilestonePlaceholder
            title="Create Admission Class"
            milestone="F5"
            description="Class creation will be available here in a later milestone."
          />
        ),
      },
      {
        path: '/admin/classes/:classId',
        handle: { title: 'Class Details' },
        element: (
          <MilestonePlaceholder
            title="Class Details"
            milestone="F4"
            description="Individual class information will be available here in a later milestone."
            backToClasses
          />
        ),
      },
      { path: '*', handle: { title: 'Page not found' }, element: <NotFound /> },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App

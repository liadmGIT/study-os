import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { useMe } from './lib/queries';
import { ConnectPage } from './pages/Connect';
import { CourseDetailPage } from './pages/CourseDetail';
import { CoursesPage } from './pages/Courses';
import { DashboardPage } from './pages/Dashboard';
import { FilesPage } from './pages/Files';
import { LecturesPage } from './pages/Lectures';
import { LoginPage } from './pages/Login';
import { SettingsPage } from './pages/Settings';
import { TasksPage } from './pages/Tasks';
import { UpdatesPage } from './pages/Updates';
import { WeekPage } from './pages/Week';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/tasks', element: <TasksPage /> },
      { path: '/lectures', element: <LecturesPage /> },
      { path: '/week', element: <WeekPage /> },
      { path: '/courses', element: <CoursesPage /> },
      { path: '/courses/:id', element: <CourseDetailPage /> },
      { path: '/files', element: <FilesPage /> },
      { path: '/updates', element: <UpdatesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/connect', element: <ConnectPage /> },
      { path: '*', element: <DashboardPage /> },
    ],
  },
]);

export function App() {
  const me = useMe();
  if (me.isLoading) return <PageLoader />;
  if (!me.data?.authed) return <LoginPage />;
  return <RouterProvider router={router} />;
}

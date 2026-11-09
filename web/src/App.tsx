import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { ApiError } from './lib/api';
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
  // isPending (not isLoading): while saved data is being restored the query is pending but not fetching yet.
  if (me.isPending) return <PageLoader />;
  // No connection (not a "logged out" answer): open the app with the data saved on this device.
  const offline = me.isError && !(me.error instanceof ApiError);
  if (!me.data?.authed && !offline) return <LoginPage />;
  return <RouterProvider router={router} />;
}

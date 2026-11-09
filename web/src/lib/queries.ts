import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import { get } from './api';
import type {
  AppNotification,
  Announcement,
  Change,
  Course,
  CourseDetail,
  CourseLag,
  Dashboard,
  FileItem,
  Lecture,
  MoodleStatus,
  SettingsResponse,
  SyncRun,
  SyncStatus,
  Task,
  WeekData,
} from './types';

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => get<{ authed: boolean }>('/api/auth/me'), staleTime: Infinity, retry: 1 });
export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dashboard>('/api/dashboard') });
export const useTasks = (includeHidden = false) =>
  useQuery({ queryKey: ['tasks', includeHidden], queryFn: () => get<Task[]>(`/api/tasks${includeHidden ? '?includeHidden=1' : ''}`) });
export const useTask = (id: number | null) =>
  useQuery({ queryKey: ['task', id], queryFn: () => get<Task>(`/api/tasks/${id}`), enabled: id !== null });
export const useLectures = () =>
  useQuery({ queryKey: ['lectures'], queryFn: () => get<{ lectures: Lecture[]; lag: CourseLag[]; today: string }>('/api/lectures?includeIgnored=1') });
export const useWeek = (start?: string) =>
  useQuery({ queryKey: ['week', start ?? 'now'], queryFn: () => get<WeekData>(`/api/week${start ? `?start=${start}` : ''}`) });
export const useCourses = () => useQuery({ queryKey: ['courses'], queryFn: () => get<Course[]>('/api/courses') });
export const useCourse = (id: number) => useQuery({ queryKey: ['course', id], queryFn: () => get<CourseDetail>(`/api/courses/${id}`) });
export const useFiles = (courseId?: number) =>
  useQuery({ queryKey: ['files', courseId ?? 'all'], queryFn: () => get<FileItem[]>(`/api/files${courseId ? `?courseId=${courseId}` : ''}`) });
export const useUpdates = () => useQuery({ queryKey: ['updates'], queryFn: () => get<Change[]>('/api/updates?limit=100') });
export const useAnnouncements = () => useQuery({ queryKey: ['announcements'], queryFn: () => get<Announcement[]>('/api/announcements') });
export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: () => get<{ notifications: AppNotification[]; unread: number }>('/api/notifications') });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => get<SettingsResponse>('/api/settings') });
export const useMoodleStatus = () => useQuery({ queryKey: ['moodle-status'], queryFn: () => get<MoodleStatus>('/api/moodle/status') });
export const useSyncRuns = () => useQuery({ queryKey: ['sync-runs'], queryFn: () => get<SyncRun[]>('/api/sync/runs') });

export const useSyncStatus = () =>
  useQuery({
    queryKey: ['sync-status'],
    queryFn: () => get<SyncStatus>('/api/sync/status'),
    refetchInterval: (q) => (q.state.data?.running ? 2000 : 60000),
  });

/** Runs a server call, refreshes every query afterwards, and shows errors as a toast. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { success?: string; onDone?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: (r) => {
      qc.invalidateQueries();
      if (opts.success) toast(opts.success);
      opts.onDone?.(r);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  return { run: (...args: A) => m.mutate(args), runAsync: (...args: A) => m.mutateAsync(args), pending: m.isPending };
}

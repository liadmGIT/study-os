import { CircleAlert, CircleCheck, Clock, Download, FolderOpen, RotateCw, Video } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Badge, Card, Chip, Empty, IconButton, PageHeader, PageLoader, SectionTitle } from '../components/ui';
import { post } from '../lib/api';
import { formatAgo, formatSize } from '../lib/format';
import { useAction, useCourses, useFiles } from '../lib/queries';
import type { FileItem } from '../lib/types';

const STATE: Record<FileItem['state'], { label: string; icon: typeof Clock; tone: 'green' | 'neutral' | 'red' | 'slate' }> = {
  downloaded: { label: 'הורד', icon: CircleCheck, tone: 'green' },
  pending: { label: 'ממתין להורדה', icon: Clock, tone: 'neutral' },
  video: { label: 'וידאו – לא מורד', icon: Video, tone: 'slate' },
  too_large: { label: 'גדול מדי', icon: CircleAlert, tone: 'slate' },
  error: { label: 'ההורדה נכשלה', icon: CircleAlert, tone: 'red' },
};

export function FilesPage() {
  const [params, setParams] = useSearchParams();
  const courses = useCourses();
  const active = courses.data?.filter((c) => c.active) ?? [];
  const courseId = params.get('course') ? Number(params.get('course')) : (active[0]?.id ?? undefined);
  const files = useFiles(courseId);
  const retry = useAction((id: number) => post(`/api/files/${id}/retry`), { success: 'הקובץ הורד' });

  const bySection = useMemo(() => {
    const m = new Map<string, FileItem[]>();
    for (const f of files.data ?? []) {
      const k = f.sectionName || 'כללי';
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return [...m.entries()];
  }, [files.data]);

  const downloaded = files.data?.filter((f) => f.state === 'downloaded').length ?? 0;

  return (
    <div>
      <PageHeader
        title="קבצים"
        subtitle="כל המצגות והקבצים יורדים אוטומטית לשרת, מסודרים לפי קורס ושבוע"
        actions={
          courseId ? (
            <a href={`/api/files/zip?courseId=${courseId}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-canvas">
              <Download className="size-4" />
              הורד הכול (ZIP)
            </a>
          ) : null
        }
      />
      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {active.map((c) => (
          <Chip key={c.id} active={courseId === c.id} onClick={() => (params.set('course', String(c.id)), setParams(params, { replace: true }))}>
            <span className="size-2 rounded-full" style={{ background: c.color }} />
            {c.fullName}
          </Chip>
        ))}
      </div>

      {files.isLoading || courses.isLoading ? (
        <PageLoader />
      ) : !files.data?.length ? (
        <Card>
          <Empty icon={<FolderOpen className="size-8" />} title="אין קבצים">
            קבצים מהקורס יופיעו כאן אחרי הסנכרון.
          </Empty>
        </Card>
      ) : (
        <Card className="p-2 sm:p-3">
          <p className="px-2 pb-1 text-xs text-muted">
            {downloaded} מתוך {files.data.length} קבצים הורדו
          </p>
          {bySection.map(([section, list]) => (
            <section key={section}>
              <SectionTitle count={list.length}>
                <span className="px-1">{section}</span>
              </SectionTitle>
              {list.map((f) => {
                const s = STATE[f.state];
                return (
                  <div key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-sunken">
                    <s.icon className={`size-4 shrink-0 ${f.state === 'error' ? 'text-overdue' : f.state === 'downloaded' ? 'text-ok' : 'text-faint'}`} />
                    <div className="min-w-0 flex-1">
                      <a href={`/api/files/${f.id}/download?inline=1`} target="_blank" rel="noreferrer" className="block truncate text-sm hover:underline" dir="auto">
                        {f.filename}
                      </a>
                      <div className="flex flex-wrap gap-x-2 text-[11px] text-muted">
                        {f.moduleName && f.moduleName !== f.filename ? <span className="truncate">{f.moduleName}</span> : null}
                        <span className="tabular">{formatSize(f.fileSize)}</span>
                        {f.timeModified ? <span>עודכן {formatAgo(f.timeModified)}</span> : null}
                        {f.state !== 'downloaded' && f.state !== 'pending' ? <span>{s.label}</span> : null}
                      </div>
                    </div>
                    {f.isNew ? <Badge tone="brand">חדש</Badge> : null}
                    {f.state === 'error' || f.state === 'too_large' || f.state === 'video' ? (
                      <IconButton label="הורד עכשיו" onClick={() => retry.run(f.id)} disabled={retry.pending}>
                        <RotateCw className="size-4" />
                      </IconButton>
                    ) : null}
                    <a href={`/api/files/${f.id}/download`} className="inline-flex size-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink" aria-label="הורדה">
                      <Download className="size-4" />
                    </a>
                  </div>
                );
              })}
            </section>
          ))}
        </Card>
      )}
    </div>
  );
}

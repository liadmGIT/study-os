import { Download, RotateCw } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { buttonClass, cn, Empty, GroupLabel, IconButton, PageHeader, PageLoader, Select, Tag } from '../components/ui';
import { post } from '../lib/api';
import { formatAgo, formatSize } from '../lib/format';
import { useAction, useCourses, useFiles } from '../lib/queries';
import type { FileItem } from '../lib/types';

const STATE_LABEL: Partial<Record<FileItem['state'], string>> = {
  pending: 'ממתין להורדה',
  video: 'וידאו, לא הורד',
  too_large: 'גדול מדי, לא הורד',
  error: 'ההורדה נכשלה',
};

/** "PDF", "PPTX"… from the file name: a quieter cue than an icon per row. */
function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toUpperCase() : 'FILE';
}

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
        eyebrow={files.data?.length ? `${downloaded} מתוך ${files.data.length} שמורים בשרת` : undefined}
        title="קבצים"
        subtitle="מצגות וקבצים חדשים יורדים לבד, מסודרים לפי קורס ושבוע."
      />

      <div className="rise mb-6 flex flex-wrap items-center gap-2" style={{ '--i': 1 } as CSSProperties}>
        <Select
          value={courseId ?? ''}
          onChange={(e) => {
            params.set('course', e.target.value);
            setParams(params, { replace: true });
          }}
          aria-label="קורס"
          className="w-auto min-w-0 flex-1 sm:max-w-80 sm:flex-none"
        >
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </Select>
        {courseId ? (
          <a href={`/api/files/zip?courseId=${courseId}`} className={buttonClass('secondary')}>
            <Download className="size-4" aria-hidden />
            הכול כ-ZIP
          </a>
        ) : null}
      </div>

      {files.isLoading || courses.isLoading ? (
        <PageLoader />
      ) : !files.data?.length ? (
        <Empty title="אין קבצים" className="border-y border-rule">
          קבצים מהקורס יופיעו כאן אחרי הסנכרון.
        </Empty>
      ) : (
        <div className="rise" style={{ '--i': 2 } as CSSProperties}>
          {bySection.map(([section, list]) => (
            <section key={section} aria-label={section}>
              <GroupLabel count={list.length}>{section}</GroupLabel>
              <ul>
                {list.map((f) => {
                  const stateLabel = STATE_LABEL[f.state];
                  return (
                    <li key={f.id} className="flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
                      <span className="w-11 shrink-0 text-center text-[11.5px] font-semibold tracking-wide text-ink-3" aria-hidden>
                        {extOf(f.filename)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={`/api/files/${f.id}/download?inline=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-[15px] underline-offset-4 hover:underline"
                        >
                          <bdi>{f.filename}</bdi>
                        </a>
                        <p className="flex flex-wrap gap-x-2.5 text-[13px] text-ink-2">
                          {f.moduleName && f.moduleName !== f.filename ? <span className="truncate">{f.moduleName}</span> : null}
                          <span dir="ltr" className="tabular">{formatSize(f.fileSize)}</span>
                          {f.timeModified ? <span>עודכן {formatAgo(f.timeModified)}</span> : null}
                          {stateLabel ? <span className={cn(f.state === 'error' && 'text-accent')}>{stateLabel}</span> : null}
                        </p>
                      </div>
                      {f.isNew ? <Tag tone="blue">חדש</Tag> : null}
                      {f.state === 'error' || f.state === 'too_large' || f.state === 'video' ? (
                        <IconButton label={`להוריד עכשיו: ${f.filename}`} onClick={() => retry.run(f.id)} disabled={retry.pending}>
                          <RotateCw className="size-4" aria-hidden />
                        </IconButton>
                      ) : null}
                      <a
                        href={`/api/files/${f.id}/download`}
                        className="inline-flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-sunken hover:text-ink md:size-9"
                        aria-label={`הורדה: ${f.filename}`}
                      >
                        <Download className="size-4" aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

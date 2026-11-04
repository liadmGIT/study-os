// Lecturer announcements (the "news" forum of each course).
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { cleanName } from '../lib/html';
import type { ForumDiscussionsResponse, MoodleForum } from '../moodle/types';
import { bump, can, recordChange, step, type SyncContext } from './context';

export async function syncAnnouncements(ctx: SyncContext) {
  if (!can(ctx, 'mod_forum_get_forums_by_courses') || !ctx.activeCourses.length) return;
  const forums = await ctx.client.call<MoodleForum[]>('mod_forum_get_forums_by_courses', {
    courseids: ctx.activeCourses.map((c) => c.id),
  });
  const news = forums.filter((f) => f.type === 'news');
  const useNew = can(ctx, 'mod_forum_get_forum_discussions');

  await Promise.all(
    news.map((forum) =>
      step(ctx, `forum ${forum.id}`, async () => {
        const res = useNew
          ? await ctx.client.call<ForumDiscussionsResponse>('mod_forum_get_forum_discussions', { forumid: forum.id, page: 0, perpage: 20 })
          : await ctx.client.call<ForumDiscussionsResponse>('mod_forum_get_forum_discussions_paginated', {
              forumid: forum.id,
              sortby: 'timemodified',
              sortdirection: 'DESC',
              page: 0,
              perpage: 20,
            });
        for (const d of res.discussions) {
          const id = d.discussion ?? d.id;
          const postedAt = d.created ?? d.timemodified ?? d.modified ?? ctx.now;
          const row = {
            courseId: forum.course,
            forumId: forum.id,
            subject: cleanName(d.subject || d.name),
            message: d.message ?? '',
            author: d.userfullname ? cleanName(d.userfullname) : null,
            postedAt,
            pinned: Boolean(d.pinned),
          };
          const old = db().select().from(schema.announcements).where(eq(schema.announcements.id, id)).get();
          if (!old) {
            const quiet = ctx.quietCourses.has(forum.course);
            db()
              .insert(schema.announcements)
              .values({ id, ...row, read: quiet, firstSeenAt: ctx.now })
              .run();
            bump(ctx, 'announcements.new');
            recordChange(ctx, {
              type: 'announcement_new',
              courseId: forum.course,
              entityType: 'announcement',
              entityId: id,
              title: row.subject,
              payload: { author: row.author },
            });
          } else {
            db().update(schema.announcements).set(row).where(eq(schema.announcements.id, id)).run();
          }
        }
      }),
    ),
  );
}

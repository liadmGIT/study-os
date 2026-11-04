import type { FastifyReply } from 'fastify';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const res = schema.safeParse(data);
  if (!res.success) {
    throw new HttpError(400, res.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), 'invalid_input');
  }
  return res.data;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export function notFound(what = 'Not found'): never {
  throw new HttpError(404, what, 'not_found');
}

/** Content-Disposition that keeps Hebrew file names intact. */
export function attachment(reply: FastifyReply, filename: string, inline = false) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  reply.header(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
}

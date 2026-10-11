import { bookmarkSchema, contentIdSchema, notesSchema, searchQuerySchema } from '@genpath/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../middleware/auth';
import { parseBody, parseParams, parseQuery } from '../../lib/validate';
import type { Services } from '../../services';

const courseParams = z.object({ courseId: contentIdSchema });
const lessonParams = z.object({ lessonId: contentIdSchema });
const lessonBySlugParams = z.object({ courseId: contentIdSchema, lessonSlug: contentIdSchema });

export function curriculumRouter(services: Services): Router {
  const router = Router();
  // Mounted without a path prefix, so guard each route (a router-level guard would turn
  // unknown URLs into 401s instead of 404s).
  const { curriculum } = services;

  router.get('/courses', requireAuth, async (req, res) => {
    res.json({ data: await curriculum.listCourses(authOf(req).userId) });
  });

  router.get('/courses/:courseId', requireAuth, async (req, res) => {
    const { courseId } = parseParams(courseParams, req);
    res.json({ data: await curriculum.getCourse(courseId, authOf(req).userId) });
  });

  router.get('/courses/:courseId/lessons/:lessonSlug', requireAuth, async (req, res) => {
    const { courseId, lessonSlug } = parseParams(lessonBySlugParams, req);
    const lessonId = await curriculum.resolveLessonId(courseId, lessonSlug);
    res.json({ data: await curriculum.getLesson(lessonId, authOf(req).userId) });
  });

  router.get('/lessons/:lessonId', requireAuth, async (req, res) => {
    const { lessonId } = parseParams(lessonParams, req);
    res.json({ data: await curriculum.getLesson(lessonId, authOf(req).userId) });
  });

  router.post('/lessons/:lessonId/start', requireAuth, async (req, res) => {
    const { lessonId } = parseParams(lessonParams, req);
    res.json({ data: await curriculum.startLesson(authOf(req).userId, lessonId) });
  });

  router.post('/lessons/:lessonId/complete', requireAuth, async (req, res) => {
    const { lessonId } = parseParams(lessonParams, req);
    res.json({ data: await curriculum.completeLesson(authOf(req).userId, lessonId) });
  });

  router.put('/lessons/:lessonId/notes', requireAuth, async (req, res) => {
    const { lessonId } = parseParams(lessonParams, req);
    const { notes } = parseBody(notesSchema, req);
    res.json({ data: await curriculum.saveNotes(authOf(req).userId, lessonId, notes) });
  });

  router.put('/lessons/:lessonId/bookmark', requireAuth, async (req, res) => {
    const { lessonId } = parseParams(lessonParams, req);
    const { bookmarked } = parseBody(bookmarkSchema, req);
    res.json({ data: await curriculum.setBookmark(authOf(req).userId, lessonId, bookmarked) });
  });

  router.get('/bookmarks', requireAuth, async (req, res) => {
    res.json({ data: await curriculum.bookmarks(authOf(req).userId) });
  });

  router.get('/search', requireAuth, async (req, res) => {
    const { q } = parseQuery(searchQuerySchema, req);
    res.json({ data: await curriculum.search(q) });
  });

  return router;
}

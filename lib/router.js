/**
 * HTTP routes for the teacher wizard.
 *
 * These are plain `ctx.webServer.register()` routes on the DSH Host, so the
 * page is same-origin with the Host and can `fetch` the API below with no
 * token handling in the browser at all. The token stays in the Host's
 * credential record; the browser only ever sends an account and password once
 * at sign-in.
 */

import { prepareSaturday } from './gesp.js';
import { json, html } from './page.js';
import { renderTeacherPage } from './teacher-page.js';
import { DEFAULT_HOSTS, WeeklyError } from './http.js';

/** Where the page lives; the sidebar entry opens the same path. */
export const PAGE_PATH = '/tiku-weekly';
export const API_PATH = '/tiku-weekly/api';

const BODY_LIMIT = 60 * 1024 * 1024;

/** Read a JSON body from a plain Node request stream. */
async function readRequestJson(request) {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > BODY_LIMIT) {
    throw new WeeklyError('请求体过大：学生版课件最大 50MB，教师私有版最大 3MB', { code: 'BODY_TOO_LARGE' });
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > BODY_LIMIT) {
      throw new WeeklyError('请求体过大：学生版课件最大 50MB，教师私有版最大 3MB', { code: 'BODY_TOO_LARGE' });
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new WeeklyError('请求体不是合法 JSON', { code: 'BAD_JSON' });
  }
}

/** A missing session is a client-state problem (401), not a server fault. */
const STATUS_FALLBACK = { NO_SESSION: 401, NOT_TEACHER: 403, BAD_JSON: 400, BODY_TOO_LARGE: 413 };

function failure(error) {
  if (error instanceof WeeklyError) {
    return json({ error: 'weekly-error', ...error.toJSON() }, error.status ?? STATUS_FALLBACK[error.code] ?? 500);
  }
  return json({ error: 'internal', message: error?.message ?? String(error) }, 500);
}

/**
 * Register the page and its API.
 *
 * @param {object} ctx - the Host context
 * @param {import('./service.js').WeeklyService} service
 * @returns {() => void} disposer
 */
export function registerRoutes(ctx, service) {
  const routes = [];

  // Tolerate a route left behind by an earlier activation of this row: a
  // duplicate path would otherwise fail activation forever, and a watcher or
  // HMR reload can re-run `apply` without the previous disposer having run.
  const claim = (route) => {
    const register = () => ctx.webServer.register(route);
    try {
      routes.push(register());
    } catch (error) {
      if (!/duplicate .* route/i.test(String(error?.message))) throw error;
      ctx.logger?.warn?.(`tiku-weekly: ${route.path} was still registered; keeping the existing route`);
    }
  };

  claim({
    kind: 'exact',
    path: PAGE_PATH,
    resource: async () => html(renderTeacherPage({ host: '/tiku-weekly/api' })),
  });

  const get = (path, handler) => claim({
    kind: 'exact',
    path,
    resource: async (request) => {
      const url = new URL(request.url);
      try {
        return json(await handler(url.searchParams));
      } catch (error) {
        return failure(error);
      }
    },
  });

  /**
   * POST routes use a `handler` rather than a `resource`: a resource answers
   * only GET and HEAD, so a form submission would get 405 from the carrier
   * before the route ran. The handler owns the whole exchange.
   */
  const post = (path, handler, validate) => claim({
    kind: 'exact',
    path,
    handler: async (request, response) => {
      let result;
      let body;
      try {
        validate?.(request);
        body = await readRequestJson(request);
        result = json(await handler(body, new URL(request.url ?? '/', 'http://localhost').searchParams));
      } catch (error) {
        result = failure(error);
      }
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    },
  });

  // ── session ─────────────────────────────────────────────────────────────
  get(`${API_PATH}/status`, async () => ({ ...(await service.status()), currentVersion: await service.updater.localVersion() }));
  get(`${API_PATH}/update/check`, () => service.updater.check());
  post(`${API_PATH}/update/apply`, () => service.updater.apply(), request => {
    if (request.method !== 'POST') throw new WeeklyError('请使用 POST', { status: 405 });
    // A browser cross-origin form cannot set this custom header.
    if ((request.headers.origin && request.headers['x-tiku-update'] !== '1') || request.headers['sec-fetch-site'] === 'cross-site') {
      throw new WeeklyError('请从每周课程面板发起更新', { status: 403 });
    }
  });
  get(`${API_PATH}/bootstrap`, () => service.bootstrap());
  post(`${API_PATH}/login`, ({ account, password }) => service.login(account, password));
  post(`${API_PATH}/logout`, () => service.logout());

  // ── context ─────────────────────────────────────────────────────────────
  get(`${API_PATH}/classes`, () => service.classes());
  get(`${API_PATH}/my-courses`, () => service.myCourses());
  get(`${API_PATH}/class-courses`, (q) => service.classCourses(q.get('classId')));
  get(`${API_PATH}/chapters`, (q) => service.chapters(q.get('courseId')));
  get(`${API_PATH}/lessons`, (q) => service.lessons(q.get('courseId'), q.get('chapterId')));
  get(`${API_PATH}/topics`, (q) => service.topics(q.get('courseId')));
  get(`${API_PATH}/plans`, (q) => service.plans(q.get('courseId')));

  // ── step 1 ──────────────────────────────────────────────────────────────
  get(`${API_PATH}/chain/preview`, (q) => {
    return service.previewChain({
      courseId: q.get('courseId'),
      sourceClassId: q.get('sourceClassId'),
      targetClassId: q.get('targetClassId'),
    });
  });
  post(`${API_PATH}/draft/step1`, (body) => service.putDraftSection('step1', body));

  // ── step 2 ──────────────────────────────────────────────────────────────
  post(`${API_PATH}/draft/step2`, (body) => service.putDraftSection('step2', body));

  // ── step 3 ──────────────────────────────────────────────────────────────
  get(`${API_PATH}/binding/candidates`, (q) => service.candidates({
    classId: q.get('classId'), courseId: q.get('courseId'), lessonId: q.get('lessonId'), keyword: q.get('q'),
  }));
  get(`${API_PATH}/lesson/tasks`, (q) => service.tasks({
    classId: q.get('classId'), courseId: q.get('courseId'), lessonId: q.get('lessonId'),
  }));
  post(`${API_PATH}/draft/step3`, (body) => service.putDraftSection('step3', body));
  post(`${API_PATH}/homework/edit`, (body) => service.startEdit(body));

  // ── step 4 ──────────────────────────────────────────────────────────────
  post(`${API_PATH}/cards/prepare`, body=>prepareSaturday(service, body));
  get(`${API_PATH}/card-context`, () => service.cardContext());
  get(`${API_PATH}/homework-list`, q=>service.homeworkList(q.get('classId')));
  post(`${API_PATH}/cards/preview`, body=>service.prepareCard(body));
  get(`${API_PATH}/cards`, (query) => service.lessonCards({classId:query.get('classId')}));
  get(`${API_PATH}/draft`, (q) => service.getDraft(q.get('classId')));
  post(`${API_PATH}/draft/reset`, (body) => service.clearDraft(body?.classId));
  post(`${API_PATH}/paper/open`, ({ draftId }) => service.paperOpen(draftId));
  post(`${API_PATH}/dry-run`, body => service.dryRun(body.classId));
  post(`${API_PATH}/execute`, ({ batchId }) => service.execute(batchId));
  post(`${API_PATH}/execute/retry`, ({ batchId, stepId }) => service.retry(batchId, stepId));
  post(`${API_PATH}/execute/undo`, ({ batchId, stepId }) => service.undo(batchId, stepId));
  get(`${API_PATH}/batch`, async (q) => {
    const { userId } = await requireUser(service);
    return service.batch(userId, q.get('batchId'));
  });

  // ── paper intake & single-student targeted homework ─────────────────────
  get(`${API_PATH}/class-students`, (q) => service.classStudents(q.get('classId')));
  get(`${API_PATH}/paper/draft`, (q) => service.paperGet(q.get('draftId') || null));
  post(`${API_PATH}/paper/ingest`, (body) => service.paperIngest(body));
  post(`${API_PATH}/paper/meta`, (body) => service.paperUpdateMeta(body));
  post(`${API_PATH}/paper/student`, (body) => service.paperResolveStudent(body));
  post(`${API_PATH}/paper/pages/reorder`, (body) => service.paperReorderPages(body));
  post(`${API_PATH}/paper/question/edit`, (body) => service.paperEditQuestion(body));
  post(`${API_PATH}/paper/question/split`, (body) => service.paperSplitQuestion(body));
  post(`${API_PATH}/paper/question/merge`, (body) => service.paperMergeQuestions(body));
  post(`${API_PATH}/paper/questions/reorder`, (body) => service.paperReorderQuestions(body));
  get(`${API_PATH}/paper/preview`, (q) => service.paperPreview(q.get('draftId') || null));
  post(`${API_PATH}/paper/execute`, ({ draftId }) => service.paperExecute(draftId || null));

  // ── unified K12 courseware v2.1 templates ───────────────────────────────
  get(`${API_PATH}/courseware/templates`, () => service.coursewarePresets());
  post(`${API_PATH}/courseware/generate`, (body) => service.generateCoursewareV2(body));

  return () => {
    for (const dispose of routes.splice(0)) {
      try {
        dispose();
      } catch {
        // Registration already gone; nothing to undo.
      }
    }
  };
}

/** Resolve the signed-in user for routes that need an id before acting. */
async function requireUser(service) {
  const status = await service.status();
  if (!status.loggedIn) throw new WeeklyError('还没有登录童澄账号', { code: 'NO_SESSION' });
  return { userId: status.userId, role: status.session?.role };
}

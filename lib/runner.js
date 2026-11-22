/**
 * Execution of a compiled plan.
 *
 * One batch holds one plan and one live status per step, so the UI can show
 * wait / running / ok / failed, retry a single step, and undo the ones that
 * were published. Nothing here re-plans: a batch executes exactly the steps
 * the teacher previewed.
 */

import { runStep, undoFor } from './plan.js';
import { WeeklyError } from './http.js';

/** Batch lifetime; a stale batch is collected rather than leaking. */
const BATCH_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_BATCHES = 20;

let counter = 0;

function newId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** The plain status shape sent to the browser and to tools. */
function view(batch) {
  return {
    id: batch.id,
    ownerId: batch.ownerId,
    createdAt: batch.createdAt,
    finishedAt: batch.finishedAt ?? null,
    warnings: batch.warnings,
    blocked: batch.blocked,
    steps: batch.steps.map((step) => ({
      id: step.id,
      title: step.title,
      kind: step.kind,
      method: step.method,
      endpoint: step.endpoint,
      preview: step.preview,
      meta: step.meta,
      status: step.status,
      result: step.result ?? null,
      error: step.error ?? null,
      undoCandidate: Boolean(step.undoCandidate),
    })),
    summary: {
      total: batch.steps.length,
      ok: batch.steps.filter((s) => s.status === 'ok').length,
      failed: batch.steps.filter((s) => s.status === 'failed').length,
      waiting: batch.steps.filter((s) => s.status === 'waiting' || s.status === 'running').length,
    },
  };
}

/**
 * Compiled steps carry `id` and `title`; the batch copy keeps both. The spread
 * order matters: the runtime fields must not overwrite the step identity.
 */
function decorate(compiled) {
  return {
    id: compiled.id,
    title: compiled.title,
    kind: compiled.kind,
    method: compiled.method,
    endpoint: compiled.endpoint,
    pathname: compiled.pathname,
    body: compiled.body,
    preview: compiled.preview,
    meta: compiled.meta ?? {},
    status: 'waiting',
    result: null,
    error: null,
    undoCandidate: false,
  };
}

/**
 * Accept either a flat payload `{ context, step1, step2, step3 }` or one nested
 * under `payload`, because the service and the tests build it differently.
 */
function normalizePayload(payload) {
  const source = payload && payload.payload ? { ...payload, ...payload.payload } : (payload ?? {});
  return {
    context: source.context ?? {},
    step1: source.step1 ?? {},
    step2: source.step2 ?? {},
    step3: source.step3 ?? {},
  };
}

export class Runner {
  constructor() {
    /** @type {Map<string, object>} */
    this.batches = new Map();
  }

  /** Drop stale batches so a long session does not grow without bound. */
  sweep() {
    const now = Date.now();
    for (const [id, batch] of this.batches) {
      if (now - batch.createdAt > BATCH_TTL_MS) this.batches.delete(id);
    }
    if (this.batches.size > MAX_BATCHES) {
      const oldest = [...this.batches.values()].sort((a, b) => a.createdAt - b.createdAt);
      for (const batch of oldest.slice(0, this.batches.size - MAX_BATCHES)) this.batches.delete(batch.id);
    }
  }

  /**
   * Register a dry-run plan as a batch. Nothing is executed here.
   * @returns the batch view
   */
  create({ ownerId, plan, payload }) {
    this.sweep();
    const batch = {
      id: newId('batch'),
      ownerId,
      createdAt: Date.now(),
      warnings: plan.warnings,
      blocked: plan.blocked,
      steps: plan.steps.map((step) => decorate(step)),
      // A batch owns a flat payload; a caller that nests it under `payload`
      // still works, because the sections are fall back to the batch itself.
      payload: normalizePayload(payload),
      executed: false,
    };
    this.batches.set(batch.id, batch);
    return view(batch);
  }

  get(ownerId, batchId) {
    const batch = this.batches.get(batchId);
    if (!batch || batch.ownerId !== ownerId) return null;
    return batch;
  }

  viewOf(batch) {
    return view(batch);
  }

  /**
   * Execute every waiting step in order.
   *
   * A failure does not silently continue past dependent steps: the report
   * says which later steps need a retry of the failed one first.
   */
  async execute(ownerId, batchId, { host, token, teacherId, onProgress } = {}) {
    const batch = this.get(ownerId, batchId);
    if (!batch) throw new WeeklyError('找不到这次预演，请重新点「发布前预演」', { code: 'NO_BATCH' });
    if (batch.blocked.length > 0) {
      throw new WeeklyError('预演里还有被拦截的步骤，先修好再发布', {
        code: 'BLOCKED',
        fix: batch.blocked.map((item) => item.reason).join('；'),
      });
    }

    if (batch.executed) throw new WeeklyError('该批次已执行，请只重试失败项');
    const ctx = {
      host, token, teacherId,
      context: batch.payload.context ?? {},
      step1: batch.payload.step1 ?? {},
      step2: batch.payload.step2 ?? {},
      step3: batch.payload.step3 ?? {},
      resolved: { ...(batch.payload.context ?? {}) },
    };

    batch.executed = true;
    for (const step of batch.steps) {
      if (step.status !== 'waiting') continue;
      step.status = 'running';
      onProgress?.(view(batch));
      try {
        const result = await runStep(step, ctx);
        step.status = 'ok';
        step.result = result;
        Object.assign(ctx.resolved, this.resolvedFrom(batch));
        step.undoCandidate = Boolean(undoFor(step, batch.payload.context ?? {}));
      } catch (error) {
        step.status = 'failed';
        step.error = error instanceof WeeklyError
          ? error.toJSON()
          : { message: error?.message ?? String(error), code: null, status: null };
      }
      onProgress?.(view(batch));
      if (step.status === 'failed') break;
    }
    batch.finishedAt = Date.now();
    return view(batch);
  }

  /** Re-run exactly one failed (or waiting) step. */
  async retry(ownerId, batchId, stepId, { host, token, teacherId, onProgress } = {}) {
    const batch = this.get(ownerId, batchId);
    if (!batch) throw new WeeklyError('找不到这次预演', { code: 'NO_BATCH' });
    const step = batch.steps.find((item) => item.id === stepId);
    if (!step) throw new WeeklyError(`预演里没有步骤 ${stepId}`, { code: 'NO_STEP' });
    if (!batch.executed || batch.blocked.length || batch.steps.slice(0,batch.steps.indexOf(step)).some(s=>s.status!=='ok') || step.status==='running') throw new WeeklyError('请先完成前面的步骤并等待当前执行结束');
    if (step.status === 'ok') throw new WeeklyError('这一步已经成功，不需要重试', { code: 'ALREADY_OK' });

    const ctx = {
      host, token, teacherId,
      context: batch.payload.context ?? {},
      step1: batch.payload.step1 ?? {},
      step2: batch.payload.step2 ?? {},
      step3: batch.payload.step3 ?? {},
      resolved: this.resolvedFrom(batch),
    };
    step.status = 'running';
    step.error = null;
    onProgress?.(view(batch));
    try {
      const result = await runStep(step, ctx);
      step.status = 'ok';
      step.result = result;
      step.undoCandidate = Boolean(undoFor(step, batch.payload.context ?? {}));
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof WeeklyError
        ? error.toJSON()
        : { message: error?.message ?? String(error), code: null, status: null };
    }
    onProgress?.(view(batch));
    return view(batch);
  }

  /** Rebuild the id map from steps that already succeeded, so retries resolve placeholders. */
  resolvedFrom(batch) {
    const resolved = { ...(batch.payload.context ?? {}) };
    for (const step of batch.steps) {
      if (step.status !== 'ok' || !step.result) continue;
      if (step.id === 'course.create' && step.result.id) resolved.courseId = step.result.id;
      if (step.id === 'chapter.create' && step.result.id) resolved.chapterId = step.result.id;
      if (step.id === 'lesson.add' && step.result.id) resolved.lessonId = step.result.id;
      if (step.id === 'class.create' && step.result.id) resolved.classId = step.result.id;
      if (step.id === 'courseware.student.topic' && step.result.id) resolved.topicId = step.result.id;
      if (step.id === 'courseware.student' && step.result.link) resolved.publicUrl = step.result.link;
      if (step.id === 'exam.create' && step.result.id) resolved.examId = step.result.id;
      if (step.id === 'homework.create' && step.result.id) resolved.homeworkId = step.result.id;
      if (step.id === 'chat.push' && step.result.id) resolved.chatPostId = step.result.id;
      if (step.id === 'plan.create' && step.result.id) resolved.planId = step.result.id;
    }
    return resolved;
  }

  /** Undo one published step, where the contract offers a withdraw path. */
  async undo(ownerId, batchId, stepId, { host, token } = {}) {
    const batch = this.get(ownerId, batchId);
    if (!batch) throw new WeeklyError('找不到这次预演', { code: 'NO_BATCH' });
    const step = batch.steps.find((item) => item.id === stepId);
    if (!step) throw new WeeklyError(`预演里没有步骤 ${stepId}`, { code: 'NO_STEP' });
    if (step.status !== 'ok') throw new WeeklyError('只有已经成功的步骤才能撤回', { code: 'NOT_OK' });
    const undo = undoFor(step, batch.payload.context ?? {});
    if (!undo) {
      throw new WeeklyError('这一步没有撤回接口，需要到童澄后台手动处理', {
        code: 'NO_UNDO',
        fix: '目前只有随堂绑题、任务链、作业 v2、群卡片支持撤回。',
      });
    }
    if (undo.needsResult && !step.result?.id) {
      throw new WeeklyError('这步没有返回可撤回的 ID', { code: 'NO_RESULT_ID' });
    }
    const payload = await undo.run(host, token, step.result ?? {});
    step.status = 'undone';
    step.undoCandidate = false;
    return { stepId, label: undo.label, payload, batch: view(batch) };
  }
}

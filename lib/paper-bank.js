import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { WeeklyError, requestJson, DEFAULT_HOSTS } from './http.js';

const types = new Set(['choice', 'blank', 'calculation', 'open-ended', 'material', 'judge', 'oj']);
export function canonicalQuestionType(value) {
  return ['fill-in-blank', 'fill_blank', 'fill'].includes(value) ? 'blank' : value;
}

const cleanAnswer = answer => ['string', 'number'].includes(typeof answer) && String(answer).trim() && !/待补|待核对|待填写|待确认|暂无答案|TBD|TODO/i.test(answer);
const partAnswer = part => part.answer ?? part.reference_answer;
const validUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };
const imageUrl = image => image?.url || image?.src || image;
function failure(code, message, issues = []) {
  const error = new WeeklyError(message, { code });
  error.issues = issues;
  return error;
}

export async function teacherPost({ host, token }, pathname, body) {
  try {
    return await requestJson({ base: host === DEFAULT_HOSTS.teach ? DEFAULT_HOSTS.tiku : host, token, pathname, method: 'POST', body });
  } catch (error) {
    if ([401, 403].includes(error.status)) error.code = 'BANK_AUTH_FAILED';
    throw error;
  }
}

export async function edu(ctx, operation, args) {
  const { assessmentId, targetKnowledgeId, mode = 'exam', duplicateCheck = true, confirm, title, description, duration, totalScore, scorePerQuestion, publish = false } = args;
  if (operation !== 'list' && !String(assessmentId ?? '').trim()) throw new WeeklyError('缺少 assessmentId');
  if (operation === 'import' && (!String(targetKnowledgeId ?? '').trim() || !['questions', 'exam'].includes(mode))) throw new WeeklyError('请选择题库章节与导入模式');
  const action = operation === 'import' && confirm !== true ? 'preview' : operation;
  const { keyword, page, limit, status, type } = args;
  const body = action === 'list' ? { action, keyword, page, limit, status, type } : { action, assessment_id: assessmentId };
  if (action === 'import') Object.assign(body, { mode, target_knowledge_id: targetKnowledgeId, duplicate_check: duplicateCheck, title, description, duration, total_score: totalScore, score_per_question: scorePerQuestion, publish });
  const { data } = await teacherPost(ctx, '/api/teacher/edu-import', body);
  if (action === 'preview' && data?.questions?.length !== data?.exam?.question_count) throw new WeeklyError('EDU 预览不完整，请先升级题库后端');
  return { data, dryRun: operation === 'import' && action === 'preview', ...(data?.failed ? { ok: false } : {}) };
}

export async function bank(ctx, args, get = false, allowMissing = false) {
  const ids = args.questionIds ?? (args.questionId ? [args.questionId] : []);
  if (get && (!Array.isArray(ids) || !ids.length || ids.some(id => !id))) throw failure('BANK_NOT_FOUND', '缺少题库 ID');
  const { category, keyword, subject, grade, fromNumber, toNumber, page, limit } = args;
  const body = get ? { action: 'bank_get', questionIds: [...new Set(ids)] }
    : { action: 'bank_search', category, keyword, subject, grade, fromNumber, toNumber, page, limit };
  const result = await teacherPost(ctx, '/api/teacher/question-data', body);
  if (!Array.isArray(result.questions)) throw new WeeklyError('题库返回格式异常，请核对后端版本');
  if (get && !allowMissing) {
    const missing = ids.filter(id => !result.questions.some(q => q.id === id));
    if (missing.length) throw failure('BANK_NOT_FOUND', '部分题目不存在或当前教师不可见', missing.map(id => ({ id })));
  }
  return result;
}

function saveBatch(service, ctx, draft, before) {
  const current = service.requireDraft(ctx.userId, draft.id);
  if (current.revision !== draft.revision || Object.keys(current.execution.questionIdMap || {}).length || current.execution.examId ||
      service.store.locks.has(ctx.userId + ':' + draft.id)) throw new WeeklyError('草稿已变更或已开始提交，请重新打开');
  if (JSON.stringify(draft.questions) !== before) {
    draft.revision++;
    service.store.save(ctx.userId, draft);
  }
}

export function bindingEvidence(q, row, questionNumber, targetKnowledgeId, similarity) {
  const bankQuestionId = row.id;
  const same = (a, b) => a == null || b == null ? null : String(a) === String(b);
  const evidence = { questionNumber, bankQuestionId, originalNo: same(q.originalNo, row.originalNo),
    similarity: similarity(q.content, row.content), type: same(canonicalQuestionType(q.type), canonicalQuestionType(row.type)), score: same(q.score, row.score),
    knowledge: same(q.target_knowledge_id || targetKnowledgeId, row.knowledge_id) };
  const comparable = text => String(text).replace(/^\s*\d+[.、．]\s*/, '').replace(/\s/g, '');
  const exact = comparable(q.content) === comparable(row.content);
  const optionsMatch = !['choice', 'judge'].includes(q.type) || JSON.stringify(q.options || []) === JSON.stringify(row.options || []);
  evidence.options = optionsMatch;
  evidence.confidence = exact && optionsMatch && evidence.type && ![evidence.originalNo, evidence.score, evidence.knowledge].includes(false) ? 'high' : 'low';
  return evidence;
}

export async function bind(service, ctx, args, similarity, flags) {
  const { bindings, confirmLowConfidence, overwriteAnswers, dryRun } = args;
  if (!Array.isArray(bindings) || !bindings.length || new Set(bindings.map(b => b.questionNumber)).size !== bindings.length) throw new WeeklyError('请提供不重复的草稿题号');
  const draft = service.requireDraft(ctx.userId, args.draftId);
  const before = JSON.stringify(draft.questions);
  const rows = await service.bankRows(ctx, bindings.map(b => b.bankQuestionId));
  const matches = [];
  for (const { questionNumber, bankQuestionId } of bindings) {
    const q = draft.questions[service.findQuestionIndex(draft, { questionNumber })];
    const row = rows.find(r => r.id === bankQuestionId);
    if (!row) throw failure('BANK_NOT_FOUND', '找不到题库题目 ' + bankQuestionId);
    const evidence = bindingEvidence(q, row, questionNumber, draft.targetKnowledgeId, similarity);
    matches.push(evidence);
    q.reuseQuestionId = row.id;
    if (overwriteAnswers === true) {
      if (cleanAnswer(row.correct_option)) q.correct_option = row.correct_option;
      const parts = row.parts || [];
      for (const part of q.parts || []) {
        const matched = parts.filter(p => part.label && p.label === part.label);
        if (matched.length === 1 && cleanAnswer(partAnswer(matched[0]))) {
          part.answer = partAnswer(matched[0]);
          if ('reference_answer' in part) part.reference_answer = part.answer;
        }
      }
    }
    q.flags = flags(q);
  }
  if (matches.some(m => m.confidence === 'low') && confirmLowConfidence !== true) throw failure('BIND_CONFIDENCE_LOW', '请逐题核对差异后显式确认', matches);
  if (!dryRun) saveBatch(service, ctx, draft, before);
  return { matches, revision: draft.revision, dryRun: !!dryRun };
}

export async function upload(service, ctx, { path, url }) {
  if (!!path === !!url) throw failure('IMAGE_UNREACHABLE', '请选择一个本地文件或公网 HTTPS 图片');
  let result;
  if (url) {
    if (!validUrl(url)) throw failure('IMAGE_UNREACHABLE', '图片必须使用公网 HTTPS 地址');
    result = await teacherPost(ctx, '/api/upload-image', { url });
  } else {
    const info = await stat(path).catch(() => null);
    const mimeType = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[extname(path).toLowerCase()];
    if (!mimeType || !info?.isFile() || info.size > 10 * 1024 * 1024) throw failure('IMAGE_UNREACHABLE', '本地图片不存在、格式错误或超过 10 MB');
    result = await service.uploadImageRemote(ctx.host, ctx.token, { fileName: basename(path), mimeType, bytes: await readFile(path) });
  }
  const metadata = await service.imageMetadata(ctx, result?.url ?? result?.data?.url);
  if (!validUrl(metadata.url) || !metadata.ok) throw failure(imageCode(metadata), '图片质量检查失败', [metadata]);
  return metadata;
}

function imageCode(metadata) {
  return metadata.issues?.some(i => ['image_low_resolution', 'image_file_too_small'].includes(i.code)) ? 'IMAGE_TOO_SMALL' : 'IMAGE_UNREACHABLE';
}

export function setImages(service, ctx, { draftId, questionNumbers, images, oldUrl }, flags) {
  if (!Array.isArray(questionNumbers) || !questionNumbers.length || !Array.isArray(images) || !images.every(validUrl)) throw failure('IMAGE_UNREACHABLE', '请提供题号和 HTTPS 图片列表');
  const draft = service.requireDraft(ctx.userId, draftId);
  const before = JSON.stringify(draft.questions);
  const removed = new Set(oldUrl ? [oldUrl] : []);
  for (const number of new Set(questionNumbers)) {
    const q = draft.questions[service.findQuestionIndex(draft, { questionNumber: number })];
    const previous = q.images || [];
    for (const item of previous) if (!oldUrl || imageUrl(item) === oldUrl) removed.add(imageUrl(item));
    q.images = [...new Set(oldUrl ? previous.flatMap(item => imageUrl(item) === oldUrl ? images : [item]) : images)];
    q.flags = flags(q);
  }
  saveBatch(service, ctx, draft, before);
  const questionUrls = draft.questions.flatMap(q => (q.images || []).map(imageUrl));
  const remainingReferences = {};
  const countRefs = (value, url) => {
    if (typeof value === 'string') return value.split(url).length - 1;
    if (!value || typeof value !== 'object') return 0;
    return Object.values(value).reduce((count, item) => count + countRefs(item, url), 0);
  };
  for (const url of removed) remainingReferences[url] = countRefs(draft, url);
  return { revision: draft.revision, remainingReferences,
    questionImageReferences: Object.fromEntries([...removed].map(url => [url, questionUrls.filter(ref => ref === url).length])) };
}

export async function preflight(service, ctx, draft) {
  const errors = [], warnings = [], questions = [], usage = new Map();
  const ids = draft.questions.map(q => q.reuseQuestionId).filter(Boolean);
  const bankRows = new Map((ids.length ? await service.bankRows(ctx, ids, true) : []).map(row => [row.id, row]));
  let totalScore = 0;
  for (const [index, q] of draft.questions.entries()) {
    const questionNumber = index + 1;
    const issues = [];
    const issue = (field, message, code = 'PREFLIGHT_BLOCKED') => issues.push({ questionNumber, field, code, message });
    if (!String(q.content ?? '').replace(/<[^>]+>/g, '').trim()) issue('content', '题干为空');
    if (!types.has(canonicalQuestionType(q.type))) issue('type', '未知题型');
    if (!cleanAnswer(q.correct_option)) issue('correct_option', '答案缺失或仍含占位文本');
    const labels = new Set();
    let partScore = 0;
    for (const part of q.parts || []) {
      if (!part?.label || labels.has(part.label) || !cleanAnswer(partAnswer(part))) issue('parts', '小问标签重复、缺失或答案待补');
      labels.add(part?.label);
      partScore += Number(part?.score);
    }
    if ((q.parts || []).some(p => p?.score != null) && (!Number.isFinite(partScore) || Math.abs(partScore - Number(q.score)) > 0.00001)) issue('parts.score', '小问分值与本题不符');
    if (!(Number(q.score) > 0 && Number.isFinite(Number(q.score)))) issue('score', '分值须为正数');
    totalScore += Number(q.score);
    const reused = bankRows.get(q.reuseQuestionId);
    if (reused && !cleanAnswer(reused.correct_option)) issue('reuseQuestionId.correct_option', '正式复用题的答案缺失或含占位文本');
    const bankLabels = new Set();
    for (const part of reused?.parts || []) {
      if (!part?.label || bankLabels.has(part.label) || !cleanAnswer(partAnswer(part))) issue('reuseQuestionId.parts', '正式复用题的小问标签或答案不完整');
      bankLabels.add(part?.label);
    }
    if (reused && (labels.size !== bankLabels.size || [...labels].some(label => !bankLabels.has(label)))) {
      issue('reuseQuestionId.parts', '草稿与正式复用题的小问标签不一致');
    }
    if (q.reuseQuestionId && !reused) issue('reuseQuestionId', '复用题不存在或不可见', 'BANK_NOT_FOUND');
    if (!q.reuseQuestionId && !(q.target_knowledge_id || draft.targetKnowledgeId)) issue('target_knowledge_id', '缺少题库章节');
    for (const url of new Set([...(q.images || []), ...(reused?.images || [])].map(imageUrl))) {
      if (!usage.has(url)) usage.set(url, []);
      usage.get(url).push(questionNumber);
    }
    questions.push({ questionNumber, reuseQuestionId: q.reuseQuestionId ?? null, errors: issues });
  }
  for (const [url, numbers] of usage) {
    let result;
    try { result = await service.imageMetadata(ctx, url); }
    catch (error) {
      if (error.code === 'BANK_AUTH_FAILED') throw error;
      result = { ok: false, url, issues: [{ code: 'image_unreachable', message: error.message }] };
    }
    if (!result.ok) for (const n of numbers) questions[n - 1].errors.push({ questionNumber: n, field: 'images', code: imageCode(result), ...result });
    if (numbers.length > 3) warnings.push({ field: 'images', url, questionNumbers: numbers, message: '多道题使用同一张图片' });
  }
  errors.push(...questions.flatMap(q => q.errors));
  const pendingNew = draft.questions.filter(q => !q.reuseQuestionId);
  if (pendingNew.length && typeof service.importCoordinatesFor === 'function') {
    try {
      await service.importCoordinatesFor(ctx.host, ctx.token, draft, pendingNew);
    } catch (error) {
      if (error?.code !== 'IMPORT_COORDINATE_REQUIRED') throw error;
      errors.push({ field: 'import_coordinate', code: 'IMPORT_COORDINATE_REQUIRED', message: error.message });
    }
  }
  if (!questions.length || (draft.totalScore != null && (!Number.isFinite(Number(draft.totalScore)) || Math.abs(totalScore - Number(draft.totalScore)) > 0.00001))) errors.push({ field: 'totalScore', message: '全卷总分与预期不符或卷面为空' });
  return { ok: !errors.length, ...(errors.length ? { code: 'PREFLIGHT_BLOCKED' } : {}), totalScore, reusedCount: ids.length, newCount: questions.length - ids.length, errors, warnings, questions };
}

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { requestJson } from './http.js';
import { sbBase } from './api.js';

const skillDir = join(homedir(), '.codex/skills/tongcheng-gesp-lesson-cards');
export const saturdayClass = '9748f438-79b0-4fa3-bfb7-2d203242ca3c';

export async function lessonEvidence(service, { classId = saturdayClass, keyword = '' }) {
  const { host, token, userId } = await service.requireTeacher();
  const target = await service.assertClassUsable(host, token, userId, classId);
  const read = (table, params) => requestJson({ base: sbBase(host) + '/rest/v1', pathname: '/' + table, token, apikey: true, params });
  if (keyword) {
    if (!/^[\p{L}\p{N} +_-]{1,60}$/u.test(keyword)) throw Error('请用简短的题名或知识点检索');
    const questions = await read('quiz_questions', { select: 'id,content,knowledge_point,oj_problem_id', type: 'eq.oj', oj_problem_id: 'not.is.null', or: '(content.ilike.*' + keyword + '*,knowledge_point.ilike.*' + keyword + '*)', limit: 40 });
    return { questions: questions.map(q => ({...q,content:String(q.content).slice(0,160)})) };
  }
  const roster = await read('class_students',{select:'student_id',class_id:'eq.'+classId});
  const ids = roster.map(r=>r.student_id);
  const [guide, handoff, courses, homework, profiles, submissions] = await Promise.all([
    readFile(join(skillDir,'SKILL.md'),'utf8'), classId===saturdayClass ? readFile(join(skillDir,'saturday-class.md'),'utf8') : '',
    service.classCourses(classId),
    read('homework',{select:'id,title,assigned_to,due_date,status',class_id:'eq.'+classId,order:'created_at.desc',limit:40}),
    ids.length ? read('profiles',{select:'id,full_name,username',id:'in.('+ids.join(',')+')'}) : [],
    Promise.all(ids.map(id=>read('oj_submissions',{select:'user_id,oj_problem_id,is_accepted,status,submitted_at',user_id:'eq.'+id,order:'submitted_at.desc',limit:20}))),
  ]);
  return {target,guide,handoff,courses,homework,students:ids.map((id,i)=>({id,profile:profiles.find(x=>x.id===id),recentOJ:submissions[i]}))};
}

const units = {
  '二': {course:/GESP2\b|GESP2-/i, topics:['数组','数列','平均','统计']},
  '四': {course:/GESP4\b|GESP4-/i, topics:['结构体','成绩','排名','坐标','排序']},
  '五': {course:/GESP5\b|GESP5-/i, topics:['动态规划','最大子','子序列','矩阵','递推']},
};
const problemKey = id => String(id).replace(/^\/+/, '').toLowerCase();
const headline = content => String(content).split('\n').find(line=>line.trim())?.replace(/^[#*\s]+|[*\s]+$/g,'').slice(0,100);

// The dated handoff supplies the starting point. Live membership, the course
// directory and dated submissions determine which suggestions can be made.
export async function prepareSaturday(service, args) {
  const evidence=await lessonEvidence(service,args);
  if(args.keyword || evidence.target.id!==saturdayClass)return evidence;
  const {cards:existing}=await service.lessonCards({classId:saturdayClass});
  const plans=new Map();
  const pending=[];
  for(const student of evidence.students){
    if(existing.some(c=>c.studentId===student.id))continue;
    const name=student.profile?.full_name;
    const row=evidence.handoff.split('\n').find(line=>line.startsWith('| '+name+' |'));
    const level=row?.match(/\| ([二四五])级/)?.[1];
    const unit=units[level];
    const course=unit && evidence.courses.courses.find(c=>unit.course.test(c.title));
    if(!name || !course || !evidence.handoff.includes('以第 4 课为候选')){pending.push({name,reason:'交接级别或目标课次待确认'});continue;}
    if(!plans.has(level)){
      const {lessons}=await service.lessons(course.courseId);
      const lesson=lessons.find(l=>/(?:^|\D)4(?:\s*$|[课讲次])/u.test(l.title)) ?? (level==='四' ? lessons.find(l=>l.title.includes('结构体')) : null);
      const candidates=await Promise.all(unit.topics.map(keyword=>lessonEvidence(service,{classId:saturdayClass,keyword})));
      plans.set(level,{lesson,questions:candidates.flatMap(r=>r.questions)});
    }
    const {lesson,questions}=plans.get(level);
    if(!lesson){pending.push({name,reason:'课程目录未匹配第 4 课'});continue;}
    const passed=new Set(student.recentOJ.filter(x=>x.is_accepted).map(x=>problemKey(x.oj_problem_id)));
    const prior=new Set(student.recentOJ.map(x=>problemKey(x.oj_problem_id)));
    const unique=new Map();
    for(const q of questions){
      const k=problemKey(q.oj_problem_id);
      if(!k || passed.has(k) || !headline(q.content))continue;
      if(!unique.has(k))unique.set(k,q);
    }
    const ranked=[...unique.values()].sort((a,b)=>Number(prior.has(problemKey(b.oj_problem_id)))-Number(prior.has(problemKey(a.oj_problem_id))));
    if(ranked.length<6){pending.push({name,reason:'去重后不足六题'});continue;}
    const chosen=ranked.slice(0,6).map(q=>({id:q.id,title:headline(q.content),reason:prior.has(problemKey(q.oj_problem_id))?'近期有提交，未见通过，安排巩固':student.recentOJ.length?'本课相关候选，近期记录未见通过':'近期 OJ 记录为空，暂按课次推荐，程度待确认'}));
    const {revision}=await service.lessonCards({classId:saturdayClass});
    await service.lessonCards({classId:saturdayClass,studentId:student.id,lesson:lesson.title,questions:chosen,revision});
  }
  return {classId:saturdayClass, className:evidence.target.name, preview:await service.lessonCards({classId:saturdayClass}),pending,
    evidence:evidence.students.map(s=>({studentId:s.id,name:s.profile?.full_name,recentOJ:s.recentOJ.length,passed:s.recentOJ.filter(r=>r.is_accepted).length,latest:s.recentOJ[0]?.submitted_at ?? null})),
    instruction:'这是共享草稿。按学生展示选题和证据；无需另行检索已保存的题目。正式班只预演。'};
}

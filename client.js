window.__ModuleLoader__.load({
  id: 'tongcheng-tiku-weekly',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Dictionary namespace owned by this plugin. */
    const NS = 'tikuWeekly';
    /** Shared by the sidebar entry and the main panel it opens. */
    const PANEL_ID = 'tiku-weekly';
    /** The teacher wizard the Host serves on its own routes. */
    const PAGE_PATH = '/tiku-weekly';

    const zh = {
      panel: '每周课程',
      title: '童澄每周课程发布',
      subtitle: '建课、课件、绑题、作业与考试，一步步走完；发布前先预演。',
      statusIdle: '未登录',
      openWizard: '打开完整向导',
      hideWizard: '收起向导（保留草稿）',
      openWizardHint: '向导在右侧打开。点左侧会话可回到对话。',
      step1: '① 建课与排课次',
      step1Body: '新建课程、追加课次、复制教学计划、跨班复制任务链，都在完整向导里完成。',
      step2: '② 课件双版上传',
      step2Body: '学生版走 OSS 直传，教师私有版走私有接口；需要拖拽文件，所以放在完整向导。',
      step3: '③ 绑题 · 作业 · 考试',
      step3Body: '随堂绑题、作业 v2、考试与课次任务链，含冲突拦截，都在完整向导里配置。',
      step4: '④ 预演与发布',
      step4Body: '先在完整向导里点「发布前预演」看清单，确认后再一键发布，失败可单步重试。',
      footer: '也可以直接让我帮你：说「查一下我的班级」或「预演本周课程发布」，我用同一套接口执行。',
      reload: '刷新登录状态',
      loading: '读取中…',
      openHere: '在本窗口打开完整向导',
      notTeacher: '当前账号不是教师，只能查看',
    };

    const en = {
      panel: 'Weekly courses',
      title: 'Tongcheng weekly course publishing',
      subtitle: 'Build, attach courseware, bind questions, publish homework and exams — with a dry run first.',
      statusIdle: 'Not signed in',
      openWizard: 'Open the full wizard',
      hideWizard: 'Hide wizard and keep draft',
      openWizardHint: 'Open the wizard here. Select a conversation in the sidebar to return to chat.',
      step1: '① Courses and lessons',
      step1Body: 'Create courses, append lessons, copy a plan, or copy a task chain across classes in the full wizard.',
      step2: '② Two courseware versions',
      step2Body: 'Student version uploads to OSS, the private teacher version uses the private API; drag-and-drop lives in the wizard.',
      step3: '③ Questions, homework, exams',
      step3Body: 'Lesson-sidebar questions, homework v2, exams, and the five-stage task chain, with conflict checks.',
      step4: '④ Preview and publish',
      step4Body: 'Preview the plan first, then publish once; a failed step can be retried on its own.',
      footer: 'You can also ask me directly: “list my classes” or “dry-run this week’s publishing”.',
      reload: 'Refresh sign-in state',
      loading: 'Loading…',
      openHere: 'Open the full wizard in this window',
      notTeacher: 'This account is not a teacher, so it can only view.',
    };

    const CSS = [
      '.tkW_panel{box-sizing:border-box;display:flex;flex-direction:column;gap:16px;height:100%;min-height:0;overflow:auto;padding:24px 28px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.tkW_head{display:flex;flex-direction:column;gap:4px}',
      '.tkW_title{margin:0;font-size:16px;font-weight:600;line-height:24px}',
      '.tkW_sub{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.tkW_bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.tkW_pill{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:12px;line-height:18px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.tkW_pillOk{color:var(--dsw-static-green-500);border-color:transparent;background:var(--dsw-static-green-500-a12)}',
      '.tkW_pillMuted{color:var(--dsw-alias-label-tertiary)}',
      '.tkW_pillWarn{color:var(--dsw-static-amber-600);border-color:transparent;background:var(--dsw-static-amber-100)}',
      '.tkW_spacer{flex:1}',
      '.tkW_btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:5px 12px;cursor:pointer}',
      '.tkW_btn:hover{background:var(--dsw-alias-button-floating-hover)}',
      '.tkW_btnPrimary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent;font-weight:600}',
      '.tkW_btnPrimary:hover{background:var(--dsw-alias-button-primary-hover)}',
      '.tkW_steps{display:flex;flex-direction:column;gap:8px}',
      '.tkW_step{display:flex;gap:12px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.tkW_stepNum{flex:none;width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.tkW_stepBody{min-width:0}',
      '.tkW_stepTitle{margin:0;font-size:13.5px;font-weight:600;line-height:20px}',
      '.tkW_stepText{margin:2px 0 0;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary)}',
      '.tkW_hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.tkW_err{font-size:12.5px;line-height:19px;color:var(--dsw-static-red-400);padding:8px 10px;border-radius:8px;background:var(--dsw-static-red-400-a12)}',
    ].join('');

    /** Map the backend's role code to the words a teacher recognises. */
    function roleLabel(role) {
      const labels = { teacher: '教师', admin: '管理员' };
      return labels[role] ?? (role ?? '');
    }

    /** Sidebar glyph: a stacked deck of course slides. */
    function WeeklyIcon({ size = 18, active = false }) {
      return h(
        'svg',
        {
          width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
          strokeWidth: active ? 1.9 : 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': 'true', focusable: 'false', style: { display: 'block' },
        },
        h('rect', { key: 'deck', x: '3.5', y: '5', width: '17', height: '11', rx: '2' }),
        h('path', { key: 'stand', d: 'M9 19.5h6' }),
        h('path', { key: 'stem', d: 'M12 16v3.5' }),
        h('path', { key: 'line', d: 'M7 8.5h10' }),
      );
    }

    /** The main panel: a launchpad with a live status bar and a route into the full wizard. */
    function WeeklyPage({ t }) {
      const [status, setStatus] = React.useState({ kind: 'loading' });
      const [error, setError] = React.useState(null);

      const load = React.useCallback(() => {
        setStatus({ kind: 'loading' });
        setError(null);
        fetch('/tiku-weekly/api/status', { headers: { Accept: 'application/json' } })
          .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
          .then(({ ok, body }) => {
            if (!ok) throw new Error(body?.message ?? body?.error ?? 'status failed');
            setStatus({ kind: 'ready', body });
          })
          .catch((cause) => {
            setStatus({ kind: 'error' });
            setError(String(cause?.message ?? cause));
          });
      }, []);

      React.useEffect(load, [load]);

      const openWizard = () => {
        let dock = document.getElementById('weekly-course-dock');
        if (!dock) {
          dock = document.createElement('aside');
          dock.id = 'weekly-course-dock';
          dock.setAttribute('aria-label', t('panel'));
          const style = document.createElement('style');
          style.textContent = `
            body.weekly-split { --weekly-width: 44vw; --weekly-right-rail: 64px; }
            /* Keep the host viewport intact: shrinking body also moves its right toolbar. */
            #weekly-course-dock { position:fixed; inset:0 var(--weekly-right-rail, 64px) 0 auto; width:var(--weekly-width); z-index:10; background:white; display:flex; flex-direction:column; border-left:1px solid #ccc; }
            #weekly-course-dock[hidden] { display:none; }
            #weekly-course-dock button { padding:.5rem; cursor:pointer; -webkit-app-region:no-drag; }
            #weekly-course-dock iframe { width:100%; flex:1; border:0; min-height:0; }
          `;
          const hide = document.createElement('button');
          hide.textContent = t('hideWizard');
          hide.onclick = () => {
            dock.hidden = true;
            document.body.classList.remove('weekly-split');
          };
          const frame = document.createElement('iframe');
          frame.title = t('openWizard');
          frame.src = PAGE_PATH;
          dock.append(style, hide, frame);
          document.body.append(dock);
        }
        document.body.classList.add('weekly-split');
        dock.hidden = false;
      };

      const session = status.kind === 'ready' ? status.body?.session : null;
      const loggedIn = Boolean(status.kind === 'ready' && status.body?.loggedIn);
      const who = session?.fullName || session?.username || session?.email;

      const steps = [
        ['1', t('step1'), t('step1Body')],
        ['2', t('step2'), t('step2Body')],
        ['3', t('step3'), t('step3Body')],
        ['4', t('step4'), t('step4Body')],
      ];

      return h(
        'div',
        { className: 'tkW_panel' },
        h('style', { key: 'css' }, CSS),
        h('header', { key: 'head', className: 'tkW_head' }, [
          h('h1', { key: 'title', className: 'tkW_title' }, t('title')),
          h('p', { key: 'sub', className: 'tkW_sub' }, t('subtitle')),
        ]),
        h('div', { key: 'bar', className: 'tkW_bar' }, [
          loggedIn
            ? h('span', { key: 'who', className: 'tkW_pill tkW_pillOk' }, `${who ?? ''} · ${roleLabel(session?.role)}`)
            : h('span', { key: 'who', className: 'tkW_pill tkW_pillMuted' }, status.kind === 'loading' ? t('loading') : t('statusIdle')),
          status.kind === 'ready' && status.body && status.body.loggedIn && !status.body.isTeacher
            ? h('span', { key: 'role', className: 'tkW_pill tkW_pillWarn' }, t('notTeacher'))
            : null,
          h('span', { key: 'spacer', className: 'tkW_spacer' }),
          h('button', { key: 'reload', type: 'button', className: 'tkW_btn', onClick: load }, t('reload')),
          h('button', { key: 'open', type: 'button', className: 'tkW_btn tkW_btnPrimary', onClick: openWizard }, t('openWizard')),
        ]),
        error ? h('p', { key: 'err', className: 'tkW_err' }, error) : null,
        h('p', { key: 'hint', className: 'tkW_hint' }, t('openWizardHint')),
        h(
          'div',
          { key: 'steps', className: 'tkW_steps' },
          steps.map(([num, title, text]) =>
            h('div', { key: num, className: 'tkW_step' }, [
              h('span', { key: 'n', className: 'tkW_stepNum' }, num),
              h('div', { key: 'b', className: 'tkW_stepBody' }, [
                h('p', { key: 't', className: 'tkW_stepTitle' }, title),
                h('p', { key: 'x', className: 'tkW_stepText' }, text),
              ]),
            ]),
          ),
        ),
        h('p', { key: 'footer', className: 'tkW_hint' }, t('footer')),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'tiku-weekly: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            { name: 'main', key: PANEL_ID, locale: NS },
            WeeklyPage,
          ),
        );
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 8, label: () => t('panel'), locale: NS },
            WeeklyIcon,
          ),
        );
      },
    };
  },
});

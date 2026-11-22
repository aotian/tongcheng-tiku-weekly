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
      subtitle: '原卷录入校对、建课、课件、绑题与单生定向作业，对话与界面共用同一份草稿。',
      statusIdle: '未登录',
      openWizard: '打开完整向导',
      openPaper: '打开当前校卷草稿',
      hideWizard: '收起向导（保留草稿）',
      expandDock: '宽屏模式',
      compactDock: '分屏模式',
      openWizardHint: '向导在右侧打开，自动适配窗口与缩放比例。点左侧会话可回到对话。',
      step0: '⓪ 原卷录入与单生定向',
      step0Body: '上传文本/扫描 PDF 或多张试卷图，并排校卷、查重入库建卷，并只发给指定 1 名学生。',
      step1: '① 建课与排课次',
      step1Body: '新建课程、追加课次、复制教学计划、跨班复制任务链，都在完整向导里完成。',
      step2: '② 课件双版上传',
      step2Body: '学生版走 OSS 直传，教师私有版走私有接口；需要拖拽文件，所以放在完整向导。',
      step3: '③ 绑题 · 作业 · 考试',
      step3Body: '随堂绑题、作业 v2、考试与课次任务链，含冲突拦截，都在完整向导里配置。',
      step4: '④ 预演与发布',
      step4Body: '先看预演清单再确认发布，支持中断续做与单步重试，不会重复创建。',
      footer: '对话里可直接说「把这份 PDF 录成《分数运算专项练习》，只发给某班张同学，先给我校对」。',
      reload: '刷新状态',
      loading: '读取中…',
      notTeacher: '当前账号不是教师，只能查看',
    };

    const en = {
      panel: 'Weekly courses',
      title: 'Tongcheng weekly course publishing',
      subtitle: 'Paper intake & proofreading, courseware, questions, and targeted homework sharing one draft.',
      statusIdle: 'Not signed in',
      openWizard: 'Open the full wizard',
      openPaper: 'Open active paper draft',
      hideWizard: 'Hide wizard and keep draft',
      expandDock: 'Wide view',
      compactDock: 'Split view',
      openWizardHint: 'Opens docked on the right and adapts to narrow windows and DPI scaling.',
      step0: '⓪ Paper intake & 1-student delivery',
      step0Body: 'Upload PDF or images, proofread side-by-side, archive official exam, and send targeted homework to 1 student.',
      step1: '① Courses and lessons',
      step1Body: 'Create courses, append lessons, copy a plan, or copy a task chain across classes in the full wizard.',
      step2: '② Two courseware versions',
      step2Body: 'Student version uploads to OSS, the private teacher version uses the private API.',
      step3: '③ Questions, homework, exams',
      step3Body: 'Lesson-sidebar questions, homework v2, exams, and the five-stage task chain.',
      step4: '④ Preview and publish',
      step4Body: 'Preview first, then publish with resumable retry and double-click protection.',
      footer: 'You can also ask directly in chat to parse a paper and review questions.',
      reload: 'Refresh state',
      loading: 'Loading…',
      notTeacher: 'This account is not a teacher, so it can only view.',
    };

    const CSS = [
      '.tkW_panel{box-sizing:border-box;container-type:inline-size;display:flex;flex-direction:column;gap:14px;height:100%;width:100%;min-width:0;min-height:0;overflow:auto;padding:clamp(12px,3vw,24px);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.tkW_head{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.tkW_title{margin:0;font-size:16px;font-weight:600;line-height:24px;word-break:break-word}',
      '.tkW_sub{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);word-break:break-word}',
      '.tkW_bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.tkW_barBtns{display:flex;flex-wrap:wrap;gap:8px;margin-left:auto;max-width:100%}',
      '.tkW_pill{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 8px;border-radius:999px;font-size:12px;line-height:18px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:normal;word-break:break-word}',
      '.tkW_pillOk{color:var(--dsw-static-green-500);border-color:transparent;background:var(--dsw-static-green-500-a12)}',
      '.tkW_pillMuted{color:var(--dsw-alias-label-tertiary)}',
      '.tkW_pillWarn{color:var(--dsw-static-amber-600);border-color:transparent;background:var(--dsw-static-amber-100)}',
      '.tkW_btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.35;padding:6px 12px;cursor:pointer;white-space:normal;word-break:break-word;max-width:100%}',
      '.tkW_btn:hover{background:var(--dsw-alias-button-floating-hover)}',
      '.tkW_btnPrimary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent;font-weight:600}',
      '.tkW_btnPrimary:hover{background:var(--dsw-alias-button-primary-hover)}',
      '.tkW_steps{display:flex;flex-direction:column;gap:8px;min-width:0}',
      '.tkW_step{display:flex;gap:10px;min-width:0;padding:11px 12px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.tkW_stepNum{flex:none;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.tkW_stepBody{min-width:0;flex:1}',
      '.tkW_stepTitle{margin:0;font-size:13.5px;font-weight:600;line-height:20px;word-break:break-word}',
      '.tkW_stepText{margin:2px 0 0;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary);word-break:break-word}',
      '.tkW_hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);word-break:break-word}',
      '.tkW_err{font-size:12.5px;line-height:19px;color:var(--dsw-static-red-400);padding:8px 10px;border-radius:8px;background:var(--dsw-static-red-400-a12);word-break:break-word}',
      '@container (max-width: 440px){.tkW_barBtns{margin-left:0;width:100%}.tkW_btn{flex:1 1 auto;text-align:center}}',
    ].join('');

    function roleLabel(role) {
      const labels = { teacher: '教师', admin: '管理员' };
      return labels[role] ?? (role ?? '');
    }

    /** Measure host titlebar & sidebar defensively so Windows DPI never overlaps chat or topbar. */
    function computeDockMetrics() {
      const vw = Math.max(window.innerWidth || 0, 320);
      let topInset = 44;
      const headers = document.querySelectorAll('header, [class*="titlebar"], [class*="TitleBar"], [class*="topbar"]');
      for (const el of headers) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 4 && rect.height >= 28 && rect.height <= 64 && rect.width > vw * 0.4) {
          topInset = Math.max(topInset, Math.ceil(rect.bottom));
        }
      }
      let leftSidebar = 0;
      const sidebars = document.querySelectorAll('aside, nav, [class*="sidebar"], [class*="Sidebar"]');
      for (const el of sidebars) {
        if (el.id === 'weekly-course-dock') continue;
        const rect = el.getBoundingClientRect();
        if (rect.left <= 4 && rect.width >= 160 && rect.width <= 360 && rect.height > 200) {
          leftSidebar = Math.max(leftSidebar, Math.ceil(rect.right));
        }
      }
      return { topInset, leftSidebar, vw };
    }

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

    function WeeklyPage({ t }) {
      const [status, setStatus] = React.useState({ kind: 'loading' });
      const [paperDraft, setPaperDraft] = React.useState(null);
      const [error, setError] = React.useState(null);

      const load = React.useCallback(() => {
        setStatus({ kind: 'loading' });
        setError(null);
        Promise.all([
          fetch('/tiku-weekly/api/status', { headers: { Accept: 'application/json' } }).then((r) => r.json().then((b) => ({ ok: r.ok, body: b }))),
          fetch('/tiku-weekly/api/paper/draft', { headers: { Accept: 'application/json' } }).then((r) => r.ok ? r.json() : null).catch(() => null),
        ])
          .then(([st, paper]) => {
            if (!st.ok) throw new Error(st.body?.message ?? st.body?.error ?? 'status failed');
            setStatus({ kind: 'ready', body: st.body });
            setPaperDraft(paper?.draft ?? null);
          })
          .catch((cause) => {
            setStatus({ kind: 'error' });
            setError(String(cause?.message ?? cause));
          });
      }, []);

      React.useEffect(load, [load]);

      const openWizard = (pane = '') => {
        let dock = document.getElementById('weekly-course-dock');
        const setHostReserve = (px) => {
          document.documentElement.style.setProperty('--tkw-dock-reserve', px > 0 ? `${px}px` : '0px');
          document.body.classList.toggle('weekly-split', px > 0);
        };
        const applyLayout = () => {
          if (!dock || dock.hidden) {
            setHostReserve(0);
            return;
          }
          const { topInset, leftSidebar, vw } = computeDockMetrics();
          const expanded = dock.dataset.expanded === '1';
          const centerWidth = Math.max(320, vw - leftSidebar);
          // Reserve space for the chat composer when split mode fits (>= 360px left for chat);
          // otherwise cleanly cover only the center pane so the send button is never half-clipped.
          const minChatWidth = 360;
          const canSplitSideBySide = !expanded && (centerWidth - 420 >= minChatWidth);
          let targetWidth;
          if (expanded) {
            targetWidth = Math.min(centerWidth, 980);
          } else if (canSplitSideBySide) {
            targetWidth = Math.min(Math.max(420, Math.round(centerWidth * 0.48)), centerWidth - minChatWidth);
          } else {
            targetWidth = centerWidth;
          }
          dock.style.top = `${topInset}px`;
          dock.style.right = '0px';
          dock.style.width = `${Math.max(320, targetWidth)}px`;
          setHostReserve(canSplitSideBySide ? targetWidth : 0);
        };
        if (!dock) {
          dock = document.createElement('aside');
          dock.id = 'weekly-course-dock';
          dock.setAttribute('aria-label', t('panel'));
          const style = document.createElement('style');
          style.textContent = `
            :root { --weekly-width: 44vw; --tkw-dock-reserve: 0px; }
            body.weekly-split #root, body.weekly-split #app { box-sizing:border-box; padding-right:var(--tkw-dock-reserve, 0px) !important; transition:padding-right .15s ease; }
            #weekly-course-dock { position:fixed; inset:0 var(--weekly-right-rail, 64px) 0 auto; width:var(--weekly-width); z-index:40; background:var(--dsw-alias-bg-base, #fff); display:flex; flex-direction:column; border-left:1px solid var(--dsw-alias-border-l2, #d0d7de); border-top:1px solid var(--dsw-alias-border-l2, #d0d7de); box-shadow:-4px 0 18px rgba(0,0,0,.08); max-width:100vw; }
            #weekly-course-dock[hidden] { display:none; }
            #weekly-course-dock .tkW_dockBar { display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:6px 10px; border-bottom:1px solid var(--dsw-alias-border-l2, #e3e6ea); background:var(--dsw-alias-bg-layer-1, #f6f7f9); -webkit-app-region:no-drag; }
            #weekly-course-dock .tkW_dockBar button { padding:4px 10px; font-size:12px; border:1px solid var(--dsw-alias-border-l2, #d0d7de); border-radius:6px; background:var(--dsw-alias-bg-base, #fff); color:var(--dsw-alias-label-primary, #1b1f26); cursor:pointer; }
            #weekly-course-dock iframe { width:100%; flex:1; border:0; min-height:0; }
          `;
          const bar = document.createElement('div');
          bar.className = 'tkW_dockBar';
          const hide = document.createElement('button');
          hide.type = 'button';
          hide.textContent = t('hideWizard');
          hide.onclick = () => {
            dock.hidden = true;
            setHostReserve(0);
          };
          const toggleWide = document.createElement('button');
          toggleWide.type = 'button';
          toggleWide.textContent = t('expandDock');
          toggleWide.onclick = () => {
            const next = dock.dataset.expanded === '1' ? '0' : '1';
            dock.dataset.expanded = next;
            toggleWide.textContent = next === '1' ? t('compactDock') : t('expandDock');
            applyLayout();
          };
          bar.append(hide, toggleWide);
          const frame = document.createElement('iframe');
          frame.title = t('openWizard');
          frame.src = pane ? `${PAGE_PATH}?pane=${encodeURIComponent(pane)}` : PAGE_PATH;
          dock.append(style, bar, frame);
          document.body.append(dock);
          window.addEventListener('resize', applyLayout);
        } else if (pane) {
          const frame = dock.querySelector('iframe');
          if (frame) frame.src = `${PAGE_PATH}?pane=${encodeURIComponent(pane)}&t=${Date.now()}`;
        }
        dock.hidden = false;
        applyLayout();
      };

      const session = status.kind === 'ready' ? status.body?.session : null;
      const loggedIn = Boolean(status.kind === 'ready' && status.body?.loggedIn);
      const who = session?.fullName || session?.username || session?.email;

      const steps = [
        ['0', t('step0'), t('step0Body')],
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
          h('div', { key: 'btns', className: 'tkW_barBtns' }, [
            h('button', { key: 'reload', type: 'button', className: 'tkW_btn', onClick: load }, t('reload')),
            paperDraft
              ? h('button', { key: 'paper', type: 'button', className: 'tkW_btn', onClick: () => openWizard('p0') }, `${t('openPaper')}（${paperDraft.title || ''}）`)
              : null,
            h('button', { key: 'open', type: 'button', className: 'tkW_btn tkW_btnPrimary', onClick: () => openWizard(paperDraft ? 'p0' : '') }, t('openWizard')),
          ]),
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

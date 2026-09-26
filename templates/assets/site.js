/* 公共脚本：参数读取、备案号渲染、模板页品牌注入、首页链接生成器。
   页面通过 <body data-page="index|solution|template"> 声明自身角色。 */

const SITE = 'https://siyangwin.github.io/website/templates/';
const DEFAULT_ICP = '粤ICP备00000000号';
/* 存储键。仓库根的 index.html（跳转页）里有一份同样的字面量——那个页面是自包含的，
   不能引用本文件，所以键名在两处各出现一次。改一处必须改两处。 */
const ICP_KEY = 'website.icp';
const LINK_PATTERN = /^(https?:\/\/)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/\S*)?$/i;

const params = new URLSearchParams(window.location.search);

const collapseSpace = (value) => (value || '').replace(/\s+/g, ' ').trim();
const stripSpace = (value) => (value || '').replace(/\s+/g, '');

/* 模板页专用：只认 URL 参数。
   绝不能在模板页读写本地存储——所有模板页都托管在同一个 siyangwin.github.io 源下，
   一条存储记录会被下一个客户域名的访客读到，页面就会显示别人的备案号。 */
const readUrlIcp = () => stripSpace(params.get('icp')) || DEFAULT_ICP;

/* 首页 / 说明页专用：入口的 ?icp= 优先并记下来，其次读记下的，最后是占位号。
   这样内部页之间跳转不必把备案号写进 URL。 */
const readOwnIcp = () => {
  const fromUrl = stripSpace(params.get('icp'));
  if (fromUrl) {
    try {
      window.localStorage.setItem(ICP_KEY, fromUrl);
    } catch (error) {
      /* 隐私模式、禁用 Cookie 等场景下存储不可用，忽略即可 */
    }
    return fromUrl;
  }
  try {
    return stripSpace(window.localStorage.getItem(ICP_KEY)) || DEFAULT_ICP;
  } catch (error) {
    return DEFAULT_ICP;
  }
};

/* 站点链接：只接受裸域名或 http(s) 链接，返回去掉协议的部分，非法则返回空串 */
const readLink = () => {
  const raw = (params.get('l') || '').trim();
  return LINK_PATTERN.test(raw) ? raw.replace(/^https?:\/\//i, '') : '';
};

const paintIcp = (value) => {
  document.querySelectorAll('[data-icp]').forEach((node) => { node.textContent = value; });
};

/* ---------- 访问者模板页：品牌信息全部来自参数，缺省时保持中性 ---------- */
const applyTemplateBrand = () => {
  const name = collapseSpace(params.get('n')).slice(0, 40);
  const tagline = collapseSpace(params.get('s')).slice(0, 140);
  const link = readLink();

  document.querySelectorAll('[data-brand-title]').forEach((node) => {
    node.textContent = name || '欢迎访问';
  });

  document.querySelectorAll('[data-brand-mark]').forEach((node) => {
    node.textContent = name ? Array.from(name)[0] : '';
  });

  const brandText = document.querySelector('[data-brand-text]');
  if (brandText && name) {
    brandText.textContent = name;
    brandText.hidden = false;
  }

  if (name) document.title = name;

  const taglineNode = document.querySelector('[data-tagline]');
  if (taglineNode && tagline) {
    taglineNode.textContent = tagline;
    taglineNode.hidden = false;
  }

  const panel = document.querySelector('[data-link-panel]');
  const anchor = document.querySelector('[data-link]');
  if (panel && anchor && link) {
    anchor.href = `https://${link}`;
    anchor.textContent = link.split('/')[0];
    panel.hidden = false;
  }

  /* 只有可见面板多于一个时才启用滚动吸附，避免单屏页面被吸附功能卡住 */
  const visible = Array.from(document.querySelectorAll('.panel')).filter((node) => !node.hidden);
  document.documentElement.classList.toggle('is-multi', visible.length > 1);
};

/* ---------- 剪贴板：明确区分成功与失败，失败时不谎报 ---------- */
const writeClipboard = (text, done) => {
  const fallback = () => {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'fixed';
    temp.style.top = '-1000px';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(temp);
    done(ok);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => done(true), fallback);
    return;
  }
  fallback();
};

const flashResult = (button, status, ok) => {
  const previous = button.textContent;
  button.textContent = ok ? '已复制' : '复制失败';
  if (status) status.textContent = ok ? '' : '复制失败，请手动选择文本复制';
  window.setTimeout(() => { button.textContent = previous; }, 1600);
};

/* ---------- 首页：链接生成器 ---------- */
const initGenerator = () => {
  const box = document.querySelector('[data-generator]');
  if (!box) return;

  const inputs = {
    icp: box.querySelector('[name="icp"]'),
    name: box.querySelector('[name="n"]'),
    tagline: box.querySelector('[name="s"]'),
    link: box.querySelector('[name="l"]')
  };
  const icpHint = box.querySelector('[data-icp-hint]');
  const linkHint = box.querySelector('[data-link-hint]');
  const status = box.querySelector('.copy-status');
  const urlNodes = Array.from(document.querySelectorAll('code[data-file]'));
  const previewNodes = Array.from(document.querySelectorAll('a[data-preview]'));

  /* 输入框只作为拼链接的输入源，初始留空；脚本永不回写它，也不让它影响本页页脚 */

  const buildQuery = () => {
    const icp = stripSpace(inputs.icp.value) || DEFAULT_ICP;
    /* 所有参数一律百分号编码，避免中文备案号在转发链路上被截断或乱码 */
    const parts = [`icp=${encodeURIComponent(icp)}`];
    const name = collapseSpace(inputs.name.value);
    const tagline = collapseSpace(inputs.tagline.value);
    const link = collapseSpace(inputs.link.value).replace(/^https?:\/\//i, '');
    if (name) parts.push(`n=${encodeURIComponent(name)}`);
    if (tagline) parts.push(`s=${encodeURIComponent(tagline)}`);
    /* 站点链接必须通过白名单校验才写进链接，与页面上「不合法时不会被写进链接」的提示保持一致 */
    if (link && LINK_PATTERN.test(link)) parts.push(`l=${encodeURIComponent(link)}`);
    return `?${parts.join('&')}`;
  };

  const render = () => {
    const query = buildQuery();
    const icpEmpty = !stripSpace(inputs.icp.value);
    const rawLink = collapseSpace(inputs.link.value).replace(/^https?:\/\//i, '');
    const linkInvalid = Boolean(rawLink) && !LINK_PATTERN.test(rawLink);

    icpHint.hidden = !icpEmpty;
    /* 只改提示，绝不回写输入框——回写会导致清空后被默认值填回、中文输入法组字被吞掉 */
    inputs.icp.setAttribute('aria-invalid', 'false');
    inputs.link.setAttribute('aria-invalid', String(linkInvalid));
    linkHint.hidden = !linkInvalid;

    urlNodes.forEach((node) => { node.textContent = `${SITE}${node.dataset.file}${query}`; });
    previewNodes.forEach((node) => { node.href = `${SITE}${node.dataset.preview}${query}`; });
    document.querySelectorAll('[data-example]').forEach((node) => {
      node.textContent = `${SITE}${node.dataset.example}${query}`;
    });
    /* 这里刻意不碰 [data-icp]：本页页脚的备案号是本站自己的，只有本页身份能决定它，
       生成器里的值只用于拼出给使用者的模板链接。 */
  };

  let composing = false;
  Object.values(inputs).forEach((input) => {
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; render(); });
    input.addEventListener('input', () => { if (!composing) render(); });
  });

  document.querySelectorAll('.copy-btn[data-copy]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.copy;
      const text = key === 'all'
        ? urlNodes.map((node) => node.textContent.trim()).join('\n')
        : (urlNodes.find((node) => node.dataset.file === key) || {}).textContent;
      if (!text) return;
      writeClipboard(text.trim(), (ok) => flashResult(button, status, ok));
    });
  });

  render();
};

const init = () => {
  const page = document.body.dataset.page;
  /* 首页与说明页是给站点主人自己用的内部页，可以读本地存储；
     模板页是访客打开的东西，只认 URL 参数，永远不读存储。 */
  paintIcp(page === 'index' || page === 'solution' ? readOwnIcp() : readUrlIcp());
  if (page === 'template') applyTemplateBrand();
  initGenerator();
};

init();

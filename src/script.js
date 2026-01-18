let currentlyExpandedPost = null;
const originalTitle = document.title; // 保存原始页面标题
const originalPath = window.location.pathname; // 保存原始路径

// Store the original meta description
let metaDescriptionTag = document.querySelector('meta[name="description"]');
const originalMetaDescription = metaDescriptionTag ? metaDescriptionTag.content : '';

// 为 Marked.js 添加脚注扩展 ---
const footnoteExtension = {
  name: 'footnote',
  level: 'block',
  start(src) {
    const match = src.match(/^\[\^[^\]]+\]:/);
    return match ? match.index : undefined;
  },
  tokenizer(src) {
    const rule = /^\[\^([^\]]+)\]:\s*(.*)$/;
    const match = rule.exec(src);
    if (match) {
      // 在 this.lexer.options (即单次解析的上下文) 中存储脚注
      if (!this.lexer.options.footnotes) {
        this.lexer.options.footnotes = {};
      }
      this.lexer.options.footnotes[match[1]] = match[2].trim();
      return {
        type: 'footnote',
        raw: match[0],
        id: match[1],
        text: match[2],
      };
    }
  },
  renderer() {
    // 脚注定义本身不渲染
    return '';
  }
};

const footnoteRefExtension = {
  name: 'footnoteRef',
  level: 'inline',
  start(src) {
    const match = src.match(/\[\^[^\]]+\]/);
    return match ? match.index : undefined;
  },
  tokenizer(src) {
    const rule = /^\[\^([^\]]+)\]/;
    const match = rule.exec(src);
    if (match) {
      return {
        type: 'footnoteRef',
        raw: match[0],
        id: match[1],
      };
    }
  },
  renderer(token) {
    // 渲染脚注引用标记
    return `<sup class="footnote-ref"><span class="footnote-element">${token.id}</span></sup>`;
  },
};

marked.use({
  extensions: [footnoteExtension, footnoteRefExtension]
});

// 全局开启 GFM 单换行 -> <br>
marked.setOptions({
  gfm: true,
  breaks: true
});

// 创建一个包装函数，正确处理脚注列表的渲染
function parseMarkdownWithFootnotes(markdown) {
  // 手动查找脚注定义
  const footnoteDefinitions = {};
  const footnoteRegex = /^\[\^([^\]]+)\]:\s*(.*)$/gm;
  let match;

  while ((match = footnoteRegex.exec(markdown)) !== null) {
    footnoteDefinitions[match[1]] = match[2].trim();
  }

  const parseOptions = { gfm: true, breaks: true };
  const html = marked.parse(markdown, parseOptions);

  // 优先使用手动查找的脚注定义
  const footnotes = footnoteDefinitions;

  if (footnotes && Object.keys(footnotes).length > 0) {
    let footnotesHtml = '\n\n<div class="footnotes">\n<hr>\n<ol class="footnotes-list">\n';
    for (const id in footnotes) {
      footnotesHtml += `<li id="footnote-${id}" class="footnote-item">`;
      // 解析脚注内容中的内联Markdown（如链接、粗体等）
      footnotesHtml += marked.parseInline(footnotes[id], parseOptions);
      footnotesHtml += ` <span class="footnote-backref footnote-element">↩</span>`;
      footnotesHtml += `</li>\n`;
    }
    footnotesHtml += '</ol>\n</div>';
    // 将生成的脚注列表附加到HTML内容的末尾
    return html + footnotesHtml;
  }

  // 如果没有脚注，直接返回原HTML
  return html;
}

// Create a summary from Markdown text for the meta description
function createSummaryFromMarkdown(markdown, maxLength = 155) {
  if (!markdown) return '';
  // 1. Remove Markdown syntax (headers, images, links, formatting)
  // 2. Collapse whitespace
  // 3. Trim and truncate
  let text = markdown
    .replace(/^#+\s*.*/gm, '')      // Remove headers
    .replace(/!\[.*?\]\(.*?\)/g, '')  // Remove images
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Keep link text, remove link markdown
    .replace(/[`*~_>#|-]/g, '')      // Remove various markdown characters
    .replace(/\s+/g, ' ')            // Collapse whitespace
    .trim();

  if (text.length > maxLength) {
    // Truncate and add ellipsis
    text = text.substring(0, maxLength - 3) + '...';
  }
  return text;
}

// Helper function to update the meta description tag
function updateMetaDescription(content) {
  if (!metaDescriptionTag) {
    // If it wasn't found initially, try again
    metaDescriptionTag = document.querySelector('meta[name="description"]');
  }
  if (!metaDescriptionTag) {
    // If it still doesn't exist, create it
    metaDescriptionTag = document.createElement('meta');
    metaDescriptionTag.name = 'description';
    document.head.appendChild(metaDescriptionTag);
  }
  metaDescriptionTag.content = content;
}

// 将文件名 slug 转换为可读的标题
function slugToTitle(slug) {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// 获取博客文件列表
async function getBlogFilesList() {
  try {
    const response = await fetch('/blogs/');
    if (response.ok) {
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('a[href$=".md"]');

      const files = Array.from(links)
        .map(link => {
          const raw = link.getAttribute('href') || '';
          const clean = raw.split('?')[0];
          const basename = decodeURIComponent(clean.split('/').pop());
          return basename;
        })
        .filter(name => name && /\.md$/i.test(name))
        .sort()
        .reverse();

      if (files.length > 0) {
        return files;
      }
    }
  } catch (error) {
    console.error('Error fetching directory listing:', error);
    return [];
  }
  return [];
}

// 加载博客文章
async function loadBlogPosts() {
  try {
    const blogPostsContainer = document.querySelector('.blog-posts .container');
    if (!blogPostsContainer) return;

    blogPostsContainer.innerHTML = '';
    const markdownFiles = await getBlogFilesList();

    if (markdownFiles.length === 0) {
      blogPostsContainer.innerHTML = `
                <div style="padding: 2rem;">
                    <h3>暂无博客文章</h3>
                    <p>在 ./blogs/ 目录下添加 .md 文件来创建博客文章。</p>
                    <p>文件名格式推荐: <code>YYYYMMDD-your-title.md</code></p>
                </div>
            `;
      return;
    }

    for (const file of markdownFiles) {
      const match = file.match(/^(\d{8})-(.*)\.md$/);
      if (!match) {
        console.warn(`Skipping file with invalid format: ${file}.`);
        continue;
      }

      const [, dateStr, titleSlug] = match;
      const title = slugToTitle(titleSlug);
      let displayDate = 'Invalid Date';
      try {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        displayDate = `${year}/${month}/${day}`;
      } catch (e) {
        console.warn(`Could not parse date from filename: ${file}`);
      }

      const postElement = document.createElement('article');
      postElement.className = 'post';
      postElement.dataset.file = file;
      postElement.dataset.date = dateStr;
      postElement.dataset.title = title;
      postElement.innerHTML = `
                <div class="post-content-wrapper">
                    <h3>${title}</h3>
                    <p class="post-meta">${displayDate}</p>
                    <div class="post-full-content">
                        <div class="rendered-content"></div>
                    </div>
                </div>
            `;
      blogPostsContainer.appendChild(postElement);
    }
    attachPostEventListeners();
    handleDirectLink();
  } catch (error)
  {
    console.error('Error loading blog posts:', error);
  }
}

function animateExpand(fullContentDiv) {
  // 先清空 maxHeight 为 none 以便测量真实高度
  fullContentDiv.style.maxHeight = 'none';
  const target = fullContentDiv.scrollHeight;

  // 回到 0，为了触发动画
  fullContentDiv.style.maxHeight = '0px';
  // 强制一次回流
  fullContentDiv.offsetHeight;

  // 添加 expanded，使其 opacity 进入 1
  fullContentDiv.classList.add('expanded');

  // 动画到真实高度
  fullContentDiv.style.maxHeight = target + 'px';

  // 动画结束后，设置为 none，后续内容增减无需再动画受限
  const onEnd = (e) => {
    if (e.propertyName === 'max-height') {
      fullContentDiv.style.maxHeight = 'none';
      fullContentDiv.removeEventListener('transitionend', onEnd);
    }
  };
  fullContentDiv.addEventListener('transitionend', onEnd);
}

function animateCollapse(fullContentDiv) {
  // 如果当前是 none，先设为当前实际高度
  if (getComputedStyle(fullContentDiv).maxHeight === 'none') {
    fullContentDiv.style.maxHeight = fullContentDiv.scrollHeight + 'px';
    // 强制回流
    fullContentDiv.offsetHeight;
  }
  // 再开始收起动画
  fullContentDiv.style.maxHeight = '0px';

  // 同时把 expanded 去掉，opacity 会跟随过渡
  // 稍微延迟，保证 maxHeight 动画已开始
  requestAnimationFrame(() => {
    fullContentDiv.classList.remove('expanded');
  });
}

// 展开博客文章（直接展开整个正文，无内层滚动）
async function expandPost(postElement) {
  if (currentlyExpandedPost && currentlyExpandedPost !== postElement) {
    collapsePost(currentlyExpandedPost);
  }

  const fullContentDiv = postElement.querySelector('.post-full-content');
  const renderedContentDiv = fullContentDiv.querySelector('.rendered-content');
  currentlyExpandedPost = postElement;

  // 更新URL和标题
  const postDate = postElement.dataset.date;
  const postTitle = postElement.dataset.title;
  const newPath = `/${postDate}`;
  // 只有当URL与目标不符时才更新历史记录
  if (window.location.pathname !== newPath) {
    history.pushState({ postId: postDate }, postTitle, newPath);
  }
  document.title = postTitle;

  // 如果已经渲染过，直接展开
  if (renderedContentDiv.innerHTML.trim()) {
    animateExpand(fullContentDiv);
    return;
  }

  // 先显示占位并展开，提升可感知反馈
  renderedContentDiv.innerHTML = '<p style="opacity:.8">正在加载...</p>';
  animateExpand(fullContentDiv);

  try {
    const filename = postElement.dataset.file || '';
    // 这里保证不重复拼 blogs/
    const url = filename.includes('/') ? filename : `/blogs/${encodeURIComponent(filename)}`;

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const markdown = await response.text();

    // Update meta description with a summary from the markdown
    const summary = createSummaryFromMarkdown(markdown);
    if (summary) {
        updateMetaDescription(summary);
    }

    const htmlContent = parseMarkdownWithFootnotes(markdown);
    renderedContentDiv.innerHTML = htmlContent;

    // 代码高亮
    if (typeof Prism !== 'undefined') {
      Prism.highlightAllUnder(renderedContentDiv);
    }
  } catch (error) {
    console.error('加载博客内容失败:', error);
    renderedContentDiv.innerHTML = `<p style="color: var(--warning-color);">加载失败：${error.message}</p>`;
  } finally {
    // 高度微调（不论成功失败都调一次）
    if (getComputedStyle(fullContentDiv).maxHeight !== 'none') {
      fullContentDiv.style.maxHeight = fullContentDiv.scrollHeight + 'px';
    }
  }
}

// 折叠博客文章
function collapsePost(postElement) {
  const fullContentDiv = postElement.querySelector('.post-full-content');
  if (!fullContentDiv) return;

  animateCollapse(fullContentDiv);

  if (currentlyExpandedPost === postElement) {
    currentlyExpandedPost = null;
    // 恢复URL、标题和meta description
    // 只有当URL不是主页时才更新历史记录
    if (window.location.pathname !== originalPath) {
        history.pushState(null, originalTitle, originalPath);
    }
    document.title = originalTitle;
    updateMetaDescription(originalMetaDescription);
  }
}

// 为文章元素附加事件监听器
function attachPostEventListeners() {
  const posts = document.querySelectorAll('.post');
  posts.forEach(post => {
    post.addEventListener('mousemove', (e) => {
      const rect = post.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      post.style.setProperty('--mouse-x', `${x}px`);
      post.style.setProperty('--mouse-y', `${y}px`);
    });
    post.style.setProperty('--mouse-x', '50%');
    post.style.setProperty('--mouse-y', '50%');
    post.addEventListener('click', async (e) => {
      if (e.target.closest('.post-full-content')) return;

      const fullContentDiv = post.querySelector('.post-full-content');
      if (fullContentDiv.classList.contains('expanded')) {
        collapsePost(post);
      } else {
        await expandPost(post);
      }
    });
  });
}

// 处理直接通过URL访问文章的情况
function handleDirectLink() {
  const path = window.location.pathname;
  const match = path.match(/^\/(\d{8})$/); // 匹配 /YYYYMMDD 格式
  if (match) {
    const dateStr = match[1];
    const postToExpand = document.querySelector(`.post[data-date="${dateStr}"]`);
    if (postToExpand) {
      // 使用 setTimeout 确保页面布局稳定后再展开
      setTimeout(() => {
        expandPost(postToExpand);
        postToExpand.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }
}

// 处理浏览器前进/后退
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.postId) {
        const postToExpand = document.querySelector(`.post[data-date="${event.state.postId}"]`);
        if (postToExpand && postToExpand !== currentlyExpandedPost) {
            expandPost(postToExpand);
        }
    } else {
        if (currentlyExpandedPost) {
            collapsePost(currentlyExpandedPost);
        }
    }
});

// DOM 加载完成后执行的逻辑
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.blog-posts')) {
    loadBlogPosts();
  }

  // Initialize APlayer
  const songs = [
    {
      name: 'Glass Lung',
      artist: 'Ximm',
      url: './songs/Ximm - Glass Lung.m4a',
      cover: './songs/Ximm - Glass Lung.jpg',
    },
  ];

  const randomSong = songs[Math.floor(Math.random() * songs.length)];

  const ap = new APlayer({
    container: document.getElementById('aplayer'),
    listFolded: true,
    autoplay: true,
    theme: '#282828',
    audio: [randomSong]
  });

  // Handle autoplay with retry logic
  let retryInterval;
  let autoplayAttempted = false;

  ap.on('canplay', () => {
    if (!autoplayAttempted) {
      autoplayAttempted = true;
      setTimeout(() => {
        ap.play().then(() => {
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
        }).catch(() => {
          retryInterval = setInterval(() => {
            if (ap.paused) {
              ap.play().catch(() => {});
            }
          }, 5000);
        });
      }, 3000);
    }
  });

  ap.on('play', () => {
    if (retryInterval) {
      clearInterval(retryInterval);
      retryInterval = null;
    }
  });

  // Logo 折叠逻辑
  const logo = document.querySelector('.logo');
    let isFolded = false;
    let timeoutId = null;
    function checkScrollPosition() {
      if (window.scrollY > 100 && !isFolded) {
        logo.classList.add('folded');
        isFolded = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      } else if (window.scrollY <= 100 && isFolded) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          logo.classList.remove('folded');
          isFolded = false;
          timeoutId = null;
        }, 5000);
      }
    }
    window.addEventListener('scroll', checkScrollPosition);
    checkScrollPosition();

  // 窗口大小调整逻辑
  window.addEventListener('resize', () => {
    if (!currentlyExpandedPost) return;
    const fullContentDiv = currentlyExpandedPost.querySelector('.post-full-content');
    if (!fullContentDiv) return;

    if (getComputedStyle(fullContentDiv).maxHeight !== 'none') {
      fullContentDiv.style.maxHeight = fullContentDiv.scrollHeight + 'px';
    }
  });

});

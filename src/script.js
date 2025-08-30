let currentlyExpandedPost = null;

// 处理在展开的文章外部的点击事件，用于折叠文章
function handleOutsideClick(event) {
    if (currentlyExpandedPost && !currentlyExpandedPost.contains(event.target)) {
        collapsePost(currentlyExpandedPost);
    }
}

// 将文件名 slug 转换为可读的标题
function slugToTitle(slug) {
    return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// 增强的 Markdown 到 HTML 转换器
function markdownToHTML(markdown) {
    let html = markdown;
    
    // 首先转义 HTML 实体
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // 支持语言的代码块 (必须在其他处理之前)
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
        const langClass = language ? ` class="language-${language}"` : '';
        return `<pre><code${langClass}>${code.trim()}</code></pre>`;
    });
    
    // 内联代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // 标题
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
    html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
    
    // 粗体和斜体
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // 删除线
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    
    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // 水平线
    html = html.replace(/^---\s*$/gm, '<hr>');
    
    // 处理列表
    html = processLists(html);
    
    // 段落 (按双换行符分割并包装非HTML内容)
    html = html.split('\n\n').map(paragraph => {
        paragraph = paragraph.trim();
        if (paragraph && !paragraph.match(/^<(h[1-6]|hr|pre|ul|ol|blockquote)/)) {
            // 处理段落内的单换行符
            paragraph = paragraph.replace(/\n/g, '<br>');
            return `<p>${paragraph}</p>`;
        }
        return paragraph;
    }).join('\n\n');
    
    return html;
}

// 辅助函数，用于处理列表
function processLists(html) {
    const lines = html.split('\n');
    const result = [];
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i];
        
        // 检查有序列表
        if (line.match(/^\d+\.\s/)) {
            const listItems = [];
            while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
                listItems.push(lines[i].replace(/^\d+\.\s/, ''));
                i++;
            }
            result.push('<ol>');
            listItems.forEach(item => result.push(`<li>${item}</li>`));
            result.push('</ol>');
            continue;
        }
        
        // 检查无序列表
        if (line.match(/^-\s/)) {
            const listItems = [];
            while (i < lines.length && lines[i].match(/^-\s/)) {
                listItems.push(lines[i].replace(/^-\s/, ''));
                i++;
            }
            result.push('<ul>');
            listItems.forEach(item => result.push(`<li>${item}</li>`));
            result.push('</ul>');
            continue;
        }
        
        result.push(line);
        i++;
    }
    
    return result.join('\n');
}

// 获取博客文件列表
async function getBlogFilesList() {
    try {
        const response = await fetch('./blogs/');
        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = doc.querySelectorAll('a[href$=".md"]');
            
            const files = Array.from(links)
                .map(link => link.getAttribute('href'))
                .filter(href => href && href.endsWith('.md'))
                .map(href => href.replace('./', ''))
                .sort()
                .reverse(); // 按降序排序 (最新的在前面)
            
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
        if (!blogPostsContainer) {
            console.error('Blog posts container not found');
            return;
        }

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
                console.warn(`Skipping file with invalid format: ${file}. Expected format: YYYYMMDD-title.md`);
                continue;
            }

            const dateStr = match[1];
            const titleSlug = match[2];
            
            const title = slugToTitle(titleSlug);

            let displayDate = 'Invalid Date';
            try {
                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                const date = new Date(year, month - 1, day);
                displayDate = date.toLocaleDateString('zh-CN');
            } catch (e) {
                console.warn(`Could not parse date from filename: ${file}`);
            }

            const postElement = document.createElement('article');
            postElement.className = 'post';
            postElement.dataset.file = file;
            
            postElement.innerHTML = `
                <div class="post-content-wrapper">
                    <h3>${title}</h3>
                    <p class="post-meta">发布于 ${displayDate}</p>
                    <div class="post-full-content">
                        <div class="rendered-content"></div>
                    </div>
                </div>
            `;
            
            blogPostsContainer.appendChild(postElement);
        }
        
        attachPostEventListeners();
    } catch (error) {
        console.error('Error loading blog posts:', error);
    }
}


// 展开博客文章
async function expandPost(postElement) {
    // 如果有其他已展开的文章，先将其折叠
    if (currentlyExpandedPost && currentlyExpandedPost !== postElement) {
        collapsePost(currentlyExpandedPost);
    }
    
    try {
        const filename = postElement.dataset.file;
        const fullContentDiv = postElement.querySelector('.post-full-content');
        const renderedContentDiv = fullContentDiv.querySelector('.rendered-content');
        
        // 如果内容已加载，直接展开
        if (renderedContentDiv.innerHTML.trim()) {
            fullContentDiv.classList.add('expanded');
            currentlyExpandedPost = postElement;
            document.addEventListener('click', handleOutsideClick);
            return;
        }
        
        const response = await fetch(`./blogs/${filename}`);
        if (!response.ok) {
            throw new Error(`Failed to load ${filename}`);
        }
        
        const markdown = await response.text();
        const htmlContent = markdownToHTML(markdown);
        renderedContentDiv.innerHTML = htmlContent;
        
        requestAnimationFrame(() => {
            fullContentDiv.classList.add('expanded');
            currentlyExpandedPost = postElement;
            document.addEventListener('click', handleOutsideClick);
        });
        
        setTimeout(() => {
            if (typeof Prism !== 'undefined') {
                const codeBlocks = renderedContentDiv.querySelectorAll('pre code[class*="language-"]');
                codeBlocks.forEach(codeBlock => {
                    Prism.highlightElement(codeBlock);
                });
            }
        }, 100);
        
    } catch (error) {
        console.error('Error expanding post:', error);
        alert('加载博客内容时出错，请稍后再试。');
    }
}

// 折叠博客文章
function collapsePost(postElement) {
    const fullContentDiv = postElement.querySelector('.post-full-content');
    
    if (fullContentDiv) {
        fullContentDiv.classList.remove('expanded');
    }

    currentlyExpandedPost = null;
    document.removeEventListener('click', handleOutsideClick);
}

// 为文章元素附加事件监听器
function attachPostEventListeners() {
    const posts = document.querySelectorAll('.post');
    posts.forEach(post => {
        // 涟漪效果
        post.addEventListener('mousemove', (e) => {
            const rect = post.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            post.style.setProperty('--mouse-x', `${x}px`);
            post.style.setProperty('--mouse-y', `${y}px`);
        });
        
        post.style.setProperty('--mouse-x', '50%');
        post.style.setProperty('--mouse-y', '50%');
        
        // 点击整个文章元素以展开
        post.addEventListener('click', async (e) => {
            const fullContentDiv = post.querySelector('.post-full-content');
            // 仅在未展开时展开
            if (!fullContentDiv.classList.contains('expanded')) {
                await expandPost(post);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadBlogPosts();
    
    const logo = document.querySelector('.logo');
    let isFolded = false;

    function checkScrollPosition() {
        if (window.scrollY > 100 && !isFolded) {
            logo.classList.add('folded');
            isFolded = true;
        } else if (window.scrollY <= 100 && isFolded) {
            logo.classList.remove('folded');
            isFolded = false;
        }
    }

    window.addEventListener('scroll', checkScrollPosition);
    checkScrollPosition();
});

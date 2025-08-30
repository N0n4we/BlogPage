let currentlyExpandedPost = null;

// ✅ New function to handle clicks outside the expanded post
function handleOutsideClick(event) {
    if (currentlyExpandedPost && !currentlyExpandedPost.contains(event.target)) {
        collapsePost(currentlyExpandedPost);
    }
}

// Helper function to convert filename slug to a readable title
function slugToTitle(slug) {
    return slug
        .split('-') // 按 '-' 分割
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // 每个单词首字母大写
        .join(' '); // 用空格连接
}

// Enhanced markdown to HTML converter
function markdownToHTML(markdown) {
    let html = markdown;
    
    // Escape HTML entities first
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Code blocks with language support (must come before other processing)
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
        const langClass = language ? ` class="language-${language}"` : '';
        return `<pre><code${langClass}>${code.trim()}</code></pre>`;
    });
    
    // Inline code (must come before other text processing)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Headers
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
    html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
    
    // Bold and italic (order matters)
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Strikethrough
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Horizontal rules
    html = html.replace(/^---\s*$/gm, '<hr>');
    
    // Process lists
    html = processLists(html);
    
    // Paragraphs (split by double newlines and wrap non-HTML content)
    html = html.split('\n\n').map(paragraph => {
        paragraph = paragraph.trim();
        if (paragraph && !paragraph.match(/^<(h[1-6]|hr|pre|ul|ol|blockquote)/)) {
            // Handle single line breaks within paragraphs
            paragraph = paragraph.replace(/\n/g, '<br>');
            return `<p>${paragraph}</p>`;
        }
        return paragraph;
    }).join('\n\n');
    
    return html;
}

// Helper function to process lists
function processLists(html) {
    const lines = html.split('\n');
    const result = [];
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i];
        
        // Check for ordered list
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
        
        // Check for unordered list
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

// Function to get blog files list
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
                .reverse(); // Sort in descending order (newest first)
            
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
            
            // 🔴 Removed the collapse link
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


// ✅ Function to expand blog post, updated to manage state
async function expandPost(postElement) {
    // Collapse any other open post first
    if (currentlyExpandedPost && currentlyExpandedPost !== postElement) {
        collapsePost(currentlyExpandedPost);
    }
    
    try {
        const filename = postElement.dataset.file;
        const fullContentDiv = postElement.querySelector('.post-full-content');
        const renderedContentDiv = fullContentDiv.querySelector('.rendered-content');
        
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
            // Set the current post and add the global listener
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

// ✅ Function to collapse blog post, now takes the post element
function collapsePost(postElement) {
    const fullContentDiv = postElement.querySelector('.post-full-content');
    
    if (fullContentDiv) {
        fullContentDiv.classList.remove('expanded');
    }

    // Clear state and remove global listener
    currentlyExpandedPost = null;
    document.removeEventListener('click', handleOutsideClick);
}

// ✅ Function to attach event listeners, updated for the new interaction model
function attachPostEventListeners() {
    const posts = document.querySelectorAll('.post');
    posts.forEach(post => {
        // Ripple effect listener remains the same
        post.addEventListener('mousemove', (e) => {
            const rect = post.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            post.style.setProperty('--mouse-x', `${x}px`);
            post.style.setProperty('--mouse-y', `${y}px`);
        });
        
        post.style.setProperty('--mouse-x', '50%');
        post.style.setProperty('--mouse-y', '50%');
        
        // Add click listener to the entire post element to expand it
        post.addEventListener('click', async (e) => {
            const fullContentDiv = post.querySelector('.post-full-content');
            // Only expand if it's not already expanded
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

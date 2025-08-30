// Simple markdown to HTML converter
function markdownToHTML(markdown) {
    let html = markdown;
    
    // Headers
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code blocks with language support
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
        const langClass = language ? ` class="language-${language}"` : '';
        return `<pre><code${langClass}>${code.trim()}</code></pre>`;
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Lists
    html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
    
    // Wrap lists in ul/ol tags
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Paragraphs
    html = html.split('\n\n').map(paragraph => {
        paragraph = paragraph.trim();
        if (paragraph && !paragraph.match(/^<[hu]/)) {
            return `<p>${paragraph}</p>`;
        }
        return paragraph;
    }).join('\n');
    
    return html;
}

// Function to extract title and excerpt from markdown
function extractPostInfo(markdown) {
    const lines = markdown.split('\n');
    let title = '';
    let excerpt = '';
    let content = '';
    
    // Extract title (first h1)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('# ')) {
            title = line.substring(2);
            // Start content from the line after title
            content = lines.slice(i + 1).join('\n');
            break;
        }
    }
    
    // If no h1 found, use first non-empty line as title
    if (!title) {
        for (let line of lines) {
            if (line.trim()) {
                title = line.trim();
                break;
            }
        }
    }
    
    // Generate excerpt from first few paragraphs
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    excerpt = paragraphs.slice(0, 2).join(' ').substring(0, 150) + '...';
    
    return { title, excerpt, content };
}

// Function to load blog post detail
async function loadBlogPostDetail() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const file = urlParams.get('file');
        
        if (!file) {
            console.error('No file parameter found');
            return;
        }
        
        const response = await fetch(`./blogs/${file}`);
        if (!response.ok) {
            throw new Error(`Failed to load ${file}`);
        }
        
        const markdown = await response.text();
        const { title, content } = extractPostInfo(markdown);
        
        // Convert markdown to HTML with code highlighting
        const htmlContent = markdownToHTML(content);
        
        // Update page title
        document.title = `${title} - Noname's Blog`;
        
        // Display content
        const contentContainer = document.querySelector('.blog-post-content');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <h1>${title}</h1>
                <div class="post-content">
                    ${htmlContent}
                </div>
            `;
            
            // Apply syntax highlighting to code blocks
            Prism.highlightAllUnder(contentContainer);
        }
        
    } catch (error) {
        console.error('Error loading blog post detail:', error);
        const contentContainer = document.querySelector('.blog-post-content');
        if (contentContainer) {
            contentContainer.innerHTML = '<p>加载博客文章时出错，请稍后再试。</p>';
        }
    }
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
                .sort();
            
            if (files.length > 0) {
                return files;
            }
        }
    } catch (error) {
        console.error('Error fetching directory listing:', error);
    }
    
    return [];
}



// Function to load blog posts
async function loadBlogPosts() {
    try {
        const blogPostsContainer = document.querySelector('.blog-posts .container');
        if (!blogPostsContainer) {
            console.error('Blog posts container not found');
            return;
        }
        
        blogPostsContainer.innerHTML = '';
        
        // Get list of markdown files
        const markdownFiles = await getBlogFilesList();
        
        if (markdownFiles.length === 0) {
            blogPostsContainer.innerHTML = `
                <div class="no-posts-message">
                    <h3>暂无博客文章</h3>
                    <p>在 ./blogs/ 目录下添加 .md 文件来创建博客文章</p>
                </div>
            `;
            return;
        }
        
        // Load each discovered file
        for (const file of markdownFiles) {
            try {
                const response = await fetch(`./blogs/${file}`);
                if (!response.ok) continue;
                
                const markdown = await response.text();
                const { title, excerpt } = extractPostInfo(markdown);
                
                // Create post element
                const postElement = document.createElement('article');
                postElement.className = 'post';
                postElement.setAttribute('data-aos', 'fade-up');
                
                const fileDate = new Date().toLocaleDateString('zh-CN');
                
                postElement.innerHTML = `
                    <h3>${title}</h3>
                    <p class="post-meta">发布于 ${fileDate}</p>
                    <p>${excerpt}</p>
                    <a href="#" class="read-more" data-file="${file}">阅读更多</a>
                `;
                
                blogPostsContainer.appendChild(postElement);
                
            } catch (error) {
                // Skip file on error
            }
        }
        
        // Re-attach event listeners for new posts
        attachPostEventListeners();
        
    } catch (error) {
        console.error('Error loading blog posts:', error);
    }
}

// Function to attach event listeners to posts
function attachPostEventListeners() {
    // Add circular ripple effect to posts
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
    });
    
    // Add click event to read more links
    const readMoreLinks = document.querySelectorAll('.read-more');
    readMoreLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const file = link.getAttribute('data-file');
            if (file) {
                // Navigate to blog detail page with file parameter
                window.location.href = `blog-detail.html?file=${encodeURIComponent(file)}`;
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the blog detail page
    if (window.location.pathname.includes('blog-detail.html')) {
        loadBlogPostDetail();
    } else {
        // Load blog posts on homepage
        loadBlogPosts();
    }
    


    // Logo折叠动画
    const logo = document.querySelector('.logo');
    let isFolded = false;

    // 检查滚动位置并触发动画
    function checkScrollPosition() {
        // 当滚动超过100px时触发动画
        if (window.scrollY > 100 && !isFolded) {
            logo.classList.add('folded');
            isFolded = true;
        } else if (window.scrollY <= 100 && isFolded) {
            logo.classList.remove('folded');
            isFolded = false;
        }
    }

    // 监听滚动事件
    window.addEventListener('scroll', checkScrollPosition);
    
    // 初始化检查
    checkScrollPosition();
});

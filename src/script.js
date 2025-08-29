// script.js

document.addEventListener('DOMContentLoaded', () => {
    // 为导航链接添加平滑滚动效果（仅在首页有效）
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // 检查是否在首页
            const isHomePage = window.location.pathname.includes('index.html') || window.location.pathname === '/';
            const href = link.getAttribute('href');
            
            // 只有在首页且链接是锚点链接时才阻止默认行为
            if (isHomePage && href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80, // 考虑固定头部的高度
                        behavior: 'smooth'
                    });
                }
            }
            // 如果不在首页或链接不是锚点链接，则允许默认的页面跳转行为
        });
    });

    // 为"探索更多"按钮添加点击事件（仅在首页有效）
    const exploreBtn = document.getElementById('exploreBtn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', () => {
            // 滚动到博客文章部分
            const blogPostsSection = document.querySelector('.blog-posts');
            if (blogPostsSection) {
                window.scrollTo({
                    top: blogPostsSection.offsetTop - 100,
                    behavior: 'smooth'
                });
            }
        });
    }

    // 为"阅读更多"链接添加点击事件
    const readMoreLinks = document.querySelectorAll('.read-more');
    readMoreLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            alert('即将跳转到文章详情页面...');
            // 实际项目中，这里会跳转到具体的文章页面
            // window.location.href = link.getAttribute('href');
        });
    });

    // 为博客文章添加圆形扩散效果
    const posts = document.querySelectorAll('.post');
    posts.forEach(post => {
        // 添加一个标志来跟踪是否已经设置了鼠标位置
        let mouseEntered = false;
        
        post.addEventListener('mouseenter', (e) => {
            // 只在第一次进入时设置鼠标位置
            if (!mouseEntered) {
                // 获取鼠标相对于文章元素的位置
                const rect = post.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // 设置圆形扩散效果的起始位置
                post.style.setProperty('--mouse-x', `${x}px`);
                post.style.setProperty('--mouse-y', `${y}px`);
                
                // 标记已设置位置
                mouseEntered = true;
            }
        });
        
        // 当鼠标离开时重置标志
        post.addEventListener('mouseleave', () => {
            mouseEntered = false;
        });
    });
    
    // 为"探索更多"按钮添加圆形扩散效果
    const ctaButton = document.getElementById('exploreBtn');
    if (ctaButton) {
        // 添加一个标志来跟踪是否已经设置了鼠标位置
        let mouseEntered = false;
        
        ctaButton.addEventListener('mouseenter', (e) => {
            // 只在第一次进入时设置鼠标位置
            if (!mouseEntered) {
                // 获取鼠标相对于按钮元素的位置
                const rect = ctaButton.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // 设置圆形扩散效果的起始位置
                ctaButton.style.setProperty('--mouse-x', `${x}px`);
                ctaButton.style.setProperty('--mouse-y', `${y}px`);
                
                // 标记已设置位置
                mouseEntered = true;
            }
        });
        
        // 当鼠标离开时重置标志
        ctaButton.addEventListener('mouseleave', () => {
            mouseEntered = false;
        });
    }
});

import { useState, useEffect, FormEvent } from 'react';
import { parseMarkdownWithFootnotes } from '../utils/markdown';

interface Comment {
  id: number;
  nickname: string;
  content: string;
  created_at: string;
}

interface CommentsProps {
  postId: string;
}

export default function Comments({ postId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [nickname, setNickname] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    fetch(`/api/comments/${postId}`)
      .then(res => res.json())
      .then(data => setComments(data))
      .catch(err => console.error('Failed to load comments:', err))
      .finally(() => setLoading(false));
  }, [postId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !content.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, nickname: nickname.trim(), content: content.trim() })
      });
      if (!res.ok) throw new Error('Failed to submit');
      const newComment = await res.json();
      setComments(prev => [newComment, ...prev]);
      setContent('');
    } catch (err) {
      console.error('Failed to submit comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="comments-section" onClick={(e) => e.stopPropagation()}>
      <form className="comment-form" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'stretch' }}>
          <input
            type="text"
            placeholder="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="comment-input comment-nickname"
            maxLength={50}
            style={{ flex: 1, height: '36px', boxSizing: 'border-box' }}
          />
          <button
            type="submit"
            className="comment-submit"
            disabled={submitting || !nickname.trim() || !content.trim()}
            style={{ height: '36px', boxSizing: 'border-box' }}
          >
            {submitting ? 'sending...' : 'send'}
          </button>
        </div>
        <textarea
          placeholder="comment"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="comment-input comment-content"
          rows={1}
        />
      </form>
      <div className="comments-list">
        {loading ? (
          <p className="comments-loading">loading...</p>
        ) : comments.length === 0 ? (
          <p className="comments-empty">no comments :(</p>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="comment-item">
              <div className="comment-header">
                <span className="comment-author">{comment.nickname}</span>
                <span className="comment-date">{formatDate(comment.created_at)}</span>
              </div>
              <div
                className="comment-body"
                dangerouslySetInnerHTML={{ __html: parseMarkdownWithFootnotes(comment.content) }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import express, { Request, Response } from 'express';
import cors from 'cors';
import { initDb, getCommentsByPostId, createComment, Comment } from './db.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

interface CreateCommentBody {
  postId: string;
  nickname: string;
  content: string;
}

// GET /api/comments/:postId - 获取文章评论
app.get('/api/comments/:postId', (req: Request<{ postId: string }>, res: Response) => {
  const { postId } = req.params;
  try {
    const comments = getCommentsByPostId(postId);
    res.json(comments);
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/comments - 发表评论
app.post('/api/comments', (req: Request<object, Comment, CreateCommentBody>, res: Response) => {
  const { postId, nickname, content } = req.body;

  if (!postId || !nickname?.trim() || !content?.trim()) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const newComment = createComment(postId, nickname.trim(), content.trim());
    res.status(201).json(newComment);
  } catch (err) {
    console.error('Error creating comment:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Initialize database and start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Comment server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
let firebaseWebApiKey = '';
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as { apiKey?: string };
    firebaseWebApiKey = cfg.apiKey || '';
  } catch {
    firebaseWebApiKey = '';
  }
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email: string;
  };
};

async function requireFirebaseAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization Bearer token.' });
    return;
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken || idToken.length > 4096) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return;
  }

  if (!firebaseWebApiKey) {
    res.status(500).json({ error: 'Firebase configuration is unavailable on the server.' });
    return;
  }

  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseWebApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );

    if (!lookupRes.ok) {
      res.status(401).json({ error: 'Invalid or expired Firebase session.' });
      return;
    }

    const data = (await lookupRes.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId || !user.emailVerified) {
      res.status(403).json({ error: 'Verified Firebase account required.' });
      return;
    }

    req.user = {
      uid: user.localId,
      email: user.email || '',
    };
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(500).json({ error: 'Failed to verify authentication session.' });
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/ai/assistant', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: 'Gemini API key is not configured in server Secrets.' });
        return;
      }

      const { query, lang, portfolioContext } = req.body as {
        query?: unknown;
        lang?: unknown;
        portfolioContext?: unknown;
      };

      if (typeof query !== 'string' || !query.trim() || query.length > 800) {
        res.status(400).json({ error: 'Query must be a non-empty string up to 800 characters.' });
        return;
      }

      const targetLang = lang === 'km' ? 'Khmer (ភាសាខ្មែរ)' : 'English';
      const contextStr =
        typeof portfolioContext === 'string'
          ? portfolioContext.slice(0, 12000)
          : JSON.stringify(portfolioContext || {}).slice(0, 12000);

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Portfolio Snapshot:\n${contextStr}\n\nUser Question: ${query.trim()}`,
        config: {
          systemInstruction: `You are KamChi's private personal loan portfolio analyst.
Respond clearly and concisely in ${targetLang}.
Use exact numbers and borrower names from the provided Portfolio Snapshot.
Do not invent borrowers or amounts that are not in the snapshot.
Format amounts cleanly with currency symbols ($ or ៛). Keep answers practical and actionable.`,
        },
      });

      res.json({ reply: response.text || '' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI assistant request failed.';
      console.error('Gemini assistant error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/ai/draft-reminder', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: 'Gemini API key is not configured in server Secrets.' });
        return;
      }

      const { borrowerName, amountFormatted, dueDate, daysOverdue, lang, tone } = req.body as {
        borrowerName?: unknown;
        amountFormatted?: unknown;
        dueDate?: unknown;
        daysOverdue?: unknown;
        lang?: unknown;
        tone?: unknown;
      };

      if (typeof borrowerName !== 'string' || typeof amountFormatted !== 'string' || typeof dueDate !== 'string') {
        res.status(400).json({ error: 'Missing required reminder fields.' });
        return;
      }

      const safeName = borrowerName.slice(0, 120);
      const safeAmount = amountFormatted.slice(0, 60);
      const safeDue = dueDate.slice(0, 30);
      const overdueNum = typeof daysOverdue === 'number' ? Math.max(0, Math.min(3650, daysOverdue)) : 0;
      const targetLang = lang === 'km' ? 'polite, natural Khmer (ភាសាខ្មែរ)' : 'polite, clear English';
      const toneStr = tone === 'firm' ? 'firm and urgent' : 'friendly and respectful';

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Draft a short ${toneStr} payment reminder message in ${targetLang} ready to send via Telegram/SMS/WhatsApp.
Borrower Name: ${safeName}
Amount Due: ${safeAmount}
Due Date: ${safeDue}
Days Overdue: ${overdueNum}
Return ONLY the message text with no extra commentary.`,
        config: {
          systemInstruction:
            'You draft concise, respectful micro-lending payment reminders in English or Khmer. Output only the ready-to-send message.',
        },
      });

      res.json({ message: (response.text || '').trim() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to draft reminder.';
      console.error('Gemini draft-reminder error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/telegram/send', requireFirebaseAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const { chatId, text } = req.body as { chatId?: unknown; text?: unknown };

      if (typeof chatId !== 'string' || !/^[-0-9]{4,32}$/.test(chatId.trim())) {
        res.status(400).json({ error: 'Valid numeric Telegram chatId is required.' });
        return;
      }
      if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
        res.status(400).json({ error: 'Message text must be 1 to 2000 characters.' });
        return;
      }

      if (!botToken) {
        res.json({
          sent: false,
          reason: 'TELEGRAM_BOT_TOKEN_NOT_SET',
        });
        return;
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.trim(),
          text: text.trim(),
        }),
      });

      const tgJson = (await tgRes.json()) as { ok?: boolean; description?: string };
      if (!tgRes.ok || !tgJson.ok) {
        res.status(502).json({ error: tgJson.description || 'Telegram API rejected the message.' });
        return;
      }

      res.json({ sent: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Telegram request failed.';
      res.status(500).json({ error: msg });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`KamChi server listening on http://0.0.0.0:${port}`);
  });
}

startServer();

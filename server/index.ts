import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
// Note: In a real environment, you would import 'csv-parse', 'xlsx', 'node-ofx-parser', 'googleapis'
// We are writing the logic as if they are available.

const app = express();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'super_secure_secret';

// --- Types & Constants ---
// Re-using the constants map from frontend logic for consistency in this single-file output
const CHURCH_MAPPING: Record<number, string> = {
  0: "Não identificado (Central)",
  1: "CENTRAL - BRASIL",
  // ... (Full list should be imported from shared constant or DB)
  66: "RIBEIRÃO DO LARGO - FAZENDA LARANJEIRA DO RIO BONITO"
};

// --- Middleware ---

const authenticate = (req: any, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid Token' });
  }
};

const requireAdmin = (req: any, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
  next();
};

// --- Services ---

// 1. Cents Identification Logic
const identifyChurchId = (amount: number): number => {
  // Logic: Get the decimal part.
  // E.g., 100.23 -> 23.
  // Math.round to fix floating point issues (0.2999999994).
  const cents = Math.round((amount % 1) * 100);
  
  // Ensure it falls within our map range (0-66). 
  // If > 66, it defaults to 0 (Central/Unidentified) or needs manual review.
  return CHURCH_MAPPING[cents] ? cents : 0; 
};

// 2. Hash Generation for Deduplication
const generateHash = (tx: { date: Date, amount: number, description: string }): string => {
  const str = `${tx.date.toISOString()}|${tx.amount.toFixed(2)}|${tx.description.trim()}`;
  return crypto.createHash('md5').update(str).digest('hex');
};

// 3. Mock Google Sheets Sync (Placeholder for 'googleapis')
const syncToGoogleSheets = async (churchId: number, transactions: any[]) => {
  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church || !church.googleSheetId) return;

  // Implementation would use google.sheets('v4').spreadsheets.values.append
  // Update status in DB
  await prisma.transaction.updateMany({
    where: { id: { in: transactions.map(t => t.id) } },
    data: { status: 'SYNCED' }
  });
};

// --- Routes ---

// Auth
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Real app: fetch from DB
  // const user = await prisma.user.findUnique({ where: { email } });
  // if (!user || !bcrypt.compareSync(password, user.passwordHash)) ...

  // Mock for demo:
  if (email === 'admin@ecclesia.com' && password === 'admin') {
    const token = jwt.sign({ id: '1', role: 'ADMIN', email }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, user: { id: '1', name: 'Admin', email, role: 'ADMIN' } });
  }
  
  if (email === 'lider@ecclesia.com' && password === 'church') {
    const token = jwt.sign({ id: '2', role: 'CHURCH_LEADER', churchId: 1, email }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, user: { id: '2', name: 'Líder', email, role: 'CHURCH_LEADER', churchId: 1 } });
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

// Admin: Upload
app.post('/extract/upload', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const buffer = req.file.buffer;
    let rawTransactions: any[] = []; // { date, amount, description }

    // PARSING LOGIC (Simplified for code block constraint)
    const filename = req.file.originalname.toLowerCase();
    
    if (filename.endsWith('.csv')) {
      // Use 'csv-parse/sync' logic here
      // rawTransactions = parseCsv(buffer);
    } else if (filename.endsWith('.xlsx')) {
      // Use 'xlsx' lib
      // const workbook = xlsx.read(buffer);
      // rawTransactions = xlsx.utils.sheet_to_json(...)
    } else if (filename.endsWith('.ofx')) {
      // Use 'node-ofx-parser'
      // const data = ofx.parse(buffer.toString());
      // rawTransactions = mapOfx(data);
    }

    // MOCK DATA for the purpose of the backend file being valid TS
    rawTransactions = [
      { date: new Date(), amount: 100.01, description: "PIX RECEBIDO" },
      { date: new Date(), amount: 50.23, description: "PIX RECEBIDO" }
    ];

    let processedCount = 0;

    for (const raw of rawTransactions) {
      const hash = generateHash(raw);
      
      // Check duplicate
      const exists = await prisma.transaction.findUnique({ where: { hash } });
      if (exists) continue;

      const churchId = identifyChurchId(raw.amount);

      await prisma.transaction.create({
        data: {
          date: raw.date,
          amount: raw.amount,
          // For privacy, nunca armazenar nome de doador aqui
          description: 'PIX RECEBIDO',
          hash: hash,
          churchId: churchId,
          status: 'PENDING'
        }
      });
      processedCount++;
    }

    // Trigger Async Sync to Sheets (fire and forget or queue)
    // In a real app, use a Queue (BullMQ)
    // queue.add('sync-sheets', { ... })

    res.json({ message: 'File processed', processed: processedCount });

  } catch (err) {
    res.status(500).json({ error: 'Processing failed' });
  }
});

// Admin: Stats
app.get('/admin/stats', authenticate, requireAdmin, async (req, res) => {
  const totalAmount = await prisma.transaction.aggregate({ _sum: { amount: true } });
  const count = await prisma.transaction.count();
  // ... more sophisticated aggregations with prisma.groupBy
  res.json({ totalAmount: totalAmount._sum.amount, totalTransactions: count });
});

// Church: Get Own Data
app.get('/church/me/transactions', authenticate, async (req: any, res) => {
  const { role, churchId } = req.user;
  
  if (role === 'CHURCH_LEADER' && !churchId) {
    return res.status(400).json({ error: 'No church assigned' });
  }

  const where = role === 'ADMIN' ? {} : { churchId: Number(churchId) };
  
  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { date: 'desc' },
    take: 100
  });

  res.json(txs);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
});

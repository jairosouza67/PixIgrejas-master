import { Transaction, DashboardStats, User, UserRole, Church } from '../types';
import { CHURCHES, CHURCH_MAPPING } from '../constants';

// Simulating Backend Logic in Frontend for Demo Purposes
// In a real app, this logic resides in `server/index.ts`

const generateMockTransactions = (count: number): Transaction[] => {
  return Array.from({ length: count }).map((_, i) => {
    // Random church ID between 0 and 66
    const churchId = Math.floor(Math.random() * 67);
    const baseAmount = Math.floor(Math.random() * 500) + 10;
    // The critical business logic: Amount ending matches Church ID
    const amount = baseAmount + (churchId / 100); 
    
    return {
      id: `tx-${Math.random().toString(36).substr(2, 9)}`,
      date: new Date(Date.now() - Math.floor(Math.random() * 1000000000)).toISOString(),
      description: `PIX TRANSFERÊNCIA - ${CHURCH_MAPPING[churchId].substring(0, 15)}...`,
      amount: parseFloat(amount.toFixed(2)),
      churchId: churchId,
      hash: Math.random().toString(36),
      status: Math.random() > 0.1 ? 'SYNCED' : 'PENDING'
    };
  });
};

let storeTransactions: Transaction[] = generateMockTransactions(50);

export const api = {
  login: async (email: string, password: string): Promise<User> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (email === 'admin@ecclesia.com' && password === 'admin') {
          resolve({ id: '1', name: 'Administrador Geral', email, role: UserRole.ADMIN });
        } else if (email === 'lider@ecclesia.com' && password === 'church') {
          resolve({ id: '2', name: 'Líder Local', email, role: UserRole.CHURCH_LEADER, churchId: 1 });
        } else {
          reject(new Error('Credenciais inválidas'));
        }
      }, 800);
    });
  },

  logout: async (): Promise<void> => {
    return;
  },

  getCurrentUser: async (): Promise<User | null> => {
    return null;
  },

  signUp: async (): Promise<User> => {
    throw new Error('Sign up is not available in mock mode');
  },

  seedChurches: async (): Promise<void> => {
    return;
  },

  getStats: async (): Promise<DashboardStats> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const totalAmount = storeTransactions.reduce((acc, tx) => acc + tx.amount, 0);
        const dailyVolume = storeTransactions.reduce((acc: any[], tx) => {
          const date = tx.date.split('T')[0];
          const existing = acc.find(d => d.date === date);
          if (existing) existing.amount += tx.amount;
          else acc.push({ date, amount: tx.amount });
          return acc;
        }, []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);

        const churchTotals: Record<number, number> = {};
        storeTransactions.forEach(tx => {
          churchTotals[tx.churchId] = (churchTotals[tx.churchId] || 0) + tx.amount;
        });

        const topChurches = Object.entries(churchTotals)
          .map(([id, amount]) => ({ name: CHURCH_MAPPING[parseInt(id)], amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);

        resolve({
          totalAmount,
          totalTransactions: storeTransactions.length,
          topChurches,
          dailyVolume
        });
      }, 500);
    });
  },

  getTransactions: async (role: UserRole, churchId?: number): Promise<Transaction[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (role === UserRole.ADMIN) {
          resolve(storeTransactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        } else {
          resolve(storeTransactions.filter(t => t.churchId === churchId).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        }
      }, 600);
    });
  },

  resetTransactions: async (): Promise<number> => {
    const deleted = storeTransactions.length;
    storeTransactions = [];
    return deleted;
  },

  uploadExtract: async (_file: File, _userId?: string): Promise<{ processed: number; duplicates: number; totalAmount: number }> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Mock processing logic
        const newTxs = generateMockTransactions(15);
        storeTransactions = [...newTxs, ...storeTransactions];
        const total = newTxs.reduce((acc, t) => acc + t.amount, 0);
        resolve({ processed: 15, duplicates: 0, totalAmount: total });
      }, 1500);
    });
  }
};
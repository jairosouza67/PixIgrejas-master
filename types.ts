export enum UserRole {
  ADMIN = 'ADMIN',
  CHURCH_LEADER = 'CHURCH_LEADER'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  churchId?: number; // Null if Admin
}

export interface Church {
  id: number; // Corresponds to the cents (0-99)
  name: string;
  googleSheetId?: string;
}

export interface Transaction {
  id: string;
  date: string; // ISO String
  description: string;
  amount: number;
  churchId: number;
  hash: string;
  status: 'PENDING' | 'SYNCED' | 'ERROR';
}

export interface DashboardStats {
  totalAmount: number;
  totalTransactions: number;
  topChurches: { name: string; amount: number }[];
  dailyVolume: { date: string; amount: number }[];
}

export interface AuthResponse {
  user: User;
  token: string;
}
// Supabase Database Types
// These types match the database schema we'll create in Supabase

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      churches: {
        Row: {
          id: number
          name: string
          cents_code: number
          google_sheet_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          name: string
          cents_code: number
          google_sheet_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          name?: string
          cents_code?: number
          google_sheet_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          email: string
          name: string
          role: 'ADMIN' | 'CHURCH_LEADER'
          church_id: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name: string
          role: 'ADMIN' | 'CHURCH_LEADER'
          church_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          role?: 'ADMIN' | 'CHURCH_LEADER'
          church_id?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          date: string
          amount: number
          description: string
          church_id: number
          hash: string
          status: 'PENDING' | 'SYNCED' | 'ERROR'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          amount: number
          description: string
          church_id: number
          hash: string
          status?: 'PENDING' | 'SYNCED' | 'ERROR'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          amount?: number
          description?: string
          church_id?: number
          hash?: string
          status?: 'PENDING' | 'SYNCED' | 'ERROR'
          created_at?: string
          updated_at?: string
        }
      }
      upload_logs: {
        Row: {
          id: string
          user_id: string
          filename: string
          total_transactions: number
          processed_transactions: number
          duplicates_skipped: number
          total_amount: number
          status: 'PROCESSING' | 'COMPLETED' | 'ERROR'
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          filename: string
          total_transactions?: number
          processed_transactions?: number
          duplicates_skipped?: number
          total_amount?: number
          status?: 'PROCESSING' | 'COMPLETED' | 'ERROR'
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          filename?: string
          total_transactions?: number
          processed_transactions?: number
          duplicates_skipped?: number
          total_amount?: number
          status?: 'PROCESSING' | 'COMPLETED' | 'ERROR'
          error_message?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: 'ADMIN' | 'CHURCH_LEADER'
      transaction_status: 'PENDING' | 'SYNCED' | 'ERROR'
      upload_status: 'PROCESSING' | 'COMPLETED' | 'ERROR'
    }
  }
}

// Convenience types
export type Church = Database['public']['Tables']['churches']['Row']
export type ChurchInsert = Database['public']['Tables']['churches']['Insert']

export type DbUser = Database['public']['Tables']['users']['Row']
export type DbUserInsert = Database['public']['Tables']['users']['Insert']

export type Transaction = Database['public']['Tables']['transactions']['Row']
export type TransactionInsert = Database['public']['Tables']['transactions']['Insert']

export type UploadLog = Database['public']['Tables']['upload_logs']['Row']
export type UploadLogInsert = Database['public']['Tables']['upload_logs']['Insert']

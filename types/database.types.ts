export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          id: string
          request_id: string
          role: Database["public"]["Enums"]["app_role"] | null
          ts: string
          user_id: string | null
        }
        Insert: {
          action: string
          id?: string
          request_id: string
          role?: Database["public"]["Enums"]["app_role"] | null
          ts?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          id?: string
          request_id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          ts?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_counter: {
        Row: {
          id: boolean
          next_number: number
        }
        Insert: {
          id?: boolean
          next_number?: number
        }
        Update: {
          id?: boolean
          next_number?: number
        }
        Relationships: []
      }
      offers: {
        Row: {
          created_at: string
          id: string
          price: number
          request_id: string
          supplier: string
        }
        Insert: {
          created_at?: string
          id?: string
          price: number
          request_id: string
          supplier: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          request_id?: string
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      project_assignments: {
        Row: {
          car_user_id: string | null
          pm_user_id: string | null
          project_code: string
        }
        Insert: {
          car_user_id?: string | null
          pm_user_id?: string | null
          project_code: string
        }
        Update: {
          car_user_id?: string | null
          pm_user_id?: string | null
          project_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_car_user_id_fkey"
            columns: ["car_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_pm_user_id_fkey"
            columns: ["pm_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_documents: {
        Row: {
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          doc_key: string
          request_id: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          doc_key: string
          request_id: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          doc_key?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_documents_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          budget_line: string
          code: string
          coordination_cost: boolean
          country: string
          created_at: string
          cup_code: string | null
          currency: string
          derogation: boolean
          derogation_reason: string | null
          description: string
          estimated_price: number
          folder_path: string | null
          id: string
          initiated_by: string
          institutional_activity: boolean
          occasional_collaborator: boolean
          proc_code: Database["public"]["Enums"]["proc_code"]
          project_code: string
          stage: Database["public"]["Enums"]["request_stage"]
          updated_at: string
          winner_note: string | null
          winner_offer_id: string | null
        }
        Insert: {
          budget_line: string
          code: string
          coordination_cost?: boolean
          country: string
          created_at?: string
          cup_code?: string | null
          currency?: string
          derogation?: boolean
          derogation_reason?: string | null
          description: string
          estimated_price: number
          folder_path?: string | null
          id?: string
          initiated_by: string
          institutional_activity?: boolean
          occasional_collaborator?: boolean
          proc_code: Database["public"]["Enums"]["proc_code"]
          project_code: string
          stage?: Database["public"]["Enums"]["request_stage"]
          updated_at?: string
          winner_note?: string | null
          winner_offer_id?: string | null
        }
        Update: {
          budget_line?: string
          code?: string
          coordination_cost?: boolean
          country?: string
          created_at?: string
          cup_code?: string | null
          currency?: string
          derogation?: boolean
          derogation_reason?: string | null
          description?: string
          estimated_price?: number
          folder_path?: string | null
          id?: string
          initiated_by?: string
          institutional_activity?: boolean
          occasional_collaborator?: boolean
          proc_code?: Database["public"]["Enums"]["proc_code"]
          project_code?: string
          stage?: Database["public"]["Enums"]["request_stage"]
          updated_at?: string
          winner_note?: string | null
          winner_offer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_winner_offer"
            columns: ["winner_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          id: string
          phase: string
          request_id: string
          signed_at: string | null
          signed_by: string | null
          signer_role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          id?: string
          phase: string
          request_id: string
          signed_at?: string | null
          signed_by?: string | null
          signer_role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          id?: string
          phase?: string
          request_id?: string
          signed_at?: string | null
          signed_by?: string | null
          signer_role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "signatures_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_signed_by_fkey"
            columns: ["signed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      next_hq_number: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "BH" | "PM" | "LOG" | "CAR" | "RAC" | "DG"
      proc_code: "DIR" | "SQ" | "3Q" | "SP" | "TEN"
      request_stage:
        | "request"
        | "ir_auth"
        | "offers"
        | "winner"
        | "documents"
        | "payment"
        | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["BH", "PM", "LOG", "CAR", "RAC", "DG"],
      proc_code: ["DIR", "SQ", "3Q", "SP", "TEN"],
      request_stage: [
        "request",
        "ir_auth",
        "offers",
        "winner",
        "documents",
        "payment",
        "completed",
      ],
    },
  },
} as const

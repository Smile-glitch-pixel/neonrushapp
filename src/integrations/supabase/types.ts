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
      duo_matches: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          outcome: string
          player_a_id: string
          player_b_id: string | null
          revives: number
          room_id: string | null
          team_score: number
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          id?: string
          outcome?: string
          player_a_id: string
          player_b_id?: string | null
          revives?: number
          room_id?: string | null
          team_score?: number
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          outcome?: string
          player_a_id?: string
          player_b_id?: string | null
          revives?: number
          room_id?: string | null
          team_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "duo_matches_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_scores: {
        Row: {
          created_at: string
          display_name: string | null
          equipped_skin: string | null
          id: string
          mode: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          equipped_skin?: string | null
          id?: string
          mode: string
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          equipped_skin?: string | null
          id?: string
          mode?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_state: {
        Row: {
          best_by_mode: Json
          claimed: Json
          coins: number
          equipped: string
          owned: Json
          settings: Json
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          best_by_mode?: Json
          claimed?: Json
          coins?: number
          equipped?: string
          owned?: Json
          settings?: Json
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          best_by_mode?: Json
          claimed?: Json
          coins?: number
          equipped?: string
          owned?: Json
          settings?: Json
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_players: {
        Row: {
          display_name: string | null
          down_until: string | null
          equipped_skin: string | null
          finished: boolean
          id: string
          is_host: boolean
          joined_at: string
          last_seen: string
          revives: number
          room_id: string
          score: number
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          display_name?: string | null
          down_until?: string | null
          equipped_skin?: string | null
          finished?: boolean
          id?: string
          is_host?: boolean
          joined_at?: string
          last_seen?: string
          revives?: number
          room_id: string
          score?: number
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          display_name?: string | null
          down_until?: string | null
          equipped_skin?: string | null
          finished?: boolean
          id?: string
          is_host?: boolean
          joined_at?: string
          last_seen?: string
          revives?: number
          room_id?: string
          score?: number
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          duration_s: number
          ends_at: string | null
          host_id: string
          id: string
          revives: number
          started_at: string | null
          status: string
          survived_ms: number
          team_score: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          duration_s?: number
          ends_at?: string | null
          host_id: string
          id?: string
          revives?: number
          started_at?: string | null
          status?: string
          survived_ms?: number
          team_score?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          duration_s?: number
          ends_at?: string | null
          host_id?: string
          id?: string
          revives?: number
          started_at?: string | null
          status?: string
          survived_ms?: number
          team_score?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      duo_cleanup: { Args: never; Returns: undefined }
      duo_close_coop: { Args: { _room: string }; Returns: undefined }
      duo_create_room: {
        Args: { _name: string; _skin: string }
        Returns: string
      }
      duo_end_run: { Args: { _room: string }; Returns: undefined }
      duo_go_down: {
        Args: { _down_ms?: number; _room: string }
        Returns: undefined
      }
      duo_heartbeat: { Args: { _room: string }; Returns: undefined }
      duo_is_member: { Args: { _room: string; _uid: string }; Returns: boolean }
      duo_join_room: {
        Args: { _code: string; _name: string; _skin: string }
        Returns: string
      }
      duo_revive: { Args: { _room: string; _target: string }; Returns: boolean }
      duo_tick: { Args: { _room: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

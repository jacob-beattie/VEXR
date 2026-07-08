// Generated via `mcp__supabase__generate_typescript_types` (project ref: fsskwaazmoidayqtsipy).
// Regenerate whenever supabase-schema.sql changes and keep supabase/functions/_shared/database.types.ts in sync.
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
      ai_briefings: {
        Row: {
          briefing: string
          generated_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          briefing: string
          generated_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          briefing?: string
          generated_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_briefings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          called_at: string
          function_name: string
          id: string
          user_id: string
        }
        Insert: {
          called_at?: string
          function_name: string
          id?: string
          user_id: string
        }
        Update: {
          called_at?: string
          function_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      fitness_benchmarks: {
        Row: {
          id: string
          metric: string
          recorded_at: string | null
          user_id: string | null
          value: string
        }
        Insert: {
          id?: string
          metric: string
          recorded_at?: string | null
          user_id?: string | null
          value: string
        }
        Update: {
          id?: string
          metric?: string
          recorded_at?: string | null
          user_id?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "fitness_benchmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      food_database: {
        Row: {
          calories: number
          carbs: number
          fat: number
          id: string
          name: string
          protein: number
        }
        Insert: {
          calories: number
          carbs?: number
          fat?: number
          id?: string
          name: string
          protein?: number
        }
        Update: {
          calories?: number
          carbs?: number
          fat?: number
          id?: string
          name?: string
          protein?: number
        }
        Relationships: []
      }
      goals: {
        Row: {
          completed: boolean | null
          created_at: string | null
          id: string
          text: string
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          id?: string
          text: string
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          id?: string
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hydration_logs: {
        Row: {
          date: string
          liters: number
          user_id: string
        }
        Insert: {
          date: string
          liters?: number
          user_id: string
        }
        Update: {
          date?: string
          liters?: number
          user_id?: string
        }
        Relationships: []
      }
      nutrition_custom_foods: {
        Row: {
          calories: number
          carbs: number
          created_at: string | null
          fat: number
          id: string
          name: string
          protein: number
          user_id: string
        }
        Insert: {
          calories: number
          carbs?: number
          created_at?: string | null
          fat?: number
          id?: string
          name: string
          protein?: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string | null
          fat?: number
          id?: string
          name?: string
          protein?: number
          user_id?: string
        }
        Relationships: []
      }
      nutrition_logs: {
        Row: {
          calories: number
          carbs: number
          created_at: string | null
          date: string
          fat: number
          food_name: string
          id: string
          meal: string
          protein: number
          user_id: string
        }
        Insert: {
          calories: number
          carbs?: number
          created_at?: string | null
          date: string
          fat?: number
          food_name: string
          id?: string
          meal: string
          protein?: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string | null
          date?: string
          fat?: number
          food_name?: string
          id?: string
          meal?: string
          protein?: number
          user_id?: string
        }
        Relationships: []
      }
      nutrition_targets: {
        Row: {
          calorie_target: number | null
          carbs_target: number | null
          fat_target: number | null
          protein_target: number | null
          user_id: string
        }
        Insert: {
          calorie_target?: number | null
          carbs_target?: number | null
          fat_target?: number | null
          protein_target?: number | null
          user_id: string
        }
        Update: {
          calorie_target?: number | null
          carbs_target?: number | null
          fat_target?: number | null
          protein_target?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          css: string | null
          ftp: number | null
          id: string
          max_hr: number | null
          name: string | null
          onboarding_completed: boolean | null
          race_date: string | null
          race_goal: string | null
          run_pace: string | null
          sport: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          css?: string | null
          ftp?: number | null
          id: string
          max_hr?: number | null
          name?: string | null
          onboarding_completed?: boolean | null
          race_date?: string | null
          race_goal?: string | null
          run_pace?: string | null
          sport?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          css?: string | null
          ftp?: number | null
          id?: string
          max_hr?: number | null
          name?: string | null
          onboarding_completed?: boolean | null
          race_date?: string | null
          race_goal?: string | null
          run_pace?: string | null
          sport?: string | null
        }
        Relationships: []
      }
      strava_connections: {
        Row: {
          access_token: string
          athlete_id: number
          athlete_name: string | null
          expires_at: number
          id: string
          refresh_token: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          athlete_id: number
          athlete_name?: string | null
          expires_at: number
          id?: string
          refresh_token: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          athlete_id?: number
          athlete_name?: string | null
          expires_at?: number
          id?: string
          refresh_token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strava_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          created_at: string | null
          current_week: number | null
          id: string
          name: string
          race_date: string | null
          race_name: string | null
          raw_text: string | null
          source: string | null
          sport: string
          start_date: string | null
          status: string | null
          total_weeks: number
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_week?: number | null
          id?: string
          name: string
          race_date?: string | null
          race_name?: string | null
          raw_text?: string | null
          source?: string | null
          sport: string
          start_date?: string | null
          status?: string | null
          total_weeks: number
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_week?: number | null
          id?: string
          name?: string
          race_date?: string | null
          race_name?: string | null
          raw_text?: string | null
          source?: string | null
          sport?: string
          start_date?: string | null
          status?: string | null
          total_weeks?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          created_at: string | null
          duration_min: number | null
          has_conflict: boolean | null
          id: string
          notes: string | null
          plan_id: string | null
          scheduled_date: string | null
          sport: string
          status: string | null
          target_metric: string | null
          title: string
          user_id: string
          week_number: number
        }
        Insert: {
          created_at?: string | null
          duration_min?: number | null
          has_conflict?: boolean | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          scheduled_date?: string | null
          sport: string
          status?: string | null
          target_metric?: string | null
          title: string
          user_id: string
          week_number: number
        }
        Update: {
          created_at?: string | null
          duration_min?: number | null
          has_conflict?: boolean | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          scheduled_date?: string | null
          sport?: string
          status?: string | null
          target_metric?: string | null
          title?: string
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      training_zones: {
        Row: {
          id: string
          max_value: string | null
          min_value: string | null
          sport: string
          updated_at: string | null
          user_id: string | null
          zone_name: string
          zone_number: number
        }
        Insert: {
          id?: string
          max_value?: string | null
          min_value?: string | null
          sport: string
          updated_at?: string | null
          user_id?: string | null
          zone_name: string
          zone_number: number
        }
        Update: {
          id?: string
          max_value?: string | null
          min_value?: string | null
          sport?: string
          updated_at?: string | null
          user_id?: string | null
          zone_name?: string
          zone_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_zones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_library: {
        Row: {
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          name: string
          tss: number | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          name: string
          tss?: number | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          name?: string
          tss?: number | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_library_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          avg_pace: string | null
          avg_power: number | null
          calories: number | null
          created_at: string | null
          date: string
          distance_meters: number | null
          duration_minutes: number | null
          elevation_gain: number | null
          heart_rate_avg: number | null
          heart_rate_max: number | null
          id: string
          notes: string | null
          plan_id: string | null
          planned: boolean | null
          strava_activity_id: number | null
          structure: Json | null
          title: string
          tss: number | null
          type: string
          user_id: string | null
          zone: string | null
        }
        Insert: {
          avg_pace?: string | null
          avg_power?: number | null
          calories?: number | null
          created_at?: string | null
          date: string
          distance_meters?: number | null
          duration_minutes?: number | null
          elevation_gain?: number | null
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          planned?: boolean | null
          strava_activity_id?: number | null
          structure?: Json | null
          title: string
          tss?: number | null
          type: string
          user_id?: string | null
          zone?: string | null
        }
        Update: {
          avg_pace?: string | null
          avg_power?: number | null
          calories?: number | null
          created_at?: string | null
          date?: string
          distance_meters?: number | null
          duration_minutes?: number | null
          elevation_gain?: number | null
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          planned?: boolean | null
          strava_activity_id?: number | null
          structure?: Json | null
          title?: string
          tss?: number | null
          type?: string
          user_id?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_user_id_fkey"
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
      check_and_increment_rate_limit: {
        Args: {
          p_function_name: string
          p_limit: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
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

type DefaultSchema = DatabaseWithoutInternals["public"]

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

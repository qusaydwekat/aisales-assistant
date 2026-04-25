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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          ai_instructions: string | null
          auto_reply: boolean
          created_at: string
          escalation_threshold: number
          fallback_message: string | null
          greeting_facebook: string | null
          greeting_instagram: string | null
          greeting_whatsapp: string | null
          id: string
          language: string
          order_confirmation_template: string | null
          persona_name: string
          response_delay: number
          store_id: string
          tone: string
          updated_at: string
        }
        Insert: {
          ai_instructions?: string | null
          auto_reply?: boolean
          created_at?: string
          escalation_threshold?: number
          fallback_message?: string | null
          greeting_facebook?: string | null
          greeting_instagram?: string | null
          greeting_whatsapp?: string | null
          id?: string
          language?: string
          order_confirmation_template?: string | null
          persona_name?: string
          response_delay?: number
          store_id: string
          tone?: string
          updated_at?: string
        }
        Update: {
          ai_instructions?: string | null
          auto_reply?: boolean
          created_at?: string
          escalation_threshold?: number
          fallback_message?: string | null
          greeting_facebook?: string | null
          greeting_instagram?: string | null
          greeting_whatsapp?: string | null
          id?: string
          language?: string
          order_confirmation_template?: string | null
          persona_name?: string
          response_delay?: number
          store_id?: string
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_auto_reply: boolean
          created_at: string
          customer_address: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          last_message: string | null
          last_message_time: string | null
          page_id: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          platform_conversation_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          store_id: string
          unread: boolean
          updated_at: string
        }
        Insert: {
          ai_auto_reply?: boolean
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          last_message?: string | null
          last_message_time?: string | null
          page_id?: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          platform_conversation_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          store_id: string
          unread?: boolean
          updated_at?: string
        }
        Update: {
          ai_auto_reply?: boolean
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          last_message?: string | null
          last_message_time?: string | null
          page_id?: string | null
          platform?: Database["public"]["Enums"]["platform_type"]
          platform_conversation_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          store_id?: string
          unread?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          platform_message_id: string | null
          sender: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          platform_message_id?: string | null
          sender: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          platform_message_id?: string | null
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          description: string | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      openai_webhook_events: {
        Row: {
          created_at: string
          event_id: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string | null
          conversation_id: string | null
          created_at: string
          customer_name: string
          id: string
          items: Json
          notes: string | null
          order_number: string
          phone: string | null
          platform: Database["public"]["Enums"]["platform_type"] | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          total: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_name: string
          id?: string
          items?: Json
          notes?: string | null
          order_number?: string
          phone?: string | null
          platform?: Database["public"]["Enums"]["platform_type"] | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          items?: Json
          notes?: string | null
          order_number?: string
          phone?: string | null
          platform?: Database["public"]["Enums"]["platform_type"] | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_ai_config: {
        Row: {
          autofill_model: string
          id: string
          model: string
          provider: string
          singleton: boolean
          test_model: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          autofill_model?: string
          id?: string
          model?: string
          provider?: string
          singleton?: boolean
          test_model?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          autofill_model?: string
          id?: string
          model?: string
          provider?: string
          singleton?: boolean
          test_model?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          created_at: string
          credentials: Json | null
          id: string
          last_synced_at: string | null
          message_count: number
          page_id: string | null
          page_name: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials?: Json | null
          id?: string
          last_synced_at?: string | null
          message_count?: number
          page_id?: string | null
          page_name?: string | null
          platform: Database["public"]["Enums"]["platform_type"]
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials?: Json | null
          id?: string
          last_synced_at?: string | null
          message_count?: number
          page_id?: string | null
          page_name?: string | null
          platform?: Database["public"]["Enums"]["platform_type"]
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string | null
          compare_price: number | null
          created_at: string
          description: string | null
          id: string
          images: string[] | null
          name: string
          price: number
          sku: string | null
          stock: number
          store_id: string
          updated_at: string
          variants: Json | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          compare_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          name: string
          price?: number
          sku?: string | null
          stock?: number
          store_id: string
          updated_at?: string
          variants?: Json | null
        }
        Update: {
          active?: boolean
          category?: string | null
          compare_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          name?: string
          price?: number
          sku?: string | null
          stock?: number
          store_id?: string
          updated_at?: string
          variants?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          paid_until: string | null
          phone: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          paid_until?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          paid_until?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          address: string | null
          category: string | null
          cover_image_url: string | null
          created_at: string
          delivery_info: string | null
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          payment_methods: string[] | null
          phone: string | null
          return_policy: string | null
          updated_at: string
          user_id: string
          working_hours: Json | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          delivery_info?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          payment_methods?: string[] | null
          phone?: string | null
          return_policy?: string | null
          updated_at?: string
          user_id: string
          working_hours?: Json | null
        }
        Update: {
          address?: string | null
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          delivery_info?: string | null
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          payment_methods?: string[] | null
          phone?: string | null
          return_policy?: string | null
          updated_at?: string
          user_id?: string
          working_hours?: Json | null
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          confirmed_by: string | null
          created_at: string
          expires_at: string
          id: string
          notes: string | null
          paid_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          confirmed_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          notes?: string | null
          paid_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "store_owner"
      conversation_status: "open" | "resolved" | "pending_order"
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
      platform_type: "facebook" | "instagram" | "whatsapp"
      user_status: "pending" | "active" | "suspended"
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
      app_role: ["admin", "store_owner"],
      conversation_status: ["open", "resolved", "pending_order"],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      platform_type: ["facebook", "instagram", "whatsapp"],
      user_status: ["pending", "active", "suspended"],
    },
  },
} as const

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
      activity_log: {
        Row: {
          created_at: string
          href: string | null
          id: string
          kind: string
          message: string
          subject_id: string | null
          subject_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          href?: string | null
          id?: string
          kind: string
          message: string
          subject_id?: string | null
          subject_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          href?: string | null
          id?: string
          kind?: string
          message?: string
          subject_id?: string | null
          subject_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          lat: number
          lng: number
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number
          lng?: number
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          created_at: string
          end_date: string | null
          hostel_id: string
          id: string
          locked_at: string | null
          move_in: string | null
          paid_at: string | null
          payment_reference: string | null
          price_per_session_kobo: number | null
          requested_at: string | null
          reserved_until: string | null
          room_id: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          hostel_id: string
          id?: string
          locked_at?: string | null
          move_in?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          price_per_session_kobo?: number | null
          requested_at?: string | null
          reserved_until?: string | null
          room_id?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          hostel_id?: string
          id?: string
          locked_at?: string | null
          move_in?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          price_per_session_kobo?: number | null
          requested_at?: string | null
          reserved_until?: string | null
          room_id?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_availability"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "bookings_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_room_state"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          geo: unknown
          id: string
          name: string
          organizer_id: string | null
          slug: string
          starts_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          geo?: unknown
          id?: string
          name: string
          organizer_id?: string | null
          slug: string
          starts_at: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          geo?: unknown
          id?: string
          name?: string
          organizer_id?: string | null
          slug?: string
          starts_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_images: {
        Row: {
          created_at: string
          hostel_id: string
          id: string
          position: number
          url: string
        }
        Insert: {
          created_at?: string
          hostel_id: string
          id?: string
          position?: number
          url: string
        }
        Update: {
          created_at?: string
          hostel_id?: string
          id?: string
          position?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "hostel_images_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_availability"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_images_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_inspections: {
        Row: {
          ambassador_id: string | null
          availability_note: string | null
          booking_id: string | null
          created_at: string
          fee_kobo: number
          full_name: string
          hostel_id: string
          id: string
          paid_at: string | null
          payment_reference: string | null
          phone: string
          scheduled_for: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          ambassador_id?: string | null
          availability_note?: string | null
          booking_id?: string | null
          created_at?: string
          fee_kobo: number
          full_name: string
          hostel_id: string
          id?: string
          paid_at?: string | null
          payment_reference?: string | null
          phone: string
          scheduled_for: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          ambassador_id?: string | null
          availability_note?: string | null
          booking_id?: string | null
          created_at?: string
          fee_kobo?: number
          full_name?: string
          hostel_id?: string
          id?: string
          paid_at?: string | null
          payment_reference?: string | null
          phone?: string
          scheduled_for?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hostel_inspections_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_inspections_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_inspections_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_availability"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_inspections_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_inspections_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_rooms: {
        Row: {
          created_at: string
          hostel_id: string
          id: string
          is_listed: boolean
          label: string
          price_per_session_kobo: number | null
        }
        Insert: {
          created_at?: string
          hostel_id: string
          id?: string
          is_listed?: boolean
          label: string
          price_per_session_kobo?: number | null
        }
        Update: {
          created_at?: string
          hostel_id?: string
          id?: string
          is_listed?: boolean
          label?: string
          price_per_session_kobo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_availability"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_verification_visits: {
        Row: {
          ambassador_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          hostel_id: string
          id: string
          notes: string | null
          photos: string[]
          scheduled_for: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          ambassador_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          hostel_id: string
          id?: string
          notes?: string | null
          photos?: string[]
          scheduled_for?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          ambassador_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          hostel_id?: string
          id?: string
          notes?: string | null
          photos?: string[]
          scheduled_for?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_verification_visits_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_verification_visits_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_verification_visits_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_availability"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_verification_visits_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
        ]
      }
      hostels: {
        Row: {
          address: string | null
          amenities: string[]
          archived_at: string | null
          area: string
          campus: string
          created_at: string
          distance_minutes: number | null
          geo: unknown
          id: string
          inspection_fee_kobo: number
          landlord_id: string
          landmark: string | null
          name: string
          price_per_session_kobo: number
          ribbon: string | null
          room_type: string
          slug: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          address?: string | null
          amenities?: string[]
          archived_at?: string | null
          area: string
          campus?: string
          created_at?: string
          distance_minutes?: number | null
          geo?: unknown
          id?: string
          inspection_fee_kobo?: number
          landlord_id: string
          landmark?: string | null
          name: string
          price_per_session_kobo: number
          ribbon?: string | null
          room_type: string
          slug: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          address?: string | null
          amenities?: string[]
          archived_at?: string | null
          area?: string
          campus?: string
          created_at?: string
          distance_minutes?: number | null
          geo?: unknown
          id?: string
          inspection_fee_kobo?: number
          landlord_id?: string
          landmark?: string | null
          name?: string
          price_per_session_kobo?: number
          ribbon?: string | null
          room_type?: string
          slug?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hostels_area_fkey"
            columns: ["area"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "hostels_landlord_id_fkey"
            columns: ["landlord_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price_kobo: number
          sold: number
          status: string
          stock: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          archived_at?: string | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price_kobo: number
          sold?: number
          status?: string
          stock?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price_kobo?: number
          sold?: number
          status?: string
          stock?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          listing_id: string | null
          name: string
          order_id: string
          price_kobo: number
          qty: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          listing_id?: string | null
          name: string
          order_id: string
          price_kobo: number
          qty: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          listing_id?: string | null
          name?: string
          order_id?: string
          price_kobo?: number
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee_kobo: number
          eta_minutes: number | null
          id: string
          packaging_fee_kobo: number
          paid_at: string | null
          payment_reference: string | null
          placed_at: string
          status: string
          student_id: string
          subtotal_kobo: number
          sync_fee_kobo: number
          total_kobo: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee_kobo?: number
          eta_minutes?: number | null
          id?: string
          packaging_fee_kobo?: number
          paid_at?: string | null
          payment_reference?: string | null
          placed_at?: string
          status?: string
          student_id: string
          subtotal_kobo?: number
          sync_fee_kobo?: number
          total_kobo?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee_kobo?: number
          eta_minutes?: number | null
          id?: string
          packaging_fee_kobo?: number
          paid_at?: string | null
          payment_reference?: string | null
          placed_at?: string
          status?: string
          student_id?: string
          subtotal_kobo?: number
          sync_fee_kobo?: number
          total_kobo?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          business_address: string | null
          business_name: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: string
          sells: string | null
          trade: string | null
          updated_at: string
          vendor_category: string | null
          verification_status: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          business_address?: string | null
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string
          sells?: string | null
          trade?: string | null
          updated_at?: string
          vendor_category?: string | null
          verification_status?: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          business_address?: string | null
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          sells?: string | null
          trade?: string | null
          updated_at?: string
          vendor_category?: string | null
          verification_status?: string
        }
        Relationships: []
      }
      saved_hostels: {
        Row: {
          created_at: string
          hostel_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          hostel_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          hostel_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_hostels_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_availability"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "saved_hostels_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_hostels_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          event_id: string
          id: string
          owner_id: string
          price_kobo: number
          reference: string
          status: string
          tier: string | null
          used_at: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          owner_id: string
          price_kobo: number
          reference: string
          status?: string
          tier?: string | null
          used_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          owner_id?: string
          price_kobo?: number
          reference?: string
          status?: string
          tier?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      hostel_availability: {
        Row: {
          availability: string | null
          hostel_id: string | null
          rooms_available: number | null
          rooms_total: number | null
        }
        Relationships: []
      }
      hostel_room_state: {
        Row: {
          hostel_id: string | null
          label: string | null
          price_kobo: number | null
          room_id: string | null
          state: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostel_availability"
            referencedColumns: ["hostel_id"]
          },
          {
            foreignKeyName: "hostel_rooms_hostel_id_fkey"
            columns: ["hostel_id"]
            isOneToOne: false
            referencedRelation: "hostels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_admin: {
        Args: { p_email: string; p_role: string }
        Returns: string
      }
      expire_stale_holds: { Args: never; Returns: number }
      hold_interval: { Args: never; Returns: string }
      hostels_near: {
        Args: { lat: number; lng: number; radius_m?: number }
        Returns: {
          area: string
          availability: string
          distance_m: number
          id: string
          name: string
          price_per_session_kobo: number
          rooms_available: number
          slug: string
        }[]
      }
      login_method: { Args: { p_email: string }; Returns: string }
      max_holds_per_student: { Args: never; Returns: number }
      promote_to_admin: {
        Args: { p_email: string; p_role: string }
        Returns: string
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

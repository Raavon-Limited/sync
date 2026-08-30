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
      analytics_events: {
        Row: {
          campus_id: string | null
          id: number
          name: string
          occurred_at: string
          props: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          campus_id?: string | null
          id?: never
          name: string
          occurred_at?: string
          props?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          campus_id?: string | null
          id?: never
          name?: string
          occurred_at?: string
          props?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
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
      articles: {
        Row: {
          author_id: string | null
          body: string | null
          cover_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          is_default: boolean
          is_verified: boolean
          owner_id: string
          recipient_code: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_verified?: boolean
          owner_id: string
          recipient_code?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_verified?: boolean
          owner_id?: string
          recipient_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          created_at: string
          ends_at: string | null
          href: string | null
          id: string
          image_url: string | null
          is_active: boolean
          placement: string
          sort_order: number
          starts_at: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          href?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          placement?: string
          sort_order?: number
          starts_at?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          href?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          placement?: string
          sort_order?: number
          starts_at?: string
          subtitle?: string | null
          title?: string
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
      campuses: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          state: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          listing_id: string
          note: string | null
          quantity: number
          unit_price_kobo: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          listing_id: string
          note?: string | null
          quantity?: number
          unit_price_kobo: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          note?: string | null
          quantity?: number
          unit_price_kobo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_staff: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string
          revoked_at: string | null
          role: string
          storefront_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          revoked_at?: string | null
          role?: string
          storefront_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          revoked_at?: string | null
          role?: string
          storefront_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_staff_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          role: string
          storefront_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          role?: string
          storefront_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          role?: string
          storefront_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_invites_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_listings: {
        Row: {
          created_at: string
          is_available: boolean
          is_listed: boolean
          listing_id: string
          price_kobo: number | null
          stock: number | null
          storefront_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_listed?: boolean
          listing_id: string
          price_kobo?: number | null
          stock?: number | null
          storefront_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_listed?: boolean
          listing_id?: string
          price_kobo?: number | null
          stock?: number | null
          storefront_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      storefronts: {
        Row: {
          auto_pause_after: number | null
          auto_pause_minutes: number
          pause_reason: string | null
          paused_until: string | null
          lat: number | null
          lng: number | null
          address: string | null
          archived_at: string | null
          area: string | null
          campus_id: string | null
          closes_at: string | null
          created_at: string
          geo: unknown | null
          id: string
          is_accepting_orders: boolean
          is_primary: boolean
          name: string
          opens_at: string | null
          public_phone: string | null
          slug: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          auto_pause_after?: number | null
          auto_pause_minutes?: number
          pause_reason?: string | null
          paused_until?: string | null
          lat?: number | null
          lng?: number | null
          address?: string | null
          archived_at?: string | null
          area?: string | null
          campus_id?: string | null
          closes_at?: string | null
          created_at?: string
          geo?: unknown | null
          id?: string
          is_accepting_orders?: boolean
          is_primary?: boolean
          name: string
          opens_at?: string | null
          public_phone?: string | null
          slug: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          auto_pause_after?: number | null
          auto_pause_minutes?: number
          pause_reason?: string | null
          paused_until?: string | null
          lat?: number | null
          lng?: number | null
          address?: string | null
          archived_at?: string | null
          area?: string | null
          campus_id?: string | null
          closes_at?: string | null
          created_at?: string
          geo?: unknown | null
          id?: string
          is_accepting_orders?: boolean
          is_primary?: boolean
          name?: string
          opens_at?: string | null
          public_phone?: string | null
          slug?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefronts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefronts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          storefront_id: string | null
          created_at: string
          id: string
          status: string
          student_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          storefront_id?: string | null
          created_at?: string
          id?: string
          status?: string
          student_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          storefront_id?: string | null
          created_at?: string
          id?: string
          status?: string
          student_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          muted: boolean
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          muted?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          last_message_at: string
          last_message_preview: string | null
          subject_id: string | null
          subject_type: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          last_message_preview?: string | null
          subject_id?: string | null
          subject_type?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          last_message_preview?: string | null
          subject_id?: string | null
          subject_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          assigned_at: string | null
          confirmation_code_hash: string | null
          confirmed_by: string | null
          created_at: string
          delivered_at: string | null
          distance_meters: number | null
          dropoff_address: string
          dropoff_geo: unknown
          failure_reason: string | null
          fee_kobo: number
          id: string
          order_id: string
          picked_up_at: string | null
          pickup_address: string | null
          pickup_geo: unknown
          rider_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          confirmation_code_hash?: string | null
          confirmed_by?: string | null
          created_at?: string
          delivered_at?: string | null
          distance_meters?: number | null
          dropoff_address: string
          dropoff_geo?: unknown
          failure_reason?: string | null
          fee_kobo?: number
          id?: string
          order_id: string
          picked_up_at?: string | null
          pickup_address?: string | null
          pickup_geo?: unknown
          rider_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          confirmation_code_hash?: string | null
          confirmed_by?: string | null
          created_at?: string
          delivered_at?: string | null
          distance_meters?: number | null
          dropoff_address?: string
          dropoff_geo?: unknown
          failure_reason?: string | null
          fee_kobo?: number
          id?: string
          order_id?: string
          picked_up_at?: string | null
          pickup_address?: string | null
          pickup_geo?: unknown
          rider_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_offers: {
        Row: {
          delivery_id: string
          expires_at: string
          id: string
          offered_at: string
          responded_at: string | null
          rider_id: string
          status: string
        }
        Insert: {
          delivery_id: string
          expires_at?: string
          id?: string
          offered_at?: string
          responded_at?: string | null
          rider_id: string
          status?: string
        }
        Update: {
          delivery_id?: string
          expires_at?: string
          id?: string
          offered_at?: string
          responded_at?: string | null
          rider_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_offers_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "active_delivery_positions"
            referencedColumns: ["delivery_id"]
          },
          {
            foreignKeyName: "delivery_offers_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_offers_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          dispute_id: string
          id: string
          is_internal: boolean
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          dispute_id: string
          id?: string
          is_internal?: boolean
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          dispute_id?: string
          id?: string
          is_internal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "dispute_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_messages_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          against_id: string | null
          assigned_to: string | null
          booking_id: string | null
          category: string
          code: string
          created_at: string
          id: string
          internal_notes: string | null
          order_id: string | null
          raised_by: string
          refund_kobo: number | null
          request_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          against_id?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          category: string
          code: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          order_id?: string | null
          raised_by: string
          refund_kobo?: number | null
          request_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          against_id?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          category?: string
          code?: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          order_id?: string | null
          raised_by?: string
          refund_kobo?: number | null
          request_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_against_id_fkey"
            columns: ["against_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_holds: {
        Row: {
          amount_kobo: number
          booking_id: string | null
          commission_kobo: number
          created_at: string
          id: string
          order_id: string | null
          payee_id: string
          payer_id: string
          refunded_at: string | null
          release_after: string | null
          released_at: string | null
          request_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_kobo: number
          booking_id?: string | null
          commission_kobo?: number
          created_at?: string
          id?: string
          order_id?: string | null
          payee_id: string
          payer_id: string
          refunded_at?: string | null
          release_after?: string | null
          released_at?: string | null
          request_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_kobo?: number
          booking_id?: string | null
          commission_kobo?: number
          created_at?: string
          id?: string
          order_id?: string | null
          payee_id?: string
          payer_id?: string
          refunded_at?: string | null
          release_after?: string | null
          released_at?: string | null
          request_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_tiers: {
        Row: {
          created_at: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          name: string
          price_kobo: number
          quantity: number | null
          sold: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          name: string
          price_kobo: number
          quantity?: number | null
          sold?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price_kobo?: number
          quantity?: number | null
          sold?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          cover_url: string | null
          category: string | null
          description: string | null
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
          cover_url?: string | null
          category?: string | null
          description?: string | null
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
          cover_url?: string | null
          category?: string | null
          description?: string | null
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
      favorites: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          campus_ids: string[]
          enabled: boolean
          key: string
          rollout_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campus_ids?: string[]
          enabled?: boolean
          key: string
          rollout_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campus_ids?: string[]
          enabled?: boolean
          key?: string
          rollout_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
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
          lat: number | null
          lng: number | null
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
          lat?: number | null
          lng?: number | null
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
          lat?: number | null
          lng?: number | null
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
      hotspots: {
        Row: {
          lat: number | null
          lng: number | null
          address: string | null
          area: string | null
          campus_id: string | null
          category: string
          closes_at: string | null
          created_at: string
          description: string | null
          geo: unknown
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          opens_at: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          lat?: number | null
          lng?: number | null
          address?: string | null
          area?: string | null
          campus_id?: string | null
          category: string
          closes_at?: string | null
          created_at?: string
          description?: string | null
          geo?: unknown
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          opens_at?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          lat?: number | null
          lng?: number | null
          address?: string | null
          area?: string | null
          campus_id?: string | null
          category?: string
          closes_at?: string | null
          created_at?: string
          description?: string | null
          geo?: unknown
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          opens_at?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotspots_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
          vendor_category: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
          vendor_category: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          vendor_category?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_categories_vendor_category_fkey"
            columns: ["vendor_category"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "listing_categories_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          storefront_id: string | null
          archived_at: string | null
          category: string
          category_id: string | null
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
          storefront_id?: string | null
          archived_at?: string | null
          category: string
          category_id?: string | null
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
          storefront_id?: string | null
          archived_at?: string | null
          category?: string
          category_id?: string | null
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
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "listing_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          duration_ms: number | null
          file_name: string | null
          height: number | null
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          file_name?: string | null
          height?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          file_name?: string | null
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          kind: string
          sender_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
          sender_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action: string | null
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          href: string | null
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          action?: string | null
          body: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          href?: string | null
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          action?: string | null
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          href?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          storefront_id: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
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
          storefront_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
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
          storefront_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
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
      payouts: {
        Row: {
          amount_kobo: number
          bank_account_id: string | null
          created_at: string
          failure_reason: string | null
          fee_kobo: number
          id: string
          owner_id: string
          processed_at: string | null
          provider_ref: string | null
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_kobo: number
          bank_account_id?: string | null
          created_at?: string
          failure_reason?: string | null
          fee_kobo?: number
          id?: string
          owner_id: string
          processed_at?: string | null
          provider_ref?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_kobo?: number
          bank_account_id?: string | null
          created_at?: string
          failure_reason?: string | null
          fee_kobo?: number
          id?: string
          owner_id?: string
          processed_at?: string | null
          provider_ref?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          interval: string
          is_active: boolean
          max_listings: number | null
          name: string
          price_kobo: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          max_listings?: number | null
          name: string
          price_kobo: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          max_listings?: number | null
          name?: string
          price_kobo?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          amount_kobo: number
          bank_account_id: string
          failure_reason: string | null
          id: string
          owner_id: string
          requested_at: string
          settled_at: string | null
          status: string
          transfer_code: string | null
          updated_at: string
        }
        Insert: {
          amount_kobo: number
          bank_account_id: string
          failure_reason?: string | null
          id?: string
          owner_id: string
          requested_at?: string
          settled_at?: string | null
          status?: string
          transfer_code?: string | null
          updated_at?: string
        }
        Update: {
          amount_kobo?: number
          bank_account_id?: string
          failure_reason?: string | null
          id?: string
          owner_id?: string
          requested_at?: string
          settled_at?: string | null
          status?: string
          transfer_code?: string | null
          updated_at?: string
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "profiles_vendor_category_fkey"
            columns: ["vendor_category"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["slug"]
          },
        ]
      }
      promotions: {
        Row: {
          code: string | null
          created_at: string
          daily_budget_kobo: number | null
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          listing_id: string | null
          max_redemptions: number | null
          min_order_kobo: number
          name: string
          promotion_type: string | null
          redemption_count: number
          starts_at: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          daily_budget_kobo?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          listing_id?: string | null
          max_redemptions?: number | null
          min_order_kobo?: number
          name: string
          promotion_type?: string | null
          redemption_count?: number
          starts_at?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          daily_budget_kobo?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          listing_id?: string | null
          max_redemptions?: number | null
          min_order_kobo?: number
          name?: string
          promotion_type?: string | null
          redemption_count?: number
          starts_at?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          entity_id: string
          entity_type: string
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          entity_id: string
          entity_type: string
          id?: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          hidden_at: string | null
          hidden_reason: string | null
          id: string
          rating: number
          replied_at: string | null
          source_id: string
          source_type: string
          subject_id: string
          subject_type: string
          title: string | null
          updated_at: string
          vendor_reply: string | null
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          rating: number
          replied_at?: string | null
          source_id: string
          source_type: string
          subject_id: string
          subject_type: string
          title?: string | null
          updated_at?: string
          vendor_reply?: string | null
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          id?: string
          rating?: number
          replied_at?: string | null
          source_id?: string
          source_type?: string
          subject_id?: string
          subject_type?: string
          title?: string | null
          updated_at?: string
          vendor_reply?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_profiles: {
        Row: {
          archived_at: string | null
          campus_id: string | null
          created_at: string
          current_geo: unknown
          deliveries_count: number
          id: string
          is_online: boolean
          last_seen_at: string | null
          plate_number: string | null
          rating_avg: number
          rating_count: number
          updated_at: string
          vehicle_type: string
          verification_status: string
        }
        Insert: {
          archived_at?: string | null
          campus_id?: string | null
          created_at?: string
          current_geo?: unknown
          deliveries_count?: number
          id: string
          is_online?: boolean
          last_seen_at?: string | null
          plate_number?: string | null
          rating_avg?: number
          rating_count?: number
          updated_at?: string
          vehicle_type?: string
          verification_status?: string
        }
        Update: {
          archived_at?: string | null
          campus_id?: string | null
          created_at?: string
          current_geo?: unknown
          deliveries_count?: number
          id?: string
          is_online?: boolean
          last_seen_at?: string | null
          plate_number?: string | null
          rating_avg?: number
          rating_count?: number
          updated_at?: string
          vehicle_type?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_profiles_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      service_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
          vertical: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
          vertical: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          vertical?: string
        }
        Relationships: []
      }
      service_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          request_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          request_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          address: string | null
          agreed_kobo: number | null
          area: string | null
          cancel_reason: string | null
          code: string
          completed_at: string | null
          created_at: string
          geo: unknown
          id: string
          notes: string | null
          quantity: number | null
          quoted_kobo: number | null
          scheduled_for: string | null
          service_id: string | null
          status: string
          student_id: string
          unit_label: string | null
          updated_at: string
          vendor_id: string
          vertical: string
        }
        Insert: {
          address?: string | null
          agreed_kobo?: number | null
          area?: string | null
          cancel_reason?: string | null
          code: string
          completed_at?: string | null
          created_at?: string
          geo?: unknown
          id?: string
          notes?: string | null
          quantity?: number | null
          quoted_kobo?: number | null
          scheduled_for?: string | null
          service_id?: string | null
          status?: string
          student_id: string
          unit_label?: string | null
          updated_at?: string
          vendor_id: string
          vertical: string
        }
        Update: {
          address?: string | null
          agreed_kobo?: number | null
          area?: string | null
          cancel_reason?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          geo?: unknown
          id?: string
          notes?: string | null
          quantity?: number | null
          quoted_kobo?: number | null
          scheduled_for?: string | null
          service_id?: string | null
          status?: string
          student_id?: string
          unit_label?: string | null
          updated_at?: string
          vendor_id?: string
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          archived_at: string | null
          category_id: string | null
          created_at: string
          description: string | null
          duration_mins: number | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_kobo: number | null
          pricing_model: string
          unit_label: string | null
          updated_at: string
          vendor_id: string
          vertical: string
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_mins?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_kobo?: number | null
          pricing_model?: string
          unit_label?: string | null
          updated_at?: string
          vendor_id: string
          vertical: string
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_mins?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_kobo?: number | null
          pricing_model?: string
          unit_label?: string | null
          updated_at?: string
          vendor_id?: string
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          provider_ref: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id: string
          provider_ref?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          provider_ref?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
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
      vendor_categories: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      vendor_profiles: {
        Row: {
          archived_at: string | null
          area: string | null
          bio: string | null
          business_address: string | null
          business_name: string
          campus_id: string | null
          category: string
          closes_at: string | null
          cover_url: string | null
          created_at: string
          geo: unknown
          id: string
          is_accepting_orders: boolean
          logo_url: string | null
          opens_at: string | null
          public_phone: string | null
          rating_avg: number
          rating_count: number
          slug: string
          tagline: string | null
          trade: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          archived_at?: string | null
          area?: string | null
          bio?: string | null
          business_address?: string | null
          business_name: string
          campus_id?: string | null
          category: string
          closes_at?: string | null
          cover_url?: string | null
          created_at?: string
          geo?: unknown
          id: string
          is_accepting_orders?: boolean
          logo_url?: string | null
          opens_at?: string | null
          public_phone?: string | null
          rating_avg?: number
          rating_count?: number
          slug: string
          tagline?: string | null
          trade?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          archived_at?: string | null
          area?: string | null
          bio?: string | null
          business_address?: string | null
          business_name?: string
          campus_id?: string | null
          category?: string
          closes_at?: string | null
          cover_url?: string | null
          created_at?: string
          geo?: unknown
          id?: string
          is_accepting_orders?: boolean
          logo_url?: string | null
          opens_at?: string | null
          public_phone?: string | null
          rating_avg?: number
          rating_count?: number
          slug?: string
          tagline?: string | null
          trade?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_profiles_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_profiles_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "vendor_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_documents: {
        Row: {
          action_message: string | null
          created_at: string
          doc_type: string
          id: string
          owner_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          title: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          action_message?: string | null
          created_at?: string
          doc_type: string
          id?: string
          owner_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          title: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          action_message?: string | null
          created_at?: string
          doc_type?: string
          id?: string
          owner_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance_kobo: number
          created_at: string
          currency: string
          frozen_reason: string | null
          id: string
          is_frozen: boolean
          owner_id: string
          pending_kobo: number
          updated_at: string
        }
        Insert: {
          balance_kobo?: number
          created_at?: string
          currency?: string
          frozen_reason?: string | null
          id?: string
          is_frozen?: boolean
          owner_id: string
          pending_kobo?: number
          updated_at?: string
        }
        Update: {
          balance_kobo?: number
          created_at?: string
          currency?: string
          frozen_reason?: string | null
          id?: string
          is_frozen?: boolean
          owner_id?: string
          pending_kobo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_delivery_positions: {
        Row: {
          current_geo: unknown
          delivery_id: string | null
          last_seen_at: string | null
          order_id: string | null
          rider_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      wallet_transactions: {
        Row: {
          amount_kobo: number | null
          created_at: string | null
          direction: string | null
          id: number | null
          kind: string | null
          narrative: string | null
          order_id: string | null
          owner_id: string | null
          reference: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      request_withdrawal: {
        Args: { p_amount_kobo: number; p_bank_account_id: string }
        Returns: string
      }
      cancel_withdrawal: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      settle_payout: {
        Args: {
          p_request_id: string
          p_status: string
          p_transfer_code?: string
          p_failure_reason?: string
        }
        Returns: string
      }
      switch_role: {
        Args: { p_role: string }
        Returns: string
      }
      claim_role: {
        Args: { p_role: string }
        Returns: string[]
      }
      campus_pulse: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: string
      }
      pause_store: {
        Args: { p_storefront_id: string; p_minutes?: number }
        Returns: string
      }
      resume_store: {
        Args: { p_storefront_id: string }
        Returns: undefined
      }
      store_accepting_orders: {
        Args: { p_storefront_id: string }
        Returns: boolean
      }
      store_price: {
        Args: { p_storefront_id: string; p_listing_id: string }
        Returns: number
      }
      my_revenue_series: {
        Args: { p_period?: string }
        Returns: Json
      }
      admin_overview: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_analytics: {
        Args: { p_days?: number }
        Returns: Json
      }
      accept_delivery_offer: {
        Args: { p_offer_id: string }
        Returns: {
          accepted: boolean
          delivery_id: string
          reason: string
        }[]
      }
      auth_role: { Args: never; Returns: string }
      checkout_cart: {
        Args: {
          p_cart_id: string
          p_delivery_address: string
          p_note?: string
          p_promotion_code?: string
        }
        Returns: {
          order_id: string
          repriced: boolean
          total_kobo: number
        }[]
      }
      create_admin: {
        Args: { p_email: string; p_role: string }
        Returns: string
      }
      current_app_role: { Args: never; Returns: string }
      expire_stale_holds: { Args: never; Returns: number }
      get_unread_counts: {
        Args: never
        Returns: {
          messages: number
          notifications: number
        }[]
      }
      has_role: { Args: { roles: string[] }; Returns: boolean }
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
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      login_method: { Args: { p_email: string }; Returns: string }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      max_holds_per_student: { Args: never; Returns: number }
      open_order_conversation: { Args: { p_order_id: string }; Returns: string }
      open_listing_conversation: { Args: { p_listing_id: string }; Returns: string }
      pay_order_from_wallet: { Args: { p_order_id: string }; Returns: string }
      subscribe_to_plan: { Args: { p_plan_id: string }; Returns: string }
      release_matured_escrow: {
        Args: { p_limit?: number }
        Returns: { order_id: string; transaction_id: string | null }[]
      }
      resolve_dispute: {
        Args: {
          p_dispute_id: string
          p_resolution: string
          p_refund_kobo?: number
          p_notes?: string
        }
        Returns: string
      }
      purchase_tickets: {
        Args: { p_tier_id: string; p_quantity?: number; p_reference?: string }
        Returns: string[]
      }
      release_order_escrow: { Args: { p_order_id: string }; Returns: string }
      credit_wallet_topup: {
        Args: { p_user_id: string; p_amount_kobo: number; p_reference: string }
        Returns: string
      }
      open_booking_conversation: { Args: { p_booking_id: string }; Returns: string }
      open_hostel_conversation: { Args: { p_hostel_id: string }; Returns: string }
      open_service_conversation: { Args: { p_request_id: string }; Returns: string }
      open_delivery_conversation: { Args: { p_order_id: string }; Returns: string }
      set_primary_storefront: { Args: { p_storefront_id: string }; Returns: undefined }
      revoke_storefront_staff: { Args: { p_staff_id: string }; Returns: undefined }
      accept_storefront_invite: { Args: { p_token: string }; Returns: string }
      create_storefront_invite: {
        Args: { p_storefront_id: string; p_email: string; p_role?: string }
        Returns: { invite_id: string; token: string; expires_at: string }[]
      }
      storefront_roster: {
        Args: { p_storefront_id?: string }
        Returns: {
          staff_id: string
          storefront_id: string
          branch_name: string
          user_id: string
          full_name: string | null
          email: string | null
          role: string
          joined_at: string
          revoked_at: string | null
          is_active: boolean
        }[]
      }
      storefront_invites_pending: {
        Args: { p_storefront_id?: string }
        Returns: {
          invite_id: string
          storefront_id: string
          branch_name: string
          email: string
          role: string
          invited_at: string
          expires_at: string
          is_expired: boolean
        }[]
      }
      storefront_activity: {
        Args: { p_storefront_id?: string; p_limit?: number }
        Returns: {
          occurred_at: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          action: string
          entity_type: string
          entity_id: string | null
          storefront_id: string
          summary: Json
        }[]
      }
      nearby_storefronts: {
        Args: {
          p_lat: number
          p_lng: number
          p_radius_m?: number
          p_category?: string
          p_limit?: number
        }
        Returns: {
          id: string
          vendor_id: string
          name: string
          slug: string
          area: string | null
          address: string | null
          lat: number | null
          lng: number | null
          opens_at: string | null
          closes_at: string | null
          is_accepting_orders: boolean
          is_primary: boolean
          business_name: string | null
          logo_url: string | null
          category: string | null
          rating_avg: number
          rating_count: number
          distance_m: number | null
        }[]
      }
      conversation_counterparties: {
        Args: { p_conversation_ids?: string[] }
        Returns: {
          conversation_id: string
          user_id: string
          full_name: string | null
          business_name: string | null
          logo_url: string | null
        }[]
      }
      promote_to_admin: {
        Args: { p_email: string; p_role: string }
        Returns: string
      }
      submit_review: {
        Args: {
          p_body?: string
          p_rating: number
          p_source_id: string
          p_source_type: string
          p_subject_id: string
          p_subject_type: string
          p_title?: string
        }
        Returns: string
      }
      toggle_favorite: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
      vendor_earnings_summary: {
        Args: never
        Returns: {
          available_kobo: number
          lifetime_kobo: number
          orders_count: number
          pending_kobo: number
          total_payouts: number
          withdrawn_kobo: number
        }[]
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

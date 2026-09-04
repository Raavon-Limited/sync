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
      access_grants: {
        Row: {
          area: string
          level: string
          role_id: string
        }
        Insert: {
          area: string
          level: string
          role_id: string
        }
        Update: {
          area?: string
          level?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_members: {
        Row: {
          granted_at: string
          granted_by: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_members_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          scope: string
          storefront_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          scope: string
          storefront_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          scope?: string
          storefront_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_roles_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
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
      agent_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          campus_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          campus_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          campus_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_invites_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_invites_invited_by_fkey"
            columns: ["invited_by"]
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
          campus_id: string | null
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
          campus_id?: string | null
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
          campus_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "areas_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
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
          address: string | null
          area: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_serviced: boolean
          lat: number | null
          lng: number | null
          name: string
          sort_order: number
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          area?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_serviced?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          area?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_serviced?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_area_fkey"
            columns: ["area"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["name"]
          },
        ]
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
      carts: {
        Row: {
          created_at: string
          id: string
          status: string
          storefront_id: string
          student_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          storefront_id: string
          student_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          storefront_id?: string
          student_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
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
          platform_fee_kobo: number
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
          platform_fee_kobo?: number
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
          platform_fee_kobo?: number
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
          event_id: string | null
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
          event_id?: string | null
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
          event_id?: string | null
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
            foreignKeyName: "disputes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
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
      email_log: {
        Row: {
          batch_id: string | null
          created_at: string
          email: string
          id: string
          kind: string
          recipient_id: string | null
          sent_by: string | null
          subject: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          email: string
          id?: string
          kind: string
          recipient_id?: string | null
          sent_by?: string | null
          subject: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          email?: string
          id?: string
          kind?: string
          recipient_id?: string | null
          sent_by?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_sent_by_fkey"
            columns: ["sent_by"]
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
          delivery_id: string | null
          event_id: string | null
          id: string
          inspection_id: string | null
          order_id: string | null
          payee_id: string | null
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
          delivery_id?: string | null
          event_id?: string | null
          id?: string
          inspection_id?: string | null
          order_id?: string | null
          payee_id?: string | null
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
          delivery_id?: string | null
          event_id?: string | null
          id?: string
          inspection_id?: string | null
          order_id?: string | null
          payee_id?: string | null
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
            foreignKeyName: "escrow_holds_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "active_delivery_positions"
            referencedColumns: ["delivery_id"]
          },
          {
            foreignKeyName: "escrow_holds_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "hostel_inspections"
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
          category: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          fee_mode: string
          geo: unknown
          id: string
          name: string
          organizer_id: string | null
          slug: string
          starts_at: string
          venue: string | null
        }
        Insert: {
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          fee_mode?: string
          geo?: unknown
          id?: string
          name: string
          organizer_id?: string | null
          slug: string
          starts_at: string
          venue?: string | null
        }
        Update: {
          category?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          fee_mode?: string
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
          kind: string
          position: number
          url: string
        }
        Insert: {
          created_at?: string
          hostel_id: string
          id?: string
          kind?: string
          position?: number
          url: string
        }
        Update: {
          created_at?: string
          hostel_id?: string
          id?: string
          kind?: string
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
          dispute_reason: string | null
          disputed_at: string | null
          fee_kobo: number
          full_name: string
          hostel_id: string
          id: string
          meeting_point: string | null
          outcome: string | null
          paid_at: string | null
          payment_reference: string | null
          phone: string
          report_filed_at: string | null
          report_notes: string | null
          reschedule_count: number
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
          dispute_reason?: string | null
          disputed_at?: string | null
          fee_kobo: number
          full_name: string
          hostel_id: string
          id?: string
          meeting_point?: string | null
          outcome?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          phone: string
          report_filed_at?: string | null
          report_notes?: string | null
          reschedule_count?: number
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
          dispute_reason?: string | null
          disputed_at?: string | null
          fee_kobo?: number
          full_name?: string
          hostel_id?: string
          id?: string
          meeting_point?: string | null
          outcome?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          phone?: string
          report_filed_at?: string | null
          report_notes?: string | null
          reschedule_count?: number
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
      hostels: {
        Row: {
          address: string | null
          amenities: string[]
          archived_at: string | null
          area: string
          campus: string
          created_at: string
          description: string | null
          distance_minutes: number | null
          fee_mode: string
          geo: unknown
          house_rules: string[]
          id: string
          inspection_fee_kobo: number
          landlord_id: string
          landmark: string | null
          lat: number | null
          lng: number | null
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
          description?: string | null
          distance_minutes?: number | null
          fee_mode?: string
          geo?: unknown
          house_rules?: string[]
          id?: string
          inspection_fee_kobo?: number
          landlord_id: string
          landmark?: string | null
          lat?: number | null
          lng?: number | null
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
          description?: string | null
          distance_minutes?: number | null
          fee_mode?: string
          geo?: unknown
          house_rules?: string[]
          id?: string
          inspection_fee_kobo?: number
          landlord_id?: string
          landmark?: string | null
          lat?: number | null
          lng?: number | null
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
          {
            foreignKeyName: "hostels_room_type_fkey"
            columns: ["room_type"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["name"]
          },
        ]
      }
      hotspots: {
        Row: {
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
          lat: number | null
          lng: number | null
          name: string
          opens_at: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
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
          lat?: number | null
          lng?: number | null
          name: string
          opens_at?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
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
          lat?: number | null
          lng?: number | null
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
      inspection_claims: {
        Row: {
          agent_id: string
          claimed_at: string
          id: string
          inspection_id: string
          release_reason: string | null
          released_at: string | null
          status: string
        }
        Insert: {
          agent_id: string
          claimed_at?: string
          id?: string
          inspection_id: string
          release_reason?: string | null
          released_at?: string | null
          status?: string
        }
        Update: {
          agent_id?: string
          claimed_at?: string
          id?: string
          inspection_id?: string
          release_reason?: string | null
          released_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_claims_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_claims_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "hostel_inspections"
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
          storefront_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
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
          storefront_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
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
          storefront_id?: string
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
            foreignKeyName: "listings_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
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
      logistics_companies: {
        Row: {
          archived_at: string | null
          business_address: string | null
          campus_id: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string
          verification_blocked_at: string | null
          verification_blocked_reason: string | null
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          archived_at?: string | null
          business_address?: string | null
          campus_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string
          verification_blocked_at?: string | null
          verification_blocked_reason?: string | null
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          archived_at?: string | null
          business_address?: string | null
          campus_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string
          verification_blocked_at?: string | null
          verification_blocked_reason?: string | null
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logistics_companies_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_companies_owner_id_fkey"
            columns: ["owner_id"]
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
          storefront_id: string | null
          student_id: string
          subtotal_kobo: number
          sync_fee_kobo: number
          total_kobo: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
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
          storefront_id?: string | null
          student_id: string
          subtotal_kobo?: number
          sync_fee_kobo?: number
          total_kobo?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
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
          storefront_id?: string | null
          student_id?: string
          subtotal_kobo?: number
          sync_fee_kobo?: number
          total_kobo?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
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
        Relationships: [
          {
            foreignKeyName: "payout_requests_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_owner_id_fkey"
            columns: ["owner_id"]
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
          ai_replies: string
          boost_percent: number
          code: string
          created_at: string
          description: string | null
          dispute_support: string
          features: Json
          id: string
          interval: string
          is_active: boolean
          max_listings: number | null
          max_stores: number | null
          max_team: number | null
          name: string
          price_kobo: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          ai_replies?: string
          boost_percent?: number
          code: string
          created_at?: string
          description?: string | null
          dispute_support?: string
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          max_listings?: number | null
          max_stores?: number | null
          max_team?: number | null
          name: string
          price_kobo: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          ai_replies?: string
          boost_percent?: number
          code?: string
          created_at?: string
          description?: string | null
          dispute_support?: string
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          max_listings?: number | null
          max_stores?: number | null
          max_team?: number | null
          name?: string
          price_kobo?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          avatar_url: string | null
          business_address: string | null
          business_name: string | null
          campus_id: string | null
          campus_other: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: string
          roles: string[]
          sells: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          trade: string | null
          updated_at: string
          vendor_category: string | null
          verification_status: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          avatar_url?: string | null
          business_address?: string | null
          business_name?: string | null
          campus_id?: string | null
          campus_other?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string
          roles?: string[]
          sells?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          trade?: string | null
          updated_at?: string
          vendor_category?: string | null
          verification_status?: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          avatar_url?: string | null
          business_address?: string | null
          business_name?: string | null
          campus_id?: string | null
          campus_other?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          roles?: string[]
          sells?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          trade?: string | null
          updated_at?: string
          vendor_category?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          company_id: string | null
          created_at: string
          current_geo: unknown
          deliveries_count: number
          id: string
          is_online: boolean
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          plate_number: string | null
          rating_avg: number
          rating_count: number
          updated_at: string
          vehicle_type: string
          verification_blocked_at: string | null
          verification_blocked_reason: string | null
          verification_status: string
        }
        Insert: {
          archived_at?: string | null
          campus_id?: string | null
          company_id?: string | null
          created_at?: string
          current_geo?: unknown
          deliveries_count?: number
          id: string
          is_online?: boolean
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          plate_number?: string | null
          rating_avg?: number
          rating_count?: number
          updated_at?: string
          vehicle_type?: string
          verification_blocked_at?: string | null
          verification_blocked_reason?: string | null
          verification_status?: string
        }
        Update: {
          archived_at?: string | null
          campus_id?: string | null
          company_id?: string | null
          created_at?: string
          current_geo?: unknown
          deliveries_count?: number
          id?: string
          is_online?: boolean
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          plate_number?: string | null
          rating_avg?: number
          rating_count?: number
          updated_at?: string
          vehicle_type?: string
          verification_blocked_at?: string | null
          verification_blocked_reason?: string | null
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
            foreignKeyName: "rider_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "logistics_companies"
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
      room_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
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
      staff_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          role_id: string | null
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
          role_id?: string | null
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
          role_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "access_roles"
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
          scopes: string[]
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
          scopes?: string[]
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
          scopes?: string[]
          storefront_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          is_available: boolean | null
          is_listed: boolean
          listing_id: string
          price_kobo: number | null
          stock: number | null
          storefront_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_available?: boolean | null
          is_listed?: boolean
          listing_id: string
          price_kobo?: number | null
          stock?: number | null
          storefront_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_available?: boolean | null
          is_listed?: boolean
          listing_id?: string
          price_kobo?: number | null
          stock?: number | null
          storefront_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_listings_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_staff: {
        Row: {
          access_role_id: string | null
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string
          revoked_at: string | null
          role: string
          scopes: string[]
          storefront_id: string
          user_id: string
        }
        Insert: {
          access_role_id?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          revoked_at?: string | null
          role?: string
          scopes?: string[]
          storefront_id: string
          user_id: string
        }
        Update: {
          access_role_id?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          revoked_at?: string | null
          role?: string
          scopes?: string[]
          storefront_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_staff_access_role_id_fkey"
            columns: ["access_role_id"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_staff_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_staff_storefront_id_fkey"
            columns: ["storefront_id"]
            isOneToOne: false
            referencedRelation: "storefronts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storefronts: {
        Row: {
          address: string | null
          archived_at: string | null
          area: string | null
          auto_pause_after: number
          auto_pause_minutes: number
          campus_id: string | null
          closes_at: string | null
          created_at: string
          geo: unknown
          id: string
          image_url: string | null
          is_accepting_orders: boolean
          is_primary: boolean
          lat: number | null
          lng: number | null
          name: string
          opens_at: string | null
          pause_reason: string | null
          paused_until: string | null
          public_phone: string | null
          slug: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          area?: string | null
          auto_pause_after?: number
          auto_pause_minutes?: number
          campus_id?: string | null
          closes_at?: string | null
          created_at?: string
          geo?: unknown
          id?: string
          image_url?: string | null
          is_accepting_orders?: boolean
          is_primary?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          opens_at?: string | null
          pause_reason?: string | null
          paused_until?: string | null
          public_phone?: string | null
          slug: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          area?: string | null
          auto_pause_after?: number
          auto_pause_minutes?: number
          campus_id?: string | null
          closes_at?: string | null
          created_at?: string
          geo?: unknown
          id?: string
          image_url?: string | null
          is_accepting_orders?: boolean
          is_primary?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          opens_at?: string | null
          pause_reason?: string | null
          paused_until?: string | null
          public_phone?: string | null
          slug?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefronts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefronts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          created_at: string
          department: string | null
          id: string
          level: string | null
          matric_number: string | null
          updated_at: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          id: string
          level?: string | null
          matric_number?: string | null
          updated_at?: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          id?: string
          level?: string | null
          matric_number?: string | null
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
      testimonials: {
        Row: {
          author_id: string
          body: string
          created_at: string
          detail: string | null
          display_name: string | null
          id: string
          rating: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          detail?: string | null
          display_name?: string | null
          id?: string
          rating: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          detail?: string | null
          display_name?: string | null
          id?: string
          rating?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonials_reviewed_by_fkey"
            columns: ["reviewed_by"]
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
          verification_blocked_at: string | null
          verification_blocked_reason: string | null
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
          verification_blocked_at?: string | null
          verification_blocked_reason?: string | null
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
          verification_blocked_at?: string | null
          verification_blocked_reason?: string | null
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
          doc_subtype: string | null
          doc_type: string
          file_purged_at: string | null
          id: string
          owner_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          role: string | null
          status: string
          storage_path: string
          title: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          action_message?: string | null
          created_at?: string
          doc_subtype?: string | null
          doc_type: string
          file_purged_at?: string | null
          id?: string
          owner_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: string | null
          status?: string
          storage_path: string
          title: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          action_message?: string | null
          created_at?: string
          doc_subtype?: string | null
          doc_type?: string
          file_purged_at?: string | null
          id?: string
          owner_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: string | null
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
      verification_visits: {
        Row: {
          ambassador_id: string | null
          assigned_at: string | null
          assigned_by: string | null
          brief: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          hostel_id: string | null
          id: string
          meet_user_id: string | null
          notes: string | null
          photos: string[]
          scheduled_for: string | null
          selfie_url: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          vendor_id: string | null
          video_url: string | null
        }
        Insert: {
          ambassador_id?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          brief?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          hostel_id?: string | null
          id?: string
          meet_user_id?: string | null
          notes?: string | null
          photos?: string[]
          scheduled_for?: string | null
          selfie_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          vendor_id?: string | null
          video_url?: string | null
        }
        Update: {
          ambassador_id?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          brief?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          hostel_id?: string | null
          id?: string
          meet_user_id?: string | null
          notes?: string | null
          photos?: string[]
          scheduled_for?: string | null
          selfie_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          vendor_id?: string | null
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
          {
            foreignKeyName: "verification_visits_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_visits_meet_user_id_fkey"
            columns: ["meet_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_visits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
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
          delivery_id: string | null
          last_seen_at: string | null
          lat: number | null
          lng: number | null
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
      accept_agent_invite: { Args: { p_token: string }; Returns: string }
      accept_delivery_offer: {
        Args: { p_offer_id: string }
        Returns: {
          accepted: boolean
          delivery_id: string
          reason: string
        }[]
      }
      accept_staff_invite: { Args: { p_token: string }; Returns: string }
      accept_storefront_invite: { Args: { p_token: string }; Returns: string }
      access_level: {
        Args: { p_area: string; p_storefront?: string }
        Returns: string
      }
      admin_analytics: { Args: { p_days?: number }; Returns: Json }
      admin_overview: { Args: never; Returns: Json }
      admin_revenue: { Args: { p_from?: string; p_to?: string }; Returns: Json }
      advance_delivery: {
        Args: { p_delivery_id: string; p_status: string }
        Returns: string
      }
      agent_activity: {
        Args: { p_agent: string; p_limit?: number }
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          actor_role: string
          by_agent: boolean
          entity_id: string
          entity_type: string
          occurred_at: string
          summary: Json
        }[]
      }
      assign_access_role: {
        Args: { p_role: string; p_user: string }
        Returns: undefined
      }
      assign_inspection_agent: {
        Args: { p_agent?: string; p_inspection: string }
        Returns: string
      }
      assign_verification_visit: {
        Args: {
          p_agent: string
          p_brief?: string
          p_hostel?: string
          p_meet?: string
          p_vendor?: string
          p_when?: string
        }
        Returns: string
      }
      auth_role: { Args: never; Returns: string }
      business_role_count: { Args: { p_roles: string[] }; Returns: number }
      campus_pulse: { Args: never; Returns: Json }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: string
      }
      cancel_withdrawal: { Args: { p_request_id: string }; Returns: undefined }
      checkout_cart: {
        Args: {
          p_cart_id: string
          p_delivery_address: string
          p_dropoff_lat?: number
          p_dropoff_lng?: number
          p_note?: string
          p_promotion_code?: string
        }
        Returns: {
          order_id: string
          repriced: boolean
          total_kobo: number
        }[]
      }
      claim_business_name: { Args: { p_name: string }; Returns: string }
      claim_delivery: { Args: { p_delivery_id: string }; Returns: string }
      claim_inspection: {
        Args: { p_inspection: string; p_meeting?: string }
        Returns: string
      }
      claim_role: { Args: { p_role: string }; Returns: string[] }
      confirm_inspection_payment: {
        Args: {
          p_amount_kobo: number
          p_inspection: string
          p_reference: string
        }
        Returns: string
      }
      conversation_counterparties: {
        Args: { p_conversation_ids?: string[] }
        Returns: {
          business_name: string
          conversation_id: string
          full_name: string
          logo_url: string
          user_id: string
        }[]
      }
      create_access_role: {
        Args: {
          p_description?: string
          p_name: string
          p_scope?: string
          p_storefront?: string
        }
        Returns: string
      }
      create_admin: {
        Args: { p_email: string; p_role: string }
        Returns: string
      }
      create_agent_invite: {
        Args: { p_campus?: string; p_email: string }
        Returns: {
          invite_id: string
          invite_token: string
        }[]
      }
      create_staff_invite: {
        Args: { p_email: string; p_role?: string }
        Returns: {
          invite_id: string
          invite_token: string
        }[]
      }
      create_storefront_invite: {
        Args: {
          p_email: string
          p_role?: string
          p_scopes?: string[]
          p_storefront_id: string
        }
        Returns: {
          expires_at: string
          invite_id: string
          token: string
        }[]
      }
      credit_wallet_topup: {
        Args: { p_amount_kobo: number; p_reference: string; p_user_id: string }
        Returns: string
      }
      current_app_role: { Args: never; Returns: string }
      dispute_inspection: {
        Args: { p_inspection: string; p_reason?: string }
        Returns: string
      }
      document_retention_days: { Args: { p_doc_type: string }; Returns: number }
      documents_due_for_purge: {
        Args: never
        Returns: {
          doc_type: string
          id: string
          owner_id: string
          reviewed_at: string
          storage_path: string
        }[]
      }
      email_has_account: { Args: { p_email: string }; Returns: boolean }
      ensure_student_profile: { Args: never; Returns: string }
      ensure_vendor_profile: { Args: never; Returns: string }
      expire_stale_holds: { Args: never; Returns: number }
      file_inspection_report: {
        Args: { p_inspection: string; p_notes?: string; p_outcome?: string }
        Returns: string
      }
      flag_visit_fraud: {
        Args: { p_reason: string; p_visit: string }
        Returns: string
      }
      get_unread_counts: {
        Args: never
        Returns: {
          messages: number
          notifications: number
        }[]
      }
      has_role: { Args: { roles: string[] }; Returns: boolean }
      hold_interval: { Args: never; Returns: string }
      hostel_is_visible: { Args: { p_hostel: string }; Returns: boolean }
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
      is_super_admin: { Args: never; Returns: boolean }
      is_suspended: { Args: { p_user: string }; Returns: boolean }
      list_staff: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          last_sign_in_at: string
          role: string
        }[]
      }
      login_method: { Args: { p_email: string }; Returns: string }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      max_holds_per_student: { Args: never; Returns: number }
      my_access: {
        Args: { p_storefront?: string }
        Returns: {
          area: string
          level: string
        }[]
      }
      my_active_delivery: {
        Args: never
        Returns: {
          assigned_at: string
          customer_name: string
          customer_phone: string
          delivery_id: string
          distance_meters: number
          dropoff_address: string
          fee_kobo: number
          order_id: string
          pickup_address: string
          status: string
          vendor_name: string
          vendor_phone: string
        }[]
      }
      my_card_code: { Args: never; Returns: string }
      my_plan_usage: {
        Args: never
        Returns: {
          ai_replies: string
          boost_percent: number
          dispute_support: string
          max_listings: number
          max_stores: number
          max_team: number
          plan_code: string
          plan_name: string
          price_kobo: number
          used_listings: number
          used_stores: number
          used_team: number
        }[]
      }
      my_revenue_series: { Args: { p_period?: string }; Returns: Json }
      my_verification_code: { Args: never; Returns: string }
      naira: { Args: { p_kobo: number }; Returns: string }
      nearby_storefronts: {
        Args: {
          p_category?: string
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_m?: number
        }
        Returns: {
          address: string
          area: string
          business_name: string
          category: string
          closes_at: string
          distance_m: number
          id: string
          is_accepting_orders: boolean
          is_primary: boolean
          lat: number
          lng: number
          logo_url: string
          name: string
          opens_at: string
          rating_avg: number
          rating_count: number
          slug: string
          vendor_id: string
        }[]
      }
      open_booking_conversation: {
        Args: { p_booking_id: string }
        Returns: string
      }
      open_delivery_board: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          delivery_id: string
          distance_meters: number
          dropoff_area: string
          fee_kobo: number
          order_id: string
          pickup_address: string
          vendor_name: string
        }[]
      }
      open_delivery_conversation: {
        Args: { p_order_id: string }
        Returns: string
      }
      open_hostel_conversation: {
        Args: { p_hostel_id: string }
        Returns: string
      }
      open_inspection_board: {
        Args: { p_limit?: number }
        Returns: {
          area: string
          claimed_before: boolean
          fee_kobo: number
          hostel_id: string
          hostel_name: string
          inspection_id: string
          scheduled_for: string
        }[]
      }
      open_listing_conversation: {
        Args: { p_listing_id: string }
        Returns: string
      }
      open_order_conversation: { Args: { p_order_id: string }; Returns: string }
      open_service_conversation: {
        Args: { p_request_id: string }
        Returns: string
      }
      pause_store: {
        Args: { p_minutes?: number; p_storefront_id: string }
        Returns: string
      }
      pay_order_from_wallet: { Args: { p_order_id: string }; Returns: string }
      promote_to_admin: {
        Args: { p_email: string; p_role: string }
        Returns: string
      }
      purchase_tickets: {
        Args: { p_quantity?: number; p_reference?: string; p_tier_id: string }
        Returns: string[]
      }
      quote_delivery: {
        Args: { p_lat: number; p_lng: number; p_storefront: string }
        Returns: {
          distance_meters: number
          fee_kobo: number
        }[]
      }
      quote_rent: {
        Args: { p_hostel: string }
        Returns: {
          fee_kobo: number
          fee_mode: string
          rent_kobo: number
          total_kobo: number
        }[]
      }
      quote_tickets: {
        Args: { p_quantity?: number; p_tier_id: string }
        Returns: {
          fee_kobo: number
          fee_mode: string
          gross_kobo: number
          total_kobo: number
        }[]
      }
      reassign_verification_visit: {
        Args: { p_agent?: string; p_visit: string }
        Returns: string
      }
      release_delivery_escrow: {
        Args: { p_delivery_id: string }
        Returns: string
      }
      release_event_escrow: { Args: { p_event: string }; Returns: number }
      release_inspection_claim: {
        Args: { p_inspection: string; p_reason?: string }
        Returns: string
      }
      release_matured_escrow: {
        Args: { p_limit?: number }
        Returns: {
          order_id: string
          transaction_id: string
        }[]
      }
      release_order_escrow: { Args: { p_order_id: string }; Returns: string }
      request_withdrawal: {
        Args: { p_amount_kobo: number; p_bank_account_id: string }
        Returns: string
      }
      reschedule_inspection: {
        Args: { p_inspection: string; p_new_time: string }
        Returns: number
      }
      resolve_dispute: {
        Args: {
          p_dispute_id: string
          p_notes?: string
          p_refund_kobo?: number
          p_resolution: string
        }
        Returns: string
      }
      resume_store: { Args: { p_storefront_id: string }; Returns: undefined }
      revoke_access_role: {
        Args: { p_role: string; p_user: string }
        Returns: undefined
      }
      revoke_agent_invite: { Args: { p_id: string }; Returns: undefined }
      revoke_staff_invite: { Args: { p_id: string }; Returns: undefined }
      revoke_storefront_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      revoke_storefront_staff: {
        Args: { p_staff_id: string }
        Returns: undefined
      }
      rotate_card_code: { Args: never; Returns: string }
      rotate_verification_code: { Args: never; Returns: string }
      save_onboarding_business: {
        Args: {
          p_area?: string
          p_bio?: string
          p_business_address?: string
          p_business_name: string
          p_phone?: string
        }
        Returns: undefined
      }
      save_student_identity: {
        Args: { p_department: string; p_level?: string; p_matric: string }
        Returns: undefined
      }
      set_account_role: {
        Args: { p_role: string; p_user: string }
        Returns: string
      }
      set_account_suspension: {
        Args: { p_reason?: string; p_suspended: boolean; p_user: string }
        Returns: boolean
      }
      set_company_verification: {
        Args: { p_company: string; p_permanent?: boolean; p_status: string }
        Returns: string
      }
      set_event_fee_mode: {
        Args: { p_event: string; p_mode: string }
        Returns: string
      }
      set_hostel_fee_mode: {
        Args: { p_hostel: string; p_mode: string }
        Returns: string
      }
      set_inspection_meeting_point: {
        Args: { p_inspection: string; p_point: string }
        Returns: string
      }
      set_personal_verification: {
        Args: { p_status: string; p_user: string }
        Returns: string
      }
      set_primary_storefront: {
        Args: { p_storefront_id: string }
        Returns: undefined
      }
      set_rider_company: {
        Args: { p_company: string; p_rider: string }
        Returns: string
      }
      set_rider_online: { Args: { p_online: boolean }; Returns: boolean }
      set_rider_verification: {
        Args: { p_permanent?: boolean; p_rider: string; p_status: string }
        Returns: string
      }
      set_role_grant: {
        Args: { p_area: string; p_level: string; p_role: string }
        Returns: string
      }
      set_storefront_archived: {
        Args: { p_archived: boolean; p_storefront_id: string }
        Returns: {
          address: string | null
          archived_at: string | null
          area: string | null
          auto_pause_after: number
          auto_pause_minutes: number
          campus_id: string | null
          closes_at: string | null
          created_at: string
          geo: unknown
          id: string
          image_url: string | null
          is_accepting_orders: boolean
          is_primary: boolean
          lat: number | null
          lng: number | null
          name: string
          opens_at: string | null
          pause_reason: string | null
          paused_until: string | null
          public_phone: string | null
          slug: string
          updated_at: string
          vendor_id: string
        }
        SetofOptions: {
          from: "*"
          to: "storefronts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_storefront_staff_scopes: {
        Args: { p_scopes: string[]; p_staff_id: string }
        Returns: undefined
      }
      set_student_verification: {
        Args: { p_status: string; p_user: string }
        Returns: string
      }
      set_vendor_category: {
        Args: { p_category: string; p_trade?: string }
        Returns: string
      }
      set_verification_status: {
        Args: { p_permanent?: boolean; p_status: string; p_vendor: string }
        Returns: string
      }
      settle_inspection: {
        Args: { p_inspection: string; p_outcome: string }
        Returns: string
      }
      settle_payout: {
        Args: {
          p_failure_reason?: string
          p_request_id: string
          p_status: string
          p_transfer_code?: string
        }
        Returns: string
      }
      store_accepting_orders: {
        Args: { p_storefront_id: string }
        Returns: boolean
      }
      store_performance: {
        Args: never
        Returns: {
          avg_order_kobo: number
          booked_kobo: number
          is_archived: boolean
          last_order_at: string
          orders_active: number
          orders_cancelled: number
          orders_completed: number
          orders_refunded: number
          orders_total: number
          refunded_kobo: number
          revenue_kobo: number
          store_name: string
          storefront_id: string
        }[]
      }
      store_price: {
        Args: { p_listing_id: string; p_storefront_id: string }
        Returns: number
      }
      store_revenue_monthly: {
        Args: { p_months?: number }
        Returns: {
          month: string
          orders_count: number
          revenue_kobo: number
          store_name: string
          storefront_id: string
        }[]
      }
      store_transactions: {
        Args: {
          p_bucket?: string
          p_limit?: number
          p_offset?: number
          p_storefront_id?: string
        }
        Returns: {
          delivered_at: string
          is_refunded: boolean
          item_count: number
          net_kobo: number
          order_id: string
          placed_at: string
          status: string
          store_name: string
          storefront_id: string
          student_name: string
          total_kobo: number
          total_rows: number
        }[]
      }
      storefront_activity: {
        Args: {
          p_actor_id?: string
          p_limit?: number
          p_search?: string
          p_storefront_id?: string
        }
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          actor_role: string
          entity_id: string
          entity_type: string
          occurred_at: string
          storefront_id: string
          summary: Json
        }[]
      }
      storefront_invites_pending: {
        Args: { p_storefront_id?: string }
        Returns: {
          branch_name: string
          email: string
          expires_at: string
          invite_id: string
          invited_at: string
          is_expired: boolean
          role: string
          scopes: string[]
          storefront_id: string
        }[]
      }
      storefront_roster: {
        Args: { p_storefront_id?: string }
        Returns: {
          branch_name: string
          email: string
          full_name: string
          is_active: boolean
          joined_at: string
          revoked_at: string
          role: string
          scopes: string[]
          staff_id: string
          storefront_id: string
          user_id: string
        }[]
      }
      submit_company_verification: {
        Args: { p_company: string }
        Returns: string
      }
      submit_personal_verification: { Args: never; Returns: string }
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
      submit_rider_verification: { Args: never; Returns: string }
      submit_student_verification: { Args: never; Returns: string }
      submit_verification: { Args: never; Returns: string }
      submit_verification_visit: {
        Args: {
          p_notes?: string
          p_photos?: string[]
          p_selfie?: string
          p_video?: string
          p_visit: string
        }
        Returns: string
      }
      subscribe_to_plan: { Args: { p_plan_id: string }; Returns: string }
      sweep_event_escrow: { Args: never; Returns: number }
      sweep_expired_inspection_claims: {
        Args: { p_limit?: number }
        Returns: number
      }
      switch_role: { Args: { p_role: string }; Returns: string }
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
      verify_card: {
        Args: { p_code: string }
        Returns: {
          area: string
          business_name: string
          card_kind: string
          category: string
          checked_at: string
          credentials: Json
          found: boolean
          holder_name: string
          member_since: string
          photo_url: string
          rating_avg: number
          rating_count: number
          requirements: Json
          state: string
          store_count: number
          verified_at: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

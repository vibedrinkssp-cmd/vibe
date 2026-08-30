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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          complement: string | null
          id: string
          is_default: boolean | null
          latitude: number | null
          longitude: number | null
          neighborhood: string
          notes: string | null
          number: string
          state: string
          street: string
          user_id: string
          zip_code: string | null
        }
        Insert: {
          city: string
          complement?: string | null
          id?: string
          is_default?: boolean | null
          latitude?: number | null
          longitude?: number | null
          neighborhood: string
          notes?: string | null
          number: string
          state: string
          street: string
          user_id: string
          zip_code?: string | null
        }
        Update: {
          city?: string
          complement?: string | null
          id?: string
          is_default?: boolean | null
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string
          notes?: string | null
          number?: string
          state?: string
          street?: string
          user_id?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string | null
          sort_order: number | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url?: string | null
          sort_order?: number | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string | null
          sort_order?: number | null
          title?: string
        }
        Relationships: []
      }
      caderneta_customers: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      caderneta_entries: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_paid: boolean | null
          notes: string | null
          paid_at: string | null
          product_id: string | null
          product_name: string
          quantity: number
          salesperson: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          paid_at?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          salesperson?: string | null
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          paid_at?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          salesperson?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "caderneta_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "caderneta_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caderneta_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caderneta_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      caderneta_payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          payment_method: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          payment_method?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "caderneta_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "caderneta_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          notes: string | null
          responsible: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          notes?: string | null
          responsible?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          notes?: string | null
          responsible?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      cash_register_closures: {
        Row: {
          actual_cash: number | null
          card_fees_estimate: number | null
          cash_difference: number | null
          cash_supplies: number | null
          closed_at: string | null
          closed_by: string | null
          counter_orders_count: number | null
          delivery_orders_count: number | null
          expected_cash: number | null
          gross_profit: number | null
          id: string
          net_profit: number | null
          notes: string | null
          opening_balance: number | null
          period_end: string | null
          period_start: string | null
          real_gross_profit: number | null
          session_id: string | null
          shift_type: string | null
          total_card_credit: number | null
          total_card_debit: number | null
          total_cash: number | null
          total_delivery_fees: number | null
          total_orders: number | null
          total_pix: number | null
          total_product_cost: number | null
          total_sales: number | null
          total_sangrias: number | null
        }
        Insert: {
          actual_cash?: number | null
          card_fees_estimate?: number | null
          cash_difference?: number | null
          cash_supplies?: number | null
          closed_at?: string | null
          closed_by?: string | null
          counter_orders_count?: number | null
          delivery_orders_count?: number | null
          expected_cash?: number | null
          gross_profit?: number | null
          id?: string
          net_profit?: number | null
          notes?: string | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          real_gross_profit?: number | null
          session_id?: string | null
          shift_type?: string | null
          total_card_credit?: number | null
          total_card_debit?: number | null
          total_cash?: number | null
          total_delivery_fees?: number | null
          total_orders?: number | null
          total_pix?: number | null
          total_product_cost?: number | null
          total_sales?: number | null
          total_sangrias?: number | null
        }
        Update: {
          actual_cash?: number | null
          card_fees_estimate?: number | null
          cash_difference?: number | null
          cash_supplies?: number | null
          closed_at?: string | null
          closed_by?: string | null
          counter_orders_count?: number | null
          delivery_orders_count?: number | null
          expected_cash?: number | null
          gross_profit?: number | null
          id?: string
          net_profit?: number | null
          notes?: string | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          real_gross_profit?: number | null
          session_id?: string | null
          shift_type?: string | null
          total_card_credit?: number | null
          total_card_debit?: number | null
          total_cash?: number | null
          total_delivery_fees?: number | null
          total_orders?: number | null
          total_pix?: number | null
          total_product_cost?: number | null
          total_sales?: number | null
          total_sangrias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_closures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_sessions: {
        Row: {
          cash_supplies: number | null
          closed_at: string | null
          closed_by: string | null
          closure_id: string | null
          current_balance: number
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_balance: number
          status: string
        }
        Insert: {
          cash_supplies?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closure_id?: string | null
          current_balance?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_balance?: number
          status?: string
        }
        Update: {
          cash_supplies?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closure_id?: string | null
          current_balance?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_balance?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_sessions_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "cash_register_closures"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          amount: number
          created_at: string
          fee: number
          id: string
          notes: string | null
          payment_method: string | null
          responsible: string
          session_id: string | null
          total: number
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          fee?: number
          id?: string
          notes?: string | null
          payment_method?: string | null
          responsible?: string
          session_id?: string | null
          total?: number
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee?: number
          id?: string
          notes?: string | null
          payment_method?: string | null
          responsible?: string
          session_id?: string | null
          total?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_special: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_special?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_special?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      coupons: {
        Row: {
          assign_to_all: boolean | null
          category_id: string | null
          code: string
          coupon_type: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_percent: number
          expires_at: string | null
          id: string
          is_active: boolean | null
          is_template: boolean | null
          max_discount_value: number | null
          min_quantity: number | null
          product_id: string | null
        }
        Insert: {
          assign_to_all?: boolean | null
          category_id?: string | null
          code: string
          coupon_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_percent: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_template?: boolean | null
          max_discount_value?: number | null
          min_quantity?: number | null
          product_id?: string | null
        }
        Update: {
          assign_to_all?: boolean | null
          category_id?: string | null
          code?: string
          coupon_type?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_percent?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_template?: boolean | null
          max_discount_value?: number | null
          min_quantity?: number | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      drink_fruits: {
        Row: {
          created_at: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          sort_order?: number | null
        }
        Relationships: []
      }
      employee_time_clocks: {
        Row: {
          created_at: string
          device_info: string | null
          employee_id: string
          id: string
          match_score: number | null
          photo_url: string | null
          punch_type: Database["public"]["Enums"]["punch_type"]
          punched_at: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          employee_id: string
          id?: string
          match_score?: number | null
          photo_url?: string | null
          punch_type: Database["public"]["Enums"]["punch_type"]
          punched_at?: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          employee_id?: string
          id?: string
          match_score?: number | null
          photo_url?: string | null
          punch_type?: Database["public"]["Enums"]["punch_type"]
          punched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_time_clocks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          face_descriptor: Json | null
          id: string
          is_active: boolean
          name: string
          reference_photo_url: string | null
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          face_descriptor?: Json | null
          id?: string
          is_active?: boolean
          name: string
          reference_photo_url?: string | null
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          face_descriptor?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          reference_photo_url?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      external_order_quarantine: {
        Row: {
          created_at: string
          failure_details: Json | null
          failure_reason: string
          id: string
          parsed_summary: Json | null
          platform: string
          raw_text: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          source_filename: string | null
        }
        Insert: {
          created_at?: string
          failure_details?: Json | null
          failure_reason: string
          id?: string
          parsed_summary?: Json | null
          platform: string
          raw_text: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          source_filename?: string | null
        }
        Update: {
          created_at?: string
          failure_details?: Json | null
          failure_reason?: string
          id?: string
          parsed_summary?: Json | null
          platform?: string
          raw_text?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          source_filename?: string | null
        }
        Relationships: []
      }
      geocoding_cache: {
        Row: {
          cache_key: string
          city: string | null
          components: Json | null
          created_at: string
          formatted_address: string | null
          hit_count: number
          id: string
          last_used_at: string
          latitude: number
          longitude: number
          neighborhood: string | null
          number: string | null
          query_type: string
          state: string | null
          street: string | null
          zip_code: string | null
        }
        Insert: {
          cache_key: string
          city?: string | null
          components?: Json | null
          created_at?: string
          formatted_address?: string | null
          hit_count?: number
          id?: string
          last_used_at?: string
          latitude: number
          longitude: number
          neighborhood?: string | null
          number?: string | null
          query_type: string
          state?: string | null
          street?: string | null
          zip_code?: string | null
        }
        Update: {
          cache_key?: string
          city?: string | null
          components?: Json | null
          created_at?: string
          formatted_address?: string | null
          hit_count?: number
          id?: string
          last_used_at?: string
          latitude?: number
          longitude?: number
          neighborhood?: string | null
          number?: string | null
          query_type?: string
          state?: string | null
          street?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      ifood_action_logs: {
        Row: {
          action: string
          created_at: string
          endpoint: string | null
          error_message: string | null
          http_status: number | null
          id: string
          ifood_order_id: string | null
          method: string | null
          performed_by: string | null
          request_payload: Json | null
          response_payload: Json | null
          success: boolean
        }
        Insert: {
          action: string
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          ifood_order_id?: string | null
          method?: string | null
          performed_by?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          success?: boolean
        }
        Update: {
          action?: string
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          ifood_order_id?: string | null
          method?: string | null
          performed_by?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          success?: boolean
        }
        Relationships: []
      }
      ifood_events: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          code: string
          error: string | null
          full_code: string | null
          id: string
          ifood_event_id: string
          ifood_order_id: string | null
          metadata: Json | null
          raw_event: Json | null
          received_at: string
          source: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          code: string
          error?: string | null
          full_code?: string | null
          id?: string
          ifood_event_id: string
          ifood_order_id?: string | null
          metadata?: Json | null
          raw_event?: Json | null
          received_at?: string
          source?: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          code?: string
          error?: string | null
          full_code?: string | null
          id?: string
          ifood_event_id?: string
          ifood_order_id?: string | null
          metadata?: Json | null
          raw_event?: Json | null
          received_at?: string
          source?: string
        }
        Relationships: []
      }
      ifood_orders: {
        Row: {
          benefits: Json | null
          cancellation_reason: string | null
          cancelled_at: string | null
          category: string | null
          change_for: number | null
          concluded_at: string | null
          confirmed_at: string | null
          customer_doc: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_by: string | null
          delivery_address: Json | null
          delivery_code: string | null
          delivery_code_verified_at: string | null
          delivery_fee: number | null
          discount: number | null
          dispatched_at: string | null
          display_id: string | null
          fees: Json | null
          id: string
          ifood_order_id: string
          imported_at: string
          items: Json | null
          merchant_id: string | null
          motoboy_id: string | null
          order_type: string | null
          payments: Json | null
          preparation_started_at: string | null
          raw_order: Json | null
          ready_at: string | null
          status_ifood: string
          status_vm: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          benefits?: Json | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category?: string | null
          change_for?: number | null
          concluded_at?: string | null
          confirmed_at?: string | null
          customer_doc?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_by?: string | null
          delivery_address?: Json | null
          delivery_code?: string | null
          delivery_code_verified_at?: string | null
          delivery_fee?: number | null
          discount?: number | null
          dispatched_at?: string | null
          display_id?: string | null
          fees?: Json | null
          id?: string
          ifood_order_id: string
          imported_at?: string
          items?: Json | null
          merchant_id?: string | null
          motoboy_id?: string | null
          order_type?: string | null
          payments?: Json | null
          preparation_started_at?: string | null
          raw_order?: Json | null
          ready_at?: string | null
          status_ifood?: string
          status_vm?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          benefits?: Json | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category?: string | null
          change_for?: number | null
          concluded_at?: string | null
          confirmed_at?: string | null
          customer_doc?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivered_by?: string | null
          delivery_address?: Json | null
          delivery_code?: string | null
          delivery_code_verified_at?: string | null
          delivery_fee?: number | null
          discount?: number | null
          dispatched_at?: string | null
          display_id?: string | null
          fees?: Json | null
          id?: string
          ifood_order_id?: string
          imported_at?: string
          items?: Json | null
          merchant_id?: string | null
          motoboy_id?: string | null
          order_type?: string | null
          payments?: Json | null
          preparation_started_at?: string | null
          raw_order?: Json | null
          ready_at?: string | null
          status_ifood?: string
          status_vm?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      ifood_product_aliases: {
        Row: {
          alias_normalized: string
          created_at: string
          hits: number
          id: string
          last_used_at: string
          product_id: string
        }
        Insert: {
          alias_normalized: string
          created_at?: string
          hits?: number
          id?: string
          last_used_at?: string
          product_id: string
        }
        Update: {
          alias_normalized?: string
          created_at?: string
          hits?: number
          id?: string
          last_used_at?: string
          product_id?: string
        }
        Relationships: []
      }
      ifood_test_config: {
        Row: {
          cached_token: string | null
          cached_token_expires_at: string | null
          created_at: string
          id: string
          is_enabled: boolean
          last_error: string | null
          last_error_at: string | null
          last_poll_event_count: number | null
          last_polled_at: string | null
          last_webhook_at: string | null
          merchant_id: string
          notes: string | null
          updated_at: string
          webhook_enabled: boolean
          webhook_secret: string | null
        }
        Insert: {
          cached_token?: string | null
          cached_token_expires_at?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_poll_event_count?: number | null
          last_polled_at?: string | null
          last_webhook_at?: string | null
          merchant_id: string
          notes?: string | null
          updated_at?: string
          webhook_enabled?: boolean
          webhook_secret?: string | null
        }
        Update: {
          cached_token?: string | null
          cached_token_expires_at?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_poll_event_count?: number | null
          last_polled_at?: string | null
          last_webhook_at?: string | null
          merchant_id?: string
          notes?: string | null
          updated_at?: string
          webhook_enabled?: boolean
          webhook_secret?: string | null
        }
        Relationships: []
      }
      ifood_test_events_log: {
        Row: {
          acknowledged: boolean
          error: string | null
          event_code: string
          event_id: string
          id: string
          order_id_ifood: string | null
          order_id_local: string | null
          payload: Json | null
          processed_at: string
        }
        Insert: {
          acknowledged?: boolean
          error?: string | null
          event_code: string
          event_id: string
          id?: string
          order_id_ifood?: string | null
          order_id_local?: string | null
          payload?: Json | null
          processed_at?: string
        }
        Update: {
          acknowledged?: boolean
          error?: string | null
          event_code?: string
          event_id?: string
          id?: string
          order_id_ifood?: string | null
          order_id_local?: string | null
          payload?: Json | null
          processed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ifood_test_events_log_order_id_local_fkey"
            columns: ["order_id_local"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      motoboy_cash_confirmations: {
        Row: {
          amount: number
          confirmed_at: string
          confirmed_by: string | null
          id: string
          motoboy_id: string
          notes: string | null
          order_id: string | null
          payment_method: string | null
          session_id: string | null
        }
        Insert: {
          amount?: number
          confirmed_at?: string
          confirmed_by?: string | null
          id?: string
          motoboy_id: string
          notes?: string | null
          order_id?: string | null
          payment_method?: string | null
          session_id?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string
          confirmed_by?: string | null
          id?: string
          motoboy_id?: string
          notes?: string | null
          order_id?: string | null
          payment_method?: string | null
          session_id?: string | null
        }
        Relationships: []
      }
      motoboy_locations: {
        Row: {
          created_at: string
          id: string
          latitude: number
          longitude: number
          motoboy_id: string
          order_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          motoboy_id: string
          order_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          motoboy_id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motoboy_locations_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoboy_locations_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoboy_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      motoboy_manual_extras: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          motoboy_id: string
          paid: boolean
          paid_at: string | null
          payment_order_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          motoboy_id: string
          paid?: boolean
          paid_at?: string | null
          payment_order_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          motoboy_id?: string
          paid?: boolean
          paid_at?: string | null
          payment_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motoboy_manual_extras_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoboy_manual_extras_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoboy_manual_extras_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "motoboy_payment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      motoboy_payment_orders: {
        Row: {
          cash_session_id: string | null
          created_at: string
          created_by: string | null
          delivery_fees_total: number
          extra_amount: number
          extra_note: string | null
          id: string
          motoboy_id: string
          motoboy_name: string
          notes: string | null
          order_ids: string[]
          paid_at: string | null
          paid_by: string | null
          payment_method: string
          period_end: string | null
          period_start: string | null
          pix_full_name: string | null
          pix_key: string | null
          pix_key_type: string | null
          sangria_id: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          cash_session_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_fees_total?: number
          extra_amount?: number
          extra_note?: string | null
          id?: string
          motoboy_id: string
          motoboy_name: string
          notes?: string | null
          order_ids?: string[]
          paid_at?: string | null
          paid_by?: string | null
          payment_method: string
          period_end?: string | null
          period_start?: string | null
          pix_full_name?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          sangria_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          cash_session_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_fees_total?: number
          extra_amount?: number
          extra_note?: string | null
          id?: string
          motoboy_id?: string
          motoboy_name?: string
          notes?: string | null
          order_ids?: string[]
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string
          period_end?: string | null
          period_start?: string | null
          pix_full_name?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          sangria_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motoboy_payment_orders_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoboy_payment_orders_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys_public"
            referencedColumns: ["id"]
          },
        ]
      }
      motoboys: {
        Row: {
          cpf: string | null
          created_at: string | null
          current_latitude: number | null
          current_longitude: number | null
          id: string
          is_active: boolean | null
          is_online: boolean
          location_updated_at: string | null
          logged_in_at: string | null
          name: string
          password: string | null
          photo_url: string | null
          slot_number: number | null
          whatsapp: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string | null
          current_latitude?: number | null
          current_longitude?: number | null
          id?: string
          is_active?: boolean | null
          is_online?: boolean
          location_updated_at?: string | null
          logged_in_at?: string | null
          name: string
          password?: string | null
          photo_url?: string | null
          slot_number?: number | null
          whatsapp: string
        }
        Update: {
          cpf?: string | null
          created_at?: string | null
          current_latitude?: number | null
          current_longitude?: number | null
          id?: string
          is_active?: boolean | null
          is_online?: boolean
          location_updated_at?: string | null
          logged_in_at?: string | null
          name?: string
          password?: string | null
          photo_url?: string | null
          slot_number?: number | null
          whatsapp?: string
        }
        Relationships: []
      }
      open_bottles: {
        Row: {
          dose_price: number
          emptied_at: string | null
          id: string
          is_empty: boolean
          ml_per_dose: number
          notes: string | null
          opened_at: string
          opened_by: string | null
          product_id: string
          product_name: string
          remaining_doses: number
          total_doses: number
          total_ml: number
        }
        Insert: {
          dose_price?: number
          emptied_at?: string | null
          id?: string
          is_empty?: boolean
          ml_per_dose: number
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          product_id: string
          product_name: string
          remaining_doses: number
          total_doses: number
          total_ml: number
        }
        Update: {
          dose_price?: number
          emptied_at?: string | null
          id?: string
          is_empty?: boolean
          ml_per_dose?: number
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          product_id?: string
          product_name?: string
          remaining_doses?: number
          total_doses?: number
          total_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "open_bottles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_bottles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      open_packs: {
        Row: {
          emptied_at: string | null
          id: string
          is_empty: boolean
          notes: string | null
          opened_at: string
          opened_by: string | null
          pack_size: number
          product_id: string
          product_name: string
          remaining_units: number
          unit_price: number
        }
        Insert: {
          emptied_at?: string | null
          id?: string
          is_empty?: boolean
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          pack_size?: number
          product_id: string
          product_name: string
          remaining_units: number
          unit_price?: number
        }
        Update: {
          emptied_at?: string | null
          id?: string
          is_empty?: boolean
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          pack_size?: number
          product_id?: string
          product_name?: string
          remaining_units?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "open_packs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_packs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_pins: {
        Row: {
          id: string
          operation: string
          pin_hash: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          operation: string
          pin_hash: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          operation?: string
          pin_hash?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          is_wizard_item: boolean
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: string
          is_wizard_item?: boolean
          order_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          id?: string
          is_wizard_item?: boolean
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          address_id: string | null
          arrived_at: string | null
          cash_received: number | null
          change_for: number | null
          client_request_id: string | null
          created_at: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_distance: number | null
          delivery_fee: number | null
          delivery_fee_adjusted: boolean | null
          delivery_fee_adjusted_at: string | null
          discount: number | null
          dispatched_at: string | null
          external_order_id: string | null
          external_origin: string | null
          id: string
          motoboy_id: string | null
          mp_payment_id: string | null
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number | null
          original_payment_method: string | null
          payment_confirmed: boolean | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          preparing_at: string | null
          ready_at: string | null
          route_calculated_at: string | null
          route_distance_meters: number | null
          route_duration_seconds: number | null
          route_origin_lat: number | null
          route_origin_lng: number | null
          route_polyline: string | null
          salesperson: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          address_id?: string | null
          arrived_at?: string | null
          cash_received?: number | null
          change_for?: number | null
          client_request_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          delivery_distance?: number | null
          delivery_fee?: number | null
          delivery_fee_adjusted?: boolean | null
          delivery_fee_adjusted_at?: string | null
          discount?: number | null
          dispatched_at?: string | null
          external_order_id?: string | null
          external_origin?: string | null
          id?: string
          motoboy_id?: string | null
          mp_payment_id?: string | null
          notes?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          original_delivery_fee?: number | null
          original_payment_method?: string | null
          payment_confirmed?: boolean | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          picked_up_at?: string | null
          preparing_at?: string | null
          ready_at?: string | null
          route_calculated_at?: string | null
          route_distance_meters?: number | null
          route_duration_seconds?: number | null
          route_origin_lat?: number | null
          route_origin_lng?: number | null
          route_polyline?: string | null
          salesperson?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          address_id?: string | null
          arrived_at?: string | null
          cash_received?: number | null
          change_for?: number | null
          client_request_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          delivery_distance?: number | null
          delivery_fee?: number | null
          delivery_fee_adjusted?: boolean | null
          delivery_fee_adjusted_at?: string | null
          discount?: number | null
          dispatched_at?: string | null
          external_order_id?: string | null
          external_origin?: string | null
          id?: string
          motoboy_id?: string | null
          mp_payment_id?: string | null
          notes?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          original_delivery_fee?: number | null
          original_payment_method?: string | null
          payment_confirmed?: boolean | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          picked_up_at?: string | null
          preparing_at?: string | null
          ready_at?: string | null
          route_calculated_at?: string | null
          route_distance_meters?: number | null
          route_duration_seconds?: number | null
          route_origin_lat?: number | null
          route_origin_lng?: number | null
          route_polyline?: string | null
          salesperson?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pager_ads: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          sort_order: number
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          sort_order?: number
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          sort_order?: number
          title?: string | null
        }
        Relationships: []
      }
      panel_credentials: {
        Row: {
          id: string
          panel: string
          password_hash: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          panel: string
          password_hash: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          panel?: string
          password_hash?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payment_confirmations: {
        Row: {
          confidence_score: number | null
          confirmed_manually: boolean | null
          created_at: string
          detected_value: number | null
          id: string
          image_url: string | null
          motoboy_id: string
          ocr_status: string
          ocr_text: string | null
          order_id: string
        }
        Insert: {
          confidence_score?: number | null
          confirmed_manually?: boolean | null
          created_at?: string
          detected_value?: number | null
          id?: string
          image_url?: string | null
          motoboy_id: string
          ocr_status?: string
          ocr_text?: string | null
          order_id: string
        }
        Update: {
          confidence_score?: number | null
          confirmed_manually?: boolean | null
          created_at?: string
          detected_value?: number | null
          id?: string
          image_url?: string | null
          motoboy_id?: string
          ocr_status?: string
          ocr_text?: string | null
          order_id?: string
        }
        Relationships: []
      }
      pin_audit_log: {
        Row: {
          created_at: string
          id: string
          operation: string
          success: boolean
          target_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          operation: string
          success: boolean
          target_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          operation?: string
          success?: boolean
          target_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      pix_payment_audit: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          external_reference: string | null
          id: string
          mp_payment_id: string | null
          notes: string | null
          order_id: string | null
          payer_email: string | null
          raw_response: Json | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          external_reference?: string | null
          id?: string
          mp_payment_id?: string | null
          notes?: string | null
          order_id?: string | null
          payer_email?: string | null
          raw_response?: Json | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          external_reference?: string | null
          id?: string
          mp_payment_id?: string | null
          notes?: string | null
          order_id?: string | null
          payer_email?: string | null
          raw_response?: Json | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      platform_sales: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          platform: string
          product_id: string | null
          product_name: string
          quantity: number
          salesperson: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          platform: string
          product_id?: string | null
          product_name: string
          quantity?: number
          salesperson?: string | null
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          platform?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          salesperson?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_coupons: {
        Row: {
          category_ids: string[]
          code: string
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          include_drinks: boolean
          is_active: boolean
          max_uses: number | null
          updated_at: string
          used_count: number
          valid_from: string
          valid_until: string
        }
        Insert: {
          category_ids?: string[]
          code: string
          created_at?: string
          description?: string | null
          discount_percent: number
          id?: string
          include_drinks?: boolean
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          used_count?: number
          valid_from: string
          valid_until: string
        }
        Update: {
          category_ids?: string[]
          code?: string
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          include_drinks?: boolean
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          used_count?: number
          valid_from?: string
          valid_until?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          combo_eligible: boolean | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_prepared: boolean | null
          name: string
          on_99food: boolean
          on_ifood: boolean
          price_99food: number | null
          price_ifood: number | null
          product_type: string | null
          profit_margin: number | null
          sale_price: number
          sort_order: number | null
          stock: number | null
          tier: Database["public"]["Enums"]["product_tier"] | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          combo_eligible?: boolean | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_prepared?: boolean | null
          name: string
          on_99food?: boolean
          on_ifood?: boolean
          price_99food?: number | null
          price_ifood?: number | null
          product_type?: string | null
          profit_margin?: number | null
          sale_price: number
          sort_order?: number | null
          stock?: number | null
          tier?: Database["public"]["Enums"]["product_tier"] | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          combo_eligible?: boolean | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_prepared?: boolean | null
          name?: string
          on_99food?: boolean
          on_ifood?: boolean
          price_99food?: number | null
          price_ifood?: number | null
          product_type?: string | null
          profit_margin?: number | null
          sale_price?: number
          sort_order?: number | null
          stock?: number | null
          tier?: Database["public"]["Enums"]["product_tier"] | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories_public"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          role: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          role?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          role?: string | null
        }
        Relationships: []
      }
      sangria_items: {
        Row: {
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          sangria_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          sangria_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          sangria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sangria_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sangria_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sangria_items_sangria_id_fkey"
            columns: ["sangria_id"]
            isOneToOne: false
            referencedRelation: "sangrias"
            referencedColumns: ["id"]
          },
        ]
      }
      sangrias: {
        Row: {
          amount: number
          closure_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          reason: string | null
          responsible: string
          type: string
        }
        Insert: {
          amount?: number
          closure_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          reason?: string | null
          responsible?: string
          type?: string
        }
        Update: {
          amount?: number
          closure_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          reason?: string | null
          responsible?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sangrias_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "cash_register_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sangrias_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          role: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          role: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          role?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          delivery_rate_per_km: number | null
          id: string
          is_open: boolean | null
          max_delivery_distance: number | null
          min_delivery_fee: number | null
          opening_hours: Json | null
          pix_key: string | null
          serper_api_key: string | null
          store_address: string | null
          store_lat: number | null
          store_lng: number | null
        }
        Insert: {
          delivery_rate_per_km?: number | null
          id?: string
          is_open?: boolean | null
          max_delivery_distance?: number | null
          min_delivery_fee?: number | null
          opening_hours?: Json | null
          pix_key?: string | null
          serper_api_key?: string | null
          store_address?: string | null
          store_lat?: number | null
          store_lng?: number | null
        }
        Update: {
          delivery_rate_per_km?: number | null
          id?: string
          is_open?: boolean | null
          max_delivery_distance?: number | null
          min_delivery_fee?: number | null
          opening_hours?: Json | null
          pix_key?: string | null
          serper_api_key?: string | null
          store_address?: string | null
          store_lat?: number | null
          store_lng?: number | null
        }
        Relationships: []
      }
      special_drink_allowed_products: {
        Row: {
          config_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          config_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          config_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_drink_allowed_products_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "special_drink_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_drink_allowed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_drink_allowed_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      special_drink_configs: {
        Row: {
          adicional_price: number
          allow_no_alcohol: boolean
          base_price: number
          created_at: string
          fruit_price: number
          gradient: string | null
          id: string
          image_url: string | null
          is_enabled: boolean
          label: string
          max_adicionais: number
          max_doses: number
          max_frutas: number
          no_alcohol_price: number
          slug: string
          sort_order: number
          step_adicionais: boolean
          step_doses: boolean
          step_energetico: boolean
          step_frutas: boolean
          step_gelo: boolean
          step_ice: boolean
          updated_at: string
        }
        Insert: {
          adicional_price?: number
          allow_no_alcohol?: boolean
          base_price?: number
          created_at?: string
          fruit_price?: number
          gradient?: string | null
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          label: string
          max_adicionais?: number
          max_doses?: number
          max_frutas?: number
          no_alcohol_price?: number
          slug: string
          sort_order?: number
          step_adicionais?: boolean
          step_doses?: boolean
          step_energetico?: boolean
          step_frutas?: boolean
          step_gelo?: boolean
          step_ice?: boolean
          updated_at?: string
        }
        Update: {
          adicional_price?: number
          allow_no_alcohol?: boolean
          base_price?: number
          created_at?: string
          fruit_price?: number
          gradient?: string | null
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          label?: string
          max_adicionais?: number
          max_doses?: number
          max_frutas?: number
          no_alcohol_price?: number
          slug?: string
          sort_order?: number
          step_adicionais?: boolean
          step_doses?: boolean
          step_energetico?: boolean
          step_frutas?: boolean
          step_gelo?: boolean
          step_ice?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      special_drink_recipes: {
        Row: {
          bottle_product_name: string | null
          created_at: string
          id: string
          ingredient_product_id: string | null
          ingredient_type: string
          product_id: string
          quantity: number
        }
        Insert: {
          bottle_product_name?: string | null
          created_at?: string
          id?: string
          ingredient_product_id?: string | null
          ingredient_type?: string
          product_id: string
          quantity?: number
        }
        Update: {
          bottle_product_name?: string | null
          created_at?: string
          id?: string
          ingredient_product_id?: string | null
          ingredient_type?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "special_drink_recipes_ingredient_product_id_fkey"
            columns: ["ingredient_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_drink_recipes_ingredient_product_id_fkey"
            columns: ["ingredient_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_drink_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_drink_recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sync_log: {
        Row: {
          id: string
          is_sentinel: boolean
          order_id: string
          original_item_name: string | null
          product_id: string | null
          quantity: number
          synced_at: string
          synced_by: string | null
        }
        Insert: {
          id?: string
          is_sentinel?: boolean
          order_id: string
          original_item_name?: string | null
          product_id?: string | null
          quantity?: number
          synced_at?: string
          synced_by?: string | null
        }
        Update: {
          id?: string
          is_sentinel?: boolean
          order_id?: string
          original_item_name?: string | null
          product_id?: string | null
          quantity?: number
          synced_at?: string
          synced_by?: string | null
        }
        Relationships: []
      }
      totem_customer_names: {
        Row: {
          created_at: string
          display_name: string
          id: string
          last_used_at: string
          name_normalized: string
          use_count: number
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          last_used_at?: string
          name_normalized: string
          use_count?: number
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          last_used_at?: string
          name_normalized?: string
          use_count?: number
        }
        Relationships: []
      }
      user_coupons: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          coupon_id: string
          id: string
          is_used: boolean | null
          used_at: string | null
          used_in_order_id: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          coupon_id: string
          id?: string
          is_used?: boolean | null
          used_at?: string | null
          used_in_order_id?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          coupon_id?: string
          id?: string
          is_used?: boolean | null
          used_at?: string | null
          used_in_order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_coupons_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_coupons_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_coupons_used_in_order_id_fkey"
            columns: ["used_in_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_coupons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          cpf: string | null
          created_at: string | null
          id: string
          is_blocked: boolean | null
          name: string
          password: string | null
          requires_password_change: boolean | null
          whatsapp: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string | null
          id?: string
          is_blocked?: boolean | null
          name: string
          password?: string | null
          requires_password_change?: boolean | null
          whatsapp: string
        }
        Update: {
          cpf?: string | null
          created_at?: string | null
          id?: string
          is_blocked?: boolean | null
          name?: string
          password?: string | null
          requires_password_change?: boolean | null
          whatsapp?: string
        }
        Relationships: []
      }
      visitor_sessions: {
        Row: {
          current_page: string | null
          id: string
          is_active: boolean | null
          last_activity_at: string | null
          page_views: number | null
          session_id: string
          started_at: string | null
          user_agent: string | null
        }
        Insert: {
          current_page?: string | null
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          page_views?: number | null
          session_id: string
          started_at?: string | null
          user_agent?: string | null
        }
        Update: {
          current_page?: string | null
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          page_views?: number | null
          session_id?: string
          started_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      weekly_promotions: {
        Row: {
          active: boolean
          created_at: string
          discount_type: string
          discount_value: number
          end_time: string
          id: string
          min_quantity: number
          name: string
          start_time: string
          target_id: string | null
          target_key: string | null
          target_type: string
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          discount_type: string
          discount_value: number
          end_time?: string
          id?: string
          min_quantity?: number
          name: string
          start_time?: string
          target_id?: string | null
          target_key?: string | null
          target_type: string
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          created_at?: string
          discount_type?: string
          discount_value?: number
          end_time?: string
          id?: string
          min_quantity?: number
          name?: string
          start_time?: string
          target_id?: string | null
          target_key?: string | null
          target_type?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
    }
    Views: {
      banners_public: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          title?: string | null
        }
        Relationships: []
      }
      categories_public: {
        Row: {
          created_at: string | null
          icon_url: string | null
          id: string | null
          is_active: boolean | null
          is_special: boolean | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          icon_url?: string | null
          id?: string | null
          is_active?: boolean | null
          is_special?: boolean | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          icon_url?: string | null
          id?: string | null
          is_active?: boolean | null
          is_special?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
      drink_fruits_public: {
        Row: {
          created_at: string | null
          icon_url: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          price: number | null
        }
        Insert: {
          created_at?: string | null
          icon_url?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          price?: number | null
        }
        Update: {
          created_at?: string | null
          icon_url?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          price?: number | null
        }
        Relationships: []
      }
      motoboys_public: {
        Row: {
          id: string | null
          is_active: boolean | null
          name: string | null
          slot_number: number | null
        }
        Insert: {
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          slot_number?: number | null
        }
        Update: {
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          slot_number?: number | null
        }
        Relationships: []
      }
      products_public: {
        Row: {
          barcode: string | null
          category_id: string | null
          combo_eligible: boolean | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_prepared: boolean | null
          name: string | null
          product_type: string | null
          sale_price: number | null
          sort_order: number | null
          stock: number | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          combo_eligible?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_prepared?: boolean | null
          name?: string | null
          product_type?: string | null
          sale_price?: number | null
          sort_order?: number | null
          stock?: number | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          combo_eligible?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_prepared?: boolean | null
          name?: string | null
          product_type?: string | null
          sale_price?: number | null
          sort_order?: number | null
          stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories_public"
            referencedColumns: ["id"]
          },
        ]
      }
      store_info: {
        Row: {
          delivery_rate_per_km: number | null
          is_open: boolean | null
          max_delivery_distance: number | null
          min_delivery_fee: number | null
          opening_hours: Json | null
          store_address: string | null
          store_lat: number | null
          store_lng: number | null
        }
        Relationships: []
      }
      v_cash_reconciliation: {
        Row: {
          amount: number | null
          created_at: string | null
          fee: number | null
          health_status: string | null
          id: string | null
          payment_method: string | null
          responsible: string | null
          session_closed_at: string | null
          session_id: string | null
          session_opened_at: string | null
          session_status: string | null
          total: number | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      v_reflexive_consistency: {
        Row: {
          check_type: string | null
          created_at: string | null
          details: Json | null
          record_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _sync_motoboy_to_users: {
        Args: {
          p_motoboy_id: string
          p_name: string
          p_password: string
          p_whatsapp: string
        }
        Returns: undefined
      }
      add_cash_supply: {
        Args: { p_amount: number; p_session_id: string }
        Returns: undefined
      }
      add_motoboy_manual_extra: {
        Args: {
          p_amount: number
          p_created_by?: string
          p_description: string
          p_motoboy_id: string
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          motoboy_id: string
          paid: boolean
          paid_at: string | null
          payment_order_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "motoboy_manual_extras"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_recompute_all_divergent_orders: {
        Args: { p_days_back?: number }
        Returns: Json
      }
      admin_recompute_order_total: {
        Args: { p_order_id: string }
        Returns: Json
      }
      apply_platform_price_markup: {
        Args: { p_percent: number; p_platform: string }
        Returns: number
      }
      assign_coupon_to_user: {
        Args: { p_coupon_id: string; p_user_id: string }
        Returns: string
      }
      assign_coupon_to_user_admin: {
        Args: {
          p_admin_user_id: string
          p_coupon_id: string
          p_target_user_id: string
        }
        Returns: string
      }
      assign_coupon_with_max_value: {
        Args: {
          p_coupon_id: string
          p_max_discount_value: number
          p_user_id: string
        }
        Returns: string
      }
      assign_coupon_with_max_value_admin: {
        Args: {
          p_admin_user_id: string
          p_coupon_id: string
          p_max_discount_value: number
          p_target_user_id: string
        }
        Returns: string
      }
      assign_motoboy: {
        Args: { p_motoboy_id: string; p_order_id: string }
        Returns: undefined
      }
      assign_motoboy_atomic: {
        Args: { p_motoboy_id: string; p_order_id: string }
        Returns: Json
      }
      auto_complete_pickup_orders: { Args: never; Returns: undefined }
      auto_consume_energy_dose: {
        Args: { p_doses: number; p_product_id: string }
        Returns: Json
      }
      calculate_real_profit: {
        Args: { p_end: string; p_start: string }
        Returns: {
          counter_orders_count: number
          delivery_orders_count: number
          gross_profit: number
          total_delivery_fees: number
          total_orders_count: number
          total_product_cost: number
          total_revenue: number
        }[]
      }
      can_edit_order: { Args: { p_order_id: string }; Returns: boolean }
      cancel_customer_order: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: boolean
      }
      cancel_motoboy_payment_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      change_operation_pin_v2: {
        Args: {
          p_new: string
          p_old: string
          p_operation: string
          p_updated_by?: string
        }
        Returns: boolean
      }
      change_order_payment_motoboy: {
        Args: {
          p_motoboy_id: string
          p_order_id: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Returns: undefined
      }
      change_panel_password_v2: {
        Args: {
          p_new: string
          p_old: string
          p_panel: string
          p_updated_by?: string
        }
        Returns: boolean
      }
      check_phone_rpc: { Args: { p_whatsapp: string }; Returns: Json }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_old_motoboy_locations: { Args: never; Returns: undefined }
      cleanup_old_visitor_sessions: { Args: never; Returns: undefined }
      cleanup_stale_open_orders: { Args: never; Returns: undefined }
      clone_product: {
        Args: { p_new_image_url?: string; p_product_id: string }
        Returns: string
      }
      close_cash_register: {
        Args: { p_closed_by?: string; p_session_id: string }
        Returns: undefined
      }
      confirm_cash_received: {
        Args: { p_amount?: number; p_order_id: string; p_responsible?: string }
        Returns: Json
      }
      confirm_delivery_payment: {
        Args: {
          p_amount?: number
          p_as_cash?: boolean
          p_order_id: string
          p_responsible?: string
        }
        Returns: Json
      }
      confirm_motoboy_payment: {
        Args: {
          p_confidence_score?: number
          p_confirmed_manually?: boolean
          p_detected_value?: number
          p_image_url?: string
          p_motoboy_id: string
          p_ocr_status?: string
          p_ocr_text?: string
          p_order_id: string
        }
        Returns: string
      }
      confirm_order_payment_manual: {
        Args: { p_confirmed_by?: string; p_order_id: string }
        Returns: Json
      }
      confirm_pickup_motoboy: {
        Args: { p_motoboy_id: string; p_order_id: string }
        Returns: undefined
      }
      confirm_pix_payment_for_order: {
        Args: { p_mp_payment_id: string; p_order_id: string; p_user_id: string }
        Returns: Json
      }
      confirm_totem_payment: {
        Args: { p_confirmed_by?: string; p_order_id: string }
        Returns: undefined
      }
      create_banner: {
        Args: {
          p_description?: string
          p_image_url: string
          p_is_active?: boolean
          p_link_url?: string
          p_sort_order?: number
          p_title: string
        }
        Returns: string
      }
      create_caderneta_customer: {
        Args: { p_name: string; p_whatsapp?: string }
        Returns: string
      }
      create_caderneta_entries_batch: {
        Args: { p_customer_id: string; p_items: Json; p_salesperson?: string }
        Returns: Json
      }
      create_caderneta_entry:
        | {
            Args: {
              p_customer_id: string
              p_notes?: string
              p_product_id?: string
              p_product_name: string
              p_quantity: number
              p_salesperson?: string
              p_unit_price: number
            }
            Returns: string
          }
        | {
            Args: {
              p_customer_id: string
              p_notes?: string
              p_product_id?: string
              p_product_name: string
              p_quantity: number
              p_salesperson?: string
              p_total_price: number
              p_unit_price: number
            }
            Returns: string
          }
      create_cash_closure: {
        Args: {
          p_actual_cash: number
          p_cash_difference: number
          p_cash_supplies?: number
          p_closed_by?: string
          p_counter_orders_count?: number
          p_delivery_orders_count?: number
          p_expected_cash: number
          p_gross_profit: number
          p_net_profit: number
          p_notes?: string
          p_opening_balance: number
          p_period_end: string
          p_period_start: string
          p_real_gross_profit?: number
          p_session_id?: string
          p_shift_type: string
          p_total_card_credit: number
          p_total_card_debit: number
          p_total_cash: number
          p_total_delivery_fees?: number
          p_total_orders: number
          p_total_pix: number
          p_total_product_cost?: number
          p_total_sales: number
          p_total_sangrias: number
        }
        Returns: string
      }
      create_cash_transaction: {
        Args: {
          p_amount: number
          p_notes?: string
          p_payment_method?: string
          p_responsible?: string
          p_type: string
        }
        Returns: string
      }
      create_category: {
        Args: {
          p_icon_url?: string
          p_is_active?: boolean
          p_is_special?: boolean
          p_name: string
          p_sort_order?: number
        }
        Returns: string
      }
      create_counter_order: {
        Args: {
          p_change_for?: number
          p_customer_name?: string
          p_delivery_fee?: number
          p_discount?: number
          p_notes?: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_salesperson?: string
          p_subtotal?: number
          p_total?: number
          p_user_id?: string
        }
        Returns: string
      }
      create_counter_order_with_items: {
        Args: {
          p_change_for?: number
          p_client_request_id?: string
          p_customer_name?: string
          p_delivery_fee: number
          p_discount: number
          p_items: string
          p_notes?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_salesperson?: string
          p_subtotal: number
          p_total: number
          p_user_id?: string
        }
        Returns: string
      }
      create_custom_coupon: {
        Args: {
          p_category_id?: string
          p_code: string
          p_coupon_type: string
          p_description: string
          p_discount_percent: number
          p_max_discount_value?: number
          p_min_quantity?: number
          p_product_id?: string
          p_user_id: string
        }
        Returns: string
      }
      create_custom_coupon_admin: {
        Args: {
          p_admin_user_id: string
          p_category_id?: string
          p_code: string
          p_coupon_type: string
          p_description: string
          p_discount_percent: number
          p_expires_at?: string
          p_max_discount_value?: number
          p_min_quantity?: number
          p_product_id?: string
          p_target_user_id: string
        }
        Returns: string
      }
      create_delivery_order: {
        Args: {
          p_address_id: string
          p_change_for?: number
          p_delivery_distance?: number
          p_delivery_fee?: number
          p_discount?: number
          p_notes?: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_subtotal?: number
          p_total?: number
          p_user_id: string
        }
        Returns: string
      }
      create_delivery_order_with_items:
        | {
            Args: {
              p_address_id: string
              p_change_for?: number
              p_client_request_id?: string
              p_delivery_distance?: number
              p_delivery_fee: number
              p_discount: number
              p_items: string
              p_notes?: string
              p_payment_method: Database["public"]["Enums"]["payment_method"]
              p_subtotal: number
              p_total: number
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_address_id: string
              p_change_for?: number
              p_client_request_id?: string
              p_customer_name?: string
              p_delivery_distance?: number
              p_delivery_fee: number
              p_discount: number
              p_items: string
              p_notes?: string
              p_payment_method: Database["public"]["Enums"]["payment_method"]
              p_subtotal: number
              p_total: number
              p_user_id: string
            }
            Returns: string
          }
      create_drink_fruit: {
        Args: { p_name: string; p_price?: number; p_sort_order?: number }
        Returns: string
      }
      create_employee: {
        Args: { p_is_active?: boolean; p_name: string; p_whatsapp?: string }
        Returns: string
      }
      create_motoboy: {
        Args: {
          p_is_active?: boolean
          p_name: string
          p_password?: string
          p_slot_number?: number
          p_whatsapp: string
        }
        Returns: string
      }
      create_motoboy_payment_order: {
        Args: {
          p_created_by?: string
          p_delivery_fees: number
          p_extra_amount: number
          p_extra_note: string
          p_motoboy_id: string
          p_notes?: string
          p_order_ids: string[]
          p_payment_method: string
          p_period_end?: string
          p_period_start?: string
          p_pix_full_name?: string
          p_pix_key?: string
          p_pix_key_type?: string
        }
        Returns: string
      }
      create_order_items: {
        Args: { p_items: string; p_order_id: string }
        Returns: undefined
      }
      create_pager_ad: {
        Args: {
          p_image_url: string
          p_is_active?: boolean
          p_sort_order?: number
          p_title?: string
        }
        Returns: string
      }
      create_platform_sale: {
        Args: {
          p_notes?: string
          p_platform: string
          p_product_id: string
          p_product_name: string
          p_quantity: number
          p_salesperson?: string
          p_total_price: number
          p_unit_price: number
        }
        Returns: string
      }
      create_platform_sales_batch: {
        Args: {
          p_items: Json
          p_notes?: string
          p_platform: string
          p_salesperson?: string
        }
        Returns: Json
      }
      create_product: {
        Args: {
          p_category_id?: string
          p_cost_price?: number
          p_description?: string
          p_image_url?: string
          p_is_active?: boolean
          p_name: string
          p_profit_margin?: number
          p_sale_price?: number
          p_stock?: number
        }
        Returns: string
      }
      create_sangria: {
        Args: {
          p_amount: number
          p_description?: string
          p_reason?: string
          p_responsible?: string
          p_type?: string
        }
        Returns: string
      }
      create_simple_coupon_admin: {
        Args: {
          p_admin_user_id: string
          p_code: string
          p_discount_type: string
          p_discount_value: number
          p_target_user_id: string
        }
        Returns: string
      }
      create_special_drink_recipe_admin: {
        Args: {
          p_bottle_product_name?: string
          p_ingredient_product_id?: string
          p_ingredient_type: string
          p_product_id: string
          p_quantity?: number
          p_session_token: string
        }
        Returns: string
      }
      create_totem_order: {
        Args: {
          p_change_for?: number
          p_customer_name?: string
          p_delivery_fee?: number
          p_discount?: number
          p_notes?: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_salesperson?: string
          p_subtotal?: number
          p_total?: number
          p_user_id?: string
        }
        Returns: string
      }
      create_totem_order_with_items: {
        Args: {
          p_change_for?: number
          p_client_request_id?: string
          p_customer_name?: string
          p_delivery_fee: number
          p_discount: number
          p_items: string
          p_mp_payment_id?: string
          p_notes?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_subtotal: number
          p_total: number
        }
        Returns: string
      }
      create_user_address: {
        Args: {
          p_city: string
          p_complement?: string
          p_is_default?: boolean
          p_latitude?: number
          p_longitude?: number
          p_neighborhood: string
          p_notes?: string
          p_number: string
          p_state: string
          p_street: string
          p_user_id: string
          p_zip_code?: string
        }
        Returns: string
      }
      customer_login_rpc: {
        Args: { p_password: string; p_whatsapp: string }
        Returns: Json
      }
      deduct_bottle_doses: {
        Args: { p_bottle_id: string; p_doses_used: number }
        Returns: undefined
      }
      deduct_product_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      deduct_special_drink_stock: {
        Args: { p_product_id: string; p_quantity?: number }
        Returns: undefined
      }
      delete_banner: { Args: { p_id: string }; Returns: undefined }
      delete_category: { Args: { p_id: string }; Returns: undefined }
      delete_coupon_template: {
        Args: { p_coupon_id: string }
        Returns: boolean
      }
      delete_coupon_template_admin: {
        Args: { p_admin_user_id: string; p_coupon_id: string }
        Returns: boolean
      }
      delete_drink_fruit: { Args: { p_id: string }; Returns: undefined }
      delete_employee: { Args: { p_id: string }; Returns: undefined }
      delete_motoboy: { Args: { p_id: string }; Returns: undefined }
      delete_motoboy_general_confirmation: {
        Args: { p_from: string; p_motoboy_id: string; p_to: string }
        Returns: undefined
      }
      delete_motoboy_manual_extra: {
        Args: { p_id: string }
        Returns: undefined
      }
      delete_motoboy_order_confirmation: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      delete_open_bottle: { Args: { p_bottle_id: string }; Returns: boolean }
      delete_order: { Args: { p_order_id: string }; Returns: undefined }
      delete_pager_ad: { Args: { p_id: string }; Returns: undefined }
      delete_platform_sale: { Args: { p_id: string }; Returns: undefined }
      delete_product: { Args: { p_id: string }; Returns: undefined }
      delete_sangria: { Args: { p_id: string }; Returns: undefined }
      delete_special_drink_recipe_admin: {
        Args: { p_recipe_id: string; p_session_token: string }
        Returns: undefined
      }
      delete_user: { Args: { p_user_id: string }; Returns: undefined }
      delete_user_address: {
        Args: { p_address_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_user_coupon: {
        Args: { p_user_coupon_id: string }
        Returns: undefined
      }
      delete_user_coupon_admin: {
        Args: { p_admin_user_id: string; p_user_coupon_id: string }
        Returns: boolean
      }
      edit_order_items: {
        Args: { p_admin?: string; p_changes: Json; p_order_id: string }
        Returns: Json
      }
      execute_readonly_query: { Args: { sql_query: string }; Returns: Json }
      find_product_by_barcode: {
        Args: { p_barcode: string }
        Returns: {
          barcode: string | null
          category_id: string | null
          combo_eligible: boolean | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_prepared: boolean | null
          name: string
          on_99food: boolean
          on_ifood: boolean
          price_99food: number | null
          price_ifood: number | null
          product_type: string | null
          profit_margin: number | null
          sale_price: number
          sort_order: number | null
          stock: number | null
          tier: Database["public"]["Enums"]["product_tier"] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_admin_orders_complete: {
        Args: never
        Returns: {
          accepted_at: string
          address_id: string
          address_payload: Json
          arrived_at: string
          change_for: number
          created_at: string
          customer_name: string
          customer_resolved_name: string
          customer_whatsapp: string
          delivered_at: string
          delivery_distance: number
          delivery_fee: number
          delivery_fee_adjusted: boolean
          delivery_fee_adjusted_at: string
          discount: number
          dispatched_at: string
          external_order_id: string
          external_origin: string
          id: string
          motoboy_id: string
          mp_payment_id: string
          notes: string
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number
          payment_confirmed: boolean
          payment_confirmed_at: string
          payment_confirmed_by: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string
          preparing_at: string
          ready_at: string
          salesperson: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string
        }[]
      }
      get_all_addresses: {
        Args: never
        Returns: {
          city: string
          complement: string | null
          id: string
          is_default: boolean | null
          latitude: number | null
          longitude: number | null
          neighborhood: string
          notes: string | null
          number: string
          state: string
          street: string
          user_id: string
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "addresses"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_cash_closures: {
        Args: never
        Returns: {
          actual_cash: number | null
          card_fees_estimate: number | null
          cash_difference: number | null
          cash_supplies: number | null
          closed_at: string | null
          closed_by: string | null
          counter_orders_count: number | null
          delivery_orders_count: number | null
          expected_cash: number | null
          gross_profit: number | null
          id: string
          net_profit: number | null
          notes: string | null
          opening_balance: number | null
          period_end: string | null
          period_start: string | null
          real_gross_profit: number | null
          session_id: string | null
          shift_type: string | null
          total_card_credit: number | null
          total_card_debit: number | null
          total_cash: number | null
          total_delivery_fees: number | null
          total_orders: number | null
          total_pix: number | null
          total_product_cost: number | null
          total_sales: number | null
          total_sangrias: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cash_register_closures"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_coupons_admin: {
        Args: { p_admin_user_id?: string }
        Returns: {
          assign_to_all: boolean
          category_id: string
          code: string
          coupon_type: string
          created_at: string
          created_by: string
          description: string
          discount_percent: number
          expires_at: string
          id: string
          is_active: boolean
          is_template: boolean
          max_discount_value: number
          min_quantity: number
          product_id: string
          times_assigned: number
          times_used: number
        }[]
      }
      get_all_drink_fruits: {
        Args: never
        Returns: {
          created_at: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          sort_order: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "drink_fruits"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_motoboys: {
        Args: never
        Returns: {
          cpf: string | null
          created_at: string | null
          current_latitude: number | null
          current_longitude: number | null
          id: string
          is_active: boolean | null
          is_online: boolean
          location_updated_at: string | null
          logged_in_at: string | null
          name: string
          password: string | null
          photo_url: string | null
          slot_number: number | null
          whatsapp: string
        }[]
        SetofOptions: {
          from: "*"
          to: "motoboys"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_order_items: {
        Args: { p_order_ids: string[] }
        Returns: {
          id: string
          is_wizard_item: boolean
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "order_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_orders: {
        Args: never
        Returns: {
          accepted_at: string | null
          address_id: string | null
          arrived_at: string | null
          cash_received: number | null
          change_for: number | null
          client_request_id: string | null
          created_at: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_distance: number | null
          delivery_fee: number | null
          delivery_fee_adjusted: boolean | null
          delivery_fee_adjusted_at: string | null
          discount: number | null
          dispatched_at: string | null
          external_order_id: string | null
          external_origin: string | null
          id: string
          motoboy_id: string | null
          mp_payment_id: string | null
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number | null
          original_payment_method: string | null
          payment_confirmed: boolean | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          preparing_at: string | null
          ready_at: string | null
          route_calculated_at: string | null
          route_distance_meters: number | null
          route_duration_seconds: number | null
          route_origin_lat: number | null
          route_origin_lng: number | null
          route_polyline: string | null
          salesperson: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_sangrias_list: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          amount: number
          closure_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          reason: string | null
          responsible: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sangrias"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_users: {
        Args: never
        Returns: {
          cpf: string | null
          created_at: string | null
          id: string
          is_blocked: boolean | null
          name: string
          password: string | null
          requires_password_change: boolean | null
          whatsapp: string
        }[]
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_users_with_role: {
        Args: never
        Returns: {
          cpf: string
          created_at: string
          id: string
          is_blocked: boolean
          name: string
          password: string
          requires_password_change: boolean
          role: string
          whatsapp: string
        }[]
      }
      get_available_bottles_for_assembly: {
        Args: never
        Returns: {
          bottle_id: string
          dose_price: number
          image_url: string
          product_id: string
          product_name: string
          remaining_doses: number
          tier: Database["public"]["Enums"]["product_tier"]
        }[]
      }
      get_banners_public: {
        Args: { p_active_only?: boolean }
        Returns: {
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          title: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "banners_public"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_cash_register_sessions: {
        Args: never
        Returns: {
          cash_supplies: number | null
          closed_at: string | null
          closed_by: string | null
          closure_id: string | null
          current_balance: number
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_balance: number
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cash_register_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_cash_transactions: {
        Args: { p_end_date: string; p_start_date: string; p_type?: string }
        Returns: {
          amount: number
          created_at: string
          fee: number
          id: string
          notes: string
          payment_method: string
          responsible: string
          session_id: string
          total: number
          type: string
        }[]
      }
      get_categories_public: {
        Args: { p_active_only?: boolean }
        Returns: {
          created_at: string | null
          icon_url: string | null
          id: string | null
          is_active: boolean | null
          is_special: boolean | null
          name: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "categories_public"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_current_cash_balance: {
        Args: never
        Returns: {
          cash_sales: number
          cash_supplies: number
          current_balance: number
          depositos: number
          opened_at: string
          opening_balance: number
          sangrias: number
          saques: number
          session_id: string
          session_status: string
        }[]
      }
      get_customers_for_orders: {
        Args: never
        Returns: {
          id: string
          name: string
          whatsapp: string
        }[]
      }
      get_ifood_sync_status: {
        Args: { p_order_ids: string[] }
        Returns: {
          items_count: number
          order_id: string
          synced_at: string
          synced_by: string
          total_units: number
        }[]
      }
      get_kitchen_orders_complete: {
        Args: never
        Returns: {
          accepted_at: string
          address_id: string
          address_payload: Json
          arrived_at: string
          change_for: number
          created_at: string
          customer_name: string
          customer_resolved_name: string
          customer_whatsapp: string
          delivered_at: string
          delivery_distance: number
          delivery_fee: number
          delivery_fee_adjusted: boolean
          delivery_fee_adjusted_at: string
          discount: number
          dispatched_at: string
          external_order_id: string
          external_origin: string
          id: string
          motoboy_id: string
          mp_payment_id: string
          notes: string
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number
          payment_confirmed: boolean
          payment_confirmed_at: string
          payment_confirmed_by: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string
          preparing_at: string
          ready_at: string
          salesperson: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string
        }[]
      }
      get_kitchen_orders_with_items: {
        Args: never
        Returns: {
          accepted_at: string
          address_id: string
          address_payload: Json
          arrived_at: string
          change_for: number
          created_at: string
          customer_name: string
          customer_resolved_name: string
          customer_whatsapp: string
          delivered_at: string
          delivery_distance: number
          delivery_fee: number
          delivery_fee_adjusted: boolean
          delivery_fee_adjusted_at: string
          discount: number
          dispatched_at: string
          external_order_id: string
          external_origin: string
          id: string
          items_payload: Json
          motoboy_id: string
          mp_payment_id: string
          notes: string
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number
          payment_confirmed: boolean
          payment_confirmed_at: string
          payment_confirmed_by: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string
          preparing_at: string
          ready_at: string
          salesperson: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string
        }[]
      }
      get_log_orders_complete: {
        Args: never
        Returns: {
          accepted_at: string
          address_id: string
          address_payload: Json
          arrived_at: string
          change_for: number
          created_at: string
          customer_name: string
          customer_resolved_name: string
          customer_whatsapp: string
          delivered_at: string
          delivery_distance: number
          delivery_fee: number
          delivery_fee_adjusted: boolean
          delivery_fee_adjusted_at: string
          discount: number
          dispatched_at: string
          external_order_id: string
          external_origin: string
          id: string
          motoboy_id: string
          mp_payment_id: string
          notes: string
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number
          payment_confirmed: boolean
          payment_confirmed_at: string
          payment_confirmed_by: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string
          preparing_at: string
          ready_at: string
          salesperson: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string
        }[]
      }
      get_motoboy_addresses: {
        Args: { p_address_ids: string[]; p_motoboy_id: string }
        Returns: {
          city: string
          complement: string | null
          id: string
          is_default: boolean | null
          latitude: number | null
          longitude: number | null
          neighborhood: string
          notes: string | null
          number: string
          state: string
          street: string
          user_id: string
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "addresses"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_motoboy_order_items: {
        Args: { p_motoboy_id: string; p_order_ids: string[] }
        Returns: {
          id: string
          is_wizard_item: boolean
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "order_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_motoboy_order_users: {
        Args: { p_motoboy_id: string }
        Returns: {
          id: string
          name: string
          whatsapp: string
        }[]
      }
      get_motoboy_orders: {
        Args: { p_motoboy_id: string }
        Returns: {
          accepted_at: string | null
          address_id: string | null
          arrived_at: string | null
          cash_received: number | null
          change_for: number | null
          client_request_id: string | null
          created_at: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_distance: number | null
          delivery_fee: number | null
          delivery_fee_adjusted: boolean | null
          delivery_fee_adjusted_at: string | null
          discount: number | null
          dispatched_at: string | null
          external_order_id: string | null
          external_origin: string | null
          id: string
          motoboy_id: string | null
          mp_payment_id: string | null
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number | null
          original_payment_method: string | null
          payment_confirmed: boolean | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          preparing_at: string | null
          ready_at: string | null
          route_calculated_at: string | null
          route_distance_meters: number | null
          route_duration_seconds: number | null
          route_origin_lat: number | null
          route_origin_lng: number | null
          route_polyline: string | null
          salesperson: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_motoboy_public: {
        Args: { p_motoboy_id: string }
        Returns: {
          current_latitude: number
          current_longitude: number
          id: string
          is_active: boolean
          location_updated_at: string
          name: string
        }[]
      }
      get_motoboy_self: {
        Args: { p_motoboy_id: string }
        Returns: {
          cpf: string | null
          created_at: string | null
          current_latitude: number | null
          current_longitude: number | null
          id: string
          is_active: boolean | null
          is_online: boolean
          location_updated_at: string | null
          logged_in_at: string | null
          name: string
          password: string | null
          photo_url: string | null
          slot_number: number | null
          whatsapp: string
        }[]
        SetofOptions: {
          from: "*"
          to: "motoboys"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_online_motoboys: {
        Args: never
        Returns: {
          cpf: string | null
          created_at: string | null
          current_latitude: number | null
          current_longitude: number | null
          id: string
          is_active: boolean | null
          is_online: boolean
          location_updated_at: string | null
          logged_in_at: string | null
          name: string
          password: string | null
          photo_url: string | null
          slot_number: number | null
          whatsapp: string
        }[]
        SetofOptions: {
          from: "*"
          to: "motoboys"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_open_bottles: {
        Args: never
        Returns: {
          dose_price: number
          emptied_at: string | null
          id: string
          is_empty: boolean
          ml_per_dose: number
          notes: string | null
          opened_at: string
          opened_by: string | null
          product_id: string
          product_name: string
          remaining_doses: number
          total_doses: number
          total_ml: number
        }[]
        SetofOptions: {
          from: "*"
          to: "open_bottles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_open_packs: {
        Args: never
        Returns: {
          emptied_at: string | null
          id: string
          is_empty: boolean
          notes: string | null
          opened_at: string
          opened_by: string | null
          pack_size: number
          product_id: string
          product_name: string
          remaining_units: number
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "open_packs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_order_latest_motoboy_location: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: {
          latitude: number
          longitude: number
          motoboy_id: string
          updated_at: string
        }[]
      }
      get_order_payment_proof: { Args: { p_order_id: string }; Returns: string }
      get_pager_orders: {
        Args: never
        Returns: {
          created_at: string
          customer_name: string
          id: string
          order_type: Database["public"]["Enums"]["order_type"]
          ready_at: string
          short_number: string
          status: Database["public"]["Enums"]["order_status"]
        }[]
      }
      get_platform_sales: {
        Args: {
          p_end_date?: string
          p_platform?: string
          p_start_date?: string
        }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          platform: string
          product_id: string | null
          product_name: string
          quantity: number
          salesperson: string | null
          total_price: number
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_sales"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_products_public: {
        Args: { p_active_only?: boolean }
        Returns: {
          barcode: string | null
          category_id: string | null
          combo_eligible: boolean | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_prepared: boolean | null
          name: string | null
          product_type: string | null
          sale_price: number | null
          sort_order: number | null
          stock: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products_public"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_reconciliation_summary: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          depositos_sem_metodo: number
          depositos_sem_sessao: number
          saques_sem_metodo: number
          saques_sem_sessao: number
          taxas_zero_suspeitas: number
          totais_incorretos: number
          total_depositos: number
          total_saques: number
          total_transacoes: number
          valor_total_depositos: number
          valor_total_saques: number
          valor_total_taxas: number
        }[]
      }
      get_reflexive_consistency_report: {
        Args: never
        Returns: {
          check_type: string
          latest_at: string
          total_count: number
        }[]
      }
      get_saq_dep_summary: {
        Args: never
        Returns: {
          count_saques: number
          total_fees: number
          total_saques: number
        }[]
      }
      get_session_summary: {
        Args: never
        Returns: {
          card_credit_sales: number
          card_debit_sales: number
          cash_pending: number
          cash_sales: number
          cash_supplies: number
          counter_orders: number
          delivery_fees: number
          delivery_orders: number
          depositos: number
          expected_cash: number
          fees: number
          gross_profit: number
          opened_at: string
          opened_by: string
          opening_balance: number
          pix_sales: number
          product_cost: number
          saques: number
          saques_card_credit: number
          saques_card_debit: number
          saques_pix: number
          saques_vr: number
          session_id: string
          session_status: string
          total_orders: number
          total_sales: number
          total_sangrias: number
        }[]
      }
      get_special_drink_recipes_admin: {
        Args: { p_product_id?: string; p_session_token: string }
        Returns: {
          bottle_product_name: string | null
          created_at: string
          id: string
          ingredient_product_id: string | null
          ingredient_type: string
          product_id: string
          quantity: number
        }[]
        SetofOptions: {
          from: "*"
          to: "special_drink_recipes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_store_info: {
        Args: never
        Returns: {
          delivery_rate_per_km: number
          is_open: boolean
          max_delivery_distance: number
          min_delivery_fee: number
          opening_hours: Json
          store_address: string
          store_lat: number
          store_lng: number
        }[]
      }
      get_totem_order_items: {
        Args: { p_order_ids: string[] }
        Returns: {
          id: string
          is_wizard_item: boolean
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "order_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_totem_recent_orders: {
        Args: never
        Returns: {
          accepted_at: string | null
          address_id: string | null
          arrived_at: string | null
          cash_received: number | null
          change_for: number | null
          client_request_id: string | null
          created_at: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_distance: number | null
          delivery_fee: number | null
          delivery_fee_adjusted: boolean | null
          delivery_fee_adjusted_at: string | null
          discount: number | null
          dispatched_at: string | null
          external_order_id: string | null
          external_origin: string | null
          id: string
          motoboy_id: string | null
          mp_payment_id: string | null
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number | null
          original_payment_method: string | null
          payment_confirmed: boolean | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          preparing_at: string | null
          ready_at: string | null
          route_calculated_at: string | null
          route_distance_meters: number | null
          route_duration_seconds: number | null
          route_origin_lat: number | null
          route_origin_lng: number | null
          route_polyline: string | null
          salesperson: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_addresses: {
        Args: { p_user_id: string }
        Returns: {
          city: string
          complement: string | null
          id: string
          is_default: boolean | null
          latitude: number | null
          longitude: number | null
          neighborhood: string
          notes: string | null
          number: string
          state: string
          street: string
          user_id: string
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "addresses"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_coupons_admin: {
        Args: { p_user_id: string }
        Returns: {
          assigned_at: string
          code: string
          coupon_id: string
          description: string
          discount_percent: number
          id: string
          is_used: boolean
          used_at: string
        }[]
      }
      get_user_order_items: {
        Args: { p_order_ids: string[]; p_user_id: string }
        Returns: {
          id: string
          is_wizard_item: boolean
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "order_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_orders: {
        Args: { p_user_id: string }
        Returns: {
          accepted_at: string | null
          address_id: string | null
          arrived_at: string | null
          cash_received: number | null
          change_for: number | null
          client_request_id: string | null
          created_at: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_distance: number | null
          delivery_fee: number | null
          delivery_fee_adjusted: boolean | null
          delivery_fee_adjusted_at: string | null
          discount: number | null
          dispatched_at: string | null
          external_order_id: string | null
          external_origin: string | null
          id: string
          motoboy_id: string | null
          mp_payment_id: string | null
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number | null
          original_payment_method: string | null
          payment_confirmed: boolean | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          preparing_at: string | null
          ready_at: string | null
          route_calculated_at: string | null
          route_distance_meters: number | null
          route_duration_seconds: number | null
          route_origin_lat: number | null
          route_origin_lng: number | null
          route_polyline: string | null
          salesperson: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_open_cash_session: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_password: { Args: { p_password: string }; Returns: string }
      import_products_batch: { Args: { p_products: Json }; Returns: number }
      increment_geocoding_cache_hit: {
        Args: { p_key: string }
        Returns: undefined
      }
      increment_totem_name: { Args: { p_name: string }; Returns: undefined }
      insert_external_order_idempotent:
        | {
            Args: {
              p_address_city?: string
              p_address_complement?: string
              p_address_neighborhood?: string
              p_address_number?: string
              p_address_reference?: string
              p_address_state?: string
              p_address_street?: string
              p_address_zip_code?: string
              p_customer_name: string
              p_delivery_fee: number
              p_notes: string
              p_order_number: string
              p_order_type: string
              p_payment_method: string
              p_platform: string
              p_salesperson: string
              p_status: string
              p_subtotal: number
              p_total: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_address_city?: string
              p_address_complement?: string
              p_address_neighborhood?: string
              p_address_number?: string
              p_address_reference?: string
              p_address_state?: string
              p_address_street?: string
              p_address_zip_code?: string
              p_customer_name: string
              p_delivery_fee: number
              p_notes: string
              p_order_number: string
              p_order_type: string
              p_payment_confirmed?: boolean
              p_payment_method: string
              p_platform: string
              p_salesperson: string
              p_status: string
              p_subtotal: number
              p_total: number
            }
            Returns: Json
          }
      insert_sangria: {
        Args: {
          p_amount: number
          p_description?: string
          p_reason?: string
          p_responsible: string
          p_type: string
        }
        Returns: string
      }
      issue_session_token: {
        Args: { p_role: string; p_user_id: string }
        Returns: string
      }
      list_caderneta_customers_staff: {
        Args: { p_active_only?: boolean }
        Returns: Json
      }
      list_motoboy_cash_confirmations: {
        Args: { p_from: string; p_order_ids?: string[]; p_to: string }
        Returns: {
          confirmed_at: string
          confirmed_by: string
          motoboy_id: string
          order_id: string
        }[]
      }
      list_motoboy_manual_extras: {
        Args: {
          p_end?: string
          p_motoboy_id?: string
          p_only_unpaid?: boolean
          p_start?: string
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          motoboy_id: string
          paid: boolean
          paid_at: string | null
          payment_order_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "motoboy_manual_extras"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_motoboy_paid_order_ids: {
        Args: { p_motoboy_id: string }
        Returns: {
          order_id: string
        }[]
      }
      list_motoboy_payment_orders: {
        Args: {
          p_end?: string
          p_motoboy_id?: string
          p_start?: string
          p_status?: string
        }
        Returns: {
          cash_session_id: string | null
          created_at: string
          created_by: string | null
          delivery_fees_total: number
          extra_amount: number
          extra_note: string | null
          id: string
          motoboy_id: string
          motoboy_name: string
          notes: string | null
          order_ids: string[]
          paid_at: string | null
          paid_by: string | null
          payment_method: string
          period_end: string | null
          period_start: string | null
          pix_full_name: string | null
          pix_key: string | null
          pix_key_type: string | null
          sangria_id: string | null
          status: string
          total_amount: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "motoboy_payment_orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      login_motoboy_by_cpf: {
        Args: { p_cpf: string; p_password: string }
        Returns: Json
      }
      mark_caderneta_all_paid: {
        Args: { p_customer_id: string }
        Returns: undefined
      }
      mark_caderneta_paid: { Args: { p_entry_id: string }; Returns: undefined }
      mark_motoboy_extras_paid: {
        Args: { p_ids: string[]; p_payment_order_id: string }
        Returns: number
      }
      motoboy_heartbeat: { Args: { p_motoboy_id: string }; Returns: undefined }
      motoboy_login_rpc: {
        Args: { p_password: string; p_whatsapp: string }
        Returns: Json
      }
      normalize_ifood_alias: { Args: { p_text: string }; Returns: string }
      open_bottle: {
        Args: {
          p_ml_per_dose: number
          p_notes?: string
          p_opened_by?: string
          p_product_id: string
          p_total_ml: number
        }
        Returns: string
      }
      open_cash_register: {
        Args: { p_opened_by?: string; p_opening_balance?: number }
        Returns: string
      }
      open_cigarette_pack: {
        Args: {
          p_notes?: string
          p_opened_by?: string
          p_pack_size?: number
          p_product_id: string
          p_unit_price?: number
        }
        Returns: string
      }
      open_energy_drink_2l: {
        Args: { p_opened_by?: string; p_product_id: string }
        Returns: string
      }
      pay_motoboy_payment_order: {
        Args: { p_order_id: string; p_paid_by?: string }
        Returns: undefined
      }
      recompute_order_total: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      record_motoboy_general_confirmation: {
        Args: {
          p_amount: number
          p_confirmed_by?: string
          p_motoboy_id: string
        }
        Returns: string
      }
      record_motoboy_order_confirmation: {
        Args: {
          p_amount: number
          p_confirmed_by?: string
          p_motoboy_id: string
          p_notes?: string
          p_order_id: string
          p_payment_method: string
        }
        Returns: string
      }
      rectify_order_payment: {
        Args: { p_notes?: string; p_order_id: string; p_splits: Json }
        Returns: Json
      }
      redeem_pos_coupon: { Args: { p_coupon_id: string }; Returns: boolean }
      register_customer: {
        Args: {
          p_city?: string
          p_complement?: string
          p_cpf: string
          p_latitude?: number
          p_longitude?: number
          p_name: string
          p_neighborhood?: string
          p_notes?: string
          p_number?: string
          p_state?: string
          p_street?: string
          p_whatsapp: string
          p_zip_code?: string
        }
        Returns: Json
      }
      register_motoboy_self: {
        Args: { p_cpf: string; p_name: string; p_whatsapp: string }
        Returns: Json
      }
      renew_bottle: { Args: { p_bottle_id: string }; Returns: string }
      renew_cigarette_pack: {
        Args: {
          p_opened_by?: string
          p_pack_id: string
          p_pack_size?: number
          p_unit_price?: number
        }
        Returns: string
      }
      renew_user_coupon_admin: {
        Args: {
          p_admin_user_id: string
          p_code: string
          p_discount_type: string
          p_discount_value: number
          p_user_coupon_id: string
        }
        Returns: string
      }
      reopen_last_session: { Args: { p_responsible?: string }; Returns: string }
      round_platform_prices: { Args: { p_platform: string }; Returns: number }
      search_totem_names: {
        Args: { p_limit?: number; p_prefix: string }
        Returns: {
          display_name: string
          use_count: number
        }[]
      }
      sell_loose_cigarette: {
        Args: { p_pack_id: string; p_quantity: number }
        Returns: undefined
      }
      set_default_address: {
        Args: { p_address_id: string; p_user_id: string }
        Returns: undefined
      }
      set_motoboy_online_status: {
        Args: { p_is_online: boolean; p_motoboy_id: string }
        Returns: undefined
      }
      set_store_open: { Args: { p_is_open: boolean }; Returns: boolean }
      sinistro_revert_order_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_order_id: string
          p_reason?: string
          p_responsible?: string
        }
        Returns: {
          accepted_at: string | null
          address_id: string | null
          arrived_at: string | null
          cash_received: number | null
          change_for: number | null
          client_request_id: string | null
          created_at: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_distance: number | null
          delivery_fee: number | null
          delivery_fee_adjusted: boolean | null
          delivery_fee_adjusted_at: string | null
          discount: number | null
          dispatched_at: string | null
          external_order_id: string | null
          external_origin: string | null
          id: string
          motoboy_id: string | null
          mp_payment_id: string | null
          notes: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          original_delivery_fee: number | null
          original_payment_method: string | null
          payment_confirmed: boolean | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          preparing_at: string | null
          ready_at: string | null
          route_calculated_at: string | null
          route_distance_meters: number | null
          route_duration_seconds: number | null
          route_origin_lat: number | null
          route_origin_lng: number | null
          route_polyline: string | null
          salesperson: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_login_rpc: {
        Args: { p_password: string; p_username: string }
        Returns: Json
      }
      suggest_product_for_ifood_item: {
        Args: { p_name: string }
        Returns: {
          product_id: string
          product_name: string
          score: number
          source: string
        }[]
      }
      sync_ifood_order_stock: {
        Args: { p_items: Json; p_order_id: string; p_synced_by?: string }
        Returns: Json
      }
      toggle_allowed_bottle: {
        Args: {
          p_config_id: string
          p_enabled: boolean
          p_product_id: string
          p_session_token: string
        }
        Returns: Json
      }
      toggle_fruit_availability: {
        Args: { p_fruit_id: string; p_is_active: boolean }
        Returns: undefined
      }
      toggle_user_blocked: {
        Args: { p_is_blocked: boolean; p_user_id: string }
        Returns: undefined
      }
      unconfirm_cash_received: { Args: { p_order_id: string }; Returns: Json }
      unconfirm_delivery_payment: {
        Args: { p_order_id: string }
        Returns: Json
      }
      update_banner: {
        Args: {
          p_description?: string
          p_id: string
          p_image_url?: string
          p_is_active?: boolean
          p_link_url?: string
          p_sort_order?: number
          p_title?: string
        }
        Returns: undefined
      }
      update_bottle_dose_price: {
        Args: { p_bottle_id: string; p_dose_price: number }
        Returns: undefined
      }
      update_category: {
        Args: {
          p_icon_url?: string
          p_id: string
          p_is_active?: boolean
          p_is_special?: boolean
          p_name?: string
          p_sort_order?: number
        }
        Returns: undefined
      }
      update_delivery_fee: {
        Args: { p_new_fee: number; p_order_id: string }
        Returns: undefined
      }
      update_drink_fruit: {
        Args: {
          p_id: string
          p_is_active?: boolean
          p_name?: string
          p_price?: number
        }
        Returns: undefined
      }
      update_employee: {
        Args: {
          p_id: string
          p_is_active?: boolean
          p_name: string
          p_whatsapp?: string
        }
        Returns: undefined
      }
      update_motoboy: {
        Args: {
          p_id: string
          p_is_active?: boolean
          p_name?: string
          p_password?: string
          p_slot_number?: number
          p_whatsapp?: string
        }
        Returns: undefined
      }
      update_motoboy_location: {
        Args: {
          p_latitude: number
          p_longitude: number
          p_motoboy_id: string
          p_order_id?: string
        }
        Returns: undefined
      }
      update_order_status:
        | {
            Args: {
              p_accepted_at?: string
              p_arrived_at?: string
              p_delivered_at?: string
              p_dispatched_at?: string
              p_order_id: string
              p_preparing_at?: string
              p_ready_at?: string
              p_status: Database["public"]["Enums"]["order_status"]
            }
            Returns: undefined
          }
        | {
            Args: {
              p_motoboy_id?: string
              p_order_id: string
              p_status: Database["public"]["Enums"]["order_status"]
            }
            Returns: {
              accepted_at: string | null
              address_id: string | null
              arrived_at: string | null
              cash_received: number | null
              change_for: number | null
              client_request_id: string | null
              created_at: string | null
              customer_name: string | null
              delivered_at: string | null
              delivery_distance: number | null
              delivery_fee: number | null
              delivery_fee_adjusted: boolean | null
              delivery_fee_adjusted_at: string | null
              discount: number | null
              dispatched_at: string | null
              external_order_id: string | null
              external_origin: string | null
              id: string
              motoboy_id: string | null
              mp_payment_id: string | null
              notes: string | null
              order_type: Database["public"]["Enums"]["order_type"]
              original_delivery_fee: number | null
              original_payment_method: string | null
              payment_confirmed: boolean | null
              payment_confirmed_at: string | null
              payment_confirmed_by: string | null
              payment_method: Database["public"]["Enums"]["payment_method"]
              picked_up_at: string | null
              preparing_at: string | null
              ready_at: string | null
              route_calculated_at: string | null
              route_distance_meters: number | null
              route_duration_seconds: number | null
              route_origin_lat: number | null
              route_origin_lng: number | null
              route_polyline: string | null
              salesperson: string | null
              status: Database["public"]["Enums"]["order_status"]
              subtotal: number
              total: number
              user_id: string | null
            }
            SetofOptions: {
              from: "*"
              to: "orders"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      update_order_status_motoboy: {
        Args: {
          p_arrived_at?: string
          p_delivered_at?: string
          p_motoboy_id: string
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
      update_pager_ad: {
        Args: {
          p_id: string
          p_image_url?: string
          p_is_active?: boolean
          p_sort_order?: number
          p_title?: string
        }
        Returns: undefined
      }
      update_product: {
        Args: {
          p_category_id?: string
          p_cost_price?: number
          p_description?: string
          p_id: string
          p_image_url?: string
          p_is_active?: boolean
          p_name?: string
          p_on_99food?: boolean
          p_on_ifood?: boolean
          p_price_99food?: number
          p_price_ifood?: number
          p_profit_margin?: number
          p_sale_price?: number
          p_stock?: number
          p_tier?: Database["public"]["Enums"]["product_tier"]
        }
        Returns: undefined
      }
      update_product_barcode: {
        Args: { p_barcode: string; p_id: string }
        Returns: undefined
      }
      update_product_stock: {
        Args: { p_id: string; p_stock: number }
        Returns: undefined
      }
      update_settings:
        | {
            Args: {
              p_delivery_rate_per_km?: number
              p_is_open?: boolean
              p_max_delivery_distance?: number
              p_min_delivery_fee?: number
              p_opening_hours?: Json
              p_pix_key?: string
              p_store_address?: string
              p_store_lat?: number
              p_store_lng?: number
            }
            Returns: undefined
          }
        | {
            Args: {
              p_delivery_rate_per_km?: number
              p_is_open?: boolean
              p_max_delivery_distance?: number
              p_min_delivery_fee?: number
              p_opening_hours?: Json
              p_pix_key?: string
              p_serper_api_key?: string
              p_store_address?: string
              p_store_lat?: number
              p_store_lng?: number
            }
            Returns: undefined
          }
      update_special_drink_config: {
        Args: { p_id: string; p_updates: Json }
        Returns: undefined
      }
      update_special_drink_image_admin: {
        Args: {
          p_image_url: string
          p_product_id: string
          p_session_token: string
        }
        Returns: undefined
      }
      update_user_address: {
        Args: {
          p_address_id: string
          p_city: string
          p_complement?: string
          p_latitude?: number
          p_longitude?: number
          p_neighborhood: string
          p_notes?: string
          p_number: string
          p_state: string
          p_street: string
          p_user_id: string
          p_zip_code?: string
        }
        Returns: undefined
      }
      upsert_coupon_template: {
        Args: {
          p_assign_to_all?: boolean
          p_category_id?: string
          p_code?: string
          p_coupon_type?: string
          p_description?: string
          p_discount_percent?: number
          p_expires_at?: string
          p_id?: string
          p_is_active?: boolean
          p_max_discount_value?: number
          p_min_quantity?: number
          p_product_id?: string
        }
        Returns: string
      }
      upsert_coupon_template_admin: {
        Args: {
          p_admin_user_id: string
          p_assign_to_all?: boolean
          p_category_id?: string
          p_code: string
          p_coupon_type: string
          p_description: string
          p_discount_percent: number
          p_expires_at?: string
          p_id: string
          p_is_active?: boolean
          p_max_discount_value?: number
          p_min_quantity?: number
          p_product_id?: string
        }
        Returns: string
      }
      use_bottle_dose: {
        Args: { p_bottle_id: string; p_doses?: number }
        Returns: number
      }
      use_coupon: {
        Args: { p_order_id: string; p_user_coupon_id: string }
        Returns: boolean
      }
      use_coupon_admin: {
        Args: {
          p_order_id: string
          p_user_coupon_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      validate_coupon_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: {
          coupon_id: string
          discount_percent: number
          error_message: string
          user_coupon_id: string
          valid: boolean
        }[]
      }
      validate_pos_coupon: {
        Args: { p_code: string }
        Returns: {
          category_ids: string[]
          code: string
          description: string
          discount_percent: number
          id: string
          include_drinks: boolean
          reason: string
          valid: boolean
        }[]
      }
      validate_session: {
        Args: { p_token: string }
        Returns: {
          is_valid: boolean
          role: string
          user_id: string
        }[]
      }
      verify_motoboy_login: {
        Args: { p_motoboy_id: string; p_password: string }
        Returns: Json
      }
      verify_operation_pin_v2: {
        Args: {
          p_operation: string
          p_pin: string
          p_target_id?: string
          p_user_agent?: string
        }
        Returns: boolean
      }
      verify_panel_password_v2: {
        Args: { p_panel: string; p_password: string }
        Returns: boolean
      }
      verify_staff_login: {
        Args: { p_password: string; p_role: string }
        Returns: Json
      }
      verify_user_password: {
        Args: { p_password: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "kitchen" | "pdv" | "motoboy" | "customer" | "log"
      order_status:
        | "pending"
        | "accepted"
        | "preparing"
        | "ready"
        | "dispatched"
        | "arrived"
        | "delivered"
        | "cancelled"
      order_type: "delivery" | "pickup" | "local" | "counter" | "totem"
      payment_method:
        | "pix"
        | "cash"
        | "card_pos"
        | "card_credit"
        | "card_debit"
        | "mixed"
        | "pix_pos"
      product_tier: "essencial" | "premium" | "luxo"
      punch_type: "in" | "out"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "kitchen", "pdv", "motoboy", "customer", "log"],
      order_status: [
        "pending",
        "accepted",
        "preparing",
        "ready",
        "dispatched",
        "arrived",
        "delivered",
        "cancelled",
      ],
      order_type: ["delivery", "pickup", "local", "counter", "totem"],
      payment_method: [
        "pix",
        "cash",
        "card_pos",
        "card_credit",
        "card_debit",
        "mixed",
        "pix_pos",
      ],
      product_tier: ["essencial", "premium", "luxo"],
      punch_type: ["in", "out"],
    },
  },
} as const

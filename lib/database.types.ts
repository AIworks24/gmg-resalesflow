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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      application_property_groups: {
        Row: {
          application_id: number
          created_at: string | null
          id: number
          is_primary: boolean | null
          property_id: number
          property_location: string | null
          property_name: string
          property_owner_email: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          application_id: number
          created_at?: string | null
          id?: number
          is_primary?: boolean | null
          property_id: number
          property_location?: string | null
          property_name: string
          property_owner_email?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          application_id?: number
          created_at?: string | null
          id?: number
          is_primary?: boolean | null
          property_id?: number
          property_location?: string | null
          property_name?: string
          property_owner_email?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_property_groups_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_property_groups_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          assigned_to: string | null
          buyer_email: string | null
          buyer_name: string
          buyer_phone: string | null
          closing_date: string | null
          comments: string | null
          completed_at: string | null
          convenience_fee: number | null
          created_at: string | null
          documents: Json | null
          email_completed_at: string | null
          expected_completion_date: string | null
          forms_updated_at: string | null
          hoa_property_id: number | null
          id: number
          inspection_form_completed_at: string | null
          notes: string | null
          package_type: string | null
          payment_canceled_at: string | null
          payment_completed_at: string | null
          payment_confirmed_at: string | null
          payment_failed_at: string | null
          payment_failure_reason: string | null
          payment_method: string | null
          payment_status: string | null
          pdf_completed_at: string | null
          pdf_expires_at: string | null
          pdf_generated_at: string | null
          pdf_url: string | null
          processing_fee: number | null
          property_address: string
          property_owner_notified_at: string | null
          property_owner_response_due: string | null
          realtor_license: string | null
          resale_certificate_completed_at: string | null
          rush_fee: number | null
          sale_price: number | null
          seller_email: string | null
          seller_name: string
          seller_phone: string | null
          status: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          submitted_at: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone: string | null
          submitter_type: string | null
          total_amount: number | null
          unit_number: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          buyer_email?: string | null
          buyer_name: string
          buyer_phone?: string | null
          closing_date?: string | null
          comments?: string | null
          completed_at?: string | null
          convenience_fee?: number | null
          created_at?: string | null
          documents?: Json | null
          email_completed_at?: string | null
          expected_completion_date?: string | null
          forms_updated_at?: string | null
          hoa_property_id?: number | null
          id?: number
          inspection_form_completed_at?: string | null
          notes?: string | null
          package_type?: string | null
          payment_canceled_at?: string | null
          payment_completed_at?: string | null
          payment_confirmed_at?: string | null
          payment_failed_at?: string | null
          payment_failure_reason?: string | null
          payment_method?: string | null
          payment_status?: string | null
          pdf_completed_at?: string | null
          pdf_expires_at?: string | null
          pdf_generated_at?: string | null
          pdf_url?: string | null
          processing_fee?: number | null
          property_address: string
          property_owner_notified_at?: string | null
          property_owner_response_due?: string | null
          realtor_license?: string | null
          resale_certificate_completed_at?: string | null
          rush_fee?: number | null
          sale_price?: number | null
          seller_email?: string | null
          seller_name: string
          seller_phone?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          submitted_at?: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone?: string | null
          submitter_type?: string | null
          total_amount?: number | null
          unit_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          buyer_email?: string | null
          buyer_name?: string
          buyer_phone?: string | null
          closing_date?: string | null
          comments?: string | null
          completed_at?: string | null
          convenience_fee?: number | null
          created_at?: string | null
          documents?: Json | null
          email_completed_at?: string | null
          expected_completion_date?: string | null
          forms_updated_at?: string | null
          hoa_property_id?: number | null
          id?: number
          inspection_form_completed_at?: string | null
          notes?: string | null
          package_type?: string | null
          payment_canceled_at?: string | null
          payment_completed_at?: string | null
          payment_confirmed_at?: string | null
          payment_failed_at?: string | null
          payment_failure_reason?: string | null
          payment_method?: string | null
          payment_status?: string | null
          pdf_completed_at?: string | null
          pdf_expires_at?: string | null
          pdf_generated_at?: string | null
          pdf_url?: string | null
          processing_fee?: number | null
          property_address?: string
          property_owner_notified_at?: string | null
          property_owner_response_due?: string | null
          realtor_license?: string | null
          resale_certificate_completed_at?: string | null
          rush_fee?: number | null
          sale_price?: number | null
          seller_email?: string | null
          seller_name?: string
          seller_phone?: string | null
          status?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          submitted_at?: string | null
          submitter_email?: string
          submitter_name?: string
          submitter_phone?: string | null
          submitter_type?: string | null
          total_amount?: number | null
          unit_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_hoa_property_id_fkey"
            columns: ["hoa_property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_inspections: {
        Row: {
          application_id: number | null
          approved_modifications: string | null
          covenant_violations: string | null
          created_at: string | null
          general_comments: string | null
          id: number
          inspection_date: string | null
          inspection_time: string | null
          inspector_name: string | null
          inspector_user_id: string | null
          primary_contact: string | null
          signature_contact: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          application_id?: number | null
          approved_modifications?: string | null
          covenant_violations?: string | null
          created_at?: string | null
          general_comments?: string | null
          id?: number
          inspection_date?: string | null
          inspection_time?: string | null
          inspector_name?: string | null
          inspector_user_id?: string | null
          primary_contact?: string | null
          signature_contact?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          application_id?: number | null
          approved_modifications?: string | null
          covenant_violations?: string | null
          created_at?: string | null
          general_comments?: string | null
          id?: number
          inspection_date?: string | null
          inspection_time?: string | null
          inspector_name?: string | null
          inspector_user_id?: string | null
          primary_contact?: string | null
          signature_contact?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_inspections_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      hoa_properties: {
        Row: {
          active: boolean | null
          created_at: string | null
          documents_folder: string | null
          email: string | null
          fee_schedule: Json | null
          id: number
          is_multi_community: boolean | null
          location: string | null
          management_contact: string | null
          name: string
          notification_preferences: Json | null
          phone: string | null
          property_owner_email: string | null
          property_owner_name: string | null
          property_owner_phone: string | null
          special_requirements: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          documents_folder?: string | null
          email?: string | null
          fee_schedule?: Json | null
          id?: number
          is_multi_community?: boolean | null
          location?: string | null
          management_contact?: string | null
          name: string
          notification_preferences?: Json | null
          phone?: string | null
          property_owner_email?: string | null
          property_owner_name?: string | null
          property_owner_phone?: string | null
          special_requirements?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          documents_folder?: string | null
          email?: string | null
          fee_schedule?: Json | null
          id?: number
          is_multi_community?: boolean | null
          location?: string | null
          management_contact?: string | null
          name?: string
          notification_preferences?: Json | null
          phone?: string | null
          property_owner_email?: string | null
          property_owner_name?: string | null
          property_owner_phone?: string | null
          special_requirements?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      hoa_property_resale_templates: {
        Row: {
          created_at: string | null
          hoa_property_id: number
          id: number
          template_data: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hoa_property_id: number
          id?: number
          template_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hoa_property_id?: number
          id?: number
          template_data?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hoa_property_resale_templates_hoa_property_id_fkey"
            columns: ["hoa_property_id"]
            isOneToOne: true
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_properties: {
        Row: {
          created_at: string | null
          id: number
          linked_property_id: number
          primary_property_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          linked_property_id: number
          primary_property_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          linked_property_id?: number
          primary_property_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linked_properties_linked_property_id_fkey"
            columns: ["linked_property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linked_properties_primary_property_id_fkey"
            columns: ["primary_property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          application_id: number | null
          created_at: string | null
          delivered_at: string | null
          email_template: string | null
          error_message: string | null
          id: number
          message: string
          metadata: Json | null
          notification_type: string | null
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          status: string | null
          subject: string
        }
        Insert: {
          application_id?: number | null
          created_at?: string | null
          delivered_at?: string | null
          email_template?: string | null
          error_message?: string | null
          id?: number
          message: string
          metadata?: Json | null
          notification_type?: string | null
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          application_id?: number | null
          created_at?: string | null
          delivered_at?: string | null
          email_template?: string | null
          error_message?: string | null
          id?: number
          message?: string
          metadata?: Json | null
          notification_type?: string | null
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean | null
          company: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          license_number: string | null
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          company?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          license_number?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          company?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          license_number?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      property_documents: {
        Row: {
          created_at: string | null
          document_key: string
          document_name: string
          expiration_date: string | null
          file_path: string | null
          id: number
          is_not_applicable: boolean | null
          property_id: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          document_key: string
          document_name: string
          expiration_date?: string | null
          file_path?: string | null
          id?: number
          is_not_applicable?: boolean | null
          property_id: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          document_key?: string
          document_name?: string
          expiration_date?: string | null
          file_path?: string | null
          id?: number
          is_not_applicable?: boolean | null
          property_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owner_forms: {
        Row: {
          access_token: string
          application_id: number | null
          completed_at: string | null
          created_at: string | null
          expires_at: string | null
          form_data: Json | null
          form_type: string | null
          hoa_property_id: number | null
          id: number
          recipient_email: string
          recipient_name: string | null
          response_data: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string
          application_id?: number | null
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          form_data?: Json | null
          form_type?: string | null
          hoa_property_id?: number | null
          id?: number
          recipient_email: string
          recipient_name?: string | null
          response_data?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          application_id?: number | null
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          form_data?: Json | null
          form_type?: string | null
          hoa_property_id?: number | null
          id?: number
          recipient_email?: string
          recipient_name?: string | null
          response_data?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_owner_forms_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owner_forms_hoa_property_id_fkey"
            columns: ["hoa_property_id"]
            isOneToOne: false
            referencedRelation: "hoa_properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_expiring_documents: {
        Args: Record<PropertyKey, never>
        Returns: {
          days_until_expiration: number
          document_name: string
          expiration_date: string
          property_id: number
          property_name: string
          property_owner_email: string
        }[]
      }
      get_linked_properties: {
        Args: { property_id: number }
        Returns: {
          linked_property_id: number
          location: string
          property_name: string
          property_owner_email: string
        }[]
      }
      get_properties_linking_to: {
        Args: { property_id: number }
        Returns: {
          location: string
          primary_property_id: number
          property_name: string
        }[]
      }
      has_linked_properties: {
        Args: { property_id: number }
        Returns: boolean
      }
      validate_no_circular_reference: {
        Args: { linked_id: number; primary_id: number }
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

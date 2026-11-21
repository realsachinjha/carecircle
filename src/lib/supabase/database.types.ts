
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"created_at": string,"id": number,"ip": unknown,"patient_id": string | null,"target_id": string | null,"target_table": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: never,"ip"?: unknown,"patient_id"?: string | null,"target_id"?: string | null,"target_table": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: never,"ip"?: unknown,"patient_id"?: string | null,"target_id"?: string | null,"target_table"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    }
                  ]
                },"caregiver_links": {
                  Row: {
                    "created_at": string,"id": string,"patient_id": string,"revoked_at": string | null,"role": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"patient_id": string,"revoked_at"?: string | null,"role": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"patient_id"?: string,"revoked_at"?: string | null,"role"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "caregiver_links_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "caregiver_links_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"consents": {
                  Row: {
                    "given_at": string,"given_by": string,"id": string,"notice_version": string,"patient_id": string,"purpose": string,"withdrawn_at": string | null,"withdrawn_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "given_at"?: string,"given_by": string,"id"?: string,"notice_version": string,"patient_id": string,"purpose"?: string,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null
                  }
                  Update: {
                    "given_at"?: string,"given_by"?: string,"id"?: string,"notice_version"?: string,"patient_id"?: string,"purpose"?: string,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consents_given_by_fkey"
      columns: ["given_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consents_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consents_withdrawn_by_fkey"
      columns: ["withdrawn_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invites": {
                  Row: {
                    "created_at": string,"created_by": string,"email": string,"expires_at": string,"id": string,"patient_id": string,"revoked_at": string | null,"role": string,"token_hash": string,"used_at": string | null,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"email": string,"expires_at": string,"id"?: string,"patient_id": string,"revoked_at"?: string | null,"role": string,"token_hash": string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"patient_id"?: string,"revoked_at"?: string | null,"role"?: string,"token_hash"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_used_by_fkey"
      columns: ["used_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"medical_documents": {
                  Row: {
                    "clinic_name": string | null,"created_at": string,"deleted_at": string | null,"doctor_name": string | null,"document_type": string,"extraction_error": string | null,"extraction_raw": Json | null,"extraction_status": string,"file_path": string,"id": string,"issue_date": string | null,"mime_type": string,"parse_started_at": string | null,"patient_id": string,"sha256": string,"size_bytes": number,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clinic_name"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"doctor_name"?: string | null,"document_type": string,"extraction_error"?: string | null,"extraction_raw"?: Json | null,"extraction_status"?: string,"file_path": string,"id": string,"issue_date"?: string | null,"mime_type": string,"parse_started_at"?: string | null,"patient_id": string,"sha256": string,"size_bytes": number,"uploaded_by": string
                  }
                  Update: {
                    "clinic_name"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"doctor_name"?: string | null,"document_type"?: string,"extraction_error"?: string | null,"extraction_raw"?: Json | null,"extraction_status"?: string,"file_path"?: string,"id"?: string,"issue_date"?: string | null,"mime_type"?: string,"parse_started_at"?: string | null,"patient_id"?: string,"sha256"?: string,"size_bytes"?: number,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "medical_documents_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "medical_documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"medication_reminders": {
                  Row: {
                    "acknowledged_at": string | null,"acknowledged_by": string | null,"created_at": string,"id": string,"patient_id": string,"schedule_id": string,"scheduled_for": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"created_at"?: string,"id"?: string,"patient_id": string,"schedule_id": string,"scheduled_for": string,"status"?: string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"acknowledged_by"?: string | null,"created_at"?: string,"id"?: string,"patient_id"?: string,"schedule_id"?: string,"scheduled_for"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "medication_reminders_acknowledged_by_fkey"
      columns: ["acknowledged_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "medication_reminders_schedule_id_patient_id_fkey"
      columns: ["schedule_id","patient_id"]
isOneToOne: false
      referencedRelation: "medication_schedules"
      referencedColumns: ["id","patient_id"]
    }
                  ]
                },"medication_schedules": {
                  Row: {
                    "created_at": string,"end_date": string | null,"frequency_type": string,"id": string,"interval_days": number | null,"medication_id": string,"patient_id": string,"slot": string,"start_date": string,"target_time": string,"weekdays": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_date"?: string | null,"frequency_type": string,"id"?: string,"interval_days"?: number | null,"medication_id": string,"patient_id": string,"slot": string,"start_date": string,"target_time": string,"weekdays"?: (number)[] | null
                  }
                  Update: {
                    "created_at"?: string,"end_date"?: string | null,"frequency_type"?: string,"id"?: string,"interval_days"?: number | null,"medication_id"?: string,"patient_id"?: string,"slot"?: string,"start_date"?: string,"target_time"?: string,"weekdays"?: (number)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "medication_schedules_medication_id_patient_id_fkey"
      columns: ["medication_id","patient_id"]
isOneToOne: false
      referencedRelation: "medications"
      referencedColumns: ["id","patient_id"]
    }
                  ]
                },"medications": {
                  Row: {
                    "created_at": string,"created_by": string,"document_id": string | null,"dosage": string,"id": string,"instructions": string | null,"name": string,"patient_id": string,"replaces_id": string | null,"status": string,"stopped_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"document_id"?: string | null,"dosage": string,"id"?: string,"instructions"?: string | null,"name": string,"patient_id": string,"replaces_id"?: string | null,"status"?: string,"stopped_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"document_id"?: string | null,"dosage"?: string,"id"?: string,"instructions"?: string | null,"name"?: string,"patient_id"?: string,"replaces_id"?: string | null,"status"?: string,"stopped_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "medications_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "medications_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "medical_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "medications_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "medications_replaces_id_fkey"
      columns: ["replaces_id"]
isOneToOne: false
      referencedRelation: "medications"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"data": NonNullable<Json>,"id": string,"kind": string,"patient_id": string | null,"read_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind": string,"patient_id"?: string | null,"read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"patient_id"?: string | null,"read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: false
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"patient_links": {
                  Row: {
                    "created_at": string,"patient_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"patient_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"patient_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "patient_links_patient_id_fkey"
      columns: ["patient_id"]
isOneToOne: true
      referencedRelation: "patients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "patient_links_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"patients": {
                  Row: {
                    "blood_group": string | null,"created_at": string,"created_by": string,"date_of_birth": string,"deleted_at": string | null,"emergency_contact_name": string | null,"emergency_contact_phone": string | null,"full_name": string,"id": string,"missed_after_minutes": number,"notes": string | null,"physician_name": string | null,"physician_phone": string | null,"primary_condition": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blood_group"?: string | null,"created_at"?: string,"created_by": string,"date_of_birth": string,"deleted_at"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"full_name": string,"id"?: string,"missed_after_minutes"?: number,"notes"?: string | null,"physician_name"?: string | null,"physician_phone"?: string | null,"primary_condition"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "blood_group"?: string | null,"created_at"?: string,"created_by"?: string,"date_of_birth"?: string,"deleted_at"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"full_name"?: string,"id"?: string,"missed_after_minutes"?: number,"notes"?: string | null,"physician_name"?: string | null,"physician_phone"?: string | null,"primary_condition"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "patients_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"phone": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name": string,"id": string,"phone"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"phone"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token_hash": string }; Returns: Json
                           },
"add_medication":
{ Args: { "p_medicine": Json,"p_patient": string }; Returns: string
                           },
"approve_document":
{ Args: { "p_document": string,"p_medicines": Json }; Returns: number
                           },
"change_medication":
{ Args: { "p_medication": string,"p_medicine": Json }; Returns: string
                           },
"claim_document_for_parse":
{ Args: { "p_document": string }; Returns: Json
                           },
"create_invite":
{ Args: { "p_email": string,"p_patient": string,"p_role": string,"p_token_hash": string }; Returns: string
                           },
"create_patient":
{ Args: { "p_blood_group"?: string,"p_date_of_birth": string,"p_emergency_contact_name"?: string,"p_emergency_contact_phone"?: string,"p_full_name": string,"p_missed_after_minutes": number,"p_notes"?: string,"p_physician_name"?: string,"p_physician_phone"?: string,"p_primary_condition"?: string,"p_timezone": string }; Returns: string
                           },
"document_file_readable":
{ Args: { "p_name": string }; Returns: boolean
                           },
"generate_reminders":
{ Args: { "p_now"?: string }; Returns: number
                           },
"give_consent":
{ Args: { "p_notice_version": string,"p_patient": string }; Returns: string
                           },
"has_active_consent":
{ Args: { "p_patient": string }; Returns: boolean
                           },
"has_role":
{ Args: { "p_patient": string,"p_roles": (string)[] }; Returns: boolean
                           },
"insert_medication":
{ Args: { "p_document": string,"p_medicine": Json,"p_patient": string,"p_replaces": string }; Returns: string
                           },
"mark_missed":
{ Args: { "p_now"?: string }; Returns: number
                           },
"my_role":
{ Args: { "p_patient": string }; Returns: string
                           },
"notify_members":
{ Args: { "p_data": Json,"p_exclude"?: string,"p_kind": string,"p_patient": string,"p_roles": (string)[] }; Returns: number
                           },
"record_parse_result":
{ Args: { "p_document": string,"p_error_code": string,"p_ok": boolean,"p_raw": Json }; Returns: string
                           },
"register_document":
{ Args: { "p_clinic_name"?: string,"p_doctor_name"?: string,"p_document": string,"p_document_type": string,"p_issue_date"?: string,"p_mime_type": string,"p_patient": string,"p_sha256": string,"p_size_bytes": number }; Returns: string
                           },
"remove_patient_login":
{ Args: { "p_patient": string }; Returns: undefined
                           },
"request_ip":
{ Args: Record<PropertyKey, never>; Returns: unknown
                           },
"revoke_caregiver":
{ Args: { "p_patient": string,"p_user": string }; Returns: undefined
                           },
"revoke_invite":
{ Args: { "p_invite": string }; Returns: undefined
                           },
"shares_patient":
{ Args: { "p_user": string }; Returns: boolean
                           },
"stop_medication":
{ Args: { "p_medication": string }; Returns: undefined
                           },
"stop_medication_rows":
{ Args: { "p_medication": string }; Returns: undefined
                           },
"try_date":
{ Args: { "p_value": string }; Returns: string
                           },
"try_uuid":
{ Args: { "p_value": string }; Returns: string
                           },
"unregistered_file_readable":
{ Args: { "p_name": string }; Returns: boolean
                           },
"update_my_profile":
{ Args: { "p_full_name": string,"p_phone": string }; Returns: undefined
                           },
"withdraw_consent":
{ Args: { "p_patient": string }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const


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
"create_invite":
{ Args: { "p_email": string,"p_patient": string,"p_role": string,"p_token_hash": string }; Returns: string
                           },
"create_patient":
{ Args: { "p_blood_group"?: string,"p_date_of_birth": string,"p_emergency_contact_name"?: string,"p_emergency_contact_phone"?: string,"p_full_name": string,"p_missed_after_minutes": number,"p_notes"?: string,"p_physician_name"?: string,"p_physician_phone"?: string,"p_primary_condition"?: string,"p_timezone": string }; Returns: string
                           },
"has_role":
{ Args: { "p_patient": string,"p_roles": (string)[] }; Returns: boolean
                           },
"my_role":
{ Args: { "p_patient": string }; Returns: string
                           },
"notify_members":
{ Args: { "p_data": Json,"p_exclude"?: string,"p_kind": string,"p_patient": string,"p_roles": (string)[] }; Returns: number
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
"update_my_profile":
{ Args: { "p_full_name": string,"p_phone": string }; Returns: undefined
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

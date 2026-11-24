/** Every error the API sends has this shape; `code` is stable, `details` only for validation failures. */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    details?: { path: string; code: string }[];
  };
}

export type ApiErrorCode =
  | 'unauthenticated'
  | 'account_inactive'
  | 'role_not_held'
  | 'admin_only'
  | 'user_role_only'
  | 'cannot_change_self'
  | 'admin_from_config'
  | 'not_team_leader'
  | 'leader_cannot_leave'
  | 'already_member'
  | 'not_a_member'
  | 'user_not_active'
  | 'team_archived'
  | 'team_expired'
  | 'confirmation_mismatch'
  | 'meeting_in_past'
  | 'meeting_date_taken'
  | 'series_has_notes'
  | 'meeting_cancelled'
  | 'too_many_series'
  | 'project_name_taken'
  | 'project_archived'
  | 'version_conflict'
  | 'invalid_image'
  | 'too_many_images'
  | 'validation_failed'
  | 'invalid_json'
  | 'too_large'
  | 'unsupported_charset'
  | 'unsupported_encoding'
  | 'request_aborted'
  | 'not_found'
  | 'internal_error';

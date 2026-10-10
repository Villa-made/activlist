// DTOs, enums and error codes of the public API v1.
// Single source of truth: docs/design/api-contracts.md §4–§6 and docs/design/data-model.md §2.
// Do not add fields or codes that are not in the contract (contract changes go in their own subtask).

// ---- Enums ---------------------------------------------------------------

export const ACTION_TYPES = ['RECYCLING', 'LITTER_COLLECTION'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

// data-model §2
export const CONTRIBUTION_STATUSES = [
  'PENDING',
  'NEEDS_EVIDENCE',
  'TECHNICAL_ERROR',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

// data-model §2
export const CAPTURE_ORIGINS = ['GALLERY', 'CAMERA_FLOW'] as const;
export type CaptureOrigin = (typeof CAPTURE_ORIGINS)[number];

// api-contracts §5
export const DECISIONS = ['APPROVED', 'NEEDS_EVIDENCE', 'REJECTED'] as const;
export type Decision = (typeof DECISIONS)[number];

// ---- Error format and codes (api-contracts §1, §6) -------------------------

export const ERROR_CODES = {
  // §1 error format: generic codes for unknown routes and unhandled failures (HTTP 404 / 500)
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  // §6 domain errors
  INVALID_REQUEST: 'INVALID_REQUEST',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  NOT_OWNER: 'NOT_OWNER',
  PROFILE_REQUIRED: 'PROFILE_REQUIRED',
  ALIAS_TAKEN: 'ALIAS_TAKEN',
  PROFILE_EXISTS: 'PROFILE_EXISTS',
  PENDING_CONTRIBUTION_EXISTS: 'PENDING_CONTRIBUTION_EXISTS',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  INVALID_STATE: 'INVALID_STATE',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  EXIF_REQUIRED: 'EXIF_REQUIRED',
  INVALID_ALIAS: 'INVALID_ALIAS',
  ADULT_DECLARATION_REQUIRED: 'ADULT_DECLARATION_REQUIRED',
  PHOTO_TOO_OLD: 'PHOTO_TOO_OLD',
  INVALID_MUNICIPALITY: 'INVALID_MUNICIPALITY',
  UNSUPPORTED_MEDIA: 'UNSUPPORTED_MEDIA',
  PHOTO_NOT_FOUND: 'PHOTO_NOT_FOUND',
  PHOTO_ALREADY_USED: 'PHOTO_ALREADY_USED',
  CANNOT_LIKE_OWN: 'CANNOT_LIKE_OWN',
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
}

// ---- Profiles (§4, D1) -----------------------------------------------------

export interface CreateProfileRequest {
  alias: string;
  adultDeclared: boolean;
}

export interface ProfileDto {
  userId: string;
  alias: string;
}

// ---- Uploads (§4) ----------------------------------------------------------

export interface CreateUploadRequest {
  contentType: string;
  sizeBytes: number;
}

export interface CreateUploadResponse {
  photoPath: string;
  uploadToken: string;
  expiresAt: string;
}

// ---- Contributions (§4) ----------------------------------------------------

export interface CreateContributionRequest {
  actionType: ActionType;
  description: string;
  municipalityCode: string;
  photoPath: string;
  captureOrigin: CaptureOrigin;
}

export interface CreateContributionResponse {
  id: string;
  status: 'PENDING';
  submittedAt: string;
  pointsIfApproved: number;
}

export interface ContributionDto {
  id: string;
  actionType: ActionType;
  status: ContributionStatus;
  reason: string | null;
  submittedAt: string;
  approvedAt: string | null;
  isHidden: boolean;
  effectivePoints: number;
  canRetry: boolean;
  canProvideEvidence: boolean;
  canCancel: boolean;
}

export interface ProvideEvidenceRequest {
  photoPath: string;
  captureOrigin: CaptureOrigin;
}

// PUT/DELETE /contributions/{id}/like (§4)
export interface LikeResponse {
  liked: boolean;
  likeCount: number;
}

// POST /reports (§4)
export interface ReportRequest {
  contributionId: string;
  reason: string;
  turnstileToken: string;
}

export interface ReportResponse {
  accepted: true;
}

// ---- Municipalities (§4) ---------------------------------------------------------

export interface MunicipalityDto {
  code: string;
  name: string;
  provinceName: string;
}

export interface MunicipalitiesResponse {
  items: MunicipalityDto[];
  nextCursor: null;
}

// ---- Feed and leaderboard (§4) ---------------------------------------------

export interface FeedItemDto {
  id: string;
  authorAlias: string;
  actionType: ActionType;
  description: string;
  municipality: { code: string; name: string };
  imageUrl: string;
  publishedAt: string;
  likeCount: number;
  likedByMe: boolean;
}

export interface FeedResponse {
  items: FeedItemDto[];
  nextCursor: string | null;
}

export interface LeaderboardItemDto {
  rank: number;
  userId: string;
  alias: string;
  points: number;
}

export interface LeaderboardResponse {
  items: LeaderboardItemDto[];
  nextCursor: string | null;
}

// ---- Reports (§4) ----------------------------------------------------------

export interface CreateReportRequest {
  contributionId: string;
  reason: string;
  turnstileToken: string;
}

export interface CreateReportResponse {
  accepted: true;
}

// ---- AI validation contract (§5, internal) ---------------------------------

export interface ValidationInput {
  actionType: ActionType;
  description: string;
  originalImageBytes: Uint8Array;
}

export interface ValidationResult {
  decision: Decision;
  reason: string;
}

// ---- Business constants (informational; SQL is the source of truth) ---------

export const POINTS_BY_ACTION: Record<ActionType, number> = {
  RECYCLING: 10,
  LITTER_COLLECTION: 20,
};
export const COOLDOWN_MINUTES = 60;
export const EXIF_MAX_AGE_MINUTES = 60;
export const FEED_WINDOW_DAYS = 30;
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
// api-contracts §2, D1
export const ALIAS_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;
// api-contracts §4, D1
export const DESCRIPTION_MAX_LENGTH = 500;

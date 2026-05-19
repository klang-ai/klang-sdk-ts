export { Klang, Klang as default, type ClientOptions } from './client.js';
export { VERSION } from './version.js';

// Core types
export { APIPromise } from './core/api-promise.js';
export { CursorPage, PagePromise, type PageParams } from './core/pagination.js';

// Errors
export {
  KlangError,
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  BadRequestError,
  AuthenticationError,
  PermissionDeniedError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  InternalServerError,
  type ErrorBody,
} from './core/errors.js';

// Resources (classes + types)
export {
  Conversations,
  type ConversationBase,
  type ConversationListItem,
  type ConversationDetail,
  type ConversationListParams,
  type Source,
  type SourceLite,
  type Participant,
} from './resources/conversations.js';
export { Folders, type Folder, type FolderListParams } from './resources/folders.js';
export { Identity, type IdentityResponse } from './resources/identity.js';
export { Bots, type Bot, type BotCreateParams } from './resources/bots.js';

import { APIPromise } from '../core/api-promise.js';
import { CursorPage, PagePromise, type PageParams } from '../core/pagination.js';
import { encodePath } from '../core/request.js';
import type { Klang } from '../client.js';

export class Conversations {
  constructor(private readonly _client: Klang) {}

  retrieve(id: string): APIPromise<ConversationDetail> {
    return this._client.get<ConversationDetail>(encodePath`/conversations/${id}`);
  }

  list(
    query: ConversationListParams | undefined = {},
  ): PagePromise<CursorPage<ConversationListItem>, ConversationListItem> {
    return this._client.getAPIList<ConversationListItem>('/conversations', { query });
  }
}

export interface ConversationBase {
  id?: string;
  title?: string | null;
  /** When the conversation was created in Klang. Use as the next `created_after` for incremental sync. */
  created_at?: string;
  updated_at?: string;
  /** Processing state. Wait for `ready` before reading `summary` or transcript content. */
  status?: 'pending' | 'ready' | 'error' | null;
  /**
   * When `status` is `error` because a meeting-bot recording was terminated before audio could be captured,
   * this explains why. `null` for any other error and for non-error states.
   */
  termination_reason?: 'not_admitted' | 'verification_required' | 'captcha_required' | null;
  /** ID of the immediate folder containing the conversation. `null` for root. */
  folder_id?: string | null;
  /** AI-generated short summary (≤80 chars) used to distinguish similar conversations. */
  digest?: string | null;
}

export interface ConversationListItem extends ConversationBase {
  sources?: Array<SourceLite>;
}

export interface ConversationDetail extends ConversationBase {
  /** User-facing summary as markdown. Only present on the retrieve endpoint. */
  summary?: string | null;
  sources?: Array<Source>;
}

/** Minimal source metadata included in list responses. */
export interface SourceLite {
  id?: string;
  type?: 'transcript' | 'document' | 'text' | 'file';
  /** Recording length. `null` for non-transcript sources. */
  duration_seconds?: number | null;
  /** ISO 639-3 code. `null` for non-transcript sources. */
  language?: string | null;
}

/** Full source returned by `GET /conversations/{id}`. */
export interface Source {
  id?: string;
  type?: 'transcript' | 'document' | 'text' | 'file';
  title?: string | null;
  added_at?: string | null;
  duration_seconds?: number | null;
  language?: string | null;
  /** Join URL of the meeting the transcript was recorded from. `null` for non-meeting sources. */
  meeting_url?: string | null;
  /** Plain-text rendering. Speaker-labeled and time-stamped for transcripts. */
  content?: string | null;
  participants?: Array<Participant>;
}

export interface Participant {
  /** Resolved display name, or raw speaker label (`Speaker 1`) if not matched. */
  name?: string;
}

export interface ConversationListParams extends PageParams {
  /** Only return conversations created strictly after this ISO 8601 timestamp. */
  created_after?: string;
  /** Restrict to conversations in this folder (recursive by default). */
  folder_id?: string;
  /** When `folder_id` is set, controls whether descendants are included. Default `true`. */
  recursive?: boolean;
  /** Filter by status. Defaults to `ready`. Pass `all` to include every status. */
  status?: 'ready' | 'pending' | 'error' | 'all';
}

import { APIPromise } from '../core/api-promise.js';
import type { Klang } from '../client.js';

export class Bots {
  constructor(private readonly _client: Klang) {}

  /**
   * Sends the Klang recorder bot to a video meeting (Google Meet, Microsoft Teams, or Zoom)
   * and returns the ID of the conversation the transcript will land on. The endpoint returns
   * immediately; poll `conversations.retrieve(id)` or wait for the `conversation.ready` webhook.
   */
  create(body: BotCreateParams): APIPromise<Bot> {
    return this._client.post<Bot>('/bots', { body });
  }
}

export interface BotCreateParams {
  /** Join URL for the meeting. Must be a Google Meet, Microsoft Teams, or Zoom URL. */
  meeting_url: string;
  /** Title for the resulting conversation (max 200 chars). */
  name: string;
  /** Spoken language as ISO 639-3 (e.g. `eng`, `swe`), or `auto` to detect. Defaults to `auto`. */
  language?: string;
  /** Folder to save the conversation into. Defaults to the user's default folder. */
  folder_id?: string;
}

export interface Bot {
  /** ID of the conversation the transcript will land on. */
  id?: string;
  meeting_url?: string;
  status?: 'pending';
}

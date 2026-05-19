import { CursorPage, PagePromise, type PageParams } from '../core/pagination.js';
import type { Klang } from '../client.js';

export class Folders {
  constructor(private readonly _client: Klang) {}

  list(query: FolderListParams | undefined = {}): PagePromise<CursorPage<Folder>, Folder> {
    return this._client.getAPIList<Folder>('/folders', { query });
  }
}

export interface Folder {
  id?: string;
  name?: string;
  /** ID of the parent folder, or null for top-level folders. */
  parent_id?: string | null;
  created_at?: string;
}

export interface FolderListParams extends PageParams {
  /** Restrict to folders inside this folder. */
  folder_id?: string;
  /** When `folder_id` is set, include descendants (default `true`). */
  recursive?: boolean;
}

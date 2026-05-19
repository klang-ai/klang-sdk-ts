import { APIPromise } from '../core/api-promise.js';
import type { Klang } from '../client.js';

export class Identity {
  constructor(private readonly _client: Klang) {}

  retrieve(): APIPromise<IdentityResponse> {
    return this._client.get<IdentityResponse>('/me');
  }
}

export interface IdentityResponse {
  user?: {
    email?: string;
  };
  workspace?: {
    name?: string;
  };
}

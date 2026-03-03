/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type UUID } from 'crypto';
import * as https from 'https';
import { URL } from 'url';
import { Headers, type RequestInit } from 'node-fetch';
import { z } from 'zod';

import {
  Assignment,
  AssignmentSchema,
  AuthType,
  CredentialsPropagationResult,
  CredentialsPropagationResultSchema,
  GetAssignmentResponse,
  GetAssignmentResponseSchema,
  ListedAssignment,
  ListedAssignmentsSchema,
  RuntimeProxyToken,
  RuntimeProxyTokenSchema,
  Shape,
  UserInfo,
  UserInfoSchema,
  ConsumptionUserInfo,
  ConsumptionUserInfoSchema,
  Variant,
} from '../../colab/api';
import {
  ACCEPT_JSON_HEADER,
  AUTHORIZATION_HEADER,
  COLAB_CLIENT_AGENT_HEADER,
  COLAB_TUNNEL_HEADER,
  COLAB_XSRF_TOKEN_HEADER,
} from '../../colab/headers';
import { uuidToWebSafeBase64 } from '../../utils/uuid';
import { COLAB_DOMAIN, COLAB_GAPI_DOMAIN, TUN_ENDPOINT } from './constants';
import { fetchWithTimeout, stripXssiPrefix } from './http';

export interface AssignParams {
  variant: Variant;
  accelerator?: string;
  shape?: Shape;
  version?: string;
}

export class SimpleColabClient {
  private readonly httpsAgent?: https.Agent;
  private readonly colabDomain: URL;
  private readonly colabGapiDomain: URL;

  constructor(private readonly getAccessToken: () => Promise<string>) {
    this.colabDomain = new URL(COLAB_DOMAIN);
    this.colabGapiDomain = new URL(COLAB_GAPI_DOMAIN);
    if (this.colabDomain.hostname === 'localhost') {
      this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
  }

  async getUserInfo(): Promise<UserInfo> {
    return await this.issueRequest(
      new URL('v1/user-info', this.colabGapiDomain),
      { method: 'GET' },
      UserInfoSchema,
    );
  }

  async getConsumptionUserInfo(): Promise<ConsumptionUserInfo> {
    const url = new URL('v1/user-info', this.colabGapiDomain);
    url.searchParams.set('get_ccu_consumption_info', 'true');
    return await this.issueRequest(
      url,
      { method: 'GET' },
      ConsumptionUserInfoSchema,
    );
  }

  async listAssignments(): Promise<ListedAssignment[]> {
    const response = await this.issueRequest(
      new URL('v1/assignments', this.colabGapiDomain),
      { method: 'GET' },
      ListedAssignmentsSchema,
    );
    return response.assignments;
  }

  async getRuntimeProxyToken(endpoint: string): Promise<RuntimeProxyToken> {
    const url = new URL('v1/runtime-proxy-token', this.colabGapiDomain);
    url.searchParams.set('endpoint', endpoint);
    url.searchParams.set('port', '8080');
    return await this.issueRequest(url, { method: 'GET' }, RuntimeProxyTokenSchema);
  }

  async assign(
    notebookHash: UUID,
    params: AssignParams,
  ): Promise<{ assignment: Assignment; isNew: boolean }> {
    const existingAssignment = await this.getAssignment(notebookHash, params);
    if ('endpoint' in existingAssignment) {
      return { assignment: existingAssignment, isNew: false };
    }

    const assignment = await this.postAssignment(
      notebookHash,
      existingAssignment.xsrfToken,
      params,
    );
    return { assignment, isNew: true };
  }

  async unassign(endpoint: string): Promise<void> {
    const url = new URL(`${TUN_ENDPOINT}/unassign/${endpoint}`, this.colabDomain);
    const { token } = await this.issueRequest(
      url,
      { method: 'GET' },
      z.object({ token: z.string() }),
    );
    await this.issueRequestVoid(url, {
      method: 'POST',
      headers: { [COLAB_XSRF_TOKEN_HEADER.key]: token },
    });
  }

  async propagateCredentials(
    endpoint: string,
    params: {
      authType: AuthType;
      dryRun: boolean;
    },
  ): Promise<CredentialsPropagationResult> {
    const url = new URL(
      `${TUN_ENDPOINT}/credentials-propagation/${endpoint}`,
      this.colabDomain,
    );
    url.searchParams.set('authtype', params.authType);
    url.searchParams.set('version', '2');
    url.searchParams.set('dryrun', String(params.dryRun));
    url.searchParams.set('propagate', 'true');
    url.searchParams.set('record', 'false');

    const { token } = await this.issueRequest(
      url,
      { method: 'GET' },
      z.object({ token: z.string() }),
    );

    return await this.issueRequest(
      url,
      {
        method: 'POST',
        headers: { [COLAB_XSRF_TOKEN_HEADER.key]: token },
      },
      CredentialsPropagationResultSchema,
    );
  }

  async sendKeepAlive(endpoint: string): Promise<void> {
    await this.issueRequestVoid(
      new URL(`${TUN_ENDPOINT}/${endpoint}/keep-alive/`, this.colabDomain),
      {
        method: 'GET',
        headers: { [COLAB_TUNNEL_HEADER.key]: COLAB_TUNNEL_HEADER.value },
      },
    );
  }

  private async getAssignment(
    notebookHash: UUID,
    params: AssignParams,
  ): Promise<Assignment | GetAssignmentResponse> {
    const url = this.buildAssignUrl(notebookHash, params);
    const response = await this.issueRequest(
      url,
      { method: 'GET' },
      z.union([GetAssignmentResponseSchema, AssignmentSchema]),
    );
    if ('xsrfToken' in response) {
      return response;
    }
    return response;
  }

  private async postAssignment(
    notebookHash: UUID,
    xsrfToken: string,
    params: AssignParams,
  ): Promise<Assignment> {
    const url = this.buildAssignUrl(notebookHash, params);
    return await this.issueRequest(
      url,
      {
        method: 'POST',
        headers: { [COLAB_XSRF_TOKEN_HEADER.key]: xsrfToken },
      },
      AssignmentSchema,
    );
  }

  private buildAssignUrl(notebookHash: UUID, params: AssignParams): URL {
    const url = new URL(`${TUN_ENDPOINT}/assign`, this.colabDomain);
    url.searchParams.set('nbh', uuidToWebSafeBase64(notebookHash));
    if (params.variant !== Variant.DEFAULT) {
      url.searchParams.set('variant', params.variant);
    }
    if (params.accelerator) {
      url.searchParams.set('accelerator', params.accelerator);
    }
    const shapeParam = mapShapeToURLParam(params.shape ?? Shape.STANDARD);
    if (shapeParam) {
      url.searchParams.set('shape', shapeParam);
    }
    if (params.version) {
      url.searchParams.set('runtime_version_label', params.version);
    }
    return url;
  }

  private async issueRequest<T extends z.ZodType>(
    endpoint: URL,
    init: RequestInit,
    schema: T,
  ): Promise<z.infer<T>> {
    const requestHeaders = new Headers(init.headers);
    requestHeaders.set(ACCEPT_JSON_HEADER.key, ACCEPT_JSON_HEADER.value);
    requestHeaders.set(
      COLAB_CLIENT_AGENT_HEADER.key,
      COLAB_CLIENT_AGENT_HEADER.value,
    );
    const token = await this.getAccessToken();
    requestHeaders.set(AUTHORIZATION_HEADER.key, `Bearer ${token}`);

    if (endpoint.hostname === this.colabDomain.hostname) {
      endpoint.searchParams.set('authuser', '0');
    }

    const requestInit: RequestInit = {
      ...init,
      headers: requestHeaders,
      agent: this.httpsAgent,
    };

    const response = await fetchWithTimeout(endpoint, requestInit);
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Request failed: ${String(response.status)} ${response.statusText}\\n${errorBody}`,
      );
    }

    const body = await response.text();
    return schema.parse(JSON.parse(stripXssiPrefix(body)) as unknown);
  }

  private async issueRequestVoid(endpoint: URL, init: RequestInit): Promise<void> {
    const requestHeaders = new Headers(init.headers);
    requestHeaders.set(ACCEPT_JSON_HEADER.key, ACCEPT_JSON_HEADER.value);
    requestHeaders.set(
      COLAB_CLIENT_AGENT_HEADER.key,
      COLAB_CLIENT_AGENT_HEADER.value,
    );
    const token = await this.getAccessToken();
    requestHeaders.set(AUTHORIZATION_HEADER.key, `Bearer ${token}`);

    if (endpoint.hostname === this.colabDomain.hostname) {
      endpoint.searchParams.set('authuser', '0');
    }

    const requestInit: RequestInit = {
      ...init,
      headers: requestHeaders,
      agent: this.httpsAgent,
    };

    const response = await fetchWithTimeout(endpoint, requestInit);
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Request failed: ${String(response.status)} ${response.statusText}\\n${errorBody}`,
      );
    }
  }
}

function mapShapeToURLParam(shape: Shape): string | undefined {
  switch (shape) {
    case Shape.HIGHMEM:
      return 'hm';
    default:
      return undefined;
  }
}

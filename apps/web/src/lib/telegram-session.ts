import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import * as authMethods from 'telegram/client/auth';
import { isProviderConfigured, getProviderProfile } from '@ikimetr/core';
import { getConnectionsStore } from './connections-store';
import type { TelegramAccountInfo } from '@ikimetr/connectors';

const TELEGRAM_SESSION_ID = 'telegram-default';

export { TELEGRAM_SESSION_ID };

const clients = new Map<string, TelegramClient>();
const authStates = new Map<string, { status: string; [key: string]: unknown }>();

export type { TelegramAccountInfo };

export function getTelegramApiCredentials() {
  const profile = getProviderProfile('telegram');
  if (!isProviderConfigured(profile, process.env)) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be configured');
  }
  return {
    apiId: Number(process.env.TELEGRAM_API_ID),
    apiHash: process.env.TELEGRAM_API_HASH ?? '',
  };
}

export function getOrCreateClient(sessionId = TELEGRAM_SESSION_ID): TelegramClient {
  if (clients.has(sessionId)) {
    return clients.get(sessionId)!;
  }
  const { apiId, apiHash } = getTelegramApiCredentials();
  const store = getConnectionsStore();
  const existingSessionString = store.accounts.telegram?.sessionString;
  const session = new StringSession(existingSessionString || '');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 2,
    retryDelay: 1000,
  });
  clients.set(sessionId, client);
  return client;
}

export function getAuthState(sessionId = TELEGRAM_SESSION_ID) {
  return authStates.get(sessionId) || { status: 'disconnected' };
}

export function setAuthState(state: { status: string; [key: string]: unknown }, sessionId = TELEGRAM_SESSION_ID) {
  authStates.set(sessionId, state);
}

export async function clearAuthState(sessionId = TELEGRAM_SESSION_ID) {
  const client = clients.get(sessionId);
  if (client?.connected) {
    await client.disconnect().catch(() => {});
  }
  clients.delete(sessionId);
  authStates.delete(sessionId);
}

export async function isClientAuthenticated(client: TelegramClient): Promise<boolean> {
  try {
    return await client.isUserAuthorized();
  } catch {
    return false;
  }
}

export async function requireTelegramAuth(sessionId = TELEGRAM_SESSION_ID): Promise<TelegramClient> {
  const client = getOrCreateClient(sessionId);
  const authenticated = await isClientAuthenticated(client);
  if (!authenticated) {
    throw new Error('TELEGRAM_NOT_AUTHENTICATED');
  }
  return client;
}

export async function formatAccountInfo(client: TelegramClient): Promise<TelegramAccountInfo> {
  const me = await client.getMe();
  const info: TelegramAccountInfo = {
    id: Number(me.id.toString()),
    firstName: me.firstName ?? '',
  };
  if (me.lastName) info.lastName = me.lastName;
  if (me.username) info.username = me.username;
  if (me.phone) info.phone = me.phone;
  return info;
}

export { Api, authMethods };

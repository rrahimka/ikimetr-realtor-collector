import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as authMethods from 'telegram/client/auth';
import type { TelegramAuthorizedMessage } from './telegram-authorized';

export interface TelegramMTProtoConfig {
  apiId: number;
  apiHash: string;
  sessionString?: string;
}

export interface TelegramAccountInfo {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
}

export interface TelegramDialogInfo {
  id: number;
  title: string;
  type: 'channel' | 'supergroup' | 'group' | 'user';
  username?: string;
  participantCount?: number;
  isCreator?: boolean;
}

export type TelegramAuthState =
  | { status: 'disconnected' }
  | { status: 'waiting_phone' }
  | { status: 'waiting_code'; phoneCodeHash: string; phoneNumber: string }
  | { status: 'waiting_2fa'; phoneNumber: string; phoneCodeHash: string }
  | { status: 'connecting' }
  | { status: 'connected'; accountInfo: TelegramAccountInfo }
  | { status: 'error'; error: string };

export interface TelegramMTProtoAdapter {
  getClient(): TelegramClient;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendCode(phoneNumber: string): Promise<{ phoneCodeHash: string }>;
  signIn(phoneNumber: string, phoneCodeHash: string, code: string): Promise<TelegramAccountInfo>;
  signIn2FA(password: string): Promise<TelegramAccountInfo>;
  getAccountInfo(): Promise<TelegramAccountInfo>;
  getDialogs(limit?: number): Promise<TelegramDialogInfo[]>;
  getMessages(
    chatId: number | string,
    limit: number,
    offsetId?: number
  ): Promise<TelegramAuthorizedMessage[]>;
  getSessionString(): string;
  isAuthenticated(): boolean;
}

export function createTelegramMTProtoAdapter(config: TelegramMTProtoConfig): TelegramMTProtoAdapter {
  const session = new StringSession(config.sessionString || '');
  const client = new TelegramClient(session, config.apiId, config.apiHash, {
    connectionRetries: 5,
    retryDelay: 1000,
    autoReconnect: true,
  });

  let authenticated = false;

  async function connect(): Promise<void> {
    await client.connect();
    if (config.sessionString) {
      authenticated = await client.isUserAuthorized();
    }
  }

  async function disconnect(): Promise<void> {
    if (client.connected) {
      await client.disconnect();
    }
    authenticated = false;
  }

  async function sendCode(phoneNumber: string): Promise<{ phoneCodeHash: string }> {
    const result = await authMethods.sendCode(
      client,
      { apiId: config.apiId, apiHash: config.apiHash },
      phoneNumber
    );
    return { phoneCodeHash: result.phoneCodeHash };
  }

  async function signIn(
    phoneNumber: string,
    _phoneCodeHash: string,
    code: string
  ): Promise<TelegramAccountInfo> {
    try {
      await authMethods.signInUser(
        client,
        { apiId: config.apiId, apiHash: config.apiHash },
        {
          phoneNumber: () => Promise.resolve(phoneNumber),
          phoneCode: () => Promise.resolve(code),
          onError: (err: Error) => {
            throw err;
          },
        }
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      if (err.message?.includes('2FA') || err.message?.includes('password')) {
        throw new Error('WAITING_2FA');
      }
      throw error;
    }

    authenticated = true;
    return getAccountInfo();
  }

  async function signIn2FA(password: string): Promise<TelegramAccountInfo> {
    await authMethods.signInWithPassword(
      client,
      { apiId: config.apiId, apiHash: config.apiHash },
      {
        password: () => Promise.resolve(password),
        onError: (err: Error) => {
          throw err;
        },
      }
    );
    authenticated = true;
    return getAccountInfo();
  }

  async function getAccountInfo(): Promise<TelegramAccountInfo> {
    const me = await client.getMe();
    const info: TelegramAccountInfo = {
      id: Number(me.id.toString()),
      firstName: me.firstName ?? '',
    };
    if (me.lastName) {
      info.lastName = me.lastName;
    }
    if (me.username) {
      info.username = me.username;
    }
    if (me.phone) {
      info.phone = me.phone;
    }
    return info;
  }

  async function getDialogs(limit = 50): Promise<TelegramDialogInfo[]> {
    const dialogs = await client.getDialogs({ limit });
    const result: TelegramDialogInfo[] = [];

    for (const dialog of dialogs) {
      if (!dialog.entity) continue;
      const entity = dialog.entity;
      if (dialog.id == null) continue;

      let type: TelegramDialogInfo['type'] = 'user';
      let title = '';
      let dialogUsername: string | undefined;
      let participantCount: number | undefined;
      let isCreator: boolean | undefined;

      if (entity instanceof Api.Channel) {
        type = entity.megagroup ? 'supergroup' : 'channel';
        title = entity.title;
        dialogUsername = entity.username;
        participantCount = entity.participantsCount ?? undefined;
        isCreator = entity.creator;
      } else if (entity instanceof Api.Chat) {
        type = 'group';
        title = entity.title;
        participantCount = entity.participantsCount ?? undefined;
        isCreator = entity.creator;
      } else if (entity instanceof Api.User) {
        type = 'user';
        title = `${entity.firstName || ''} ${entity.lastName || ''}`.trim();
        dialogUsername = entity.username;
      }

      if (title && type !== 'user') {
        const entry: TelegramDialogInfo = {
          id: Number(dialog.id.toString()),
          title,
          type,
        };
        if (dialogUsername) {
          entry.username = dialogUsername;
        }
        if (participantCount != null) {
          entry.participantCount = participantCount;
        }
        if (isCreator != null) {
          entry.isCreator = isCreator;
        }
        result.push(entry);
      }
    }

    return result;
  }

  async function getMessages(
    chatId: number | string,
    limit: number,
    offsetId?: number
  ): Promise<TelegramAuthorizedMessage[]> {
    const messages = await client.getMessages(chatId, {
      limit,
      ...(offsetId != null ? { offsetId } : {}),
    });

    return messages
      .filter((msg): msg is Api.Message => msg instanceof Api.Message)
      .map((msg) => {
        const msgChatId = msg.chatId != null ? Number(msg.chatId.toString()) : 0;
        const isChannel = msg.isChannel;
        const isGroup = msg.isGroup;
        const chatType = isChannel ? 'channel' : isGroup ? 'supergroup' : 'group';

        const text = msg.text || '';
        const date = msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString();

        const entry: TelegramAuthorizedMessage = {
          id: msg.id,
          chatId: msgChatId,
          chatType,
          text,
          date,
        };

        if (msg.senderId) {
          entry.senderId = Number(msg.senderId.toString());
        }

        if (isChannel) {
          const numericId = String(msgChatId).replace(/^-100/, '');
          entry.permalink = `https://t.me/c/${numericId}/${msg.id}`;
        }

        return entry;
      });
  }

  function getSessionString(): string {
    return client.session.save() as unknown as string;
  }

  function isAuthenticated(): boolean {
    return authenticated;
  }

  return {
    getClient: () => client,
    connect,
    disconnect,
    sendCode,
    signIn,
    signIn2FA,
    getAccountInfo,
    getDialogs,
    getMessages,
    getSessionString,
    isAuthenticated,
  };
}

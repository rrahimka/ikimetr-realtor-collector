import { describe, it, expect } from 'vitest';
import {
  isPermittedTelegramAuthorizedMessage,
  aggregateTelegramMessages,
  scanTelegramAuthorizedMessages,
  type TelegramAuthorizedMessage,
} from './telegram-authorized';

describe('Telegram Authorized Connector & Lead Intelligence', () => {
  it('1. Strictly rejects private DMs and secret chats from processing', () => {
    const dmMsg: TelegramAuthorizedMessage = {
      id: 1,
      chatId: 12345,
      chatType: 'chat',
      isPrivateDm: true,
      senderUsername: 'private_user',
      text: 'Salam, ev satıram',
      date: '2026-08-27T10:00:00.000Z',
    };
    expect(isPermittedTelegramAuthorizedMessage(dmMsg)).toBe(false);

    const scan = scanTelegramAuthorizedMessages([dmMsg]);
    expect(scan.skippedPrivateDmCount).toBe(1);
    expect(scan.leadCandidates).toHaveLength(0);
    expect(scan.realtorEvidence).toHaveLength(0);
  });

  it('2. Aggregates multi-message intent from the same sender in the same group within window', () => {
    const messages: TelegramAuthorizedMessage[] = [
      {
        id: 101,
        chatId: -100123456789,
        chatTitle: 'Baku Real Estate Group',
        chatType: 'supergroup',
        senderUsername: 'elvin_buyer',
        senderDisplayName: 'Elvin',
        text: 'Yasamalda 2 otaqlı mənzil axtarıram',
        date: '2026-08-27T12:00:00.000Z',
      },
      {
        id: 102,
        chatId: -100123456789,
        chatTitle: 'Baku Real Estate Group',
        chatType: 'supergroup',
        senderUsername: 'elvin_buyer',
        senderDisplayName: 'Elvin',
        text: 'Büdcə 180 min AZN-ə qədər',
        date: '2026-08-27T12:02:00.000Z',
      },
      {
        id: 103,
        chatId: -100123456789,
        chatTitle: 'Baku Real Estate Group',
        chatType: 'supergroup',
        senderUsername: 'elvin_buyer',
        senderDisplayName: 'Elvin',
        text: 'Təmirli olsa yaxşı olar',
        date: '2026-08-27T12:04:00.000Z',
      },
    ];

    const aggregated = aggregateTelegramMessages(messages);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]!.text).toContain('Yasamalda 2 otaqlı mənzil axtarıram');
    expect(aggregated[0]!.text).toContain('Büdcə 180 min AZN-ə qədər');

    const scan = scanTelegramAuthorizedMessages(messages);
    expect(scan.leadCandidates).toHaveLength(1);
    const lead = scan.leadCandidates[0]!;
    expect(lead.leadType).toBe('buyer');
    expect(lead.district).toBe('Yasamal');
    expect(lead.rooms).toBe(2);
    expect(lead.budgetMax).toBe(180000);
    expect(lead.username).toBe('elvin_buyer');
  });

  it('3. Classifies direct owner post as Seller Lead while rejecting from Realtor Evidence', () => {
    const ownerMsg: TelegramAuthorizedMessage = {
      id: 201,
      chatId: -100123456789,
      chatType: 'supergroup',
      senderUsername: 'anar_owner',
      text: 'Öz evimdir satıram, Nərimanovda 3 otaq mənzil. Maklerlər narahat etməsin! Tel: 050 777 88 99',
      date: '2026-08-27T14:00:00.000Z',
    };

    const scan = scanTelegramAuthorizedMessages([ownerMsg]);
    expect(scan.leadCandidates).toHaveLength(1);
    expect(scan.leadCandidates[0]!.leadType).toBe('seller');
    expect(scan.leadCandidates[0]!.district).toBe('Nərimanov');
    expect(scan.leadCandidates[0]!.rooms).toBe(3);
    expect(scan.leadCandidates[0]!.normalizedPhone).toBe('+994507778899');

    // Must NOT create realtor evidence for owner
    expect(scan.realtorEvidence).toHaveLength(0);
  });

  it('4. Classifies Realtor looking for client as realtor_request and flags isRealtorSender', () => {
    const realtorMsg: TelegramAuthorizedMessage = {
      id: 301,
      chatId: -100123456789,
      chatType: 'supergroup',
      senderUsername: 'baku_agent_pro',
      text: 'Müştəri üçün Xətaidə 2 otaqlı mənzil axtarırıq, büdcə 150 min. Əlaqə: 055 444 33 22 (Əmlak Agentliyi)',
      date: '2026-08-27T15:00:00.000Z',
    };

    const scan = scanTelegramAuthorizedMessages([realtorMsg]);
    expect(scan.leadCandidates).toHaveLength(1);
    expect(scan.leadCandidates[0]!.leadType).toBe('realtor_request');
    expect(scan.leadCandidates[0]!.isRealtorSender).toBe(true);

    // Creates Realtor evidence because it is an explicit agency/realtor
    expect(scan.realtorEvidence).toHaveLength(1);
    expect(scan.realtorEvidence[0]!.rawPhone).toBe('055 444 33 22');
  });

  it('5. Classifies comment/reply to property post as potential buyer candidate', () => {
    const commentMsg: TelegramAuthorizedMessage = {
      id: 402,
      chatId: -100123456789,
      chatType: 'supergroup',
      replyToMessageId: 401,
      replyToText: 'Nərimanov rayonunda 3 otaqlı super təmirli mənzil satılır',
      senderUsername: 'buyer_guest',
      text: 'Qiyməti neçəyədir? İpoteka ilə mümkündür?',
      date: '2026-08-27T16:00:00.000Z',
    };

    const scan = scanTelegramAuthorizedMessages([commentMsg]);
    expect(scan.leadCandidates).toHaveLength(1);
    expect(scan.leadCandidates[0]!.leadType).toBe('buyer');
    expect(scan.leadCandidates[0]!.district).toBe('Nərimanov');
    expect(scan.leadCandidates[0]!.sourceSurface).toBe('replies');
  });
});

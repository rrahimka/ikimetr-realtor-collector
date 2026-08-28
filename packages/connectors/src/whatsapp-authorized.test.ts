import { describe, expect, it } from 'vitest';
import {
  scanWhatsAppAuthorizedGroup,
  type WhatsAppAuthorizedMessage,
  type WhatsAppAuthorizedParticipant,
} from './whatsapp-authorized';
import type { WhatsAppGroupData } from '@ikimetr/core';

describe('WhatsApp Authorized Group Scanner', () => {
  const approvedRealtorGroup: WhatsAppGroupData = {
    id: 'wa-group-101',
    name: 'Bakı Maklerlər və Əmlak Agentləri',
    description: 'Rieltorlar üçün daxili elanlar qrupu',
    status: 'active',
    authorized: true,
    authorizedAt: '2026-08-28T00:00:00Z',
    isRealtorOnlyGroup: true,
    searchMode: 'both',
  };

  const unapprovedGroup: WhatsAppGroupData = {
    id: 'wa-group-102',
    name: 'Əmlak Bazar',
    status: 'active',
    authorized: false,
    isRealtorOnlyGroup: false,
    searchMode: 'both',
  };

  it('strictly rejects unapproved groups and processes 0 items', () => {
    const messages: WhatsAppAuthorizedMessage[] = [
      {
        id: 'msg-1',
        groupId: 'wa-group-102',
        groupTitle: 'Əmlak Bazar',
        text: 'Nərimanovda 2 otaqlı kirayə mənzil axtarıram 0501234567',
        date: '2026-08-28T10:00:00Z',
      },
    ];

    const result = scanWhatsAppAuthorizedGroup(messages, unapprovedGroup);
    expect(result.scannedCount).toBe(0);
    expect(result.leadCandidates.length).toBe(0);
    expect(result.realtorEvidence.length).toBe(0);
    expect(result.skippedUnapprovedCount).toBe(1);
  });

  it('strictly rejects and ignores private 1-to-1 direct messages', () => {
    const messages: WhatsAppAuthorizedMessage[] = [
      {
        id: 'msg-dm',
        groupId: '',
        groupTitle: 'Direct Chat',
        isPrivateDm: true,
        text: 'Salam, ev satıram 0509998877',
        date: '2026-08-28T10:00:00Z',
      },
    ];

    const result = scanWhatsAppAuthorizedGroup(messages, approvedRealtorGroup);
    expect(result.leadCandidates.length).toBe(0);
    expect(result.realtorEvidence.length).toBe(0);
    expect(result.skippedPrivateDmCount).toBe(1);
  });

  it('scans approved groups for Lead Intelligence intent', () => {
    const messages: WhatsAppAuthorizedMessage[] = [
      {
        id: 'msg-lead-1',
        groupId: 'wa-group-101',
        groupTitle: 'Bakı Maklerlər',
        senderPhone: '050 222 33 44',
        senderDisplayName: 'Elvin Əliyev',
        text: 'Nəsimi bazarının yanında 3 otaqlı mənzil kirayə axtarıram, büdcə 800 AZN. Təcili!',
        date: '2026-08-28T11:00:00Z',
      },
    ];

    const result = scanWhatsAppAuthorizedGroup(messages, approvedRealtorGroup);
    expect(result.leadCandidates.length).toBe(1);
    const lead = result.leadCandidates[0];
    expect(lead?.leadType).toBe('renter');
    expect(lead?.normalizedPhone).toBe('+994502223344');
    expect(lead?.sourcePlatform).toBe('whatsapp');
    expect(lead?.displayName).toBe('Elvin Əliyev');
  });

  it('extracts realtor candidates from visible participants in confirmed realtor-only groups', () => {
    const participants: WhatsAppAuthorizedParticipant[] = [
      { id: 'user-1', phoneNumber: '055 777 66 55', displayName: 'Rieltor Samir' },
      { id: 'user-2', phoneNumber: '+994 70 888 99 00', displayName: 'Bakı Əmlak Agentliyi' },
      { id: 'user-3', displayName: 'Hidden Number User' }, // No phone exposed
    ];

    const result = scanWhatsAppAuthorizedGroup([], approvedRealtorGroup, participants);
    expect(result.participantCandidatesCount).toBe(2);
    expect(result.realtorEvidence.length).toBe(2);
    expect(result.realtorEvidence[0]?.rawPhone).toBe('055 777 66 55');
    expect(result.realtorEvidence[1]?.rawPhone).toBe('+994 70 888 99 00');
    expect(result.realtorEvidence[0]?.platform).toBe('whatsapp');
  });

  it('does NOT extract participants from generic groups marked as realtor-only without context verification', () => {
    const genericChatGroup: WhatsAppGroupData = {
      id: 'wa-group-999',
      name: 'Baku Chat & Sohbet Qrupu',
      status: 'active',
      authorized: true,
      isRealtorOnlyGroup: true, // User mistakenly checked it, but context is generic
      searchMode: 'both',
    };

    const participants: WhatsAppAuthorizedParticipant[] = [
      { id: 'user-1', phoneNumber: '055 777 66 55', displayName: 'Non-realtor member' },
    ];

    const result = scanWhatsAppAuthorizedGroup([], genericChatGroup, participants);
    // Should be rejected by isRealtorGroupContext guard
    expect(result.participantCandidatesCount).toBe(0);
    expect(result.realtorEvidence.length).toBe(0);
  });
});

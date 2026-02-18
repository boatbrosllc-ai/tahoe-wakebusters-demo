/**
 * Waiver email adapter interface.
 * Implementations: Brevo (lib/waiver/email-brevo.ts), optional SendGrid later.
 */

export interface WaiverInviteParams {
  to: string;
  name: string;
  signingUrl: string;
  bookingSummary: {
    experienceName?: string;
    tripDate?: string;
    startTime?: string;
    endTime?: string;
    partySize?: number;
  };
}

export interface WaiverReminderParams {
  to: string;
  name: string;
  signingUrl: string;
  bookingSummary: {
    experienceName?: string;
    tripDate?: string;
    startTime?: string;
    endTime?: string;
    partySize?: number;
  };
}

export interface WaiverEmailAdapter {
  sendWaiverInvite(params: WaiverInviteParams): Promise<void>;
  sendWaiverReminder(params: WaiverReminderParams): Promise<void>;
}

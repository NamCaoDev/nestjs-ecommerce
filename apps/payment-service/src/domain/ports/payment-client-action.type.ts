/**
 * What the customer must do to pay: follow a redirect, scan a QR code, or transfer to a virtual account.
 */
export type PaymentClientAction =
  | { readonly type: 'REDIRECT'; readonly url: string }
  | {
      readonly type: 'QR_CODE';
      readonly qrContent: string;
      readonly qrImageUrl?: string;
    }
  | {
      readonly type: 'VIRTUAL_ACCOUNT';
      readonly bankBin: string;
      readonly accountNumber: string;
      readonly accountName: string;
      readonly expiresAt: Date;
    };

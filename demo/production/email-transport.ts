/** Server-side adapter contract. No browser SMTP and no live transport configured. */
export type DeliveryOutcome={kind:'simulated'}|{kind:'accepted';providerId:string}|{kind:'known_failure';retryable:boolean}|{kind:'uncertain'};
export interface EmailTransport{configured:boolean;send(message:{id:string;recipient:string;subject:string;text:string},idempotencyKey:string):Promise<DeliveryOutcome>}
export const unconfiguredTransport:EmailTransport={configured:false,async send(){throw Error('Email delivery is not configured.');}};
export const fakeTransport:EmailTransport={configured:false,async send(){return {kind:'simulated'};}};

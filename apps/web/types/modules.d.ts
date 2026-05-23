// Ambient types for npm packages that ship without TypeScript declarations.

declare module "africastalking" {
  interface SmsSendArgs {
    to: string | string[]
    message: string
    from?: string
    enqueue?: boolean
  }
  interface SmsClient {
    send(args: SmsSendArgs): Promise<unknown>
  }
  interface AfricasTalkingClient {
    SMS: SmsClient
  }
  function africastalking(opts: { apiKey: string; username: string }): AfricasTalkingClient
  export = africastalking
}

declare module "paystack-node" {
  interface PaystackClient {
    transaction: {
      initialize(args: Record<string, unknown>): Promise<unknown>
      verify(reference: string): Promise<unknown>
    }
    customer: {
      create(args: Record<string, unknown>): Promise<unknown>
    }
  }
  function paystack(secretKey: string, env?: string): PaystackClient
  export = paystack
}

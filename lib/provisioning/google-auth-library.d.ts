declare module "google-auth-library" {
  export class GoogleAuth {
    constructor(opts: { scopes: string[] });
    getClient(): Promise<{ getAccessToken(): Promise<{ token?: string | null }> }>;
  }
}

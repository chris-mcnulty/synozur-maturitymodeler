import 'express-session';

declare module 'express-session' {
  interface SessionData {
    oauthRequest?: {
      response_type: string;
      client_id: string;
      redirect_uri: string;
      scope?: string;
      state?: string;
      code_challenge?: string;
      code_challenge_method?: string;
      nonce?: string;
      prompt?: string;
      max_age?: string;
    };
  }
}
declare module 'node-jose' {
  export interface KeyStore {
    add(key: string | Buffer, format: string): Promise<any>;
    get(kid: string): any;
    all(): any[];
  }
  
  export interface JWK {
    createKeyStore(): KeyStore;
    createKey(kty: string, size: number, props?: any): Promise<any>;
    asKey(key: string | Buffer, form: string): Promise<any>;
  }
  
  export const JWK: JWK;
}
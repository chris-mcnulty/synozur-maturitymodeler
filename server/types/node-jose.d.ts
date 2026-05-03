declare module 'node-jose' {
  namespace jose {
    namespace JWK {
      interface KeyStore {
        add(key: string | Buffer, format: string): Promise<any>;
        get(kid: string): any;
        all(): any[];
      }

      function createKeyStore(): KeyStore;
      function createKey(kty: string, size: number, props?: any): Promise<any>;
      function asKey(key: string | Buffer, form: string): Promise<any>;
    }
  }

  export = jose;
}

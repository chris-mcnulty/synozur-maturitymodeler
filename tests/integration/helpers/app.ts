import express, { type Express } from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import MemoryStore from 'memorystore';

const SessionMemoryStore = MemoryStore(session);

export interface TestUser {
  id: string;
  username: string;
  password: string;
  email?: string | null;
  name?: string | null;
  role: string;
  tenantId?: string | null;
  emailVerified?: boolean;
  [key: string]: any;
}

export interface BuildAppOptions {
  user?: TestUser | null;
  attachAuth?: boolean;
  storageImpl?: any;
}

/**
 * Build a minimal Express app for integration testing without invoking
 * the production session store (Postgres) or vite middleware.
 *
 * If a `user` is provided, request middleware fakes the passport API
 * (req.isAuthenticated / req.user / req.login / req.logout). This lets
 * us test routes that depend on session state without setting up the
 * full passport/session machinery.
 */
export function buildTestApp(opts: BuildAppOptions = {}): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use((req: any, _res, next) => {
    let currentUser: TestUser | null | undefined = opts.user ?? null;
    req.isAuthenticated = () => !!currentUser;
    req.user = currentUser ?? undefined;
    req.login = (u: any, cb: (err?: any) => void) => {
      currentUser = u;
      req.user = u;
      cb();
    };
    req.logout = (cb: (err?: any) => void) => {
      currentUser = null;
      req.user = undefined;
      cb();
    };
    next();
  });

  return app;
}

/**
 * Build an Express app wired with real passport + memory session store, for
 * tests that exercise actual login / logout flows. The local strategy looks
 * up users via the provided async user-lookup function.
 */
export function buildAuthApp(opts: {
  findUserByUsername: (u: string) => Promise<TestUser | undefined>;
  findUserById: (id: string) => Promise<TestUser | undefined>;
  comparePasswords: (supplied: string, stored: string) => Promise<boolean>;
}): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      store: new SessionMemoryStore({ checkPeriod: 60_000 }),
    })
  );

  const localPassport = new (passport.Passport as any)();
  localPassport.use(
    new LocalStrategy(async (username, password, done) => {
      const u = await opts.findUserByUsername(username);
      if (!u || !(await opts.comparePasswords(password, u.password))) {
        return done(null, false);
      }
      return done(null, u);
    })
  );
  localPassport.serializeUser((u: any, done: any) => done(null, u.id));
  localPassport.deserializeUser(async (id: string, done: any) => {
    try {
      const u = await opts.findUserById(id);
      done(null, u || false);
    } catch (e) {
      done(e);
    }
  });

  app.use(localPassport.initialize());
  app.use(localPassport.session());
  (app as any).__passport = localPassport;
  return app;
}

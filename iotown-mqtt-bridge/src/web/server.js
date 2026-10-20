const fs = require('fs');
const path = require('path');
const Fastify = require('fastify');
const fastifyCookie = require('@fastify/cookie');
const fastifyStatic = require('@fastify/static');
const { z, ZodError } = require('zod');
const config = require('../config');
const { updateConfigFile } = require('../config-store');
const logger = require('../logger');
const { ADMIN_USER, AuthStore, Sessions, LoginLimiter } = require('./auth');
const { ChirpStackApiError, checkAccess, listApplications, listGateways } = require('./chirpstack-api');
const { version } = require('../../package.json');

const SESSION_COOKIE = 'bridge_session';
const UI_DIR = process.env.UI_DIR || path.join(__dirname, '..', '..', 'ui', 'dist');
const MAX_STREAMS = 8;

class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message || code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

// The REST API of the ChirpStack installed alongside the bridge
const DEFAULT_API_URL = process.env.CHIRPSTACK_API_URL || 'http://chirpstack-rest-api:8090';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = z.string().trim().toLowerCase().regex(UUID_RE, 'INVALID_APPLICATION_ID');
const gatewayId = z.string().trim().toLowerCase().regex(/^[0-9a-f]{16}$/, 'INVALID_GATEWAY_ID');
// IOTOWN group IDs are UUIDs; they end up in MQTT topics (iotown/{group}/...)
const groupId = z.string().trim().toLowerCase().regex(UUID_RE, 'INVALID_GROUP_ID');
// The default groups may be empty: data without a mapping is then not forwarded
const defaultGroupId = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === '' || UUID_RE.test(v), 'INVALID_GROUP_ID');

const mappingSchema = z
  .object({
    applications: z.array(z.object({ applicationId: uuid, groupId })).max(500),
    defaultGroupId,
    excludeApplications: z.array(uuid).max(500),
    gateways: z.array(z.object({ gatewayId, groupId })).max(500),
    defaultGatewayGroupId: defaultGroupId,
    downlink: z.object({
      defaultFPort: z.number().int().min(1).max(223),
      defaultConfirmed: z.boolean()
    })
  })
  .superRefine((v, ctx) => {
    const apps = v.applications.map((a) => a.applicationId);
    if (new Set(apps).size !== apps.length) {
      ctx.addIssue({ code: 'custom', path: ['applications'], message: 'DUPLICATE_APPLICATION' });
    }
    const gws = v.gateways.map((g) => g.gatewayId);
    if (new Set(gws).size !== gws.length) {
      ctx.addIssue({ code: 'custom', path: ['gateways'], message: 'DUPLICATE_GATEWAY' });
    }
  });

// Secrets: undefined keeps the stored value, null clears it, a string replaces it
const secret = z.string().max(2048).nullable().optional();

const connectionSchema = z.object({
  // external: false = the ChirpStack installed alongside (no address or login needed)
  chirpstack: z
    .object({
      external: z.boolean(),
      host: z.string().trim().max(253).regex(/^[^\s/]*$/, 'INVALID_HOST').optional(),
      port: z.number().int().min(1).max(65535).optional(),
      tls: z.boolean().optional(),
      rejectUnauthorized: z.boolean().optional(),
      username: z.string().trim().max(128),
      password: secret
    })
    .refine((v) => !v.external || (v.host && v.port), { message: 'INVALID_HOST', path: ['host'] }),
  iotown: z.object({
    host: z.string().trim().min(1).max(253).regex(/^[^\s/]+$/, 'INVALID_HOST'),
    port: z.number().int().min(1).max(65535),
    username: z.string().trim().min(1).max(128),
    password: secret,
    rejectUnauthorized: z.boolean()
  }),
  chirpstackApi: z.object({ url: z.url().max(512).optional(), token: secret })
});

const logLevelSchema = z.object({ logLevel: z.enum(['error', 'warn', 'info', 'debug']) });

function setSecret(doc, keyPath, value) {
  if (value === null) {
    doc.deleteIn(keyPath);
  } else if (value) {
    doc.setIn(keyPath, value);
  }
}

function currentConfigView() {
  return {
    mapping: {
      applications: Object.entries(config.appGroupMapping).map(([applicationId, gid]) => ({ applicationId, groupId: gid })),
      defaultGroupId: config.defaultGroupId,
      excludeApplications: config.excludeApplications,
      gateways: Object.entries(config.gatewayGroupMapping).map(([gwId, gid]) => ({ gatewayId: gwId, groupId: gid })),
      defaultGatewayGroupId: config.defaultGatewayGroupId,
      downlink: { ...config.downlink }
    },
    connection: {
      chirpstack: {
        external: config.chirpstack.external,
        host: config.chirpstack.host,
        port: config.chirpstack.port,
        tls: config.chirpstack.protocol === 'mqtts',
        rejectUnauthorized: config.chirpstack.rejectUnauthorized,
        username: config.chirpstack.username,
        passwordSet: Boolean(config.chirpstack.password)
      },
      iotown: {
        host: config.iotown.host || '',
        port: config.iotown.port,
        username: config.iotown.username || '',
        passwordSet: Boolean(config.iotown.password),
        rejectUnauthorized: config.iotown.rejectUnauthorized
      },
      // Only the last 4 characters of the API key go back to the browser, to show which key is stored
      chirpstackApi: {
        url: config.chirpstackApi.url,
        tokenSet: Boolean(config.chirpstackApi.token),
        tokenHint: config.chirpstackApi.token ? config.chirpstackApi.token.slice(-4) : null
      }
    },
    logLevel: config.logLevel
  };
}

async function startWebServer(bridge) {
  const port = parseInt(process.env.WEB_PORT || '8081', 10);
  const auth = new AuthStore(path.join(path.dirname(config.path), 'web-auth.json'));
  const sessions = new Sessions();
  const limiter = new LoginLimiter();
  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'strict', secure: false };
  let activeStreams = 0;

  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  await app.register(fastifyCookie);

  const PUBLIC = new Set(['/api/auth/login', '/api/auth/me']);
  const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['/api/auth/password', '/api/auth/logout']);

  app.addHook('onRequest', async (req, reply) => {
    const urlPath = req.url.split('?')[0];
    if (!urlPath.startsWith('/api/')) {
      return;
    }
    reply.header('Cache-Control', 'no-store');
    if (PUBLIC.has(urlPath)) {
      return;
    }
    if (!sessions.touch(req.cookies[SESSION_COOKIE])) {
      throw new HttpError(401, 'UNAUTHORIZED');
    }
    if (!ALLOWED_BEFORE_PASSWORD_CHANGE.has(urlPath) && (await auth.mustChange())) {
      throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED');
    }
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: err.issues });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err instanceof ChirpStackApiError) {
      // A problem with the ChirpStack API address or key, not with bridging: keep it out of the recent errors
      logger.warn(err.message);
      return reply.code(502).send({ error: err.code, message: err.message });
    }
    const status = err.statusCode || 500;
    if (status >= 500) {
      logger.error('Web UI error:', err.message);
    }
    return reply.code(status).send({ error: status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message: err.message });
  });

  // --- Auth ---
  app.post('/api/auth/login', async (req, reply) => {
    const wait = limiter.check(req.ip);
    if (wait > 0) {
      reply.header('Retry-After', String(wait));
      throw new HttpError(429, 'TOO_MANY_ATTEMPTS');
    }
    const { username, password } = z.object({ username: z.string(), password: z.string() }).parse(req.body);
    if (!(await auth.verify(username, password))) {
      limiter.fail(req.ip);
      throw new HttpError(401, 'INVALID_CREDENTIALS');
    }
    limiter.reset(req.ip);
    reply.setCookie(SESSION_COOKIE, sessions.create(), cookieOptions);
    return { username: ADMIN_USER, mustChangePassword: await auth.mustChange() };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    sessions.destroy(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    if (!sessions.touch(req.cookies[SESSION_COOKIE])) {
      return { authenticated: false, version };
    }
    return { authenticated: true, username: ADMIN_USER, mustChangePassword: await auth.mustChange(), version };
  });

  app.post('/api/auth/password', async (req) => {
    const { currentPassword, newPassword } = z
      .object({
        currentPassword: z.string(),
        newPassword: z
          .string()
          .min(8, 'PASSWORD_TOO_SHORT')
          .max(128)
          .refine((v) => v !== 'admin', 'PASSWORD_TOO_WEAK')
      })
      .parse(req.body);
    if (!(await auth.verify(ADMIN_USER, currentPassword))) {
      throw new HttpError(400, 'WRONG_CURRENT_PASSWORD');
    }
    await auth.setPassword(newPassword);
    sessions.destroyAllExcept(req.cookies[SESSION_COOKIE]);
    return { ok: true };
  });

  // --- Status and settings ---
  app.get('/api/status', async () => ({ ...bridge.status(), recentErrors: logger.recentErrors(), version }));

  app.get('/api/config', async () => currentConfigView());

  // Mapping is read at message time, so saving applies immediately without reconnecting
  app.put('/api/config/mapping', async (req) => {
    const m = mappingSchema.parse(req.body);
    updateConfigFile((doc) => {
      doc.set('appGroupMapping', doc.createNode(Object.fromEntries(m.applications.map((a) => [a.applicationId, a.groupId]))));
      doc.set('defaultGroupId', m.defaultGroupId);
      doc.set('excludeApplications', doc.createNode(m.excludeApplications));
      doc.set('gatewayGroupMapping', doc.createNode(Object.fromEntries(m.gateways.map((g) => [g.gatewayId, g.groupId]))));
      doc.set('defaultGatewayGroupId', m.defaultGatewayGroupId);
      doc.setIn(['downlink', 'defaultFPort'], m.downlink.defaultFPort);
      doc.setIn(['downlink', 'defaultConfirmed'], m.downlink.defaultConfirmed);
    });
    logger.info('Mapping updated from the web UI');
    return currentConfigView();
  });

  app.put('/api/config/connection', async (req) => {
    const c = connectionSchema.parse(req.body);
    // The mapping page lists applications and gateways through the ChirpStack API, so a key is required
    const token = c.chirpstackApi.token;
    if (token === null || (!token && !config.chirpstackApi.token)) {
      throw new HttpError(400, 'API_TOKEN_REQUIRED');
    }
    const external = c.chirpstack.external;
    if (external && !c.chirpstackApi.url) {
      throw new HttpError(400, 'INVALID_API_URL');
    }
    const apiUrl = external ? c.chirpstackApi.url : DEFAULT_API_URL;
    // A new API address or key is tried before it is saved, so a wrong one is never stored
    if (token || apiUrl !== config.chirpstackApi.url) {
      await checkAccess(apiUrl, token || config.chirpstackApi.token);
    }
    const csState = () =>
      JSON.stringify([config.chirpstack.host, config.chirpstack.port, config.chirpstack.protocol, config.chirpstack.rejectUnauthorized, config.chirpstack.username, config.chirpstack.password]);
    const before = csState();
    const beforeIotown = JSON.stringify([config.iotown.host, config.iotown.port, config.iotown.username, config.iotown.password, config.iotown.rejectUnauthorized]);

    updateConfigFile((doc) => {
      if (external) {
        doc.setIn(['chirpstack', 'mqtt', 'host'], c.chirpstack.host);
        doc.setIn(['chirpstack', 'mqtt', 'port'], c.chirpstack.port);
        doc.setIn(['chirpstack', 'mqtt', 'tls'], Boolean(c.chirpstack.tls));
        doc.setIn(['chirpstack', 'mqtt', 'rejectUnauthorized'], c.chirpstack.rejectUnauthorized !== false);
        doc.setIn(['chirpstack', 'mqtt', 'username'], c.chirpstack.username);
        setSecret(doc, ['chirpstack', 'mqtt', 'password'], c.chirpstack.password);
        doc.setIn(['chirpstack', 'api', 'url'], apiUrl);
      } else {
        // Back to the ChirpStack installed alongside: its broker has no login
        for (const key of ['host', 'port', 'tls', 'rejectUnauthorized', 'password']) doc.deleteIn(['chirpstack', 'mqtt', key]);
        doc.setIn(['chirpstack', 'mqtt', 'username'], '');
        doc.deleteIn(['chirpstack', 'api', 'url']);
      }
      doc.setIn(['iotown', 'mqtt', 'host'], c.iotown.host);
      doc.setIn(['iotown', 'mqtt', 'port'], c.iotown.port);
      doc.setIn(['iotown', 'mqtt', 'username'], c.iotown.username);
      setSecret(doc, ['iotown', 'mqtt', 'password'], c.iotown.password);
      doc.setIn(['iotown', 'mqtt', 'rejectUnauthorized'], c.iotown.rejectUnauthorized);
      setSecret(doc, ['chirpstack', 'api', 'token'], c.chirpstackApi.token);
    });

    const chirpstack = before !== csState();
    const iotown = beforeIotown !== JSON.stringify([config.iotown.host, config.iotown.port, config.iotown.username, config.iotown.password, config.iotown.rejectUnauthorized]);
    logger.info(`Connection settings updated from the web UI (reconnect ChirpStack: ${chirpstack}, IOTOWN: ${iotown})`);
    bridge.reconnect({ chirpstack, iotown });
    return currentConfigView();
  });

  // Set from the log page; the logger reads it on every line, so it applies right away
  app.put('/api/config/log-level', async (req) => {
    const { logLevel } = logLevelSchema.parse(req.body);
    updateConfigFile((doc) => doc.set('logLevel', logLevel));
    logger.info(`Log level set to ${logLevel} from the web UI`);
    return currentConfigView();
  });

  // Names for the mapping screen; without an API key the mapping screen asks for one
  app.get('/api/chirpstack/applications', async () => {
    if (!config.chirpstackApi.token) {
      return { configured: false, items: [] };
    }
    return { configured: true, items: await listApplications() };
  });

  app.get('/api/chirpstack/gateways', async () => {
    if (!config.chirpstackApi.token) {
      return { configured: false, items: [] };
    }
    return { configured: true, items: await listGateways() };
  });

  // --- Live log (Server-Sent Events): recent lines first, then new ones ---
  app.get('/api/logs/stream', async (req, reply) => {
    const { lines } = z.object({ lines: z.coerce.number().int().min(0).max(2000).default(300) }).parse(req.query);
    if (activeStreams >= MAX_STREAMS) {
      throw new HttpError(429, 'TOO_MANY_STREAMS');
    }
    const sid = req.cookies[SESSION_COOKIE];

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff'
    });
    res.write('retry: 3000\n\nevent: reset\ndata: {}\n\n');
    activeStreams += 1;

    let batch = logger.recentLines(lines);
    let closed = false;
    const flush = () => {
      if (batch.length > 0 && !closed) {
        res.write(`data: ${JSON.stringify(batch)}\n\n`);
        batch = [];
      }
    };
    flush();
    const unsubscribe = logger.subscribe((line) => batch.push(line));
    const flushTimer = setInterval(flush, 250);
    const heartbeat = setInterval(() => {
      // An open stream counts as activity; logging out or a password change ends it
      if (sessions.touch(sid)) {
        res.write(': ping\n\n');
      } else {
        close();
      }
    }, 15000);
    const close = () => {
      if (closed) {
        return;
      }
      flush();
      closed = true;
      activeStreams -= 1;
      unsubscribe();
      clearInterval(flushTimer);
      clearInterval(heartbeat);
      res.end();
    };
    req.raw.on('close', close);
  });

  if (fs.existsSync(UI_DIR)) {
    await app.register(fastifyStatic, {
      root: UI_DIR,
      cacheControl: false,
      setHeaders(res, filePath) {
        // Hashed build assets never change; index.html must always be fresh
        res.header('Cache-Control', filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      }
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  }

  await app.listen({ host: '0.0.0.0', port });
  logger.info(`Web UI listening on port ${port}`);
  return app;
}

module.exports = { startWebServer };

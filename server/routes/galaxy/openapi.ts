import { GALAXY_SCOPES, GALAXY_EVENT_TYPES } from '@shared/schema';

export function buildGalaxyOpenApi() {
  const scopeMap: Record<string, string> = {};
  for (const s of GALAXY_SCOPES) scopeMap[s] = `Grants Galaxy access for: ${s}`;

  const envelopeSchema = (dataSchema: any) => ({
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: dataSchema,
      pagination: {
        type: 'object',
        properties: {
          nextCursor: { type: 'string', nullable: true },
          limit: { type: 'integer' },
        },
      },
      meta: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
          tenantId: { type: 'string', nullable: true },
          userId: { type: 'string', nullable: true },
        },
      },
    },
  });

  const stubResponse = (note: string) => ({
    '200': {
      description: `${note} (currently returns an empty collection — endpoint reserved for forward compatibility)`,
      content: {
        'application/json': {
          schema: envelopeSchema({ type: 'array', items: { type: 'object' } }),
        },
      },
    },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Orion Galaxy Client Portal API',
      version: '1.0.0',
      description:
        'OAuth-protected, tenant-scoped API exposing Orion assessments, results, and insights to the Galaxy client portal. All authenticated endpoints require a bearer token issued by Orion with the `galaxy_portal` scope plus the operation-specific scope. Per-tenant exposure policy further controls which artifacts are visible. Responses use a uniform `{ data, pagination, meta }` envelope.',
    },
    servers: [{ url: '/api/galaxy/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: '/oauth/authorize',
              tokenUrl: '/oauth/token',
              scopes: scopeMap,
            },
          },
        },
      },
      schemas: {
        Me: {
          type: 'object',
          required: ['userId', 'tenantId', 'scopes'],
          properties: {
            userId: { type: 'string' },
            email: { type: 'string', nullable: true },
            name: { type: 'string', nullable: true },
            role: { type: 'string', nullable: true },
            tenantId: { type: 'string', nullable: true },
            tenant: {
              type: 'object',
              properties: {
                id: { type: 'string', nullable: true },
                name: { type: 'string', nullable: true },
                logoUrl: { type: 'string', nullable: true },
                primaryColor: { type: 'string', nullable: true },
              },
            },
            branding: {
              type: 'object',
              properties: {
                logoUrl: { type: 'string', nullable: true },
                primaryColor: { type: 'string', nullable: true },
              },
            },
            scopes: { type: 'array', items: { type: 'string' } },
            clientId: { type: 'string' },
          },
        },
        Artifact: {
          type: 'object',
          required: ['id', 'type', 'title'],
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['assessment', 'result', 'insight'] },
            title: { type: 'string' },
            modelId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            score: { type: 'number', nullable: true },
            label: { type: 'string', nullable: true },
          },
        },
        Assessment: {
          type: 'object',
          required: ['id', 'modelId', 'status'],
          properties: {
            id: { type: 'string' },
            modelId: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'in_progress', 'completed'] },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            score: { type: 'number', nullable: true },
            label: { type: 'string', nullable: true },
          },
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            error_description: { type: 'string' },
          },
        },
        WebhookEvent: {
          type: 'object',
          required: ['id', 'type', 'tenantId', 'occurredAt', 'data'],
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: [...GALAXY_EVENT_TYPES] },
            tenantId: { type: 'string' },
            occurredAt: { type: 'string', format: 'date-time' },
            data: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/me': {
        get: {
          summary: 'Resolve the current user, tenant, branding hints, and granted scopes.',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: envelopeSchema({ $ref: '#/components/schemas/Me' }),
                },
              },
            },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/artifacts': {
        get: {
          summary: 'List artifacts (assessments + results + insights) visible under the tenant policy.',
          parameters: [
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['assessment', 'result', 'insight'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
            { name: 'after', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: envelopeSchema({ type: 'array', items: { $ref: '#/components/schemas/Artifact' } }),
                },
              },
            },
          },
        },
      },
      '/assessments': {
        get: {
          summary: "List the current user's assessments visible under the tenant policy.",
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
            { name: 'after', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: envelopeSchema({ type: 'array', items: { $ref: '#/components/schemas/Assessment' } }),
                },
              },
            },
          },
        },
      },
      '/assessments/{id}': {
        get: {
          summary: 'Fetch one assessment with its result if completed.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'OK' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/insights/me': {
        get: {
          summary: 'Personal insights summary for the current user.',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/courses': {
        get: {
          summary: 'List available courses (forward-compat stub).',
          description: 'Not implemented in this Orion deployment yet. See PRODUCT_BACKLOG for the deferred-endpoint list.',
          responses: stubResponse('Courses listing'),
        },
      },
      '/attestations': {
        get: {
          summary: 'List attestations (forward-compat stub).',
          description: 'Not implemented in this Orion deployment yet. See PRODUCT_BACKLOG for the deferred-endpoint list.',
          responses: stubResponse('Attestations listing'),
        },
      },
      '/certificates': {
        get: {
          summary: 'List certificates (forward-compat stub).',
          description: 'Not implemented in this Orion deployment yet. See PRODUCT_BACKLOG for the deferred-endpoint list.',
          responses: stubResponse('Certificates listing'),
        },
      },
    },
    'x-deferred-endpoints': {
      description:
        'These endpoints are part of the Galaxy contract but are not yet implemented in Orion because the underlying entities/features do not exist in this codebase. They are tracked as follow-up work and will be added without breaking the v1 contract once the entities exist.',
      endpoints: [
        'POST /assessments',
        'POST /assessments/{id}/responses',
        'POST /assessments/{id}/complete',
        'GET /courses/{id}',
        'POST /courses/{id}/progress',
        'POST /courses/{id}/quiz',
        'POST /attestations/{id}/sign',
        'GET /certificates/{id}.pdf',
        'GET /admin/directory (client_credentials, requires admin.directory.read)',
      ],
    },
  };
}

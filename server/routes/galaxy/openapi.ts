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
        Course: {
          type: 'object',
          required: ['id', 'slug', 'title', 'enrollment'],
          properties: {
            id: { type: 'string' },
            slug: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            estimatedMinutes: { type: 'integer', nullable: true },
            imageUrl: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            enrollment: {
              type: 'object',
              required: ['status', 'progressPercent'],
              properties: {
                status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] },
                progressPercent: { type: 'integer', minimum: 0, maximum: 100 },
                startedAt: { type: 'string', format: 'date-time', nullable: true },
                completedAt: { type: 'string', format: 'date-time', nullable: true },
              },
            },
          },
        },
        Attestation: {
          type: 'object',
          required: ['id', 'title', 'body', 'version', 'status', 'signed'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            version: { type: 'string' },
            status: { type: 'string', enum: ['active', 'retired'] },
            signed: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            signature: {
              type: 'object',
              nullable: true,
              properties: {
                signedAt: { type: 'string', format: 'date-time' },
                signatureText: { type: 'string', nullable: true },
              },
            },
          },
        },
        Certificate: {
          type: 'object',
          required: ['id', 'title', 'serialNumber', 'sourceType', 'issuedAt'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            serialNumber: { type: 'string' },
            sourceType: { type: 'string', enum: ['assessment', 'course', 'attestation', 'manual'] },
            sourceId: { type: 'string', nullable: true },
            modelId: { type: 'string', nullable: true },
            issuedAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            pdfUrl: { type: 'string', nullable: true },
            revokedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        CourseEnrollment: {
          type: 'object',
          required: ['courseId', 'userId', 'status'],
          properties: {
            id: { type: 'string' },
            courseId: { type: 'string' },
            userId: { type: 'string' },
            status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] },
            progressPercent: { type: 'integer' },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        AttestationSignature: {
          type: 'object',
          required: ['attestationId', 'userId', 'signedAt'],
          properties: {
            id: { type: 'string' },
            attestationId: { type: 'string' },
            userId: { type: 'string' },
            signedAt: { type: 'string', format: 'date-time' },
            signatureText: { type: 'string', nullable: true },
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
          summary: "List published courses available to the current user, with the user's enrollment progress.",
          description: 'Returns courses the user is allowed to see (tenant-scoped, gated by per-resource audienceRoles). Each course is augmented with the user\'s enrollment status and progress.',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
            { name: 'after', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: envelopeSchema({ type: 'array', items: { $ref: '#/components/schemas/Course' } }),
                },
              },
            },
          },
        },
      },
      '/courses/{id}/progress': {
        post: {
          summary: 'Record course progress for the current user.',
          description: 'Upserts the (course, user) enrollment with the provided status/progressPercent. A transition to `completed` triggers the `course.completed` Galaxy webhook event.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] },
                    progressPercent: { type: 'integer', minimum: 0, maximum: 100 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: envelopeSchema({
                    type: 'object',
                    properties: { enrollment: { $ref: '#/components/schemas/CourseEnrollment' } },
                  }),
                },
              },
            },
            '404': { description: 'Not found' },
          },
        },
      },
      '/attestations': {
        get: {
          summary: 'List active attestations applicable to the current user, with the signed flag.',
          description: 'Returns attestations the user is allowed to see (tenant-scoped, gated by per-resource audienceRoles). Each attestation is augmented with the user\'s signature record if present.',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
            { name: 'after', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: envelopeSchema({ type: 'array', items: { $ref: '#/components/schemas/Attestation' } }),
                },
              },
            },
          },
        },
      },
      '/attestations/{id}/sign': {
        post: {
          summary: 'Record the current user\'s signature on an attestation.',
          description: 'Idempotent. The first successful signature transition triggers the `attestation.signed` Galaxy webhook event.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { signatureText: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: envelopeSchema({
                    type: 'object',
                    properties: {
                      signature: { $ref: '#/components/schemas/AttestationSignature' },
                      created: { type: 'boolean' },
                    },
                  }),
                },
              },
            },
            '404': { description: 'Not found' },
            '409': { description: 'Attestation is not active' },
          },
        },
      },
      '/certificates': {
        get: {
          summary: "List certificates issued to the current user, gated by the tenant's exposeCertificates policy.",
          description: 'Returns certificates the user has earned. Filtered to model exposure when policy.exposedModelIds is set. Returns an empty list if exposeCertificates is disabled for the tenant.',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200, default: 50 } },
            { name: 'after', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: envelopeSchema({ type: 'array', items: { $ref: '#/components/schemas/Certificate' } }),
                },
              },
            },
          },
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
        'POST /courses/{id}/quiz',
        'GET /certificates/{id}.pdf',
        'GET /admin/directory (client_credentials, requires admin.directory.read)',
      ],
    },
  };
}

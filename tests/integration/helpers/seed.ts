import { randomBytes } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db } from '../../../server/db';
import { storage } from '../../../server/storage';
import * as schema from '../../../shared/schema';
import type { InsertModel } from '../../../shared/schema';

/**
 * Helper for hermetic-but-real Postgres seeding in the assessment + model
 * integration suites. Tests call its create*() helpers to insert fixtures
 * via the real DatabaseStorage, then invoke cleanup() in afterAll() to drop
 * everything via FK cascades.
 *
 * A per-suite prefix keeps fixtures from clashing with parallel suites or
 * pre-existing data.
 */
export class SeedHarness {
  readonly prefix: string;
  private counter = 0;
  private modelIds = new Set<string>();
  private userIds = new Set<string>();
  private importBatchIds = new Set<string>();

  constructor(label: string) {
    this.prefix = `t26_${label}_${randomBytes(4).toString('hex')}`;
  }

  next(): string {
    this.counter += 1;
    return `${this.prefix}_${this.counter}_${randomBytes(3).toString('hex')}`;
  }

  trackModel(id: string) { this.modelIds.add(id); return id; }
  trackUser(id: string) { this.userIds.add(id); return id; }
  trackImportBatch(id: string) { this.importBatchIds.add(id); return id; }

  async createUser(role = 'global_admin') {
    const username = this.next();
    const user = await storage.createUser({
      username,
      password: 'x',
      email: `${username}@example.test`,
      name: 'Test User',
      role,
    });
    this.trackUser(user.id);
    return user;
  }

  async createModel(overrides: Partial<InsertModel> = {}) {
    const slug = overrides.slug ?? this.next();
    const insert: InsertModel = {
      slug,
      name: overrides.name ?? `Model ${slug}`,
      description: overrides.description ?? 'desc',
      version: overrides.version ?? '1.0',
      status: overrides.status ?? 'published',
      visibility: overrides.visibility ?? 'public',
      modelClass: overrides.modelClass ?? 'organizational',
      maturityScale: overrides.maturityScale ?? [
        { id: '1', name: 'Nascent', description: '', minScore: 100, maxScore: 199 },
        { id: '2', name: 'Experimental', description: '', minScore: 200, maxScore: 299 },
        { id: '3', name: 'Operational', description: '', minScore: 300, maxScore: 399 },
        { id: '4', name: 'Strategic', description: '', minScore: 400, maxScore: 449 },
        { id: '5', name: 'Transformational', description: '', minScore: 450, maxScore: 500 },
      ],
      ...overrides,
    };
    const model = await storage.createModel(insert);
    this.trackModel(model.id);
    return model;
  }

  async createDimension(modelId: string, key: string, label: string, order: number) {
    return storage.createDimension({ modelId, key, label, description: '', order });
  }

  async createMcQuestion(modelId: string, dimensionId: string | null, text: string, order: number) {
    const q = await storage.createQuestion({
      modelId,
      dimensionId,
      text,
      type: 'multiple_choice',
      order,
    });
    const low = await storage.createAnswer({
      questionId: q.id, text: 'Low', score: 100, order: 1,
    });
    const high = await storage.createAnswer({
      questionId: q.id, text: 'Leading', score: 500, order: 2,
    });
    return { question: q, low, high };
  }

  async cleanup() {
    if (this.importBatchIds.size > 0) {
      await db.delete(schema.importBatches)
        .where(inArray(schema.importBatches.id, [...this.importBatchIds]));
    }
    if (this.modelIds.size > 0) {
      // Cascades drop dimensions, questions, answers, assessments,
      // responses, and results via FK ON DELETE CASCADE.
      await db.delete(schema.models)
        .where(inArray(schema.models.id, [...this.modelIds]));
    }
    if (this.userIds.size > 0) {
      await db.delete(schema.users)
        .where(inArray(schema.users.id, [...this.userIds]));
    }
  }
}

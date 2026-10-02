import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../server/db';
import { aiService } from '../../server/services/ai-service';

afterEach(() => vi.restoreAllMocks());

describe('personal-skills refreshed summary instructions', () => {
  it.each(['Director of QA Learning Partnerships', 'Other', undefined])('uses only the verified title (%s) and a 100-point score', async title => {
    vi.spyOn(db, 'select').mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ id: 'qa-model', modelClass: 'individual' }] }) }),
    } as any);
    const service = aiService as any;
    vi.spyOn(service, 'getKnowledgeVersionHash').mockResolvedValue('qa');
    vi.spyOn(service, 'getKnowledgeContext').mockResolvedValue('');
    const cacheRead = vi.spyOn(service, 'getCachedContent').mockResolvedValue('stale');
    const cacheWrite = vi.spyOn(service, 'saveToCache').mockResolvedValue(undefined);
    const provider = vi.spyOn(service, 'callProvider').mockResolvedValue('fresh summary');
    const result = await aiService.generateMaturitySummary(
      75, { a: { score: 85, label: 'AI Confidence' }, b: { score: 65, label: 'AI Safety' } },
      'QA Personal Skills', { jobTitle: title }, 100, false, 'mean_answer_values', 'Developing', true,
    );
    expect(result).toBe('fresh summary');
    expect(cacheRead).not.toHaveBeenCalled();
    const prompt = provider.mock.calls[0][0] as string;
    expect(prompt).toContain('Explicitly state the overall personal-skills score as "75 out of 100"');
    if (title && title !== 'Other') {
      expect(prompt).toContain(`explicitly include the exact current job title "${title}" once`);
    } else {
      expect(prompt).toContain('No verified job title was supplied');
    }
    expect(cacheWrite).toHaveBeenCalledWith('maturity_summary', expect.any(Object), 'fresh summary', true);
  });
});
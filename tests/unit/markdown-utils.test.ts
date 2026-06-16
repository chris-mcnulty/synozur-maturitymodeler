import { describe, it, expect } from 'vitest';
import { stripPreviewBullets } from '@/components/markdown-utils';

describe('stripPreviewBullets', () => {
  it('removes preview bullets that duplicate the headings rendered below them', () => {
    const input = [
      'Here is your roadmap. Priority actions to focus on:',
      '• Building Momentum',
      '• Improve Governance',
      '',
      '## Building Momentum',
      'Building Momentum means moving forward with focus.',
      '',
      '## Improve Governance',
      'Establish clear guardrails.',
    ].join('\n');

    const out = stripPreviewBullets(input);

    // The preview bullets are gone...
    expect(out).not.toContain('• Building Momentum');
    expect(out).not.toContain('• Improve Governance');
    // ...but the section headings (and their content) remain.
    expect(out).toContain('## Building Momentum');
    expect(out).toContain('## Improve Governance');
    expect(out).toContain('Building Momentum means moving forward with focus.');
  });

  it('handles standalone bold headings and the "- " bullet style', () => {
    const input = [
      'Priority actions to focus on:',
      '- Building Momentum',
      '',
      '**Building Momentum**',
      'Details here.',
    ].join('\n');

    const out = stripPreviewBullets(input);
    expect(out).not.toContain('- Building Momentum');
    expect(out).toContain('**Building Momentum**');
  });

  it('leaves normal bullet lists untouched when no matching heading follows', () => {
    const input = [
      'Your key strengths:',
      '• Strategy & Vision',
      '• Data Foundations',
      '',
      'These strengths position you well for the road ahead.',
    ].join('\n');

    expect(stripPreviewBullets(input)).toBe(input);
  });

  it('does not remove a bullet whose matching heading appears ABOVE it', () => {
    const input = [
      '## Building Momentum',
      'Intro paragraph.',
      '',
      'Recap of what we covered:',
      '• Building Momentum',
      '',
      'A closing thought.',
    ].join('\n');

    // The bullet is NOT immediately followed by a matching heading, so it stays.
    expect(stripPreviewBullets(input)).toContain('• Building Momentum');
  });

  it('only drops the matching bullets in a mixed preview block', () => {
    const input = [
      'Priority actions to focus on:',
      '• Building Momentum',
      '• Something Without A Section',
      '',
      '## Building Momentum',
      'Body.',
    ].join('\n');

    const out = stripPreviewBullets(input);
    expect(out).not.toContain('• Building Momentum');
    expect(out).toContain('• Something Without A Section');
  });

  it('returns input unchanged for empty content', () => {
    expect(stripPreviewBullets('')).toBe('');
  });
});

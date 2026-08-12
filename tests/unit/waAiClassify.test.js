import { describe, it, expect } from 'vitest';
import { classifyReply, HANDOFF, OFF_TOPIC } from '../../utils/waAi.js';

// classifyReply is the boundary that stops a control sentinel reaching a
// customer's phone. It runs on every AI reply, so it gets its own tests.
describe('classifyReply', () => {
  it('passes ordinary prose through as a reply', () => {
    expect(classifyReply('Delivery takes 10-14 days. Asante!'))
      .toEqual({ kind: 'reply', text: 'Delivery takes 10-14 days. Asante!' });
  });

  it('recognises each sentinel and never leaks it as text', () => {
    for (const [raw, kind] of [[HANDOFF, 'handoff'], [OFF_TOPIC, 'off_topic']]) {
      // Bare, quoted, and with the model's usual trailing punctuation.
      for (const variant of [raw, `"${raw}"`, `${raw}.`, `  ${raw}  `, raw.toLowerCase()]) {
        const out = classifyReply(variant);
        expect(out.kind).toBe(kind);
        expect(out.text).toBeNull();
      }
    }
  });

  it('treats an empty or missing generation as a handoff, not silence', () => {
    for (const empty of [null, undefined, '']) {
      expect(classifyReply(empty)).toEqual({ kind: 'handoff', text: null });
    }
  });

  it('prefers off-topic when the model emits both', () => {
    // Shouldn't happen, but the customer must not receive either word.
    expect(classifyReply(`${HANDOFF} ${OFF_TOPIC}`).kind).toBe('off_topic');
  });

  it('caps a runaway generation', () => {
    expect(classifyReply('x'.repeat(5000)).text).toHaveLength(1200);
  });
});

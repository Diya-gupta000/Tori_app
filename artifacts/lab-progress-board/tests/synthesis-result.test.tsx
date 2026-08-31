import { test } from 'node:test';
import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SynthesisResult } from '../src/components/synthesis-result';
import type { Snapshot } from '@workspace/api-client-react';

const snapshot: Snapshot = {
  id: 'test', weekOf: '2026-08-24', fileName: 'board.jpg', createdAt: '2026-08-24T00:00:00Z',
  source: 'synthesis', removable: true, summary: 'Weekly work', wins: [], attentionItems: [],
  groups: [{ id: 'jason-erin', name: 'Jason & Erin', students: ['Jason', 'Erin'], color: 'teal', project: '',
    status: 'On track', progress: 45, currentFocus: 'Email mentors', blocker: null, phase: 'background research',
    summary: 'Email mentors', lastUpdated: '2026-08-24', workItems: [{ title: 'Email mentors', details: null }] }],
  unmatchedGroups: [{ label: 'Andy & Roya', students: ['Andy', 'Roya'], reason: 'Partial group',
    suggestedGroupId: 'jack-andy-roya', workItems: [{ title: 'Collect samples', details: 'Prepare tubes' }] }],
};
test('successful synthesis displays canonical destination, weekly focus, tasks, and review counts', () => {
  const html = renderToStaticMarkup(<SynthesisResult snapshot={snapshot} />);
  assert.match(html, /2 board groups recognized · 1 matched · 1 need review · 1 tasks routed/);
  assert.match(html, /Jason &amp; Erin/);
  assert.match(html, /Email mentors/);
  assert.match(html, /Needs review: Andy &amp; Roya/);
  assert.match(html, /Collect samples/);
  assert.match(html, /Prepare tubes/);
  assert.match(html, /No group was created or updated/);
});
test('an entirely unmatched synthesis remains reviewable', () => {
  const html = renderToStaticMarkup(<SynthesisResult snapshot={{ ...snapshot, groups: [] }} />);
  assert.match(html, /1 board groups recognized · 0 matched · 1 need review · 0 tasks routed/);
  assert.match(html, /Collect samples/);
});

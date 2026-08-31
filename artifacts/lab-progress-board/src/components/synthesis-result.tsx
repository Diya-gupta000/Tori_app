import React from 'react';
import type { Snapshot } from '@workspace/api-client-react';

export function SynthesisResult({ snapshot }: { snapshot: Snapshot }) {
  const unmatched = snapshot.unmatchedGroups || [];
  const tasks = snapshot.groups.reduce((count, group) => count + (group.workItems?.length || 0), 0);
  return <section className="space-y-4 text-sm" data-testid="synthesis-import-result" aria-label="Synthesis import result">
    <p className="font-semibold" role="status">{snapshot.groups.length + unmatched.length} board groups recognized · {snapshot.groups.length} matched · {unmatched.length} need review · {tasks} tasks routed</p>
    {snapshot.groups.map((group) => <div key={group.id} className="rounded-lg border border-border p-3" data-testid={`matched-${group.id}`}>
      <p className="font-semibold">{group.name}</p>
      <p className="mt-1 text-muted-foreground">{group.currentFocus || 'No readable focus captured.'}</p>
      {!!group.workItems?.length && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{group.workItems.map((item, index) => <li key={index}>{item.title}{item.details && <span className="text-muted-foreground"> — {item.details}</span>}</li>)}</ul>}
    </div>)}
    {unmatched.map((group, index) => <div key={index} className="rounded-lg border border-[hsl(var(--secondary))] bg-muted/40 p-3" data-testid="unmatched-group">
      <p className="font-semibold">Needs review: {group.label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{group.reason} No group was created or updated from this result.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{group.workItems.map((item, taskIndex) => <li key={taskIndex}>{item.title}{item.details && ` — ${item.details}`}</li>)}</ul>
    </div>)}
  </section>;
}

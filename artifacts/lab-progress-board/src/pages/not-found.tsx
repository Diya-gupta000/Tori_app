import { ArrowLeft, Beaker, CircleAlert } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center">
      <div className="max-w-md text-center" data-testid="state-not-found">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Beaker size={23} />
        </div>
        <div className="eyebrow mt-7">Notebook index · 404</div>
        <h1 className="serif mt-2 text-4xl tracking-[-.04em]">This page is out of frame.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">The work you are looking for is not in this week’s current view.</p>
        <Link href="/" data-testid="link-not-found-home" className="focus-ring mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground lab-transition hover:-translate-y-0.5 hover:shadow-md">
          <ArrowLeft size={14} /> Return to overview
        </Link>
        <div className="mt-10 flex items-center justify-center gap-2 text-[10px] text-muted-foreground"><CircleAlert size={12} /> Reference 404 / no record</div>
      </div>
    </div>
  );
}
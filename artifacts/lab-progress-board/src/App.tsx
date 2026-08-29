import { useMemo, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import {
  ArrowLeft, ArrowRight, Beaker, CircleAlert,
  CircleCheck, CloudUpload, FileImage, Filter, History, Home,
  Menu, MoreHorizontal, Plus, Search, Sparkles, Target, TrendingUp, Users, X,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetGroupsQueryKey, getGetGroupHistoryQueryKey,
  getGetSnapshotsQueryKey, useCreateGroup, useGetDashboard, useGetGroups,
  useGetGroupHistory, useGetSnapshots, useSynthesizeSnapshot,
} from '@workspace/api-client-react';
import type { Dashboard, GroupHistoryPoint, Snapshot, StudentGroup, StudentGroupStatus } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();

const statusStyles: Record<string, string> = {
  'On track': 'bg-[hsl(var(--accent)/.28)] text-[hsl(var(--foreground))]',
  'Needs attention': 'bg-[hsl(var(--secondary)/.4)] text-[hsl(var(--foreground))]',
  Blocked: 'bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]',
  Complete: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]',
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    { href: '/', label: 'Overview', icon: Home },
    { href: '/groups', label: 'Groups', icon: Users },
    { href: '/snapshots', label: 'Snapshots', icon: History },
  ];
  return (
    <div className="grain min-h-[100dvh] bg-background text-foreground">
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-sidebar-border bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform duration-200 md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-sidebar-primary text-sidebar-primary-foreground">
            <Beaker size={19} strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[15px] font-bold tracking-[-.02em]">Lab Progress</div>
            <div className="mono mt-0.5 text-[9px] uppercase tracking-[.16em] text-sidebar-foreground/55">field notes / 07</div>
          </div>
        </div>
        <div className="mt-11 px-2 eyebrow !text-sidebar-foreground/40">Workspace</div>
        <nav className="mt-3 space-y-1" aria-label="Main navigation">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return (
              <Link key={href} href={href} onClick={() => setMobileOpen(false)}
                data-testid={`link-nav-${label.toLowerCase()}`}
                className={cn('focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium lab-transition',
                  active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/62 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')}>
                <Icon size={16} strokeWidth={active ? 2.3 : 1.8} /><span>{label}</span>
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl border border-sidebar-border bg-sidebar-accent/45 p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow !text-sidebar-foreground/45">This week</span>
            <span className="h-2 w-2 rounded-full bg-sidebar-primary" />
          </div>
          <p className="mt-3 text-[13px] leading-5 text-sidebar-foreground/80">A clear next step beats a perfect board.</p>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-sidebar-foreground/10">
            <div className="h-full w-[72%] rounded-full bg-sidebar-primary" />
          </div>
          <p className="mono mt-2 text-[10px] text-sidebar-foreground/45">weekly rhythm · active</p>
        </div>
        <div className="mt-5 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-xs font-bold text-foreground">VJ</div>
          <div className="min-w-0"><div className="truncate text-xs font-semibold">Victoria Johnson</div><div className="text-[10px] text-sidebar-foreground/45">Lab teacher</div></div>
          <button type="button" aria-label="Open profile menu" data-testid="button-profile-menu" className="ml-auto text-sidebar-foreground/45 hover:text-sidebar-foreground"><MoreHorizontal size={16} /></button>
        </div>
      </aside>
      {mobileOpen && <button type="button" aria-label="Close navigation" data-testid="button-close-navigation" className="fixed inset-0 z-30 bg-foreground/25 md:hidden" onClick={() => setMobileOpen(false)} />}
      <div className="min-h-[100dvh] md:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur md:px-9">
          <button type="button" aria-label="Open navigation" data-testid="button-open-navigation" className="mr-3 rounded-md p-2 hover:bg-muted md:hidden" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Research studio</span><span className="text-border">/</span><span className="mono text-[10px]">SPRING · 2025</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />Sync is current</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">VJ</div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-5 py-8 md:px-9 lg:px-12">{children}</main>
      </div>
    </div>
  );
}

function Button({ children, variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  return <button {...props} className={cn('focus-ring inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-[12px] font-semibold lab-transition disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'bg-primary text-primary-foreground hover:-translate-y-0.5 hover:shadow-md',
    variant === 'secondary' && 'border border-border bg-card text-foreground hover:border-[hsl(var(--accent)/.7)] hover:bg-muted',
    variant === 'quiet' && 'text-muted-foreground hover:bg-muted hover:text-foreground', className)}>{children}</button>;
}

function StatusPill({ status }: { status: StudentGroupStatus | string }) {
  return <span data-testid={`status-${String(status).toLowerCase().replaceAll(' ', '-')}`} className={cn('inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold', statusStyles[status] || 'bg-muted text-muted-foreground')}>{status}</span>;
}

function ProgressBar({ value, color = 'bg-[hsl(var(--accent))]' }: { value: number; color?: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function LoadingState({ label = 'Reading the board' }: { label?: string }) {
  return <div className="space-y-5" data-testid="state-loading"><div className="skeleton h-6 w-48 rounded-md" /><div className="grid gap-4 md:grid-cols-4"><div className="skeleton h-28 rounded-xl" /><div className="skeleton h-28 rounded-xl" /><div className="skeleton h-28 rounded-xl" /><div className="skeleton h-28 rounded-xl" /></div><div className="skeleton h-72 rounded-xl" /><p className="mono text-[10px] text-muted-foreground">{label}...</p></div>;
}

function ErrorState({ onRetry, message = 'The board could not be loaded.' }: { onRetry: () => void; message?: string }) {
  return <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.04)] p-8 text-center" data-testid="state-error"><CircleAlert className="text-destructive" size={23} /><h3 className="mt-3 font-semibold">{message}</h3><p className="mt-1 text-sm text-muted-foreground">Try again, or come back after the next board photo.</p><Button variant="secondary" onClick={onRetry} data-testid="button-retry">Retry connection</Button></div>;
}

function EmptyState({ kind, action }: { kind: 'groups' | 'snapshots'; action?: () => void }) {
  const groups = kind === 'groups';
  return <div className="grid min-h-[300px] place-items-center rounded-xl border border-dashed border-border bg-card/45 p-8 text-center" data-testid={`state-empty-${kind}`}><div><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{groups ? <Users size={20} /> : <History size={20} />}</div><h3 className="serif mt-4 text-xl">{groups ? 'No groups in the notebook yet' : 'Your weekly trail starts here'}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{groups ? 'Add a student group before the first synthesis lands.' : 'Upload a board photo to turn a busy week into a useful record.'}</p>{action && <Button className="mt-5" onClick={action} data-testid={`button-empty-${kind}`}>{groups ? <><Plus size={15} />Add first group</> : <><CloudUpload size={15} />Synthesize a board</>}</Button>}</div></div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="eyebrow">{eyebrow}</div><h1 className="serif mt-2 text-[34px] leading-[1.08] tracking-[-.035em] md:text-[42px]">{title}</h1><p className="mt-3 max-w-xl text-[13px] leading-6 text-muted-foreground">{description}</p></div>{action}</div>;
}

function TrendChart({ trend }: { trend: GroupHistoryPoint[] }) {
  if (!trend?.length) return <div className="grid h-52 place-items-center text-sm text-muted-foreground">Progress data will appear after a synthesis.</div>;
  const max = Math.max(...trend.map((p) => p.progress), 100);
  const points = trend.map((p, i) => `${(i / Math.max(trend.length - 1, 1)) * 100},${100 - (p.progress / max) * 82 - 6}`).join(' ');
  return <div className="relative h-56 pt-3" data-testid="chart-progress-trend">
    <div className="absolute inset-0 flex flex-col justify-between pb-7 pt-1"><div className="border-t border-border/70" /><div className="border-t border-border/70" /><div className="border-t border-border/70" /><div className="border-t border-border/70" /></div>
    <svg className="absolute inset-x-0 top-3 h-[174px] w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="hsl(var(--accent))" strokeWidth="1.7" vectorEffect="non-scaling-stroke" /><polyline points={`0,100 ${points} 100,100`} fill="hsl(var(--accent) / .12)" stroke="none" /></svg>
    <div className="absolute inset-x-0 bottom-0 flex justify-between">{trend.map((p, i) => <span key={`${p.week}-${i}`} className="mono text-[9px] text-muted-foreground">{p.week}</span>)}</div>
    <div className="absolute inset-x-0 top-3 flex justify-between">{trend.map((p, i) => <span key={`dot-${p.week}-${i}`} className="h-2.5 w-2.5 rounded-full border-2 border-card bg-[hsl(var(--accent))]" style={{ marginTop: `${100 - (p.progress / max) * 82 - 6}%` }} title={`${p.progress}%`} />)}</div>
  </div>;
}

function GroupRow({ group, compact = false }: { group: StudentGroup; compact?: boolean }) {
  return <Link href={`/groups/${group.id}`} data-testid={`link-group-${group.id}`} className={cn('group block lab-card lab-transition rounded-xl p-4', compact && 'p-3.5')}>
    <div className="flex items-start gap-3"><div className="mt-0.5 h-8 w-1 rounded-full" style={{ backgroundColor: group.color || 'hsl(var(--accent))' }} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-[13px] font-bold tracking-[-.01em]">{group.name}</h3><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{group.project || 'Project details pending'}</p></div><StatusPill status={group.status} /></div><div className="mt-4 flex items-center gap-3"><ProgressBar value={group.progress} /><span className="mono text-[10px] font-medium text-muted-foreground">{group.progress}%</span></div>{!compact && <div className="mt-3 flex items-center justify-between gap-4 text-[11px]"><span className="truncate text-muted-foreground"><span className="font-semibold text-foreground">Focus:</span> {group.currentFocus || 'Pending next board photo'}</span><ArrowRight size={14} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" /></div>}</div></div>
  </Link>;
}

function SnapshotDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const synthesize = useSynthesizeSnapshot();
  const [file, setFile] = useState<File | null>(null);
  const [weekOf, setWeekOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  if (!open) return null;
  const chooseFile = (selected: File | undefined) => {
    if (!selected) return;
    setFile(selected);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ''));
    reader.readAsDataURL(selected);
  };
  const submit = () => {
    if (!file || !preview) return;
    synthesize.mutate({ data: { weekOf, fileName: file.name, imageDataUrl: preview } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSnapshotsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGroupsQueryKey() });
        setFile(null); setPreview(''); onClose();
      },
    });
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="dialog-snapshot">
    <div className="w-full max-w-[540px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between border-b border-border px-6 py-5"><div><div className="eyebrow">Weekly synthesis</div><h2 className="serif mt-1 text-2xl">Bring the board into focus</h2></div><button type="button" aria-label="Close upload dialog" data-testid="button-close-snapshot" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={18} /></button></div>
      <div className="p-6">
        <label className="text-xs font-semibold">Week of <span className="font-normal text-muted-foreground">(Monday)</span></label>
        <input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} data-testid="input-week-of" className="focus-ring mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" />
        <input ref={inputRef} type="file" accept="image/*" className="hidden" data-testid="input-board-photo" onChange={(e) => chooseFile(e.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} data-testid="button-select-photo" className={cn('focus-ring mt-4 flex min-h-[178px] w-full flex-col items-center justify-center rounded-xl border border-dashed px-5 text-center lab-transition', preview ? 'border-[hsl(var(--accent)/.7)] bg-[hsl(var(--accent)/.09)]' : 'border-border bg-background hover:border-[hsl(var(--accent)/.7)] hover:bg-muted')}>
          {preview ? <><img src={preview} alt="Selected board preview" className="max-h-28 max-w-full rounded-lg object-contain" /><span className="mt-3 text-xs font-semibold">{file?.name}</span><span className="mt-1 text-[10px] text-muted-foreground">Select another photo</span></> : <><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FileImage size={20} /></div><span className="mt-3 text-sm font-semibold">Choose a board photo</span><span className="mt-1 text-xs text-muted-foreground">JPG or PNG · a clear overhead shot works best</span></>}
        </button>
        {synthesize.isError && <p className="mt-3 flex items-center gap-2 text-xs text-destructive" data-testid="status-synthesis-error"><CircleAlert size={14} />Could not synthesize this photo. Please try again.</p>}
        <div className="mt-6 flex items-center justify-end gap-2"><Button variant="quiet" onClick={onClose} data-testid="button-cancel-snapshot">Cancel</Button><Button onClick={submit} disabled={!file || synthesize.isPending} data-testid="button-submit-snapshot">{synthesize.isPending ? <><Sparkles size={15} className="animate-pulse" />Reading board...</> : <><Sparkles size={15} />Synthesize board</>}</Button></div>
      </div>
    </div>
  </div>;
}

function DashboardPage() {
  const { data, isLoading, isError, refetch } = useGetDashboard();
  const [uploadOpen, setUploadOpen] = useState(false);
  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;
  const dashboard = data as Dashboard;
  return <div className="page-enter">
    <PageHeading eyebrow={`Current synthesis · week of ${formatDate(dashboard.weekOf)}`} title="The lab, in focus." description={dashboard.summary || 'A measured read on where every project stands, and where a teacher can make the most difference.'} action={<Button onClick={() => setUploadOpen(true)} data-testid="button-upload-board"><CloudUpload size={16} />Upload board photo</Button>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Average progress" value={`${dashboard.averageProgress}%`} detail={`${dashboard.progressDelta >= 0 ? '+' : ''}${dashboard.progressDelta} pts from last week`} accent="copper" icon={<TrendingUp size={16} />} />
      <MetricCard label="On track" value={dashboard.onTrack} detail={`of ${dashboard.totalGroups} active groups`} accent="mint" icon={<CircleCheck size={16} />} />
      <MetricCard label="Needs a look" value={dashboard.needsAttention} detail="groups with a soft signal" accent="sand" icon={<Target size={16} />} />
      <MetricCard label="Total groups" value={dashboard.totalGroups} detail="across this studio" accent="ink" icon={<Users size={16} />} />
    </div>
     <div className="mt-5 grid gap-5 xl:grid-cols-1">
       <section className="lab-card rounded-xl p-5 md:p-6" data-testid="section-progress-radar"><div className="flex items-start justify-between"><div><div className="eyebrow">Progress radar</div><h2 className="serif mt-1 text-2xl">Momentum is building</h2></div><span className="mono rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">4 WEEKS</span></div><TrendChart trend={dashboard.trend} /></section>
    </div>
    <div className="mt-8 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <section><div className="mb-3 flex items-center justify-between"><div><div className="eyebrow">Group pulse</div><h2 className="serif mt-1 text-2xl">Where attention belongs</h2></div><Link href="/groups" data-testid="link-view-all-groups" className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">View all <ArrowRight size={14} /></Link></div><div className="grid gap-3 sm:grid-cols-2">{(dashboard.groups || []).slice(0, 4).map((group) => <GroupRow key={group.id} group={group} />)}</div>{!dashboard.groups?.length && <EmptyState kind="groups" />}</section>
      <section className="rounded-xl border border-border bg-card p-5" data-testid="section-attention-items"><div className="flex items-center justify-between"><div><div className="eyebrow">Signals</div><h2 className="serif mt-1 text-2xl">Worth a follow-up</h2></div><CircleAlert size={18} className="text-[hsl(var(--secondary-foreground))]" /></div><div className="mt-5 space-y-1">{(dashboard.attentionItems || []).slice(0, 4).map((item, i) => <div key={`${item}-${i}`} className="flex gap-3 border-t border-border py-3.5 text-[12px] leading-5"><span className="mono mt-0.5 text-[10px] text-muted-foreground">0{i + 1}</span><span>{item}</span></div>)}{!dashboard.attentionItems?.length && <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No loose threads surfaced this week.</div>}</div></section>
    </div>
    <SnapshotDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
  </div>;
}

function MetricCard({ label, value, detail, accent, icon }: { label: string; value: string | number; detail: string; accent: string; icon: ReactNode }) {
  const colors: Record<string, string> = { copper: 'bg-[hsl(var(--secondary)/.36)] text-[hsl(var(--secondary-foreground))]', mint: 'bg-[hsl(var(--accent)/.4)] text-foreground', sand: 'bg-[hsl(var(--muted))] text-muted-foreground', ink: 'bg-primary text-primary-foreground' };
  return <div className="lab-card rounded-xl p-4" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-center justify-between"><div className="eyebrow">{label}</div><span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', colors[accent])}>{icon}</span></div><div className="mt-4 flex items-end justify-between"><span className="mono text-[28px] font-medium tracking-[-.06em]">{value}</span><span className="mb-1 text-right text-[10px] leading-4 text-muted-foreground">{detail}</span></div></div>;
}

function GroupCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateGroup();
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [students, setStudents] = useState('');
  const [color, setColor] = useState('#8db9ad');
  if (!open) return null;
  const submit = () => {
    if (!name.trim() || !project.trim()) return;
    create.mutate({ data: { name: name.trim(), project: project.trim(), students: students.split(',').map((s) => s.trim()).filter(Boolean), color } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetGroupsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); setName(''); setProject(''); setStudents(''); onClose(); },
    });
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="dialog-create-group"><div className="w-full max-w-[500px] rounded-2xl border border-border bg-card shadow-2xl"><div className="flex items-start justify-between border-b border-border px-6 py-5"><div><div className="eyebrow">New entry</div><h2 className="serif mt-1 text-2xl">Add a student group</h2></div><button type="button" aria-label="Close group dialog" data-testid="button-close-group" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X size={18} /></button></div><div className="space-y-4 p-6"><Field label="Group name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tidal Shift" data-testid="input-group-name" /></Field><Field label="Project"><input value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. Coastal erosion model" data-testid="input-group-project" /></Field><Field label="Students" hint="Separate names with commas"><input value={students} onChange={(e) => setStudents(e.target.value)} placeholder="Ari, Noor, Leo" data-testid="input-group-students" /></Field><div className="flex items-center justify-between"><label className="text-xs font-semibold">Group marker</label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} data-testid="input-group-color" className="h-8 w-12 cursor-pointer rounded-md border border-input bg-background p-1" /></div>{create.isError && <p className="text-xs text-destructive" data-testid="status-create-error">Could not create this group. Check the connection and try again.</p>}<div className="flex justify-end gap-2 pt-2"><Button variant="quiet" onClick={onClose} data-testid="button-cancel-group">Cancel</Button><Button onClick={submit} disabled={!name.trim() || !project.trim() || create.isPending} data-testid="button-submit-group">{create.isPending ? 'Saving...' : <><Plus size={15} />Add group</>}</Button></div></div></div></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="text-xs font-semibold">{label} {hint && <span className="font-normal text-muted-foreground">· {hint}</span>}</span><div className="[&_input]:focus-ring [&_input]:mt-2 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-input [&_input]:bg-background [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm">{children}</div></label>;
}

function GroupsPage() {
  const { data, isLoading, isError, refetch } = useGetGroups();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [createOpen, setCreateOpen] = useState(false);
  const groups = useMemo(() => (data || []).filter((g) => `${g.name} ${g.project} ${g.students.join(' ')}`.toLowerCase().includes(search.toLowerCase())).filter((g) => filter === 'All' || g.status === filter), [data, search, filter]);
  if (isLoading) return <LoadingState label="Gathering groups" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return <div className="page-enter"><PageHeading eyebrow="Studio directory" title="Every group, one glance." description="Search the room by project, student, or status. Open a group to see how its work has moved week by week." action={<Button onClick={() => setCreateOpen(true)} data-testid="button-add-group"><Plus size={16} />Add group</Button>} /><div className="mb-5 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search groups, projects, students..." data-testid="input-search-groups" className="focus-ring h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm" /></div><div className="flex items-center gap-2 overflow-x-auto"><Filter size={15} className="shrink-0 text-muted-foreground" />{['All', 'On track', 'Needs attention', 'Blocked', 'Complete'].map((option) => <button type="button" key={option} onClick={() => setFilter(option)} data-testid={`button-filter-${option.toLowerCase().replaceAll(' ', '-')}`} className={cn('whitespace-nowrap rounded-lg border px-3 py-2 text-[11px] font-semibold lab-transition', filter === option ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>{option}</button>)}</div></div>{groups.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{groups.map((group) => <GroupRow key={group.id} group={group} />)}</div> : <EmptyState kind="groups" action={() => setCreateOpen(true)} />}<GroupCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} /></div>;
}

function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id || '';
  const groupsQuery = useGetGroups();
  const historyQuery = useGetGroupHistory(id, { query: { enabled: !!id, queryKey: getGetGroupHistoryQueryKey(id) } });
  const group = groupsQuery.data?.find((item) => item.id === id);
  if (groupsQuery.isLoading || historyQuery.isLoading) return <LoadingState label="Opening group history" />;
  if (groupsQuery.isError || historyQuery.isError || !group) return <ErrorState onRetry={() => { groupsQuery.refetch(); historyQuery.refetch(); }} message={!group ? 'This group is not in the current notebook.' : undefined} />;
  const history = historyQuery.data || [];
  return <div className="page-enter">
    <Link href="/groups" data-testid="link-back-groups" className="focus-ring mb-7 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />All groups</Link>
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="flex items-start gap-4">
        <div className="mt-1 h-12 w-1.5 rounded-full" style={{ backgroundColor: group.color || 'hsl(var(--accent))' }} />
        <div>
          <div className="eyebrow">Group dossier</div>
          <h1 className="serif mt-1 text-[36px] leading-none tracking-[-.04em]">{group.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{group.project || 'Project details pending'}</p>
        </div>
      </div>
      <StatusPill status={group.status} />
    </div>
    <div className="mt-8 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <section className="lab-card rounded-xl p-5 md:p-6">
        <div className="flex items-start justify-between">
          <div><div className="eyebrow">Progress history</div><h2 className="serif mt-1 text-2xl">The shape of the work</h2></div>
          <div className="mono text-[24px]">{group.progress}<span className="text-sm text-muted-foreground">%</span></div>
        </div>
        <HistoryChart history={history} />
      </section>
      <section className="space-y-4">
        <div className="rounded-xl bg-primary p-5 text-primary-foreground">
          <div className="eyebrow !text-primary-foreground/55">Current focus</div>
          <p className="serif mt-4 text-[22px] leading-tight">{group.currentFocus || 'Waiting for the next board photo.'}</p>
          <div className="mt-7 flex items-center gap-3"><ProgressBar value={group.progress} color="bg-sidebar-primary" /><span className="mono text-[10px]">{group.progress}%</span></div>
        </div>
        <div className="lab-card rounded-xl p-5">
          <div className="eyebrow">Current phase</div>
          <p className="serif mt-3 text-xl">{group.phase || 'Not captured yet'}</p>
        </div>
        <div className="lab-card rounded-xl p-5">
          <div className="eyebrow">People in the room</div>
          <div className="mt-4 flex flex-wrap gap-2">{group.students.map((student) => <span key={student} className="rounded-full bg-muted px-2.5 py-1.5 text-[11px] font-medium">{student}</span>)}</div>
        </div>
        {group.blocker && <div className="rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.06)] p-5"><div className="flex items-center gap-2 text-xs font-bold text-destructive"><CircleAlert size={15} />Blocker noted</div><p className="mt-3 text-sm leading-6">{group.blocker}</p></div>}
      </section>
    </div>
    <section className="mt-8 lab-card rounded-xl p-5 md:p-6">
      <div className="eyebrow">Kanban summary</div>
      <h2 className="serif mt-1 text-2xl">What the board is saying</h2>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">{group.summary || 'A one- to two-sentence summary will appear here after a new board photo is synthesized.'}</p>
    </section>
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between"><div><div className="eyebrow">Extracted work items</div><h2 className="serif mt-1 text-2xl">What is moving</h2></div><span className="mono text-[10px] text-muted-foreground">LATEST BOARD</span></div>
      <div className="grid gap-3 sm:grid-cols-3"><WorkColumn label="To do" count={history.at(-1)?.todo || 0} tone="bg-muted" /><WorkColumn label="Doing" count={history.at(-1)?.doing || 0} tone="bg-[hsl(var(--secondary)/.24)]" /><WorkColumn label="Done" count={history.at(-1)?.done || 0} tone="bg-[hsl(var(--accent)/.28)]" /></div>
    </section>
  </div>;
}

function HistoryChart({ history }: { history: GroupHistoryPoint[] }) {
  if (!history.length) return <div className="grid h-56 place-items-center text-sm text-muted-foreground">No history has been synthesized for this group yet.</div>;
  return <div className="relative mt-8 h-56"><div className="absolute inset-0 flex flex-col justify-between pb-6"><div className="border-t border-border" /><div className="border-t border-border" /><div className="border-t border-border" /><div className="border-t border-border" /></div><div className="absolute inset-x-0 bottom-0 flex justify-between">{history.map((p) => <span key={p.week} className="mono text-[9px] text-muted-foreground">{p.week}</span>)}</div><div className="absolute inset-x-0 bottom-6 top-1 flex items-end justify-between gap-2">{history.map((p) => <div key={`bar-${p.week}`} className="flex h-full flex-1 items-end justify-center gap-1" title={`${p.progress}% progress`}><div className="w-full max-w-[26px] rounded-t-sm bg-[hsl(var(--accent)/.75)] transition-all" style={{ height: `${Math.max(5, p.progress)}%` }} /></div>)}</div></div>;
}

function WorkColumn({ label, count, tone }: { label: string; count: number; tone: string }) {
  return <div className={cn('rounded-xl p-4', tone)}><div className="flex items-center justify-between"><span className="eyebrow !text-foreground/60">{label}</span><span className="mono text-[18px]">{count}</span></div><div className="mt-8 border-t border-foreground/10 pt-3 text-[11px] text-muted-foreground">{count ? `${count} item${count === 1 ? '' : 's'} captured in the latest read` : 'Nothing captured here yet'}</div></div>;
}

function SnapshotsPage() {
  const { data, isLoading, isError, refetch } = useGetSnapshots();
  const [uploadOpen, setUploadOpen] = useState(false);
  if (isLoading) return <LoadingState label="Sorting weekly records" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const snapshots = data || [];
  return <div className="page-enter"><PageHeading eyebrow="Weekly archive" title="The trail behind the week." description="A quiet record of what changed, what clicked, and which conversations are worth carrying forward." action={<Button onClick={() => setUploadOpen(true)} data-testid="button-new-snapshot"><Sparkles size={16} />New synthesis</Button>} />{snapshots.length ? <div className="space-y-4">{snapshots.map((snapshot, i) => <SnapshotCard key={snapshot.id} snapshot={snapshot} featured={i === 0} />)}</div> : <EmptyState kind="snapshots" action={() => setUploadOpen(true)} />}<SnapshotDialog open={uploadOpen} onClose={() => setUploadOpen(false)} /></div>;
}

function SnapshotCard({ snapshot, featured }: { snapshot: Snapshot; featured: boolean }) {
  return <article className={cn('lab-card rounded-xl p-5 md:p-6', featured && 'border-[hsl(var(--accent)/.6)]')} data-testid={`card-snapshot-${snapshot.id}`}><div className="flex flex-col gap-5 md:flex-row md:items-start"><div className="flex-1"><div className="flex flex-wrap items-center gap-3"><span className="eyebrow">{featured ? 'Latest synthesis' : 'Archived synthesis'}</span><span className="mono rounded bg-muted px-2 py-1 text-[10px]">{formatDate(snapshot.weekOf)}</span></div><h2 className="serif mt-3 text-[25px]">{snapshot.summary || 'Weekly synthesis'}</h2><div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><FileImage size={13} />{snapshot.fileName}</span><span className="text-border">·</span><span>{snapshot.groups?.length || 0} groups read</span></div></div><div className="grid grid-cols-2 gap-2 md:w-[260px]"><div className="rounded-lg bg-[hsl(var(--accent)/.2)] p-3"><div className="eyebrow !text-foreground/55">Wins</div><div className="mono mt-2 text-xl">{snapshot.wins?.length || 0}</div></div><div className="rounded-lg bg-[hsl(var(--secondary)/.22)] p-3"><div className="eyebrow !text-foreground/55">Signals</div><div className="mono mt-2 text-xl">{snapshot.attentionItems?.length || 0}</div></div></div></div>{((snapshot.wins?.length || 0) > 0 || (snapshot.attentionItems?.length || 0) > 0) && <div className="mt-6 grid gap-5 border-t border-border pt-5 md:grid-cols-2"><ListBlock title="What moved" items={snapshot.wins || []} tone="mint" /><ListBlock title="Keep close" items={snapshot.attentionItems || []} tone="sand" /></div>}</article>;
}

function ListBlock({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return <div><div className="mb-2 flex items-center gap-2 text-xs font-bold"><span className={cn('h-2 w-2 rounded-full', tone === 'mint' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--secondary))]')} />{title}</div><div className="space-y-1.5">{items.slice(0, 3).map((item, i) => <div key={`${item}-${i}`} className="text-[12px] leading-5 text-muted-foreground">{item}</div>)}</div></div>;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><AppShell><Switch><Route path="/" component={DashboardPage} /><Route path="/groups" component={GroupsPage} /><Route path="/groups/:id" component={GroupDetailPage} /><Route path="/snapshots" component={SnapshotsPage} /><Route component={NotFound} /></Switch></AppShell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
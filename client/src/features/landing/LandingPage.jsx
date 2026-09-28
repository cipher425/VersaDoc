import { Link, Navigate } from 'react-router-dom';
import { GitBranch, GitMerge, History, MessageSquareText, ScanText, ShieldCheck, ArrowRight, Users, GitCompareArrows } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Feedback';

const FEATURES = [
  { icon: GitBranch, title: 'Branches', text: 'Try a bold rewrite on its own branch. The original stays safe until you decide.' },
  { icon: GitCompareArrows, title: 'Word-level diffs', text: 'See exactly which words changed between any two versions, side by side.' },
  { icon: GitMerge, title: 'Smart merging', text: 'Three-way merge combines everyone\'s edits automatically and only asks you about real conflicts.' },
  { icon: MessageSquareText, title: 'Reviews', text: 'Merge requests with line comments, approvals and "changes requested" - like GitHub, for writing.' },
  { icon: ScanText, title: 'Blame', text: 'Hover any line and see who wrote it, in which commit, and why.' },
  { icon: History, title: 'Unlimited history', text: 'Restore any version in one click. Delta storage keeps it all tiny.' },
];

const STEPS = [
  ['Write', 'Edit in Markdown with live preview. Drafts autosave as you type.'],
  ['Branch', 'Create a branch for a new section or a rewrite.'],
  ['Review', 'Open a merge request. Teammates comment on lines and approve.'],
  ['Merge', 'Changes flow into main. Conflicts get a friendly resolver.'],
];

export function LandingPage() {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return (
    <div className="bg-white">
      <header className="container-page flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold"><img src="/favicon.svg" alt="" className="h-8 w-8" /> Versa<span className="text-brand-600">Doc</span></Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" to="/login">Log in</Button>
          <Button size="sm" to="/register">Get started</Button>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-gradient-to-b from-brand-100/70 to-transparent blur-2xl" />
        <div className="container-page relative py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700"><ShieldCheck className="h-3.5 w-3.5" /> Git for documents</span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-6xl">
            Write together.<br /><span className="bg-gradient-to-r from-brand-600 to-emerald-500 bg-clip-text text-transparent">Never lose a version.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">VersaDoc brings branches, reviews, diffs and merging to reports, research papers and team docs - without learning Git.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" to="/register">Start writing free <ArrowRight className="h-4 w-4" /></Button>
            <Button size="lg" variant="secondary" to="/login">Try the demo</Button>
          </div>
        </div>
      </section>

      <section className="container-page pb-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-slate-200 p-6 transition hover:shadow-md">
              <span className="inline-flex rounded-xl bg-brand-50 p-2.5"><Icon className="h-5 w-5 text-brand-600" /></span>
              <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-900 py-20 text-white">
        <div className="container-page">
          <h2 className="text-center text-3xl font-bold">How it works</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {STEPS.map(([title, text], i) => (
              <div key={title} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-bold">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-20 text-center">
        <Users className="mx-auto h-10 w-10 text-brand-600" />
        <h2 className="mt-4 text-3xl font-bold text-slate-900">Built for teams who write</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">Final-year project groups, research labs, and teams keeping SOPs and specs up to date.</p>
        <Button size="lg" className="mt-8" to="/register">Create your first document</Button>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} VersaDoc · A MERN portfolio project</footer>
    </div>
  );
}

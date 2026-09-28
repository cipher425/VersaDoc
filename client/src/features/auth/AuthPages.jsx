import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { GitBranch, GitMerge, History, FileText, Check } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';

const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') });
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').regex(/[A-Za-z]/, 'Must contain a letter').regex(/\d/, 'Must contain a number'),
});

const POINTS = [
  { icon: GitBranch, text: 'Branch your ideas without touching the original' },
  { icon: GitMerge, text: 'Teammates review and approve before changes go in' },
  { icon: History, text: 'Every version kept - restore anything in one click' },
];

/* ------------------------------------------------------------------ */
/* Commit-graph illustration: lanes on the left, messages in a column  */
/* (no overlapping labels, pure SVG + HTML, nothing to download)      */
/* ------------------------------------------------------------------ */

const ROW = 44; // px per commit row
const LANE_X = [16, 38]; // x of lane 0 (main) and lane 1 (feature branch)
const COMMITS = [
  { lane: 0, msg: 'Merge !1 - Add results and conclusion', who: 'AS', color: '#6366f1', tag: 'main', merge: true },
  { lane: 1, msg: 'Write conclusion', who: 'PN', color: '#10b981', tag: 'results-section' },
  { lane: 1, msg: 'Add pilot results from Lot B', who: 'PN', color: '#10b981' },
  { lane: 0, msg: 'Expand problem statement', who: 'AS', color: '#6366f1' },
  { lane: 0, msg: 'Initial outline', who: 'AS', color: '#6366f1' },
];

function GraphArt() {
  const y = (i) => i * ROW + ROW / 2;
  const height = COMMITS.length * ROW;
  const main = '#6366f1';
  const branch = '#10b981';
  return (
    <div className="overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl shadow-black/40 ring-1 ring-white/20">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <FileText className="h-3.5 w-3.5 text-brand-600" /> Final Year Report.md
        </span>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <Check className="h-3 w-3" /> Approved by Rahul
        </span>
      </div>
      <div className="relative px-3 py-1">
        <svg width="54" height={height} className="absolute left-3 top-1" aria-hidden>
          {/* main lane */}
          <line x1={LANE_X[0]} y1={y(0)} x2={LANE_X[0]} y2={y(4)} stroke={main} strokeWidth="2.5" />
          {/* branch leaves main after "Expand problem statement" ... */}
          <path d={`M${LANE_X[0]} ${y(3)} C ${LANE_X[0]} ${y(3) - 20}, ${LANE_X[1]} ${y(2) + 20}, ${LANE_X[1]} ${y(2)}`} stroke={branch} strokeWidth="2.5" fill="none" />
          <line x1={LANE_X[1]} y1={y(2)} x2={LANE_X[1]} y2={y(1)} stroke={branch} strokeWidth="2.5" />
          {/* ... and is merged back */}
          <path d={`M${LANE_X[1]} ${y(1)} C ${LANE_X[1]} ${y(1) - 20}, ${LANE_X[0]} ${y(0) + 20}, ${LANE_X[0]} ${y(0)}`} stroke={branch} strokeWidth="2.5" fill="none" />
          {COMMITS.map((c, i) =>
            c.merge ? (
              <g key={i}>
                <circle cx={LANE_X[c.lane]} cy={y(i)} r="8" fill="white" stroke={main} strokeWidth="2.5" />
                <circle cx={LANE_X[c.lane]} cy={y(i)} r="3.5" fill={main} />
              </g>
            ) : (
              <circle key={i} cx={LANE_X[c.lane]} cy={y(i)} r="6" fill={c.lane ? branch : main} stroke="white" strokeWidth="2" />
            )
          )}
        </svg>
        <ul className="ml-[58px]">
          {COMMITS.map((c, i) => (
            <li key={i} className="flex items-center gap-2" style={{ height: ROW }}>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.msg}</span>
              {c.tag && (
                <span
                  className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                  style={{ background: `${c.lane ? branch : main}1a`, color: c.lane ? '#047857' : '#4338ca' }}
                >
                  {c.tag}
                </span>
              )}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: c.color }}>
                {c.who}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel: exactly one screen tall, never scrolls */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-800 to-slate-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:px-12 lg:py-8 xl:px-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '36px 36px' }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl" />

        <Link to="/" className="relative flex items-center gap-2 text-lg font-extrabold text-white">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg ring-1 ring-white/30" /> VersaDoc
        </Link>

        <div className="relative my-auto max-w-lg py-6 text-white">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight xl:text-[2.6rem] xl:leading-[1.1]">
            Write together.
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-sky-300 bg-clip-text text-transparent">Never lose a version.</span>
          </h2>
          <p className="mt-3 text-[15px] text-indigo-100/90">Git-style branching, reviews and merging - built for documents instead of code.</p>
          <div className="mt-7">
            <GraphArt />
          </div>
          <ul className="mt-7 space-y-2.5 [@media(max-height:740px)]:hidden">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-indigo-50">
                <span className="rounded-lg bg-white/10 p-1.5 ring-1 ring-white/15"><Icon className="h-4 w-4" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-indigo-200/70">Built with MongoDB · Express · React · Node.js</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-slate-50 px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-xl font-extrabold lg:hidden">
            <img src="/favicon.svg" alt="" className="h-9 w-9" /> Versa<span className="text-brand-600">Doc</span>
          </Link>
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-9">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>
        </div>
      </div>
    </div>
  );
}

const useRedirect = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return () => navigate(params.get('next') || '/dashboard', { replace: true });
};

const DEMO = [
  ['demo@versadoc.dev', 'Aarav', 'owner'],
  ['priya@versadoc.dev', 'Priya', 'editor'],
  ['rahul@versadoc.dev', 'Rahul', 'reviewer'],
  ['meera@versadoc.dev', 'Meera', 'viewer'],
];

export function LoginPage() {
  const { login } = useAuth();
  const redirect = useRedirect();
  const { register, handleSubmit, formState, setValue } = useForm({ resolver: zodResolver(loginSchema) });
  const onSubmit = async (values) => {
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      redirect();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const demo = (email) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', 'Demo@1234', { shouldValidate: true });
  };
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to continue writing."
      footer={<>New here? <Link to="/register" className="font-semibold text-brand-600 hover:underline">Create an account</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" error={formState.errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={formState.errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>Log in</Button>
      </form>
      <div className="mt-6">
        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> Try a demo account <span className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {DEMO.map(([email, name, role]) => (
            <button
              key={email}
              type="button"
              onClick={() => demo(email)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="block text-sm font-semibold text-slate-800">{name}</span>
              <span className="block text-xs capitalize text-slate-500">{role}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const redirect = useRedirect();
  const { register, handleSubmit, formState, setError } = useForm({ resolver: zodResolver(registerSchema) });
  const onSubmit = async (values) => {
    try {
      await registerUser(values);
      toast.success('Welcome to VersaDoc!');
      redirect();
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') setError('email', { message: err.message });
      else toast.error(err.message);
    }
  };
  return (
    <AuthShell
      title="Create your account"
      subtitle="Free, and it takes less than a minute."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link></>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Full name" error={formState.errors.name?.message}><Input autoComplete="name" {...register('name')} /></Field>
        <Field label="Email" error={formState.errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={formState.errors.password?.message} hint="8+ characters with a letter and a number">
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>Create account</Button>
      </form>
    </AuthShell>
  );
}
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GitCommitHorizontal, Users, FileText } from 'lucide-react';
import { http } from '../../lib/api';
import { MarkdownPreview } from '../editor/MarkdownPreview';
import { ErrorState, PageLoader } from '../../components/ui/Feedback';
import { Avatar } from '../../components/ui/Avatar';
import { formatDate, shortHash } from '../../lib/format';

/** Published, read-only view of a public document - no login needed. */
export function PublicDocPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['public', slug], queryFn: () => http.get(`/public/${slug}`).then((r) => r.data) });
  if (isLoading) return <PageLoader />;
  if (error) return <div className="container-page py-16"><ErrorState error={error} /></div>;
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="container-page flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-extrabold"><img src="/favicon.svg" alt="" className="h-7 w-7" /> VersaDoc</Link>
          <Link to="/register" className="text-sm font-semibold text-brand-600 hover:underline">Write your own →</Link>
        </div>
      </header>
      <main className="container-page max-w-3xl py-10">
        <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-slate-50 px-5 py-4 text-sm text-slate-600">
          <span className="flex items-center gap-2"><Avatar user={data.owner} size="xs" /> {data.owner.name}</span>
          <span className="flex items-center gap-1.5"><GitCommitHorizontal className="h-4 w-4" /> {data.commits} versions</span>
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> {data.contributors} contributor(s)</span>
          <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> {data.words.toLocaleString()} words</span>
          <span className="text-xs text-slate-400">Last updated {formatDate(data.lastUpdated)} · {shortHash(data.lastCommit.hash)} “{data.lastCommit.message}”</span>
        </div>
        <MarkdownPreview text={data.content} />
      </main>
    </div>
  );
}

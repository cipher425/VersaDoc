import { Link } from 'react-router-dom';
import { Avatar } from '../../components/ui/Avatar';
import { fromNow } from '../../lib/format';

const text = (a) => {
  const d = a.data || {};
  switch (a.type) {
    case 'DOC_CREATED': return 'created the document';
    case 'COMMIT': return <>committed <b>{d.message}</b> on <code className="text-xs">{d.branch}</code> <span className="text-emerald-600">+{d.additions}</span> <span className="text-red-600">-{d.deletions}</span></>;
    case 'REVERT': return <>restored version <code className="text-xs">{d.restored?.slice(0, 7)}</code> on <code className="text-xs">{d.branch}</code></>;
    case 'BRANCH_CREATED': return <>created branch <code className="text-xs">{d.branch}</code></>;
    case 'BRANCH_DELETED': return <>deleted branch <code className="text-xs">{d.branch}</code></>;
    case 'MR_OPENED': return <>opened merge request <b>!{d.number}</b> {d.title}</>;
    case 'MR_MERGED': return <>merged <b>!{d.number}</b> {d.source} → {d.target}{d.fastForward ? ' (fast-forward)' : ''}</>;
    case 'MR_CLOSED': return <>closed <b>!{d.number}</b></>;
    case 'MR_REOPENED': return <>reopened <b>!{d.number}</b></>;
    case 'REVIEW': return <>{d.state === 'APPROVED' ? 'approved' : 'requested changes on'} <b>!{d.number}</b></>;
    case 'COMMENT': return <>commented on <b>!{d.number}</b></>;
    case 'COLLABORATOR_ADDED': return <>added <b>{d.name}</b> as {d.role}</>;
    default: return a.type;
  }
};

export function ActivityItem({ item, showDocument }) {
  return (
    <li className="flex items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
      <Avatar user={item.actor} size="sm" />
      <div className="min-w-0 flex-1 text-slate-700">
        <span className="font-semibold text-slate-900">{item.actor?.name}</span> {text(item)}
        {showDocument && item.document && (
          <> in <Link to={`/d/${item.document._id}`} className="font-medium text-brand-600 hover:underline">{item.document.title}</Link></>
        )}
        <p className="text-xs text-slate-400">{fromNow(item.createdAt)}</p>
      </div>
    </li>
  );
}

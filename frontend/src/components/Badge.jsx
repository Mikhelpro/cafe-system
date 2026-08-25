export default function Badge({ status }) {
  return <span className={`badge badge-${status}`}>{status?.replace('_', ' ')}</span>;
}

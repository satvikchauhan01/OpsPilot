import { Link } from 'react-router';
import { Empty } from '../components/States.jsx';

export function NotFoundPage() {
  return (
    <Empty title="There's nothing at this address">
      <Link to="/">Back to the overview</Link>
    </Empty>
  );
}

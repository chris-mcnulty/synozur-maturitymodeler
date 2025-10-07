import { ProgressBar } from '../ProgressBar';

export default function ProgressBarExample() {
  return (
    <div className="p-8 max-w-2xl">
      <ProgressBar current={7} total={20} />
    </div>
  );
}

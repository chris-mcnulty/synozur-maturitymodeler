import { ProfileGate } from '../ProfileGate';

export default function ProfileGateExample() {
  return (
    <div className="p-8">
      <ProfileGate onComplete={(profile) => console.log('Profile:', profile)} />
    </div>
  );
}

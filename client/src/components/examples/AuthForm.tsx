import { AuthForm } from '../AuthForm';

export default function AuthFormExample() {
  return (
    <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
      <AuthForm mode="signin" onSubmit={(data) => console.log('SignIn:', data)} />
      <AuthForm mode="signup" onSubmit={(data) => console.log('SignUp:', data)} />
      <AuthForm mode="forgot" onSubmit={(data) => console.log('Forgot:', data)} />
    </div>
  );
}

import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { Header } from "@/components/Header";
import Landing from "@/pages/Landing";
import ModelHome from "@/pages/ModelHome";
import Assessment from "@/pages/Assessment";
import Results from "@/pages/Results";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Auth from "@/pages/Auth";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/VerifyEmail";
import OAuthConsent from "@/pages/oauth-consent";
import CompleteProfile from "@/pages/CompleteProfile";
import NotFound from "@/pages/not-found";

function Router() {
  const [location] = useLocation();
  const showHeader = location !== "/auth" && location !== "/forgot-password" && !location.startsWith("/reset-password") && location !== "/verify-email" && location !== "/oauth/consent" && location !== "/complete-profile";

  return (
    <>
      {showHeader && <Header />}
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/auth" component={Auth} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/oauth/consent" component={OAuthConsent} />
        <Route path="/complete-profile" component={CompleteProfile} />
        <Route path="/assessment/:assessmentId" component={Assessment} />
        <Route path="/results/:assessmentId" component={Results} />
        <ProtectedRoute path="/me" component={Profile} />
        <ProtectedRoute path="/admin" component={Admin} />
        <Route path="/:modelSlug" component={ModelHome} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <AuthProvider>
            <TooltipProvider>
              <Router />
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;

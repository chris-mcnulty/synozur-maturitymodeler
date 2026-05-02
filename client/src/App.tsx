import { lazy, Suspense } from "react";
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
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import Landing from "@/pages/Landing";
import NotFound from "@/pages/not-found";

// Lazily load all non-landing pages so the initial Landing-page bundle stays small.
// Each page becomes its own JS chunk that the browser only fetches on demand.
const ModelHome = lazy(() => import("@/pages/ModelHome"));
const Assessment = lazy(() => import("@/pages/Assessment"));
const Results = lazy(() => import("@/pages/Results"));
const Profile = lazy(() => import("@/pages/Profile"));
const Insights = lazy(() => import("@/pages/Insights"));
const Admin = lazy(() => import("@/pages/Admin"));
const Auth = lazy(() => import("@/pages/Auth"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const OAuthConsent = lazy(() => import("@/pages/oauth-consent"));
const CompleteProfile = lazy(() => import("@/pages/CompleteProfile"));
const UserGuide = lazy(() => import("@/pages/UserGuide"));
const Changelog = lazy(() => import("@/pages/Changelog"));
const Support = lazy(() => import("@/pages/Support"));

function RouteFallback() {
  return (
    <div
      className="flex items-center justify-center min-h-[60vh]"
      data-testid="route-suspense-fallback"
    >
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const showHeader = location !== "/auth" && location !== "/forgot-password" && !location.startsWith("/reset-password") && location !== "/verify-email" && location !== "/oauth/consent" && location !== "/complete-profile";

  return (
    <>
      {showHeader && <Header />}
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/auth" component={Auth} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/verify-email" component={VerifyEmail} />
            <Route path="/oauth/consent" component={OAuthConsent} />
            <Route path="/complete-profile" component={CompleteProfile} />
            <Route path="/help" component={UserGuide} />
            <Route path="/changelog" component={Changelog} />
            <ProtectedRoute path="/support" component={Support} />
            <Route path="/assessment/:assessmentId" component={Assessment} />
            <Route path="/results/:assessmentId" component={Results} />
            <ProtectedRoute path="/me" component={Profile} />
            <ProtectedRoute path="/insights" component={Insights} />
            <ProtectedRoute path="/admin" component={Admin} />
            <Route path="/:modelSlug" component={ModelHome} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
      <WhatsNewModal />
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

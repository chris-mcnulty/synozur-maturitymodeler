import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { User, Settings, LogOut, Home } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navigation() {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();

  // Don't show navigation on auth page
  if (location === "/auth") return null;

  return (
    <header className="border-b">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/">
            <a className="flex items-center gap-2 hover:opacity-80">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">S</span>
              </div>
              <span className="font-semibold">Maturity Modeler</span>
            </a>
          </Link>
          
          {user && (
            <nav className="flex items-center gap-4">
              <Link href="/">
                <a className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Home
                </a>
              </Link>
              <Link href="/admin">
                <a className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Admin
                </a>
              </Link>
              <Link href="/me">
                <a className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Profile
                </a>
              </Link>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>{user.name || user.username}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </>
          ) : (
            <Link href="/auth">
              <Button size="sm">Sign In</Button>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
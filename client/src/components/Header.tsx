import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Moon, Sun, User, LogOut } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import synozurLogo from '@assets/SA-Logo-Horizontal-color_1759930898755.png';

export function Header() {
  const { theme, setTheme } = useTheme();
  const { user, logout, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    if (logoutMutation.isPending) return;
    await logout();
    setLocation('/');
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <a 
            href="https://www.synozur.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center hover-elevate transition-all rounded-lg -ml-2"
            data-testid="link-synozur-website"
          >
            <img 
              src={synozurLogo} 
              alt="Synozur" 
              className="h-10 w-auto"
            />
          </a>
          <div className="h-6 w-px bg-border"></div>
          <Link href="/" className="text-lg font-bold text-foreground hover:text-primary transition-colors">
            Maturity Modeler
          </Link>
        </div>
        
        <nav className="hidden md:flex items-center space-x-6">
          <Link href="/" className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-home">
            Home
          </Link>
          {user && (
            <>
              <Link href="/admin" className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-admin">
                Admin
              </Link>
              <Link href="/me" className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-profile">
                Profile
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-testid="button-theme-toggle"
            className="hover-elevate active-elevate-2"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                  <User className="h-5 w-5" />
                  <span className="hidden md:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/me">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                {(user.role === 'admin' || user.role === 'modeler') && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      Admin Panel
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} disabled={logoutMutation.isPending}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {logoutMutation.isPending ? "Logging out..." : "Logout"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/auth">
              <Button variant="default" data-testid="button-signin">
                Sign In
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

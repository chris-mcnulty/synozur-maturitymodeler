import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Moon, Sun, User, LogOut, HelpCircle, BookOpen, FileText, Ticket, Bot, Mail } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@/hooks/use-auth";
import { USER_ROLES } from "@shared/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import synozurLogo from '@assets/SA-Logo-Horizontal-color_1759930898755.png';
import { SynozurAppSwitcher } from "./SynozurAppSwitcher";
import { HelpChatPanel } from "./HelpChatPanel";

// Helper function to check if user has admin permissions
function isAdminUser(user: any): boolean {
  if (!user || !user.role) return false;
  // Support both new and legacy role names
  return user.role === USER_ROLES.GLOBAL_ADMIN || 
         user.role === USER_ROLES.TENANT_ADMIN ||
         user.role === 'admin'; // Legacy support
}

// Helper function to check if user can manage models
function canManageModels(user: any): boolean {
  if (!user || !user.role) return false;
  return user.role === USER_ROLES.GLOBAL_ADMIN || 
         user.role === USER_ROLES.TENANT_ADMIN || 
         user.role === USER_ROLES.TENANT_MODELER ||
         user.role === 'admin' || // Legacy support
         user.role === 'modeler'; // Legacy support
}

export function Header() {
  const { theme, setTheme } = useTheme();
  const { user, logout, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [showHelpChat, setShowHelpChat] = useState(false);

  const { data: whatsNewData } = useQuery<{ showModal: boolean }>({
    queryKey: ["/api/changelog/whats-new"],
    enabled: !!user,
  });
  const hasUnseenUpdates = !!whatsNewData?.showModal;

  const handleLogout = async () => {
    if (logoutMutation.isPending) return;
    await logout();
    setLocation('/');
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <SynozurAppSwitcher currentApp="orion" />
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
                className="h-10 w-auto max-w-[120px] sm:max-w-none object-contain"
              />
            </a>
            <div className="h-6 w-px bg-border"></div>
            <Link href="/" className="text-lg font-bold text-foreground hover:text-primary transition-colors">
              Orion
            </Link>
          </div>
          
          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/" className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-home">
              Home
            </Link>
            {user && (
              <>
                {canManageModels(user) && (
                  <Link href="/admin" className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-admin">
                    Admin
                  </Link>
                )}
                <Link href="/me" className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-profile">
                  Profile
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-help-menu" className="relative">
                  <HelpCircle className="h-5 w-5" />
                  {hasUnseenUpdates && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" data-testid="indicator-unseen-updates" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/help" data-testid="link-help-user-guide">
                    <BookOpen className="mr-2 h-4 w-4" />
                    User Guide
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/changelog" data-testid="link-help-changelog">
                    <FileText className="mr-2 h-4 w-4" />
                    Changelog
                    {hasUnseenUpdates && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-primary" />
                    )}
                  </Link>
                </DropdownMenuItem>
                {user && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/support" data-testid="link-help-support">
                        <Ticket className="mr-2 h-4 w-4" />
                        Support Tickets
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowHelpChat(true)} data-testid="button-help-chat">
                      <Bot className="mr-2 h-4 w-4" />
                      Ask Help Assistant
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="mailto:support@synozur.com" data-testid="link-help-email">
                    <Mail className="mr-2 h-4 w-4" />
                    Email Support
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
                  {canManageModels(user) && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" data-testid="link-admin-mobile">
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
      <HelpChatPanel open={showHelpChat} onClose={() => setShowHelpChat(false)} />
    </>
  );
}

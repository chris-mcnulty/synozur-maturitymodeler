import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Moon, Sun, User } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function Header() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <a 
            href="https://www.synozur.com" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center gap-2 hover-elevate transition-all rounded-lg px-2 py-1 -ml-2"
            data-testid="link-synozur-website"
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-sm font-semibold text-primary">Synozur</span>
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
          <Link href="/me" className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-profile">
            My Results
          </Link>
          <a href="https://www.synozur.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-privacy">
            Privacy
          </a>
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
          
          <Button variant="ghost" size="icon" data-testid="button-profile" className="hover-elevate active-elevate-2">
            <User className="h-5 w-5" />
          </Button>
          
          <Button variant="default" data-testid="button-signin">
            Sign In
          </Button>
        </div>
      </div>
    </header>
  );
}

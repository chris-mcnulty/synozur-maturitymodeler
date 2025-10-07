import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t bg-card mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-bold mb-4 text-primary">
              Synozur
            </h3>
            <p className="text-sm text-muted-foreground">
              Science-backed maturity assessments trusted by leading enterprises.
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Platform</h4>
            <ul className="space-y-2">
              <li><Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-home">Home</Link></li>
              <li><Link href="/me" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-results">My Results</Link></li>
              <li><Link href="/admin" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-admin">Admin</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2">
              <li><a href="https://www.synozur.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-privacy">Privacy Policy</a></li>
              <li><a href="https://www.synozur.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-website">Synozur.com</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <p className="text-xs text-muted-foreground mb-2">
              © The Synozur Alliance, LLC. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground">
              "Synozur" and "The Synozur Alliance" are trademarks of The Synozur Alliance, LLC.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

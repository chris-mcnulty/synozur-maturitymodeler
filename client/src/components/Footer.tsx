import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t bg-card mt-auto">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-lg font-bold mb-4 text-primary">
              Orion
            </h3>
            <p className="text-sm text-muted-foreground">
              Chart your course with confidence.
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
              <li><a href="https://www.synozur.com/applications/orion#:~:text=and%20people%2Dcentric.-,User%20Guide,-Orion%20is%20a" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-user-guide">User Guide</a></li>
              <li><a href="https://www.synozur.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-privacy">Privacy Policy</a></li>
              <li><a href="https://www.synozur.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-website">Synozur.com</a></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t pt-8">
          <h4 className="font-semibold mb-4">Legal</h4>
          <p className="text-xs text-muted-foreground mb-2">
            © 2025 The Synozur Alliance, LLC. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            "Synozur" and "The Synozur Alliance" are trademarks of The Synozur Alliance, LLC.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Disclaimer:</strong> Information provided on this site is presented "as is" without any express or implied warranties. This is a preliminary release, and access or availability is not guaranteed. By using this site, you signify your consent to these terms and acknowledge that your usage is subject to Synozur's Data Gathering and Privacy Policy.
          </p>
        </div>
      </div>
    </footer>
  );
}

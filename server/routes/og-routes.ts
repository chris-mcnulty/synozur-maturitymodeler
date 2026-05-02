import type { Express } from "express";
  import { db } from "../db";
  import { eq } from "drizzle-orm";
  import * as schema from "@shared/schema";

  export function registerOgRoutes(app: Express) {
    app.get('/api/og/:modelSlug', async (req, res) => {
    const { modelSlug } = req.params;
    
    try {
      // Find the model with this slug
      const modelResult = await db
        .select()
        .from(schema.models)
        .where(eq(schema.models.slug, modelSlug))
        .limit(1);
      
      const model = modelResult[0];
      if (!model) {
        // No model found, redirect to homepage
        return res.redirect('/');
      }
      
      // Model found! Generate HTML with proper meta tags
      // Crawlers will see the meta tags, real users will be redirected
      const html = generateModelHTML(model, true);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error('Error in Open Graph preview page:', error);
      res.redirect('/');
    }
  });
  }

  // Helper function to generate HTML with model-specific meta tags
function generateModelHTML(model: any, includeRedirect: boolean = false) {
  const title = `${model.name} | The Synozur Alliance`;
  const description = model.description;
  const url = `https://models.synozur.com/${model.slug}`;
  const shareUrl = `https://models.synozur.com/api/og/${model.slug}`;
  const imageUrl = "https://models.synozur.com/og-image.jpg";
  
  // For share pages, use share URL in og:url so crawlers see the right thing
  // but include canonical link to the actual page
  const ogUrl = includeRedirect ? shareUrl : url;
  
  // Add redirect script for real users (crawlers won't execute it)
  const redirectScript = includeRedirect 
    ? `<script>
      // Redirect real users to the actual model page
      // Social media crawlers won't execute this, so they'll see the meta tags
      if (window.location.pathname.startsWith('/api/og/')) {
        window.location.replace('/${model.slug}');
      }
    </script>`
    : '';
  
  return `<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${includeRedirect ? `<link rel="canonical" href="${escapeHtml(url)}" />` : ''}
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(ogUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1024" />
    <meta property="og:image:height" content="1024" />
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapeHtml(ogUrl)}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- Start of HubSpot Embed Code -->
    <script type="text/javascript" id="hs-script-loader" async defer src="//js-na2.hs-scripts.com/49076134.js"></script>
    <!-- End of HubSpot Embed Code -->
    ${redirectScript}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

  
# Synozur Multi-Model Maturity Platform - Design Guidelines

## Design Approach

**Selected Approach**: Custom Design System with Synozur Brand Identity

This is a utility-focused maturity assessment platform requiring professional credibility, data clarity, and trust-building visual design. The design balances functional efficiency (assessment flows, admin dashboards) with visual impact (landing pages, results visualization) to serve both business users and enterprise administrators.

**Reference Inspiration**: Base visual direction on https://ai-transform-chrismcnulty1.replit.app/ prototype aesthetic

## Core Design Elements

### A. Color Palette

**Dark Mode (Default)**
- Background: 11 7% 6% (--syno-bg: #0B0B10)
- Surface: 240 18% 10% (--syno-surface: #15151E)
- Text Primary: 240 12% 93% (--syno-text: #EDEDF2)
- Text Muted: 233 8% 73% (--syno-muted: #B5B7C2)

**Brand Colors**
- Primary: 274 95% 52% (#810FFB - vivid purple)
- Secondary: 315 92% 48% (#E60CB3 - vibrant pink)
- Gradient: linear-gradient(135deg, #810FFB 0%, #E60CB3 100%)

**Light Mode**
- Background: 0 0% 100% (#FFFFFF)
- Surface: 240 33% 98% (#F7F7FB)
- Text Primary: 233 18% 13% (#1A1B24)
- Text Muted: 233 11% 36% (#4D5060)

**Semantic Colors**
- Success: 141 73% 42% (#1DB954)
- Warning: 41 100% 64% (#FFC24A)
- Error: 354 100% 67% (#FF5A6E)

### B. Typography

**Font Family**: "Avenir Next LT Pro", -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif

**Type Scale**
- Hero/Display: 48px-72px (font-weight: 700-800)
- H1: 40px (font-weight: 700)
- H2: 32px (font-weight: 600)
- H3: 24px (font-weight: 600)
- H4: 20px (font-weight: 600)
- Body Large: 18px (font-weight: 400)
- Body: 16px (font-weight: 400)
- Body Small: 14px (font-weight: 400)
- Caption: 12px (font-weight: 500)

**Reading Level**: 12th-grade level, conversational, empathetic, people-first tone

### C. Layout System

**Spacing Primitives**: Use Tailwind units of 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32
- Micro spacing: p-1, p-2 (4px, 8px)
- Component spacing: p-3, p-4, p-6 (12px, 16px, 24px)
- Section spacing: py-12, py-16, py-20, py-24 (desktop), py-8, py-12 (mobile)
- Container max-width: max-w-7xl for full sections, max-w-4xl for content, max-w-prose for text

**Border Radius**
- Small (cards, inputs): 8px (--radius-sm)
- Medium (buttons, modals): 12px (--radius-md)
- Large (hero sections): 20px (--radius-lg)

**Elevation**
- Shadow: 0 4px 16px rgba(0,0,0,0.25) for cards and modals on dark backgrounds
- Light mode: 0 2px 12px rgba(0,0,0,0.08)

### D. Component Library

**Navigation**
- Top navigation bar: Fixed, dark surface background, 64px height
- Logo: Synozur wordmark/icon, left-aligned
- Primary nav links: Horizontal, right-aligned
- Mobile: Hamburger menu with slide-in drawer
- Auth state: Profile dropdown or Sign In button

**Buttons**
- Primary: Gradient background (--syno-gradient-1), white text, 12px radius, py-3 px-6
- Secondary: Transparent background, primary border, primary text
- Ghost: No background, primary text, hover state with subtle background
- Destructive: Error color background
- Sizes: Small (py-2 px-4), Medium (py-3 px-6), Large (py-4 px-8)
- Min touch target: 44px height for mobile

**Forms & Inputs**
- Text fields: Surface background, subtle border, 12px radius, py-3 px-4
- Focus state: Primary color border, subtle glow
- Labels: Small text, muted color, mb-2
- Error states: Error color border with error message below
- Dark mode: Ensure input backgrounds contrast with page background

**Assessment Wizard**
- Progress bar: Top of screen, gradient fill showing completion percentage
- Question cards: Surface background, generous padding (p-6 to p-8), rounded corners
- Radio/checkbox options: Large click targets, clear selection states with primary color
- Likert scales: Horizontal layout on desktop, vertical on mobile, labeled endpoints
- Navigation: Back/Next buttons, autosave indicator

**Data Visualization**
- Scorecard displays: Large numbers (48-64px) for overall scores
- Dimension breakdown: Horizontal bar charts with gradient fills
- Maturity labels: Color-coded badges (Nascent=200, Experimental=300, Operational=400, Strategic=450, Transformational=500)
- Benchmark comparisons: Side-by-side bars showing user vs. industry mean with delta indicators
- Trend charts: Line graphs for historical progression

**Admin Tables**
- Striped rows for readability
- Sortable column headers
- Filter controls: Dropdowns and search inputs above table
- Action buttons: Row-level actions (view, edit, delete) on right
- Pagination: Bottom-aligned, showing current page and total

**Cards**
- Model overview cards: Image/icon, title, description, Start CTA
- Result cards: Score badge, date, model name, View link
- Surface background, hover state with subtle lift (transform: translateY(-2px))

## Page-Specific Designs

### Landing Page (/)
**Hero Section** (100vh)
- Full viewport height with gradient background (purple to pink, 135deg)
- Centered headline: "Assess Your Organization's Maturity" (72px, bold)
- Subheadline: "Science-backed assessments trusted by leading enterprises" (20px)
- Primary CTA: "Start Your Assessment" (large button)
- Hero image: Abstract AI/technology visualization with people-first elements, subtle nodes connecting human figures, positioned right or as background overlay

**Featured Models Section**
- Grid layout: 3 columns on desktop, 1 on mobile
- Each model card: Opening graphic (if available), title, 2-line description, "Begin Assessment" button
- Background: Surface color

**Trust Indicators**
- Logo carousel of example companies/industries (if available)
- Stats: "X Assessments Completed", "X Organizations", displayed as large numbers with gradient text

**Footer**
- Dark surface background
- Multi-column layout: About, Models, Resources, Legal
- Privacy policy link (required on every page)
- Copyright: "© The Synozur Alliance, LLC. All rights reserved"
- Trademark notice: "Synozur and The Synozur Alliance are trademarks"

### Model Overview (/:modelSlug)
- Hero section with model-specific opening graphic (if provided) or default system graphic
- Full model description (left 60%, right 40% for graphic on desktop)
- Clear "Start Assessment" CTA
- Optional preview of dimensions with icons

### Assessment Wizard (/:modelSlug/assessment)
- Minimal chrome: Progress bar, question counter, autosave indicator
- One question per screen for focus
- Question text: Large (24px), clear spacing
- Answer options: Ample spacing between choices (min 12px vertical)
- Visual feedback on selection (primary color highlight)

### Results Summary (/:modelSlug/complete)
**If Profile Incomplete**
- Inline profile completion form with clear explanation of why it's needed
- Fields: Name, Email, Company, Job Title, Industry (dropdown), Country (dropdown)

**Results Display**
- Overall score: Prominent display (64px number) with maturity label badge
- Circular or gauge visualization showing position on 100-500 scale
- Per-dimension breakdown: Horizontal bars with scores
- Benchmark comparison (if n≥30): "You scored X points above/below the industry average"
- Resources section: Links to next steps, guides
- CTA: "Download Full Report" (triggers PDF email)
- Optional closing graphic: Optimistic roadmap visual with gradient

### Admin Console (/admin/*)
- Sidebar navigation: Models, Results, Benchmarks, Appearance, Audit
- Dashboard cards showing KPIs: Total assessments, Active models, Benchmark coverage
- Data tables with comprehensive filtering
- CSV import: Drag-and-drop zone with validation feedback
- Theme preview: Live preview of color changes

## Images

**Hero Images**
- Landing page: Large hero image (1200x800px minimum) showing diverse professionals engaged with technology, overlaid with subtle AI network visualization, primary/secondary gradient overlay
- Model pages: Opening graphic showing people-first imagery relevant to model theme (strategy, data, leadership), 800x600px
- Results pages: Closing graphic with optimistic "next steps" theme, roadmap/pathway visual metaphor, 800x600px

**Placeholder Strategy**
- Use gradient backgrounds with simple geometric patterns if custom graphics unavailable
- Ensure all images have appropriate alt text for accessibility

## Accessibility & Mobile

- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text
- Touch targets: Minimum 44x44px for all interactive elements
- Focus indicators: 2px primary color outline on all focusable elements
- Screen reader labels for all form inputs and interactive elements
- Responsive breakpoints: 640px (mobile), 768px (tablet), 1024px (desktop), 1280px (large)
- Test on iOS Safari and Android Chrome

## Animation & Motion

**Use Sparingly**
- Page transitions: Subtle fade-in (200ms)
- Button hover: Scale (1.02) and subtle shadow increase (150ms ease)
- Card hover: translateY(-2px) with shadow change (200ms ease)
- Progress bar: Smooth width transition (300ms ease-out)
- No autoplay animations, respect prefers-reduced-motion

## Content Voice

- Empathetic and supportive tone
- Business-outcome focused messaging
- Clear action-oriented CTAs
- Avoid jargon, explain technical terms
- Encourage progress: "You're making great progress" during assessments
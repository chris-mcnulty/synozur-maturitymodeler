# Maturity Modeler - Synozur Multi-Model Maturity Platform

## Project Overview
Maturity Modeler is a comprehensive fullstack JavaScript application for multi-model maturity assessments with dynamic routing (/:modelSlug), CSV-driven model management, gated PDF results, benchmarking capabilities, and comprehensive admin controls.

## Brand & Design
- **Primary Color**: Purple #810FFB (emphasized throughout)
- **Accent Color**: Pink #E60CB3 (used sparingly in charts/data visualizations only)
- **Theme**: Dark-mode-first UI
- **Typography**: Inter font family
- **Tagline**: "Find Your North Star"
- **Alternative Tagline**: "Synozur - the Transformation Company"
- **Website**: https://www.synozur.com

## Architecture
- **Frontend**: React + Vite + TypeScript + Wouter routing + Shadcn UI
- **Backend**: Express + PostgreSQL + Drizzle ORM
- **Storage**: PostgreSQL database + Object Storage for assets
- **Auth**: Passport-based authentication with session management

## Key Features
- Dynamic model routing (/:modelSlug)
- Assessment wizard with progress tracking and autosave
- Scoring engine (100-500 scale)
- Profile gating for results access
- Email-delivered PDF reports
- Benchmarking against industry peers
- Admin console for model and results management
- CSV-driven model import/export

## Current Status
- ✅ Design system and brand guidelines established
- ✅ Core UI components built with examples
- ✅ Page layouts created (Landing, ModelHome, Assessment, Results, Profile, Admin)
- ✅ Dark mode implementation with theme toggle
- ✅ All 5 question types supported (Multiple Choice, Multi-Select, Numeric, True/False, Text Input)
- ✅ Multi-select questions with proportional scoring (100-500 scale)
- ✅ Company size classification with 7 employee buckets in Profile
- ✅ Model creation backend with JSON import/export
- ✅ Database schema with support for all question/response types including multi-select
- ✅ Dimensions management (CRUD operations with order/reordering)
- ✅ Answer options management for multiple choice and multi-select questions
- ✅ Answer resource editing (title, description, link, improvement statement)
- ✅ Questions grouped by dimension with manual ordering within groups
- ✅ Single unified Header component with auth state management
- ✅ Role-based authentication system with admin/user roles
- ✅ User management in admin panel (view, edit roles, delete users)
- ✅ Secure auth endpoints (passwords excluded from all responses)
- ✅ Robust error handling for duplicate emails and malformed password hashes
- ✅ Registration security: All self-registrations forced to 'user' role (admin must be granted via admin panel)
- ✅ Assessment completion flow with comprehensive error handling
- ✅ Results page redesigned to match prototype (immediate display, no login required)
- ✅ Profile gating for PDF delivery with dual-mode authentication:
  - Login tab for existing users (username/password)
  - Create Account tab for new users (full registration)
  - Tab switcher for seamless mode switching
- ✅ PDF generation with jsPDF matching sample format
- ✅ Improvement resources display from CSV data
- ✅ Dynamic recommendations based on assessment scores
- ✅ CSV import/export with add vs replace mode
- ✅ CSV schema supports multi-select and complete resource metadata
- ✅ General resources column added to models (JSONB structure ready)
- ✅ Featured models system with prime homepage positioning
- ✅ Question count display across all model cards and featured section
- ✅ Admin toggle for marking/unmarking models as featured (star icon)
- ✅ Object storage integration for model images (Google Cloud Storage via Replit)
- ✅ Image upload in admin panel with Uppy (presigned URL flow, ACL enforcement)
- ✅ Image preview, replace, and remove functionality in model editor
- ✅ Landing page layout: Hero (static h1, Sign Up) → Model title/description section → Featured Assessment
- ✅ Hero titles styled with responsive gradients: white on mobile, blue-purple-pink gradient on desktop
- ✅ Both H1 and H2 use matching gradient styles for visual consistency
- ✅ Assessment history filtered by logged-in user (GET /api/assessments endpoint)
- ✅ Profile editing for users (email, name, company, job title, industry, company size, country)
- ✅ Self-service profile update endpoint (PUT /api/profile)
- ✅ Admin reporting with comprehensive dashboard:
  - Statistics cards showing total assessments, average score, registered users, and published models
  - CSV export for assessment results (all assessments with scores, models, users, dates)
  - CSV export for user accounts (username, email, name, company, job title, industry, company size, country, role, created at)
  - Admin-only endpoint (GET /api/admin/assessments) to view all assessments system-wide
  - User profile shows only their own assessment history, while admin can see all assessments
- ✅ Profile fields with standardized dropdown lists:
  - Job Title dropdown with 20 standard roles (CEO, CTO, Manager, etc.) plus "Other" option
  - Industry dropdown with 20 standard industries (Technology, Finance, Healthcare, etc.) plus "Other" option
  - Country dropdown with 20 countries (United States, Canada, UK, etc.)
  - Company Size dropdown with 7 employee size buckets
  - All profile fields are required with frontend and backend validation
  - ProfileGate and Profile page use identical dropdown options for consistency
  - Backend validation with Zod schema (updateProfileSchema) enforcing required fields
- ✅ HubSpot tracking integration:
  - Tracking script added to page header (client/index.html)
  - Loads on all pages across the application
  - HubSpot Account ID: 49076134
  - Script loads asynchronously to avoid blocking page rendering
- ✅ Synozur logo favicon on all pages (browser tabs, bookmarks, mobile home screen)
- ✅ SendGrid email delivery integration:
  - PDF reports sent via email after user login/registration
  - Secure endpoint with authentication and Zod validation
  - Promise-wrapped FileReader for proper async error handling
  - Email validation with user-friendly error messages
  - Base64 PDF encoding and SendGrid attachment delivery
- ✅ Password reset functionality:
  - Forgot password flow with email-based reset links
  - Password reset tokens stored in database with 1-hour expiry
  - Token validation (single-use, expiry check)
  - Secure password hashing using Node.js crypto (scrypt)
  - Defensive error handling for email delivery failures
  - Integration with ProfileGate login tab ("Forgot password?" link)
  - Pages: /forgot-password (email input) and /reset-password (new password form)

## Backlog

### Pending Implementation
- [ ] **Science-Backed Framework Section**: Add metrics/statistics section to model home page showing research validation, assessment counts, and organizational adoption once real data is available
- [ ] **Maturity Scale Editor**: Admin UI to customize maturity level names, descriptions, and score ranges per model
- [ ] **General Resources Editor**: Admin UI to manage general resources shown at end of results (onscreen and PDF)
- [ ] **Results Page Enhancement**: Display custom maturity scales and general resources from model configuration

### Technical Debt
- [ ] Replace mock benchmark data with real calculations
- [ ] Implement benchmark calculation engine
- [ ] Add audit logging system

## User Preferences
- Uses SendGrid for email delivery (API key method, not Replit connector)
- Prefers seeing metrics on home pages when data is available
- Assessment dimensions are valuable and should be emphasized

## Admin Test Account
- **Username**: testadmin
- **Password**: admin123
- **Role**: admin
- Use this account for testing admin functionality

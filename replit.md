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
- ✅ All 4 question types supported (Multiple Choice, Numeric, True/False, Text Input)
- ✅ Company size classification with 7 employee buckets in Profile
- ✅ Model creation backend with JSON import/export
- ✅ Database schema with support for all question/response types
- ✅ Dimensions management (CRUD operations with order/reordering)
- ✅ Answer options management for multiple choice questions
- ✅ Questions grouped by dimension with manual ordering within groups
- ✅ Single unified Header component with auth state management
- ✅ Role-based authentication system with admin/user roles
- ✅ User management in admin panel (view, edit roles, delete users)
- ✅ Secure auth endpoints (passwords excluded from all responses)
- ✅ Robust error handling for duplicate emails and malformed password hashes
- ✅ Assessment completion flow with comprehensive error handling
- ✅ Results page redesigned to match prototype (immediate display, no login required)
- ✅ Profile gating for PDF delivery (not for viewing results)
- ✅ PDF generation with jsPDF matching sample format
- ✅ Improvement resources display from CSV data
- ✅ Dynamic recommendations based on assessment scores

## Backlog

### Pending Implementation
- [ ] **Email Delivery**: SendGrid integration ready - awaiting SENDGRID_API_KEY (expected next week)
- [ ] **Science-Backed Framework Section**: Add metrics/statistics section to model home page showing research validation, assessment counts, and organizational adoption once real data is available

### Technical Debt
- [ ] Replace mock benchmark data with real calculations
- [ ] Implement CSV model import/export functionality
- [ ] Implement benchmark calculation engine
- [ ] Add audit logging system

## User Preferences
- Uses SendGrid for email delivery (API key method, not Replit connector)
- Prefers seeing metrics on home pages when data is available
- Assessment dimensions are valuable and should be emphasized

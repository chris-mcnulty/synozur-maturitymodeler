# Maturity Modeler - Synozur Multi-Model Maturity Platform

## Overview
Maturity Modeler is a comprehensive fullstack JavaScript application designed for multi-model maturity assessments. Its core purpose is to provide dynamic routing for assessments, manage models via CSV, generate gated PDF results, offer benchmarking capabilities, and provide extensive administrative controls. The platform aims to help users "Find Their North Star" through insightful maturity assessments, aligning with Synozur's vision as "the Transformation Company."

## User Preferences
- Uses SendGrid for email delivery (API key method, not Replit connector)
- Prefers seeing metrics on home pages when data is available
- Assessment dimensions are valuable and should be emphasized

## System Architecture
The application uses a modern fullstack architecture:
- **Frontend**: React, Vite, TypeScript, Wouter for routing, and Shadcn UI for component styling.
- **Backend**: Express.js for the API, PostgreSQL for the database, and Drizzle ORM for database interactions.
- **Storage**: PostgreSQL for relational data and object storage (Google Cloud Storage) for assets like model images and knowledge documents.
- **Authentication**: Passport-based session management with role-based access control (admin, modeler, user).
- **UI/UX**: Features a dark-mode-first UI with a primary purple (#810FFB) and accent pink (#E60CB3) color scheme, utilizing the Inter font family. Responsive gradient styling is applied to hero titles. Admin sidebar is collapsible with icon-only mode and hover tooltips.
- **Core Features**: Dynamic model routing (/:modelSlug), assessment wizard with autosave, 100-500 point scoring engine, profile gating for results, email-delivered PDF reports, benchmarking, and a comprehensive admin console.
- **Model Management**: CSV-driven import/export of models, dimensions, answer options, and resource editing. Models can be featured on the homepage.
- **User Management**: Admin panel for user CRUD, role assignment, and email verification management. Self-registration defaults to 'user' role.
- **Email System**: Integrated email verification, password reset, and PDF report delivery via SendGrid. Email templates support dynamic content and consistent branding.
- **AI Integration**: Leverages Azure OpenAI GPT-5 for generating personalized recommendations, interpretations, and roadmaps, with a 90-day caching mechanism for cost efficiency. Includes an AI content review workflow for admin approval.
- **Knowledge Base**: User-uploadable documents (PDF, DOCX, DOC, TXT, MD) for AI grounding. Supports company-wide and model-specific scopes. Documents stored in object storage with metadata in `knowledge_documents` table (field: `name` for filename, not `fileName`).
- **Data Import**: System for importing anonymized assessment data with validation, fuzzy text matching for question mapping, and batch tracking.
- **Reporting**: Admin dashboard with statistics displaying actual user names and companies. CSV exports include real user data for assessment results and user accounts. Anonymous/imported assessments display as "Anonymous".
- **Profile Management**: User profile editing with standardized dropdowns for job title, industry, company size, and country, all with required validation.
- **Social Sharing**: Enables sharing assessment results across multiple social platforms with pre-filled content.
- **Open Graph Integration**: Comprehensive Open Graph and Twitter Card meta tags for rich social media previews when sharing links on LinkedIn, Facebook, Twitter, and other platforms. Features custom preview image with Synozur branding.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Google Cloud Storage**: Used for object storage of model images.
- **SendGrid**: Email delivery service for verification, password resets, and PDF reports.
- **Azure OpenAI GPT-5**: AI service for generating personalized recommendations and content.
- **HubSpot**: Integrated for website tracking (Account ID: 49076134).
- **jsPDF**: Library used for generating PDF reports.
- **Uppy**: Frontend file uploader for image management in the admin panel.
- **React Icons (react-icons/si)**: Provides social media icons for the sharing feature.
# Orion User Guide

**Welcome to Orion - The Synozur Maturity Assessment Platform**

Version 2.0 | Last Updated: February 14, 2026

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Introduction](#introduction)
3. [Getting Started](#getting-started)
4. [What's New & Changelog](#whats-new--changelog)
5. [Taking an Assessment](#taking-an-assessment)
6. [Understanding Your Results](#understanding-your-results)
7. [AI-Powered Insights](#ai-powered-insights)
8. [Benchmarking](#benchmarking)
9. [Social Sharing](#social-sharing)
10. [Managing Your Profile](#managing-your-profile)
11. [Assessment History](#assessment-history)
12. [Claiming Anonymous Assessments](#claiming-anonymous-assessments)
13. [Microsoft SSO Login](#microsoft-sso-login)
14. [Model Import Format (.model JSON)](#model-import-format-model-json)
15. [Admin Guide](#admin-guide)
16. [Best Practices](#best-practices)
17. [Frequently Asked Questions](#frequently-asked-questions)
18. [Troubleshooting](#troubleshooting)
19. [Privacy & Data Usage](#privacy--data-usage)
20. [Getting Help](#getting-help)

---

## Feature Overview

Orion is a comprehensive maturity assessment platform with the following capabilities organized by category:

### Assessment & Scoring
- **Multi-Model Assessments** - Take assessments across multiple maturity models covering different domains
- **Dynamic Model Routing** - Each model has its own URL slug for direct access and sharing
- **Flexible Scoring Engine** - Supports 100-point scale (averaging or sum) and 100-500 point scales
- **Assessment Wizard** - Step-by-step question flow with auto-save, progress tracking, and back navigation
- **Anonymous Assessments** - Start assessments without creating an account, with nudges to register
- **Assessment Claiming** - Automatically associate anonymous assessments with your account upon signup
- **Proxy Assessments** - Admins can create assessments on behalf of prospects with stored profile data

### AI & Intelligence
- **Personalized Executive Summary** - AI-generated analysis of your maturity level, tailored to your role and industry
- **Dimension Interpretations** - Detailed AI analysis of each dimension score with specific challenges and opportunities
- **Transformation Roadmap** - AI-generated strategic priorities with phased improvement approach
- **Personalized Recommendations** - 3-5 actionable recommendations prioritized by impact
- **Knowledge Base Grounding** - AI insights grounded in uploaded company documents for higher relevance
- **Content Review Workflow** - Admin review and approval process for AI-generated content
- **90-Day AI Caching** - Efficient caching of AI responses to reduce latency and cost

### Benchmarking & Analytics
- **Industry Benchmarking** - Compare scores against industry peers
- **Company Size Benchmarking** - Benchmarks segmented by organization size
- **Country Benchmarking** - Regional comparison data
- **Combined Segment Benchmarks** - Cross-segment comparisons (e.g., industry + company size)
- **Configurable Thresholds** - Minimum sample sizes for statistical validity
- **Traffic Analytics** - Visit tracking and engagement metrics for admins

### Reports & Sharing
- **PDF Reports** - Downloadable PDF reports with all insights and benchmarks
- **Email Delivery** - PDF reports delivered via SendGrid email
- **Social Sharing** - Share results on LinkedIn, Twitter, Facebook, and email
- **Open Graph Previews** - Model-specific social media preview cards
- **QR Code Sharing** - Shareable QR codes for assessment links

### Model Management (Admin Only)
- **CSV Import/Export** - Full structure and simplified question-only CSV formats
- **.model JSON Import/Export** - Complete model backup and restore format
- **ModelBuilder** - Visual editor with Overview, Structure, Resources, and Maturity Scale tabs
- **Model Archiving** - Archive models without deleting data or assessment history
- **Model Duplication** - Clone existing models as starting points
- **Assessment Tagging** - Custom tags with configurable names, colors, and descriptions
- **Tenant-Private Models** - Restrict model visibility to specific tenants

### User Management (Admin Only)
- **User CRUD** - Create, update, delete users with role assignment
- **Bulk User Import** - Import multiple users via CSV
- **Email Verification** - Automated and manual email verification
- **Password Resets** - Self-service and admin-initiated password resets
- **Four-Tier RBAC** - global_admin, tenant_admin, tenant_modeler, user roles

### Authentication & Identity
- **Email/Password Signup** - Standard registration with profile completion
- **Microsoft Entra ID SSO** - Enterprise SSO with PKCE flow and auto-provisioning
- **OAuth 2.1 Identity Provider** - Orion as OIDC provider for the Synozur ecosystem (Admin-configured)
- **SSO Profile Completion** - Required profile fields collected after first SSO login
- **Session Management** - Database-backed sessions with secure cookie handling

### Platform & Administration (Admin Only)
- **Multi-Tenant Architecture** - Tenant-scoped data isolation with domain mapping
- **Knowledge Base** - Upload documents (PDF, DOCX, TXT, MD) for AI grounding
- **Assessment Data Import** - Bulk import anonymized assessment data with validation
- **Benchmark Configuration** - Configure calculation parameters and segment inclusion
- **OAuth Client Management** - CRUD for OAuth clients with credential management
- **Tenant Management** - Azure AD tenant tracking, consent status, domain management

---

## Introduction

### What is Orion?

Orion is Synozur's AI-powered maturity modeling platform designed to bridge the gap between where organizations are and where they need to go. By integrating deep expertise with advanced AI (Anthropic Claude), Orion delivers customized assessments and generates tailored transformation roadmaps specific to your industry, role, location, and company size. The platform provides instant, actionable insights and clear guidance, making complex transformation achievable and people-centric.

### Who Should Use This Guide?

This guide is designed for all Orion users, including:
- **Assessment takers** evaluating their organization's maturity
- **Managers and leaders** using insights for strategic planning
- **Model administrators** managing assessment models and content
- **Tenant administrators** managing users and organizational settings
- **Global administrators** overseeing the entire platform

---

## Getting Started

### Creating an Account

#### Method 1: Email and Password

1. Navigate to the Orion homepage and click **"Sign Up"**
2. Complete the registration form:
   - **Full Name**
   - **Email Address**
   - **Password** (minimum 8 characters)
   - **Company Name**
   - **Job Title** (select from dropdown)
   - **Industry** (select from dropdown)
   - **Company Size** (select from dropdown)
   - **Country** (select from dropdown)
3. Click **"Sign Up"**
4. Check your email for a verification link
5. Click the verification link to activate your account
6. Log in with your credentials

**Why profile information matters**: Your profile data ensures that AI-generated insights, recommendations, and benchmarks are personalized to your role, industry, and organization size.

#### Method 2: Microsoft Single Sign-On (SSO)

If your organization has enabled Microsoft SSO:

1. Navigate to the Orion login page
2. Click **"Sign in with Microsoft"** (available on both Login and Sign Up tabs)
3. You'll be redirected to Microsoft's login page
4. Enter your Microsoft 365 credentials
5. Grant permissions when prompted
6. You'll be automatically redirected back to Orion

**First-Time SSO Users**: After your first Microsoft sign-in, you'll be asked to complete your profile with required fields (company, job title, industry, company size, country). This ensures your AI insights are properly personalized.

**Benefits of SSO:**
- No separate password to remember
- More secure authentication
- Automatic account provisioning
- Enterprise-grade security with PKCE flow

### Logging In

1. Navigate to the login page
2. Enter your email and password, or click **"Sign in with Microsoft"**
3. Click **"Log In"**

---

## What's New & Changelog

Orion maintains a detailed changelog documenting all platform updates. See [CHANGELOG.md](./CHANGELOG.md) for the full history of new features, improvements, and fixes.

---

## Taking an Assessment

### Starting an Assessment

1. **Browse Available Models**: From the homepage, you'll see all available maturity assessment models displayed as cards
2. **Select a Model**: Click on any model card to view details, or click **"Start Assessment"** to begin
3. **Review Model Information**: Each model shows:
   - Model name and description
   - Number of questions
   - Estimated completion time
   - Assessment dimensions (key areas being evaluated)

### Completing the Assessment

1. **Answer Questions**: Progress through the assessment wizard by answering each question
   - Select one answer option per question
   - Your progress is automatically saved as you go
2. **Navigate**: Use **"Next"** to move forward or **"Back"** to review previous answers
3. **Auto-Save**: Don't worry about losing your work - your responses are saved automatically

### Anonymous Assessments

You can start assessments without creating an account:
- Navigate to any model and begin the assessment
- Complete all questions
- View basic results

**Pro tip**: Create a free account to unlock:
- AI-powered personalized insights
- Benchmarking against industry peers
- Saved assessment history
- Email delivery of PDF reports

---

## Understanding Your Results

### Overall Maturity Score

Your total score indicates your organization's overall maturity level. Scoring varies by model:

**100-Point Scale Models** (most common):
- Scores range from 0-100
- Answer scores are averaged across all questions by default
- Maturity levels typically span 4-5 ranges (e.g., Initial, Developing, Defined, Optimized)

**500-Point Scale Models** (5 dimensions x 100 each):
- Scores range from 100-500
- Typical levels: Initial (0-99), Developing (100-199), Defined (200-299), Managed (300-399), Optimized (400-500)

**Note**: Each model defines its own maturity levels and score ranges. Check the specific model for its scale.

### Dimension Scores

Each assessment evaluates multiple dimensions (e.g., Strategy & Leadership, Data & Infrastructure). You'll see:
- Individual scores for each dimension
- Maturity level for each area
- Visual radar chart showing your strengths and opportunities

---

## AI-Powered Insights

### Available to Registered Users Only

When logged in, you'll receive AI-generated insights powered by Anthropic Claude:

**Executive Summary**
- Personalized analysis of your maturity level
- Context specific to your role, industry, and company size
- Key strengths and improvement areas

**Dimension Interpretations**
- Detailed analysis of each dimension score
- What your score means for your organization
- Specific challenges and opportunities

**Transformation Roadmap**
- Strategic priorities for your transformation journey
- Phased approach to improvement
- Quick wins and long-term initiatives

**Personalized Recommendations**
- 3-5 actionable recommendations prioritized by impact
- Specific next steps for each recommendation
- Expected outcomes and resource suggestions

### Knowledge Base Grounding

When model administrators have uploaded relevant documents to the Knowledge Base, AI insights are grounded in that content for higher-quality, more specific recommendations aligned to industry frameworks and best practices.

### Downloading Your PDF Report

1. Scroll to the **"Download Your Results"** section on the results page
2. Click **"Download PDF Report"**
3. Check your email for the PDF delivery (if logged in)
4. The PDF includes all insights, recommendations, and benchmark comparisons

---

## Benchmarking

Compare your scores against peer organizations:

- **Overall Average** - Across all completed assessments
- **Industry Benchmarks** - Organizations in your same industry
- **Company Size Benchmarks** - Organizations of similar size
- **Country Benchmarks** - Organizations in your region
- **Combined Segments** - Cross-segment comparisons (e.g., your industry + company size)

**Note**: Benchmarks require a minimum number of assessments to ensure statistical validity. If a benchmark isn't available, it means there aren't enough data points yet. As more organizations complete assessments, benchmarks become more representative.

---

## Social Sharing

Share your assessment results on social media:

1. Navigate to your results page
2. Scroll to the **"Share Your Achievement"** section
3. Click your preferred platform:
   - LinkedIn
   - Twitter
   - Facebook
   - Email

**What's shared**: A link to the assessment model with an Open Graph preview (not your personal scores or data).

---

## Managing Your Profile

### Editing Your Profile

1. Navigate to your Profile page (click your name in the header)
2. Click **"Edit Profile"**
3. Update any information:
   - Full name
   - Company
   - Job title
   - Industry
   - Company size
   - Country
4. Click **"Save Changes"**

**Important**: Updated profile information improves the personalization of future AI insights and ensures accurate benchmarking.

### Changing Your Password

1. Go to your Profile page
2. Click **"Edit Profile"**
3. Scroll to the password section
4. Enter your current password
5. Enter and confirm your new password
6. Click **"Save Changes"**

---

## Assessment History

### Viewing Past Assessments

1. Navigate to your Profile page
2. Scroll to **"Your Assessment History"**
3. View all completed assessments with:
   - Model name
   - Completion date
   - Overall score

### Revisiting Results

Click **"View Results"** on any past assessment to see:
- Original scores and insights
- Updated benchmarks (as more data becomes available)
- Download PDF reports from previous assessments

---

## Claiming Anonymous Assessments

If you started an assessment without logging in:

1. Complete the assessment to view results
2. Click **"Create Free Account"** or **"Log In"** on the results page
3. Complete signup or login
4. Your assessment is automatically associated with your account
5. Access enhanced AI insights and downloadable reports

---

## Microsoft SSO Login

### For Users

If your organization uses Microsoft Entra ID (Azure AD):

1. Click **"Sign in with Microsoft"** on the login or signup page
2. Authenticate with your Microsoft credentials
3. On first login, complete your profile with required demographic fields
4. You'll be automatically provisioned into the correct tenant based on your email domain or Azure AD tenant

### For Organization Administrators

To enable Microsoft SSO for your organization:

1. Contact your global administrator to set up the Azure AD integration
2. Your admin will need to grant admin consent for the Orion application
3. Once configured, users with matching email domains will be auto-provisioned

**Auto-Provisioning**: Users are matched to tenants by:
1. Azure AD tenant ID (highest priority)
2. Email domain matching
3. New tenant creation (if allowed by platform settings)

---

## Model Import Format (.model JSON)

### Overview

The `.model` JSON format is the standard format for importing and exporting complete maturity assessment models in Orion. This section serves as a reference for creating models programmatically or with AI assistance.

### Format Specification

```json
{
  "formatVersion": "1.0",
  "exportedAt": "2025-01-15T10:30:00.000Z",
  "model": {
    "name": "Your Model Name",
    "slug": "your-model-name",
    "description": "A description of what this maturity model assesses.",
    "version": "1.0.0",
    "estimatedTime": "15-20 minutes",
    "status": "published",
    "featured": false,
    "allowAnonymousResults": false,
    "imageUrl": null,
    "maturityScale": [
      {
        "id": "1",
        "name": "Level 1 Name (e.g. Initial)",
        "description": "Description of what this maturity level means.",
        "minScore": 0,
        "maxScore": 25
      },
      {
        "id": "2",
        "name": "Level 2 Name (e.g. Developing)",
        "description": "Description of this level.",
        "minScore": 26,
        "maxScore": 50
      },
      {
        "id": "3",
        "name": "Level 3 Name (e.g. Defined)",
        "description": "Description of this level.",
        "minScore": 51,
        "maxScore": 75
      },
      {
        "id": "4",
        "name": "Level 4 Name (e.g. Optimized)",
        "description": "Description of this level.",
        "minScore": 76,
        "maxScore": 100
      }
    ],
    "generalResources": [
      {
        "id": "1",
        "title": "Resource Title",
        "description": "What this resource covers.",
        "link": "https://example.com/resource"
      }
    ]
  },
  "dimensions": [
    {
      "key": "dimension-slug",
      "label": "Dimension Display Name",
      "description": "What this dimension measures.",
      "order": 1
    }
  ],
  "questions": [
    {
      "dimensionKey": "dimension-slug",
      "text": "The question text shown to the assessment taker.",
      "type": "multiple_choice",
      "order": 1,
      "minValue": null,
      "maxValue": null,
      "unit": null,
      "placeholder": null,
      "improvementStatement": "General guidance for improving in this area.",
      "resourceTitle": "Helpful Resource",
      "resourceLink": "https://example.com/help",
      "resourceDescription": "What this resource covers.",
      "answers": [
        {
          "text": "Answer option text (lowest maturity)",
          "score": 0,
          "order": 1,
          "improvementStatement": "Specific improvement advice if this answer is selected.",
          "resourceTitle": null,
          "resourceLink": null,
          "resourceDescription": null
        },
        {
          "text": "Answer option text (highest maturity)",
          "score": 100,
          "order": 2,
          "improvementStatement": null,
          "resourceTitle": null,
          "resourceLink": null,
          "resourceDescription": null
        }
      ]
    }
  ]
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `formatVersion` | Yes | Always `"1.0"` |
| `exportedAt` | No | ISO 8601 timestamp |
| `model.name` | Yes | Display name of the model |
| `model.slug` | Yes | URL-safe, lowercase, hyphens only. Must be unique. Example: `"ai-readiness"` |
| `model.description` | Yes | What this model assesses |
| `model.version` | Yes | Semantic version, e.g. `"1.0.0"` |
| `model.estimatedTime` | No | Free text like `"15-20 minutes"` or `null` |
| `model.status` | Yes | One of: `"draft"`, `"published"`, `"archived"` |
| `model.featured` | No | Boolean, defaults to `false` |
| `model.allowAnonymousResults` | No | Boolean, defaults to `false` |
| `model.imageUrl` | No | URL for model hero image, or `null` |
| `model.maturityScale` | Yes | Array of maturity levels (see below) |
| `model.generalResources` | No | Array of resources shown after results, or `null` |

### Scoring System

**100-Point Scale (Default)**:
- Answer scores range from 0 to 100 (e.g., 0, 25, 50, 75, 100)
- Scores are **averaged** across all questions by default
- Maturity scale ranges should span 0-100
- For **sum scoring** (traditional 0-4 Likert answers), add `"scoringMethod": "sum"` as a property on the maturityScale array. Answer scores would then be 0, 1, 2, 3, 4 and maturity scale ranges should reflect the total possible sum.

**500-Point Scale** (5 dimensions x 100 max each):
- Set maturity scale ranges to span 100-500
- Scores are always averaged on 500-point scales

### Key Rules

- **maturityScale**: Array of levels with non-overlapping `minScore`/`maxScore` ranges. Each level needs a unique string `id`. Typically 4-5 levels.
- **dimensions**: Logical groupings of questions (e.g., People, Process, Technology). Each needs a unique `key` in slug format. Typically 3-7 dimensions.
- **questions**: Each belongs to a dimension via `dimensionKey` matching a dimension's `key`. Use `"multiple_choice"` type with 4-5 answer options.
- **answers**: Each needs a numeric `score` and `order` (1-based). Answers should progress from lowest to highest maturity.
- **improvementStatement**: Optional. On an answer, provides specific advice when selected. On a question, provides general improvement guidance.
- **Resources**: `resourceTitle`, `resourceLink`, `resourceDescription` are optional on questions and answers. `generalResources` on the model are shown at the end of results.
- **Nullable fields**: `estimatedTime`, `imageUrl`, `improvementStatement`, all resource fields, `minValue`, `maxValue`, `unit`, `placeholder` can be `null`.

---

## Admin Guide

For comprehensive administrator documentation including model management, user administration, AI content review, knowledge base management, benchmark configuration, and more, see the dedicated [Admin Guide](./ADMIN_GUIDE.md).

---

## Best Practices

### Before You Start
- Set aside uninterrupted time (most assessments take 10-20 minutes)
- Review the assessment dimensions to understand what's being evaluated
- Consider involving team members for more accurate responses

### While Taking the Assessment
- Answer honestly based on your current state, not aspirations
- If between two options, choose the one that best reflects your current reality
- Don't rush - thoughtful answers lead to more valuable insights

### After Completion
- Review all dimension scores to identify patterns
- Read the AI-generated insights carefully - they're tailored to your context
- Share results with stakeholders to align on transformation priorities
- Use recommendations as a starting point for planning initiatives

---

## Frequently Asked Questions

**Q: How long does an assessment take?**
A: Most assessments take 10-20 minutes, depending on the number of questions and model complexity.

**Q: Can I save my progress and return later?**
A: Yes! Your responses are automatically saved. Simply log back in and continue from where you left off.

**Q: Are my results confidential?**
A: Yes. Your individual scores and data are private. Only anonymized, aggregated data contributes to benchmark calculations.

**Q: How often should I retake assessments?**
A: We recommend quarterly or bi-annual assessments to track progress over time.

**Q: Can I download my results?**
A: Yes. Registered users can download PDF reports via email delivery.

**Q: What if I don't see benchmarks for my industry?**
A: Benchmarks require a minimum number of assessments. As more organizations in your industry complete assessments, benchmarks will become available.

**Q: Can I edit my answers after submitting?**
A: No. Once submitted, assessments are final to maintain data integrity. However, you can always take a new assessment to track improvement.

**Q: What AI model powers the insights?**
A: Orion uses Anthropic Claude Sonnet 4.5 for generating personalized recommendations, roadmaps, and dimension interpretations. AI responses are cached for 90 days.

**Q: Can I use Microsoft SSO to sign in?**
A: Yes, if your organization has been configured for Microsoft Entra ID SSO. Click "Sign in with Microsoft" on the login page.

---

## Troubleshooting

### Common Issues

**Can't log in**
1. Verify your email address is correct
2. Use the "Forgot Password" link to reset your password
3. Check that your email has been verified (check your inbox for the verification email)
4. If using SSO, ensure your organization's Azure AD integration is configured

**Assessment not saving**
1. Check your internet connection
2. Refresh the browser page
3. Your responses auto-save - try navigating back and forward to confirm

**PDF report not received**
1. Check your spam/junk folder
2. Verify your email address in your profile
3. Ensure your email is verified
4. Try requesting the report again

**Benchmarks not showing**
- Benchmarks require a minimum number of completed assessments in your segment
- As more data becomes available, benchmarks will appear automatically

### Technical Issues

If you experience technical difficulties:
1. Refresh your browser
2. Clear browser cache and cookies
3. Try a different browser
4. Contact support with details about the issue

---

## Privacy & Data Usage

Your data is used to:
- Generate personalized insights and recommendations
- Calculate industry and segment benchmarks (anonymized)
- Improve the accuracy of AI-generated content

Your data is **never**:
- Shared with third parties without consent
- Used to identify you individually in reports or benchmarks
- Sold or monetized

---

## Getting Help

### Support Resources

- **Website**: Visit [www.synozur.com](https://www.synozur.com) for more information
- **Contact**: Reach out via [www.synozur.com/contact](https://www.synozur.com/contact)
- **Custom Assessments**: Interested in a custom model? Email [ContactUs@synozur.com](mailto:ContactUs@synozur.com)

---

## What's Next?

After completing your assessment:
1. **Review insights carefully** and share with your team
2. **Prioritize recommendations** based on impact and feasibility
3. **Create an action plan** using the transformation roadmap
4. **Track progress** by retaking the assessment in 3-6 months
5. **Explore other models** to evaluate different dimensions of your organization

---

**Ready to begin your transformation journey? Start your first assessment today!**

*Orion by Synozur - Find Your North Star*

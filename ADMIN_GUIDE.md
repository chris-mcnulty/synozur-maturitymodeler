# Orion Admin Guide

## Welcome to Orion Administration

This guide provides comprehensive instructions for administrators managing the Orion platform, including model management, user administration, content review, and system configuration.

---

## Table of Contents

1. [Accessing the Admin Console](#accessing-the-admin-console)
2. [Model Management](#model-management)
3. [Question & Dimension Management](#question--dimension-management)
4. [User Management](#user-management)
5. [Proxy Assessments](#proxy-assessments)
6. [AI Content Review](#ai-content-review)
7. [Knowledge Base Management](#knowledge-base-management)
8. [Benchmark Configuration](#benchmark-configuration)
9. [Data Import](#data-import)
10. [Analytics & Reporting](#analytics--reporting)
11. [System Settings](#system-settings)

---

## Accessing the Admin Console

### Requirements
- Admin or Modeler role
- Valid login credentials

### Navigation
1. Log in with your admin credentials
2. Click "Admin" in the main navigation header
3. Access various management sections via the admin sidebar

**Role Permissions**:
- **Admin**: Full access to all features
- **Modeler**: Access to model management, questions, dimensions, and draft models
- **User**: No admin console access

---

## Model Management

### Viewing Models

Navigate to **Admin Console > Models** to see:
- All published and draft models
- Model metadata (name, slug, description, status)
- Question counts and completion statistics

**Filtering**:
- Published models: Visible to all users
- Draft models: Only visible to admins and modelers

### Creating a New Model

#### Option 1: Manual Creation

1. Click **"Create Model"** button
2. Fill in required fields:
   - **Name**: Display name of the model
   - **Slug**: URL-friendly identifier (auto-generated from name)
   - **Description**: Brief overview of what the model assesses
   - **Status**: Draft (hidden) or Published (visible)
   - **Featured**: Toggle to feature on homepage
   - **Estimated Time**: How long the assessment takes (e.g., "15-20 minutes")
3. Click **"Create"** to save

#### Option 2: CSV Import

1. Click **"Import CSV"** button
2. Select a properly formatted CSV file (see CSV Format section below)
3. Review the import summary
4. Confirm import

**CSV Format Requirements**:
```csv
Question,Dimension,Option 1 Text,Option 1 Points,Option 2 Text,Option 2 Points,...
```

### Editing Models

1. Navigate to the model in the list
2. Click **"Edit"** or the model name
3. Update any fields:
   - Basic information (name, description, status)
   - Featured status
   - Model image URL (for custom hero backgrounds)
4. Click **"Save Changes"**

### Model Images

**Setting a Custom Model Image**:
1. Edit the model
2. Enter the **Image URL** field with a valid image URL
3. Save changes

**Image Usage**:
- **Model Launch Page**: Background image at 20% opacity
- **Results Page**: Background image at 10% opacity
- **Homepage Cards**: Thumbnail for model cards

**Best Practices**:
- Use high-resolution images (1920x1080 or larger)
- Ensure images are relevant to the model theme
- Use images with appropriate licensing

### Deleting Models

1. Navigate to the model
2. Click **"Delete"** button
3. Confirm deletion

**Warning**: Deleting a model removes all associated:
- Questions and dimensions
- Assessment results
- AI-generated content
- This action cannot be undone

### Exporting Models

**Export to CSV**:
1. Navigate to the model detail page
2. Click **"Export CSV"** button
3. Download includes:
   - All questions
   - Dimensions
   - Answer options with point values

**Export Interview Guide**:
1. Navigate to the model detail page
2. Click **"Export Interview Guide"** button
3. Generates a formatted document for conducting in-person assessments

---

## Question & Dimension Management

### Managing Dimensions

**Viewing Dimensions**:
1. Select a model
2. Navigate to **"Dimensions"** tab
3. View all dimensions with labels and weights

**Creating Dimensions**:
1. Click **"Add Dimension"**
2. Enter:
   - **Label**: Dimension name (e.g., "Strategy & Leadership")
   - **Weight**: Relative importance (higher = more impact on total score)
   - **Order**: Display order (1-based)
3. Save

**Editing Dimensions**:
1. Click on a dimension
2. Update label, weight, or order
3. Save changes

**Deleting Dimensions**:
- Click delete icon
- Confirm deletion (removes associated questions)

### Managing Questions

**Viewing Questions**:
1. Select a model
2. Navigate to **"Questions"** tab
3. View all questions with their dimension assignments

**Creating Questions**:
1. Click **"Add Question"**
2. Fill in:
   - **Question Text**: The actual question
   - **Dimension**: Select which dimension this evaluates
   - **Order**: Question sequence (1-based)
3. Add Answer Options:
   - **Option Text**: The answer choice
   - **Points**: Score value (0-100 per option)
4. Save question

**Editing Questions**:
1. Click on a question
2. Update text, dimension, or order
3. Modify answer options (text or points)
4. Save changes

**Reordering Questions**:
- Use the order field to control sequence
- Questions display in ascending order
- Gaps in numbering are acceptable

**Deleting Questions**:
- Click delete icon
- Confirm deletion

### CSV Import/Export for Questions

**Import Format**:
```csv
Question,Dimension,Option 1 Text,Option 1 Points,Option 2 Text,Option 2 Points,...
"How would you describe your AI strategy?","Strategy & Leadership","No formal strategy",0,"Ad-hoc initiatives",25,"Documented strategy",50,"Integrated strategy",100
```

**Best Practices**:
- Use consistent dimension naming
- Ensure point values align across questions
- Validate CSV before import (check for formatting errors)

---

## User Management

Navigate to **Admin Console > Users** to manage all platform users.

### Viewing Users

**User List Shows**:
- Username and email
- Current role (Admin, Modeler, User)
- Email verification status
- Account creation date

**Filtering**:
- Search by username or email
- Filter by role or verification status

### Creating Users

1. Click **"Create User"** button
2. Fill in:
   - Username
   - Email
   - Password
   - Role (User, Modeler, or Admin)
3. Click **"Create"**

**Default Settings**:
- Email verification: Unverified (send verification email)
- Role: User (can be changed immediately)

### Editing Users

**Changing User Information**:
1. Click on a user in the list
2. Available edits:
   - **Username**: Update display name
   - **Role**: Change between User, Modeler, Admin
   - **Email Verification**: Mark as verified/unverified
   - **Password Reset**: Set a new password for the user

**Use Cases**:
- Promote users to Modeler or Admin roles
- Reset forgotten passwords
- Manually verify email addresses
- Update usernames upon request

### Resetting Passwords

1. Navigate to the user
2. Click **"Reset Password"**
3. Enter new password
4. Confirm and save
5. Notify the user of their new password

### Changing Usernames

1. Navigate to the user
2. Click **"Edit"**
3. Update username field
4. Save changes

### Deleting Users

1. Navigate to the user
2. Click **"Delete"** button
3. Confirm deletion

**Warning**: Deleting a user removes:
- User account and profile
- Assessment history
- Does NOT delete assessment results (converted to anonymous)

### Managing Roles

**Role Capabilities**:

**User Role**:
- Take assessments
- View published models
- Access personal results and insights
- Download PDF reports

**Modeler Role**:
- All User capabilities
- Create and edit models (draft and published)
- Manage questions and dimensions
- Import/export CSV data

**Admin Role**:
- All Modeler capabilities
- Manage users and roles
- Create proxy assessments
- Review and approve AI content
- Configure benchmarks
- Access analytics and reporting
- Manage knowledge base
- Import anonymized data

---

## Proxy Assessments

Proxy assessments allow admins and modelers to create assessments on behalf of prospects without requiring them to create accounts.

### Creating a Proxy Assessment

1. Click **"Create Proxy Assessment"** button in the admin header
2. Fill in the proxy form:
   - **Select Model**: Choose which assessment to create
   - **Prospect Name**: Full name of the person you're assessing for
   - **Company Name**: Their organization
   - **Job Title**: Select from dropdown
   - **Industry**: Select from dropdown
   - **Company Size**: Select from dropdown
   - **Country**: Select from dropdown
3. Click **"Create Proxy Assessment"**
4. You'll be redirected to the assessment wizard

### Completing Proxy Assessments

1. Answer questions on behalf of the prospect
2. Progress is saved automatically
3. Submit the assessment when complete
4. View results immediately

### Proxy Assessment Features

**Results Page**:
- Displays prospect profile information prominently
- Shows "Proxy Assessment" badge
- Generates personalized AI insights using proxy profile data
- Allows PDF download

**Admin Results List**:
- Shows "Proxy" badge for easy identification
- Lists prospect name and company
- Tracks completion status

**Benchmarking**:
- Proxy assessments can be included in benchmarks
- Configure via Benchmark Settings
- When included, uses proxy profile data for segment-specific benchmarks

### Use Cases for Proxy Assessments

- **Sales Enablement**: Create assessments during prospect meetings
- **Consulting Engagements**: Assess clients without requiring account creation
- **Demonstrations**: Show potential customers real results
- **Events/Conferences**: Conduct on-the-spot assessments

---

## AI Content Review

AI-generated insights, recommendations, and roadmaps are reviewed before being displayed to users.

### Accessing AI Review Queue

Navigate to **Admin Console > AI Review** to see pending content.

### Reviewing Content

1. **View Pending Items**: List shows all unreviewed AI-generated content
2. **Review Details**:
   - Assessment information
   - User context (role, industry, company size)
   - Generated content (summary, recommendations, roadmap)
3. **Actions**:
   - **Approve**: Makes content visible to user
   - **Reject**: Hides content and flags for regeneration
   - **Edit**: Modify content before approval (if needed)

### Approval Workflow

1. Review content for:
   - Accuracy and relevance
   - Appropriate personalization
   - No GTM/technical jargon in non-GTM models
   - Professional tone
2. Click **"Approve"** if satisfactory
3. Content becomes visible to the user

### Rejection Workflow

1. Click **"Reject"** if content is:
   - Inaccurate or irrelevant
   - Contains inappropriate terminology
   - Not properly personalized
2. Add rejection reason (optional but recommended)
3. Content is hidden from user
4. Flag for manual review or regeneration

---

## Knowledge Base Management

The knowledge base provides grounding documents for AI-generated content.

### Accessing Knowledge Base

Navigate to **Admin Console > Knowledge Base**

### Uploading Documents

1. Click **"Upload Document"** button
2. Fill in:
   - **Document Name**: Descriptive name
   - **Scope**: 
     - **Company-wide**: Available to all models
     - **Model-specific**: Select which model(s)
   - **File**: Upload PDF, DOCX, DOC, TXT, or MD file
3. Click **"Upload"**

**File Processing**:
- Documents are uploaded to object storage
- Metadata is stored in the database
- Content is extracted for AI grounding

### Managing Documents

**Viewing Documents**:
- List shows all uploaded documents
- Displays name, scope, file type, and upload date

**Editing Documents**:
1. Click on a document
2. Update name or scope
3. Save changes

**Deleting Documents**:
1. Click delete icon
2. Confirm deletion
3. File is removed from storage and database

### Knowledge Base Best Practices

**Dos**:
- Use model-specific documents for technical content
- Keep company-wide documents high-level and strategic
- Update documents regularly to maintain relevance
- Use clear, professional language

**Don'ts**:
- Don't upload confidential client data
- Avoid overly technical content in company-wide documents
- Don't duplicate content across multiple documents

### How Knowledge Base Affects AI

- AI uses documents to ground recommendations and insights
- Company-wide documents influence all model outputs
- Model-specific documents only affect their designated models
- Content is filtered based on user context and model type

---

## Benchmark Configuration

Configure how benchmarks are calculated and displayed.

### Accessing Benchmark Settings

Navigate to **Admin Console > Settings > Benchmarks**

### Configuration Options

**Include Anonymous/Imported Assessments**:
- **Enabled**: Anonymous and imported assessments contribute to benchmarks
- **Disabled**: Only authenticated user assessments count
- **Default**: Disabled (for data quality)

**Include Proxy Assessments**:
- **Enabled**: Proxy assessments contribute to benchmarks using proxy profile data
- **Disabled**: Proxy assessments excluded from benchmarks
- **Default**: Based on anonymous setting

**Minimum Sample Sizes**:
- **Overall Benchmark**: Minimum assessments for overall average (default: 5)
- **Industry Benchmark**: Minimum for industry-specific (default: 3)
- **Company Size Benchmark**: Minimum for size-specific (default: 3)
- **Country Benchmark**: Minimum for country-specific (default: 3)
- **Combined Segment**: Minimum for multi-factor segments (default: 2)

### How Benchmarks Work

**Calculation**:
1. Assessments are grouped by segment (industry, size, country)
2. Average scores calculated per dimension and overall
3. Only segments meeting minimum thresholds are displayed

**Segment Types**:
- Overall: All assessments
- Industry: Filtered by industry
- Company Size: Filtered by size category
- Country: Filtered by country
- Combined: Multiple filters (e.g., Healthcare + Midmarket)

**Anonymous Data Handling**:
- When anonymous inclusion is enabled:
  - Regular assessments use user profile data
  - Proxy assessments use proxy profile fields
  - Only assessments with complete profile data contribute to segments

---

## Data Import

Import anonymized assessment data to enrich benchmarks.

### Accessing Data Import

Navigate to **Admin Console > Import Data**

### Preparing Import Files

**CSV Format**:
```csv
Model Slug,Question,Answer,User Industry,User Company Size,User Country,User Job Title
ai-maturity,"How mature is your AI strategy?","We have a documented strategy",Healthcare,Midmarket,United States,CIO
```

**Required Columns**:
- Model Slug: Must match existing model
- Question: Full question text
- Answer: Selected answer text
- User profile fields (optional but recommended for benchmarking)

### Import Process

1. Click **"Import Data"** button
2. Select CSV file
3. System validates:
   - Model exists
   - Questions match (fuzzy matching for minor variations)
   - Answer options match
4. Review validation report
5. Confirm import

**Validation**:
- **Exact Match**: Question and answer text match exactly
- **Fuzzy Match**: Close enough match (configurable threshold)
- **No Match**: Question or answer not found (skipped)

### Batch Tracking

- Each import creates a batch record
- Track import date, user, and record count
- Review imported data by batch
- Audit trail for data provenance

### Best Practices

**Dos**:
- Anonymize all personally identifiable information
- Include complete profile data for better benchmarking
- Validate CSV format before import
- Test with small batch first

**Don'ts**:
- Don't import real user data without consent
- Avoid importing duplicate assessments
- Don't skip profile fields if available

---

## Analytics & Reporting

Access comprehensive platform analytics and export data.

### Accessing Analytics

Navigate to **Admin Console > Analytics**

### Dashboard Metrics

**Overview Statistics**:
- Total users (registered accounts)
- Total assessments completed
- Models published vs. draft
- Average completion time

**User Breakdown**:
- Users by role (Admin, Modeler, User)
- Email verification rate
- Active vs. inactive users

**Assessment Breakdown**:
- Assessments per model
- Completion rate
- Average scores by model and dimension

**Recent Activity**:
- Latest assessments
- Recent user registrations
- New model publications

### Exporting Data

**Assessment Results Export**:
1. Navigate to **Analytics > Export**
2. Select **"Assessment Results"**
3. Choose filters:
   - Date range
   - Specific model(s)
   - Include/exclude anonymous
4. Click **"Export CSV"**

**CSV Includes**:
- Assessment ID and date
- User name and company (or "Anonymous")
- Model name
- Overall score
- Individual dimension scores

**User Export**:
1. Navigate to **Analytics > Export**
2. Select **"User Accounts"**
3. Click **"Export CSV"**

**CSV Includes**:
- Username and email
- Role and verification status
- Registration date
- Number of assessments completed

### Viewing Individual Results

Navigate to **Admin Console > Results** to see all assessment results:
- Filter by model, date, or user
- View individual assessment details
- See proxy assessment badges
- Access AI-generated content for each result

---

## System Settings

### Hero Model Selection

Choose which model appears in the homepage hero section:

1. Navigate to **Admin Console > Settings**
2. Select **"Hero Model"**
3. Choose from published models
4. Save changes

**Default Behavior**: If no hero model is set, the system uses the first featured model or AI-related model.

### Email Configuration

Email settings are managed via environment variables:
- **SENDGRID_API_KEY**: API key for SendGrid email delivery
- Emails sent for:
  - Email verification
  - Password resets
  - PDF report delivery

### Session Management

- User sessions persist across browser sessions
- Session timeout: Configurable (default: 7 days)
- Admins can force logout by clearing session storage

---

## Best Practices for Admins

### Model Management
- Keep draft status for models in development
- Test thoroughly before publishing
- Use descriptive names and slugs
- Feature only your best/most relevant model

### Content Quality
- Review AI-generated content regularly
- Update knowledge base documents quarterly
- Monitor for inappropriate GTM/technical language
- Ensure personalization is accurate

### User Support
- Respond to user issues promptly
- Manually verify emails if verification emails fail
- Reset passwords proactively for locked-out users
- Monitor user feedback for platform improvements

### Data Integrity
- Regularly review benchmark calculations
- Audit imported data for accuracy
- Clean up test/demo assessments periodically
- Backup data before major imports or deletions

### Security
- Limit admin role assignments
- Review user roles quarterly
- Monitor for suspicious activity
- Keep software dependencies updated

---

## Troubleshooting

### Common Issues

**AI Content Not Generating**:
- Check OPENAI_API_KEY environment variable
- Review AI service logs
- Clear model-specific cache if content is stale
- Verify knowledge base documents are accessible

**Benchmarks Not Appearing**:
- Check minimum sample size thresholds
- Verify assessments have complete profile data
- Confirm benchmark settings (anonymous inclusion)
- Review segment-specific data availability

**CSV Import Failures**:
- Validate CSV format (check for encoding issues)
- Ensure model slugs match exactly
- Review fuzzy matching threshold
- Check for special characters in questions/answers

**Email Delivery Issues**:
- Verify SENDGRID_API_KEY is set
- Check SendGrid account status
- Review email logs in workflow output
- Confirm recipient email addresses are valid

### Getting Help

- **Technical Support**: Contact Replit support for platform issues
- **Feature Requests**: Submit via Synozur contact page
- **Bug Reports**: Document steps to reproduce and notify support
- **Custom Development**: Reach out to Synozur for custom model development

---

## Advanced Features

### Model-Specific AI Cache Management

Clear cached AI content for a specific model:

1. Navigate to admin console
2. Access developer tools or API endpoint
3. DELETE `/api/ai-cache/:modelId` to clear model-specific cache
4. Forces regeneration of all AI content for that model

**Use Cases**:
- After updating knowledge base documents
- When changing model structure significantly
- To refresh recommendations with latest data

### Interview Guide Export

Export a formatted interview guide for conducting assessments in person:

1. Navigate to model detail page
2. Click **"Export Interview Guide"**
3. Downloads formatted document with:
   - All questions
   - Answer options
   - Scoring guide
   - Recording template

---

## Keyboard Shortcuts

- **Admin Console**: `Alt + A`
- **Create Model**: `Alt + M` (when in admin console)
- **Create User**: `Alt + U` (when in user management)
- **View Analytics**: `Alt + D` (dashboard)

---

## Conclusion

The Orion platform provides comprehensive tools for creating, managing, and analyzing maturity assessments. As an admin, you have the power to:
- Shape the assessment experience
- Ensure data quality and integrity
- Support users effectively
- Drive continuous improvement

For additional support or custom development needs, contact Synozur at www.synozur.com/contact.

---

*Orion by Synozur - Empowering Transformation Through Insight*

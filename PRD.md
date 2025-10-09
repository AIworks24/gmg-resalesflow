# GMG Resale Flow App - Product Requirements Document (PRD)

## Overview
This document outlines the updates and enhancements for the GMG Resale Flow Application scheduled for August 2025. It includes both completed and pending features to provide a comprehensive view of the project status.

## Status Key
- ✅ **Completed** - Feature has been implemented and is functional
- 🔄 **In Progress** - Feature is currently being developed
- ⏳ **Pending** - Feature has not been started yet
- ❓ **Needs Clarification** - Feature requires additional information before implementation

---

## 1. User/Requestor - Application Submission Updates

### 1.1 Seller Information - Optional Fields
**Status:** ⏳ **Pending**  
**Description:** Update seller information fields to be optional instead of required. Buyer information should remain required.
**Technical Requirements:**
- Remove validation requirements for seller fields (name, email, phone)
- Keep buyer fields as mandatory
- Update form validation logic

### 1.2 GMG Logo Integration
**Status:** ✅ **Completed**  
**Description:** Add GMG Logo on the main page
**Implementation:** Logo has been integrated at multiple locations using the company_logo.png asset

### 1.3 Settlement Agent / Closing Attorney Option
**Status:** ✅ **Completed**  
**Description:** Add new selection for "Settlement Agent / Closing Attorney" submitter type with location-based pricing
**Requirements:**
- **Virginia Properties:** FREE (by law) - Only rush fee $70.66 if sooner than 3 business days
- **North Carolina Properties:** $450 standard, $550 rush (includes settlement form + all other forms)
- Form flow adjusted to skip Transaction Details step
**Implementation Completed:**
- ✅ Data-driven application types system with database-driven pricing
- ✅ Location-based pricing logic (VA vs NC) using property state detection
- ✅ Automatic application type detection based on submitter type and property location
- ✅ Payment bypass for $0 transactions (Virginia standard processing)
- ✅ Dynamic form creation - settlement forms route to Accounting role
- ✅ Simplified form flow for settlement agents (skips unnecessary fields)
- ✅ Admin dashboard shows application type with color-coded badges
- ✅ Application type filtering in admin dashboard
- ✅ Created 3 application types: standard, settlement_agent_va, settlement_agent_nc
**Database Changes:**
- ✅ Added `application_types` table with pricing and form configuration
- ✅ Added `property_owner_forms_list` table for form management
- ✅ Added `application_type` column to applications table

### 1.4 Public Offering Statement Option (Builder/Developer)
**Status:** ⏳ **Pending**  
**Description:** Add option under Builder/Developer for "Public Offering Statement" - document delivery only
**Requirements:**
- Add checkbox/option under Builder/Developer submitter type
- **Price: $200** (fixed fee - needs new Stripe SKU)
- **NO FORM BUILDOUT** - document delivery only
- When selected, skip directly to payment ($200)
- After payment, staff retrieves pre-uploaded document from property's document section
- Document sent directly to requestor from existing property documents
**Workflow:**
1. User selects Builder/Developer
2. Sees option for "Public Offering Statement"
3. If selected, goes directly to payment ($200)
4. Staff receives notification
5. Staff locates the Public Offering Statement in property documents
6. Staff sends the existing document to requestor
**Note:** Public Offering Statement documents must be pre-uploaded to properties through the Property file management system

### 1.5 Promo Code Support
**Status:** ✅ **Completed**  
**Description:** Add promo code functionality for payments
**Implementation:**
- ✅ Added `allow_promotion_codes: true` to Stripe checkout session
- ✅ Stripe automatically displays promo code input field on checkout page
- ✅ All validation, application, and tracking handled by Stripe
**Next Steps:**
- Create "Ryan200" coupon in Stripe Dashboard ($117.95 off)
- Configure usage limits and expiration as needed
**Benefits:**
- Zero maintenance - Stripe handles everything
- Professional UI integrated into checkout flow
- Automatic usage tracking and validation

### 1.6 Forgot Password Feature
**Status:** ✅ **Completed**  
**Description:** Ability for users to click "forgot password" on login screen
**Implementation:** Password reset functionality has been implemented with email verification

### 1.7 Recent Applications Visibility
**Status:** ✅ **Completed**  
**Description:** Move current application pending status for better visibility
**Implementation:** "Your Recent Applications" section now appears prominently near the Start Application button

---

## 2. Admin/Dashboard Updates

### 2.1 Accounting Role
**Status:** ⏳ **Pending**  
**Description:** Add new "Accounting" role for admin dashboard
**Requirements:**
- Create new user role type
- Assign specific permissions
- Handle Settlement Agent/Closing Attorney requests
- Form completion workflow similar to Inspection Form

### 2.2 Property Menu Updates - File Management
**Status:** 🧪 **Ready for Testing**  
**Description:** Update property file upload system with specific file names
**Implementation:** 
- ✅ Created PropertyFileManagement component with 18 predefined document types
- ✅ Structured file storage: `property_files/{property_id}/{document_key}.extension`
- ✅ Database metadata table (`property_documents`) for tracking
- ✅ N/A checkbox for non-applicable documents
- ✅ Expiration date tracking per document
- ✅ New admin page `/admin/property-files/[id]` for document management
- ✅ Updated properties list with "Manage Documents" button
**Features Implemented:**
- Upload/download/delete files per document section
- Visual expiration warnings (30-day alerts)
- Automated email alerts for expiring documents
- Consistent document structure across all properties
**Testing Notes:**
- Database migration needs to be run: `property_documents.sql`
- Test file upload/download functionality
- Verify expiration email alerts work
- Check N/A checkbox functionality

### 2.3 Document Expiration Alerts
**Status:** 🧪 **Ready for Testing** (Integrated with File Management)  
**Description:** Add expiration date tracking for documents
**Implementation:**
- ✅ Expiration date field per document in database
- ✅ Visual indicators for documents expiring within 30 days
- ✅ Automated daily email alerts to property managers
- ✅ Professional email template with document lists
- ✅ Vercel cron job configured (daily at 9 AM)
- ✅ API endpoint: `/api/check-expiring-documents`
**Testing Notes:**
- Test manual API call to verify email functionality
- Verify cron job runs correctly in production
- Check email delivery to property managers

---

## 3. Bug Fixes & Performance Issues

### 3.1 Menu Navigation Glitches
**Status:** ⏳ **Pending**  
**Description:** Page loading issues when navigating between menu items
**Symptoms:**
- Page sits in loading state when clicking menu items
- Requires browser refresh to load correctly
- Page locks with no clickable actions

### 3.2 Dashboard Filter Issues
**Status:** ⏳ **Pending**  
**Description:** Dashboard status filters not working correctly
**Issue:** Clicking "pending" or "completed" shows all applications without filtering

---

## 4. New Features/Requests

### 4.1 Stripe Revenue Split
**Status:** ⏳ **Pending** (Requires Stripe Connect setup)  
**Description:** Split revenue on each transaction
**Requirements:**
- $21 per transaction to business partner
- Bi-weekly transfers instead of daily
- Implement using Stripe Connect
**Reference:** https://docs.stripe.com/connect/separate-charges-and-transfers

### 4.2 Multiple Package Associations
**Status:** ⏳ **Pending**  
**Description:** Support for properties with multiple associations
**Requirements:**
- Group payments (e.g., 3 × $317.95 = $953.85)
- Multiple document packages per submission
- User notification about higher fees
- Property mapping for associations
**Example:** Greenwich Walk Condos → Greenwich Walk HOA → Foxcreek

### 4.3 Email Notifications to Property Managers
**Status:** ❓ **Needs Clarification**  
**Description:** Confirm email notifications are sent to property managers
**Requirements:**
- Different templates for Rush vs Standard orders
- Use no-reply@gmgva.com for internal alerts
**Questions:**
- Frequency of reminder emails?
- What triggers email notifications?

### 4.4 Custom Domain Setup
**Status:** ⏳ **Pending**  
**Description:** Setup subdomain resales.gmgva.com for Vercel deployment

---

## 5. Email Configuration

### 5.1 Microsoft Email Setup
**Status:** ✅ **Completed**  
**Details:**
- Email: resales@gmgva.com
- App Password: [Configured in environment]

---

## Priority Matrix

### High Priority (P0)
1. Menu navigation glitches
2. Dashboard filter issues
3. Seller information optional fields

### Medium Priority (P1)
1. Public Offering Statement option ($200 for Builder/Developer)
2. Accounting role implementation
3. 🧪 **Testing property file management system** (implementation complete)
4. Multiple package associations

### Low Priority (P2)
1. 🧪 **Testing document expiration alerts** (implementation complete)
2. Stripe revenue split
3. Custom domain setup

### Needs Clarification
1. Public Offering Statement workflow
2. Email notification requirements
3. Management Information fields purpose

---

## Next Steps

1. **Immediate Actions:**
   - Fix critical bugs (menu navigation, dashboard filters)
   - Make seller information fields optional
   - Clarify Public Offering Statement requirements

2. **Phase 2:**
   - Implement Accounting role and dashboard
   - Build property file management system
   - Add promo code support

3. **Phase 3:**
   - Configure Stripe revenue splitting
   - Implement multiple package associations
   - Add document expiration tracking

---

## Technical Debt & Considerations

1. **Email Delivery:** Consider implementing email queuing system for large document packages
2. **File Storage:** Evaluate cloud storage solutions for document management
3. **Performance:** Address page loading and navigation issues
4. **Testing:** Comprehensive testing needed before production deployment

---

## Success Metrics

- Reduced support tickets for navigation issues
- Increased conversion rate with simplified forms
- Faster document processing with new file management system
- Improved user satisfaction with password reset capability

---

## Document History

- **Created:** January 20, 2025
- **Last Updated:** January 24, 2025 - Settlement Agent Implementation Complete
- **Version:** 1.1

---

## Recent Major Completion (January 24, 2025)

### Settlement Agent/Closing Attorney Implementation ✅
**FULLY IMPLEMENTED** - The complete settlement agent system with location-based pricing:

**Virginia Properties:**
- ✅ Standard Processing: **FREE** (by Virginia law)
- ✅ Rush Processing: **$70.66** only
- ✅ Automatic payment bypass for $0 transactions

**North Carolina Properties:**
- ✅ Standard Processing: **$450.00**
- ✅ Rush Processing: **$550.00**
- ✅ Full Stripe checkout integration

**Technical Implementation:**
- ✅ **Data-driven architecture** - All pricing stored in database
- ✅ **Automatic application type detection** based on submitter type + property state
- ✅ **Dynamic form flows** - Settlement agents skip unnecessary fields
- ✅ **Smart form routing** - Settlement forms go to Accounting role
- ✅ **Admin dashboard enhancements** - Application type column with filtering
- ✅ **Payment processing** - Bypasses Stripe for $0, processes normally for paid

**Database Structure:**
- New `application_types` table with pricing and workflow configuration
- New `property_owner_forms_list` table for form management
- Added `application_type` column to applications

**Client Requirements Met:**
- ✅ Virginia FREE standard processing (by law)
- ✅ Virginia $70.66 rush fee option
- ✅ North Carolina $450/$550 pricing
- ✅ Simplified workflow for settlement agents
- ✅ Forms route to accounting for review

---

## Appendix

### Completed Features Summary
- ✅ GMG Logo integration
- ✅ Settlement Agent/Closing Attorney option (FULLY COMPLETED - location-based pricing, form submission, admin dashboard)
- ✅ Forgot password functionality
- ✅ Recent applications visibility improvement
- ✅ Email configuration
- ✅ Promo code support (Stripe native implementation)

### Pending Features Summary
- ⏳ Public Offering Statement option for Builder/Developer ($200 - document delivery only)
- ⏳ Seller information optional fields
- ⏳ Accounting role (user role creation - settlement forms already route to accounting)
- 🧪 Property file management (Ready for Testing)
- 🧪 Document expiration alerts (Ready for Testing)
- ⏳ Menu navigation fixes
- ⏳ Dashboard filter fixes
- ⏳ Stripe revenue split
- ⏳ Multiple package associations
- ⏳ Custom domain setup

### Features Needing Clarification
- ❓ Email notification triggers and frequency
- ❓ Management Information fields purpose
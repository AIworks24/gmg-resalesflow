# Property-Based Application Types Refactoring

## Overview

This document outlines the refactoring from submitter-based application types to property-based application types, making the system more intuitive and aligned with the actual business logic.

## 🔄 **Application Type Changes**

### **Before (Submitter-Based):**
- `standard` - Standard Resale Certificate
- `settlement_agent_va` - Settlement Agent - Virginia (FREE)
- `settlement_agent_nc` - Settlement Agent - North Carolina ($450/$550)
- `public_offering_statement` - Public Offering Statement ($200)

### **After (Property-Based):**
- `single_property` - Regular HOA property
- `multi_community` - Master Association with linked/secondary properties
- `settlement_va` - Settlement agent for Virginia properties
- `settlement_nc` - Settlement agent for North Carolina properties
- `public_offering` - Public offering statement

## 📁 **Files Modified**

### **Core Application Logic:**
1. **`lib/applicationTypes.js`** ✅
   - Updated `determineApplicationType()` to accept `publicOffering` parameter
   - Added new application type handling logic
   - Updated pricing, form steps, field requirements, and messaging
   - Added helper functions: `getRequiredForms()`, `getAllowedRoles()`, `requiresPropertyFiles()`

2. **`pages/index.js`** ✅
   - Updated application type determination logic
   - Changed default fallback from `'standard'` to `'single_property'`
   - Updated public offering detection logic

3. **`pages/api/create-checkout-session.js`** ✅
   - Updated application type determination
   - Changed fallback to `'single_property'`
   - Updated public offering metadata

4. **`pages/api/webhooks/stripe.js`** ✅
   - Updated settlement agent detection logic
   - Changed from `settlement_agent` to `settlement` prefix

5. **`components/admin/AdminApplications.js`** ✅
   - Updated application type display logic
   - Added new application type badges and colors
   - Updated fallback to `'single_property'`

### **Database & Migration:**
6. **`database/property_based_application_types_migration.sql`** ✅
   - Complete migration script to update application types
   - Maps old types to new types
   - Updates existing applications

7. **`pages/api/admin/run-property-based-migration.js`** ✅
   - API endpoint to run the migration
   - Includes verification and error handling

## 🎯 **Application Type Logic**

### **Determination Logic:**
```javascript
export function determineApplicationType(submitterType, hoaProperty, publicOffering = false) {
  // Public Offering Statement (special case for builders)
  if (publicOffering) {
    return 'public_offering';
  }
  
  // Settlement agents get special treatment based on property state
  if (submitterType === 'settlement' && hoaProperty) {
    const propertyState = getPropertyState(hoaProperty.location);
    if (propertyState === 'VA') return 'settlement_va';
    if (propertyState === 'NC') return 'settlement_nc';
  }
  
  // Multi-community properties
  if (hoaProperty && hoaProperty.is_multi_community) {
    return 'multi_community';
  }
  
  // Default to single property
  return 'single_property';
}
```

### **Pricing Structure:**
| Application Type | Standard | Rush | Credit Card Fee |
|------------------|----------|------|-----------------|
| `single_property` | $317.95 | $388.61 | +$9.95 |
| `multi_community` | $317.95/property | $388.61/property | +$9.95 |
| `settlement_va` | **FREE** | $70.66 | +$9.95 |
| `settlement_nc` | $450.00 | $550.00 | +$9.95 |
| `public_offering` | $200.00 | $270.66 | +$9.95 |

### **Form Requirements:**
| Application Type | Required Forms | Staff Role | Property Files |
|------------------|----------------|------------|----------------|
| `single_property` | resale_certificate, inspection_form | staff | Required |
| `multi_community` | resale_certificate, inspection_form | staff | Required |
| `settlement_va` | settlement_form | accounting | Not Required |
| `settlement_nc` | settlement_form | accounting | Not Required |
| `public_offering` | None | staff | Not Required |

## 🔧 **Migration Process**

### **Step 1: Run Migration**
```bash
POST /api/admin/run-property-based-migration
```

### **Step 2: Verify Results**
The migration will:
1. Clear existing application types
2. Insert new property-based types
3. Update existing applications to use new types
4. Verify the migration was successful

### **Step 3: Test Application Flow**
1. Test single property applications
2. Test multi-community applications
3. Test settlement agent applications (VA/NC)
4. Test public offering applications

## 🎨 **UI Updates**

### **Admin Interface:**
- **Single Property**: Gray badge
- **Multi-Community**: Orange badge
- **Settlement VA**: Green badge with "FREE" indicator
- **Settlement NC**: Blue badge
- **Public Offering**: Purple badge

### **Application Flow:**
- Multi-community detection remains the same
- Settlement agent detection based on property location
- Public offering detection via builder + publicOffering flag

## ⚠️ **Breaking Changes**

### **Database:**
- Application type values changed
- Existing applications will be migrated automatically

### **API:**
- Application type strings changed
- Some API responses may return different application type values

### **Frontend:**
- Application type checks need to be updated
- Default fallback changed from `'standard'` to `'single_property'`

## 🧪 **Testing Checklist**

### **Application Types:**
- [ ] Single property application flow
- [ ] Multi-community application flow
- [ ] Settlement VA application flow (FREE)
- [ ] Settlement NC application flow
- [ ] Public offering application flow

### **Pricing:**
- [ ] Single property pricing
- [ ] Multi-community pricing (per property)
- [ ] Settlement VA pricing (FREE standard)
- [ ] Settlement NC pricing
- [ ] Public offering pricing

### **Forms:**
- [ ] Single property forms (resale + inspection)
- [ ] Multi-community forms (per property)
- [ ] Settlement forms (settlement only)
- [ ] Public offering (no forms)

### **Admin Interface:**
- [ ] Application type badges display correctly
- [ ] Filtering by application type works
- [ ] Multi-community applications show property groups
- [ ] Settlement applications route to accounting

## 🚀 **Deployment Steps**

1. **Deploy Code Changes**
   - Deploy updated application logic
   - Deploy new migration endpoint

2. **Run Migration**
   - Call `/api/admin/run-property-based-migration`
   - Verify migration success

3. **Test Application Flow**
   - Test each application type
   - Verify pricing and forms

4. **Monitor**
   - Check for any errors in application processing
   - Verify admin interface displays correctly

## 📊 **Benefits of Property-Based Types**

1. **Intuitive**: Application types now reflect the actual property situation
2. **Scalable**: Easy to add new property-based types
3. **Consistent**: Multi-community is now a first-class application type
4. **Clear**: Settlement types are clearly separated by state
5. **Maintainable**: Logic is more straightforward and easier to understand

## 🔍 **Future Enhancements**

1. **Property Type Detection**: Automatically detect property types
2. **Dynamic Pricing**: More sophisticated pricing based on property characteristics
3. **Form Customization**: Dynamic forms based on property type
4. **Workflow Automation**: Automated routing based on property type
5. **Analytics**: Better reporting based on property types
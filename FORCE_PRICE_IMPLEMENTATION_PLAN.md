# Force Price Feature - Implementation Plan

## Current Architecture Analysis

### Pricing System
- **Environment Variable Based**: All pricing comes from `lib/pricingConfig.js` which reads from env vars
- **Single Property**: Uses `getApplicationTypePricing()` → `pricingConfig.js` → env vars
- **Multi-Community**: Uses `calculateMultiCommunityPricing()` in `lib/multiCommunityUtils.js` which calculates per-property pricing
- **Checkout**: `pages/api/create-checkout-session.js` uses the pricing functions to calculate totals

### Property Management
- **Database**: `hoa_properties` table stores property data
- **UI**: `components/admin/AdminPropertiesManagement.js` handles property CRUD
- **Access Control**: Role-based via `stores/adminAuthStore.js` (roles: 'admin', 'staff', 'accounting')

### Key Pricing Functions
1. `getApplicationTypePricing()` - Single property base price
2. `calculateMultiCommunityPricing()` - Multi-community per-property pricing
3. `calculateTotalAmount()` - Adds fees to base price
4. `create-checkout-session.js` - Uses above functions for Stripe checkout

---

## Implementation Plan

### Phase 1: Database Schema
**File**: `database/add_force_price_migration.sql`

Add two columns to `hoa_properties` table:
- `force_price_enabled` (BOOLEAN, DEFAULT FALSE)
- `force_price_value` (DECIMAL(10,2), DEFAULT NULL)

**Rationale**: 
- Separate toggle and value for clarity
- NULL for force_price_value when disabled (clean state)
- Decimal for precise price storage

---

### Phase 2: Property Management UI
**File**: `components/admin/AdminPropertiesManagement.js`

**Changes**:
1. Add Force Price section in edit modal (after Public Offering Statement section)
2. Add toggle: "Force Property Price" (checkbox)
3. Add price input field (text input, numeric, 2 decimals)
   - Visible/Enabled only when toggle is ON
   - Default value: $200.00
   - Placeholder: "Enter forced price"
4. **Access Control**: 
   - Only show this section if `userRole === 'admin' || userRole === 'accounting'`
   - Hide completely for other roles
5. Update formData state to include `force_price_enabled` and `force_price_value`
6. Save to database on submit

**UI Location**: After line 955 (after Public Offering Statement section)

---

### Phase 3: Pricing Logic Updates

#### 3.1 Single Property Pricing
**File**: `lib/applicationTypes.js`

**Function**: `getApplicationTypePricing(applicationTypeName, packageType)`

**Changes**:
- Add optional `propertyId` parameter
- Check if property has `force_price_enabled = true`
- If enabled, return `force_price_value` (ignoring rush fees for forced price)
- If disabled, use existing logic

**Note**: Rush fees should NOT apply to forced prices (forced price is the final override)

#### 3.2 Multi-Community Pricing
**File**: `lib/multiCommunityUtils.js`

**Function**: `calculateMultiCommunityPricing(primaryPropertyId, packageType, applicationType, supabaseClient)`

**Changes**:
- For each property in the transaction:
  - Check if property has `force_price_enabled = true`
  - If enabled, use `force_price_value` as `basePrice` (skip rush fee calculation)
  - If disabled, use existing logic
- Update the `associations` array to reflect forced prices

**Key**: Each property in multi-community can have its own forced price independently

#### 3.3 Checkout Session
**File**: `pages/api/create-checkout-session.js`

**Changes**:
- Ensure `getApplicationTypePricing()` receives `propertyId` when called
- Ensure `calculateMultiCommunityPricing()` receives property data (already does)
- No other changes needed - existing flow will use updated pricing functions

---

### Phase 4: Helper Functions

#### 4.1 Get Property Force Price
**New File**: `lib/propertyPricingUtils.js` (or add to existing utils)

**Function**: `getPropertyForcePrice(propertyId, supabaseClient)`
- Returns: `{ enabled: boolean, value: number | null }`
- Queries `hoa_properties` table
- Returns forced price if enabled, null otherwise

**Function**: `hasForcedPrice(propertyId, supabaseClient)`
- Returns: boolean
- Quick check if property has forced price enabled

---

### Phase 5: Access Control

**Already Handled**: 
- UI level: Check `userRole` in `AdminPropertiesManagement.js`
- API level: Existing admin auth checks in API routes should be sufficient

**Additional Check** (Optional):
- Add server-side validation in property update API to ensure only admin/accounting can set forced prices

---

## Implementation Details

### Database Migration
```sql
-- Add force_price_enabled and force_price_value columns
ALTER TABLE hoa_properties 
ADD COLUMN IF NOT EXISTS force_price_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS force_price_value DECIMAL(10,2) DEFAULT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_hoa_properties_force_price 
ON hoa_properties(force_price_enabled) 
WHERE force_price_enabled = TRUE;

-- Add check constraint to ensure value exists when enabled
ALTER TABLE hoa_properties
ADD CONSTRAINT force_price_value_when_enabled 
CHECK (
  (force_price_enabled = FALSE) OR 
  (force_price_enabled = TRUE AND force_price_value IS NOT NULL AND force_price_value > 0)
);
```

### UI Component Structure
```jsx
{/* Force Price Settings - Only for Admin/Accounting */}
{(userRole === 'admin' || userRole === 'accounting') && (
  <div className="border-t pt-4">
    <h3 className="text-md font-medium text-gray-900 mb-3">Force Price Settings</h3>
    <div className="flex items-center gap-3 mb-3">
      <input
        type="checkbox"
        id="force_price_enabled"
        checked={formData.force_price_enabled || false}
        onChange={(e) => {
          setFormData({
            ...formData, 
            force_price_enabled: e.target.checked,
            force_price_value: e.target.checked ? (formData.force_price_value || 200.00) : null
          });
        }}
        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
      />
      <label htmlFor="force_price_enabled" className="text-sm font-medium text-gray-700">
        Force Property Price
      </label>
    </div>
    {formData.force_price_enabled && (
      <div className="ml-7">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Forced Price Value ($)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={formData.force_price_value || 200.00}
          onChange={(e) => {
            const value = parseFloat(e.target.value) || 0;
            setFormData({...formData, force_price_value: value});
          }}
          placeholder="Enter forced price"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">
          This price will override the standard property price during checkout
        </p>
      </div>
    )}
  </div>
)}
```

### Pricing Logic Flow

**Single Property**:
1. User selects property → Check `force_price_enabled`
2. If enabled → Use `force_price_value` (skip rush fee)
3. If disabled → Use standard pricing from `pricingConfig.js`

**Multi-Community**:
1. Get all properties for transaction
2. For each property:
   - Check `force_price_enabled`
   - If enabled → Use `force_price_value` for that property
   - If disabled → Use standard pricing for that property
3. Sum all property prices (forced + standard mixed)
4. Add convenience fees per property

---

## Testing Scenarios

### Scenario 1: Single Property with Force Price
- Property: Greenwich Walk Condos
- Force Price: ON, Value: $200.00
- Expected: Checkout shows $200.00 (no rush fee applied)

### Scenario 2: Multi-Community Mixed
- Property 1: Force Price ON, $200.00
- Property 2: Force Price OFF (standard $317.95)
- Property 3: Force Price OFF (standard $317.95)
- Expected: Total = $200.00 + $317.95 + $317.95 = $835.90 (+ convenience fees)

### Scenario 3: Access Control
- Admin/Accounting: Can see and edit Force Price toggle
- Staff/Other: Cannot see Force Price section at all

---

## Files to Modify

1. **Database**:
   - `database/add_force_price_migration.sql` (NEW)

2. **UI Components**:
   - `components/admin/AdminPropertiesManagement.js` (MODIFY)

3. **Pricing Logic**:
   - `lib/applicationTypes.js` (MODIFY - getApplicationTypePricing)
   - `lib/multiCommunityUtils.js` (MODIFY - calculateMultiCommunityPricing)

4. **Utilities** (Optional):
   - `lib/propertyPricingUtils.js` (NEW - helper functions)

5. **API Routes** (if needed):
   - `pages/api/admin/hoa-properties.js` (may need validation)

---

## Order of Implementation

1. ✅ Database migration (Phase 1)
2. ✅ Property Management UI (Phase 2)
3. ✅ Helper functions (Phase 4 - makes Phase 3 easier)
4. ✅ Single property pricing logic (Phase 3.1)
5. ✅ Multi-community pricing logic (Phase 3.2)
6. ✅ Testing & validation (Phase 5)

---

## Edge Cases to Handle

1. **Force price with rush**: Rush fees should NOT apply when force price is enabled
2. **Force price with multi-community**: Each property can independently have forced price
3. **Force price = 0**: Should be allowed (free property)
4. **Force price > standard**: Should be allowed (premium property)
5. **Database constraint**: Ensure value exists when enabled (via CHECK constraint)
6. **UI validation**: Prevent enabling toggle without value
7. **Access control**: Server-side validation for API updates

---

## Notes

- **Rush Fees**: Force price completely overrides standard pricing, so rush fees don't apply
- **Convenience Fees**: Still apply per property (not affected by forced price)
- **Multi-Community**: Each property in the group can have its own forced price
- **Backward Compatibility**: Existing properties default to `force_price_enabled = FALSE`, so no impact on existing functionality


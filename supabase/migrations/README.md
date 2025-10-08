# Database Migrations

This directory contains Supabase migration files for the GMG Resale Flow project.

## Overview

Instead of manually creating SQL files, we now use Supabase's built-in migration system which provides:
- Version control for database changes
- Automatic rollback capabilities
- Type-safe database operations
- Better collaboration and deployment

## Available Scripts

```bash
# Generate TypeScript types from database schema
npm run db:generate-types

# Push local migrations to remote database
npm run db:push

# Reset database (WARNING: Destroys all data)
npm run db:reset

# Create a new migration
npm run db:migrate

# List migration status
npm run db:status
```

## Migration Files

### 20240101000001_initial_schema.sql
- Core database schema (applications, hoa_properties)
- Basic indexes and triggers
- Row Level Security policies

### 20240101000002_multiple_community_support.sql
- Property linking functionality
- Multi-community transaction support
- Helper functions for property relationships

### 20240101000003_application_property_groups.sql
- Application property groups table
- Multi-community application processing
- Document generation tracking

### 20240101000004_settlement_agent_support.sql
- Application types and form management
- Settlement agent workflow support
- Pricing configuration

### 20240101000005_property_documents.sql
- Property document management
- Expiration tracking
- File management utilities

### 20240101000006_schema_updates.sql
- Optional seller information
- Flexible submitter types
- Schema constraint updates

## Best Practices

1. **Always test migrations locally first**
2. **Use descriptive migration names**
3. **Include rollback logic when possible**
4. **Update types after schema changes**
5. **Review migrations before applying to production**

## Development Workflow

1. Make schema changes in Supabase Dashboard (for quick changes)
2. Generate migration: `npm run db:migrate`
3. Test locally: `npm run db:push`
4. Generate types: `npm run db:generate-types`
5. Deploy to production when ready
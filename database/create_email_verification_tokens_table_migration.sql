-- Create email_verification_tokens table
-- This table stores email verification tokens with SHA-256 hashes (never plaintext)
-- Similar structure to password_reset_tokens for consistency

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL, -- SHA-256 hash of the token (never store plaintext)
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ, -- NULL until token is used
  attempts INTEGER NOT NULL DEFAULT 0, -- Track failed attempts
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure token_hash is unique
  UNIQUE(token_hash)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);

-- Create index on token_hash for faster lookups during verification
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token_hash ON email_verification_tokens(token_hash);

-- Create index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- Enable Row Level Security
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (via admin client)
-- Users should never directly access this table
CREATE POLICY "Service role can manage email verification tokens"
  ON email_verification_tokens
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add comment
COMMENT ON TABLE email_verification_tokens IS 'Stores email verification tokens with SHA-256 hashes. Tokens are never stored in plaintext.';






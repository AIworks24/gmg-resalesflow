-- Migration: Add AI processing jobs table for PDF form analysis
-- Rollback: DROP TABLE IF EXISTS ai_processing_jobs CASCADE;

-- Create AI processing jobs table
CREATE TABLE IF NOT EXISTS ai_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type VARCHAR(50) NOT NULL, -- 'pdf_analysis', 'field_mapping', etc.
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  input_data JSONB NOT NULL, -- { pdfPath, formType, etc. }
  results JSONB, -- AI analysis results
  error TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_status ON ai_processing_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_type ON ai_processing_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_created ON ai_processing_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_processing_jobs(status) WHERE status IN ('pending', 'processing');

-- Add Row Level Security
ALTER TABLE ai_processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own jobs
CREATE POLICY "Users can view their own AI jobs" 
  ON ai_processing_jobs FOR SELECT 
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own jobs
CREATE POLICY "Users can insert their own AI jobs" 
  ON ai_processing_jobs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own jobs (for status polling)
CREATE POLICY "Users can update their own AI jobs" 
  ON ai_processing_jobs FOR UPDATE 
  USING (auth.uid() = user_id);

-- RLS Policy: Admin/staff can view all jobs
CREATE POLICY "Admin can view all AI jobs" 
  ON ai_processing_jobs FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_jobs_updated_at_trigger
  BEFORE UPDATE ON ai_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_jobs_updated_at();

-- Add comment for documentation
COMMENT ON TABLE ai_processing_jobs IS 'Stores AI processing jobs for PDF form analysis and field mapping';
COMMENT ON COLUMN ai_processing_jobs.job_type IS 'Type of AI job: pdf_analysis, field_mapping, etc.';
COMMENT ON COLUMN ai_processing_jobs.status IS 'Job status: pending, processing, completed, failed';
COMMENT ON COLUMN ai_processing_jobs.input_data IS 'Input parameters as JSON (pdfPath, formType, etc.)';
COMMENT ON COLUMN ai_processing_jobs.results IS 'AI analysis results as JSON (extracted fields, suggestions, etc.)';
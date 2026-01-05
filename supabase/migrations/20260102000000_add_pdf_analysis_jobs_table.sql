-- Create PDF analysis jobs table for background processing
CREATE TABLE IF NOT EXISTS pdf_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB, -- Stores form structure, form title, metadata, etc.
  error TEXT, -- Error message if failed
  pdf_path TEXT -- Path to PDF in storage (optional)
);

-- Index for querying jobs by user and status
CREATE INDEX IF NOT EXISTS idx_pdf_analysis_jobs_user ON pdf_analysis_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_pdf_analysis_jobs_status ON pdf_analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pdf_analysis_jobs_created ON pdf_analysis_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE pdf_analysis_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own jobs
CREATE POLICY "Users can view their own jobs"
  ON pdf_analysis_jobs
  FOR SELECT
  USING (auth.uid() = created_by);

-- Policy: Users can create their own jobs
CREATE POLICY "Users can create their own jobs"
  ON pdf_analysis_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);


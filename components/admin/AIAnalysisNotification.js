import React, { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2, X, FileText } from 'lucide-react';

/**
 * Global notification component that shows AI analysis progress across all admin pages
 * This component should be added to AdminLayout to show notifications globally
 */
export default function AIAnalysisNotification() {
  const supabase = createClientComponentClient();
  const [activeJobs, setActiveJobs] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const jobPollIntervalRef = useRef(null);

  useEffect(() => {
    // Load active jobs on mount
    loadActiveJobs();

    // Poll for active jobs every 5 seconds
    jobPollIntervalRef.current = setInterval(() => {
      loadActiveJobs();
    }, 5000);

    return () => {
      if (jobPollIntervalRef.current) {
        clearInterval(jobPollIntervalRef.current);
      }
    };
  }, []);

  const loadActiveJobs = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsVisible(false);
        return;
      }

      // Find all pending/processing jobs for PDF analysis
      const { data: jobs, error } = await supabase
        .from('ai_processing_jobs')
        .select('*')
        .eq('user_id', user.id)
        .eq('job_type', 'pdf_analysis')
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading active jobs:', error);
        return;
      }

      if (jobs && jobs.length > 0) {
        setActiveJobs(jobs);
        setIsVisible(true);
      } else {
        setActiveJobs([]);
        setIsVisible(false);
      }
    } catch (error) {
      console.error('Error loading active jobs:', error);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible || activeJobs.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-blue-900">
                AI Analysis in Progress
              </h3>
              <button
                onClick={handleDismiss}
                className="text-blue-600 hover:text-blue-800 flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-blue-700 mb-2">
              {activeJobs.length} form{activeJobs.length !== 1 ? 's' : ''} being analyzed. 
              This may take 30-60 seconds.
            </p>
            <button
              onClick={() => {
                // Navigate to Form Builder page
                window.location.href = '/admin/form-builder';
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 underline"
            >
              <FileText className="w-3 h-3" />
              View in Form Builder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { applicationsApi } from '../lib/api/applicationsApi';

// Query keys factory - more specific and hierarchical
export const applicationKeys = {
  all: ['applications'],
  lists: () => [...applicationKeys.all, 'list'],
  list: (filters) => [...applicationKeys.lists(), { filters }],
  details: () => [...applicationKeys.all, 'detail'],
  detail: (id) => [...applicationKeys.details(), id],
  stats: (filters) => [...applicationKeys.all, 'stats', { filters }],
  userApplications: (userId) => [...applicationKeys.all, 'user', userId],
  // Add more specific keys for better invalidation
  infinite: (filters) => [...applicationKeys.all, 'infinite', { filters }],
};

// Admin hooks
export function useApplications(filters = {}) {
  return useQuery({
    queryKey: applicationKeys.list(filters),
    queryFn: ({ signal }) => applicationsApi.getApplications(filters, { signal }),
    staleTime: 2 * 60 * 1000, // 2 minutes - longer stale time for better UX
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error?.status >= 400 && error?.status < 500) {
        return false;
      }
      return failureCount < 2; // Reduced retries for faster feedback
    },
    throwOnError: false, // Handle errors gracefully in components
    refetchOnMount: 'always', // Always refetch for admin dashboard
  });
}

export function useApplication(id) {
  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: () => applicationsApi.getApplicationById(id),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useApplicationStats(dateRange = null) {
  return useQuery({
    queryKey: applicationKeys.stats({ dateRange }),
    queryFn: () => applicationsApi.getApplicationStats(dateRange),
    staleTime: 60 * 1000, // 1 minute
  });
}

// Infinite query for "load more" pagination (alternative to regular pagination)
export function useInfiniteApplications(filters = {}) {
  return useInfiniteQuery({
    queryKey: applicationKeys.infinite(filters),
    queryFn: ({ pageParam = 1 }) => 
      applicationsApi.getApplications({ ...filters, page: pageParam }),
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage;
      return page < totalPages ? page + 1 : undefined;
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// Applicant hooks
export function useUserApplications(userId) {
  return useQuery({
    queryKey: applicationKeys.userApplications(userId),
    queryFn: () => applicationsApi.getUserApplications(userId),
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}

// Mutations
export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: applicationsApi.createApplication,
    onSuccess: (data, variables) => {
      // Invalidate and refetch applications list
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      
      // If user_id is provided, invalidate user applications
      if (variables.user_id) {
        queryClient.invalidateQueries({ 
          queryKey: applicationKeys.userApplications(variables.user_id) 
        });
      }

      // Add the new application to cache
      queryClient.setQueryData(applicationKeys.detail(data.id), data);
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }) => applicationsApi.updateApplication(id, updates),
    // Optimistic update
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: applicationKeys.detail(id) });

      // Snapshot the previous value
      const previousApplication = queryClient.getQueryData(applicationKeys.detail(id));

      // Optimistically update to the new value
      if (previousApplication) {
        queryClient.setQueryData(applicationKeys.detail(id), {
          ...previousApplication,
          ...updates,
        });
      }

      // Return a context object with the snapshotted value
      return { previousApplication, id };
    },
    onError: (err, { id }, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousApplication) {
        queryClient.setQueryData(applicationKeys.detail(id), context.previousApplication);
      }
    },
    onSuccess: (data, { id }) => {
      // Update the specific application in cache with server response
      queryClient.setQueryData(applicationKeys.detail(id), data);
    },
    onSettled: (data, error, { id }) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: applicationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: applicationKeys.stats() });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: applicationsApi.deleteApplication,
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: applicationKeys.detail(id) });
      
      // Invalidate lists to trigger refetch
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
      queryClient.invalidateQueries({ queryKey: applicationKeys.stats() });
    },
  });
}

export function useGeneratePdf() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ applicationId, formData }) => 
      applicationsApi.generatePdf(applicationId, formData),
    onSuccess: (_, { applicationId }) => {
      // Invalidate the specific application to refetch updated data
      queryClient.invalidateQueries({ 
        queryKey: applicationKeys.detail(applicationId) 
      });
      
      // Invalidate lists in case PDF status affects list display
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

export function useSendApprovalEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: applicationsApi.sendApprovalEmail,
    onSuccess: (_, applicationId) => {
      // Invalidate the specific application to refetch updated data
      queryClient.invalidateQueries({ 
        queryKey: applicationKeys.detail(applicationId) 
      });
      
      // Invalidate lists in case email status affects list display
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

// Custom hooks for specific use cases
export function useApplicationsWithRealtime(filters = {}) {
  const query = useApplications(filters);
  
  // You can add realtime subscriptions here if needed
  // useEffect(() => {
  //   const supabase = createClientComponentClient();
  //   const subscription = supabase
  //     .channel('applications')
  //     .on('postgres_changes', 
  //       { event: '*', schema: 'public', table: 'applications' },
  //       () => query.refetch()
  //     )
  //     .subscribe();
  
  //   return () => subscription.unsubscribe();
  // }, [query.refetch]);

  return query;
}

export function usePrefetchApplication() {
  const queryClient = useQueryClient();

  return (id) => {
    queryClient.prefetchQuery({
      queryKey: applicationKeys.detail(id),
      queryFn: () => applicationsApi.getApplicationById(id),
      staleTime: 30 * 1000,
    });
  };
}
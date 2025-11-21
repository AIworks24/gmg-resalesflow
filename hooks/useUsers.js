import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../lib/api/usersApi';

// Query keys for users
export const userKeys = {
  all: ['users'],
  lists: () => [...userKeys.all, 'list'],
  list: (filters) => [...userKeys.lists(), { filters }],
  details: () => [...userKeys.all, 'detail'],
  detail: (id) => [...userKeys.details(), id],
  stats: () => [...userKeys.all, 'stats'],
  search: (term) => [...userKeys.all, 'search', term],
};

// Get users with pagination and optional search
export function useUsers(page = 1, limit = 10, search = '') {
  return useQuery({
    queryKey: userKeys.list({ page, limit, search }),
    queryFn: ({ signal }) => usersApi.getUsers({ signal, page, limit, search }),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      if (error?.status >= 400 && error?.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
    throwOnError: false,
  });
}

// Get user by ID
export function useUser(id) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => usersApi.getUserById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Search users
export function useSearchUsers(searchTerm) {
  return useQuery({
    queryKey: userKeys.search(searchTerm),
    queryFn: () => usersApi.searchUsers(searchTerm),
    enabled: !!searchTerm && searchTerm.length > 0,
    staleTime: 30 * 1000, // 30 seconds for search results
  });
}

// Get user stats
export function useUserStats() {
  return useQuery({
    queryKey: userKeys.stats(),
    queryFn: () => usersApi.getUserStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Create user mutation
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: usersApi.createUser,
    onSuccess: (newUser) => {
      console.log('✅ User created successfully:', newUser);
      
      // Add the new user to the cache
      queryClient.setQueryData(userKeys.detail(newUser.id), newUser);
      
      // Invalidate all user list queries (all pages)
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      
      // Invalidate stats
      queryClient.invalidateQueries({ queryKey: userKeys.stats() });
      
      // Clear any search results to force refresh
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      
      console.log('✅ Cache invalidated, list should refresh');
    },
    onError: (error) => {
      console.error('❌ Create user mutation error:', error);
    },
  });
}

// Update user mutation
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }) => usersApi.updateUser(id, updates),
    // Optimistic update
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: userKeys.detail(id) });

      // Snapshot the previous value
      const previousUser = queryClient.getQueryData(userKeys.detail(id));

      // Optimistically update to the new value
      if (previousUser) {
        queryClient.setQueryData(userKeys.detail(id), {
          ...previousUser,
          ...updates,
        });
      }

      // Return a context object with the snapshotted value
      return { previousUser, id };
    },
    onError: (err, { id }, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousUser) {
        queryClient.setQueryData(userKeys.detail(id), context.previousUser);
      }
    },
    onSuccess: (updatedUser, { id }) => {
      // Update the specific user in cache with server response
      queryClient.setQueryData(userKeys.detail(id), updatedUser);
    },
    onSettled: (data, error, { id }) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      queryClient.invalidateQueries({ queryKey: userKeys.stats() });
    },
  });
}

// Delete user mutation
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: usersApi.deleteUser,
    onSuccess: (_, deletedUserId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: userKeys.detail(deletedUserId) });
      
      // Invalidate lists to trigger refetch
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      
      // Invalidate stats
      queryClient.invalidateQueries({ queryKey: userKeys.stats() });
      
      // Clear any search results
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
    onError: (error) => {
      console.error('Delete user mutation error:', error);
    },
  });
}

// Prefetch user for better UX
export function usePrefetchUser() {
  const queryClient = useQueryClient();

  return (id) => {
    queryClient.prefetchQuery({
      queryKey: userKeys.detail(id),
      queryFn: () => usersApi.getUserById(id),
      staleTime: 5 * 60 * 1000,
    });
  };
}
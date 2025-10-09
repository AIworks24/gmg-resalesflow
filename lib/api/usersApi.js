import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

class UsersApi {
  constructor() {
    this.supabase = createClientComponentClient();
  }

  async getUsers(options = {}) {
    const { signal, page = 1, limit = 10 } = options;
    
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.supabase
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('first_name', { ascending: true })
      .order('last_name', { ascending: true })
      .range(from, to);

    if (error) throw error;
    
    return {
      data: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    };
  }

  async getUserById(id) {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async createUser({ email, password, first_name, last_name, role }) {
    try {
      console.log('🚀 Calling create user API with:', {
        email,
        password: password ? '[PROVIDED]' : '[MISSING]',
        first_name,
        last_name,
        role,
      });

      // Call the API endpoint to create user
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          first_name,
          last_name,
          role,
        }),
      });

      const result = await response.json();
      console.log('📥 API response:', response.status, result);

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}: Failed to create user`);
      }

      if (!result.success) {
        throw new Error(result.error || 'API returned unsuccessful response');
      }

      console.log('✅ User creation API successful:', result.user);
      return result.user;
    } catch (error) {
      console.error('❌ Create user API error:', error);
      throw error;
    }
  }

  async updateUser(id, updates) {
    try {
      const response = await fetch('/api/admin/update-user', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: id,
          ...updates,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update user');
      }

      return result.user;
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  }

  async deleteUser(id) {
    try {
      const response = await fetch('/api/admin/delete-user', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete user');
      }

      return true;
    } catch (error) {
      console.error('Delete user error:', error);
      throw error;
    }
  }

  async searchUsers(searchTerm) {
    if (!searchTerm.trim()) {
      return this.getUsers();
    }

    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .or(
        `email.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`
      )
      .order('first_name', { ascending: true })
      .order('last_name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getUserStats() {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('role');

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      admin: 0,
      staff: 0,
      accounting: 0,
      user: 0,
      null: 0, // Users without assigned role
    };

    data?.forEach(user => {
      if (user.role === null || user.role === undefined) {
        stats.null++;
      } else if (stats.hasOwnProperty(user.role)) {
        stats[user.role]++;
      }
    });

    return stats;
  }
}

export const usersApi = new UsersApi();